#include "adapters/Vl53l1xSensorAdapter.hpp"

#include <cstdio>

#include "adapters/BoardPins.hpp"
#include "sdkconfig.h"

#include "esp_err.h"
#include "esp_log.h"

namespace micromouse::adapters {

namespace {

constexpr char kTag[] = "tof";

// Parâmetros do firmware de teste do hardware, que funcionaram na bancada: modo curto (paredes
// a poucos centímetros), 50 ms por medida e uma medida nova a cada 50 ms.
constexpr uint32_t kTimingBudgetUs = 50000;
constexpr uint32_t kPeriodMs = 50;
constexpr uint16_t kIoTimeoutMs = 300;
// XSHUT em 0 por 150 ms para o sensor esquecer o endereço antigo, e 60 ms de boot ao religar.
constexpr uint32_t kShutdownMs = 150;
constexpr uint32_t kBootMs = 60;
// Ao sentir as paredes, espera uma medida feita depois que o robô parou. Depois de descartar a
// medida antiga, a próxima pode levar o período (50 ms) mais o tempo de medida (50 ms): com 80 ms,
// o teste na placa deu FALHA na primeira leitura de cada comando. 150 ms cobre o pior caso.
constexpr uint32_t kFreshTimeoutMs = 150;
// Depois de uma transação que falha, quem lê durante o movimento deixa o sensor em paz por este
// tempo. Em 11/11 o ToF direito parou de responder e cada consulta esperava os 20 ms do I²C: o laço
// da reta foi de ~2 ms para ~20 ms por volta e 4 de 5 rés falharam.
constexpr uint32_t kMuteMs = 500;
// Reinícios automáticos pelo XSHUT (no sense(), robô parado): depois de tantos SEGUIDOS sem
// sucesso num sensor, o sense() para de tentar (sensor desligado). Um que dá certo zera a conta.
constexpr unsigned kMaxFailedStreak = 3;

// Nome curto do estado da medida, para o log e o motivo de falha.
const char* statusName(drivers::Vl53l1x::RangeStatus status) {
    using S = drivers::Vl53l1x::RangeStatus;
    switch (status) {
        case S::RangeValid: return "ok";
        case S::SigmaFail: return "sigma";
        case S::SignalFail: return "sinal";
        case S::RangeValidMinRangeClipped: return "minclip";
        case S::OutOfBoundsFail: return "fora";
        case S::HardwareFail: return "hw";
        case S::RangeValidNoWrapCheckFail: return "ok1";
        case S::WrapTargetFail: return "wrap";
        case S::XtalkSignalFail: return "xtalk";
        case S::SynchronizationInt: return "sync";
        case S::MinRangeFail: return "colado";
        case S::None: return "nenhum";
    }
    return "?";
}

}  // namespace

Vl53l1xSensorAdapter::Vl53l1xSensorAdapter(double wallThresholdMm, double frontThresholdMm)
    : thresholdMm_(wallThresholdMm),
      frontThresholdMm_(frontThresholdMm),
      // Endereços do "4.3 - Projeto conceitual de hardware", Seção 5.2.
      slots_{{Slot{"esquerdo", pins::kTofLeftXshut, 0x30},
              Slot{"frontal", pins::kTofFrontXshut, 0x31},
              Slot{"direito", pins::kTofRightXshut, 0x32}}} {}

// Liga um sensor e o move para o endereço dele. Normalmente ele acorda em 0x29; se o XSHUT não
// o reiniciou de vez (já aconteceu na bancada), ele ainda está no endereço novo, e serve também.
bool Vl53l1xSensorAdapter::bringUp(Slot& slot) const {
    // As falhas de I²C DURANTE a configuração são esperadas (o reset de software leva o sensor ao
    // 0x29 e o driver insiste nos dois endereços): não entram na conta de erros do sensor, que
    // fica só com as falhas de quando ele já devia estar funcionando.
    const IdfRegisterBus::Stats before = regBus_.stats(slot.address);
    gpio_set_level(slot.xshut, 1);
    regBus_.delayMs(kBootMs);

    for (const uint8_t address : {drivers::Vl53l1x::kDefaultAddress, slot.address}) {
        if (!regBus_.probe(address)) {
            continue;
        }
        slot.sensor.emplace(regBus_, address);
        drivers::Vl53l1x& sensor = *slot.sensor;
        sensor.setTimeout(kIoTimeoutMs);
        if (!sensor.init()) {
            continue;
        }
        // Qualquer NACK na configuração deixa o sensor mal ajustado: não basta olhar a última
        // transação (revisão do #438).
        sensor.clearTransferErrors();
        if (sensor.address() != slot.address) {
            sensor.setAddress(slot.address);
        }
        const bool configured =
            sensor.setDistanceMode(drivers::Vl53l1x::DistanceMode::Short) &&
            sensor.setMeasurementTimingBudget(kTimingBudgetUs);
        sensor.startContinuous(kPeriodMs);
        if (configured && !sensor.transferFailedSinceClear()) {
            regBus_.setStats(slot.address, before);
            ESP_LOGI(kTag, "%s pronto em 0x%02X", slot.name, slot.address);
            return true;
        }
    }

    regBus_.setStats(slot.address, before);
    slot.sensor.reset();
    gpio_set_level(slot.xshut, 0);  // desligado, para não ocupar o 0x29 dos outros
    ESP_LOGE(kTag, "%s nao respondeu (XSHUT=GPIO%d)", slot.name, slot.xshut);
    return false;
}

void Vl53l1xSensorAdapter::begin(i2c_master_bus_handle_t bus) {
    regBus_.attach(bus);

    // 1) Desliga TODOS por XSHUT=0 (todos voltam a 0x29 ao religar).
    for (Slot& slot : slots_) {
        gpio_reset_pin(slot.xshut);
        gpio_set_direction(slot.xshut, GPIO_MODE_OUTPUT);
        gpio_set_level(slot.xshut, 0);
        slot.sensor.reset();
        slot.last = {};
    }
    regBus_.delayMs(kShutdownMs);

    // 2) Liga e reendereça um a um: esquerdo 0x30, frontal 0x31, direito 0x32 (RF-28). Na placa
    //    (04/11), a primeira inicialização depois de gravar falhou nos três e a seguinte deu certo:
    //    um sensor que falha é desligado e tentado de novo, até 3 vezes, antes de desistir.
    constexpr int kAttempts = 3;
    for (Slot& slot : slots_) {
        for (int attempt = 1; attempt <= kAttempts && !bringUp(slot); ++attempt) {
            if (attempt < kAttempts) {
                ESP_LOGW(kTag, "%s: tentativa %d de %d falhou, tentando de novo", slot.name,
                         attempt, kAttempts);
                regBus_.delayMs(kShutdownMs);  // XSHUT já está em 0: deixa o sensor reiniciar
            }
        }
    }
}

// Lê um sensor, sem esperar. Com requireFresh (ao sentir as paredes), a falta de uma medida nova
// é FALHA, e não a parede da célula anterior.
Vl53l1xSensorAdapter::Reading Vl53l1xSensorAdapter::poll(Slot& slot, bool requireFresh) const {
    if (!slot.sensor) {
#if CONFIG_RATO_BANCADA
        // Modo bancada: a placa não tem ToF e a corrida simulada percorre o labirinto aberto. Sem
        // isto, "sem sensor" viraria falha, ou seja, parede nos três lados, e a corrida nunca
        // chegaria ao objetivo (revisão do #438).
        slot.last = {kNoReadingMm, drivers::Vl53l1x::RangeStatus::None,
                     drivers::ReadingKind::NoTarget};
#else
        slot.last = {};
#endif
        return slot.last;
    }
    drivers::Vl53l1x& sensor = *slot.sensor;
    const bool ready = sensor.dataReady();
    if (!sensor.lastTransferOk()) {
        mute(slot);
    }
    if (ready) {
        return take(slot);
    }
    if (requireFresh) {
        // Nenhuma medida nova no prazo (ou o sensor parou de responder).
        slot.last = {kFaultMm, drivers::Vl53l1x::RangeStatus::None, drivers::ReadingKind::Fault};
        slot.pollFault = true;
    }
    return slot.last;
}

// Lê a medida que o sensor já tem pronta (quem chama já viu o dataReady()).
Vl53l1xSensorAdapter::Reading Vl53l1xSensorAdapter::take(Slot& slot) const {
    drivers::Vl53l1x& sensor = *slot.sensor;
    const uint16_t mm = sensor.read(false);
    const drivers::Vl53l1x::RangeStatus status = sensor.rangingData().status;
    const drivers::ReadingKind kind =
        drivers::classifyReading(sensor.lastTransferOk(), true, status);
    if (!sensor.lastTransferOk()) {
        mute(slot);
    } else {
        slot.muted = false;
    }
    // Só a falta de resposta pede reinício; um estado ruim de UMA medida (sync, hw) não.
    slot.pollFault = !sensor.lastTransferOk();
    switch (kind) {
        case drivers::ReadingKind::Distance:
            // Alvo colado no sensor (abaixo do alcance mínimo): a distância lida não vale, mas
            // há parede ali. Visto na pista em 04/11 com o robô encostado na parede lateral.
            slot.last = {status == drivers::Vl53l1x::RangeStatus::MinRangeFail
                             ? 0
                             : static_cast<int>(mm),
                         status, kind};
            break;
        case drivers::ReadingKind::NoTarget:
            slot.last = {kNoReadingMm, status, kind};
            break;
        case drivers::ReadingKind::Uncertain:
            // Guarda a distância lida: longe, ela ainda diz que não há parede nesta célula.
            slot.last = {static_cast<int>(mm), status, kind};
            break;
        case drivers::ReadingKind::Fault:
            slot.last = {kFaultMm, status, kind};
            break;
    }
    return slot.last;
}

void Vl53l1xSensorAdapter::mute(Slot& slot) const {
    slot.muted = true;
    slot.mutedUntilMs = regBus_.millis() + kMuteMs;
}

int Vl53l1xSensorAdapter::rangeMm(Side side) const {
    return poll(slots_[static_cast<size_t>(side)], false).mm;
}

int Vl53l1xSensorAdapter::rangeFrontMm() const { return rangeMm(Side::Front); }
int Vl53l1xSensorAdapter::rangeLeftMm() const { return rangeMm(Side::Left); }
int Vl53l1xSensorAdapter::rangeRightMm() const { return rangeMm(Side::Right); }

bool Vl53l1xSensorAdapter::ready(Side side) const {
    return slots_[static_cast<size_t>(side)].sensor.has_value();
}

bool Vl53l1xSensorAdapter::allReady() const {
    return ready(Side::Left) && ready(Side::Front) && ready(Side::Right);
}

Vl53l1xSensorAdapter::Reading Vl53l1xSensorAdapter::reading(Side side) const {
    // A última medida, sem consumir uma nova (assim a coluna de mm e a de parede do comando `tof`
    // vêm da mesma medida). Revisão do #438.
    return slots_[static_cast<size_t>(side)].last;
}

std::optional<Vl53l1xSensorAdapter::Reading> Vl53l1xSensorAdapter::freshReading(Side side) const {
    Slot& slot = slots_[static_cast<size_t>(side)];
    if (!slot.sensor) {
        return std::nullopt;
    }
    // Sensor que falhou há pouco: não toca nele (ver kMuteMs). A diferença com sinal trata a
    // virada do contador de ms.
    if (slot.muted) {
        if (static_cast<int32_t>(regBus_.millis() - slot.mutedUntilMs) < 0) {
            ++slot.skippedReads;
            return std::nullopt;
        }
        slot.muted = false;
    }
    const bool ready = slot.sensor->dataReady();
    if (!slot.sensor->lastTransferOk()) {
        mute(slot);
        return std::nullopt;
    }
    if (!ready) {
        return std::nullopt;
    }
    return take(slot);
}

const char* Vl53l1xSensorAdapter::sideName(Side side) noexcept {
    switch (side) {
        case Side::Left: return "esquerdo";
        case Side::Front: return "frontal";
        case Side::Right: return "direito";
    }
    return "?";
}

uint8_t Vl53l1xSensorAdapter::address(Side side) const noexcept {
    return slots_[static_cast<size_t>(side)].address;
}

Vl53l1xSensorAdapter::Health Vl53l1xSensorAdapter::health(Side side) const {
    const Slot& slot = slots_[static_cast<size_t>(side)];
    const IdfRegisterBus::Stats& bus = regBus_.stats(slot.address);
    return {slot.sensor.has_value(), bus.errors,        bus.slow,
            bus.worstMs,             bus.lastError,     slot.dropouts,
            slot.recoveries,         slot.failedRecoveries, slot.skippedReads};
}

bool Vl53l1xSensorAdapter::ping(Side side) const {
    Slot& slot = slots_[static_cast<size_t>(side)];
    if (!slot.sensor) {
        return false;
    }
    (void)slot.sensor->dataReady();
    return slot.sensor->lastTransferOk();
}

unsigned Vl53l1xSensorAdapter::modelId(Side side) const {
    Slot& slot = slots_[static_cast<size_t>(side)];
    if (!slot.sensor) {
        return 0;
    }
    constexpr uint16_t kModelIdRegister = 0x010F;  // IDENTIFICATION__MODEL_ID
    const uint16_t id = slot.sensor->readReg16(kModelIdRegister);
    return slot.sensor->lastTransferOk() ? id : 0U;
}

int Vl53l1xSensorAdapter::recoverFailed(bool automatic) const {
#if CONFIG_RATO_BANCADA
    return 0;  // placa de bancada: não há ToF
#else
    // Quem precisa: sem resposta no endereço, nunca configurado, ou com a última medida em falha.
    std::array<bool, 3> failing{};
    bool any = false;
    for (size_t i = 0; i < slots_.size(); ++i) {
        Slot& slot = slots_[i];
        bool answers = false;
        if (slot.sensor) {
            (void)slot.sensor->dataReady();
            answers = slot.sensor->lastTransferOk();
        }
        failing[i] = (!answers || slot.pollFault) &&
                     !(automatic && slot.failedStreak >= kMaxFailedStreak);
        any = any || failing[i];
    }
    if (!any) {
        return 0;
    }
    // O retrato de antes diz a causa provável: 0x29 respondendo = um sensor reiniciou sozinho
    // (queda de alimentação ou XSHUT solto) e voltou ao endereço de fábrica.
    const bool factoryAnswers = regBus_.probe(drivers::Vl53l1x::kDefaultAddress);
    for (size_t i = 0; i < slots_.size(); ++i) {
        if (!failing[i]) continue;
        Slot& slot = slots_[i];
        const bool ownAnswers = regBus_.probe(slot.address);
        ESP_LOGW(kTag,
                 "%s em falha aos %lu s: 0x%02X %s, 0x29 %s -> %s. Reiniciando pelo XSHUT",
                 slot.name, static_cast<unsigned long>(regBus_.millis() / 1000),
                 static_cast<unsigned>(slot.address), ownAnswers ? "responde" : "NAO responde",
                 factoryAnswers ? "responde" : "nao responde",
                 ownAnswers       ? "responde mas nao mede"
                 : factoryAnswers ? "o sensor REINICIOU sozinho (alimentacao ou XSHUT)"
                                  : "mudo (fio SDA/SCL/alimentacao, ou sensor travado)");
    }
    // Todos os que falharam vão a XSHUT=0 antes de religar o primeiro: dois deles em 0x29 ao mesmo
    // tempo receberiam o mesmo endereço novo.
    for (size_t i = 0; i < slots_.size(); ++i) {
        if (!failing[i]) continue;
        gpio_set_level(slots_[i].xshut, 0);
        slots_[i].sensor.reset();
        slots_[i].last = {};
        slots_[i].muted = false;
        slots_[i].pollFault = false;
    }
    regBus_.delayMs(kShutdownMs);
    int recovered = 0;
    for (size_t i = 0; i < slots_.size(); ++i) {
        if (!failing[i]) continue;
        Slot& slot = slots_[i];
        if (bringUp(slot)) {
            ++slot.recoveries;
            ++recovered;
            slot.answering = true;
            slot.failedStreak = 0;
        } else {
            ++slot.failedRecoveries;
            ++slot.failedStreak;
        }
        ESP_LOGW(kTag, "%s: reinicio pelo XSHUT %s (deu certo %u vez(es), falhou %u)", slot.name,
                 slot.sensor ? "deu certo" : "FALHOU", slot.recoveries, slot.failedRecoveries);
    }
    return recovered;
#endif
}

void Vl53l1xSensorAdapter::watch() const {
#if !CONFIG_RATO_BANCADA
    for (Slot& slot : slots_) {
        bool answers = false;
        if (slot.sensor) {
            (void)slot.sensor->dataReady();
            answers = slot.sensor->lastTransferOk();
        }
        if (answers == slot.answering) {
            continue;
        }
        slot.answering = answers;
        const unsigned long seconds = static_cast<unsigned long>(regBus_.millis() / 1000);
        if (answers) {
            ESP_LOGW(kTag, "%s VOLTOU a responder aos %lu s", slot.name, seconds);
            continue;
        }
        ++slot.dropouts;
        const bool factoryAnswers = regBus_.probe(drivers::Vl53l1x::kDefaultAddress);
        const IdfRegisterBus::Stats& bus = regBus_.stats(slot.address);
        ESP_LOGE(kTag,
                 "%s PAROU de responder aos %lu s (queda %u): 0x29 %s -> %s; erro I2C %s, pior "
                 "espera %u ms",
                 slot.name, seconds, slot.dropouts, factoryAnswers ? "responde" : "nao responde",
                 !slot.sensor     ? "nunca foi configurado"
                 : factoryAnswers ? "o sensor REINICIOU sozinho (alimentacao ou XSHUT)"
                                  : "mudo (fio SDA/SCL/alimentacao, ou sensor travado)",
                 esp_err_to_name(bus.lastError), bus.worstMs);
    }
#endif
}

const char* Vl53l1xSensorAdapter::statusText(Side side) const {
    return statusName(slots_[static_cast<size_t>(side)].last.status);
}

std::array<Vl53l1xSensorAdapter::Reading, 3> Vl53l1xSensorAdapter::settledReadings() const {
    for (Slot& slot : slots_) {
        if (slot.sensor && slot.sensor->dataReady()) {
            (void)slot.sensor->read(false);
        }
    }
    const uint32_t start = regBus_.millis();
    for (;;) {
        bool allReadyNow = true;
        for (Slot& slot : slots_) {
            if (slot.sensor && !slot.sensor->dataReady()) {
                allReadyNow = false;
            }
        }
        if (allReadyNow || regBus_.millis() - start >= kFreshTimeoutMs) {
            break;
        }
        regBus_.delayMs(1);
    }
    // requireFresh: um sensor que não mediu no prazo aparece como falha (-1), e não com a medida
    // antiga.
    return {poll(slots_[static_cast<size_t>(Side::Left)], true),
            poll(slots_[static_cast<size_t>(Side::Front)], true),
            poll(slots_[static_cast<size_t>(Side::Right)], true)};
}

ports::WallsAhead Vl53l1xSensorAdapter::sense() const {
    // Parede presente quando a distância medida fica abaixo do limiar calibrado (RNF-31). Medida
    // nova dos três com o robô parado (settledReadings: descarta as prontas, que podem ser de
    // quando o robô ainda andava, e espera as seguintes num prazo único de ~150 ms).
    std::array<Reading, 3> settled = settledReadings();
#if !CONFIG_RATO_BANCADA
    // Um sensor em falha é reiniciado pelo XSHUT aqui, com o robô parado (12/11): em 11/11 o
    // direito parava no meio do teste e só voltava reiniciando a placa inteira. As duas primeiras
    // medidas depois de religar são descartadas (a primeira costuma sair 0 mm).
    bool fault = false;
    for (const Reading& reading : settled) {
        fault = fault || reading.kind == drivers::ReadingKind::Fault;
    }
    if (fault && recoverFailed(true) > 0) {
        (void)settledReadings();
        (void)settledReadings();
        settled = settledReadings();
    }
#endif
    const Reading left = settled[static_cast<size_t>(Side::Left)];
    const Reading front = settled[static_cast<size_t>(Side::Front)];
    const Reading right = settled[static_cast<size_t>(Side::Right)];

    // Falha ou medida incerta perto conta como PAREDE e lado desconhecido: o mapa não grava e o robô
    // não avança por ali às cegas. Só a falha (sensor quebrado) conta em healthy(), para o laço da
    // navegação levar ao Erro se ela persistir. Regras em drivers::judgeSide (testadas no host).
    const drivers::SideJudgement l =
        drivers::judgeSide(left.kind, left.status, left.mm, thresholdMm_);
    const drivers::SideJudgement f =
        drivers::judgeSide(front.kind, front.status, front.mm, frontThresholdMm_);
    const drivers::SideJudgement r =
        drivers::judgeSide(right.kind, right.status, right.mm, thresholdMm_);
    healthy_ = !l.fault && !f.fault && !r.fault;

    faultSummary_[0] = '\0';
    size_t used = 0;
    auto append = [this, &used](const char* text) {
        if (used < sizeof faultSummary_) {
            const int n = std::snprintf(faultSummary_ + used, sizeof faultSummary_ - used, "%s", text);
            used += n > 0 ? static_cast<size_t>(n) : 0;
        }
    };
    if (!healthy_) {
        append("ToF em falha:");
        if (l.fault) append(" esquerdo");
        if (f.fault) append(" frontal");
        if (r.fault) append(" direito");
    }
    const Reading* readings[3] = {&left, &front, &right};
    const char* names[3] = {"esquerdo", "frontal", "direito"};
    bool firstUncertain = true;
    for (int i = 0; i < 3; ++i) {
        if (readings[i]->kind != drivers::ReadingKind::Uncertain) continue;
        if (firstUncertain) {
            append(healthy_ ? "incerto:" : "; incerto:");
        } else {
            append(",");
        }
        firstUncertain = false;
        char item[40];
        std::snprintf(item, sizeof item, " %s(%s %d)", names[i], statusName(readings[i]->status),
                      readings[i]->mm);
        append(item);
    }
    if (faultSummary_[0] != '\0') {
        ESP_LOGW(kTag, "%s", faultSummary_);
    }
    return {f.wall, l.wall, r.wall, f.unknown, l.unknown, r.unknown};
}

}  // namespace micromouse::adapters
