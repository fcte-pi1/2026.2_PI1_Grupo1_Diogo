"""Catálogo de todos os testes do roteiro, agrupados por bloco."""

from ..model import Test
from .floor import FLOOR_TESTS
from .hardware import HARDWARE_TESTS
from .maze import MAZE_TESTS
from .novelties import NOVELTY_TESTS
from .orientation import ORIENTATION_TESTS
from .races import RACE_TESTS
from .suspended import SUSPENDED_TESTS

ALL_TESTS: tuple[Test, ...] = (HARDWARE_TESTS + SUSPENDED_TESTS + FLOOR_TESTS + MAZE_TESTS + RACE_TESTS
                              + ORIENTATION_TESTS + NOVELTY_TESTS)

BLOCK_TITLES = {
    "H": "Bloco H: hardware (robô apoiado, rodas no ar)",
    "A": "Bloco A: movimentos no ar",
    "B": "Bloco B: chão livre, fora do labirinto",
    "C": "Bloco C: labirinto, uma manobra por vez",
    "D": "Bloco D: corridas completas",
    "E": "Bloco E: novidades de 19/11 (ToF perto, centralização, curva em uma roda, frenagem suave)",
    "O": "Bloco O: orientação do labirinto (toque longo e comando labirinto, robô parado)",
}

_TESTS_BY_ID = {test.ident.upper(): test for test in ALL_TESTS}


def find_test(ident: str) -> Test | None:
    return _TESTS_BY_ID.get(ident.upper())
