// Adaptado da biblioteca Pololu VL53L1X 1.3.1 (BSD 3-clause): ver o aviso completo em
// include/drivers/Vl53l1x.hpp. Os comentários entre aspas são da API da ST, como na Pololu.

#include "drivers/Vl53l1x.hpp"

namespace micromouse::drivers {

namespace {

// Registradores usados (subconjunto do mapa da Pololu).
enum Reg : uint16_t {
    SOFT_RESET = 0x0000,
    I2C_SLAVE__DEVICE_ADDRESS = 0x0001,
    OSC_MEASURED__FAST_OSC__FREQUENCY = 0x0006,
    VHV_CONFIG__TIMEOUT_MACROP_LOOP_BOUND = 0x0008,
    VHV_CONFIG__INIT = 0x000B,
    ALGO__PART_TO_PART_RANGE_OFFSET_MM = 0x001E,
    MM_CONFIG__OUTER_OFFSET_MM = 0x0022,
    DSS_CONFIG__TARGET_TOTAL_RATE_MCPS = 0x0024,
    PAD_I2C_HV__EXTSUP_CONFIG = 0x002E,
    GPIO__TIO_HV_STATUS = 0x0031,
    SIGMA_ESTIMATOR__EFFECTIVE_PULSE_WIDTH_NS = 0x0036,
    SIGMA_ESTIMATOR__EFFECTIVE_AMBIENT_WIDTH_NS = 0x0037,
    ALGO__CROSSTALK_COMPENSATION_VALID_HEIGHT_MM = 0x0039,
    ALGO__RANGE_IGNORE_VALID_HEIGHT_MM = 0x003E,
    ALGO__RANGE_MIN_CLIP = 0x003F,
    ALGO__CONSISTENCY_CHECK__TOLERANCE = 0x0040,
    CAL_CONFIG__VCSEL_START = 0x0047,
    PHASECAL_CONFIG__TIMEOUT_MACROP = 0x004B,
    PHASECAL_CONFIG__OVERRIDE = 0x004D,
    DSS_CONFIG__ROI_MODE_CONTROL = 0x004F,
    SYSTEM__THRESH_RATE_HIGH = 0x0050,
    SYSTEM__THRESH_RATE_LOW = 0x0052,
    DSS_CONFIG__MANUAL_EFFECTIVE_SPADS_SELECT = 0x0054,
    DSS_CONFIG__APERTURE_ATTENUATION = 0x0057,
    MM_CONFIG__TIMEOUT_MACROP_A = 0x005A,
    MM_CONFIG__TIMEOUT_MACROP_B = 0x005C,
    RANGE_CONFIG__TIMEOUT_MACROP_A = 0x005E,
    RANGE_CONFIG__VCSEL_PERIOD_A = 0x0060,
    RANGE_CONFIG__TIMEOUT_MACROP_B = 0x0061,
    RANGE_CONFIG__VCSEL_PERIOD_B = 0x0063,
    RANGE_CONFIG__SIGMA_THRESH = 0x0064,
    RANGE_CONFIG__MIN_COUNT_RATE_RTN_LIMIT_MCPS = 0x0066,
    RANGE_CONFIG__VALID_PHASE_HIGH = 0x0069,
    SYSTEM__INTERMEASUREMENT_PERIOD = 0x006C,
    SYSTEM__GROUPED_PARAMETER_HOLD_0 = 0x0071,
    SYSTEM__SEED_CONFIG = 0x0077,
    SD_CONFIG__WOI_SD0 = 0x0078,
    SD_CONFIG__WOI_SD1 = 0x0079,
    SD_CONFIG__INITIAL_PHASE_SD0 = 0x007A,
    SD_CONFIG__INITIAL_PHASE_SD1 = 0x007B,
    SYSTEM__GROUPED_PARAMETER_HOLD_1 = 0x007C,
    SD_CONFIG__QUANTIFIER = 0x007E,
    SYSTEM__SEQUENCE_CONFIG = 0x0081,
    SYSTEM__GROUPED_PARAMETER_HOLD = 0x0082,
    SYSTEM__INTERRUPT_CLEAR = 0x0086,
    SYSTEM__MODE_START = 0x0087,
    RESULT__RANGE_STATUS = 0x0089,
    PHASECAL_RESULT__VCSEL_START = 0x00D8,
    RESULT__OSC_CALIBRATE_VAL = 0x00DE,
    FIRMWARE__SYSTEM_STATUS = 0x00E5,
    IDENTIFICATION__MODEL_ID = 0x010F,
};

// "value used in measurement timing budget calculations"
// (assume o PresetMode LOWPOWER_AUTONOMOUS): 1448 + 2100 + 980.
constexpr uint32_t kTimingGuard = 4528;
// Valor do DSS_CONFIG__TARGET_TOTAL_RATE_MCPS, usado no cálculo do DSS.
constexpr uint16_t kTargetRate = 0x0A00;

float countRateFixedToFloat(uint16_t countRateFixed) {
    return static_cast<float>(countRateFixed) / static_cast<float>(1 << 7);
}

}  // namespace

bool isValidRange(Vl53l1x::RangeStatus status) noexcept {
    switch (status) {
        case Vl53l1x::RangeStatus::RangeValid:
        case Vl53l1x::RangeStatus::RangeValidMinRangeClipped:  // alvo colado no sensor
        case Vl53l1x::RangeStatus::RangeValidNoWrapCheckFail:  // primeira medida
            return true;
        default:
            return false;
    }
}

ReadingKind classifyReading(bool transferOk, bool fresh, Vl53l1x::RangeStatus status) noexcept {
    if (!transferOk || !fresh) {
        return ReadingKind::Fault;
    }
    if (isValidRange(status)) {
        return ReadingKind::Distance;
    }
    switch (status) {
        case Vl53l1x::RangeStatus::MinRangeFail:  // alvo colado no sensor: é parede, não defeito
            return ReadingKind::Distance;
        case Vl53l1x::RangeStatus::SignalFail:       // nenhum alvo devolveu sinal
        case Vl53l1x::RangeStatus::OutOfBoundsFail:  // nada no alcance do modo
            return ReadingKind::NoTarget;
        // SigmaFail (medida imprecisa) e WrapTargetFail (alvo "dobrado") também aparecem com parede
        // escura, brilhante, inclinada ou com luz forte: não se sabe se há parede. Tratar como lado
        // aberto mandaria o robô contra ela (revisão do #438). Num 4x4 o maior vão (~720 mm) cabe
        // no modo curto, então "sem alvo" de verdade deve ser raro.
        case Vl53l1x::RangeStatus::SigmaFail:
        case Vl53l1x::RangeStatus::WrapTargetFail:
        default:  // HardwareFail, None, XtalkSignalFail, SynchronizationInt
            return ReadingKind::Fault;
    }
}

Vl53l1x::Vl53l1x(IRegisterBus& bus, uint8_t address) : bus_(bus), address_(address) {}

void Vl53l1x::setAddress(uint8_t newAddress) {
    writeReg(I2C_SLAVE__DEVICE_ADDRESS, newAddress & 0x7F);
    address_ = newAddress;
}

// Inicializa o sensor com os ajustes do VL53L1_DataInit() e do VL53L1_StaticInit().
bool Vl53l1x::init(bool io2v8) {
    // confere o modelo (valor do datasheet)
    if (readReg16(IDENTIFICATION__MODEL_ID) != kModelId) {
        return false;
    }

    // VL53L1_software_reset(). O reset de software devolve o sensor ao endereço de fábrica (0x29):
    // se ele estava num endereço antigo (o XSHUT não o reiniciou, visto na placa em 04/11), a
    // escrita que o tira do reset precisa ir para o 0x29. Insiste nos dois endereços até ser aceita.
    writeReg(SOFT_RESET, 0x00);
    bus_.delayMs(1);
    const uint8_t previousAddress = address_;
    constexpr int kResetReleaseAttempts = 20;
    for (int attempt = 0; attempt < kResetReleaseAttempts; ++attempt) {
        writeReg(SOFT_RESET, 0x01);
        if (lastOk_) {
            break;
        }
        if (address_ != kDefaultAddress) {
            address_ = kDefaultAddress;  // tenta no endereço para onde o reset leva
            writeReg(SOFT_RESET, 0x01);
            if (lastOk_) {
                break;
            }
            address_ = previousAddress;
        }
        bus_.delayMs(1);
    }
    if (!lastOk_) {
        return false;
    }
    // dá tempo de boot; senão o sensor dá NACK na leitura abaixo
    bus_.delayMs(1);

    // VL53L1_poll_for_boot_completion(): repete enquanto houver NACK ou o boot não terminar
    startTimeout();
    while ((readReg(FIRMWARE__SYSTEM_STATUS) & 0x01) == 0 || !lastOk_) {
        if (timeoutExpired()) {
            didTimeout_ = true;
            return false;
        }
    }
    // Daqui em diante nenhum NACK é esperado: um NACK no meio da configuração deixa o sensor mal
    // ajustado, e o retorno precisa refletir isso, não só a última transação.
    clearTransferErrors();

    // VL53L1_DataInit(): o I/O sai em 1V8; passa para 2V8 se pedido
    if (io2v8) {
        writeReg(PAD_I2C_HV__EXTSUP_CONFIG, readReg(PAD_I2C_HV__EXTSUP_CONFIG) | 0x01);
    }
    fastOscFrequency_ = readReg16(OSC_MEASURED__FAST_OSC__FREQUENCY);
    oscCalibrateVal_ = readReg16(RESULT__OSC_CALIBRATE_VAL);

    // VL53L1_StaticInit() / preset LOWPOWER_AUTONOMOUS (valores "tuning parm default")
    writeReg16(DSS_CONFIG__TARGET_TOTAL_RATE_MCPS, kTargetRate);
    writeReg(GPIO__TIO_HV_STATUS, 0x02);
    writeReg(SIGMA_ESTIMATOR__EFFECTIVE_PULSE_WIDTH_NS, 8);
    writeReg(SIGMA_ESTIMATOR__EFFECTIVE_AMBIENT_WIDTH_NS, 16);
    writeReg(ALGO__CROSSTALK_COMPENSATION_VALID_HEIGHT_MM, 0x01);
    writeReg(ALGO__RANGE_IGNORE_VALID_HEIGHT_MM, 0xFF);
    writeReg(ALGO__RANGE_MIN_CLIP, 0);
    writeReg(ALGO__CONSISTENCY_CHECK__TOLERANCE, 2);

    writeReg16(SYSTEM__THRESH_RATE_HIGH, 0x0000);
    writeReg16(SYSTEM__THRESH_RATE_LOW, 0x0000);
    writeReg(DSS_CONFIG__APERTURE_ATTENUATION, 0x38);

    writeReg16(RANGE_CONFIG__SIGMA_THRESH, 360);
    writeReg16(RANGE_CONFIG__MIN_COUNT_RATE_RTN_LIMIT_MCPS, 192);

    writeReg(SYSTEM__GROUPED_PARAMETER_HOLD_0, 0x01);
    writeReg(SYSTEM__GROUPED_PARAMETER_HOLD_1, 0x01);
    writeReg(SD_CONFIG__QUANTIFIER, 2);

    // O GPH volta a 0, como na API; sem isso o sensor não funciona.
    writeReg(SYSTEM__GROUPED_PARAMETER_HOLD, 0x00);
    writeReg(SYSTEM__SEED_CONFIG, 1);

    // VL53L1_config_low_power_auto_mode
    writeReg(SYSTEM__SEQUENCE_CONFIG, 0x8B);  // VHV, PHASECAL, DSS1, RANGE
    writeReg16(DSS_CONFIG__MANUAL_EFFECTIVE_SPADS_SELECT, 200 << 8);
    writeReg(DSS_CONFIG__ROI_MODE_CONTROL, 2);  // REQUESTED_EFFFECTIVE_SPADS

    // Padrão da Pololu: longo alcance e 50 ms. O adaptador do robô troca para curto alcance.
    setDistanceMode(DistanceMode::Long);
    setMeasurementTimingBudget(50000);

    // A API faz isto ao iniciar a primeira medida (MM1 e MM2 desligados).
    writeReg16(ALGO__PART_TO_PART_RANGE_OFFSET_MM,
               static_cast<uint16_t>(readReg16(MM_CONFIG__OUTER_OFFSET_MM) * 4));

    return !anyFailed_;
}

void Vl53l1x::noteTransfer(bool ok) noexcept {
    lastOk_ = ok;
    if (!ok) {
        anyFailed_ = true;
    }
}

void Vl53l1x::writeReg(uint16_t reg, uint8_t value) {
    const uint8_t data[3] = {static_cast<uint8_t>(reg >> 8), static_cast<uint8_t>(reg), value};
    noteTransfer(bus_.write(address_, data, sizeof(data)));
}

void Vl53l1x::writeReg16(uint16_t reg, uint16_t value) {
    const uint8_t data[4] = {static_cast<uint8_t>(reg >> 8), static_cast<uint8_t>(reg),
                             static_cast<uint8_t>(value >> 8), static_cast<uint8_t>(value)};
    noteTransfer(bus_.write(address_, data, sizeof(data)));
}

void Vl53l1x::writeReg32(uint16_t reg, uint32_t value) {
    const uint8_t data[6] = {static_cast<uint8_t>(reg >> 8),    static_cast<uint8_t>(reg),
                             static_cast<uint8_t>(value >> 24), static_cast<uint8_t>(value >> 16),
                             static_cast<uint8_t>(value >> 8),  static_cast<uint8_t>(value)};
    noteTransfer(bus_.write(address_, data, sizeof(data)));
}

uint8_t Vl53l1x::readReg(uint16_t reg) {
    const uint8_t tx[2] = {static_cast<uint8_t>(reg >> 8), static_cast<uint8_t>(reg)};
    uint8_t value = 0;
    noteTransfer(bus_.writeRead(address_, tx, sizeof(tx), &value, 1));
    return value;
}

uint16_t Vl53l1x::readReg16(uint16_t reg) {
    const uint8_t tx[2] = {static_cast<uint8_t>(reg >> 8), static_cast<uint8_t>(reg)};
    uint8_t rx[2] = {};
    noteTransfer(bus_.writeRead(address_, tx, sizeof(tx), rx, sizeof(rx)));
    return static_cast<uint16_t>((rx[0] << 8) | rx[1]);
}

// Baseado no VL53L1_SetDistanceMode(): mantém o timing budget ao trocar o modo.
bool Vl53l1x::setDistanceMode(DistanceMode mode) {
    const uint32_t budgetUs = measurementTimingBudget();

    switch (mode) {
        case DistanceMode::Short:  // VL53L1_preset_mode_standard_ranging_short_range()
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_A, 0x07);
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_B, 0x05);
            writeReg(RANGE_CONFIG__VALID_PHASE_HIGH, 0x38);
            writeReg(SD_CONFIG__WOI_SD0, 0x07);
            writeReg(SD_CONFIG__WOI_SD1, 0x05);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD0, 6);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD1, 6);
            break;
        case DistanceMode::Medium:  // VL53L1_preset_mode_standard_ranging()
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_A, 0x0B);
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_B, 0x09);
            writeReg(RANGE_CONFIG__VALID_PHASE_HIGH, 0x78);
            writeReg(SD_CONFIG__WOI_SD0, 0x0B);
            writeReg(SD_CONFIG__WOI_SD1, 0x09);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD0, 10);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD1, 10);
            break;
        case DistanceMode::Long:  // VL53L1_preset_mode_standard_ranging_long_range()
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_A, 0x0F);
            writeReg(RANGE_CONFIG__VCSEL_PERIOD_B, 0x0D);
            writeReg(RANGE_CONFIG__VALID_PHASE_HIGH, 0xB8);
            writeReg(SD_CONFIG__WOI_SD0, 0x0F);
            writeReg(SD_CONFIG__WOI_SD1, 0x0D);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD0, 14);
            writeReg(SD_CONFIG__INITIAL_PHASE_SD1, 14);
            break;
        default:
            return false;
    }

    setMeasurementTimingBudget(budgetUs);
    distanceMode_ = mode;
    return true;
}

// Baseado no VL53L1_SetMeasurementTimingBudgetMicroSeconds(): o tempo de cada medida.
bool Vl53l1x::setMeasurementTimingBudget(uint32_t budgetUs) {
    if (budgetUs <= kTimingGuard) {
        return false;
    }
    uint32_t rangeConfigTimeoutUs = budgetUs - kTimingGuard;
    if (rangeConfigTimeoutUs > 1100000) {  // FDA_MAX_TIMING_BUDGET_US * 2
        return false;
    }
    rangeConfigTimeoutUs /= 2;

    // "Update Macro Period for Range A VCSEL Period"
    uint32_t macroPeriodUs = calcMacroPeriod(readReg(RANGE_CONFIG__VCSEL_PERIOD_A));

    // "Update Phase timeout - uses Timing A" (1000 us é o tuning parm default)
    uint32_t phasecalTimeoutMclks = timeoutMicrosecondsToMclks(1000, macroPeriodUs);
    if (phasecalTimeoutMclks > 0xFF) {
        phasecalTimeoutMclks = 0xFF;
    }
    writeReg(PHASECAL_CONFIG__TIMEOUT_MACROP, static_cast<uint8_t>(phasecalTimeoutMclks));

    // "Update MM Timing A timeout" e "Update Range Timing A timeout"
    writeReg16(MM_CONFIG__TIMEOUT_MACROP_A,
               encodeTimeout(timeoutMicrosecondsToMclks(1, macroPeriodUs)));
    writeReg16(RANGE_CONFIG__TIMEOUT_MACROP_A,
               encodeTimeout(timeoutMicrosecondsToMclks(rangeConfigTimeoutUs, macroPeriodUs)));

    // "Update Macro Period for Range B VCSEL Period"
    macroPeriodUs = calcMacroPeriod(readReg(RANGE_CONFIG__VCSEL_PERIOD_B));
    writeReg16(MM_CONFIG__TIMEOUT_MACROP_B,
               encodeTimeout(timeoutMicrosecondsToMclks(1, macroPeriodUs)));
    writeReg16(RANGE_CONFIG__TIMEOUT_MACROP_B,
               encodeTimeout(timeoutMicrosecondsToMclks(rangeConfigTimeoutUs, macroPeriodUs)));

    return true;
}

uint32_t Vl53l1x::measurementTimingBudget() {
    const uint32_t macroPeriodUs = calcMacroPeriod(readReg(RANGE_CONFIG__VCSEL_PERIOD_A));
    const uint32_t rangeConfigTimeoutUs = timeoutMclksToMicroseconds(
        decodeTimeout(readReg16(RANGE_CONFIG__TIMEOUT_MACROP_A)), macroPeriodUs);
    return 2 * rangeConfigTimeoutUs + kTimingGuard;
}

void Vl53l1x::startContinuous(uint32_t periodMs) {
    // VL53L1_set_inter_measurement_period_ms()
    writeReg32(SYSTEM__INTERMEASUREMENT_PERIOD, periodMs * oscCalibrateVal_);
    writeReg(SYSTEM__INTERRUPT_CLEAR, 0x01);  // sys_interrupt_clear_range
    writeReg(SYSTEM__MODE_START, 0x40);       // mode_range__timed
}

// Baseado no VL53L1_stop_range()
void Vl53l1x::stopContinuous() {
    writeReg(SYSTEM__MODE_START, 0x80);  // mode_range__abort
    calibrated_ = false;
    // "restore vhv configs"
    if (savedVhvInit_ != 0) {
        writeReg(VHV_CONFIG__INIT, savedVhvInit_);
    }
    if (savedVhvTimeout_ != 0) {
        writeReg(VHV_CONFIG__TIMEOUT_MACROP_LOOP_BOUND, savedVhvTimeout_);
    }
    // "remove phasecal override"
    writeReg(PHASECAL_CONFIG__OVERRIDE, 0x00);
}

bool Vl53l1x::dataReady() {
    // Sem resposta, o readReg() devolve 0, que pareceria "pronto": confere a transferência.
    const uint8_t status = readReg(GPIO__TIO_HV_STATUS);
    return lastOk_ && (status & 0x01) == 0;
}

uint16_t Vl53l1x::read(bool blocking) {
    if (blocking) {
        startTimeout();
        while (!dataReady()) {
            if (timeoutExpired()) {
                didTimeout_ = true;
                return 0;
            }
        }
    }

    readResults();
    if (!calibrated_) {
        setupManualCalibration();
        calibrated_ = true;
    }
    updateDss();
    getRangingData();
    writeReg(SYSTEM__INTERRUPT_CLEAR, 0x01);  // sys_interrupt_clear_range
    return ranging_.rangeMm;
}

bool Vl53l1x::timeoutOccurred() {
    const bool occurred = didTimeout_;
    didTimeout_ = false;
    return occurred;
}

// "Setup ranges after the first one in low power auto mode by turning off FW calibration steps
// and programming static values" (VL53L1_low_power_auto_setup_manual_calibration())
void Vl53l1x::setupManualCalibration() {
    savedVhvInit_ = readReg(VHV_CONFIG__INIT);
    savedVhvTimeout_ = readReg(VHV_CONFIG__TIMEOUT_MACROP_LOOP_BOUND);
    writeReg(VHV_CONFIG__INIT, savedVhvInit_ & 0x7F);  // "disable VHV init"
    // "set loop bound to tuning param" (LOWPOWERAUTO_VHV_LOOP_BOUND_DEFAULT)
    writeReg(VHV_CONFIG__TIMEOUT_MACROP_LOOP_BOUND,
             static_cast<uint8_t>((savedVhvTimeout_ & 0x03) + (3 << 2)));
    writeReg(PHASECAL_CONFIG__OVERRIDE, 0x01);  // "override phasecal"
    writeReg(CAL_CONFIG__VCSEL_START, readReg(PHASECAL_RESULT__VCSEL_START));
}

// Lê de uma vez os 17 bytes de resultado, a partir do RESULT__RANGE_STATUS.
void Vl53l1x::readResults() {
    const uint8_t tx[2] = {static_cast<uint8_t>(RESULT__RANGE_STATUS >> 8),
                           static_cast<uint8_t>(RESULT__RANGE_STATUS)};
    uint8_t rx[17] = {};
    noteTransfer(bus_.writeRead(address_, tx, sizeof(tx), rx, sizeof(rx)));

    auto word = [&rx](int index) { return static_cast<uint16_t>((rx[index] << 8) | rx[index + 1]); };
    results_.rangeStatus = rx[0];
    // rx[1]: report_status, não usado
    results_.streamCount = rx[2];
    results_.dssActualEffectiveSpadsSd0 = word(3);
    // rx[5..6]: peak_signal_count_rate_mcps_sd0, não usado
    results_.ambientCountRateMcpsSd0 = word(7);
    // rx[9..10]: sigma_sd0; rx[11..12]: phase_sd0, não usados
    results_.finalCrosstalkCorrectedRangeMmSd0 = word(13);
    results_.peakSignalCountRateCrosstalkCorrectedMcpsSd0 = word(15);
}

// Dynamic SPAD Selection, baseado no VL53L1_low_power_auto_update_DSS()
void Vl53l1x::updateDss() {
    const uint16_t spadCount = results_.dssActualEffectiveSpadsSd0;
    if (spadCount != 0) {
        // "Calc total rate per spad"
        uint32_t totalRatePerSpad =
            static_cast<uint32_t>(results_.peakSignalCountRateCrosstalkCorrectedMcpsSd0) +
            results_.ambientCountRateMcpsSd0;
        if (totalRatePerSpad > 0xFFFF) {  // "clip to 16 bits"
            totalRatePerSpad = 0xFFFF;
        }
        totalRatePerSpad <<= 16;  // "shift up to take advantage of 32 bits"
        totalRatePerSpad /= spadCount;

        if (totalRatePerSpad != 0) {
            // "get the target rate and shift up by 16"
            uint32_t requiredSpads = (static_cast<uint32_t>(kTargetRate) << 16) / totalRatePerSpad;
            if (requiredSpads > 0xFFFF) {  // "clip to 16 bit"
                requiredSpads = 0xFFFF;
            }
            // "override DSS config"
            writeReg16(DSS_CONFIG__MANUAL_EFFECTIVE_SPADS_SELECT,
                       static_cast<uint16_t>(requiredSpads));
            return;
        }
    }
    // Evita a divisão por zero: "set target to mid point"
    writeReg16(DSS_CONFIG__MANUAL_EFFECTIVE_SPADS_SELECT, 0x8000);
}

// Distância, estado e taxas a partir dos resultados (VL53L1_GetRangingMeasurementData()).
void Vl53l1x::getRangingData() {
    const uint16_t range = results_.finalCrosstalkCorrectedRangeMmSd0;
    // "apply correction gain": 2011/2048 (cerca de 98%), com 1024 para arredondar
    ranging_.rangeMm = static_cast<uint16_t>((static_cast<uint32_t>(range) * 2011 + 0x0400) / 0x0800);

    // Estado a partir do RESULT__RANGE_STATUS (ConvertStatusLite())
    switch (results_.rangeStatus) {
        case 17:  // MULTCLIPFAIL
        case 2:   // VCSELWATCHDOGTESTFAILURE
        case 1:   // VCSELCONTINUITYTESTFAILURE
        case 3:   // NOVHVVALUEFOUND
            ranging_.status = RangeStatus::HardwareFail;
            break;
        case 13:  // USERROICLIP
            ranging_.status = RangeStatus::MinRangeFail;
            break;
        case 18:  // GPHSTREAMCOUNT0READY
            ranging_.status = RangeStatus::SynchronizationInt;
            break;
        case 5:  // RANGEPHASECHECK
            ranging_.status = RangeStatus::OutOfBoundsFail;
            break;
        case 4:  // MSRCNOTARGET
            ranging_.status = RangeStatus::SignalFail;
            break;
        case 6:  // SIGMATHRESHOLDCHECK
            ranging_.status = RangeStatus::SigmaFail;
            break;
        case 7:  // PHASECONSISTENCY
            ranging_.status = RangeStatus::WrapTargetFail;
            break;
        case 12:  // RANGEIGNORETHRESHOLD
            ranging_.status = RangeStatus::XtalkSignalFail;
            break;
        case 8:  // MINCLIP
            ranging_.status = RangeStatus::RangeValidMinRangeClipped;
            break;
        case 9:  // RANGECOMPLETE
            ranging_.status = results_.streamCount == 0 ? RangeStatus::RangeValidNoWrapCheckFail
                                                        : RangeStatus::RangeValid;
            break;
        default:
            ranging_.status = RangeStatus::None;
    }

    ranging_.peakSignalMcps =
        countRateFixedToFloat(results_.peakSignalCountRateCrosstalkCorrectedMcpsSd0);
    ranging_.ambientMcps = countRateFixedToFloat(results_.ambientCountRateMcpsSd0);
}

// "(LSByte * 2^MSByte) + 1" (VL53L1_decode_timeout())
uint32_t Vl53l1x::decodeTimeout(uint16_t regValue) {
    return (static_cast<uint32_t>(regValue & 0xFF) << (regValue >> 8)) + 1;
}

// VL53L1_encode_timeout()
uint16_t Vl53l1x::encodeTimeout(uint32_t timeoutMclks) {
    if (timeoutMclks == 0) {
        return 0;
    }
    uint32_t lsByte = timeoutMclks - 1;
    uint16_t msByte = 0;
    while ((lsByte & 0xFFFFFF00) > 0) {
        lsByte >>= 1;
        ++msByte;
    }
    return static_cast<uint16_t>((msByte << 8) | (lsByte & 0xFF));
}

// Macro períodos para microssegundos, com o macro período em 12.12 (VL53L1_calc_timeout_us())
uint32_t Vl53l1x::timeoutMclksToMicroseconds(uint32_t timeoutMclks, uint32_t macroPeriodUs) {
    return static_cast<uint32_t>(
        (static_cast<uint64_t>(timeoutMclks) * macroPeriodUs + 0x800) >> 12);
}

// VL53L1_calc_timeout_mclks()
uint32_t Vl53l1x::timeoutMicrosecondsToMclks(uint32_t timeoutUs, uint32_t macroPeriodUs) {
    if (macroPeriodUs == 0) {
        return 0;  // oscilador não lido (sensor ausente): evita a divisão por zero
    }
    return ((timeoutUs << 12) + (macroPeriodUs >> 1)) / macroPeriodUs;
}

// Macro período em microssegundos (12.12) para o período de VCSEL dado
// (VL53L1_calc_macro_period_us()); usa a frequência do oscilador lida no init().
uint32_t Vl53l1x::calcMacroPeriod(uint8_t vcselPeriod) const {
    if (fastOscFrequency_ == 0) {
        return 0;  // init() ainda não rodou: evita a divisão por zero
    }
    // VL53L1_calc_pll_period_us(): frequência em 4.12, período do PLL em 0.24
    const uint32_t pllPeriodUs = (static_cast<uint32_t>(0x01) << 30) / fastOscFrequency_;
    // VL53L1_decode_vcsel_period()
    const uint32_t vcselPeriodPclks = (static_cast<uint32_t>(vcselPeriod) + 1) << 1;
    // VL53L1_MACRO_PERIOD_VCSEL_PERIODS = 2304
    uint32_t macroPeriodUs = 2304U * pllPeriodUs;
    macroPeriodUs >>= 6;
    macroPeriodUs *= vcselPeriodPclks;
    macroPeriodUs >>= 6;
    return macroPeriodUs;
}

}  // namespace micromouse::drivers
