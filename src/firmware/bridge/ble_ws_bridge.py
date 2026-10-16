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

    # 3) SEM placa e SEM Bluetooth: reenvia as linhas JSON de um arquivo
    python ble_ws_bridge.py --replay exemplo/corrida.jsonl --ws ws://localhost:8080/ws/telemetria

Como a ponte se comporta (protocolo v1 do backend, src/backend/protocolo/v1):
- Só conecta ao backend depois de receber o `hello` do robô, e o envia primeiro
  a cada conexão nova. O backend fecha em 5 s uma conexão sem `hello`.
- Uma mensagem só sai da fila depois de enviada, e fica guardada até o `ack`
  do backend confirmá-la. Numa conexão nova, as não confirmadas são reenviadas;
  o backend descarta as duplicatas.
- Fechamento 4001 (token), 4002 (versão) ou 4003 (`hello` inválido): mostra o
  erro e espera o robô mandar outro `hello`, sem encerrar.
- Se o BLE cair, procura o robô de novo, sem encerrar.
- A fila tem limite: com o backend fora do ar por muito tempo, as mensagens mais
  antigas são descartadas, e a ponte avisa quantas.

Dependências:  pip install -r requirements.txt
"""

import argparse
import asyncio
import contextlib
import json
from collections import deque

# UUIDs do Nordic UART Service (iguais aos do BleTelemetryAdapter no firmware).
NUS_SERVICE = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
NUS_TX_CHAR = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"  # firmware -> ponte (notify)
DEVICE_NAME = "RatoBorrachudo"

# Fechamentos do backend que não se resolvem reenviando o mesmo `hello`.
DEFINITIVE_CLOSES = {
    4001: "dispositivo ou token inválido",
    4002: "versão do protocolo não suportada",
    4003: "hello malformado ou fora do prazo",
}
# Mensagens guardadas (na fila e à espera de ack). Uma corrida longa tem ~2000.
OUTBOX_LIMIT = 2000
RECONNECT_MIN_DELAY = 1.0
RECONNECT_MAX_DELAY = 10.0


class JsonReassembler:
    """Remonta mensagens JSON a partir de notificações BLE fragmentadas.

    O firmware delimita cada mensagem com '\\n'; aqui acumulamos os bytes e
    emitimos uma linha completa por vez.
    """

    def __init__(self):
        self._buffer = bytearray()

    def reset(self):
        """Descarta um pedaço incompleto (ex.: a conexão BLE caiu no meio)."""
        self._buffer.clear()

    def feed(self, data: bytes):
        self._buffer.extend(data)
        while b"\n" in self._buffer:
            line, _, rest = self._buffer.partition(b"\n")
            self._buffer = bytearray(rest)
            text = line.decode("utf-8", errors="replace").strip()
            if text:
                yield text


def _fields(line: str):
    """(tipo, corrida, sequencia) de uma linha JSON; None nos campos ausentes."""
    try:
        message = json.loads(line)
    except ValueError:
        return None, None, None
    if not isinstance(message, dict):
        return None, None, None
    return message.get("tipo"), message.get("corrida"), message.get("sequencia")


class Outbox:
    """O que a ponte guarda entre o robô e o backend. Não faz I/O.

    - `queue`: mensagens ainda não enviadas, em ordem.
    - `pending`: enviadas e ainda não confirmadas pelo `ack` do backend.
    - `hello`: o último `hello` do robô, enviado no início de cada conexão.
    """

    def __init__(self, limit: int = OUTBOX_LIMIT, log=print):
        self.queue: deque[str] = deque()
        self.pending: deque[tuple[str, int, str]] = deque()
        self.hello: str | None = None
        # O backend recusou o `hello` atual: só tenta de novo com outro `hello`.
        self.refused = False
        self.dropped = 0
        self._limit = limit
        self._log = log
        self._changed = asyncio.Event()

    # --- lado do robô ------------------------------------------------------

    def receive(self, line: str) -> None:
        tipo, _, _ = _fields(line)
        if tipo == "hello":
            # Um `hello` novo (o robô reconectou o BLE) vale outra tentativa. Um `hello`
            # anterior ainda na fila não pode sair depois dele: com outro `boot`, o backend
            # entenderia que o robô reiniciou e interromperia a corrida.
            self.hello = line
            self.refused = False
            self.queue = deque(q for q in self.queue if _fields(q)[0] != "hello")
        self._add(line)

    def _add(self, line: str) -> None:
        if len(self.queue) + len(self.pending) >= self._limit:
            # Descarta a mais antiga: as pendentes são anteriores às da fila.
            if self.pending:
                self.pending.popleft()
            else:
                self.queue.popleft()
            self.dropped += 1
            if self.dropped == 1 or self.dropped % 100 == 0:
                self._log(f"[fila] cheia: {self.dropped} mensagem(ns) antiga(s) descartada(s)")
        self.queue.append(line)
        self._changed.set()

    # --- lado do backend ---------------------------------------------------

    def ready(self) -> bool:
        return self.hello is not None and not self.refused

    async def wait_ready(self) -> None:
        while not self.ready():
            self._changed.clear()
            await self._changed.wait()

    def connection_start(self) -> list[str]:
        """O que enviar ao abrir uma conexão: o `hello` e as não confirmadas."""
        assert self.hello is not None
        # O `hello` guardado sai primeiro; o mesmo `hello` no início da fila é redundante.
        if self.queue and self.queue[0] == self.hello:
            self.queue.popleft()
        return [self.hello, *(line for _, _, line in self.pending)]

    async def next(self) -> str:
        """A próxima mensagem da fila, SEM retirá-la (ver `sent`)."""
        while not self.queue:
            self._changed.clear()
            await self._changed.wait()
        return self.queue[0]

    def sent(self, line: str) -> None:
        """A mensagem foi enviada: sai da fila e espera o ack."""
        if self.queue and self.queue[0] is line:
            self.queue.popleft()
        tipo, corrida, sequencia = _fields(line)
        if tipo != "hello" and isinstance(corrida, str) and isinstance(sequencia, int):
            self.pending.append((corrida, sequencia, line))

    def ack(self, corrida: str, sequencia: int) -> None:
        """Ack cumulativo do backend: tudo até `sequencia` da corrida está gravado."""
        self.pending = deque(p for p in self.pending if p[0] != corrida or p[1] > sequencia)
        self._changed.set()

    def refuse(self) -> None:
        self.refused = True

    def empty(self) -> bool:
        return not self.queue and not self.pending


# ----------------------------------------------------------------------------
# Produtores: BLE real ou replay de arquivo. Entregam cada linha a `deliver`.
# ----------------------------------------------------------------------------
def _is_robot(name: str):
    """Filtro do scan: pelo UUID do serviço NUS ou pelo nome anunciado."""
    service = NUS_SERVICE.lower()

    def match(device, advertisement) -> bool:
        uuids = [uuid.lower() for uuid in (advertisement.service_uuids or [])]
        return service in uuids or name in (device.name, advertisement.local_name)

    return match


async def produce_from_ble(device_name: str, deliver):
    """Produtor real: procura o robô, assina as notificações e repete se cair."""
    from bleak import BleakClient, BleakScanner
    from bleak.exc import BleakDBusError, BleakError

    loop = asyncio.get_running_loop()
    reassembler = JsonReassembler()

    def on_notify(_char, data: bytearray):
        for message in reassembler.feed(bytes(data)):
            deliver(message)

    while True:
        print(f"[ble] procurando o robô ('{device_name}' ou o serviço NUS)...")
        try:
            device = await BleakScanner.find_device_by_filter(_is_robot(device_name), timeout=10.0)
        except BleakDBusError as exc:
            raise SystemExit(
                f"[ble] falha ao falar com o BlueZ ({exc}).\n"
                "      O serviço Bluetooth do Linux não está ativo ou não há adaptador.\n"
                "      Verifique: sudo systemctl enable --now bluetooth ; bluetoothctl list\n"
                "      (No WSL não há Bluetooth: rode a ponte no SO nativo, ou use\n"
                "       --replay para testar sem rádio.)"
            ) from exc
        except (BleakError, OSError) as exc:
            print(f"[ble] erro de Bluetooth ({exc}); tentando de novo em 2 s")
            await asyncio.sleep(2.0)
            continue
        if device is None:
            print("[ble] robô não encontrado. A placa está ligada e anunciando?")
            continue

        print(f"[ble] encontrado: {device.address}")
        disconnected = asyncio.Event()
        reassembler.reset()
        try:
            async with BleakClient(
                device,
                disconnected_callback=lambda _client: loop.call_soon_threadsafe(disconnected.set),
            ) as client:
                print("[ble] conectado; assinando a telemetria (NUS TX)")
                await client.start_notify(NUS_TX_CHAR, on_notify)
                await disconnected.wait()
        except (BleakError, OSError, asyncio.TimeoutError) as exc:
            print(f"[ble] falha na conexão ({exc})")
        print("[ble] desconectado; procurando de novo em 1 s")
        await asyncio.sleep(1.0)


async def produce_from_replay(path: str, deliver, delay: float):
    """Produtor de teste: entrega cada linha não vazia do arquivo (JSON exato)."""
    print(f"[replay] reproduzindo as linhas de {path}")
    with open(path, "r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if line:
                deliver(line)
                await asyncio.sleep(delay)
    print("[replay] fim do arquivo")


# ----------------------------------------------------------------------------
# Consumidor: encaminha ao WebSocket do backend.
# ----------------------------------------------------------------------------
async def _read_acks(ws, outbox: Outbox):
    """Lê o que o backend envia (só `ack`) até a conexão fechar, e então lança."""
    while True:
        raw = await ws.recv()
        try:
            message = json.loads(raw)
        except ValueError:
            continue
        if isinstance(message, dict) and message.get("tipo") == "ack":
            corrida, sequencia = message.get("corrida"), message.get("sequencia")
            if isinstance(corrida, str) and isinstance(sequencia, int):
                outbox.ack(corrida, sequencia)


async def _forward(ws, outbox: Outbox):
    """Envia o início da conexão e depois a fila, até a conexão cair."""
    for line in outbox.connection_start():
        await ws.send(line)
    reader = asyncio.ensure_future(_read_acks(ws, outbox))
    try:
        while True:
            next_line = asyncio.ensure_future(outbox.next())
            done, _ = await asyncio.wait({next_line, reader}, return_when=asyncio.FIRST_COMPLETED)
            if reader in done:
                next_line.cancel()
                reader.result()  # lança o ConnectionClosed
            line = next_line.result()
            await ws.send(line)
            outbox.sent(line)
    finally:
        reader.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await reader


async def consume_to_ws(ws_url: str, outbox: Outbox, connect=None):
    """Encaminha ao backend, reconectando quando a conexão cai."""
    import websockets  # importado aqui para o --print-only não exigir o pacote

    connect = connect or websockets.connect
    delay = RECONNECT_MIN_DELAY
    while True:
        if not outbox.ready():
            print("[ws] esperando o hello do robô para conectar ao backend")
            await outbox.wait_ready()
        try:
            async with connect(ws_url) as ws:
                print(f"[ws] conectado a {ws_url}")
                delay = RECONNECT_MIN_DELAY
                await _forward(ws, outbox)
        except websockets.exceptions.ConnectionClosed as exc:
            code = exc.rcvd.code if exc.rcvd is not None else None
            if code in DEFINITIVE_CLOSES:
                print(
                    f"[ws] o backend recusou o hello ({code}: {DEFINITIVE_CLOSES[code]}). "
                    "Esperando o robô mandar outro hello."
                )
                outbox.refuse()
                continue
            print(f"[ws] conexão caiu ({exc}); reconectando em {delay:.0f} s")
        except (OSError, websockets.exceptions.WebSocketException, asyncio.TimeoutError) as exc:
            print(f"[ws] backend indisponível ({exc}); tentando de novo em {delay:.0f} s")
        await asyncio.sleep(delay)
        delay = min(delay * 2, RECONNECT_MAX_DELAY)


async def run(args):
    if args.ws is None:
        def deliver(line):
            print("[rx]", line)

        outbox = None
    else:
        outbox = Outbox()
        deliver = outbox.receive

    if args.replay is not None:
        producer = produce_from_replay(args.replay, deliver, args.interval)
    else:
        producer = produce_from_ble(args.name, deliver)

    consumer_task = asyncio.ensure_future(consume_to_ws(args.ws, outbox)) if outbox else None
    try:
        await producer  # o BLE roda para sempre; o replay termina com o arquivo
        if outbox is not None:
            # Replay: espera o backend confirmar tudo, por no máximo 10 s.
            for _ in range(100):
                if outbox.empty():
                    break
                await asyncio.sleep(0.1)
            if not outbox.empty():
                print(
                    f"[replay] {len(outbox.queue)} na fila e {len(outbox.pending)} "
                    "sem confirmação do backend"
                )
    finally:
        if consumer_task is not None:
            consumer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await consumer_task


def main():
    parser = argparse.ArgumentParser(description="Ponte BLE -> WebSocket")
    parser.add_argument("--ws", default=None,
                        help="URL do WebSocket do backend (ex.: ws://localhost:8080/ws/telemetria)")
    parser.add_argument("--name", default=DEVICE_NAME,
                        help="nome BLE anunciado pelo robô (a busca também aceita o serviço NUS)")
    parser.add_argument("--print-only", action="store_true",
                        help="apenas imprime o JSON recebido (não conecta no WebSocket)")
    parser.add_argument("--replay", metavar="ARQUIVO", default=None,
                        help="não usa BLE: reenvia cada linha JSON do ARQUIVO (teste sem placa)")
    parser.add_argument("--interval", type=float, default=0.5,
                        help="intervalo (s) entre mensagens no --replay (padrão 0,5)")
    args = parser.parse_args()

    if args.print_only:
        args.ws = None
    elif args.ws is None:
        parser.error("informe --ws <url>, ou use --print-only (opcionalmente com --replay)")

    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(args))


if __name__ == "__main__":
    main()
