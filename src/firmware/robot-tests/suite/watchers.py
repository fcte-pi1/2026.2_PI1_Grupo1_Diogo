"""Vigias que leem o log durante um teste e mandam `parar` na hora certa."""

import time

from .log_parsing import find_matches
from .robot_link import RobotLink


class StopOnceWhen:
    """Manda `parar` uma única vez, quando aparece uma linha que casa com `pattern`."""

    def __init__(self, link: RobotLink, pattern: str, delay_s: float = 0.0) -> None:
        self._link = link
        self._pattern = pattern
        self._delay_s = delay_s
        self._sent = False

    def __call__(self, lines: list[str]) -> None:
        if self._sent or not find_matches(lines, self._pattern):
            return
        time.sleep(self._delay_s)
        self._link.send("parar")
        self._sent = True


def stop_when_outside_maze(link: RobotLink) -> StopOnceWhen:
    """D6: para assim que o robô vê uma passagem para fora do labirinto."""
    return StopOnceWhen(link, r"nav: passo \d+: .* fora=[1-9]")


def stop_during_second_straight(link: RobotLink) -> StopOnceWhen:
    """D7: para 0,4 s depois de o robô decidir o passo 2 (no meio da 2ª reta)."""
    return StopOnceWhen(link, r"nav: passo 2: ", delay_s=0.4)
