"""Conferências de movimento: retas, curvas, arco e manobras."""

from ..log_parsing import contains, find_matches
from ..verdict import Check

MANEUVER_END = r"teste: manobra "

LOOP_MEAN_LIMIT_MS = 4.0
MAX_ISOLATED_TOF_ERRORS = 2
ARC_START_RANGE_MM = (100, 110)

_LOOP_LINE = (r"reta: laco: (?P<laps>\d+) voltas, media (?P<mean>[\d.]+) ms, pior (?P<worst>[\d.]+) ms \| "
              r"tof na reta: erros I2C E=(?P<err_l>\d+) F=(?P<err_f>\d+) D=(?P<err_r>\d+), "
              r"pulou E=(?P<skip_l>\d+) F=(?P<skip_f>\d+) D=(?P<skip_r>\d+)")
_TURN_LINE = (r"curva: alvo=(?P<target>\d+) parou=(-?[\d.]+) final=(?P<final>-?[\d.]+) tempo=(?P<took>\d+) ms .* "
              r"continuou=(?P<continued>\w+) giro perdido=(\d+) (?P<outcome>.*)$")
_ARC_START = (r"inicio do arco: alvo (?P<target>\d+) mm, frontal (-?\d+) mm na parada, "
              r"(?P<after>-?\d+) mm depois do recuo")


def check_loop(lines: list[str]) -> list[Check]:
    """A linha "laco" de cada reta: laço rápido e nenhum erro de ToF durante o movimento."""
    checks = []
    loops = find_matches(lines, _LOOP_LINE)
    for match in loops:
        mean = float(match["mean"])
        errors = sum(int(match[key]) for key in ("err_l", "err_f", "err_r"))
        skipped = sum(int(match[key]) for key in ("skip_l", "skip_f", "skip_r"))
        tof_summary = match.group(0).split("|")[1].strip()
        checks.append(Check.judge(mean < LOOP_MEAN_LIMIT_MS, f"laço da reta: média {mean} ms (limite 4,0)"))
        if skipped or errors > MAX_ISOLATED_TOF_ERRORS:
            checks.append(Check.failed(f"ToF falhou durante a reta: {tof_summary}"))
        elif errors:
            checks.append(Check.review(f"erro isolado de ToF na reta: {tof_summary}"))
    if not loops and find_matches(lines, r"reta: "):
        checks.append(Check.review("a linha 'reta: laco' não chegou (linha perdida, ou firmware antigo)"))
    return checks


def check_straights(lines: list[str], name: str, count: int, expected_pulses: int,
                    pulse_tolerance: int = 15, max_gyro_deg: float = 3.0) -> list[Check]:
    straights = find_matches(
        lines, rf"reta: {name} (-?\d+) mm: enc E=(?P<left>-?\d+) D=(?P<right>-?\d+) .*? "
               rf"giro=(?P<gyro>-?[\d.]+) .* (\S.*)$")
    checks = [Check.judge(len(straights) == count, f"{len(straights)} de {count} retas '{name}' no log")]
    for index, match in enumerate(straights, 1):
        left, right, gyro = int(match["left"]), int(match["right"]), float(match["gyro"])
        finished_ok = match.group(0).rstrip().endswith(" ok")
        checks.append(Check.judge(finished_ok, f"reta {index}: terminou ok",
                                  f"reta {index}: NÃO terminou ok: {match.group(0)[-60:]}"))
        in_range = (abs(left - expected_pulses) <= pulse_tolerance
                    and abs(right - expected_pulses) <= pulse_tolerance)
        checks.append(Check.judge(in_range, f"reta {index}: pulsos E={left} D={right} "
                                            f"(esperado {expected_pulses} ± {pulse_tolerance})"))
        checks.append(Check.judge(abs(gyro) < max_gyro_deg,
                                  f"reta {index}: giro={gyro} graus (limite {max_gyro_deg})"))
    return checks + check_loop(lines)


def check_turn(lines: list[str], need_ok: bool = True, max_ms: int = 1500) -> list[Check]:
    turns = find_matches(lines, _TURN_LINE)
    if not turns:
        return [Check.failed("nenhuma linha 'curva: alvo=' no log")]
    last = turns[-1]
    checks = []
    if need_ok:
        outcome = last["outcome"].strip()
        checks.append(Check.judge(outcome == "ok", f"curva terminou ok (final={last['final']} graus)",
                                  f"curva NÃO terminou ok: {outcome}"))
    took = int(last["took"])
    checks.append(Check.passed_or_review(took < max_ms, f"tempo da curva: {took} ms (meta: menos de {max_ms})"))
    if last["continued"] == "sim":
        checks.append(Check.info("a curva emperrou perto do fim e o firmware insistiu (continuou=sim): anote"))
    trace = find_matches(lines, r"curva: angulo a cada 100 ms: (.*)$")
    if trace:
        checks.append(Check.info("ângulo a cada 100 ms: " + trace[-1].group(1)))
    return checks


def check_maneuver_ok(lines: list[str], count: int = 1) -> list[Check]:
    maneuvers = find_matches(lines, r"teste: manobra (.+?): (?P<outcome>.*)$")
    good = [match for match in maneuvers if match["outcome"].strip() == "ok"]
    bad = [match.group(0) for match in maneuvers if match["outcome"].strip() != "ok"]
    return [Check.judge(len(good) >= count, f"{len(good)} de {count} manobra(s) terminaram ok",
                        f"manobra falhou: {bad[:2]}")]


def check_arc_start(lines: list[str]) -> list[Check]:
    starts = find_matches(lines, _ARC_START)
    if not starts:
        return [Check.failed("sem a linha 'inicio do arco: alvo ...' (o robô não viu a parede da frente?)")]
    low, high = ARC_START_RANGE_MM
    after = int(starts[-1]["after"])
    return [Check.passed_or_review(
        low <= after <= high,
        f"arco começou com o frontal a {after} mm da parede (alvo {starts[-1]['target']}; esperado {low} a {high})")]


def check_no_second_arc_attempt(lines: list[str]) -> list[Check]:
    return [Check.judge(not contains(lines, "tentativa 2 do arco"), "sem tentativa 2 do arco")]


def check_full_turn(lines: list[str]) -> list[Check]:
    """Curva completa que termina ok, sem segunda tentativa."""
    return check_turn(lines) + check_maneuver_ok(lines) + check_no_second_arc_attempt(lines)


def check_turn_after_wall_approach(lines: list[str]) -> list[Check]:
    """Curva com ajuste prévio da distância à parede da frente."""
    return check_arc_start(lines) + check_full_turn(lines)
