"""Métricas de uma corrida livre, para comparar dias, pistas e valores do `calib`."""

import re
from typing import Iterable

from .log_parsing import count_containing, count_matching

TimestampedLine = tuple[int, str]
NO_READING_MM = 9999
LOW_FRONT_STOP_MM = 40

_RACE_START = r"main: largada \d+: labirinto (\d+)x(\d+), via 3 (\w+)"
_RACE_END = (r"main: fim da corrida \d+: (\w+), (\d+) passos, (\d+) celulas, posicao \((l\d+,c\d+)\) "
             r"rumo (\w), passagens para fora=(\d+)")
_HEALTH_COUNTERS = r"saude 2/2: i2c erros tof E=(\d+) F=(\d+) D=(\d+) .*tof quedas E=(\d+) F=(\d+) D=(\d+)"
_CALIB_IN_USE = "main: calib em uso: "


def _first(timestamped: Iterable[TimestampedLine], pattern: str) -> tuple[int | None, re.Match[str] | None]:
    regex = re.compile(pattern)
    for stamp, text in timestamped:
        match = regex.search(text)
        if match:
            return stamp, match
    return None, None


def _numbers(texts: Iterable[str], pattern: str, convert=int) -> list:
    regex = re.compile(pattern)
    return [convert(match.group(1)) for match in (regex.search(text) for text in texts) if match]


def compute_race_metrics(timestamped: list[TimestampedLine]) -> dict[str, object]:
    texts = [text for _, text in timestamped]
    metrics: dict[str, object] = {}
    metrics.update(_outcome_metrics(timestamped))
    metrics.update(_maneuver_metrics(texts))
    metrics.update(_event_counts(texts))
    metrics.update(_health_metrics(texts))
    calib = [text for text in texts if text.startswith(_CALIB_IN_USE)]
    if calib:
        metrics["calib"] = calib[-1].replace(_CALIB_IN_USE, "")
    return metrics


def _outcome_metrics(timestamped: list[TimestampedLine]) -> dict[str, object]:
    metrics: dict[str, object] = {}
    start_ms, start = _first(timestamped, _RACE_START)
    _, end = _first(timestamped, _RACE_END)
    if start:
        metrics["labirinto"] = f"{start.group(1)}x{start.group(2)}"
        metrics["via3"] = start.group(3).lower()
    if end:
        metrics.update(resultado=end.group(1), passos=int(end.group(2)), celulas=int(end.group(3)),
                       posicao_final=end.group(4), fora=int(end.group(6)))
    step_stamps = [stamp for stamp, text in timestamped if text.startswith("nav: passo ")]
    if step_stamps and start_ms is not None:
        metrics["tempo_s"] = round((step_stamps[-1] - start_ms) / 1000.0, 1)
        if len(step_stamps) > 1:
            metrics["s_por_passo"] = round((step_stamps[-1] - step_stamps[0]) / 1000.0 / (len(step_stamps) - 1), 2)
    return metrics


def _maneuver_metrics(texts: list[str]) -> dict[str, object]:
    metrics: dict[str, object] = {
        "curvas": sum(1 for text in texts if text.startswith("curva: alvo=")),
        "ajustes_antes_da_curva": sum(1 for text in texts if text.startswith("reta: ajuste antes da curva")),
    }
    front_stops = _numbers(texts, r"frontal (-?\d+) mm na parada")
    if front_stops:
        metrics["frontal_na_parada_min"] = min(front_stops)
        metrics["frontal_na_parada_abaixo_40"] = sum(1 for value in front_stops if value < LOW_FRONT_STOP_MM)
    turn_finals = [abs(value) for value in
                   _numbers(texts, r"curva: alvo=90 parou=-?[\d.]+ final=(-?[\d.]+)", float)]
    if turn_finals:
        metrics["curva_final_min"] = round(min(turn_finals), 1)
        metrics["curva_final_max"] = round(max(turn_finals), 1)
    straight_gyros = [abs(value) for value in
                      _numbers(texts, r"^reta: (?:andar|re de) .* giro=(-?[\d.]+) ", float)]
    if straight_gyros:
        metrics["reta_giro_max"] = round(max(straight_gyros), 1)
    side_distances = _side_distances_after_turns(texts)
    if side_distances:
        metrics["lateral_pos_curva_min"] = min(side_distances)
    return metrics


def _side_distances_after_turns(texts: list[str]) -> list[int]:
    regex = re.compile(r"tof: depois da curva: E=(-?\d+) .*D=(-?\d+)")
    distances = []
    for match in (regex.search(text) for text in texts):
        if match:
            distances += [int(value) for value in match.groups() if 0 <= int(value) < NO_READING_MM]
    return distances


def _event_counts(texts: list[str]) -> dict[str, int]:
    return {
        "rumo_perdido": count_containing(texts, "rumo perdido"),
        "curva_travada": count_containing(texts, "curva travada"),
        "tentativa2": count_containing(texts, "tentativa 2 do arco"),
        "paradas_pela_frente": count_matching(texts, r"parou antes=[1-9]\d* mm"),
        "mapa_esquecido": count_containing(texts, "(mapa esquecido)"),
        "espera_lado": count_matching(texts, r"acao=(espera|assumiu parede)"),
        "tof_parou": count_matching(texts, r"tof: \w+ PAROU"),
    }


def _health_metrics(texts: list[str]) -> dict[str, int]:
    health = [match for match in (re.search(_HEALTH_COUNTERS, text) for text in texts) if match]
    if not health:
        return {}
    counters = [int(value) for value in health[-1].groups()]
    return {"i2c_erros_tof": sum(counters[:3]), "quedas_tof": sum(counters[3:])}
