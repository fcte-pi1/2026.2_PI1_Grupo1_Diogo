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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Uso
```bash
# Teste do BLE isolado (sem backend): imprime o JSON que o robô envia
python ble_ws_bridge.py --print-only

# Operação: BLE -> WebSocket do backend
python ble_ws_bridge.py --ws ws://localhost:8080/ws/telemetria
```

Valide primeiro com `--print-only`: se o JSON aparecer no terminal, o BLE está
funcionando - só então ligue no backend. (baby steps)

## Testes SEM placa e SEM Bluetooth

Os modos abaixo **não usam BLE** - servem para exercitar a ponte e o backend
num PC sem o rádio Bluetooth (ex.: WSL) e sem o robô físico:

```bash
# Gera uma sequência de telemetria de exemplo (formato do protocolo v1)
python ble_ws_bridge.py --simulate --print-only
python ble_ws_bridge.py --simulate --ws ws://localhost:8080/ws/telemetria

# Reenvia linhas JSON EXATAS de um arquivo (uma mensagem por linha)
python ble_ws_bridge.py --replay amostra.jsonl --ws ws://localhost:8080/ws/telemetria
```

- `--simulate` emite mensagens **ilustrativas** (envelope `{v,tipo,corrida,seq,t}`).
  Se o backend validar por schema (Ajv) e recusar algum campo, use `--replay`
  com linhas exatas (capturadas do firmware ou conferidas no schema).
- `--interval <s>` ajusta o ritmo entre mensagens (padrão 0,5 s; use `0` para rajada).

## Requisitos de Bluetooth (modo BLE real)

No Linux, o `bleak` usa o **BlueZ** via D-Bus. Se aparecer
`org.bluez was not provided by any .service files`, o serviço não está ativo:

```bash
sudo apt install bluetooth bluez
sudo systemctl enable --now bluetooth
bluetoothctl list      # deve listar um controlador
```

O **WSL não tem Bluetooth** por padrão: rode a ponte no SO nativo (Windows/Linux
com adaptador BT) ou use `--simulate`/`--replay` para os testes sem rádio.
