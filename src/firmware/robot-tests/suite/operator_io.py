"""Interação com o operador: interativa (terminal) ou automática (--auto, conduzida por um programa)."""

from enum import Enum
from typing import Protocol, Sequence

from .model import AnswerKind, Judgement, Question


class StartDecision(Enum):
    RUN = "ok"
    SKIP = "pular"
    CANCEL = "cancelar"


class Operator(Protocol):
    @property
    def defers_answers(self) -> bool:
        """True quando as respostas chegam depois, pelo comando `responder`."""
        ...

    def confirm_start(self, allow_skip: bool = True) -> StartDecision: ...

    def confirm(self, prompt: str) -> bool: ...

    def collect_answers(self, questions: Sequence[Question]) -> dict[str, Judgement]: ...

    def ask_observation(self) -> str: ...


class InteractiveOperator:
    defers_answers = False

    def confirm_start(self, allow_skip: bool = True) -> StartDecision:
        suffix = " (ou 'pular')" if allow_skip else ""
        answer = input(f"\nQuando estiver tudo pronto, digite ok e ENTER{suffix}: ").strip().lower()
        if answer == StartDecision.RUN.value:
            return StartDecision.RUN
        return StartDecision.SKIP if allow_skip and answer == StartDecision.SKIP.value else StartDecision.CANCEL

    def confirm(self, prompt: str) -> bool:
        return input(f"{prompt} [s/n]: ").strip().lower() == "s"

    def collect_answers(self, questions: Sequence[Question]) -> dict[str, Judgement]:
        if not questions:
            return {}
        print("\nAGORA RESPONDA olhando o robô:")
        return {question.key: self._ask(question) for question in questions}

    def ask_observation(self) -> str:
        return input("Observação (o que você viu de diferente; ENTER se nada): ").strip()

    @staticmethod
    def _ask(question: Question) -> Judgement:
        suffix = " [s/n]" if question.kind is AnswerKind.YES_NO else ""
        while True:
            judged = question.judge(input(f"  {question.text}{suffix}: "))
            if judged is not None:
                return judged
            print("    Digite só o número." if question.kind is AnswerKind.NUMBER
                  else "    Resposta não entendida; tente de novo.")


class AutomaticOperator:
    """Não pergunta nada: o preparo é só impresso e as perguntas saem como "PERGUNTAR:"."""

    defers_answers = True

    def confirm_start(self, allow_skip: bool = True) -> StartDecision:
        return StartDecision.RUN

    def confirm(self, prompt: str) -> bool:
        return False  # quem conduz decide e grava com `python t.py calib ...`

    def collect_answers(self, questions: Sequence[Question]) -> dict[str, Judgement]:
        for question in questions:
            print(f"PERGUNTAR: ({question.key}) {question.text}")
        return {}

    def ask_observation(self) -> str:
        return ""
