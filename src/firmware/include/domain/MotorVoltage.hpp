#pragma once

#include "domain/BridgeDrive.hpp"

namespace micromouse::domain {

// O controle de movimento pede TENSÃO no motor (volts, sinal = sentido), e não uma fração do PWM.
// Assim a mesma ordem dá a mesma força com a bateria cheia (8,4 V) ou no fim (7,0 V), e nos dois
// modos do PWM. Em 09/11, com potências fixas em fast decay, o motor de 6 V recebia ~3,2 V na reta.

// Tensão da bateria usada na conversão: a lida no INA219 se for plausível para a 2S; senão, a
// nominal (leitura falhou ou o INA não respondeu).
[[nodiscard]] double usableBatteryVolts(double measuredVolts, double nominalVolts) noexcept;

// Comando em [-1, 1] para o MotorDriver que põe ~`volts` em média no motor:
// - slow decay: tensão média = comando x bateria;
// - fast decay: com a corrente contínua, tensão média ~ (2 x comando - 1) x bateria
//   (domain/BridgeDrive.hpp), então comando = (tensão / bateria + 1) / 2. Com a corrente
//   descontínua (motor quase parado) a tensão real fica acima disso; o controle fecha a diferença.
// Pedidos acima da bateria saturam em +-1. 0 V dá comando 0 (motor solto ou parado).
[[nodiscard]] double commandForVolts(double volts, double batteryVolts, DecayMode mode) noexcept;

}  // namespace micromouse::domain
