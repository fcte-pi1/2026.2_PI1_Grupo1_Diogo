"""Persistência dos resultados: histórico (feitos.json), relatório (RESULTADOS.md) e corridas.csv."""

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

from . import clock
from .git_info import short_commit
from .verdict import Check

AWAITING_OPERATOR_SUFFIX = " (falta a resposta do operador)"
SKIPPED = "PULADO"


@dataclass
class RunRecord:
    time: str
    attempt: int
    verdict: str
    automatic_verdict: str

    @classmethod
    def from_json(cls, data: dict) -> "RunRecord":
        return cls(data["hora"], data["tentativa"], data["veredito"], data.get("automatico", data["veredito"]))

    def to_json(self) -> dict:
        return {"hora": self.time, "tentativa": self.attempt, "veredito": self.verdict,
                "automatico": self.automatic_verdict}


class RunHistory:
    """Tentativas de cada teste ou corrida, guardadas em feitos.json."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def _load(self) -> dict[str, list[dict]]:
        try:
            return json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _save(self, data: dict[str, list[dict]]) -> None:
        self._path.write_text(json.dumps(data, indent=1), encoding="utf-8")

    def runs(self, ident: str) -> list[RunRecord]:
        return [RunRecord.from_json(run) for run in self._load().get(ident, [])]

    def next_attempt(self, ident: str) -> int:
        return len(self._load().get(ident, [])) + 1

    def append(self, ident: str, attempt: int, verdict: str) -> None:
        data = self._load()
        automatic = verdict.replace(AWAITING_OPERATOR_SUFFIX, "")
        data.setdefault(ident, []).append(RunRecord(clock.time_of_day(), attempt, verdict, automatic).to_json())
        self._save(data)

    def replace_last_verdict(self, ident: str, verdict: str) -> None:
        data = self._load()
        data[ident][-1]["veredito"] = verdict
        self._save(data)


class Report:
    """Relatório legível dos testes (RESULTADOS.md), só acrescentado."""

    def __init__(self, path: Path, repo_dir: Path) -> None:
        self._path = path
        self._repo_dir = repo_dir

    def _append(self, text: str) -> None:
        with open(self._path, "a", encoding="utf-8", newline="\n") as out:
            out.write(text)

    def _ensure_header(self) -> None:
        if not self._path.exists():
            self._append(f"# Resultados dos testes do robô (firmware v3)\n\nData: {clock.brazilian_date()}. "
                         f"Repositório em: {short_commit(self._repo_dir) or '?'} (a versão gravada no robô está "
                         "no teste H1).\n\n")

    def add_test_run(self, ident: str, title: str, commands: Iterable[str], attempt: int, verdict: str,
                     checks: Iterable[Check], answers: Mapping[str, object], note: str = "") -> None:
        self._ensure_header()
        lines = [f"## {ident} (tentativa {attempt}) — {verdict} — {clock.time_of_day()}\n",
                 f"{title}. Comando(s): {', '.join(sorted(set(commands)))}.\n"]
        lines += [f"- {check.label}: {check.text}" for check in checks]
        lines += [f"- operador, {key}: {value}" for key, value in answers.items()]
        if note:
            lines.append(f"- observação: {note}")
        self._append("\n".join(lines) + "\n\n")

    def add_operator_answers(self, ident: str, attempt: int, answer_lines: Iterable[str],
                             final_verdict: str) -> None:
        self._append(f"Respostas do operador ao {ident} (tentativa {attempt}), {clock.time_of_day()}:\n\n"
                     + "\n".join(answer_lines) + f"\n- veredito final: {final_verdict}\n\n")

    def add_race(self, label: str, attempt: int, verdict: str, description: str, log_name: str,
                 metrics: Mapping[str, object], rebooted: bool) -> None:
        lines = [f"## {label} (tentativa {attempt}) — corrida — {verdict} — {clock.time_of_day()}\n",
                 f"{description}. Log: {log_name}.\n"]
        lines += [f"- {key}: {value}" for key, value in metrics.items()]
        if rebooted:
            lines.append("- O ROBÔ REINICIOU SOZINHO durante a corrida")
        self._append("\n".join(lines) + "\n\n")

    def add_note(self, ident: str, text: str) -> None:
        self._append(f"- nota sobre o {ident} ({clock.time_of_day()}): {text}\n\n")

    def add_calibration_note(self, text: str) -> None:
        self._append(f"- calibração ({clock.day_month_time()}): {text}\n\n")


RACE_CSV_COLUMNS = [
    "data", "hora", "rotulo", "tentativa", "descricao", "resultado", "labirinto", "via3", "passos",
    "celulas", "tempo_s", "s_por_passo", "curvas", "ajustes_antes_da_curva", "frontal_na_parada_min",
    "frontal_na_parada_abaixo_40", "curva_final_min", "curva_final_max", "reta_giro_max",
    "lateral_pos_curva_min", "rumo_perdido", "curva_travada", "tentativa2", "paradas_pela_frente",
    "mapa_esquecido", "espera_lado", "tof_parou", "i2c_erros_tof", "quedas_tof", "fora",
    "posicao_final", "calib", "log",
]


class RaceTable:
    """Uma linha por corrida em corridas.csv, para comparar dias, pistas e calibrações."""

    def __init__(self, path: Path) -> None:
        self._path = path

    def append(self, row: Mapping[str, object]) -> None:
        is_new = not self._path.exists()
        with open(self._path, "a", encoding="utf-8", newline="") as out:
            writer = csv.DictWriter(out, fieldnames=RACE_CSV_COLUMNS, extrasaction="ignore", delimiter=";")
            if is_new:
                writer.writeheader()
            writer.writerow(row)
