#pragma once

#include <array>
#include <cstddef>
#include <string_view>

#include "domain/RobotParameters.hpp"

namespace micromouse::domain {

// Valores que dependem do robô montado e do piso, trocáveis pelo comando `calib` do BLE sem
// regravar o firmware (16/11). Ficam gravados na memória do robô (NVS). Os padrões são os valores
// em uso em 16/11: sem nenhum `calib`, o robô se comporta como antes.
struct Calibration {
    // Corpo do robô, a partir do MEIO DO EIXO das rodas (mm). Entram na conta de onde o arco começa.
    double axleToFrontMm{robot::kBody.axleToFrontMm};  // eixo_ate_frente: até o ponto mais à frente
    double frontWidthMm{2.0 * robot::kBody.halfWidthMm};  // largura_frente: com tudo que sobressai
    double axleToFrontTofMm{robot::kBody.axleToFrontTofMm};  // eixo_ate_tof_frente: face do ToF
    // CAD de 19/11 (assembly.step), validados na pista:
    double widthWithWheelsMm{108.0};      // largura_com_rodas: pneus de y=33,8 a 54,0 (108,6 com cubo)
    double sideTofToCenterMm{50.5};       // tof_lado_ao_centro: 84 - 50,5 = 33,5 mm na pista
    double sideTofAheadOfAxleMm{59.15};   // tof_lado_a_frente_do_eixo: centro do módulo, x = 76,4
    // Margem de cabo à frente do ToF frontal. NÃO existe cabo à frente do robô (operador, 19/11): só o
    // cabo vermelho e preto da bateria, que sai pela lateral esquerda. Padrão 0.
    double cableAheadMm{0.0};  // cabo_frente_mm
    // 1 = frente do CAD (107,25 / 107,75), 0 = padrão de campo (87 / 85). Só registra a última
    // escolha: quem vale são eixo_ate_frente e eixo_ate_tof_frente.
    double presetCad{0.0};  // preset_cad
    // Giroscópio e curvas.
    double gyroScale{1.08};       // escala_giro: multiplica o giro Z (chip clone lê ~8% a menos)
    double arcBrakeDeg{2.6};      // freio_arco: a curva em arco freia estes graus antes do alvo
    double pivotBrakeDeg{8.1};   // freio_pivo: o mesmo no giro no lugar
    double turnMode{0.0};         // modo_curva: 0 = arco (padrão), 1 = uma roda (a de dentro parada)
    double oneWheelBrakeDeg{2.6};  // freio_uma_roda: o mesmo na curva com uma roda (PROPOSTA: o do arco)
    double autoBrake{0.0};        // autoajuste_freio: 1 = aprende a inércia das curvas na pista
    // Retas.
    double frontStopMm{35.0};     // parada_frente: a reta para com o ToF frontal abaixo disto
    double centerOnWalls{0.0};    // centralizar: 1 = corrige a reta pelos ToF laterais (RF-44)
    double tofInStraight{1.0};    // tof_na_reta: 1 = lê os ToF durante a reta (padrão); 0 = só nas paradas
    double headingGain{0.0};      // ganho_rumo: mm de correção por grau de rumo na reta (0 = não)
    // Malhas fechadas novas (19/11). A rampa vem ligada; as outras vêm desligadas até serem medidas.
    double voltageRampVPerS{50.0};  // rampa_tensao: máx. subida da tensão no motor, V/s (0 = sem rampa)
    double headingFusion{0.0};      // fusao_rumo: peso do encoder no rumo, 1/s (0 = só o giroscópio)
    double reanchorOnWalls{0.0};    // reancorar_parede: 1 = corrige a posição pela parede da frente
    double dynamicFrontStop{0.0};   // parada_dinamica: 1 = a parada da frente conta a velocidade
    double gyroBiasTracking{0.0};   // vies_giro: 1 = remede o desvio do giroscópio a cada parada
    double continuousRun{1.0};      // reta_continua: 1 = trecho reto em um movimento só (sem parar em cada célula)
};

struct CalibrationField {
    std::string_view name;  // como se escreve no comando
    double Calibration::*member;
    double min;
    double max;
    std::string_view unit;
};

inline constexpr std::size_t kCalibrationFieldCount = 24;
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

// Frente do CAD x frente em uso (19/11): a maior diferença, em mm, entre o eixo-até-a-frente e o
// eixo-até-o-ToF em uso e os do CAD. As duas fontes não podem estar certas; o log de boot avisa
// quando passa de robot::kBodyConflictMm até a medida de paquímetro decidir.
[[nodiscard]] double bodyVsCadGapMm(const Calibration& calibration) noexcept;
[[nodiscard]] bool bodyConflictsWithCad(const Calibration& calibration) noexcept;

// Um valor que veio da memória e não cabe na faixa (memória corrompida, faixa que mudou) volta ao
// padrão. Devolve quantos foram trocados.
int sanitizeCalibration(Calibration& calibration) noexcept;

}  // namespace micromouse::domain
