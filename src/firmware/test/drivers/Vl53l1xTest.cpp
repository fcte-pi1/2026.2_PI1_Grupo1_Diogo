#include <gtest/gtest.h>

#include <cstdint>
#include <map>
#include <stdexcept>

#include "drivers/RegisterBus.hpp"
#include "drivers/Vl53l1x.hpp"

namespace micromouse::drivers {

namespace {

// Um VL53L1X simulado: registradores de 16 bits de endereço em memória, num endereço I²C que
// muda quando o driver escreve no I2C_SLAVE__DEVICE_ADDRESS (0x0001), como o sensor real.
class FakeVl53l1xBus final : public IRegisterBus {
public:
    uint8_t deviceAddress{Vl53l1x::kDefaultAddress};
    bool present{true};
    int nackResetRelease{0};  // recusa as N primeiras escritas de SOFT_RESET = 1 (visto na placa)
    bool resetGoesToDefault{false};  // o reset de software leva o sensor de volta ao 0x29
    int nackOnceAtReg{-1};  // recusa uma única escrita neste registrador (NACK no meio da config.)
    std::map<uint16_t, uint8_t> regs;
    uint32_t nowMs{0};
    long callBudget{-1};  // > 0: lança depois de tantas transações (pega um laço sem fim no teste)

    void spend() {
        ++nowMs;
        if (callBudget > 0 && --callBudget == 0) {
            throw std::runtime_error("driver em laço sem fim no barramento");
        }
    }

    FakeVl53l1xBus() {
        set16(0x010F, Vl53l1x::kModelId);  // IDENTIFICATION__MODEL_ID
        regs[0x00E5] = 0x01;               // FIRMWARE__SYSTEM_STATUS: boot concluído
        set16(0x0006, 0xBC9A);             // OSC_MEASURED__FAST_OSC__FREQUENCY
        set16(0x00DE, 0x0123);             // RESULT__OSC_CALIBRATE_VAL
    }

    void set16(uint16_t reg, uint16_t value) {
        regs[reg] = static_cast<uint8_t>(value >> 8);
        regs[static_cast<uint16_t>(reg + 1)] = static_cast<uint8_t>(value);
    }
    [[nodiscard]] uint8_t get(uint16_t reg) const {
        const auto it = regs.find(reg);
        return it == regs.end() ? 0 : it->second;
    }

    bool write(uint8_t address, const uint8_t* data, size_t length) override {
        spend();
        if (!present || address != deviceAddress || length < 2) return false;
        const auto reg = static_cast<uint16_t>((data[0] << 8) | data[1]);
        if (static_cast<int>(reg) == nackOnceAtReg) {
            nackOnceAtReg = -1;
            return false;
        }
        if (reg == 0x0000 && length >= 3 && data[2] == 0x01 && nackResetRelease > 0) {
            --nackResetRelease;
            return false;
        }
        if (reg == 0x0000 && length >= 3 && data[2] == 0x00 && resetGoesToDefault) {
            deviceAddress = Vl53l1x::kDefaultAddress;  // o reset de software volta ao 0x29
        }
        for (size_t i = 2; i < length; ++i) {
            regs[static_cast<uint16_t>(reg + i - 2)] = data[i];
        }
        if (reg == 0x0001 && length >= 3) deviceAddress = data[2] & 0x7F;
        return true;
    }

    bool writeRead(uint8_t address, const uint8_t* tx, size_t txLength, uint8_t* rx,
                   size_t rxLength) override {
        spend();
        if (!present || address != deviceAddress || txLength < 2) return false;
        const auto reg = static_cast<uint16_t>((tx[0] << 8) | tx[1]);
        for (size_t i = 0; i < rxLength; ++i) {
            rx[i] = get(static_cast<uint16_t>(reg + i));
        }
        return true;
    }

    void delayMs(uint32_t ms) override { nowMs += ms; }
    [[nodiscard]] uint32_t millis() const override { return nowMs; }

    // Resultado de uma medida pronta, no formato dos 17 bytes a partir de 0x0089.
    void loadResult(uint8_t rangeStatus, uint8_t streamCount, uint16_t rangeMm) {
        regs[0x0089] = rangeStatus;
        regs[0x008B] = streamCount;
        set16(0x008C, 200);  // dss_actual_effective_spads_sd0
        set16(0x0090, 10);   // ambient_count_rate_mcps_sd0
        set16(0x0096, rangeMm);
        set16(0x0098, 400);  // peak_signal_count_rate_crosstalk_corrected_mcps_sd0
        regs[0x0031] = 0x00;  // GPIO__TIO_HV_STATUS bit 0 = 0: dado pronto
    }
};

TEST(Vl53l1x, InitRejectsWrongModelId) {
    FakeVl53l1xBus bus;
    bus.set16(0x010F, 0x1234);
    Vl53l1x sensor(bus);
    EXPECT_FALSE(sensor.init());
}

TEST(Vl53l1x, InitFailsWhenNoSensorAnswers) {
    FakeVl53l1xBus bus;
    bus.present = false;
    Vl53l1x sensor(bus);
    EXPECT_FALSE(sensor.init());
    EXPECT_FALSE(sensor.lastTransferOk());
}

TEST(Vl53l1x, InitConfiguresLowPowerAutoModeAndLongRange) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    EXPECT_EQ(bus.get(0x0081), 0x8B);  // SYSTEM__SEQUENCE_CONFIG: VHV, PHASECAL, DSS1, RANGE
    EXPECT_EQ(bus.get(0x0060), 0x0F);  // VCSEL_PERIOD_A do modo longo
    EXPECT_EQ(sensor.distanceMode(), Vl53l1x::DistanceMode::Long);
    EXPECT_EQ(bus.get(0x002E) & 0x01, 0x01);  // I/O em 2V8
}

// Na placa, a escrita que tira o sensor do reset às vezes era recusada e o sensor ficava preso.
TEST(Vl53l1x, InitInsistsUntilTheSensorLeavesReset) {
    FakeVl53l1xBus bus;
    bus.nackResetRelease = 3;
    Vl53l1x sensor(bus);
    EXPECT_TRUE(sensor.init());
    EXPECT_EQ(bus.get(0x0000), 0x01);  // saiu do reset
}

// Na placa: o sensor estava num endereço antigo (o XSHUT não o reiniciou) e o reset de software o
// levou ao 0x29; o driver precisa achá-lo lá, e não ficar falando com o endereço antigo.
TEST(Vl53l1x, InitFollowsTheSensorBackToDefaultAddressAfterSoftReset) {
    FakeVl53l1xBus bus;
    bus.deviceAddress = 0x30;
    bus.resetGoesToDefault = true;
    Vl53l1x sensor(bus, 0x30);
    ASSERT_TRUE(sensor.init());
    EXPECT_EQ(sensor.address(), Vl53l1x::kDefaultAddress);
    sensor.setAddress(0x30);
    EXPECT_EQ(bus.deviceAddress, 0x30);
}

TEST(Vl53l1x, InitGivesUpIfTheSensorNeverLeavesReset) {
    FakeVl53l1xBus bus;
    bus.nackResetRelease = 1000;
    Vl53l1x sensor(bus);
    EXPECT_FALSE(sensor.init());
}

// Um NACK no meio da configuração do init() (VL53L1_StaticInit) deixava o sensor mal configurado e
// o init() devolvia true, porque só olhava a última transação. O bringUp() só começa a contar os
// NACKs depois do init(), então ninguém via esse caso.
TEST(Vl53l1x, InitFailsOnNackInTheMiddleOfConfiguration) {
    FakeVl53l1xBus bus;
    bus.nackOnceAtReg = 0x0064;  // RANGE_CONFIG__SIGMA_THRESH, no meio do StaticInit
    Vl53l1x sensor(bus);
    EXPECT_FALSE(sensor.init());
}

// O sensor sai do reset e para de responder durante o boot: o init() desiste no timeout.
TEST(Vl53l1x, InitTimesOutIfSensorStopsAnsweringDuringBoot) {
    FakeVl53l1xBus bus;
    // some logo depois de sair do reset: só a leitura do modelo e o reset são aceitos
    struct DropAfterReset final : IRegisterBus {
        FakeVl53l1xBus& inner;
        bool released{false};
        explicit DropAfterReset(FakeVl53l1xBus& b) : inner(b) {}
        bool write(uint8_t a, const uint8_t* d, size_t n) override {
            if (released) {
                inner.nowMs++;
                return false;
            }
            const bool ok = inner.write(a, d, n);
            released = ok && n >= 3 && d[0] == 0 && d[1] == 0 && d[2] == 0x01;
            return ok;
        }
        bool writeRead(uint8_t a, const uint8_t* tx, size_t tn, uint8_t* rx, size_t rn) override {
            if (released) {
                inner.nowMs++;
                return false;
            }
            return inner.writeRead(a, tx, tn, rx, rn);
        }
        void delayMs(uint32_t ms) override { inner.delayMs(ms); }
        [[nodiscard]] uint32_t millis() const override { return inner.millis(); }
    } dropping(bus);
    Vl53l1x silent(dropping);
    silent.setTimeout(100);
    EXPECT_FALSE(silent.init());
    EXPECT_TRUE(silent.timeoutOccurred());
}

// Sem setTimeout() (o padrão da Pololu é 0, "sem limite"), um sensor que nunca termina o boot
// prendia o init() para sempre, e o robô travava no begin() sem chegar ao auto-teste.
TEST(Vl53l1x, InitGivesUpOnBootEvenWithoutConfiguredTimeout) {
    FakeVl53l1xBus bus;
    bus.regs[0x00E5] = 0x00;  // boot nunca termina
    bus.callBudget = 100000;
    Vl53l1x sensor(bus);
    bool ok = true;
    EXPECT_NO_THROW(ok = sensor.init());
    EXPECT_FALSE(ok);
    EXPECT_TRUE(sensor.timeoutOccurred());
}

TEST(Vl53l1x, InitTimesOutIfBootNeverCompletes) {
    FakeVl53l1xBus bus;
    bus.regs[0x00E5] = 0x00;
    Vl53l1x sensor(bus);
    sensor.setTimeout(100);
    EXPECT_FALSE(sensor.init());
    EXPECT_TRUE(sensor.timeoutOccurred());
}

TEST(Vl53l1x, SetAddressMovesTheSensor) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    sensor.setAddress(0x30);
    EXPECT_EQ(bus.deviceAddress, 0x30);
    EXPECT_EQ(sensor.address(), 0x30);
    (void)sensor.readReg(0x010F);
    EXPECT_TRUE(sensor.lastTransferOk());

    Vl53l1x stale(bus, Vl53l1x::kDefaultAddress);  // o endereço antigo não responde mais
    (void)stale.readReg(0x010F);
    EXPECT_FALSE(stale.lastTransferOk());
}

TEST(Vl53l1x, ShortModeKeepsTheTimingBudget) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    ASSERT_TRUE(sensor.setDistanceMode(Vl53l1x::DistanceMode::Short));
    ASSERT_TRUE(sensor.setMeasurementTimingBudget(50000));
    EXPECT_EQ(bus.get(0x0060), 0x07);  // VCSEL_PERIOD_A
    EXPECT_EQ(bus.get(0x0063), 0x05);  // VCSEL_PERIOD_B
    EXPECT_EQ(bus.get(0x0069), 0x38);  // VALID_PHASE_HIGH
    EXPECT_NEAR(static_cast<double>(sensor.measurementTimingBudget()), 50000.0, 1000.0);
}

TEST(Vl53l1x, RejectsTimingBudgetBelowTheGuard) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    EXPECT_FALSE(sensor.setMeasurementTimingBudget(4000));
}

TEST(Vl53l1x, StartContinuousProgramsThePeriodAndStarts) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    sensor.startContinuous(50);
    const uint32_t period = (static_cast<uint32_t>(bus.get(0x006C)) << 24) |
                            (static_cast<uint32_t>(bus.get(0x006D)) << 16) |
                            (static_cast<uint32_t>(bus.get(0x006E)) << 8) | bus.get(0x006F);
    EXPECT_EQ(period, 50U * 0x0123);  // período × RESULT__OSC_CALIBRATE_VAL
    EXPECT_EQ(bus.get(0x0087), 0x40);  // SYSTEM__MODE_START: mode_range__timed
}

TEST(Vl53l1x, ReadAppliesTheCorrectionGainAndStatus) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.loadResult(9, 1, 100);  // RANGECOMPLETE, 100 mm brutos
    EXPECT_EQ(sensor.read(), 98);  // 100 × 2011/2048, arredondado
    EXPECT_EQ(sensor.rangingData().status, Vl53l1x::RangeStatus::RangeValid);
    EXPECT_EQ(bus.get(0x0086), 0x01);  // SYSTEM__INTERRUPT_CLEAR
}

TEST(Vl53l1x, FirstReadingHasNoWrapCheck) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.loadResult(9, 0, 100);
    (void)sensor.read();
    EXPECT_EQ(sensor.rangingData().status, Vl53l1x::RangeStatus::RangeValidNoWrapCheckFail);
}

// O RESULT__RANGE_STATUS só tem o estado nos bits 4..0; os bits 5..7 são outras flags
// (max/min_threshold_hit e gph_id). A API da ST mascara com 0x1F (VL53L1_RANGE_STATUS__RANGE_STATUS_MASK
// na API completa, "RgSt & 0x1F" na ULD); sem a máscara, uma medida válida com um desses bits ligado
// virava estado None, ou seja, falha, e contava como parede.
TEST(Vl53l1x, RangeStatusIgnoresTheUpperFlagBits) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.loadResult(0x80 | 9, 1, 100);  // RANGECOMPLETE com gph_id_range_status = 1
    EXPECT_EQ(sensor.read(), 98);
    EXPECT_EQ(sensor.rangingData().status, Vl53l1x::RangeStatus::RangeValid);
    bus.loadResult(0x20 | 4, 1, 0);  // MSRCNOTARGET com max_threshold_hit = 1
    (void)sensor.read();
    EXPECT_EQ(sensor.rangingData().status, Vl53l1x::RangeStatus::SignalFail);
}

TEST(Vl53l1x, NoTargetIsSignalFail) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.loadResult(4, 1, 0);  // MSRCNOTARGET
    (void)sensor.read();
    EXPECT_EQ(sensor.rangingData().status, Vl53l1x::RangeStatus::SignalFail);
}

TEST(Vl53l1x, BlockingReadTimesOutWithoutData) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.regs[0x0031] = 0x01;  // nenhum dado pronto
    sensor.setTimeout(50);
    EXPECT_EQ(sensor.read(true), 0);
    EXPECT_TRUE(sensor.timeoutOccurred());
    EXPECT_FALSE(sensor.timeoutOccurred());  // a flag se apaga ao ser lida
}

TEST(Vl53l1x, TimeoutEncodingMatchesTheApiFormat) {
    EXPECT_EQ(Vl53l1x::encodeTimeout(0), 0);
    EXPECT_EQ(Vl53l1x::decodeTimeout(0x0102), 5U);  // (2 << 1) + 1
    for (const uint32_t mclks : {1U, 255U, 256U, 1000U, 70000U}) {
        const uint32_t decoded = Vl53l1x::decodeTimeout(Vl53l1x::encodeTimeout(mclks));
        EXPECT_LE(decoded, mclks);
        EXPECT_GE(decoded * 101, mclks * 100);  // perde no máximo ~1% ao codificar
    }
}

// Revisão do #438: um sensor que para de responder não pode parecer "medida pronta".
TEST(Vl53l1x, DataReadyIsFalseWhenSensorDoesNotAnswer) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.loadResult(9, 1, 100);
    ASSERT_TRUE(sensor.dataReady());
    bus.present = false;  // mau contato na alimentação, no meio da corrida
    EXPECT_FALSE(sensor.dataReady());
    EXPECT_FALSE(sensor.lastTransferOk());
}

TEST(Vl53l1x, ReadFromSilentSensorIsClassifiedAsFault) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    bus.present = false;
    (void)sensor.read(false);  // tudo zerado, estado None
    EXPECT_EQ(classifyReading(sensor.lastTransferOk(), true, sensor.rangingData().status),
              ReadingKind::Fault);
}

TEST(Vl53l1x, ClassifiesDistanceNoTargetAndFault) {
    using S = Vl53l1x::RangeStatus;
    EXPECT_EQ(classifyReading(true, true, S::RangeValid), ReadingKind::Distance);
    EXPECT_EQ(classifyReading(true, true, S::RangeValidMinRangeClipped), ReadingKind::Distance);
    EXPECT_EQ(classifyReading(true, true, S::RangeValidNoWrapCheckFail), ReadingKind::Distance);
    // sem alvo: o sensor mediu e não achou nada (corredor aberto)
    EXPECT_EQ(classifyReading(true, true, S::SignalFail), ReadingKind::NoTarget);
    EXPECT_EQ(classifyReading(true, true, S::OutOfBoundsFail), ReadingKind::NoTarget);
    // falha: não se sabe nada. SigmaFail e WrapTargetFail também aparecem com parede escura,
    // brilhante, inclinada ou com luz forte, então não valem "lado aberto" (revisão do #438)
    EXPECT_EQ(classifyReading(true, true, S::SigmaFail), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(true, true, S::WrapTargetFail), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(true, true, S::HardwareFail), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(true, true, S::None), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(true, true, S::XtalkSignalFail), ReadingKind::Fault);
    // alvo colado no sensor: é parede (visto na pista com o robô encostado na parede lateral)
    EXPECT_EQ(classifyReading(true, true, S::MinRangeFail), ReadingKind::Distance);
}

// lastTransferOk() só vê a última transação: um NACK no meio da configuração (endereço, modo, timing
// budget) passava despercebido. O erro "pegajoso" fica até clearTransferErrors() (revisão do #438).
TEST(Vl53l1x, TransferErrorSticksUntilCleared) {
    FakeVl53l1xBus bus;
    Vl53l1x sensor(bus);
    ASSERT_TRUE(sensor.init());
    sensor.clearTransferErrors();
    EXPECT_FALSE(sensor.transferFailedSinceClear());

    bus.present = false;
    (void)sensor.setMeasurementTimingBudget(50000);  // NACK no meio da configuração
    bus.present = true;
    (void)sensor.setDistanceMode(Vl53l1x::DistanceMode::Short);  // a última transação deu certo
    EXPECT_TRUE(sensor.lastTransferOk());
    EXPECT_TRUE(sensor.transferFailedSinceClear());

    sensor.clearTransferErrors();
    EXPECT_FALSE(sensor.transferFailedSinceClear());
}

TEST(Vl53l1x, MissingTransferOrStaleDataIsFaultEvenWithValidStatus) {
    using S = Vl53l1x::RangeStatus;
    EXPECT_EQ(classifyReading(false, true, S::RangeValid), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(true, false, S::RangeValid), ReadingKind::Fault);
    EXPECT_EQ(classifyReading(false, false, S::SignalFail), ReadingKind::Fault);
}

TEST(Vl53l1x, OnlyValidStatusesCountAsDistance) {
    using S = Vl53l1x::RangeStatus;
    EXPECT_TRUE(isValidRange(S::RangeValid));
    EXPECT_TRUE(isValidRange(S::RangeValidMinRangeClipped));
    EXPECT_TRUE(isValidRange(S::RangeValidNoWrapCheckFail));
    EXPECT_FALSE(isValidRange(S::SignalFail));
    EXPECT_FALSE(isValidRange(S::SigmaFail));
    EXPECT_FALSE(isValidRange(S::OutOfBoundsFail));
    EXPECT_FALSE(isValidRange(S::HardwareFail));
    EXPECT_FALSE(isValidRange(S::None));
}

}  // namespace

}  // namespace micromouse::drivers
