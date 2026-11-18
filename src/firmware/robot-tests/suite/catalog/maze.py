"""Bloco C: labirinto, uma manobra por vez."""

from ..checks.motion import (MANEUVER_END, check_maneuver_ok, check_straights, check_turn,
                             check_turn_after_wall_approach)
from ..checks.sensors import check_tof_in_cell
from ..log_parsing import contains
from ..model import NO, Question, Step, Test, free_text, repeated, yes_no
from ..verdict import Check, Verdict
from .instructions import CENTERED_IN_CELL
from .suspended import CELL_PULSES

NO_LIMIT_MM = 9999
TOF_END = r"tof 5/5: "


def _touched_wall() -> Question:
    return yes_no("encostou", "Encostou em alguma parede?", expected=NO)


def _facing(cell: str, example: str = "") -> Question:
    hint = f" (ex.: {example})" if example else ""
    return free_text("virado_para", f"Terminou virado para qual célula?{hint}", expected=cell)


def _check_front_only_open(lines: list[str]) -> list[Check]:
    """C2: só o frontal interessa (mantém as falhas dos outros sensores)."""
    checks = check_tof_in_cell(lines, (180, NO_LIMIT_MM), (0, NO_LIMIT_MM), (0, NO_LIMIT_MM))
    return [check for check in checks if check.status == Verdict.FAILED or "frontal" in check.text]


def _check_turn_without_front_wall(lines: list[str], forbid_advance: bool = False) -> list[Check]:
    checks = [Check.judge(contains(lines, "inicio do arco: sem parede a frente"), "arco sem parede à frente")]
    if forbid_advance:
        checks.append(Check.judge(not contains(lines, "avanco antes da curva"), "sem 'avanco antes da curva'"))
    return checks + check_turn(lines) + check_maneuver_ok(lines)


def _check_turn_held_by_hand(lines: list[str]) -> list[Check]:
    return [Check.judge(contains(lines, "curva travada"), "detectou a curva travada",
                        "não detectou: você segurou tarde ou soltou cedo demais? Repita"),
            Check.judge(contains(lines, "tentativa 2 do arco"), "fez a tentativa 2")] + check_maneuver_ok(lines)


MAZE_TESTS: tuple[Test, ...] = (
    Test("C1", "Sensores na célula A2",
         (CENTERED_IN_CELL, "Célula A2, com a FRENTE do robô virada para A1 (há uma parede logo à frente).",
          "Tire as mãos de dentro do labirinto antes do ok."),
         (Step("tof", TOF_END, timeout=15),),
         "Frontal entre 35 e 100 mm (parede à frente), esquerdo entre 15 e 60 mm (parede), direito acima de "
         "140 mm (aberto).",
         lambda lines: check_tof_in_cell(lines, (35, 100), (15, 60), (140, NO_LIMIT_MM))),
    Test("C2", "Sensores na célula A3",
         (CENTERED_IN_CELL, "Célula A3, com a frente virada para A2 (sem parede logo à frente).",
          "Mãos fora do labirinto."),
         (Step("tof", TOF_END, timeout=15),),
         "Frontal acima de 180 mm: a parede que ele vê é a do fim de A2, e ela NÃO pode contar como parede de A3.",
         _check_front_only_open),
    Test("C3", "3 células de ré pelo corredor da linha 1",
         (CENTERED_IN_CELL, "Célula A1, com a FRENTE virada para a parede do fundo e as COSTAS para B1.",
          "O robô vai de ré 3 células seguidas: A1 -> B1 -> C1 -> D1."),
         repeated(Step("re", MANEUVER_END, timeout=15, gap=0.8), 3),
         "As 3 rés terminam 'ok' com laço abaixo de 4 ms, e o robô para em D1 sem encostar nas paredes.",
         lambda lines: (check_straights(lines, "re de 1 celula", 3, -CELL_PULSES, max_gyro_deg=5.0)
                        + check_maneuver_ok(lines, 3)),
         questions=(free_text("parou_em", "Em que célula o robô parou? (ex.: D1)", expected="D1"),
                    _touched_wall()),
         moves=True),
    Test("C4", "Curva para a direita em A2 (faça 3 vezes)",
         (CENTERED_IN_CELL, "Célula A2, frente virada para A1 (parede à frente).",
          "O robô ajusta a distância à parede, faz a curva para a DIREITA e termina virado para B2.",
          "Olhe se alguma parte do robô encosta numa parede durante a curva."),
         (Step("virar d", MANEUVER_END, timeout=25),),
         "O arco começa com o frontal entre 100 e 110 mm, a curva termina 'ok' em menos de 1,5 s, sem "
         "'tentativa 2', sem encostar, virado para B2.",
         check_turn_after_wall_approach,
         questions=(_touched_wall(), _facing("B2", example="B2")),
         moves=True, repeat=3),
    Test("C5", "Curva para a direita em A4 (faça 3 vezes)",
         (CENTERED_IN_CELL, "Célula A4, frente virada para a parede do fundo (a borda do labirinto além de A4), "
                            "vindo de B4.",
          "O robô faz a curva para a DIREITA e termina virado para A3."),
         (Step("virar d", MANEUVER_END, timeout=25),),
         "Igual ao C4; termina virado para A3.",
         check_turn_after_wall_approach,
         questions=(_touched_wall(), _facing("A3")),
         moves=True, repeat=3),
    Test("C6", "Curva para a esquerda em C1, sem parede à frente (faça 3 vezes)",
         (CENTERED_IN_CELL, "Célula C1, frente virada para B1 (sem parede à frente).",
          "O robô faz a curva para a ESQUERDA e termina virado para C2."),
         (Step("virar e", MANEUVER_END, timeout=25),),
         "O log diz 'sem parede a frente ... recuo fixo 75 mm', a curva termina 'ok', virado para C2, sem "
         "encostar.",
         _check_turn_without_front_wall,
         questions=(_touched_wall(), _facing("C2")),
         moves=True, repeat=3),
    Test("C7", "Curva para a esquerda em C3 (faça 3 vezes)",
         (CENTERED_IN_CELL, "Célula C3, frente virada para D3.",
          "O robô faz a curva para a ESQUERDA e termina virado para C2."),
         (Step("virar e", MANEUVER_END, timeout=25),),
         "'sem parede a frente', nenhuma linha 'avanco antes da curva', curva 'ok', virado para C2.",
         lambda lines: _check_turn_without_front_wall(lines, forbid_advance=True),
         questions=(_touched_wall(), _facing("C2")),
         moves=True, repeat=3),
    Test("C8", "Curva em A2 segurando o robô no meio (a 2ª tentativa tem de funcionar)",
         (CENTERED_IN_CELL, "Célula A2, frente virada para A1, como no C4.",
          "Depois do ok: quando o robô COMEÇAR a girar, segure-o com a mão por ~1 segundo (ele para de girar) e "
          "SOLTE. Não o tire do lugar.",
          "Ele deve voltar, tentar de novo sozinho e completar a curva."),
         (Step("virar d", MANEUVER_END, timeout=35),),
         "O log mostra 'curva travada', 'desfez o arco' e 'tentativa 2 do arco', e a manobra termina 'ok'.",
         _check_turn_held_by_hand,
         questions=(yes_no("encostou", "Na 2ª tentativa, encostou em alguma parede (inclusive a de trás)?",
                           expected=NO),),
         moves=True),
    Test("C9", "Curva para a esquerda em B2, só a esquerda livre (faça 3 vezes)",
         (CENTERED_IN_CELL, "Célula B2, com a FRENTE virada para B1 (parede logo à frente, o fundo de B1) e "
                            "parede à DIREITA (entre B2 e C2). O único lado livre é a ESQUERDA, para A2. Atrás "
                            "(B3) fica livre.",
          "O robô ajusta a distância à parede da frente, faz a curva para a ESQUERDA e termina virado para A2.",
          "Olhe se alguma parte do robô encosta numa parede durante o ajuste e a curva."),
         (Step("virar e", MANEUVER_END, timeout=25),),
         "O arco começa com o frontal entre 100 e 110 mm (ajuste feito), a curva termina 'ok' em menos de "
         "1,5 s, sem 'tentativa 2', sem encostar, virado para A2.",
         check_turn_after_wall_approach,
         questions=(_touched_wall(), _facing("A2", example="A2")),
         moves=True, repeat=3),
)
