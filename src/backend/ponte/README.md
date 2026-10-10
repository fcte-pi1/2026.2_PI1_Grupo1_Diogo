# Ponte Bluetooth → backend

O robô envia a telemetria por **Bluetooth Clássico (SPP)**, que aparece no notebook como uma porta serial. A ponte lê essa porta e repassa cada mensagem, sem alterar, para o backend em `/ws/telemetria`.

Ela roda **no notebook do operador, fora do Docker**: o container do backend não enxerga o Bluetooth do computador. O formato das mensagens está em [`../protocolo/v1/README.md`](../protocolo/v1/README.md).

## Como usar

1. Suba o ambiente (`docker compose up` na raiz do repositório).
2. Pareie o robô com o notebook nas configurações de Bluetooth do sistema.
3. Descubra a porta serial do robô:

   ```bash
   cd src/backend && npm install
   npm run ponte -- --listar
   ```

   | Sistema | Exemplo de porta |
   |:--|:--|
   | macOS | `/dev/cu.RatoBorrachudo` |
   | Linux | `/dev/rfcomm0` (depois de `sudo rfcomm bind 0 <endereço do robô>`) |
   | Windows | `COM5` (a porta "de saída" em *Mais opções de Bluetooth → Portas COM*) |

4. Inicie a ponte:

   ```bash
   npm run ponte -- --porta /dev/cu.RatoBorrachudo
   ```

Opções: `--url` muda o endereço do backend (padrão `ws://localhost:8080/ws/telemetria`) e `--baud` muda a velocidade da serial (padrão 115200; o Bluetooth a ignora).

**Sem o robô:** `--porta -` lê as mensagens da entrada padrão, uma por linha.

```bash
cat corrida.ndjson | npm run ponte -- --porta -
```

## O que ela faz

| Situação | Comportamento |
|:--|:--|
| A porta serial abre | Espera o `hello` do robô e só então conecta ao backend. O que chegar antes do `hello` é descartado |
| Chega uma linha | É repassada ao backend exatamente como veio. A ponte não valida o conteúdo: isso é papel do backend |
| O backend está fora do ar | Guarda até 2000 linhas, tenta reconectar a cada 0,25 → 0,5 → 1 → 2 s e, ao voltar, reenvia o `hello` e depois o que guardou |
| O backend recusa o `hello` (4001 ou 4002) | Mostra o erro e para de repassar, até o robô enviar outro `hello` |
| O robô envia outro `hello` (reiniciou) | Abre uma conexão nova com o backend |
| A porta serial fecha | Fecha a conexão com o backend e tenta reabrir a porta a cada 1 s |
| Chega um `ack` do backend | É apenas contado. **Nada é enviado ao robô**, que é emissor unidirecional |
| Uma linha passa de 1024 bytes | É descartada inteira |

A cada 10 s, se algo mudou, a ponte mostra os contadores: linhas recebidas, enviadas, `ack`s, descartadas e perdidas.

## Limites conhecidos

- **Queda do Bluetooth:** nem todo sistema operacional avisa a ponte quando o robô sai do alcance. Por isso a perda de sinal é detectada pelo **backend**, por silêncio de mensagens (3 s), e não pela ponte.
- **Ainda não testada com o ESP32:** a lógica está coberta por testes unitários e por um teste com porta serial simulada. O comportamento na reconexão do Bluetooth real precisa ser validado na integração (#331).

## Código

| Arquivo | Papel |
|:--|:--|
| `separador-linhas.ts` | Transforma os bytes da serial em linhas completas |
| `ponte.ts` | Lógica de repasse, buffer e reconexão. Não conhece serial nem rede, então é testada sem hardware |
| `cli.ts` | Linha de comando: abre a porta serial (`serialport`) e o WebSocket |
