#pragma once

#include <array>
#include <cstdint>
#include <optional>

#include "adapters/IdfRegisterBus.hpp"
#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "drivers/Vl53l1x.hpp"
#include "ports/SensorPort.hpp"

namespace micromouse::adapters {

// Lê os 3 ToF (frente/esquerda/direita) no barramento compartilhado e os
// converte em WallsAhead (parede se distância < limiar). Implementa ISensorPort.
class Vl53l1xSensorAdapter final : public ports::ISensorPort {
public:
    // Sem alvo ao alcance (corredor aberto): conta como "sem parede".
    static constexpr int kNoReadingMm = 9999;
    // Sensor em falha (não respondeu ou não mediu a tempo): não se sabe se há parede.
    static constexpr int kFaultMm = -1;

    // Abaixo (ou igual) a isto a leitura vale "muito perto" (16/11): o frontal leu 0, 22 e 23 mm com
    // a parede a 36-42 mm (C4/C5). Nas laterais só o 0 é falso: no centro da célula elas leem
    // 24-34 mm e a centralização (RF-44) usa esses valores.
    static constexpr int kFrontTooCloseMm = 40;
    static constexpr int kSideTooCloseMm = 0;

    enum class Side { Left, Front, Right };

    struct Reading {
        int mm{kFaultMm};
        drivers::Vl53l1x::RangeStatus status{drivers::Vl53l1x::RangeStatus::None};
        drivers::ReadingKind kind{drivers::ReadingKind::Fault};
    };

private:
    struct Slot {
        const char* name;
        gpio_num_t xshut;
        uint8_t address;
        std::optional<drivers::Vl53l1x> sensor{};
        Reading last{};
        // Saúde do sensor (12/11). Depois de uma transação que falha, o sensor fica "em silêncio"
        // por kMuteMs: quem lê durante o movimento (freshReading) não toca nele, para não esperar
        // o tempo limite do I²C a cada volta do laço de controle.
        uint32_t mutedUntilMs{0};
        bool muted{false};
        bool pollFault{false};     // a última leitura pedida terminou em falha
        bool answering{true};      // estado visto pelo watch(), para logar só as mudanças
        unsigned dropouts{0};      // vezes em que parou de responder (visto pelo watch())
        unsigned recoveries{0};    // reinícios pelo XSHUT que deram certo
        unsigned failedRecoveries{0};
        unsigned failedStreak{0};  // reinícios seguidos que falharam (zera quando um dá certo)
        unsigned skippedReads{0};  // leituras puladas por estar em silêncio
    };

    double thresholdMm_;       // laterais
    double frontThresholdMm_;  // frontal
    mutable IdfRegisterBus regBus_;
    mutable std::array<Slot, 3> slots_;
    mutable bool healthy_{true};
    mutable char faultSummary_[80]{};  // pior caso: ~76 caracteres

    bool bringUp(Slot& slot) const;
    Reading poll(Slot& slot, bool requireFresh) const;
    Reading take(Slot& slot) const;  // lê a medida que o sensor já tem pronta
    void mute(Slot& slot) const;
    [[nodiscard]] int rangeMm(Side side) const;

public:
    // Limiar de parede. Laterais: 90 mm (no centro leem ~34 mm; sem parede, mais de 200). Frontal:
    // 140 mm (10/11). Com o robô no centro, a parede da própria célula leu 38-87 mm e a do fim da
    // célula seguinte 208-250 mm (09/11): com os 90 mm de antes, uma parada 1 cm antes do centro já
    // fazia a parede da frente "sumir". 140 fica no meio das duas faixas. A CALIBRAR na pista.
    explicit Vl53l1xSensorAdapter(double wallThresholdMm = 90.0, double frontThresholdMm = 140.0);
    [[nodiscard]] double sideThresholdMm() const noexcept { return thresholdMm_; }
    [[nodiscard]] double frontThresholdMm() const noexcept { return frontThresholdMm_; }
    // Nome curto do estado da última medida de um lado ("ok", "sigma", "wrap", "nenhum"...).
    [[nodiscard]] const char* statusText(Side side) const;
    // Medida NOVA dos três sensores com o robô parado (descarta as prontas e espera as seguintes,
    // até 150 ms). Para o log: não mexe em healthy() nem no mapa. Ordem: esquerdo, frontal, direito.
    [[nodiscard]] std::array<Reading, 3> settledReadings() const;
    void begin(i2c_master_bus_handle_t bus);  // reendereça os sensores (RF-28)
    [[nodiscard]] ports::WallsAhead sense() const override;
    [[nodiscard]] ports::WallsAhead senseMoving(double axleBehindCenterMm) const override;

    // True se os 3 sensores responderam e foram configurados no begin() (auto-teste, RF-27).
    [[nodiscard]] bool allReady() const;
    // True se, no último sense(), nenhum dos 3 sensores falhou (medida incerta não é falha). O laço
    // da navegação usa isto no SensorHealthMonitor (RF-55): falhas seguidas levam ao estado Erro.
    [[nodiscard]] bool healthy() const noexcept { return healthy_; }
    // Quais sensores falharam ou deram medida incerta no último sense() (vazio se nenhum), para o
    // motivo do fim da corrida. Ex.: "ToF em falha: direito; incerto: frontal(sigma 140)".
    [[nodiscard]] const char* faultSummary() const noexcept { return faultSummary_; }
    [[nodiscard]] bool ready(Side side) const;
    [[nodiscard]] Reading reading(Side side) const;  // última medida guardada, não lê uma nova
    // Medida nova de um lado, se o sensor tiver uma pronta (não espera, e consome a medida). Para a
    // centralização pelas paredes durante o movimento (RF-44). Não mexe em healthy().
    [[nodiscard]] std::optional<Reading> freshReading(Side side) const;

    // ---- Diagnóstico e recuperação (12/11) ----
    struct Health {
        bool ready;                 // configurado (no boot ou numa recuperação)
        unsigned i2cErrors;         // transações que falharam no endereço dele desde o boot
        unsigned i2cTimeouts;       // dessas, quantas esperaram o tempo limite do I²C
        unsigned i2cWorstMs;
        int i2cLastError;           // esp_err_t (0 = nunca falhou)
        unsigned dropouts;
        unsigned recoveries;
        unsigned failedRecoveries;
        unsigned skippedReads;
    };
    [[nodiscard]] Health health(Side side) const;
    [[nodiscard]] static const char* sideName(Side side) noexcept;
    [[nodiscard]] uint8_t address(Side side) const noexcept;
    // Uma transação curta: o sensor responde no endereço dele? Não consome a medida.
    [[nodiscard]] bool ping(Side side) const;
    // Algum dispositivo responde no endereço (para o diagnóstico: 0x29 respondendo quer dizer que
    // um ToF reiniciou sozinho e voltou ao endereço de fábrica).
    [[nodiscard]] bool probe(uint8_t address) const { return regBus_.probe(address); }
    // Identificação do sensor (0xEACC num VL53L1X); 0 se não respondeu.
    [[nodiscard]] unsigned modelId(Side side) const;
    // Reinicia pelo XSHUT e reconfigura os sensores que não respondem ou cuja última medida foi
    // falha. Só com o robô PARADO (leva ~0,3 s por sensor). Devolve quantos voltaram. Com
    // `automatic` (chamado pelo sense()), desiste de um sensor depois de 3 reinícios seguidos sem
    // sucesso, para não gastar ~0,3 s por passo com um sensor desligado; o comando "tofrec" tenta
    // sempre.
    int recoverFailed(bool automatic = false) const;
    // Chamar ~1x por segundo com o robô parado: loga quando um sensor para de responder e quando
    // volta, com o tempo desde o boot. Não consome medidas.
    void watch() const;

    // Distâncias em mm. Públicas para o firmware de diagnóstico (esp32-diagnostico/).
    [[nodiscard]] int rangeFrontMm() const;
    [[nodiscard]] int rangeLeftMm() const;
    [[nodiscard]] int rangeRightMm() const;
};

}  // namespace micromouse::adapters
