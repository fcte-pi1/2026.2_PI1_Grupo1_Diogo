"""Vereditos e conferências automáticas."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Iterable


class Verdict(StrEnum):
    PASSED = "PASSOU"
    FAILED = "FALHOU"
    REVIEW = "CONFERIR"


@dataclass(frozen=True)
class Check:
    """Resultado de uma conferência. `status` é None para um dado só informativo."""

    status: Verdict | None
    text: str

    @classmethod
    def info(cls, text: str) -> "Check":
        return cls(None, text)

    @classmethod
    def judge(cls, ok: bool, text_ok: str, text_bad: str | None = None) -> "Check":
        return cls(Verdict.PASSED, text_ok) if ok else cls(Verdict.FAILED, text_bad or text_ok)

    @classmethod
    def passed(cls, text: str) -> "Check":
        return cls(Verdict.PASSED, text)

    @classmethod
    def failed(cls, text: str) -> "Check":
        return cls(Verdict.FAILED, text)

    @classmethod
    def review(cls, text: str) -> "Check":
        return cls(Verdict.REVIEW, text)

    @classmethod
    def passed_or_review(cls, ok: bool, text: str) -> "Check":
        return cls(Verdict.PASSED if ok else Verdict.REVIEW, text)

    @property
    def label(self) -> str:
        return self.status or "dado"


def overall_verdict(checks: Iterable[Check]) -> Verdict:
    statuses = {check.status for check in checks}
    if Verdict.FAILED in statuses:
        return Verdict.FAILED
    if Verdict.REVIEW in statuses:
        return Verdict.REVIEW
    return Verdict.PASSED
