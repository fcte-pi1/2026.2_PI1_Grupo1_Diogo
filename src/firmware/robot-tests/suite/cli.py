"""Linha de comando do roteiro (`python t.py ...`): monta as dependências e despacha os comandos."""

import io
import sys
import time
from dataclasses import dataclass
from typing import Callable

from .calibration import CalibrationClient, GyroCalibration, ask_measures
from .catalog import ALL_TESTS, BLOCK_TITLES, find_test
from .console import print_robot_lines
from .free_race import FreeRace
from .gate import run_gate
from .model import Test
from .operator_io import AutomaticOperator, InteractiveOperator, Operator
from .results import RaceTable, Report, RunHistory
from .robot_link import RobotLink
from .runner import OperatorAnswers, TestRunner, describe_test
from .verdict import Verdict
from .workspace import Workspace

AUTO_FLAG = "--auto"
DEFAULT_COMMAND_WAIT_S = 6.0

ExitCode = int
Handler = Callable[[list[str]], ExitCode]


@dataclass(frozen=True)
class Command:
    handler: Handler
    min_args: int = 0  # argumentos depois do nome do comando


def exit_code(verdict: str | None) -> ExitCode:
    return 0 if verdict and verdict.startswith(Verdict.PASSED) else 1


class Application:
    """Raiz de composição: cria os objetos uma vez e os injeta em quem precisa."""

    def __init__(self, workspace: Workspace, operator: Operator) -> None:
        self.workspace = workspace
        self.link = RobotLink(workspace)
        self.history = RunHistory(workspace.history)
        self.report = Report(workspace.report, workspace.firmware_dir)
        self.operator = operator
        self.calibration = CalibrationClient(self.link, self.report)
        self._commands: dict[str, Command] = {
            "lista": Command(self.list_tests),
            "resumo": Command(self.list_tests),
            "portao": Command(self.gate),
            "reiniciar": Command(self.restart),
            "parar": Command(self.stop),
            "cmd": Command(self.raw_command, min_args=1),
            "nota": Command(self.note, min_args=2),
            "corrida": Command(self.free_race, min_args=1),
            "calib-ver": Command(self.show_calibration),
            "calib": Command(self.write_calibration, min_args=1),
            "medidas": Command(self.measures),
            "calib-giro": Command(self.gyro_calibration),
            "preparo": Command(self.describe, min_args=1),
            "responder": Command(self.answer, min_args=1),
        }

    def dispatch(self, args: list[str]) -> ExitCode:
        if not args:
            return self.list_tests([])
        name, rest = args[0], args[1:]
        command = self._commands.get(name)
        if command is not None and len(rest) >= command.min_args:
            return command.handler(rest)
        return self.run_test(args)

    # --- comandos ---------------------------------------------------------------------------
    def list_tests(self, _args: list[str]) -> ExitCode:
        for block, title in BLOCK_TITLES.items():
            print(f"\n{title}")
            for test in (test for test in ALL_TESTS if test.block == block):
                runs = self.history.runs(test.ident)
                status = ", ".join(run.verdict for run in runs) or "não feito"
                times = f" (x{test.repeat})" if test.repeat > 1 else ""
                print(f"  {test.ident:8} {test.title}{times}: {status}")
        print("\nRode um teste com:  python t.py <ID>     Antes de cada bloco:  python t.py portao")
        return 0

    def gate(self, _args: list[str]) -> ExitCode:
        return 1 if run_gate(self.link) is Verdict.FAILED else 0

    def restart(self, _args: list[str]) -> ExitCode:
        self.link.require_bridge()
        return 0 if self.link.restart() else 1

    def stop(self, _args: list[str]) -> ExitCode:
        self.link.send("parar")
        print("Mandei 'parar'.")
        return 0

    def raw_command(self, args: list[str]) -> ExitCode:
        """`cmd "<comando>" [segundos]`: manda um comando avulso e mostra a resposta."""
        self.link.require_bridge()
        command = args[0]
        wait_s = float(args[1]) if len(args) > 1 else DEFAULT_COMMAND_WAIT_S
        self.link.mark("COMANDO AVULSO", command)
        offset = self.link.log_size()
        self.link.send(command)
        time.sleep(wait_s)
        print_robot_lines(self.link.read_from(offset))
        return 0

    def note(self, args: list[str]) -> ExitCode:
        self.report.add_note(args[0], args[1])
        print("Anotado.")
        return 0

    def free_race(self, args: list[str]) -> ExitCode:
        race = FreeRace(self.workspace, self.link, self.history, self.report,
                        RaceTable(self.workspace.races_csv), self.operator)
        return exit_code(race.run(args[0], args[1] if len(args) > 1 else ""))

    def show_calibration(self, _args: list[str]) -> ExitCode:
        self.calibration.show(self.calibration.send())
        return 0

    def write_calibration(self, args: list[str]) -> ExitCode:
        self.calibration.write(" ".join(args))
        return 0

    def measures(self, _args: list[str]) -> ExitCode:
        ask_measures(self.calibration)
        return 0

    def gyro_calibration(self, _args: list[str]) -> ExitCode:
        GyroCalibration(self.link, self.calibration, self.operator, self.workspace).run()
        return 0

    def describe(self, args: list[str]) -> ExitCode:
        test = self._require_test(args[0])
        describe_test(test, self.history.next_attempt(test.ident))
        return 0

    def answer(self, args: list[str]) -> ExitCode:
        test = self._require_test(args[0])
        return exit_code(OperatorAnswers(self.history, self.report).record(test, args[1:]))

    def run_test(self, args: list[str]) -> ExitCode:
        test = self._require_test(args[0])
        runner = TestRunner(self.workspace, self.link, self.history, self.report, self.operator)
        return exit_code(runner.run(test))

    @staticmethod
    def _require_test(ident: str) -> Test:
        test = find_test(ident)
        if test is None:
            sys.exit(f"Não conheço o teste '{ident}'. Rode 'python t.py' para ver a lista.")
        return test


def _use_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")


def main(argv: list[str] | None = None) -> ExitCode:
    _use_utf8_console()
    argv = sys.argv[1:] if argv is None else argv
    automatic = AUTO_FLAG in argv
    args = [arg for arg in argv if arg != AUTO_FLAG]
    workspace = Workspace()
    workspace.ensure_results_dir()
    operator: Operator = AutomaticOperator() if automatic else InteractiveOperator()
    return Application(workspace, operator).dispatch(args)
