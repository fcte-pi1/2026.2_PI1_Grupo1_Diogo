#!/usr/bin/env python3
"""Ponte BLE -> WebSocket do "Rato Borrachudo" (Opção A).

Assina as notificações BLE do firmware (serviço Nordic UART / NUS) e repassa
cada mensagem JSON ao backend via WebSocket. Assim, todo o protocolo
JSON/WebSocket a jusante (backend, frontend, simulador) fica INTACTO: para o
backend, a ponte é apenas mais um cliente WebSocket emissor de telemetria.

Uso:
    # 1) Teste isolado do BLE (sem backend): só imprime o que o robô envia
    python ble_ws_bridge.py --print-only

    # 2) Operação normal: BLE -> WebSocket do backend
    python ble_ws_bridge.py --ws ws://localhost:8080/ws/telemetria

    # 3) SEM placa e SEM Bluetooth: injeta mensagens de exemplo (shape do
    #    protocolo v1) para exercitar o lado ponte->backend
    python ble_ws_bridge.py --simulate --ws ws://localhost:8080/ws/telemetria
    python ble_ws_bridge.py --simulate --print-only

    # 4) SEM placa: reenvia linhas JSON EXATAS de um arquivo (uma por linha)
    python ble_ws_bridge.py --replay amostra.jsonl --ws ws://localhost:8080/ws/telemetria

A ponte é o CLIENTE WebSocket do robô (protocolo v1, PR #337): conecta em
/ws/telemetria, encaminha cada linha JSON do BLE como um frame de texto, deixa
a biblioteca responder ao ping do backend e trata o fecho 4001 (token inválido)
/ 4002 (versão não suportada) como erro fatal (não adianta reconectar).

Os modos --simulate e --replay NÃO usam Bluetooth: servem para testar a ponte e
o backend num PC sem o rádio BLE e sem o robô físico.

Dependências:  pip install bleak websockets
"""

import argparse
import asyncio
import contextlib

# UUIDs do Nordic UART Service (iguais aos do BleTelemetryAdapter no firmware).
NUS_TX_CHAR = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # firmware -> ponte (notify)
DEVICE_NAME = "RatoBorrachudo"


class JsonReassembler:
    """Remonta mensagens JSON a partir de notificações BLE fragmentadas.

    O firmware delimita cada mensagem com '\\n'; aqui acumulamos os bytes e
    emitimos uma linha completa por vez.
    """

    def __init__(self):
        self._buffer = bytearray()

    def feed(self, data: bytes):
        self._buffer.extend(data)
        while b"\n" in self._buffer:
            line, _, rest = self._buffer.partition(b"\n")
            self._buffer = bytearray(rest)
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                yield text


# ----------------------------------------------------------------------------
# Produtores da fila (outbox): BLE real, simulação ou replay de arquivo.
# ----------------------------------------------------------------------------
async def produce_from_ble(device_name: str, outbox: "asyncio.Queue[str]"):
    """Produtor real: escaneia o robô, conecta e assina as notificações NUS."""
    from bleak import BleakClient, BleakScanner
    from bleak.exc import BleakDBusError, BleakError

    print(f"[ble] procurando '{device_name}'...")
    try:
        device = await BleakScanner.find_device_by_name(device_name, timeout=15.0)
    except BleakDBusError as exc:
        raise SystemExit(
            f"[ble] falha ao falar com o BlueZ ({exc}).\n"
            "      O serviço Bluetooth do Linux não está ativo ou não há adaptador.\n"
            "      Verifique: sudo systemctl enable --now bluetooth ; bluetoothctl list\n"
            "      (No WSL não há Bluetooth — rode a ponte no SO nativo, ou use\n"
            "       --simulate / --replay para testar sem rádio.)"
        ) from exc
    except BleakError as exc:
        raise SystemExit(f"[ble] erro de Bluetooth: {exc}") from exc

    if device is None:
        raise SystemExit(
            f"[ble] dispositivo '{device_name}' não encontrado.\n"
            "      A placa está ligada e anunciando? Sem o robô, use --simulate/--replay."
        )
    print(f"[ble] encontrado: {device.address}")

    reassembler = JsonReassembler()

    def on_notify(_char, data: bytearray):
        for message in reassembler.feed(bytes(data)):
            outbox.put_nowait(message)

    async with BleakClient(device) as client:
        print("[ble] conectado; assinando telemetria (NUS TX)")
        await client.start_notify(NUS_TX_CHAR, on_notify)
        # Mantém a conexão viva; on_notify alimenta a outbox em segundo plano.
        while client.is_connected:
            await asyncio.sleep(1.0)
        print("[ble] desconectado")


async def produce_from_replay(path: str, outbox: "asyncio.Queue[str]", delay: float):
    """Produtor de teste: envia cada linha não vazia do arquivo (JSON exato)."""
    print(f"[sim] reproduzindo linhas de {path}")
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if line:
                outbox.put_nowait(line)
                await asyncio.sleep(delay)
    print("[sim] fim do arquivo")


async def produce_from_simulation(outbox: "asyncio.Queue[str]", delay: float):
    """Produtor de teste: sequência ILUSTRATIVA no formato do protocolo v1.

    Serve para checar o encaminhamento ponte->backend sem placa nem Bluetooth.
    As mensagens seguem o envelope {v,tipo,corrida,seq,t}; se o backend validar
    por schema (Ajv) e recusar algum campo, use --replay com linhas exatas
    capturadas do firmware.
    """
    import json

    corrida = "sim-0001"
    seq = 0
    t = 0

    def envelope(tipo: str, **campos) -> str:
        nonlocal seq, t
        seq += 1
        t += 100
        return json.dumps({"v": 1, "tipo": tipo, "corrida": corrida,
                            "seq": seq, "t": t, **campos}, ensure_ascii=False)

    print("[sim] gerando telemetria de exemplo (protocolo v1)")
    outbox.put_nowait(envelope("hello", dispositivo="rato-01", versao="1"))
    outbox.put_nowait(envelope("inicio_corrida", indice=1, labirinto="8x4"))
    outbox.put_nowait(envelope("estado", estado="MAPEANDO"))
    for i in range(4):
        outbox.put_nowait(envelope("celula", x=i, y=0,
                                   n=False, l=False, s=True, o=(i == 0)))
        outbox.put_nowait(envelope("posicao", x=i, y=0,
                                   orientacao="L", celulas=i + 1, velocidade=0.25))
        outbox.put_nowait(envelope("energia", tensao=7.4, corrente=0.35, potencia=2.59))
        await asyncio.sleep(delay)
    outbox.put_nowait(envelope("fim_corrida", resultado="sucesso"))
    print("[sim] sequência concluída")


# ----------------------------------------------------------------------------
# Consumidores da fila: imprimir ou encaminhar ao WebSocket do backend.
# ----------------------------------------------------------------------------
async def consume_print(outbox: "asyncio.Queue[str]"):
    while True:
        print("[rx]", await outbox.get())


async def consume_to_ws(ws_url: str, outbox: "asyncio.Queue[str]"):
    """Encaminha mensagens ao backend, reconectando o WebSocket se cair.

    A fila (outbox) desacopla a origem do WebSocket: se o backend oscilar, a
    origem continua produzindo e a ponte reenvia ao reconectar.
    """
    import websockets  # importado aqui para os modos sem WS não exigirem o pacote

    while True:
        try:
            async with websockets.connect(ws_url) as ws:
                print(f"[ws] conectado a {ws_url}")
                while True:
                    message = await outbox.get()
                    await ws.send(message)
        except websockets.exceptions.ConnectionClosed as exc:
            # 4001 = token inválido, 4002 = versão não suportada: erro fatal.
            if exc.rcvd is not None and exc.rcvd.code in (4001, 4002):
                print(f"[ws] fecho fatal {exc.rcvd.code}: {exc.rcvd.reason}")
                return
            print(f"[ws] conexão caiu ({exc}); reconectando em 2s")
            await asyncio.sleep(2.0)
        except Exception as exc:  # backend fora do ar / recusa de conexão
            print(f"[ws] indisponível ({exc}); tentando de novo em 2s")
            await asyncio.sleep(2.0)


async def run(args):
    outbox: asyncio.Queue[str] = asyncio.Queue()

    if args.replay is not None:
        producer = produce_from_replay(args.replay, outbox, args.interval)
    elif args.simulate:
        producer = produce_from_simulation(outbox, args.interval)
    else:
        producer = produce_from_ble(args.name, outbox)

    consumer = consume_print(outbox) if args.ws is None else consume_to_ws(args.ws, outbox)

    consumer_task = asyncio.ensure_future(consumer)
    try:
        await producer  # BLE roda "para sempre"; simulate/replay terminam ao acabar
        if args.simulate or args.replay is not None:
            # Dá tempo de drenar a fila antes de encerrar nos modos finitos.
            while not outbox.empty():
                await asyncio.sleep(0.1)
            await asyncio.sleep(0.5)
    finally:
        consumer_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await consumer_task


def main():
    parser = argparse.ArgumentParser(description="Ponte BLE -> WebSocket")
    parser.add_argument("--ws", default=None,
                        help="URL do WebSocket do backend (ex.: ws://localhost:8080/ws/telemetria)")
    parser.add_argument("--name", default=DEVICE_NAME,
                        help="nome BLE anunciado pelo robô")
    parser.add_argument("--print-only", action="store_true",
                        help="apenas imprime o JSON recebido (não conecta no WebSocket)")
    parser.add_argument("--simulate", action="store_true",
                        help="não usa BLE: gera telemetria de exemplo (teste sem placa)")
    parser.add_argument("--replay", metavar="ARQUIVO", default=None,
                        help="não usa BLE: reenvia cada linha JSON do ARQUIVO (teste sem placa)")
    parser.add_argument("--interval", type=float, default=0.5,
                        help="intervalo (s) entre mensagens em --simulate/--replay (padrão 0,5)")
    args = parser.parse_args()

    if args.simulate and args.replay is not None:
        parser.error("use --simulate OU --replay, não os dois")
    if args.print_only:
        args.ws = None
    elif args.ws is None:
        parser.error("informe --ws <url>, ou use --print-only (opcionalmente com --simulate/--replay)")

    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args))


if __name__ == "__main__":
    main()
