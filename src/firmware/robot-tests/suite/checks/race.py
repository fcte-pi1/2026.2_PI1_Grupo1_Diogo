"""Conferências de uma corrida no labirinto."""

from ..log_parsing import find_matches
from ..verdict import Check, Verdict
from .motion import check_loop
from .sensors import check_health

RACE_END = r"nav: mapa l3 "

_RACE_START = r"largada \d+: labirinto (\d+)x(\d+), via 3 (?P<via3>\w+) "
_RACE_SUMMARY = (r"fim da corrida \d+: (?P<outcome>\w+), (?P<steps>\d+) passos, (\d+) celulas, "
                 r"posicao \(l(?P<row>\d+),c(?P<col>\d+)\) rumo (\w), passagens para fora=(?P<outside>\d+), "
                 r"eventos perdidos=(?P<lost_events>\d+), linhas de log perdidas=(?P<lost_lines>\d+)")
# Reta contínua (20/11): um passo que andou várias células traz " (N celulas)" depois da ação.
_NAV_STEP = (r"nav: passo \d+: cel \(l(?P<row>\d+),c(?P<col>\d+)\) .* acao=(?P<action>[a-z ]+?)"
             r"(?: \((?P<cells>\d+) celulas\))?(?: \(|-> | ->)")
_MOVEMENT_SUMMARY = (r"movimento: (?P<repeated_arcs>\d+) arco\(s\) repetido\(s\), "
                     r"(\d+) parada\(s\) pela parede da frente, (\d+) leitura")

ExpectedStep = tuple[str, str]  # (célula "l3,c0", ação "frente")


def check_race(lines: list[str], expect_success: bool = True, expected_steps: int | None = None,
               expected_sequence: list[ExpectedStep] | None = None,
               expected_via3: str | None = None) -> list[Check]:
    checks: list[Check] = []
    start = find_matches(lines, _RACE_START)
    if expected_via3 and start:
        checks.append(_via3_check(start[-1]["via3"].lower(), expected_via3))
    summary = find_matches(lines, _RACE_SUMMARY)
    if not summary:
        return checks + [Check.failed("a corrida não terminou no log (sem 'fim da corrida')")]
    last = summary[-1]
    checks.append(Check.judge(
        (last["outcome"] == "SUCESSO") == expect_success,
        f"fim da corrida: {last['outcome']}, {last['steps']} passos, posição (l{last['row']},c{last['col']})"))
    if expect_success:
        checks.append(Check.judge(last["outside"] == "0", f"passagens para fora = {last['outside']} (tem de ser 0)"))
        checks.append(Check.judge(last["lost_events"] == "0" and last["lost_lines"] == "0",
                                  f"perdidos: {last['lost_events']} eventos, {last['lost_lines']} linhas de log"))
    if expected_steps is not None:
        # Com a reta contínua, um passo pode andar várias células: conta como os passos célula a célula.
        extra = _extra_cells(lines)
        cell_steps = int(last["steps"]) + extra
        checks.append(Check.judge(cell_steps == expected_steps,
                                  f"{cell_steps} passos célula a célula (esperado {expected_steps}"
                                  + (f"; {last['steps']} passos com a reta contínua)" if extra else ")")))
    if expected_sequence:
        checks.append(_sequence_check(lines, expected_sequence))
    movement = find_matches(lines, _MOVEMENT_SUMMARY)
    if movement and expect_success:
        repeated = movement[-1]["repeated_arcs"]
        checks.append(Check.judge(repeated == "0", f"arcos repetidos: {repeated} (meta 0)"))
    if expect_success:
        # Só o que não passou: o resumo completo já aparece nos testes de hardware.
        checks += [check for check in check_health(lines) + check_loop(lines) if check.status != Verdict.PASSED]
    return checks


def _via3_check(seen: str, expected: str) -> Check:
    return Check.judge(
        seen == expected, f"via 3 lida pelo robô: {seen} (o teste pede {expected})",
        f"VIA 3 ERRADA: o robô leu {seen} e o teste pede {expected}. Ajuste a chave, rode "
        "'python t.py reiniciar' e repita. Este resultado NÃO vale")


def _extra_cells(lines: list[str]) -> int:
    return sum(int(match["cells"]) - 1 for match in find_matches(lines, _NAV_STEP) if match["cells"])


def _sequence_check(lines: list[str], expected: list[ExpectedStep]) -> Check:
    seen = [(f"l{match['row']},c{match['col']}", match["action"].strip(), int(match["cells"] or 1))
            for match in find_matches(lines, _NAV_STEP)]
    seen = [step for step in seen if step[1] != "chegou"]
    # Um passo de N células cobre N passos esperados: o primeiro (célula e ação) e mais N-1 'frente'.
    wrong: list[str] = []
    index = 0
    for cell, action, cells in seen:
        if index >= len(expected):
            break
        if expected[index] != (cell, action):
            wrong.append(f"passo {index + 1}: esperado {expected[index]}, veio {(cell, action)}")
        for offset in range(1, cells):
            if index + offset < len(expected) and expected[index + offset][1] != "frente":
                wrong.append(f"passo {index + offset + 1}: esperado {expected[index + offset]}, "
                             f"o robô passou reto (trecho de {cells} células)")
        index += cells
    in_order = not wrong and index >= len(expected)
    return Check.judge(in_order, f"os {len(expected)} passos na ordem esperada",
                       f"passos fora da ordem ({len(seen)} vistos): {wrong[:3]}")
