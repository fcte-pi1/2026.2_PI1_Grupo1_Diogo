"""Sessão da ponte BLE: roda o ble_ws_bridge.py do repositório sem mudá-lo e acrescenta os arquivos
que o roteiro (t.py) usa: comandos por arquivo, cópia da saída, telemetria e estado da conexão."""

import importlib
import io
import json
import os
import sys
import time
from pathlib import Path
from types import ModuleType
from typing import TextIO

from . import clock
from .workspace import Workspace

BRIDGE_MODULE = "ble_ws_bridge"
TELEMETRY_PREFIX = "[rx] "


def find_bridge_dir(workspace: Workspace, explicit: str | None) -> Path:
    candidates = [Path(explicit)] if explicit else []
    candidates += [workspace.firmware_dir / "bridge", workspace.root / "bridge", Path.cwd()]
    for folder in candidates:
        if (folder / f"{BRIDGE_MODULE}.py").exists():
            return folder
    sys.exit(
        "Não achei o ble_ws_bridge.py. A pasta robot-tests tem de ficar dentro de src/firmware/ "
        "(ao lado de src/), ou passe --bridge <pasta do bridge>."
    )


def load_bridge_module(bridge_dir: Path) -> ModuleType:
    # A pasta do bridge só entra no sys.path agora, então o import é feito por nome.
    sys.path.insert(0, str(bridge_dir))
    try:
        return importlib.import_module(BRIDGE_MODULE)
    except ImportError as error:
        sys.exit(
            f"Falta uma biblioteca do Python ({error}). Rode:\n"
            f"    python -m pip install -r \"{bridge_dir / 'requirements.txt'}\""
        )


class ConnectionStateFile:
    """estado.txt: se o robô está conectado e qual é o boot atual (o t.py lê)."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self.state = {"conectado": False, "boot": "", "desde": clock.time_of_day()}
        self.save()

    def save(self) -> None:
        temp = self._path.with_suffix(".tmp")
        temp.write_text(json.dumps(self.state), encoding="utf-8")
        for _ in range(20):  # no Windows a troca falha se o t.py estiver lendo o arquivo agora
            try:
                os.replace(temp, self._path)
                return
            except OSError:
                time.sleep(0.05)

    def mark_connected(self) -> None:
        self.state.update(conectado=True, desde=clock.time_of_day())
        self.save()

    def mark_disconnected(self) -> None:
        if self.state["conectado"]:
            self.state.update(conectado=False, desde=clock.time_of_day())
            self.save()

    def mark_boot(self, boot: str) -> None:
        if boot and boot != self.state["boot"]:
            self.state.update(boot=boot, conectado=True)
            self.save()

    def close(self) -> None:
        self.state["conectado"] = False
        self.save()


class BridgeOutputRecorder:
    """Substitui o stdout: copia a saída da ponte para ponte.out e, a cada linha completa, atualiza o
    estado da conexão e guarda a telemetria."""

    def __init__(self, stream: TextIO, workspace: Workspace, state: ConnectionStateFile) -> None:
        self._stream = stream
        self._copy = open(workspace.bridge_output, "a", encoding="utf-8")
        self._telemetry = workspace.telemetry
        self._state = state
        self._partial = ""

    def write(self, data: str) -> int:
        self._stream.write(data)
        self._copy.write(data)
        self._partial += data
        while "\n" in self._partial:
            line, self._partial = self._partial.split("\n", 1)
            self._handle_line(line.rstrip("\r"))
        return len(data)

    def flush(self) -> None:
        self._stream.flush()
        self._copy.flush()

    def _handle_line(self, line: str) -> None:
        if line.startswith("[ble] conectado"):
            self._state.mark_connected()
        elif line.startswith(("[ble] desconectado", "[ble] procurando")):
            self._state.mark_disconnected()
        elif line.startswith(TELEMETRY_PREFIX):
            self._handle_telemetry(line[len(TELEMETRY_PREFIX):])

    def _handle_telemetry(self, payload: str) -> None:
        with open(self._telemetry, "a", encoding="utf-8") as out:
            out.write(payload + "\n")
        if '"hello"' in payload:
            try:
                boot = str(json.loads(payload).get("boot", ""))
            except ValueError:
                boot = ""
            self._state.mark_boot(boot)


class CommandFileTail:
    """Como um `tail -f` do comandos.txt (o Windows não tem FIFO): bloqueia até aparecerem linhas
    completas novas e devolve só essas. O que já estava no arquivo não é reenviado."""

    def __init__(self, poll_s: float = 0.15) -> None:
        self._poll_s = poll_s
        self._offsets: dict[str, int] = {}

    def __call__(self, path: str) -> list[str]:
        if path not in self._offsets:
            if not os.path.exists(path):
                open(path, "a", encoding="utf-8").close()
            self._offsets[path] = os.path.getsize(path)
        while True:
            lines = self._read_new_lines(path)
            if lines:
                return lines
            time.sleep(self._poll_s)

    def _read_new_lines(self, path: str) -> list[str]:
        size = os.path.getsize(path)
        if size < self._offsets[path]:  # arquivo truncado: recomeça do início
            self._offsets[path] = 0
        if size <= self._offsets[path]:
            return []
        with open(path, "rb") as handle:
            handle.seek(self._offsets[path])
            data = handle.read()
        end = data.rfind(b"\n")
        if end < 0:
            return []
        self._offsets[path] += end + 1
        text = data[: end + 1].decode("utf-8", errors="replace")
        return [line.strip() for line in text.splitlines() if line.strip()]


def _use_utf8_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)


def run_bridge(bridge_dir_option: str | None, robot_name: str | None,
               workspace: Workspace | None = None) -> None:
    workspace = workspace or Workspace()
    workspace.ensure_results_dir()
    _use_utf8_console()
    bridge_dir = find_bridge_dir(workspace, bridge_dir_option)
    bridge = load_bridge_module(bridge_dir)

    bridge._read_command_lines = CommandFileTail()  # comandos vêm do comandos.txt, não de um FIFO
    state = ConnectionStateFile(workspace.bridge_state)
    sys.stdout = BridgeOutputRecorder(sys.stdout, workspace, state)
    print(f"[ponte] bridge: {bridge_dir}")
    print(f"[ponte] resultados em: {workspace.results}")
    print("[ponte] deixe esta janela aberta. Em outra janela, use: python t.py")
    sys.argv = [
        f"{BRIDGE_MODULE}.py",
        "--print-only",
        "--log-robo", str(workspace.robot_log),
        "--comandos", str(workspace.commands),
    ] + (["--name", robot_name] if robot_name else [])
    try:
        bridge.main()
    except KeyboardInterrupt:
        print("[ponte] encerrada")
    finally:
        state.close()
