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


def check_turn(lines: list[str], need_ok: bool = True, max_ms: int = 2500) -> list[Check]:
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
    # Freio suave (19/11): o arco anda a 54 graus/s, bem mais lento que o limite antigo de 1500 ms.
    return check_turn(lines, max_ms=ARC_MAX_MS) + check_maneuver_ok(lines) + check_no_second_arc_attempt(lines)


def check_turn_after_wall_approach(lines: list[str]) -> list[Check]:
    """Curva com ajuste prévio da distância à parede da frente."""
    return check_arc_start(lines) + check_full_turn(lines)


# Freio suave (19/11): reta de uma célula ~2,0 s de perfil + 0,25 s para assentar; arco com recuos ~4 s.
STRAIGHT_TIME_RANGE_MS = (1800, 2900)
ARC_MAX_MS = 6000


def check_straight_times(lines: list[str], name: str, count: int,
                         time_range_ms: tuple[int, int] = STRAIGHT_TIME_RANGE_MS) -> list[Check]:
    """Tempo de cada reta de uma célula: confere a velocidade e a frenagem suave."""
    low, high = time_range_ms
    times = find_matches(lines, rf"reta: {name} .*?tempo=(?P<took>\d+) ms")
    checks = [Check.judge(len(times) >= count, f"{len(times)} de {count} retas '{name}' com tempo no log")]
    for index, match in enumerate(times, 1):
        took = int(match["took"])
        checks.append(Check.passed_or_review(low <= took <= high, f"reta {index}: {took} ms (esperado {low} a {high})"))
    return checks


def check_lateral_pose(lines: list[str]) -> list[Check]:
    """Centralização (RF-44): a linha 'pose lateral' mostra o erro do eixo e a correção aplicada."""
    poses = find_matches(lines, r"pose lateral: eixo (?P<axis>-?[\d.]+) mm .*correcao (?P<fix>-?[\d.]+) mm")
    if not poses:
        return [Check.failed("nenhuma linha 'reta: pose lateral' no log (centralizar=1 e parede dos dois lados?)")]
    axes = [abs(float(match["axis"])) for match in poses]
    checks = [Check.info("erro do eixo a cada reta (mm): " + ", ".join(f"{value:.1f}" for value in axes)),
              Check.passed_or_review(axes[-1] <= 15.0, f"erro final do eixo {axes[-1]:.1f} mm (meta: até 15 mm)")]
    if len(axes) >= 3:
        checks.append(Check.passed_or_review(axes[-1] <= axes[0] + 3.0,
                                             f"o erro não cresceu: {axes[0]:.1f} -> {axes[-1]:.1f} mm"))
    return checks


def check_log_lines(lines: list[str], pattern: str, description: str, minimum: int = 1) -> list[Check]:
    """Confere que o log tem pelo menos `minimum` linhas da malha nova (prova de que ela rodou)."""
    found = find_matches(lines, pattern)
    return [Check.judge(len(found) >= minimum, f"{len(found)} linha(s) '{description}' (mínimo {minimum})"),
            *(Check.info(match.group(0)[-110:]) for match in found[:3])]


def check_no_power_reset(lines: list[str]) -> list[Check]:
    """Nenhuma reinicialização de energia durante o teste (BROWNOUT ou queda)."""
    return [Check.judge(not any("BROWNOUT" in line or "reset=LIGOU" in line for line in lines),
                        "sem BROWNOUT nem reinício de energia")]


def check_continuous_run(lines: list[str], cells: int, pulses_per_cell: int = 511, tolerance: int = 25) -> list[Check]:
    """E15: o trecho de `cells` células saiu num movimento só e chegou ao fim."""
    summary = find_matches(lines, rf"trecho continuo: (?P<moved>\d+) de {cells} celulas")
    straight = find_matches(lines, rf"reta: trecho de {cells} celulas (-?\d+) mm: enc E=(?P<left>-?\d+) D=(?P<right>-?\d+) "
                                   r".*?tempo=(?P<took>\d+) ms .*?giro=(?P<gyro>-?[\d.]+)")
    checks = [Check.judge(bool(summary) and int(summary[-1]["moved"]) == cells,
                          f"trecho contínuo: {summary[-1]['moved'] if summary else '?'} de {cells} células")]
    if straight:
        last = straight[-1]
        expected = cells * pulses_per_cell
        left, right = int(last["left"]), int(last["right"])
        checks.append(Check.judge(abs(left - expected) <= tolerance and abs(right - expected) <= tolerance,
                                  f"pulsos E={left} D={right} (esperado {expected} ± {tolerance})"))
        checks.append(Check.judge(abs(float(last["gyro"])) < 3.0, f"giro={last['gyro']} graus (limite 3)"))
        checks.append(Check.info(f"tempo do trecho: {last['took']} ms (3 células paradas uma a uma: ~6,9 s)"))
    else:
        checks.append(Check.failed(f"sem a linha 'reta: trecho de {cells} celulas' no log"))
    return checks


def speed_runs(lines: list[str]) -> list[list[int]]:
    """Velocidades (mm/s, a cada 50 ms) de cada reta do log, na ordem. Cada reta começa no bloco '[0]'."""
    runs: list[list[int]] = []
    for match in find_matches(lines, r"vel 50ms \(mm/s\) \[(?P<start>\d+)\]:(?P<values>(?: -?\d+)+)"):
        values = [int(v) for v in match["values"].split()]
        if int(match["start"]) == 0 or not runs:
            runs.append([])
        runs[-1].extend(values)
    return runs


def check_clean_motion(lines: list[str], run_index: int = 0, cruise_mm_s: float = 120.0) -> list[Check]:
    """O movimento é contínuo e limpo? Na parte de cruzeiro (fora dos 80 mm de cada ponta) a velocidade tem de
    ficar perto do cruzeiro, sem paradas nem trancos."""
    runs = speed_runs(lines)
    if len(runs) <= run_index:
        return [Check.failed("sem o registro 'vel 50ms' da reta no log (firmware antigo, ou o log não chegou)")]
    speeds = runs[run_index]
    distance = sum(abs(v) * 0.05 for v in speeds)
    position, cruise = 0.0, []
    for speed in speeds:
        position += abs(speed) * 0.05
        if 80.0 < position < distance - 80.0:
            cruise.append(abs(speed))
    if len(cruise) < 4:
        return [Check.info(f"trecho curto demais para medir o cruzeiro ({distance:.0f} mm)")]
    mean = sum(cruise) / len(cruise)
    spread = (sum((v - mean) ** 2 for v in cruise) / len(cruise)) ** 0.5
    slow = sum(1 for v in cruise if v < 0.6 * cruise_mm_s)
    checks = [Check.info("velocidade a cada 50 ms (mm/s): " + " ".join(str(v) for v in speeds[:60])),
              Check.passed_or_review(min(cruise) >= 0.7 * cruise_mm_s,
                                     f"cruzeiro: mínimo {min(cruise)} mm/s (esperado ~{cruise_mm_s:.0f}, mínimo aceito "
                                     f"{0.7 * cruise_mm_s:.0f})"),
              Check.passed_or_review(spread <= 0.1 * cruise_mm_s,
                                     f"cruzeiro: média {mean:.0f} mm/s, desvio {spread:.1f} (limite {0.1 * cruise_mm_s:.0f})"),
              Check.passed_or_review(slow == 0, f"{slow} amostra(s) de 50 ms abaixo de 60% do cruzeiro no meio do trecho")]
    return checks


def _series(lines: list[str], title: str) -> list[list[int]]:
    runs: list[list[int]] = []
    for match in find_matches(lines, rf"{title} \[(?P<start>\d+)\]:(?P<values>(?: -?\d+)+)"):
        values = [int(v) for v in match["values"].split()]
        if int(match["start"]) == 0 or not runs:
            runs.append([])
        runs[-1].extend(values)
    return runs


def check_tof_centering(lines: list[str], run_index: int = 0) -> list[Check]:
    """Por que a centralização não segura o robô no meio? Mostra, por reta, o que cada ToF lateral leu (a cada
    50 ms), quantas vezes ele alterna entre válido e inválido, os saltos entre leituras, a largura do corredor e o
    erro lateral estimado."""
    left_runs, right_runs = _series(lines, "tof E 50ms \\(mm\\)"), _series(lines, "tof D 50ms \\(mm\\)")
    pose_runs, term_runs = _series(lines, "pose 50ms \\(mm\\*10\\)"), _series(lines, "termo 50ms \\(mm\\*10\\)")
    if len(left_runs) <= run_index or len(right_runs) <= run_index:
        return [Check.failed("sem o registro 'tof E/D 50ms' da reta no log (firmware antigo)")]
    left, right = left_runs[run_index], right_runs[run_index]
    pose = pose_runs[run_index] if len(pose_runs) > run_index else []
    term = term_runs[run_index] if len(term_runs) > run_index else []
    checks: list[Check] = []
    for name, data in (("esquerdo", left), ("direito", right)):
        valid = [v for v in data if v >= 0]
        flips = sum(1 for a, b in zip(data, data[1:]) if (a >= 0) != (b >= 0))
        jumps = [abs(b - a) for a, b in zip(data, data[1:]) if a >= 0 and b >= 0]
        big = sum(1 for j in jumps if j >= 8)
        if not valid:
            checks.append(Check.failed(f"ToF {name}: nenhuma leitura válida na reta"))
            continue
        checks.append(Check.info(
            f"ToF {name}: {len(valid)} de {len(data)} leituras válidas, min {min(valid)} máx {max(valid)} mm, "
            f"{flips} alternância(s) válido/inválido, {big} salto(s) de 8 mm ou mais entre leituras"))
        checks.append(Check.passed_or_review(flips <= 2, f"ToF {name}: {flips} alternância(s) entre válido e inválido (meta: até 2)"))
        checks.append(Check.passed_or_review(big <= 3, f"ToF {name}: {big} salto(s) de 8 mm ou mais (meta: até 3)"))
    both = [(a, b) for a, b in zip(left, right) if a >= 0 and b >= 0]
    if both:
        widths = [a + b + 101 for a, b in both]
        checks.append(Check.info(f"corredor medido (E + D + 101): {min(widths)} a {max(widths)} mm, média "
                                 f"{sum(widths) / len(widths):.0f} mm (a chave largura_corredor deve ficar perto)"))
    if pose:
        checks.append(Check.info(f"erro lateral estimado (mm, + = direita): de {min(pose) / 10:.1f} a {max(pose) / 10:.1f}, "
                                 f"no fim {pose[-1] / 10:.1f}"))
        checks.append(Check.passed_or_review(abs(pose[-1]) <= 100, f"erro lateral no fim: {pose[-1] / 10:.1f} mm (meta: até 10)"))
    if term:
        checks.append(Check.info(f"termo da parede aplicado (mm): de {min(term) / 10:.1f} a {max(term) / 10:.1f}"))
    return checks
