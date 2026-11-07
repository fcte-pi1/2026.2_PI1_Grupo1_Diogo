// Driver do sensor de distância VL53L1X, adaptado da biblioteca Pololu VL53L1X 1.3.1
// (https://github.com/pololu/vl53l1x-arduino), a mesma usada no firmware de teste do hardware.
// A adaptação troca o Wire do Arduino pela interface IRegisterBus e mantém só o que o robô usa
// (sem ROI e sem medida única). A lógica de configuração e de leitura é a da Pololu.
//
// Most of the functionality of this library is based on the VL53L1X API provided by ST
// (STSW-IMG007), and some of the explanatory comments are quoted or paraphrased from the API
// source code, API user manual (UM2356), and VL53L1X datasheet.
//
// Copyright (c) 2017, STMicroelectronics
// Copyright (c) 2018-2022, Pololu Corporation
// All Rights Reserved
//
// Redistribution and use in source and binary forms, with or without modification, are permitted
// provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice, this list of
//    conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice, this list of
//    conditions and the following disclaimer in the documentation and/or other materials provided
//    with the distribution.
// 3. Neither the name of the copyright holder nor the names of its contributors may be used to
//    endorse or promote products derived from this software without specific prior written
//    permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
// IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
// FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
// OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

#pragma once

#include <cstdint>

#include "drivers/RegisterBus.hpp"

namespace micromouse::drivers {

class Vl53l1x {
public:
    static constexpr uint8_t kDefaultAddress = 0x29;
    static constexpr uint16_t kModelId = 0xEACC;
    // Prazo do boot no init() quando setTimeout() não foi chamado (o boot leva ~1,2 ms no datasheet).
    static constexpr uint32_t kBootTimeoutMs = 500;

    enum class DistanceMode { Short, Medium, Long, Unknown };

    // Mesmos códigos da Pololu (e da API da ST).
    enum class RangeStatus : uint8_t {
        RangeValid = 0,
        SigmaFail = 1,
        SignalFail = 2,
        RangeValidMinRangeClipped = 3,
        OutOfBoundsFail = 4,
        HardwareFail = 5,
        RangeValidNoWrapCheckFail = 6,
        WrapTargetFail = 7,
        XtalkSignalFail = 9,
        SynchronizationInt = 10,
        MinRangeFail = 13,
        None = 255,
    };

    struct RangingData {
        uint16_t rangeMm{0};
        RangeStatus status{RangeStatus::None};
        float peakSignalMcps{0.0F};
        float ambientMcps{0.0F};
    };

private:
    IRegisterBus& bus_;
    uint8_t address_;
    bool lastOk_{true};
    bool anyFailed_{false};
    void noteTransfer(bool ok) noexcept;
    uint16_t timeoutMs_{0};
    bool didTimeout_{false};
    uint32_t timeoutStartMs_{0};
    uint16_t fastOscFrequency_{0};
    uint16_t oscCalibrateVal_{0};
    bool calibrated_{false};
    uint8_t savedVhvInit_{0};
    uint8_t savedVhvTimeout_{0};
    DistanceMode distanceMode_{DistanceMode::Unknown};
    RangingData ranging_{};

    struct ResultBuffer {
        uint8_t rangeStatus{0};
        uint8_t streamCount{0};
        uint16_t dssActualEffectiveSpadsSd0{0};
        uint16_t ambientCountRateMcpsSd0{0};
        uint16_t finalCrosstalkCorrectedRangeMmSd0{0};
        uint16_t peakSignalCountRateCrosstalkCorrectedMcpsSd0{0};
    } results_{};

    void startTimeout() { timeoutStartMs_ = bus_.millis(); }
    [[nodiscard]] bool timeoutExpired() const {
        return timeoutMs_ > 0 && (bus_.millis() - timeoutStartMs_) > timeoutMs_;
    }
    void setupManualCalibration();
    void readResults();
    void updateDss();
    void getRangingData();
    [[nodiscard]] uint32_t calcMacroPeriod(uint8_t vcselPeriod) const;

public:
    explicit Vl53l1x(IRegisterBus& bus, uint8_t address = kDefaultAddress);

    // Muda o endereço I²C do sensor (some ao desligar pelo XSHUT).
    void setAddress(uint8_t newAddress);
    [[nodiscard]] uint8_t address() const noexcept { return address_; }

    // Confere o modelo, reinicia e configura o sensor. False se não for um VL53L1X, se não
    // terminar o boot dentro do timeout ou se houver qualquer NACK na configuração. Zera o registro
    // de NACKs (clearTransferErrors) depois do boot, onde os NACKs do reset são esperados.
    bool init(bool io2v8 = true);

    bool setDistanceMode(DistanceMode mode);
    [[nodiscard]] DistanceMode distanceMode() const noexcept { return distanceMode_; }
    bool setMeasurementTimingBudget(uint32_t budgetUs);
    uint32_t measurementTimingBudget();

    // Medida contínua: uma nova medida a cada `periodMs`.
    void startContinuous(uint32_t periodMs);
    void stopContinuous();
    // True se há medida nova. False também quando o sensor não respondeu (falha de I²C).
    bool dataReady();
    // Lê a medida mais recente. Com blocking, espera ficar pronta (até o timeout).
    uint16_t read(bool blocking = true);
    [[nodiscard]] const RangingData& rangingData() const noexcept { return ranging_; }

    void setTimeout(uint16_t timeoutMs) noexcept { timeoutMs_ = timeoutMs; }
    bool timeoutOccurred();
    // True se a última transação I²C foi aceita pelo sensor.
    [[nodiscard]] bool lastTransferOk() const noexcept { return lastOk_; }
    // Algum NACK desde o último clearTransferErrors(). lastTransferOk() só vê a última transação:
    // um NACK no meio de uma configuração (endereço, modo, timing budget) passaria despercebido.
    [[nodiscard]] bool transferFailedSinceClear() const noexcept { return anyFailed_; }
    void clearTransferErrors() noexcept { anyFailed_ = false; }

    // Acesso a registradores (16 bits de endereço, valores big-endian).
    void writeReg(uint16_t reg, uint8_t value);
    void writeReg16(uint16_t reg, uint16_t value);
    void writeReg32(uint16_t reg, uint32_t value);
    uint8_t readReg(uint16_t reg);
    uint16_t readReg16(uint16_t reg);

    // Conversões de tempo da API (públicas para os testes).
    static uint32_t decodeTimeout(uint16_t regValue);
    static uint16_t encodeTimeout(uint32_t timeoutMclks);
    static uint32_t timeoutMclksToMicroseconds(uint32_t timeoutMclks, uint32_t macroPeriodUs);
    static uint32_t timeoutMicrosecondsToMclks(uint32_t timeoutUs, uint32_t macroPeriodUs);
};

// Uma leitura conta como medida de verdade? (Os demais estados não dizem nada sobre parede.)
[[nodiscard]] bool isValidRange(Vl53l1x::RangeStatus status) noexcept;

// O que uma leitura significa para quem procura paredes.
enum class ReadingKind {
    Distance,  // medida válida (ou alvo colado no sensor, abaixo do alcance mínimo): a distância vale
    NoTarget,  // o sensor mediu e não achou alvo ao alcance: corredor aberto, sem parede
    Fault,     // o sensor não respondeu, não mediu a tempo ou reportou falha: não se sabe nada
};

// Classifica uma leitura. `transferOk`: a leitura pelo I²C foi aceita; `fresh`: chegou uma medida
// nova no prazo. Sem os dois, é falha, mesmo que o estado pareça válido.
[[nodiscard]] ReadingKind classifyReading(bool transferOk, bool fresh,
                                          Vl53l1x::RangeStatus status) noexcept;

}  // namespace micromouse::drivers
