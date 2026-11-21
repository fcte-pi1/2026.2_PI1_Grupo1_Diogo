"""Bloco E: as novidades de 19/11, uma por vez (E5, E6 e E7 saem dos logs das corridas e do runner)."""

from functools import partial

from ..checks.motion import (MANEUVER_END, check_clean_motion, check_continuous_run, check_run_turn, check_tof_centering, check_log_lines, check_no_power_reset, check_full_turn, check_lateral_pose, check_maneuver_ok,
                             check_straight_times, check_straights)
from ..checks.sensors import check_calibration_in_use, check_tof_too_close, check_wheels
from ..log_parsing import contains
from ..verdict import Check
from ..model import YES, Step, Test, number, yes_no
from .instructions import SUPPORTED
from .suspended import CELL_PULSES

# E1 (P1): "muito perto". Frontal: de 0 a 40 mm; laterais: só 0 mm. Acima disso, a distância de verdade.
TOO_CLOSE_CASES = (("F", "frontal", (0, 20, 30, 40, 60)), ("E", "esquerdo", (0, 30)), ("D", "direito", (0, 30)))


def too_close_test(letter: str, name: str, distance_mm: int) -> Test:
    limit_mm = 40 if letter == "F" else 0
    return Test(
        f"E1-{letter}{distance_mm}", f"ToF {name} a {distance_mm} mm: 'muito perto' não vira 0 mm ok",
        ("Robô APOIADO e PARADO (rodas no ar).",
         f"Ponha uma caixa RÍGIDA de face lisa e clara a {distance_mm} mm da JANELA do sensor {name.upper()}, "
         "paralela e APOIADA (não segure na mão). Tire as mãos e a régua antes do ok.",
         "O teste lê o sensor por 5 s."),
        (Step("tofmon 5", r"tofmon fim: ", timeout=20),),
        ("Colado (frontal até 40 mm, lateral 0 mm): nunca conta '0 mm ok'; acima disso lê a distância ±15 mm."),
        partial(check_tof_too_close, sensor_letter=letter, sensor_name=name, real_mm=distance_mm,
                too_close=distance_mm <= limit_mm))


def _check_pivot_in_boxed_cell(lines: list[str]) -> list[Check]:
    """Célula com parede na frente, atrás e de um lado: sem espaço para recuar, o robô gira no lugar."""
    fell_back = contains(lines, "sem espaco para recuar antes do arco: gira no lugar")
    return (check_full_turn(lines) if not fell_back else check_maneuver_ok(lines)) + [
        Check.info("plano B 'gira no lugar' usado" if fell_back else "o arco coube (houve recuo normal)")]



def _loop_test(ident: str, title: str, calib: str, log_pattern: str | None, log_text: str, criterion: str,
               prepare: tuple[str, ...], questions=(), repeat: int = 1, count: int = 3, pairs: int = 0) -> Test:
    """Teste de uma malha nova: liga/desliga a chave do calib, anda `count` retas (ou `pairs` pares reta + ré,
    para não precisar pegar o robô ligado) e confere o log da malha."""
    go = (Step("andar", MANEUVER_END, timeout=15, gap=0.6),)
    back = (Step("re", MANEUVER_END, timeout=15, gap=0.6),)
    steps = (Step(f"calib {calib}", r"calib: ", timeout=10),) + ((go + back) * pairs if pairs else go * count)

    def check(lines: list[str]) -> list[Check]:
        goes = pairs or count
        result = (check_straights(lines, "andar 1 celula", goes, CELL_PULSES, 25, max_gyro_deg=3.0)
                  + check_maneuver_ok(lines, goes + pairs) + check_no_power_reset(lines))
        if pairs:
            result += check_straights(lines, "re de 1 celula", pairs, -CELL_PULSES, 25, max_gyro_deg=3.0)
        if log_pattern:
            result += check_log_lines(lines, log_pattern, log_text)
        return result
    return Test(ident, title, prepare, steps, criterion, check, questions=questions, moves=True, repeat=repeat)


LOOP_PREPARE = ("Corredor reto com 3 células livres (MDF), parede de fundo, robô no início, centrado. Todos os sensores "
                "ligados. Mão perto do balancim.",)

LOOP_TESTS: tuple[Test, ...] = (
    _loop_test("E10a", "Rampa de tensão LIGADA (rampa_tensao=50): 10 partidas sem BROWNOUT", "rampa_tensao=50", None, "",
               "5 pares reta + ré (10 partidas) ok, sem reinicialização de energia (BROWNOUT na partida: ~3 de 8 antes da "
               "rampa). Não é preciso pegar o robô.",
               LOOP_PREPARE, pairs=5),
    _loop_test("E10b", "Rampa de tensão DESLIGADA (rampa_tensao=0), para comparar com o E10a", "rampa_tensao=0", None, "",
               "Mesma conta do E10a sem a rampa: anote quantos BROWNOUT aconteceram em 10 partidas.",
               LOOP_PREPARE, pairs=5),
    _loop_test("E11a", "Fusão giroscópio + encoders LIGADA (fusao_rumo=0,5)", "fusao_rumo=0.5", None, "",
               "3 retas ok com giro final menor que 2 graus; compare o desvio lateral com o E11b.",
               LOOP_PREPARE, questions=(number("desvio_mm", "Desvio lateral final na régua (mm)", -30, 30),)),
    _loop_test("E11b", "Só giroscópio (fusao_rumo=0), para comparar com o E11a", "fusao_rumo=0", None, "",
               "Mesma conta do E11a sem a fusão.", LOOP_PREPARE,
               questions=(number("desvio_mm", "Desvio lateral final na régua (mm)", -30, 30),)),
    _loop_test("E12", "Reancorar a posição pela parede (reancorar_parede=1)", "reancorar_parede=1",
               r"reta: reancorar: frontal", "reancorar",
               "O log mostra 'reta: reancorar: frontal N mm' com o erro e a correção (0 quando dentro do ruído do ToF).",
               LOOP_PREPARE + ("Precisa de parede 1 ou 2 células à frente do centro da célula onde ele para.",)),
    _loop_test("E13", "Parada pela frente com a velocidade (parada_dinamica=1)", "parada_dinamica=1", None, "",
               "A 3ª reta para pela parede do fundo com o frontal lendo ~35 mm ou mais (antes: 65 mm pelo perfil), sem empurrar.",
               LOOP_PREPARE + ("Use um corredor curto: a 3ª reta deve chegar à parede do fundo.",),
               questions=(number("parou_mm", "Nariz até a parede do fundo, na trena (mm)", 15, 80),
                          yes_no("empurrou", "O robô empurrou a parede?", expected=None))),
    _loop_test("E14", "Viés do giroscópio remedido a cada parada (vies_giro=1)", "vies_giro=1",
               r"reta: vies do giro: medido", "vies do giro",
               "O log mostra 'vies do giro: medido X (variacao Y ...) em uso A -> B' depois de cada reta; descartado se "
               "o robô balançar.", LOOP_PREPARE),
)

NOVELTY_TESTS: tuple[Test, ...] = (
    Test("E0", "Calibração em uso depois de gravar o firmware novo (calib)",
         (SUPPORTED, "Só leitura: nada se mexe. Rode logo depois de gravar e religar o robô."),
         # Espera a ÚLTIMA linha (calib: fim): esperando a 23a chave, a captura fechava antes das últimas (20/11: 52 de 55).
         (Step("calib", r"calib: fim:", timeout=30),),
         "Os freios são 2,6 / 8,1 / 2,6, cabo_frente_mm = 0, rampa_tensao = 50 e as outras chaves novas = 0. Se algum "
         "freio mostrar o valor antigo (3,2 / 10,1), a memória não foi zerada: 'calib padrao'.",
         check_calibration_in_use),
    *(too_close_test(letter, name, distance) for letter, name, distances in TOO_CLOSE_CASES
      for distance in distances),
    Test("E2", "Centralização célula a célula (calib centralizar=1)",
         ("Corredor reto com parede dos DOIS lados (ou do esquerdo, se o direito estiver sem ler: o teste anota).",
          "Largue o robô ~20 mm fora do centro, com ~5 graus de erro de rumo, traseira a ~2 cm da parede do fundo.",
          "O teste liga 'centralizar=1' e anda 3 retas. Mão perto do balancim."),
         (Step("calib centralizar=1", r"calib: centralizar", timeout=10),
          Step("andar", MANEUVER_END, timeout=15, gap=0.6), Step("andar", MANEUVER_END, timeout=15, gap=0.6),
          Step("andar", MANEUVER_END, timeout=15, gap=0.6)),
         "Linhas 'reta: pose lateral' com o erro do eixo caindo (meta: até 15 mm no fim) e 3 retas ok.",
         lambda lines: (check_lateral_pose(lines) + check_straights(lines, "andar 1 celula", 3, CELL_PULSES, 20)
                        + check_maneuver_ok(lines, 3)),
         questions=(number("lateral_mm", "Na trena: distância do eixo do robô ao centro do corredor, em mm "
                                         "(0 = centrado)", -15, 15),),
         moves=True),
    Test("E3a", "Curva em uma roda (calib modo_curva=1), curva à direita (faça 3 vezes)",
         ("Quina do labirinto com parede à frente e passagem para a DIREITA; robô no centro da célula, "
          "frente para a parede.", "O teste liga 'modo_curva=1' e vira à direita. Depois da 3ª vez rode o E3c."),
         (Step("calib modo_curva=1", r"calib: modo_curva", timeout=10),
          Step("virar d", MANEUVER_END, timeout=20)),
         "A curva termina 'ok', sem 'tentativa 2'; o robô sai deslocado do eixo (esperado nessa curva).",
         check_full_turn,
         questions=(yes_no("sem_batida", "O robô passou sem encostar nas paredes?", expected=YES),),
         moves=True, repeat=3),
    Test("E3b", "Curva em uma roda (calib modo_curva=1), curva à esquerda (faça 3 vezes)",
         ("Quina com passagem para a ESQUERDA; robô no centro da célula, frente para a parede.",),
         (Step("calib modo_curva=1", r"calib: modo_curva", timeout=10),
          Step("virar e", MANEUVER_END, timeout=20)),
         "A curva termina 'ok', sem 'tentativa 2'.",
         check_full_turn,
         questions=(yes_no("sem_batida", "O robô passou sem encostar nas paredes?", expected=YES),),
         moves=True, repeat=3),
    Test("E3c", "Volta ao modo arco (calib modo_curva=0) e curva à direita (faça 3 vezes)",
         ("Mesma quina do E3a. O teste volta ao modo ARCO para comparar.",),
         (Step("calib modo_curva=0", r"calib: modo_curva", timeout=10),
          Step("virar d", MANEUVER_END, timeout=20)),
         "A curva em arco termina 'ok'; compare o tempo e o deslocamento com o E3a.",
         check_full_turn,
         questions=(yes_no("sem_batida", "O robô passou sem encostar nas paredes?", expected=YES),),
         moves=True, repeat=3),
    Test("E4", "Velocidade e frenagem suave: 3 retas de 1 célula (sem balançar ao parar)",
         ("Corredor reto livre com 3 células. Fita ao lado da roda para ver se o robô balança ao parar.",
          "Olhe o robô de lado: ao frear ele não deve dar o 'tranco' para frente e para trás."),
         (Step("andar", MANEUVER_END, timeout=15, gap=0.6), Step("andar", MANEUVER_END, timeout=15, gap=0.6),
          Step("andar", MANEUVER_END, timeout=15, gap=0.6)),
         "3 retas ok em ~2,0 a 2,9 s cada (120 mm/s, 225 mm/s²) e SEM balanço visível na frenagem.",
         lambda lines: (check_straights(lines, "andar 1 celula", 3, CELL_PULSES, 20)
                        + check_straight_times(lines, "andar 1 celula", 3) + check_maneuver_ok(lines, 3)),
         questions=(yes_no("sem_balanco", "Ao frear, o robô parou SEM o balanço (tranco para frente e para "
                                          "trás) que acontecia antes?", expected=YES),
                    number("pitch", "Quanto balançou ao parar? 0 = nada, 1 = pouco, 2 = como antes, 3 = pior", 0, 1)),
         moves=True),
    Test("E4b", "Frenagem suave no giro de 90 graus no lugar (direita)",
         ("Chão livre. Folha com um L desenhado, como no B4d.",
          "Olhe se o robô balança ao terminar o giro."),
         (Step("pivo d", MANEUVER_END, timeout=15),),
         "O giro termina 'ok' e o robô fica alinhado, sem balanço visível ao parar.",
         check_maneuver_ok,
         questions=(yes_no("alinhado", "Ficou alinhado com a outra linha do L?", expected=YES),
                    yes_no("sem_balanco", "Parou SEM balançar?", expected=YES)),
         moves=True),
    Test("E9", "Curva numa célula fechada: parede na frente, ATRÁS e num lado (faça 3 vezes)",
         ("Monte (ou escolha) uma célula com parede na FRENTE, ATRÁS e na ESQUERDA; o lado DIREITO fica aberto.",
          "Ponha o robô no centro da célula, frente para a parede. A conta do firmware (PivotClearance): com o eixo "
          "no centro o canto da frente bate ~17 mm na parede da frente; só cabe com o eixo 17 a 27 mm ATRÁS do centro.",
          "Olhe de cima: o robô NÃO pode raspar nenhuma parede. Se raspar, anote qual e quanto (régua).",
          "O teste vira à DIREITA (lado aberto). Depois repita espelhado (parede à direita, vira à esquerda)."),
         (Step("virar d", MANEUVER_END, timeout=25),),
         "A curva termina 'ok' sem raspar parede. O log mostra 'sem espaco para recuar antes do arco: gira no lugar' e "
         "'giro em celula fechada: ... plano anda e gira ...' (o robô anda ~45 mm para a frente até 17 a 27 mm atrás do "
         "centro e gira). Depois a reta seguinte deve sair reta (centralizar=1).",
         _check_pivot_in_boxed_cell,
         questions=(yes_no("sem_raspar", "O robô girou SEM raspar nenhuma parede (frente, atrás ou lado)?", expected=YES),
                    number("desvio_mm", "Depois da curva, desvio do eixo para o lado, na régua, em mm", -30, 30),
                    yes_no("alinhado", "Ficou alinhado (reto) no corredor de saída?", expected=YES)),
         moves=True, repeat=3),
    Test("E9b", "Célula fechada com a curva de UMA roda (modo_curva=1), 3 vezes",
         ("Mesma célula do E9: parede na frente, ATRÁS e na esquerda; lado direito aberto; robô no centro.",
          "Esta curva (uma roda) usa o mesmo plano B (andar até a faixa e girar) quando não há espaço para recuar."),
         (Step("calib modo_curva=1", r"calib: modo_curva", timeout=10), Step("virar d", MANEUVER_END, timeout=25),
          Step("calib modo_curva=0", r"calib: modo_curva", timeout=10)),
         "A curva termina 'ok' sem raspar parede; o modo volta a 0 no fim.",
         _check_pivot_in_boxed_cell,
         questions=(yes_no("sem_raspar", "O robô girou SEM raspar nenhuma parede?", expected=YES),),
         moves=True, repeat=3),
    *LOOP_TESTS,
    Test("E15", "Reta e ré contínuas: 3 células num movimento só (andar 3) e volta de ré contínua (re 3)",
         ("Corredor reto de MDF, robô no início, centrado e afastado das paredes laterais. 3 células livres à frente.",
          "Olhe de lado, abaixado: o robô deve acelerar UMA vez, andar as 3 células sem parar e frear UMA vez.",
          "Depois ele volta as 3 células de ré, também sem parar no meio (re 3)."),
         (Step("andar 3", MANEUVER_END, timeout=20), Step("re 3", MANEUVER_END, timeout=20, gap=0.6)),
         "Uma linha 'trecho continuo: 3 de 3 celulas', ~1533 pulsos em cada roda, giro < 3 graus, sem parar no meio; a ré (re 3) também contínua.",
         lambda lines: (check_continuous_run(lines, 3) + check_clean_motion(lines, 0) + check_tof_centering(lines, 0)
                        + check_clean_motion(lines, 1) + check_maneuver_ok(lines, 2)
                        + check_no_power_reset(lines)),
         questions=(yes_no("sem_parar", "O robô andou as 3 células SEM parar no meio?", expected=YES),
                    number("tranco", "Tranco ao parar no fim: 0 = nada, 1 = pouco, 2 = como antes, 3 = pior", 0, 1)),
         moves=True),
    *[Test(f"E16{suffix}", f"Curva contínua à {name}: anda 1 célula e vira SEM parar (curvac {key})",
           ("Célula de curva do labirinto: corredor reto atrás de você e a curva para o lado " + name + " logo à frente (parede na frente "
            "da célula da curva, saída aberta para a " + name + ").",
            "Robô no centro de uma célula, voltado para a célula da curva, afastado das paredes laterais, fora de parede de trás encostada.",
            "Olhe de cima: ele anda, entra no arco SEM parar e termina no centro da célula depois da curva, já virado."),
           (Step(f"curvac {key} 1", MANEUVER_END, timeout=25),),
           "Uma linha 'curva continua a " + name + "', entrou a >= 60 mm/s, ~90 graus pelo giroscópio, erro do arco <= 10 graus, sem raspar parede.",
           lambda lines, side=name: (check_run_turn(lines, side) + check_maneuver_ok(lines, 1) + check_no_power_reset(lines)),
           questions=(yes_no("sem_parar", "O robô entrou na curva SEM parar?", expected=YES),
                      yes_no("sem_raspar", "O robô terminou a curva SEM raspar nenhuma parede?", expected=YES),
                      yes_no("centrado", "Terminou no centro da célula, reto no corredor de saída?", expected=YES)),
           moves=True, repeat=3)
      for suffix, name, key in (("a", "direita", "d"), ("b", "esquerda", "e"))],
    Test("E8", "ToF cai em movimento (P6): rodas girando e você mexendo nos cabos",
         (SUPPORTED, "As rodas VÃO GIRAR sozinhas por ~15 s. Mantenha dedos, cabos e roupas longe delas.",
          "Com um palito de PLÁSTICO, balance DE LEVE o cabo e o conector de cada ToF enquanto as rodas giram. "
          "Todos os sensores ficam ligados; uma queda aqui é o dado que queremos."),
         (Step("rodas", r"rodas: resumo: ", timeout=60),),
         "O firmware NÃO religa o sensor em movimento: se um sensor cair, o log diz 'tof: <lado> PAROU de "
         "responder' e as rodas continuam a ser lidas. Anote qual sensor caiu.",
         check_wheels, moves=True),
)

