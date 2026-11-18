"""Bloco B: chão livre, fora do labirinto."""

from functools import partial

from ..checks.motion import MANEUVER_END, check_full_turn, check_maneuver_ok, check_straights, check_turn
from ..checks.sensors import check_tof_calibration
from ..model import YES, Step, Test, number, repeated, yes_no
from ..verdict import Check
from .suspended import CELL_PULSES

TOF_SENSORS = (("E", "esquerdo"), ("F", "frontal"), ("D", "direito"))
TOF_CALIBRATION_DISTANCES_MM = (50, 100, 150, 200)


def tof_calibration_test(sensor_letter: str, sensor_name: str, distance_mm: int) -> Test:
    return Test(
        f"B3-{sensor_letter}{distance_mm}", f"Calibração do ToF {sensor_name} a {distance_mm} mm",
        ("Robô no chão ou na mesa, PARADO.",
         f"Ponha uma caixa RÍGIDA de face lisa e clara (ou um livro em pé) na frente do sensor "
         f"{sensor_name.upper()}, paralela ao sensor, APOIADA na mesa (não segure na mão).",
         f"Com a régua, deixe a face da caixa a EXATAMENTE {distance_mm} mm da JANELA do sensor "
         "(o quadradinho preto do sensor, não a borda do chassi).",
         "Tire as mãos e a régua da frente antes de dar o ok."),
        (Step("tofmon 5", r"tofmon fim: ", timeout=20),),
        f"A média lida fica a menos de 10 mm de {distance_mm} mm. Fora disso não é erro seu: o valor é "
        "anotado para a equipe calibrar.",
        partial(check_tof_calibration, sensor_letter=sensor_letter, sensor_name=sensor_name,
                real_mm=distance_mm))


def _pivot_checks(lines: list[str]) -> list[Check]:
    return check_turn(lines) + check_maneuver_ok(lines)


FLOOR_TESTS: tuple[Test, ...] = (
    Test("B1", "5 células em linha reta no chão",
         ("Chão liso e livre, fora do labirinto, com pelo menos 1,2 m de espaço à frente do robô.",
          "Cole uma fita no chão e ponha as duas RODAS em cima dela (a fita marca o eixo). Marque também o "
          "centro do robô na fita.", "O robô vai andar 5 vezes seguidas, ~90 cm no total. Não toque nele."),
         repeated(Step("andar", MANEUVER_END, timeout=15, gap=0.6), 5),
         "As 5 retas terminam 'ok'. Na régua: 900 mm ± 25 da fita até o eixo das rodas, e menos de 30 mm de "
         "desvio para o lado.",
         lambda lines: check_straights(lines, "andar 1 celula", 5, CELL_PULSES) + check_maneuver_ok(lines, 5),
         questions=(number("distancia_mm", "Distância da fita até o EIXO das rodas, em mm", 875, 925),
                    number("desvio_mm", "Desvio para o lado (esquerda ou direita), em mm", 0, 30)),
         moves=True),
    Test("B2", "3 células de ré no chão",
         ("Chão livre com 70 cm de espaço ATRÁS do robô.", "Fita no chão marcando o eixo das rodas, como no B1.",
          "O robô vai andar de ré 3 vezes seguidas, ~54 cm."),
         repeated(Step("re", MANEUVER_END, timeout=15, gap=0.6), 3),
         "As 3 rés terminam 'ok'. Na régua: 540 mm ± 15.",
         lambda lines: check_straights(lines, "re de 1 celula", 3, -CELL_PULSES) + check_maneuver_ok(lines, 3),
         questions=(number("distancia_mm", "Distância da fita até o eixo das rodas, em mm", 525, 555),),
         moves=True),
    *(tof_calibration_test(letter, name, distance)
      for letter, name in TOF_SENSORS for distance in TOF_CALIBRATION_DISTANCES_MM),
    Test("B4d", "Giro de 90 graus no lugar, para a direita",
         ("Chão livre. Desenhe numa folha um ângulo reto (duas linhas em L) e prenda a folha no chão.",
          "Ponha o robô com o eixo das rodas sobre o canto do L e a frente apontando ao longo de uma das linhas.",
          "O robô vai girar 90 graus para a DIREITA sem sair do lugar."),
         (Step("pivo d", MANEUVER_END, timeout=15),),
         "A curva termina 'ok' e o robô fica alinhado com a outra linha do L (entre 85 e 95 graus).",
         _pivot_checks,
         questions=(yes_no("alinhado", "O robô ficou alinhado com a outra linha do L (erro menor que meio dedo "
                                       "na ponta do robô)?", expected=YES),),
         moves=True),
    Test("B4e", "Giro de 90 graus no lugar, para a esquerda",
         ("Como no B4d, mas o robô vai girar para a ESQUERDA.",),
         (Step("pivo e", MANEUVER_END, timeout=15),),
         "A curva termina 'ok' e o robô fica alinhado com a outra linha do L.",
         _pivot_checks,
         questions=(yes_no("alinhado", "O robô ficou alinhado com a outra linha do L?", expected=YES),),
         moves=True),
    Test("B5d", "Curva completa para a direita no chão livre (faça 3 vezes)",
         ("Chão livre, 50 cm de espaço em volta. Marque com fita onde estão as duas rodas.",
          "O robô recua ~7 cm, faz a curva para a DIREITA e recua de novo ~9 cm."),
         (Step("virar d", MANEUVER_END, timeout=20),),
         "A curva termina 'ok', sem 'tentativa 2'. O robô termina girado 90 graus para a direita.",
         check_full_turn,
         questions=(yes_no("girou_90", "Terminou girado ~90 graus para a DIREITA?", expected=YES),),
         moves=True, repeat=3),
    Test("B5e", "Curva completa para a esquerda no chão livre (faça 3 vezes)",
         ("Como no B5d, para a ESQUERDA.",),
         (Step("virar e", MANEUVER_END, timeout=20),),
         "A curva termina 'ok', sem 'tentativa 2'. O robô termina girado 90 graus para a esquerda.",
         check_full_turn,
         questions=(yes_no("girou_90", "Terminou girado ~90 graus para a ESQUERDA?", expected=YES),),
         moves=True, repeat=3),
)
