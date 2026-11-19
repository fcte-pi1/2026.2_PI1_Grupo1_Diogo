"""Modelo declarativo de um teste: passos, perguntas ao operador e o teste em si."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Callable, NamedTuple

from .robot_link import LineWatcher, RobotLink
from .verdict import Check


@dataclass(frozen=True)
class Step:
    """Um comando enviado ao robô e a linha de log que marca o fim da resposta."""

    command: str
    end_pattern: str
    timeout: float = 20
    count: int = 1
    settle: float = 0.8
    gap: float = 0.0  # pausa depois deste passo, se houver outro em seguida


def repeated(step: Step, times: int) -> tuple[Step, ...]:
    return (step,) * times


class AnswerKind(StrEnum):
    YES_NO = "sn"
    NUMBER = "num"
    TEXT = "txt"


class Judgement(NamedTuple):
    value: str | float
    ok: bool


YES, NO = "s", "n"


@dataclass(frozen=True)
class Question:
    """Pergunta ao operador, com a resposta esperada."""

    key: str
    text: str
    kind: AnswerKind = AnswerKind.YES_NO
    expected: str | None = None
    low: float = 0.0
    high: float = 0.0

    @property
    def expectation_hint(self) -> str:
        return {AnswerKind.YES_NO: "s ou n", AnswerKind.NUMBER: "um número",
                AnswerKind.TEXT: "texto"}[self.kind]

    def judge(self, answer: str) -> Judgement | None:
        """Interpreta a resposta do operador; None se não deu para entender."""
        answer = answer.strip()
        if self.kind is AnswerKind.YES_NO:
            return self._judge_yes_no(answer.lower())
        if self.kind is AnswerKind.NUMBER:
            return self._judge_number(answer)
        return self._judge_text(answer)

    def _judge_yes_no(self, answer: str) -> Judgement | None:
        if answer not in (YES, NO):
            return None
        return Judgement(answer, self.expected is None or answer == self.expected)

    def _judge_number(self, answer: str) -> Judgement | None:
        try:
            value = float(answer.replace(",", "."))
        except ValueError:
            return None
        return Judgement(value, self.low <= value <= self.high)

    def _judge_text(self, answer: str) -> Judgement | None:
        if not answer:
            return None
        return Judgement(answer, self.expected is None or answer.upper().replace(" ", "") == self.expected)


def yes_no(key: str, text: str, expected: str | None = None) -> Question:
    return Question(key, text, AnswerKind.YES_NO, expected=expected)


def number(key: str, text: str, low: float, high: float) -> Question:
    return Question(key, text, AnswerKind.NUMBER, low=low, high=high)


def free_text(key: str, text: str, expected: str | None = None) -> Question:
    return Question(key, text, AnswerKind.TEXT, expected=expected)


CheckFunction = Callable[[list[str]], list[Check]]
WatcherFactory = Callable[[RobotLink], LineWatcher]


@dataclass(frozen=True)
class Test:
    ident: str
    title: str
    prepare: tuple[str, ...]
    steps: tuple[Step, ...]
    criterion: str
    check: CheckFunction
    questions: tuple[Question, ...] = ()
    moves: bool = False  # as rodas vão girar
    watcher_factory: WatcherFactory | None = None  # vigia o log durante o teste (ex.: "parar" automático)
    repeat: int = 1
    ends_in_error: bool = False  # deixa o robô em Erro de propósito: reinicia no fim

    __test__ = False  # não é um teste do pytest

    @property
    def block(self) -> str:
        return self.ident[0]

    @property
    def commands(self) -> str:
        return ", ".join(dict.fromkeys(step.command for step in self.steps if step.command)) or "(nenhum: o operador age)"
