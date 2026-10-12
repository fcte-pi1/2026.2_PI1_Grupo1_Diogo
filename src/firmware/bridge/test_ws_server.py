#!/usr/bin/env python3
"""Servidor WebSocket MÍNIMO de teste - "Rato Borrachudo".

NÃO é o backend. É um alvo descartável para exercitar a ponte sem o backend
real: escuta em /ws/telemetria, imprime cada mensagem recebida e (opcional)
responde um `ack`. Útil com:

    # terminal 1
    python test_ws_server.py
    # terminal 2
    python ble_ws_bridge.py --simulate --ws ws://localhost:8080/ws/telemetria

Aceita qualquer caminho (só avisa se não for /ws/telemetria). Não valida schema
nem token - é plumbing, não o backend.

Dependências:  pip install websockets
"""

import argparse
import asyncio
import json

import websockets


def make_handler(send_ack: bool):
    async def handler(websocket, path=None):
        # Compatível com websockets novas (path em websocket.request.path) e antigas.
        if path is None:
            request = getattr(websocket, "request", None)
            path = getattr(request, "path", "?")
        peer = getattr(websocket, "remote_address", ("?", 0))
        print(f"[srv] conexão aberta de {peer} em {path}")
        if path not in ("/ws/telemetria", "?"):
            print(f"[srv] aviso: caminho inesperado '{path}' (esperado /ws/telemetria)")
        count = 0
        try:
            async for message in websocket:
                count += 1
                tipo = ""
                try:
                    tipo = f"  tipo={json.loads(message).get('tipo')}"
                except (ValueError, TypeError):
                    pass
                print(f"[srv] #{count}{tipo}  {message}")
                if send_ack:
                    try:
                        data = json.loads(message)
                        await websocket.send(json.dumps(
                            {"v": 1, "tipo": "ack", "corrida": data.get("corrida"),
                             "seq": data.get("seq")}))
                    except (ValueError, TypeError):
                        pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            print(f"[srv] conexão fechada ({count} mensagens recebidas)")

    return handler


async def main_async(host: str, port: int, send_ack: bool):
    async with websockets.serve(make_handler(send_ack), host, port):
        print(f"[srv] escutando em ws://{host}:{port}/ws/telemetria  (Ctrl-C para sair)")
        await asyncio.Future()  # roda até ser interrompido


def main():
    parser = argparse.ArgumentParser(description="Servidor WebSocket mínimo de teste")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--ack", action="store_true",
                        help="responder um 'ack' informativo a cada mensagem")
    args = parser.parse_args()
    try:
        asyncio.run(main_async(args.host, args.port, args.ack))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
