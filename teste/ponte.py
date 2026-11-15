"""Ponte Bluetooth para os testes do robô (Windows, Linux ou macOS).

Uso, com o Bluetooth do computador ligado e o robô ligado na BATERIA:

    python ponte.py

Deixe esta janela aberta durante todos os testes. Ela roda a ponte do repositório
(src/firmware/bridge/ble_ws_bridge.py) sem mudar nada nela, e só acrescenta:

- os comandos vêm do arquivo resultados/comandos.txt (o t.py escreve nele); o Windows não tem FIFO;
- tudo o que aparece na tela também vai para resultados/ponte.out;
- as linhas de log do robô vão para resultados/log_robo.txt (isso a ponte já faz);
- a telemetria (JSON) vai para resultados/telemetria.jsonl;
- resultados/estado.txt diz se o robô está conectado e qual é o boot atual (o t.py lê).

Para fechar: Ctrl+C.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "resultados"


def find_bridge(explicit):
    candidates = [Path(explicit)] if explicit else []
    candidates += [HERE.parent / "src" / "firmware" / "bridge", HERE / "bridge", Path.cwd()]
    for folder in candidates:
        if (folder / "ble_ws_bridge.py").exists():
            return folder
    sys.exit(
        "Não achei o ble_ws_bridge.py. A pasta teste-v3 tem de ficar na RAIZ do repositório "
        "(ao lado de src/), ou passe --bridge <pasta do bridge>."
    )


class Tee:
    """Copia a saída da ponte para o ponte.out e mantém o estado.txt e a telemetria."""

    def __init__(self, stream):
        self.stream = stream
        self.out = open(RESULTS / "ponte.out", "a", encoding="utf-8")
        self.partial = ""
        self.state = {"conectado": False, "boot": "", "desde": time.strftime("%H:%M:%S")}
        self.save()

    def save(self):
        temp = RESULTS / "estado.tmp"
        temp.write_text(json.dumps(self.state), encoding="utf-8")
        for _ in range(20):  # no Windows a troca falha se o t.py estiver lendo o arquivo agora
            try:
                os.replace(temp, RESULTS / "estado.txt")
                return
            except OSError:
                time.sleep(0.05)

    def line(self, text):
        changed = False
        if text.startswith("[ble] conectado"):
            self.state.update(conectado=True, desde=time.strftime("%H:%M:%S"))
            changed = True
        elif text.startswith("[ble] desconectado") or text.startswith("[ble] procurando"):
            if self.state["conectado"]:
                self.state.update(conectado=False, desde=time.strftime("%H:%M:%S"))
                changed = True
        elif text.startswith("[rx] "):
            payload = text[5:]
            with open(RESULTS / "telemetria.jsonl", "a", encoding="utf-8") as out:
                out.write(payload + "\n")
            if '"hello"' in payload:
                try:
                    boot = str(json.loads(payload).get("boot", ""))
                except ValueError:
                    boot = ""
                if boot and boot != self.state["boot"]:
                    self.state.update(boot=boot, conectado=True)
                    changed = True
        if changed:
            self.save()

    def write(self, data):
        self.stream.write(data)
        self.out.write(data)
        self.partial += data
        while "\n" in self.partial:
            text, self.partial = self.partial.split("\n", 1)
            self.line(text.rstrip("\r"))
        return len(data)

    def flush(self):
        self.stream.flush()
        self.out.flush()


_offsets = {}


def tail_new_lines(path, poll_s=0.15):
    """Como um `tail -f`: bloqueia até aparecerem linhas completas novas e devolve só essas."""
    if path not in _offsets:
        if not os.path.exists(path):
            open(path, "a", encoding="utf-8").close()
        _offsets[path] = os.path.getsize(path)  # o que já estava no arquivo não é reenviado
    while True:
        size = os.path.getsize(path)
        if size < _offsets[path]:
            _offsets[path] = 0
        if size > _offsets[path]:
            with open(path, "rb") as handle:
                handle.seek(_offsets[path])
                data = handle.read()
            end = data.rfind(b"\n")
            if end >= 0:
                _offsets[path] += end + 1
                text = data[: end + 1].decode("utf-8", errors="replace")
                lines = [line.strip() for line in text.splitlines() if line.strip()]
                if lines:
                    return lines
        time.sleep(poll_s)


def main():
    parser = argparse.ArgumentParser(description="Ponte BLE para os testes do robô")
    parser.add_argument("--bridge", default=None, help="pasta do ble_ws_bridge.py")
    parser.add_argument("--name", default=None, help="nome BLE do robô, se não for o padrão")
    args = parser.parse_args()

    RESULTS.mkdir(exist_ok=True)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    bridge = find_bridge(args.bridge)
    sys.path.insert(0, str(bridge))
    try:
        import ble_ws_bridge
    except ImportError as error:
        sys.exit(
            f"Falta uma biblioteca do Python ({error}). Rode:\n"
            f"    python -m pip install -r \"{bridge / 'requirements.txt'}\""
        )

    ble_ws_bridge._read_command_lines = tail_new_lines
    sys.stdout = Tee(sys.stdout)
    print(f"[ponte] bridge: {bridge}")
    print(f"[ponte] resultados em: {RESULTS}")
    print("[ponte] deixe esta janela aberta. Em outra janela, use: python t.py")
    sys.argv = [
        "ble_ws_bridge.py",
        "--print-only",
        "--log-robo", str(RESULTS / "log_robo.txt"),
        "--comandos", str(RESULTS / "comandos.txt"),
    ] + (["--name", args.name] if args.name else [])
    try:
        ble_ws_bridge.main()
    except KeyboardInterrupt:
        print("[ponte] encerrada")
    finally:
        sys.stdout.state["conectado"] = False
        sys.stdout.save()


if __name__ == "__main__":
    main()
