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
    double axleToFrontMm{100.0};  // eixo_ate_frente: até o ponto mais à frente (23/11: valor da pista)
    double frontWidthMm{112.0};  // largura_frente: com tudo que sobressai (23/11: valor da pista)
    double axleToFrontTofMm{88.0};  // eixo_ate_tof_frente: face do ToF (23/11: valor da pista)
    // CAD de 19/11 (assembly.step), validados na pista:
    double widthWithWheelsMm{108.0};      // largura_com_rodas: pneus de y=33,8 a 54,0 (108,6 com cubo)
    double sideTofToCenterMm{55.5};     // tof_lado_ao_centro: 84 - 50,5 = 33,5 mm na pista
    double sideTofAheadOfAxleMm{59.15};   // tof_lado_a_frente_do_eixo: centro do módulo, x = 76,4
    // Margem de cabo à frente do ToF frontal. NÃO existe cabo à frente do robô (operador, 19/11): só o
    // cabo vermelho e preto da bateria, que sai pela lateral esquerda. Padrão 0.
    double cableAheadMm{0.0};  // cabo_frente_mm
    // 1 = frente do CAD (107,25 / 107,75), 0 = padrão de campo (87 / 85). Só registra a última
    // escolha: quem vale são eixo_ate_frente e eixo_ate_tof_frente.
    double presetCad{0.0};  // preset_cad
    // Giroscópio e curvas.
    double gyroScale{1.0};      // escala_giro: multiplica o giro Z (chip clone lê ~8% a menos)
    double arcBrakeDeg{2.6};      // freio_arco: a curva em arco freia estes graus antes do alvo
    double pivotBrakeDeg{4.0};   // freio_pivo: o mesmo no giro no lugar
    double turnMode{0.0};         // modo_curva: 0 = arco (padrão), 1 = uma roda (a de dentro parada)
    double oneWheelBrakeDeg{2.6};  // freio_uma_roda: o mesmo na curva com uma roda (PROPOSTA: o do arco)
    double autoBrake{0.0};        // autoajuste_freio: 1 = aprende a inércia das curvas na pista
    // Retas.
    double frontStopMm{35.0};     // parada_frente: a reta para com o ToF frontal abaixo disto
    double centerOnWalls{1.0};    // centralizar: 1 = corrige a reta pelos ToF laterais (RF-44)
    double tofInStraight{1.0};    // tof_na_reta: 1 = lê os ToF durante a reta (padrão); 0 = só nas paradas
    double headingGain{1.0};      // ganho_rumo: mm de correção por grau de rumo na reta (0 = não)
    // Malhas fechadas novas (19/11). A rampa vem ligada; as outras vêm desligadas até serem medidas.
    double voltageRampVPerS{50.0};  // rampa_tensao: máx. subida da tensão no motor, V/s (0 = sem rampa)
    double headingFusion{0.0};      // fusao_rumo: peso do encoder no rumo, 1/s (0 = só o giroscópio)
    double reanchorOnWalls{0.0};    // reancorar_parede: 1 = corrige a posição pela parede da frente
    double dynamicFrontStop{0.0};   // parada_dinamica: 1 = a parada da frente conta a velocidade
    double gyroBiasTracking{0.0};   // vies_giro: 1 = remede o desvio do giroscópio a cada parada
    double continuousRun{1.0};      // reta_continua: 1 = trecho reto em um movimento só (sem parar em cada célula)
    // Corredor e termo da parede (20/11). O corredor de MDF de teste mede ~150 mm, não os 168 do regulamento.
    double corridorWidthMm{168.0};     // largura_corredor: vão livre; com uma parede só, o alvo é meio vão menos o ToF até o centro
    double wallGainPulsesPerMm{3.0};   // ganho_parede: pulsos equivalentes por mm fora do centro
    double wallMaxPulses{35.0};        // max_parede: teto do termo da parede, em pulsos (16 = ~5,6 mm de correção)
    // Folga do canto de fora do arco à parede da frente (mm). O modelo de 20/11 (domain/ArcClearance) mostra que, com o robô real
    // (frente 100, largura 112), 20 mm põe o início do arco colado no limite de trás da janela; 12 mm fica perto do ótimo.
    double arcClearanceMm{18.0};       // folga_arco
    // Curva à ESQUERDA: mm a mais (positivo = começa mais tarde, perto da parede da frente; negativo = mais cedo). O cabo da bateria
    // fica à esquerda e a curva à esquerda trava a ~40 graus (20/11); o padrão 0 é o arco simétrico. Para ajustar na pista.
    double leftArcLateMm{-14.0};         // arco_esq_atraso
    // Constantes de pista de 20/11 que antes exigiam regravar o firmware (os padrões são os valores em uso).
    // (23/11: as 8 chaves da curva contínua saíram com ela: curva_continua, antecipa_arco e curva_cont_*.)
    // Desfazer de um arco travado (ré pelo mesmo arco):
    double arcUndoOuterVolts{3.6};     // desfazer_tensao_fora
    double arcUndoInnerVolts{2.2};     // desfazer_tensao_dentro
    double arcUndoTimeoutS{2.4};       // desfazer_tempo
    // Arco parado:
    double arcFixedSetbackMm{90.0};    // recuo_sem_parede: recuo antes do arco quando não há parede à frente na célula
    double arcRetryShiftMm{24.0};      // ajuste_2a_tentativa: quanto a 2a tentativa move o início do arco
    double arcStallFrontDeg{52.0};     // trava_frente_ate: travou antes disto = parede da frente (depois = quina de dentro)
    double arcNearlyDoneDeg{78.0};     // arco_quase_pronto: um arco parado a partir daqui terminou (o ajuste fino fecha o resto)
    double trimMinDeg{0.4};            // ajuste_fino_min: o ajuste fino depois da curva só age acima deste erro
    double trimMaxDeg{15.0};           // ajuste_fino_max: o ajuste fino depois do arco corrige até este erro
    // O cabo da bateria deixa o chassi ~10 mm mais largo à ESQUERDA: a centralização mira este tanto à direita do centro do corredor (20/11: a lateral
    // esquerda raspava na parede depois do giro à esquerda, com o robô 20-26 mm à esquerda).
    double lateralAimRightMm{-8.0};      // alvo_lateral_dir_mm
    double afterLeftAimRightMm{0.0};   // alvo_pos_esq_mm: SÓ na reta logo depois de uma curva/giro à esquerda a centralização mira este tanto à direita
    double rightArcOuterBiasMm{8.0};   // curva_dir_fora: o recuo da curva à direita se alinha este tanto para a esquerda (0 = não)
    // Reta e proteção:
    double headingHoldMaxMm{6.0};      // rumo_max_mm: teto da correção do ganho_rumo
    double lateralMaxHeadingDeg{8.0};  // rumo_max_lateral: acima deste rumo a estimativa lateral desliga
    double reverseMaxSpeedMmPerS{70.0};  // re_vel: velocidade máxima da ré (a frente anda a 120)
    double reverseAccelMmPerS2{120.0};   // re_acel: aceleração da ré (a frente usa 225)
    // Célula aberta (20/11): sem parede dos dois lados a menos de `lado_aberto_mm`, a curva é um giro no lugar (recua o que a parede da
    // frente exigir) em vez do arco: o arco precisa de paredes laterais para se alinhar e o erro lateral acumula (segunda metade do labirinto).
    double openPivot{1.0};             // giro_aberto: 1 = giro no lugar em célula aberta
    double openSideMm{150.0};          // lado_aberto_mm: ToF lateral acima disto = lado aberto
    // Curva em célula aberta como "S" (21/11, domain/CellTurn): o giro de 90 no lugar não cabe com os postes dos cantos.
    double cableLeftMm{10.0};          // cabo_esq_mm: o cabo da bateria sobressai na lateral esquerda; ESTIMATIVA de 20/11 (~10 mm), medir
    double openTurnMaxBetaDeg{25.0};   // giro_s_beta_max: o primeiro giro pode parar até este tanto antes dos 90 (0 = giro simples)
    double openTurnMarginMm{3.0};      // giro_s_folga: abaixo desta folga o plano é usado, mas o log avisa
    double openTurnEntryErrorMm{10.0}; // giro_s_incerteza: o plano tem de caber com o robô até este tanto fora do eixo de entrada
    double batteryLowV{5.5};           // bateria_minima: abaixo disto (5 leituras) a corrida para; no robô de 20/11 o INA219 lê ~1,7 V a menos
};

struct CalibrationField {
    std::string_view name;  // como se escreve no comando
    double Calibration::*member;
    double min;
    double max;
    std::string_view unit;
};

inline constexpr std::size_t kCalibrationFieldCount = 52;
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
