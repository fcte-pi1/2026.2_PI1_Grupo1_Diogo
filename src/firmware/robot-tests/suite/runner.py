"""Execução de um teste do catálogo: preparo, comandos, conferência, perguntas e registro."""

import sys
import time
from dataclasses import dataclass, field

from .console import SEPARATOR, print_checks, print_robot_in_error_hint, print_robot_lines
from .model import Judgement, Test
from .operator_io import Operator, StartDecision
from .results import AWAITING_OPERATOR_SUFFIX, SKIPPED, Report, RunHistory
from .robot_link import RobotLink
from .verdict import Check, Verdict, overall_verdict
from .workspace import Workspace


def describe_test(test: Test, attempt: int) -> None:
    """Mostra o preparo, o critério e as perguntas do teste, sem mandar nada ao robô."""
    print(SEPARATOR)
    print(f"TESTE {test.ident} (tentativa {attempt}): {test.title}")
    if test.repeat > 1:
        print(f"Este teste é feito {test.repeat} vezes: rode 'python t.py {test.ident}' {test.repeat} vezes, "
              "reposicionando o robô a cada vez.")
    print("\nPREPARO (faça nesta ordem):")
    for index, text in enumerate(test.prepare, 1):
        print(f"  {index}. {text}")
    print(f"\nPASSA SE: {test.criterion}")
    warning = "   *** AS RODAS VÃO GIRAR ***" if test.moves else ""
    print(f"\nComando(s) que serão enviados: {test.commands}{warning}")
    if test.questions:
        print("\nDepois do teste o operador responde:")
        for question in test.questions:
            print(f"  - ({question.key}) {question.text}")


@dataclass
class _Execution:
    lines: list[str]
    finished: bool
    boot_before: str
    checks: list[Check] = field(default_factory=list)


class TestRunner:
    __test__ = False  # não é um teste do pytest

    def __init__(self, workspace: Workspace, link: RobotLink, history: RunHistory, report: Report,
                 operator: Operator) -> None:
        self._workspace = workspace
        self._link = link
        self._history = history
        self._report = report
        self._operator = operator

    def run(self, test: Test) -> str | None:
        """Roda o teste e devolve o veredito, ou None se o operador não confirmou o início."""
        self._link.require_bridge()
        attempt = self._history.next_attempt(test.ident)
        describe_test(test, attempt)
        decision = self._operator.confirm_start()
        if decision is not StartDecision.RUN:
            print("Teste não executado.")
            if decision is StartDecision.SKIP:
                self._history.append(test.ident, attempt, SKIPPED)
                self._report.add_test_run(test.ident, test.title, self._commands(test), attempt, SKIPPED, [], {})
            return None

        execution = self._execute(test, attempt)
        log_path = self._workspace.test_log(test.ident, attempt)
        self._workspace.save_log(log_path, execution.lines)
        print("\nO QUE O ROBÔ RESPONDEU:")
        print_robot_lines(execution.lines)

        checks = self._automatic_checks(test, execution)
        print("\nCONFERÊNCIA AUTOMÁTICA:")
        print_checks(checks)
        answers = self._operator.collect_answers(test.questions)
        checks += [self._answer_check(test, key, judgement) for key, judgement in answers.items()]

        verdict: str = overall_verdict(checks)
        if self._operator.defers_answers and test.questions:
            verdict += AWAITING_OPERATOR_SUFFIX
        print(f"\nRESULTADO DO {test.ident}: {verdict}")
        note = self._operator.ask_observation()
        self._history.append(test.ident, attempt, verdict)
        self._report.add_test_run(test.ident, test.title, self._commands(test), attempt, verdict, checks,
                                  {key: judgement.value for key, judgement in answers.items()}, note)
        self._leave_robot_ready(test, execution.lines)
        print(f"Log deste teste: resultados/{self._workspace.relative_to_results(log_path)}")
        return verdict

    @staticmethod
    def _commands(test: Test) -> list[str]:
        return [step.command for step in test.steps]

    def _execute(self, test: Test, attempt: int) -> _Execution:
        boot_before = self._link.boot_id()
        self._link.mark(f"TESTE {test.ident} tentativa {attempt}", f"comando: {test.commands}")
        start = self._link.log_size()
        watcher = test.watcher_factory(self._link) if test.watcher_factory else None
        finished = True
        try:
            for index, step in enumerate(test.steps):
                offset = self._link.log_size()
                self._link.send(step.command)
                print(f"  -> {step.command} ({index + 1}/{len(test.steps)}); "
                      f"esperando o robô (até {step.timeout} s)...")
                if not self._link.wait_for(offset, step.end_pattern, step.timeout, step.count, step.settle,
                                           watcher).found:
                    finished = False
                    print("  !! O robô não respondeu no tempo esperado.")
                    break
                if index + 1 < len(test.steps) and step.gap:
                    time.sleep(step.gap)
        except KeyboardInterrupt:
            self._link.stop_after_interrupt()
            finished = False
        return _Execution(self._link.read_from(start), finished, boot_before)

    def _automatic_checks(self, test: Test, execution: _Execution) -> list[Check]:
        checks = []
        if not execution.finished:
            checks.append(Check.failed("o teste não chegou ao fim (sem resposta do robô, ou interrompido)"))
        boot_after = self._link.boot_id()
        if execution.boot_before and boot_after and boot_after != execution.boot_before:
            checks.append(Check.failed(
                f"O ROBÔ REINICIOU SOZINHO durante o teste (boot {execution.boot_before} -> {boot_after}): "
                "queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='"))
        if not self._link.is_connected():
            checks.append(Check.failed("a ponte perdeu a conexão com o robô durante o teste"))
        try:
            checks += test.check(execution.lines)
        except Exception as error:  # um formato de linha inesperado não pode derrubar o roteiro
            checks.append(Check.review(f"não consegui conferir sozinho ({error}); leia as linhas acima"))
        return checks

    @staticmethod
    def _answer_check(test: Test, key: str, judgement: Judgement) -> Check:
        question = next(question for question in test.questions if question.key == key)
        return Check.judge(judgement.ok, f"operador: {question.text} -> {judgement.value}")

    def _leave_robot_ready(self, test: Test, lines: list[str]) -> None:
        if test.ends_in_error:
            print("\nEste teste deixa o robô em Erro de propósito. Reiniciando...")
            self._link.restart()
        elif any("fim da corrida" in line and "FALHA" in line for line in lines):
            print()
            print_robot_in_error_hint()


class OperatorAnswers:
    """`responder`: junta as respostas do operador ao último resultado de um teste rodado com --auto."""

    def __init__(self, history: RunHistory, report: Report) -> None:
        self._history = history
        self._report = report

    def record(self, test: Test, pairs: list[str]) -> str:
        runs = self._history.runs(test.ident)
        if not runs:
            sys.exit(f"O teste {test.ident} ainda não foi rodado.")
        given = dict(pair.split("=", 1) for pair in pairs if "=" in pair)
        missing = [question.key for question in test.questions if question.key not in given]
        if missing:
            sys.exit(f"Faltam respostas: {', '.join(missing)}. Use chave=valor para cada uma.")

        all_ok = True
        report_lines = []
        for question in test.questions:
            judgement = question.judge(given[question.key])
            if judgement is None:
                sys.exit(f"Não entendi a resposta de '{question.key}': {given[question.key]!r} "
                         f"({question.expectation_hint}).")
            status = Verdict.PASSED if judgement.ok else Verdict.FAILED
            all_ok = all_ok and judgement.ok
            report_lines.append(f"- {status}: operador: {question.text} -> {judgement.value}")
            print(f"  [{status:8}] {question.text} -> {judgement.value}")

        last = runs[-1]
        automatic = last.automatic_verdict
        final = automatic if all_ok or automatic == Verdict.FAILED else Verdict.FAILED
        self._history.replace_last_verdict(test.ident, final)
        self._report.add_operator_answers(test.ident, last.attempt, report_lines, final)
        print(f"\nRESULTADO FINAL DO {test.ident}: {final}")
        return final
