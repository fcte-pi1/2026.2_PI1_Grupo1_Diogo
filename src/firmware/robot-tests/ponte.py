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

O código fica em suite/bridge_session.py; este arquivo é só o ponto de entrada.
"""

import argparse

from suite.bridge_session import run_bridge


def main() -> None:
    parser = argparse.ArgumentParser(description="Ponte BLE para os testes do robô")
    parser.add_argument("--bridge", default=None, help="pasta do ble_ws_bridge.py")
    parser.add_argument("--name", default=None, help="nome BLE do robô, se não for o padrão")
    args = parser.parse_args()
    run_bridge(args.bridge, args.name)


if __name__ == "__main__":
    main()
