"""Testes da ponte BLE -> WebSocket (#354), sem Bluetooth.

O lado do robô é simulado chamando `Outbox.receive`, como o produtor BLE faz. O lado
do backend é um servidor WebSocket real que segue as regras do protocolo v1: `hello`
primeiro, fechamento 4001/4003, `ack` cumulativo e descarte de duplicatas.
"""

import asyncio
import json
import os
import sys

import pytest
import websockets

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import ble_ws_bridge as ponte  # noqa: E402

TOKEN = "T-VALIDO"


def hello(token=TOKEN, boot="b1"):
    return json.dumps(
        {"tipo": "hello", "versao": 1, "dispositivo": "rato-01", "token": token, "boot": boot}
    )


def mensagem(sequencia, corrida="c1"):
    return json.dumps(
        {"versao": 1, "tipo": "posicao", "corrida": corrida, "sequencia": sequencia,
         "tempo_ms": sequencia * 100, "x": 0, "y": 0, "orientacao": "NORTE", "celulas": 0}
    )


class BackendFalso:
    """Backend mínimo com as regras do protocolo que importam para a ponte."""

    def __init__(self, token=TOKEN):
        self.token = token
        self.gravadas: dict[str, set[int]] = {}
        self.conexoes = 0
        self.primeiras: list[str] = []
        # Quantas das próximas mensagens recebe sem gravar nem confirmar (queda no meio).
        self.perder_proximas = 0
        self.porta = 0
        self._servidor = None

    async def _atender(self, ws):
        self.conexoes += 1
        try:
            primeira = await asyncio.wait_for(ws.recv(), 1.0)
        except asyncio.TimeoutError:
            await ws.close(4003, "hello fora do prazo")
            return
        self.primeiras.append(primeira)
        dados = json.loads(primeira)
        if dados.get("tipo") != "hello":
            await ws.close(4003, "hello malformado")
            return
        if dados.get("token") != self.token:
            await ws.close(4001, "token inválido")
            return
        async for bruto in ws:
            dados = json.loads(bruto)
            if dados["tipo"] == "hello":
                continue
            if self.perder_proximas > 0:
                self.perder_proximas -= 1
                continue
            seqs = self.gravadas.setdefault(dados["corrida"], set())
            seqs.add(dados["sequencia"])
            contigua = 0
            while contigua + 1 in seqs:
                contigua += 1
            await ws.send(json.dumps({"tipo": "ack", "corrida": dados["corrida"],
                                      "sequencia": contigua}))

    async def subir(self):
        self._servidor = await websockets.serve(self._atender, "127.0.0.1", self.porta)
        self.porta = next(iter(self._servidor.sockets)).getsockname()[1]

    async def derrubar(self):
        self._servidor.close()
        await self._servidor.wait_closed()

    @property
    def url(self):
        return f"ws://127.0.0.1:{self.porta}/ws/telemetria"


@pytest.fixture(autouse=True)
def reconexao_rapida(monkeypatch):
    monkeypatch.setattr(ponte, "RECONNECT_MIN_DELAY", 0.05)
    monkeypatch.setattr(ponte, "RECONNECT_MAX_DELAY", 0.1)


async def esperar(condicao, prazo=5.0):
    limite = asyncio.get_running_loop().time() + prazo
    while not condicao():
        if asyncio.get_running_loop().time() > limite:
            raise AssertionError("condição não atingida no prazo")
        await asyncio.sleep(0.01)


async def com_ponte(backend, corpo):
    """Roda `corpo(outbox)` com a ponte encaminhando para o backend falso."""
    outbox = ponte.Outbox(log=lambda *_: None)
    tarefa = asyncio.ensure_future(ponte.consume_to_ws(backend.url, outbox))
    try:
        await corpo(outbox)
    finally:
        tarefa.cancel()
        with pytest.raises(asyncio.CancelledError):
            await tarefa


# --- Remontagem das notificações BLE ----------------------------------------


def test_remonta_linhas_fragmentadas_e_descarta_pedaco_ao_reconectar():
    r = ponte.JsonReassembler()
    assert list(r.feed(b'{"a":1}\n{"b"')) == ['{"a":1}']
    assert list(r.feed(b':2}\n\n')) == ['{"b":2}']
    assert list(r.feed(b'{"pedaco":')) == []
    r.reset()  # o BLE caiu no meio da mensagem
    assert list(r.feed(b'{"c":3}\n')) == ['{"c":3}']


# --- Contagem da recepção (#381) ------------------------------------------------


def test_recepcao_aponta_lacunas_e_as_tira_quando_a_mensagem_chega_depois():
    avisos = []
    stats = ponte.ReceptionStats(log=avisos.append)
    stats.observe(hello())
    for sequencia in (1, 2, 5, 6):
        stats.observe(mensagem(sequencia))
    assert stats.missing["c1"] == {3, 4}
    assert avisos == ["[rx] lacuna na corrida c1: seq 3 a 4"]

    stats.observe(mensagem(3))  # o firmware reenvia o buffer ao reconectar
    assert stats.missing["c1"] == {4}
    assert stats.repeated == 0
    assert "corrida c1: seq 1 a 6, faltando 1 (4)" in stats.summary()


def test_recepcao_conta_repetidas_e_separa_as_corridas():
    stats = ponte.ReceptionStats(log=lambda *_: None)
    for sequencia in (1, 2, 2, 1):  # cópias do inicio_corrida e reenvio
        stats.observe(mensagem(sequencia))
    stats.observe(mensagem(1, corrida="c2"))
    assert stats.repeated == 2
    assert stats.highest == {"c1": 2, "c2": 1}
    assert stats.missing == {"c1": set(), "c2": set()}


def test_recepcao_conta_as_mensagens_do_firmware_de_diagnostico():
    # Formato do comando `ble` do esp32-diagnostico (TESTES_HARDWARE.md, teste 3.15).
    stats = ponte.ReceptionStats(log=lambda *_: None)
    for sequencia in (1, 2, 4):
        stats.observe(
            '{"tipo":"diagnostico","corrida":"diagnostico","sequencia":%d,"tempo_ms":0}' % sequencia
        )
    assert "corrida diagnostico: seq 1 a 4, faltando 1 (3)" in stats.summary()


def test_recepcao_conta_linha_quebrada_como_invalida():
    avisos = []
    stats = ponte.ReceptionStats(log=avisos.append)
    stats.observe('{"versao":1,"tipo":"posicao","corr')  # pedaço que falhou no meio
    assert stats.invalid == 1
    assert stats.received == 1
    assert avisos[0].startswith("[rx] linha inválida (34 bytes)")


# --- Outbox (sem rede) ---------------------------------------------------------


def test_fila_limitada_descarta_as_mais_antigas_e_conta():
    avisos = []
    outbox = ponte.Outbox(limit=3, log=avisos.append)
    for s in range(1, 6):
        outbox.receive(mensagem(s))
    assert [json.loads(m)["sequencia"] for m in outbox.queue] == [3, 4, 5]
    assert outbox.dropped == 2
    assert avisos  # avisou o descarte


def test_ack_cumulativo_libera_as_pendentes_da_corrida():
    outbox = ponte.Outbox()
    for s in (1, 2, 3):
        outbox.receive(mensagem(s))
        outbox.sent(outbox.queue[0])
    outbox.receive(mensagem(1, corrida="c2"))
    outbox.sent(outbox.queue[0])
    outbox.ack("c1", 2)
    assert [(c, s) for c, s, _ in outbox.pending] == [("c1", 3), ("c2", 1)]


def test_hello_novo_tira_o_antigo_da_fila():
    outbox = ponte.Outbox()
    outbox.receive(hello(boot="b1"))
    outbox.receive(mensagem(1))
    outbox.receive(hello(boot="b2"))
    tipos = [json.loads(m)["tipo"] + json.loads(m).get("boot", "") for m in outbox.queue]
    assert tipos == ["posicao", "hellob2"]


# --- Ponte com o backend ------------------------------------------------------


def test_sem_hello_nao_conecta_e_com_hello_ele_sai_primeiro():
    async def cenario():
        backend = BackendFalso()
        await backend.subir()

        async def corpo(outbox):
            outbox.receive(mensagem(1))  # mensagem antes do hello: só guarda
            await asyncio.sleep(0.3)
            assert backend.conexoes == 0
            outbox.receive(hello())
            await esperar(lambda: backend.gravadas.get("c1") == {1})
            assert json.loads(backend.primeiras[0])["tipo"] == "hello"

        await com_ponte(backend, corpo)
        await backend.derrubar()

    asyncio.run(cenario())


def test_reinicio_do_backend_no_meio_da_corrida_nao_perde_mensagens():
    async def cenario():
        backend = BackendFalso()
        await backend.subir()

        async def corpo(outbox):
            outbox.receive(hello())
            for s in range(1, 21):
                outbox.receive(mensagem(s))
            await esperar(lambda: len(backend.gravadas.get("c1", ())) == 20)

            # O backend recebe 3 mensagens, cai antes de gravá-las e fica fora por um tempo.
            backend.perder_proximas = 3
            for s in range(21, 24):
                outbox.receive(mensagem(s))
            await asyncio.sleep(0.1)
            await backend.derrubar()
            for s in range(24, 41):
                outbox.receive(mensagem(s))
            await asyncio.sleep(0.3)
            await backend.subir()

            await esperar(lambda: backend.gravadas.get("c1") == set(range(1, 41)))
            await esperar(outbox.empty)
            # Toda conexão começou pelo hello.
            assert all(json.loads(p)["tipo"] == "hello" for p in backend.primeiras)
            assert backend.conexoes >= 2

        await com_ponte(backend, corpo)
        await backend.derrubar()

    asyncio.run(cenario())


def test_token_recusado_mantem_a_ponte_viva_ate_o_proximo_hello():
    async def cenario():
        backend = BackendFalso()
        await backend.subir()

        async def corpo(outbox):
            outbox.receive(hello(token="ERRADO"))
            outbox.receive(mensagem(1))
            await esperar(lambda: outbox.refused)
            await asyncio.sleep(0.3)
            assert backend.conexoes == 1  # não fica reconectando com o mesmo hello

            # O token foi corrigido e o robô reconectou o BLE: um hello novo chega.
            outbox.receive(hello())
            await esperar(lambda: backend.gravadas.get("c1") == {1})

        await com_ponte(backend, corpo)
        await backend.derrubar()

    asyncio.run(cenario())


def test_hello_no_meio_da_conexao_segue_em_ordem():
    async def cenario():
        backend = BackendFalso()
        recebidos = []
        original = backend._atender

        async def espiao(ws):
            async def recv_espiado(orig=ws.recv):
                bruto = await orig()
                recebidos.append(json.loads(bruto)["tipo"])
                return bruto

            ws.recv = recv_espiado
            await original(ws)

        backend._atender = espiao
        await backend.subir()

        async def corpo(outbox):
            outbox.receive(hello())
            outbox.receive(mensagem(1))
            await esperar(lambda: backend.gravadas.get("c1") == {1})
            outbox.receive(hello())  # o BLE do robô reconectou; o WS seguiu aberto
            outbox.receive(mensagem(2))
            await esperar(lambda: backend.gravadas.get("c1") == {1, 2})

        await com_ponte(backend, corpo)
        await backend.derrubar()
        assert recebidos == ["hello", "posicao", "hello", "posicao"]
        assert backend.conexoes == 1

    asyncio.run(cenario())
