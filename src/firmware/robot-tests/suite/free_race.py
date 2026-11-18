"""`corrida`: corrida em qualquer labirinto, sem sequência esperada; só coleta log e métricas."""

import re
import sys

from . import clock
from .checks.race import RACE_END
from .console import SEPARATOR, print_robot_in_error_hint
from .operator_io import Operator, StartDecision
from .race_metrics import compute_race_metrics
from .results import RaceTable, Report, RunHistory
from .robot_link import RobotLink
from .verdict import Verdict
from .workspace import Workspace

RACE_TIMEOUT_S = 180
_VALID_LABEL = re.compile(r"[A-Za-z0-9_.-]{1,40}")


class FreeRace:
    def __init__(self, workspace: Workspace, link: RobotLink, history: RunHistory, report: Report,
                 table: RaceTable, operator: Operator) -> None:
        self._workspace = workspace
        self._link = link
        self._history = history
        self._report = report
        self._table = table
        self._operator = operator

    def run(self, label: str, description: str) -> Verdict | None:
        self._link.require_bridge()
        if not _VALID_LABEL.fullmatch(label):
            sys.exit("Rótulo inválido: use letras, números, ponto, hífen ou sublinhado (até 40), ex.: OF-4x4-A.")
        attempt = self._history.next_attempt(label)
        print(SEPARATOR)
        print(f"CORRIDA {label} (tentativa {attempt}): {description}")
        print("O robô vai correr sozinho até o canto oposto (até ~2 min). Ctrl+C manda parar.")
        if self._operator.confirm_start() is not StartDecision.RUN:
            print("Não executado.")
            return None

        boot_before = self._link.boot_id()
        self._link.mark(f"CORRIDA {label} tentativa {attempt}", description)
        start = self._link.log_size()
        finished = self._race(start)
        log_path = self._workspace.race_log(label, attempt)
        log_name = self._workspace.relative_to_results(log_path)
        self._workspace.save_log(log_path, self._link.read_from(start))
        metrics = compute_race_metrics(self._link.read_timestamped_from(start))
        boot_after = self._link.boot_id()
        rebooted = bool(boot_before and boot_after and boot_after != boot_before)
        self._print_metrics(metrics, finished, rebooted)

        outcome = str(metrics.get("resultado", "SEM FIM"))
        verdict = Verdict.PASSED if outcome == "SUCESSO" and finished and not rebooted else Verdict.FAILED
        self._history.append(label, attempt, verdict)
        self._report.add_race(label, attempt, verdict, description, log_name, metrics, rebooted)
        self._table.append(dict(metrics, data=clock.iso_date(), hora=clock.time_of_day(), rotulo=label,
                                tentativa=attempt, descricao=description, log=log_name))
        print(f"\nRESULTADO DA CORRIDA {label}: {verdict}   (log: resultados/{log_name})")
        if "FALHA" in outcome:
            print_robot_in_error_hint()
        return verdict

    def _race(self, start: int) -> bool:
        try:
            self._link.send("largar")
            print(f"  -> largar; esperando o robô (até {RACE_TIMEOUT_S} s)...")
            return self._link.wait_for(start, RACE_END, RACE_TIMEOUT_S, settle=2.0).found
        except KeyboardInterrupt:
            self._link.stop_after_interrupt()
            return False

    @staticmethod
    def _print_metrics(metrics: dict[str, object], finished: bool, rebooted: bool) -> None:
        print("\nMÉTRICAS:")
        for key, value in metrics.items():
            print(f"  {key}: {value}")
        if not finished:
            print("  !! a corrida não terminou no log (tempo esgotado ou interrompida)")
        if rebooted:
            print("  !! O ROBÔ REINICIOU SOZINHO durante a corrida")
