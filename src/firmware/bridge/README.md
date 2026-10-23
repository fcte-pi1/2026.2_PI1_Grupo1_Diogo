# Ponte BLE → WebSocket - "Rato Borrachudo"

Converte a telemetria BLE do firmware (ESP32-S3) em mensagens WebSocket para o
backend, preservando todo o protocolo JSON/WebSocket a jusante (Opção A).

```mermaid
graph LR
    A[ESP32 / firmware] -->|BLE NUS notify| B[ponte Python]
    B -->|WebSocket/JSON| C[backend]
    C --> D[frontend]
```

## Instalação
```bash
python -m venv .venv && source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

**No Windows:**
- crie o `venv` num caminho **curto** (ex.: `C:\rato\.venv`). Em caminho longo, a biblioteca de Bluetooth do Windows não carrega;
- o Bluetooth do PC precisa estar **ligado** antes de iniciar a ponte.

## Uso
```bash
# Teste do BLE isolado (sem backend): imprime o JSON que o robô envia
python ble_ws_bridge.py --print-only

# Operação: BLE -> WebSocket do backend
python ble_ws_bridge.py --ws ws://localhost:8080/ws/telemetria
```

Valide primeiro com `--print-only`: se o JSON aparecer no terminal, o BLE está
funcionando, e a primeira linha depois de conectar tem que ser o `hello`. Só
então ligue no backend. (baby steps)

A ponte procura o robô pelo **serviço Nordic UART** (UUID `6E400001-…`) ou pelo
nome `RatoBorrachudo` (`--name` muda o nome).

## Como a ponte se comporta

| Situação | O que a ponte faz |
|:--|:--|
| Robô desligado ou fora do alcance | Procura de novo, sem encerrar, e **não abre conexão com o backend** até receber o `hello` |
| Conexão nova com o backend | Envia o último `hello` do robô primeiro, depois as mensagens não confirmadas e então a fila |
| Backend fora do ar ou reiniciando | Guarda as mensagens e reconecta (1 s, 2 s, … até 10 s). Nada se perde: o que foi enviado e não confirmado pelo `ack` é reenviado, e o backend descarta as duplicatas |
| Backend fecha com `4001`, `4002` ou `4003` | Mostra o erro (token, versão ou `hello` inválido) e espera o robô mandar **outro** `hello`, sem ficar reconectando |
| BLE cai no meio da corrida | Procura o robô de novo; ao reconectar, o firmware reenvia o `hello` e o buffer de 60 s |
| Backend fora do ar por muito tempo | A fila guarda até 2000 mensagens; acima disso descarta as mais antigas e avisa quantas |

## Diagnóstico de perda de mensagens (#381)

A ponte confere a `sequencia` de cada corrida e avisa na hora quando falta alguma:

```
[rx] lacuna na corrida r9f3a1c-1: seq 41 a 42
[rx] linha inválida (87 bytes): {"versao":1,"tipo":"posicao","corrida":"r9f3a1c-1","sequ
```

A cada queda do BLE, e ao encerrar a ponte, ela mostra um resumo:

```
[rx] 312 linhas: 0 inválidas, 4 repetidas; corrida r9f3a1c-1: seq 1 a 308, faltando 2 (41, 42)
```

O firmware mostra no log serial, a cada 10 s de corrida, os contadores do lado dele: `enviadas`, `descartadas`, `notify recusado`, `erro de status` e o `MTU`. Comparar os dois lados mostra onde a mensagem some:

| Firmware | Ponte | Onde a mensagem se perdeu |
|:--|:--|:--|
| `descartadas` > 0 | Faltam sequências | **No firmware:** a pilha BLE recusou a notificação (fila cheia) |
| Tudo em 0 | **Linhas inválidas** | **Na divisão em notificações:** a mensagem chegou quebrada |
| Tudo em 0 | Faltam sequências, nenhuma linha inválida | **No rádio ou no receptor:** Bluetooth do PC, driver ou `bleak`. Repita com a ponte em outro sistema operacional para confirmar |

As "repetidas" são esperadas:
- o robô manda o `inicio_corrida` e o `fim_corrida` três vezes, com a mesma sequência, para que uma perda não deixe a corrida sem início ou sem resultado;
- ao reconectar, o robô reenvia o buffer de 60 s.

O backend descarta as cópias.

## Testes SEM placa e SEM Bluetooth

O `--replay` reenvia as linhas JSON de um arquivo, uma mensagem por linha. O
`exemplo/corrida.jsonl` é uma corrida completa no 4x4, no formato do contrato,
com o `hello` do `rato-01` e o token padrão do seed (`troque-em-build`):

```bash
# Backend no ar, com o seed
docker compose up -d && docker compose exec backend npm run seed

python ble_ws_bridge.py --replay exemplo/corrida.jsonl --print-only
python ble_ws_bridge.py --replay exemplo/corrida.jsonl --ws ws://localhost:8080/ws/telemetria --interval 0.3
```

- `--interval <s>` ajusta o ritmo entre mensagens (padrão 0,5 s; use `0` para rajada).
- **Reinício do backend:** durante o replay acima, rode `docker compose restart backend`.
  As 45 mensagens da corrida têm que chegar ao banco, e a corrida termina `CONCLUIDA`.
- O `test_ws_server.py` é um servidor WebSocket descartável que só imprime o que
  recebe, para testar a ponte sem o backend.

## Testes automatizados

```bash
pip install -r requirements-dev.txt
pytest
```

Rodam sem Bluetooth: o lado do robô é simulado e o do backend é um servidor
WebSocket real com as regras do protocolo (`hello` primeiro, fechamentos
`4001`/`4003`, `ack` cumulativo). Cobrem o `hello` primeiro em toda conexão, o
reinício do backend no meio da corrida sem perdas, o token recusado e a fila
limitada.

## Requisitos de Bluetooth (modo BLE real)

No Linux, o `bleak` usa o **BlueZ** via D-Bus. Se aparecer
`org.bluez was not provided by any .service files`, o serviço não está ativo:

```bash
sudo apt install bluetooth bluez
sudo systemctl enable --now bluetooth
bluetoothctl list      # deve listar um controlador
```

O **WSL não tem Bluetooth** por padrão: rode a ponte no SO nativo (Windows/Linux
com adaptador BT) ou use `--replay` para os testes sem rádio.
