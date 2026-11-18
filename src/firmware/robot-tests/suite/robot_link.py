"""Comunicação com o robô pelos arquivos da ponte: enviar comandos e ler o log."""

import json
import re
import sys
import time
from typing import Callable, NamedTuple

from . import clock
from .log_parsing import strip_robot_prefix
from .workspace import Workspace

RESTART_TIMEOUT_S = 40
POLL_INTERVAL_S = 0.2
_TIMESTAMPED_LINE = re.compile(r"^[IWE] \((\d+)\) (.*)$")

LineWatcher = Callable[[list[str]], None]


class WaitResult(NamedTuple):
    lines: list[str]
    found: bool


class RobotLink:
    """Fala com o robô através da ponte: comandos em `comandos.txt`, respostas em `log_robo.txt`."""

    def __init__(self, workspace: Workspace) -> None:
        self._workspace = workspace

    # --- estado da ponte -------------------------------------------------------------------
    def bridge_state(self) -> dict:
        try:
            return json.loads(self._workspace.bridge_state.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {"conectado": False, "boot": ""}

    def boot_id(self) -> str:
        return self.bridge_state().get("boot", "")

    def is_connected(self) -> bool:
        return bool(self.bridge_state().get("conectado"))

    def require_bridge(self) -> None:
        if not self._workspace.bridge_state.exists():
            sys.exit(
                "A ponte não está rodando. Abra OUTRA janela nesta pasta e rode:  python ponte.py\n"
                "Espere aparecer '[ble] conectado' e tente de novo."
            )
        if not self.is_connected():
            sys.exit(
                "A ponte está aberta, mas NÃO está conectada ao robô.\n"
                "Confira: robô ligado na BATERIA, Bluetooth do computador ligado, robô a menos de "
                "3 m.\nEspere aparecer '[ble] conectado' na janela da ponte e tente de novo."
            )

    # --- comandos e log --------------------------------------------------------------------
    def send(self, command: str) -> None:
        with open(self._workspace.commands, "a", encoding="utf-8", newline="\n") as out:
            out.write(command + "\n")

    def mark(self, title: str, detail: str = "") -> None:
        """Escreve um separador no log: `===== TITULO | hh:mm:ss | detalhe =====`."""
        parts = [title, clock.time_of_day()] + ([detail] if detail else [])
        with open(self._workspace.robot_log, "a", encoding="utf-8", newline="\n") as out:
            out.write(f"===== {' | '.join(parts)} =====\n")

    def log_size(self) -> int:
        log = self._workspace.robot_log
        return log.stat().st_size if log.exists() else 0

    def read_from(self, offset: int) -> list[str]:
        """Linhas completas do log depois de `offset`, sem o prefixo do robô."""
        return [strip_robot_prefix(text) for text in self._complete_text_from(offset).splitlines()]

    def read_timestamped_from(self, offset: int) -> list[tuple[int, str]]:
        """Linhas do robô depois de `offset`, com o carimbo do robô em ms."""
        timestamped = []
        for line in self._complete_text_from(offset).splitlines():
            match = _TIMESTAMPED_LINE.match(line.rstrip("\r"))
            if match:
                timestamped.append((int(match.group(1)), match.group(2)))
        return timestamped

    def _complete_text_from(self, offset: int) -> str:
        log = self._workspace.robot_log
        if not log.exists():
            return ""
        with open(log, "rb") as handle:
            handle.seek(offset)
            data = handle.read()
        end = data.rfind(b"\n")
        return data[: end + 1].decode("utf-8", errors="replace") if end >= 0 else ""

    def wait_for(self, offset: int, pattern: str, timeout: float, count: int = 1,
                 settle: float = 0.8, watcher: LineWatcher | None = None) -> WaitResult:
        """Espera `count` linhas que casem com `pattern` depois de `offset`.

        `watcher(linhas)` é chamado a cada leitura e pode mandar comandos (o "parar" automático)."""
        regex = re.compile(pattern)
        deadline = time.time() + timeout
        while time.time() < deadline:
            lines = self.read_from(offset)
            if watcher is not None:
                watcher(lines)
            if sum(1 for line in lines if regex.search(line)) >= count:
                time.sleep(settle)
                return WaitResult(self.read_from(offset), True)
            time.sleep(POLL_INTERVAL_S)
        return WaitResult(self.read_from(offset), False)

    def send_and_wait(self, command: str, pattern: str, timeout: float) -> WaitResult:
        offset = self.log_size()
        self.send(command)
        return self.wait_for(offset, pattern, timeout)

    # --- parar e reiniciar -----------------------------------------------------------------
    def stop_after_interrupt(self) -> None:
        """Chamado no Ctrl+C: freia o robô na hora."""
        self.send("parar")
        print("\n  !! Ctrl+C: mandei 'parar' ao robô.")
        time.sleep(1.5)

    def restart(self, quiet: bool = False) -> bool:
        """Manda `reiniciar` e espera o robô reconectar (o boot muda)."""
        boot_before = self.boot_id()
        self.send("reiniciar")
        if not quiet:
            print(f"Reiniciando o robô; esperando ele reconectar (até {RESTART_TIMEOUT_S} s)...")
        deadline = time.time() + RESTART_TIMEOUT_S
        while time.time() < deadline:
            time.sleep(0.5)
            state = self.bridge_state()
            if state.get("conectado") and state.get("boot") and state.get("boot") != boot_before:
                time.sleep(2.0)  # o robô confere os sensores e fica pronto
                if not quiet:
                    print(f"Robô de volta (boot {state['boot']}).")
                return True
        print(f"ATENÇÃO: o robô não reconectou em {RESTART_TIMEOUT_S} s. Veja a janela da ponte.")
        return False
