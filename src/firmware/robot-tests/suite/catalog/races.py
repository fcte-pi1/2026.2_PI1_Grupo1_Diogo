"""Bloco D: corridas completas no labirinto 4x4 de testes."""

from ..checks.race import RACE_END, ExpectedStep, check_race
from ..log_parsing import contains, find_matches
from ..model import YES, Question, Step, Test, free_text, number, yes_no
from ..verdict import Check
from ..watchers import stop_during_second_straight, stop_when_outside_maze
from .instructions import CENTERED_IN_CELL

FROM_D4_SEQUENCE: list[ExpectedStep] = [
    ("l3,c0", "frente"), ("l2,c0", "frente"), ("l1,c0", "frente"), ("l0,c0", "direita"),
    ("l0,c1", "frente"), ("l0,c2", "direita"), ("l1,c2", "direita"), ("l1,c1", "esquerda"),
    ("l2,c1", "esquerda"), ("l2,c2", "frente"), ("l2,c3", "esquerda"), ("l1,c3", "frente")]
FROM_D1_SEQUENCE: list[ExpectedStep] = [
    ("l3,c3", "frente"), ("l2,c3", "frente"), ("l1,c3", "frente"), ("l0,c3", "re"),
    ("l1,c3", "re"), ("l2,c3", "esquerda"), ("l2,c2", "frente"), ("l2,c1", "direita"),
    ("l1,c1", "frente"), ("l0,c1", "esquerda")]

VIA3_OPEN_RESTART_HINT = "Chave DIP: via 3 ABERTA (OFF); 'python t.py reiniciar' se mexeu."


def _race_step(timeout: float = 150) -> tuple[Step, ...]:
    return (Step("largar", RACE_END, timeout=timeout, settle=2.0),)


def _race_questions(final_cell: str) -> tuple[Question, ...]:
    return (free_text("parou_em", "Em que célula o robô parou?", expected=final_cell),
            number("batidas", "Quantas vezes encostou numa parede?", 0, 0))


def _ended_in_failure(lines: list[str]) -> Check:
    return Check.judge(bool(find_matches(lines, r"fim da corrida \d+: FALHA")), "corrida terminou em FALHA")


RACE_TESTS: tuple[Test, ...] = (
    Test("D1", "Corrida completa a partir de D4 (faça 3 vezes)",
         ("Chave DIP: via 3 ABERTA (OFF). Se mexeu nela, rode antes 'python t.py reiniciar'.",
          CENTERED_IN_CELL, "Célula D4, frente virada para C4. A borda do labirinto fica à ESQUERDA do robô.",
          "O robô vai correr sozinho até A1 (~40 s). Fique pronto: Ctrl+C nesta janela manda parar."),
         _race_step(),
         "12 passos na ordem esperada, 'SUCESSO', nenhuma passagem para fora, nenhum arco repetido, para em A1.",
         lambda lines: check_race(lines, True, 12, FROM_D4_SEQUENCE, "aberta"),
         questions=(free_text("parou_em", "Em que célula o robô parou?", expected="A1"),
                    number("batidas", "Quantas vezes encostou numa parede? (0 se nenhuma)", 0, 0)),
         moves=True, repeat=3),
    Test("D2", "Corrida completa a partir de D1 (faça 3 vezes)",
         ("Chave DIP: via 3 FECHADA (ON). Depois de mexer nela, rode 'python t.py reiniciar'.",
          CENTERED_IN_CELL, "Célula D1, frente virada para C1. A borda do labirinto fica à DIREITA do robô.",
          "O robô vai até A1, volta DE RÉ duas células e segue até A4 (~40 s)."),
         _race_step(),
         "10 passos na ordem esperada, com duas rés e nenhum giro de 180 graus, 'SUCESSO', para em A4.",
         lambda lines: check_race(lines, True, 10, FROM_D1_SEQUENCE, "fechada") + [
             Check.judge(not contains(lines, "alvo=180"), "nenhum giro de 180 graus")],
         questions=_race_questions("A4"),
         moves=True, repeat=3),
    Test("D3", "Corrida a partir de A4",
         (VIA3_OPEN_RESTART_HINT, CENTERED_IN_CELL, "Célula A4, frente virada para A3.", "O robô deve chegar a D1."),
         _race_step(),
         "'SUCESSO', para em D1.",
         lambda lines: check_race(lines, True, None, None, "aberta"),
         questions=_race_questions("D1"),
         moves=True),
    Test("D4", "Corrida a partir de A1",
         (VIA3_OPEN_RESTART_HINT, CENTERED_IN_CELL, "Célula A1, frente virada para B1.", "O robô deve chegar a D4."),
         _race_step(),
         "'SUCESSO', para em D4.",
         lambda lines: check_race(lines, True, None, None, "aberta"),
         questions=_race_questions("D4"),
         moves=True),
    Test("D5", "Via 3 errada em A4 (tem de recusar a largada)",
         ("Chave DIP: via 3 FECHADA (ON), ERRADA de propósito. Rode 'python t.py reiniciar' depois de mexer.",
          CENTERED_IN_CELL, "Célula A4, frente virada para A3.", "O robô NÃO deve andar."),
         (Step("largar", RACE_END, timeout=30, settle=1.5),),
         "'largada recusada: sem parede a direita do robo'; as rodas não giram.",
         lambda lines: [Check.judge(contains(lines, "largada recusada: sem parede a direita"), "largada recusada")],
         questions=(yes_no("rodas_paradas", "As rodas ficaram PARADAS?", expected=YES),),
         ends_in_error=True),
    Test("D6", "Via 3 errada em D1 (o robô percebe e o teste freia sozinho)",
         ("Chave DIP: via 3 ABERTA (OFF), ERRADA de propósito para esta célula. 'python t.py reiniciar' se "
          "mexeu.",
          CENTERED_IN_CELL, "Célula D1, frente virada para C1.",
          "O robô vai andar 1 ou 2 células e o programa manda parar sozinho. Fique por perto."),
         _race_step(timeout=60),
         "No log, 'fora=' sai de 0 e a corrida termina em FALHA (parada pelo programa).",
         lambda lines: [Check.judge(bool(find_matches(lines, r"nav: passo \d+: .* fora=[1-9]")),
                                    "o robô viu a passagem para fora"),
                        _ended_in_failure(lines)],
         moves=True, watcher_factory=stop_when_outside_maze, ends_in_error=True),
    Test("D7", "Parar no meio da corrida",
         (VIA3_OPEN_RESTART_HINT, CENTERED_IN_CELL, "Célula D4, frente virada para C4.",
          "O programa manda 'parar' sozinho no meio da 2ª reta. O robô tem de frear na hora."),
         _race_step(timeout=60),
         "O robô freia e o log diz 'parado pelo operador'.",
         lambda lines: [Check.judge(contains(lines, "parado pelo operador"), "parou pelo comando"),
                        _ended_in_failure(lines)],
         questions=(yes_no("freou", "O robô freou na hora, sem bater?", expected=YES),),
         moves=True, watcher_factory=stop_during_second_straight, ends_in_error=True),
)
