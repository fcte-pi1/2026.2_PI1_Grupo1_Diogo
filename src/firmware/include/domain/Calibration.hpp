#pragma once

#include <array>
#include <cstddef>
#include <string_view>

namespace micromouse::domain {

// Valores que dependem do robô montado e do piso, trocáveis pelo comando `calib` do BLE sem
// regravar o firmware (16/11). Ficam gravados na memória do robô (NVS). Os padrões são os valores
// em uso em 16/11: sem nenhum `calib`, o robô se comporta como antes.
struct Calibration {
    // Corpo do robô, a partir do MEIO DO EIXO das rodas (mm). Entram na conta de onde o arco começa.
    double axleToFrontMm{87.0};     // eixo_ate_frente: até o ponto mais à frente do robô
    double frontWidthMm{100.0};     // largura_frente: largura na frente, com tudo que sobressai
    double axleToFrontTofMm{87.0};  // eixo_ate_tof_frente: até a face do ToF frontal
    // Só registro (0 = não medido): ainda não entram em nenhuma conta.
    double widthWithWheelsMm{0.0};     // largura_com_rodas
    double sideTofToCenterMm{0.0};     // tof_lado_ao_centro
    double sideTofAheadOfAxleMm{0.0};  // tof_lado_a_frente_do_eixo
    // Giroscópio e curvas.
    double gyroScale{1.08};       // escala_giro: multiplica o giro Z (chip clone lê ~8% a menos)
    double arcBrakeDeg{7.5};      // freio_arco: a curva em arco freia estes graus antes do alvo
    double pivotBrakeDeg{13.5};   // freio_pivo: o mesmo no giro no lugar
    double autoBrake{0.0};        // autoajuste_freio: 1 = aprende a inércia das curvas na pista
    // Retas.
    double frontStopMm{35.0};     // parada_frente: a reta para com o ToF frontal abaixo disto
    double centerOnWalls{0.0};    // centralizar: 1 = corrige a reta pelos ToF laterais (RF-44)
    double headingGain{0.0};      // ganho_rumo: mm de correção por grau de rumo na reta (0 = não)
};

struct CalibrationField {
    std::string_view name;  // como se escreve no comando
    double Calibration::*member;
    double min;
    double max;
    std::string_view unit;
};

inline constexpr std::size_t kCalibrationFieldCount = 13;
[[nodiscard]] const std::array<CalibrationField, kCalibrationFieldCount>& calibrationFields() noexcept;

enum class CalibrationSet { Ok, UnknownName, OutOfRange, NotANumber };

// Troca UM valor. Fora da faixa, nome desconhecido ou texto que não é número: nada muda.
[[nodiscard]] CalibrationSet setCalibration(Calibration& calibration, std::string_view name,
                                            std::string_view value) noexcept;

struct CalibrationParse {
    int applied{0};
    int rejected{0};
    std::string_view firstRejected{};  // o primeiro "nome=valor" recusado
    CalibrationSet firstReason{CalibrationSet::Ok};
};

// "nome=valor nome=valor ...". Ou tudo vale ou NADA muda: um item recusado descarta os outros, para
// o robô não ficar com metade de um conjunto de medidas.
[[nodiscard]] CalibrationParse applyCalibration(Calibration& calibration,
                                                std::string_view assignments) noexcept;

// Um valor que veio da memória e não cabe na faixa (memória corrompida, faixa que mudou) volta ao
// padrão. Devolve quantos foram trocados.
int sanitizeCalibration(Calibration& calibration) noexcept;

}  // namespace micromouse::domain
