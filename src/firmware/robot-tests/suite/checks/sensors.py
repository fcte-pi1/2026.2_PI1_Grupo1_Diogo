"""Conferências de sensores e atuadores: ToF, giroscópio, encoders, rodas, motor, saúde e firmware."""

import re
from pathlib import Path

from ..git_info import short_commit
from ..log_parsing import find_matches
from ..verdict import Check

RESET_PROBLEMS = re.compile("BROWNOUT|PANICO|WATCHDOG")
MIN_BATTERY_V = 7.0
MIN_BATTERY_UNDER_LOAD_V = 6.5
MAX_ISOLATED_I2C_ERRORS = 5
ENCODER_ONE_TURN_RANGE = (225, 345)
GYRO_READINGS_EXPECTED = 7
GYRO_MAX_SPREAD = 3.0
GYRO_MAX_BIAS = 25.0
TOF_CALIBRATION_TOLERANCE_MM = 10
TOF_ROWS = 5

_HEALTH_1 = (r"saude 1/2: ligado ha (\d+) s, reset=(?P<reset>.+?), bat=(?P<battery>[\d.]+) V.*ble perdidos: "
             r"linhas=(?P<lost_lines>\d+) eventos=(?P<lost_events>\d+) pedacos=(?P<lost_chunks>\d+)")
_HEALTH_2 = (r"saude 2/2: i2c erros tof E=(?P<i2c_l>\d+) F=(?P<i2c_f>\d+) D=(?P<i2c_r>\d+) "
             r"imu=(?P<imu>\d+) ina=(?P<ina>\d+) .*"
             r"tof quedas E=(?P<drop_l>\d+) F=(?P<drop_f>\d+) D=(?P<drop_r>\d+) \| "
             r"reinicios XSHUT E=(?P<rst_l>\d+) F=(?P<rst_f>\d+) D=(?P<rst_r>\d+) "
             r"\(falhos (?P<bad_l>\d+)/(?P<bad_f>\d+)/(?P<bad_r>\d+)\)")
_GYRO_AT_REST = (r"giroscopio em repouso: (?P<mean>-?[\d.]+) graus/s \(media de (\d+) leituras\) "
                 r"min (?P<low>-?[\d.]+) max (?P<high>-?[\d.]+), (?P<lost>\d+) perdidas, "
                 r"temp (?P<temp>-?[\d.]+) C, ligado ha (?P<uptime>\d+) s")
_TOF_MONITOR_SENSOR = (r"tofmon fim (?P<sensor>[EFD]): (?P<n>\d+) medidas: ok=(\d+) falha=(?P<fails>\d+) .*"
                       r"media=(?P<mean>-?[\d.]+) min=(?P<low>-?\d+) max=(?P<high>-?\d+)")
_TOF_ROW = (r"tof (\d)/5: E=(?P<left>-?\d+) \((.*?)\) F=(?P<front>-?\d+) \((.*?)\) "
            r"D=(?P<right>-?\d+) \((.*?)\)")
_TOF_STABLE_ROW = r"tof [2-5]/5: E=(?P<left>-?\d+) \(.*?\) F=(?P<front>-?\d+) \(.*?\) D=(?P<right>-?\d+) \("


def check_health(lines: list[str]) -> list[Check]:
    """As duas linhas do `saude`: tudo zero."""
    first, second = find_matches(lines, _HEALTH_1), find_matches(lines, _HEALTH_2)
    if not first or not second:
        return [Check.review("as linhas 'saude' não chegaram")]
    general, counters = first[-1], second[-1]
    lost = [int(general[key]) for key in ("lost_lines", "lost_events", "lost_chunks")]
    drops = [int(counters[key]) for key in ("drop_l", "drop_f", "drop_r", "rst_l", "rst_f", "rst_r",
                                            "bad_l", "bad_f", "bad_r")]
    return [
        Check.judge(not RESET_PROBLEMS.search(general["reset"]), f"motivo do último reset: {general['reset']}"),
        Check.judge(float(general["battery"]) >= MIN_BATTERY_V, f"bateria {general['battery']} V (mínimo 7,0)"),
        Check.judge(sum(lost) == 0, f"BLE perdidos: linhas={lost[0]} eventos={lost[1]} pedaços={lost[2]}"),
        _i2c_check(counters),
        Check.judge(sum(drops) == 0,
                    f"ToF: quedas {drops[0]}/{drops[1]}/{drops[2]}, reinícios {drops[3]}/{drops[4]}/{drops[5]}, "
                    f"reinícios falhos {drops[6]}/{drops[7]}/{drops[8]} (E/F/D)"),
    ]


def _i2c_check(counters: re.Match[str]) -> Check:
    errors = [int(counters[key]) for key in ("i2c_l", "i2c_f", "i2c_r", "imu", "ina")]
    text = (f"erros de I2C desde que ligou: ToF E={errors[0]} F={errors[1]} D={errors[2]} "
            f"IMU={errors[3]} INA={errors[4]}")
    total = sum(errors)
    if total == 0:
        return Check.passed(text)
    if total <= MAX_ISOLATED_I2C_ERRORS:
        return Check.review(text + " (erros isolados: anote e siga)")
    return Check.failed(text + " (mais de 5: um sensor está falhando)")


def check_firmware_diagnostic(lines: list[str], firmware_dir: Path) -> list[Check]:
    end = find_matches(lines, r"diag: fim: (.*)$")
    if not end:
        return [Check.failed("o diag não terminou (sem a linha 'diag: fim')")]
    summary = end[-1].group(1)
    checks = [Check.judge(summary.startswith("OK"), "diag: fim: OK", f"diag: fim: {summary}")]
    version = find_matches(lines, r"diag: firmware: versao (?P<flashed>\S+), compilado em (?P<built>.+?), IDF")
    if version:
        checks.append(_firmware_version_check(version[-1]["flashed"], version[-1]["built"],
                                              short_commit(firmware_dir)))
    return checks


def _firmware_version_check(flashed: str, built_at: str, commit: str) -> Check:
    text = f"firmware gravado: versão {flashed}, compilado em {built_at}"
    # A versão vem do git na hora da compilação. Com "-dirty" havia mudança ainda sem commit:
    # é o normal quando o código novo foi só copiado para a pasta. A prova de que o firmware é
    # o que acabou de ser compilado é a DATA E HORA da compilação.
    if commit and commit[:7] in flashed:
        note = " (com mudanças ainda sem commit, o normal para código copiado)" if "dirty" in flashed else ""
        return Check.passed(text + f"; base do repositório {commit}{note}. Confira que a data e a hora "
                            "são as da compilação que você acabou de fazer")
    return Check.review(text + f"; o repositório está em {commit or '(não consegui ler)'}. Se a data e a "
                        "hora não forem as da sua compilação, o robô está com outro firmware: compile e grave "
                        "de novo")


def check_tof_monitor(lines: list[str]) -> list[Check]:
    end = find_matches(lines, r"tofmon fim: (\d+) rodadas .* -> (?P<verdict>.*)$")
    if not end:
        return [Check.failed("o tofmon não terminou")]
    checks = [Check.judge(end[-1]["verdict"].startswith("OK"), f"tofmon: {end[-1]['verdict']}")]
    for match in find_matches(lines, _TOF_MONITOR_SENSOR):
        checks.append(Check.info(f"ToF {match['sensor']}: {match['n']} medidas, {match['fails']} falhas, "
                                 f"média {match['mean']} mm ({match['low']} a {match['high']})"))
    return checks


def check_tof_calibration(lines: list[str], sensor_letter: str, sensor_name: str,
                          real_mm: int) -> list[Check]:
    checks = check_tof_monitor(lines)
    summary = find_matches(lines, rf"tofmon fim {sensor_letter}: .*ok=(?P<ok>\d+) falha=(\d+) .*"
                                  rf"media=(?P<mean>-?[\d.]+)")
    if not summary or int(summary[-1]["ok"]) == 0:
        return checks + [Check.failed(f"o ToF {sensor_name} não deu nenhuma medida válida")]
    value = float(summary[-1]["mean"])
    error = value - real_mm
    return checks + [Check.passed_or_review(
        abs(error) <= TOF_CALIBRATION_TOLERANCE_MM,
        f"ToF {sensor_name} a {real_mm} mm reais: leu {value:.1f} mm, erro {error:+.1f} mm "
        f"(meta ±{TOF_CALIBRATION_TOLERANCE_MM})")]


def check_gyro_series(lines: list[str]) -> list[Check]:
    readings = find_matches(lines, _GYRO_AT_REST)
    checks = [Check.judge(len(readings) >= GYRO_READINGS_EXPECTED,
                          f"{len(readings)} de {GYRO_READINGS_EXPECTED} leituras do giroscópio")]
    for match in readings:
        mean, spread = float(match["mean"]), float(match["high"]) - float(match["low"])
        steady = spread <= GYRO_MAX_SPREAD and int(match["lost"]) == 0
        checks.append(Check.judge(
            steady,
            f"aos {match['uptime']} s: média {mean:+.3f} graus/s, variação {spread:.2f} "
            f"(limite 3,0), temp {match['temp']} C",
            f"aos {match['uptime']} s: média {mean:+.3f}, variação {spread:.2f} > 3,0 ou leituras "
            "perdidas: o robô se mexeu, ou o sensor está ruim"))
    if readings:
        means = [float(match["mean"]) for match in readings]
        checks.append(Check.judge(max(abs(value) for value in means) <= GYRO_MAX_BIAS,
                                  f"desvio entre {min(means):+.2f} e {max(means):+.2f} graus/s (limite ±25)"))
        checks.append(Check.info(f"mudança do desvio nos 3 min: {max(means) - min(means):.2f} graus/s "
                                 "(o firmware desconta o desvio; anote para a equipe)"))
    return checks


def check_encoders(lines: list[str]) -> list[Check]:
    end = find_matches(lines, r"enc fim: E=(?P<left>-?\d+) D=(?P<right>-?\d+)")
    if not end:
        return [Check.failed("o enc não terminou")]
    low, high = ENCODER_ONE_TURN_RANGE
    left, right = int(end[-1]["left"]), int(end[-1]["right"])
    return [Check.judge(low <= left <= high,
                        f"roda esquerda: {left} pulsos (uma volta para a frente = +285, aceito {low} a {high})"),
            Check.judge(low <= right <= high, f"roda direita: {right} pulsos (aceito {low} a {high})")]


def check_wheels(lines: list[str]) -> list[Check]:
    checks = [Check.info(match.group(0)) for match in find_matches(lines, r"rodas: roda [ED] para \w+: .*")]
    end = find_matches(lines, r"rodas: resumo: (.*)$")
    if not end:
        return checks + [Check.failed("o comando rodas não terminou")]
    return checks + [Check.judge("-> OK" in end[-1].group(1), "rodas: " + end[-1].group(1))]


def check_motor(lines: list[str]) -> list[Check]:
    end = find_matches(lines, r"motor fim: .* bateria minima (?P<min_battery>[\d.]+) V")
    if not end:
        return [Check.failed("o teste de motor não terminou (o robô reiniciou?)")]
    lowest = float(end[-1]["min_battery"])
    return [Check.judge(lowest >= MIN_BATTERY_UNDER_LOAD_V,
                        f"bateria mínima com as duas rodas a 6 V: {lowest} V (mínimo 6,5)"),
            Check.info(end[-1].group(0))]


def check_tof_open_space(lines: list[str]) -> list[Check]:
    rows = find_matches(lines, _TOF_ROW)
    faults = [row.group(0) for row in rows if "-1" in (row["left"], row["front"], row["right"])]
    return [Check.judge(len(rows) == TOF_ROWS, f"{len(rows)} de {TOF_ROWS} linhas do tof"),
            Check.judge(not faults, "nenhum sensor em falha (-1)", f"sensor em falha: {faults[:1]}")]


def tof_means(lines: list[str]) -> list[float] | None:
    """Média de [E, F, D] nas linhas 2 a 5 do tof (a 1ª costuma sair com lixo)."""
    rows = find_matches(lines, _TOF_STABLE_ROW)
    if len(rows) < 3:
        return None
    return [sum(int(row[key]) for row in rows) / len(rows) for key in ("left", "front", "right")]


MmRange = tuple[int, int]


def check_tof_in_cell(lines: list[str], front: MmRange, left: MmRange, right: MmRange) -> list[Check]:
    means = tof_means(lines)
    if means is None:
        return [Check.failed("menos de 3 linhas válidas do tof")]
    return [Check.judge(low <= value <= high, f"ToF {name}: média {value:.0f} mm (esperado {low} a {high})")
            for name, value, (low, high) in zip(("esquerdo", "frontal", "direito"), means, (left, front, right))]


def check_tof_too_close(lines: list[str], sensor_letter: str, sensor_name: str, real_mm: int,
                        too_close: bool) -> list[Check]:
    """E1 (P1): colado no sensor, a leitura nunca vira '0 ok'; acima do limite é a distância de verdade."""
    checks = check_tof_monitor(lines)
    summary = find_matches(lines, rf"tofmon fim {sensor_letter}: .*ok=(?P<ok>\d+) falha=(?P<bad>\d+) .*"
                                  rf"media=(?P<mean>-?[\d.]+) min=(?P<low>-?\d+) max=(?P<high>-?\d+)")
    if not summary:
        return checks + [Check.failed(f"sem o resumo do ToF {sensor_name}")]
    ok, low, mean = int(summary[-1]["ok"]), int(summary[-1]["low"]), float(summary[-1]["mean"])
    if too_close:
        checks.append(Check.passed_or_review(
            ok == 0 or low > 0, f"ToF {sensor_name} a {real_mm} mm: ok={ok}, mínimo {low} mm "
                                "(colado, não pode contar '0 mm ok')"))
    else:
        checks.append(Check.passed_or_review(
            ok > 0 and abs(mean - real_mm) <= 15, f"ToF {sensor_name} a {real_mm} mm: ok={ok}, média {mean:.1f} mm "
                                                  "(esperado ±15)"))
    return checks


# Calibração esperada do robô (estado de 20/11): os padrões do firmware, mais as MEDIDAS REAIS lidas das fotos (MEDICOES.md) e os
# ganhos da centralização que funcionaram. Depois de gravar uma versão com chave nova do calib a memória volta ao padrão: reaplique
# com `python t.py calib "eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1
# ganho_rumo=0.6 ganho_parede=3 max_parede=50"`.
EXPECTED_CALIBRATION = {
    "eixo_ate_frente": 100.0, "largura_frente": 112.0, "eixo_ate_tof_frente": 88.0, "largura_com_rodas": 108.0,
    "tof_lado_ao_centro": 55.5, "tof_lado_a_frente_do_eixo": 59.15, "cabo_frente_mm": 0.0, "preset_cad": 0.0,
    "escala_giro": 1.00, "freio_arco": 2.6, "freio_pivo": 4.0, "modo_curva": 0.0, "freio_uma_roda": 2.6,
    "autoajuste_freio": 0.0, "parada_frente": 35.0, "tof_na_reta": 1.0, "rampa_tensao": 50.0, "fusao_rumo": 0.0,
    "reancorar_parede": 0.0, "parada_dinamica": 0.0, "vies_giro": 0.0, "reta_continua": 1.0,
    "largura_corredor": 168.0, "ganho_parede": 3.0, "max_parede": 35.0, "folga_arco": 18.0,
    "arco_esq_atraso": -14.0, "desfazer_tensao_fora": 3.6, "desfazer_tensao_dentro": 2.2,
    "desfazer_tempo": 2.4, "recuo_sem_parede": 90.0, "ajuste_2a_tentativa": 24.0, "trava_frente_ate": 52.0,
    "arco_quase_pronto": 78.0, "ajuste_fino_min": 0.4, "ajuste_fino_max": 15.0, "alvo_lateral_dir_mm": -8.0, "alvo_pos_esq_mm": 0.0, "curva_dir_fora": 8.0, "rumo_max_mm": 6.0,
    "rumo_max_lateral": 8.0, "giro_aberto": 1.0, "lado_aberto_mm": 150.0, "cabo_esq_mm": 10.0, "giro_s_beta_max": 25.0,
    "giro_s_folga": 3.0, "giro_s_incerteza": 10.0, "re_vel": 70.0, "re_acel": 120.0, "bateria_minima": 5.5,
    "centralizar": 1.0, "ganho_rumo": 1.0}
CALIBRATION_MAY_DIFFER: dict[str, float] = {}


def check_calibration_in_use(lines: list[str]) -> list[Check]:
    """E0: o `calib` mostra os valores do firmware novo (a memória antiga pode ter ficado com freios velhos)."""
    shown = {m["name"]: float(m["value"]) for m in find_matches(
        lines, r"calib: (?P<name>\w+) = (?P<value>-?[\d.]+) .*?(padrao|ALTERADO)")}
    checks = [Check.judge(len(shown) >= len(EXPECTED_CALIBRATION),
                          f"{len(shown)} chaves do calib no log (esperado {len(EXPECTED_CALIBRATION)})")]
    for name, expected in EXPECTED_CALIBRATION.items():
        value = shown.get(name)
        checks.append(Check.judge(value is not None and abs(value - expected) < 1e-6,
                                  f"{name} = {value} (esperado {expected})",
                                  f"{name} = {value}: esperado {expected}. Memória antiga? Rode 'calib padrao' e "
                                  "reaplique ganho_rumo e centralizar"))
    for name, usual in CALIBRATION_MAY_DIFFER.items():
        checks.append(Check.info(f"{name} = {shown.get(name)} (valor de reta de 19/11: {usual})"))
    return checks
