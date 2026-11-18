"""Funções puras para procurar informação nas linhas de log do robô."""

import re
from typing import Iterable

_ROBOT_PREFIX = re.compile(r"^[IWE] \(\d+\) ")


def strip_robot_prefix(line: str) -> str:
    """Tira o prefixo "I (12345) " das linhas do robô."""
    return _ROBOT_PREFIX.sub("", line.rstrip("\r\n"))


def find_matches(lines: Iterable[str], pattern: str) -> list[re.Match[str]]:
    regex = re.compile(pattern)
    return [match for match in (regex.search(line) for line in lines) if match]


def contains(lines: Iterable[str], text: str) -> bool:
    return any(text in line for line in lines)


def count_containing(lines: Iterable[str], text: str) -> int:
    return sum(1 for line in lines if text in line)


def count_matching(lines: Iterable[str], pattern: str) -> int:
    return len(find_matches(lines, pattern))
