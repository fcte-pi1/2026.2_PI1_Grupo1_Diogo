"""Bloco A: movimentos com o robô suspenso (rodas no ar)."""

from ..checks.motion import MANEUVER_END, check_maneuver_ok, check_straights
from ..checks.race import RACE_END
from ..checks.sensors import check_tof_open_space
from ..log_parsing import contains, count_containing, find_matches
from ..model import YES, Step, Test, yes_no
from ..verdict import Check
from .instructions import CLEAR_SURROUNDINGS, SUPPORTED

CELL_PULSES = 511  # pulsos de encoder numa célula


def _check_blocked_turn(lines: list[str]) -> list[Check]:
    return [
        Check.judge(count_containing(lines, "curva travada") >= 2, "'curva travada' apareceu 2 vezes",
                    "não detectou a curva travada 2 vezes: o robô girou no suporte? Repita segurando mais firme"),
        Check.judge(contains(lines, "tentativa 2 do arco"), "fez a tentativa 2 do arco"),
        Check.judge(contains(lines, "desfez o arco"), "desfez o arco antes da tentativa 2"),
    ]


def _check_start_refused_without_walls(lines: list[str]) -> list[Check]:
    return [Check.judge(contains(lines, "largada recusada: sem parede a esquerda"), "largada recusada"),
            Check.judge(bool(find_matches(lines, r"fim da corrida \d+: FALHA, 0 passos")), "0 passos")]


SUSPENDED_TESTS: tuple[Test, ...] = (
    Test("A1", "ToF sem nada por perto",
         (SUPPORTED, CLEAR_SURROUNDINGS),
         (Step("tof", r"tof 5/5: ", timeout=15),),
         "5 linhas, nenhum sensor com -1.",
         check_tof_open_space),
    Test("A2", "Uma célula para a frente, no ar",
         (SUPPORTED, "Segure o CHASSI firme contra o suporte com as duas mãos, sem tocar nas rodas e sem tapar "
                     "os sensores: o robô não pode girar nem escorregar.", "As rodas vão girar por ~1,5 s."),
         (Step("andar", MANEUVER_END, timeout=15),),
         "A reta termina 'ok' com ~511 pulsos em cada roda, giro abaixo de 3 graus e laço abaixo de 4 ms.",
         lambda lines: check_straights(lines, "andar 1 celula", 1, CELL_PULSES) + check_maneuver_ok(lines),
         moves=True),
    Test("A3", "Uma célula de ré, no ar",
         (SUPPORTED, "Segure o chassi firme contra o suporte, como no A2.",
          "As rodas vão girar para trás por ~1,5 s."),
         (Step("re", MANEUVER_END, timeout=15),),
         "A ré termina 'ok' com ~-511 pulsos em cada roda.",
         lambda lines: check_straights(lines, "re de 1 celula", 1, -CELL_PULSES) + check_maneuver_ok(lines),
         moves=True),
    Test("A4", "Curva com o robô travado (tem de detectar que não girou)",
         (SUPPORTED, "Segure o chassi BEM firme contra o suporte: ele NÃO pode girar. Não toque nas rodas.",
          "As rodas vão girar em 4 trancos, por ~6 s no total. É o esperado."),
         (Step("virar d", MANEUVER_END, timeout=30),),
         "O log mostra 'curva travada' duas vezes, com 'desfez o arco' e 'tentativa 2 do arco' no meio. Aqui a "
         "manobra TEM de terminar em falha.",
         _check_blocked_turn,
         moves=True),
    Test("A5", "Largada sem paredes (tem de recusar)",
         (SUPPORTED, CLEAR_SURROUNDINGS,
          "Chave DIP: as 3 vias na posição ABERTA (OFF). Se mexeu na chave, rode antes "
          "'python t.py reiniciar'.",
          "As rodas NÃO devem girar."),
         (Step("largar", RACE_END, timeout=30, settle=1.5),),
         "O robô recusa a largada ('largada recusada: sem parede a esquerda do robo') e não mexe as rodas.",
         _check_start_refused_without_walls,
         questions=(yes_no("rodas_paradas", "As rodas ficaram PARADAS?", expected=YES),),
         ends_in_error=True),
)
