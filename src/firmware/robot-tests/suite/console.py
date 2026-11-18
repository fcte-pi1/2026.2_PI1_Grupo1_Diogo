"""Saída no terminal compartilhada pelos comandos."""

from typing import Iterable

from .verdict import Check

SEPARATOR = "=" * 78


def print_robot_lines(lines: Iterable[str]) -> None:
    for line in lines:
        print("   ", line)


def print_checks(checks: Iterable[Check]) -> None:
    for check in checks:
        print(f"  [{check.label:8}] {check.text}")


def print_robot_in_error_hint() -> None:
    print("A corrida terminou em FALHA: o robô está em Erro e NÃO aceita comandos de motor.")
    print("Antes de tirá-lo do lugar, se quiser ver onde ele parou:  python t.py cmd \"tof\"")
    print("Depois:  python t.py reiniciar")
