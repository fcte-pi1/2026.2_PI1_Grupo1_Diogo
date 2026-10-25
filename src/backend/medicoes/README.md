# Medições de desempenho do backend (CT-BE-32 a CT-BE-34)

Scripts que executam os casos de teste não funcionais do backend e imprimem os números de cada critério ([#373](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/373)). Os procedimentos e os critérios são os de [`docs/software/backend/4_casos_de_teste.md`](../../../docs/software/backend/4_casos_de_teste.md), e o relatório com os resultados está em [`docs/software/backend/5_medicoes_desempenho.md`](../../../docs/software/backend/5_medicoes_desempenho.md).

| Script | Caso | Requisitos | Cenário padrão |
|:--|:--|:--|:--|
| `npm run medir:ct-be-32` | Latência servidor → painel e ponta a ponta | RNF-48 | 1 simulador a 20 msg/s, 5 painéis, 5 min |
| `npm run medir:ct-be-33` | Carga sustentada sem bloqueio do *event loop* | RNF-49, RNF-51 | 1 simulador a 50 msg/s, 10 painéis, 5 min, `/health` a cada 5 s e 3 exportações CSV |
| `npm run medir:ct-be-34` | Recuperação após reinício do backend | RNF-52 | corrida de 514 mensagens (8x4, semente 42), queda depois da 250 |

Cada script imprime o andamento, uma tabela Markdown com os critérios (pronta para o relatório) e grava o resultado completo em `medicoes/resultados/<caso>-<data>.json`. O código de saída é `0` quando todos os critérios são atendidos, `1` quando algum não é e `2` em caso de erro (backend fora do ar, por exemplo).

## Como executar

Os scripts rodam **no computador, fora do Docker**, com Node.js ≥ 22.22, como os testes de integração. Há dois motivos:
- o CT-BE-34 derruba o contêiner do backend, e um script que rodasse dentro dele cairia junto;
- o simulador e os painéis de teste rodam no mesmo processo, então o envio e a chegada de cada mensagem são medidos com o mesmo relógio (`performance.now()`), sem precisar sincronizar relógios.

```bash
# Na raiz do repositório: o ambiente no ar e o seed aplicado (DESENVOLVIMENTO.md)
docker compose up -d --build
docker compose exec backend npm run seed

cd src/backend && npm install

# CT-BE-32: reinicie o backend antes, porque os histogramas do /health valem desde o início do processo
docker compose restart backend
npm run medir:ct-be-32

# CT-BE-33: reinicie de novo antes
docker compose restart backend
npm run medir:ct-be-33

# CT-BE-34: o próprio script derruba e religa o backend
npm run medir:ct-be-34
```

O CT-BE-32 e o CT-BE-33 **recusam-se a medir** se o backend já recebeu alguma mensagem desde que subiu, porque os percentis do `/health` incluiriam o que veio antes. A opção `--sem-reinicio` força a medição, mas o resultado não vale como oficial.

Todos aceitam `--ajuda`. As opções principais:

| Opção | Scripts | Padrão |
|:--|:--|:--|
| `--url <url>` | todos | `http://localhost:8080` |
| `--taxa <n>` | todos | 20 (CT-BE-32 e 34) ou 50 (CT-BE-33) |
| `--paineis <n>` | 32 e 33 | 5 ou 10 |
| `--duracao <s>` | 32 e 33 | 300. A carga dura um pouco mais, porque a última corrida sempre termina |
| `--labirinto <tipo>` | todos | `12x4` (32 e 33) ou `8x4` (34) |
| `--semente <n>` | todos | aleatória (32 e 33) ou `42` (34) |
| `--compose <arquivo>` | 34 | `compose.yaml`. Use `compose.prod.yaml` para medir com o ambiente da apresentação |
| `--cmd-derrubar`, `--cmd-subir` | 34 | `docker compose -f <arquivo> kill backend` e `docker compose -f <arquivo> start backend`, executados na raiz do repositório |
| `--apos <n>` | 34 | 250 |

## O que cada medida significa

### CT-BE-32: duas latências

- **No backend** (critério p95 ≤ 50 ms): os percentis do `GET /health` (`latencia_painel_ms`), da chegada do quadro WebSocket do robô ao envio aos painéis, separados em `eventos` (células) e `continuos` (posição e energia). É a instrumentação do [PR #390](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/pull/390), descrita em [`protocolo/v1/API.md`](../protocolo/v1/API.md#latencia_painel_ms-rnf-48-ct-be-32). Nos contínuos, só fica de fora a espera de uma mensagem já pronta pela janela de 100 ms do RF-90.
- **Ponta a ponta** (critério p95 ≤ 300 ms): da saída da mensagem no simulador à chegada em cada painel de teste. Uma amostra por painel e por mensagem.
  - **Eventos:** pareados pela `sequencia` da célula.
  - **Contínuos:** o contínuo traz só o `tempo_ms` da mensagem mais recente, e o robô emite `posicao` e `energia` do mesmo ciclo com o mesmo `tempo_ms`. Vale o envio da primeira das duas, o que é conservador (a latência medida nunca é menor que a real). Aqui a espera pela janela de 100 ms **entra**, porque é o que o operador vê.

O painel de teste se inscreve em cada corrida quando ela aparece no canal `ao_vivo`, como o painel de verdade. As primeiras mensagens de cada corrida, anteriores à inscrição, chegam pelo `snapshot` e não entram na amostra.

### CT-BE-33: carga

- **Atraso do *event loop*:** o p99 do `/health` no fim da carga (critério do RNF-49: ≤ 20 ms). O histograma vale desde o início do processo, por isso o backend é reiniciado antes. A série das consultas a cada 5 s fica no JSON, e o resumo dela ignora o primeiro minuto, em que poucas amostras e o aquecimento pesam no p99.
- **Mensagens gravadas:** depois da carga, uma exportação CSV de cada corrida (RF-98), que tem uma linha por mensagem da tabela `mensagem`. É o equivalente a `count(*)`, `count(DISTINCT seq)` e `max(seq)`, sem precisar de acesso ao banco. O critério é ser igual ao que o simulador emitiu.
- **Sobrecarga:** nenhuma mensagem rejeitada, nenhuma conexão recusada e nenhuma queda da conexão do simulador, pelos contadores do `/health` e pelos fechamentos registrados no simulador.
- **Painéis:** nenhuma conexão de painel encerrada pelo backend.
- **Exportações durante a carga:** 3 exportações CSV de corridas já encerradas, a 25 %, 50 % e 75 % da duração, com o tempo de cada uma.

### CT-BE-34: recuperação

Sequência: o simulador emite 250 mensagens e espera o `ack`; o painel de teste pega o `snapshot` (estado antes da queda); em T0, o backend é derrubado (`kill`) e religado (`start`). O robô continua emitindo no ritmo dele desde T0, só para o buffer. Assim que o `/health` responde `200`, o painel pega o `snapshot` reconstruído; depois disso, o simulador se reconecta e envia o `hello` e o buffer inteiro, como o firmware.

| Medida | Critério |
|:--|:--|
| Tempo até o `/health` responder `200`, descontado o contêiner | ≤ 5 s. É o `uptime_s` do processo no primeiro `200`, que exclui o tempo do Docker e, no `compose.yaml`, o `npm install` e as migrações da subida. O tempo total desde T0 também é mostrado |
| Tempo até a corrida ser retomada (primeiro `ack` além da 250), descontado o contêiner | ≤ 5 s |
| `count(*) = count(DISTINCT seq) = max(seq)` | igual ao total da corrida, pela exportação CSV |
| Lacunas e status | `sequencias_faltantes` = 0 e corrida `CONCLUIDA` |
| Estado reconstruído | `snapshot` igual ao de antes da queda, sem contar o `sinal` (que fica `PERDIDO` até o robô voltar, por projeto) |

O simulador só se reconecta depois de o painel pegar o snapshot reconstruído: sem isso, o reenvio poderia mudar o estado antes da comparação. Essa espera é de milissegundos e está dentro do tempo de retomada medido.

## Limitações

- **Sem Bluetooth.** O simulador se conecta direto em `/ws/telemetria`, sem o BLE e sem a ponte. A latência "ponta a ponta" vai do simulador ao painel; a parcela do enlace BLE e da ponte depende do firmware e do hardware e só pode ser medida com o robô, nos testes de integração.
- **Mesma máquina.** Simulador, painéis e backend rodam no mesmo computador, o que mede o backend sem a rede Wi-Fi da apresentação.
- **Ambiente de desenvolvimento.** No `compose.yaml`, o backend roda com `tsx watch`, sem compilar. A imagem de produção (`compose.prod.yaml`) roda o JavaScript compilado e tende a ser igual ou mais rápida.

## Arquivos

| Arquivo | O que faz |
|:--|:--|
| [`estatistica.ts`](estatistica.ts) | Percentis (posto mais próximo), pareamento envio → chegada, contagem pelo CSV e comparação de snapshots. Funções puras, com testes em [`../testes/unit/medicoes/`](../testes/unit/medicoes/) |
| [`instrumentos.ts`](instrumentos.ts) | Painel de teste (PNL), socket do simulador que cronometra cada envio, cliente HTTP do backend e formatação da saída |
| [`carga.ts`](carga.ts) | Cenário comum ao CT-BE-32 e ao CT-BE-33: 1 simulador e N painéis durante a duração pedida |
| [`ct-be-32.ts`](ct-be-32.ts), [`ct-be-33.ts`](ct-be-33.ts), [`ct-be-34.ts`](ct-be-34.ts) | Um script por caso de teste |
| `resultados/` | Resultados gravados por execução (JSON). Os da medição oficial ficam versionados como evidência |
