# Casos de Teste — Frontend

**Versão:** 1.0  
**Escopo:** casos de teste funcionais do dashboard frontend para os RF-57 a RF-71 e as histórias HU-FE-01 a HU-FE-15.  
**Ferramentas previstas:** Vitest e Testing Library para testes unitários e de componentes; Playwright para testes funcionais E2E em Chromium e Firefox.

## Convenções

- **CT-FE-NN:** código do caso de teste funcional.
- **RF:** requisito funcional rastreado em `docs/2 - Requisitos.md`.
- **HU:** história de usuário rastreada em `UC-frontend.md`.
- **Resultado esperado:** condição que deve ser satisfeita para o caso ser aprovado.
- O frontend exibe os dados derivados pelo backend e não recalcula trajeto, métricas oficiais ou status da corrida.

## Matriz de rastreabilidade

| Caso | História de usuário | Requisito funcional | Prioridade | Nível principal |
|:--|:--|:--|:--:|:--|
| CT-FE-01 | HU-FE-01 — Exibir os dados obrigatórios da execução | RF-57 | P0 | E2E |
| CT-FE-02 | HU-FE-02 — Receber continuamente os dados da tentativa | RF-58 | P0 | Integração/E2E |
| CT-FE-03 | HU-FE-03 — Indicar o estado da conexão | RF-59 | P0 | E2E |
| CT-FE-04 | HU-FE-04 — Renderizar o labirinto atualizado | RF-60 | P0 | Unitário/Componente |
| CT-FE-05 | HU-FE-05 — Visualizar o trajeto percorrido | RF-61 | P0 | Unitário/Componente |
| CT-FE-06 | HU-FE-06 — Adaptar a tela ao tipo de labirinto | RF-62 | P0 | Unitário/E2E |
| CT-FE-07 | HU-FE-07 — Indicar o desafio cumprido | RF-63 | P0 | E2E |
| CT-FE-08 | HU-FE-08 — Cronometrar a tentativa | RF-64 | P0 | Unitário/Componente |
| CT-FE-09 | HU-FE-09 — Listar o histórico de execuções | RF-65 | P0 | E2E |
| CT-FE-10 | HU-FE-10 — Filtrar execuções por tipo de labirinto | RF-66 | P0 | E2E |
| CT-FE-11 | HU-FE-11 — Detalhar uma execução passada | RF-67 | P1 | E2E |
| CT-FE-12 | HU-FE-12 — Analisar o consumo durante a tentativa | RF-68 | P1 | Unitário/Componente |
| CT-FE-13 | HU-FE-13 — Sinalizar falha de execução | RF-69 | P1 | E2E |
| CT-FE-14 | HU-FE-14 — Consultar dados em modo de depuração | RF-70 | P2 | Componente/E2E |
| CT-FE-15 | HU-FE-15 — Exportar resultados da execução | RF-71 | P2 | E2E |

## Casos de teste funcionais

### CT-FE-01 — Exibir os dados obrigatórios da execução

- **Rastreabilidade:** RF-57 · HU-FE-01 · RNF-37, RNF-40, RNF-41, RNF-44, RNF-46 e RNF-47.
- **Objetivo:** verificar que o painel exibe os dados essenciais de uma tentativa e representa corretamente dados ausentes.
- **Pré-condições:** aplicação disponível; simulador conectado ao backend; corrida em andamento; viewport de 1920 × 1080.
- **Procedimentos:**
  1. Abrir o acompanhamento ao vivo.
  2. Enviar uma atualização contendo tipo `4x4`, trajeto, velocidade média, tempo, status, tensão, corrente e potência.
  3. Conferir os oito valores na tela.
  4. Enviar uma atualização sem corrente e sem potência.
  5. Medir o intervalo entre a recepção e a atualização visual.
- **Resultado esperado:** os valores recebidos são exibidos na mesma tela; campos sem amostra mostram `—` ou estado equivalente de indisponibilidade, sem serem convertidos em zero; o novo dado aparece em até 500 ms e a página não é recarregada.

### CT-FE-02 — Receber continuamente os dados da tentativa

- **Rastreabilidade:** RF-58 · HU-FE-02 · RNF-37, RNF-38, RNF-39, RNF-40, RNF-41 e RNF-47.
- **Objetivo:** verificar a conexão WebSocket, a atualização contínua e a retenção das amostras.
- **Pré-condições:** backend e simulador disponíveis; corrida em andamento; captura de mensagens e contador de frames habilitados.
- **Procedimentos:**
  1. Abrir o painel e confirmar a inscrição no WebSocket.
  2. Enviar 10 mensagens de telemetria por segundo durante 60 segundos.
  3. Alternar para outra rota do painel e retornar ao acompanhamento.
  4. Conferir a quantidade de amostras armazenadas e a taxa de renderização.
  5. Derrubar e restabelecer o WebSocket.
- **Resultado esperado:** a conexão permanece ativa durante a tentativa; cada mensagem válida atualiza o estado sem recarregar a página; as 600 amostras são preservadas; a renderização permanece em pelo menos 30 FPS; após a queda, o cliente inicia reconexão automática.

### CT-FE-03 — Indicar o estado da conexão

- **Rastreabilidade:** RF-59 · HU-FE-03 · RNF-39, RNF-41 e RNF-46.
- **Objetivo:** verificar os estados Conectado, Reconectando e Desconectado e a retomada automática.
- **Pré-condições:** painel aberto; backend inicialmente disponível.
- **Procedimentos:**
  1. Abrir o painel com WebSocket aceito e receber uma mensagem.
  2. Interromper a conexão e observar o indicador durante as tentativas.
  3. Simular o evento `offline` do navegador.
  4. Restabelecer a rede e disponibilizar o backend novamente.
- **Resultado esperado:** o painel exibe `Conectado`, depois `Reconectando` durante as tentativas, e `Desconectado` quando não há conexão nem tentativa ativa; após a rede retornar, exibe `Conectado` em até 5 segundos sem ação manual.

### CT-FE-04 — Renderizar o labirinto atualizado

- **Rastreabilidade:** RF-60 · HU-FE-04 · RNF-37, RNF-38, RNF-41, RNF-42, RNF-44, RNF-46 e RNF-47.
- **Objetivo:** verificar dimensões, estados das paredes, atualização parcial e responsividade do labirinto.
- **Pré-condições:** componente do labirinto renderizado; modelo inicial com paredes internas desconhecidas e perímetro presente.
- **Procedimentos:**
  1. Carregar mapas `4x4`, `8x4` e `12x4`.
  2. Conferir a quantidade de células e a presença do perímetro.
  3. Aplicar uma atualização de parede como presente e outra como ausente.
  4. Conferir a distinção visual entre desconhecida, presente e ausente.
  5. Repetir em viewports de 360 px, 768 px e 1920 px.
- **Resultado esperado:** cada mapa possui exatamente o formato recebido; os três estados são visualmente distintos; somente a célula ou aresta afetada muda; as demais paredes são preservadas; não há rolagem horizontal nem perda de responsividade.

### CT-FE-05 — Visualizar o trajeto percorrido

- **Rastreabilidade:** RF-61 · HU-FE-05 · RNF-37, RNF-38, RNF-40, RNF-46 e RNF-47.
- **Objetivo:** verificar ordenação por sequência, posição atual e revisitas.
- **Pré-condições:** labirinto criado; trajeto vazio.
- **Procedimentos:**
  1. Enviar eventos de células com sequências 1, 3 e 2, nessa ordem de chegada.
  2. Enviar uma nova passagem pela célula da sequência 1.
  3. Conferir a ordem desenhada, a posição atual e as passagens acumuladas.
  4. Reenviar um evento com sequência já aplicada.
- **Resultado esperado:** o trajeto é desenhado em ordem 1, 2, 3, independentemente da ordem de chegada; a posição atual é visualmente distinta; a revisita não apaga passagens anteriores; a sequência repetida não cria duplicação.

### CT-FE-06 — Adaptar a tela ao tipo de labirinto

- **Rastreabilidade:** RF-62 · HU-FE-06 · RNF-42, RNF-44 e RNF-46.
- **Objetivo:** verificar a criação automática da grade e o tratamento de tipo ausente ou inválido.
- **Pré-condições:** painel aberto sem configuração manual do operador.
- **Procedimentos:**
  1. Enviar sucessivamente os tipos `4x4`, `8x4` e `12x4` em execuções distintas.
  2. Conferir a dimensão criada em cada execução.
  3. Enviar um tipo inválido e depois uma mensagem sem tipo.
  4. Observar o estado exibido pela interface.
- **Resultado esperado:** a grade correspondente é criada automaticamente para cada tipo válido; a grade anterior é descartada ao mudar de execução; para tipo inválido ou ausente, nenhuma grade incorreta é desenhada e a tela informa configuração pendente ou inválida.

### CT-FE-07 — Indicar o desafio cumprido

- **Rastreabilidade:** RF-63 · HU-FE-07 · RNF-37 e RNF-46.
- **Objetivo:** verificar a sinalização persistente da conclusão.
- **Pré-condições:** corrida em andamento e objetivo ainda não alcançado.
- **Procedimentos:**
  1. Confirmar que o painel não exibe a corrida como concluída.
  2. Enviar evento de status `CONCLUIDA` indicando que a célula objetivo foi alcançada.
  3. Trocar de aba e retornar ao acompanhamento da mesma corrida.
  4. Iniciar uma nova execução.
- **Resultado esperado:** o painel exibe `Desafio cumprido` e o status concluído em até 500 ms; a indicação permanece visível durante a execução selecionada; desaparece ou é substituída somente ao trocar ou limpar a execução; antes do evento, não aparece.

### CT-FE-08 — Cronometrar a tentativa

- **Rastreabilidade:** RF-64 · HU-FE-08 · RNF-37, RNF-40, RNF-46 e RNF-47.
- **Objetivo:** verificar avanço, congelamento e monotonicidade do cronômetro.
- **Pré-condições:** corrida com tempo inicial conhecido; relógio do navegador controlável.
- **Procedimentos:**
  1. Iniciar uma corrida e enviar mensagens com tempos crescentes do robô.
  2. Avançar o relógio local sem enviar nova mensagem.
  3. Enviar uma mensagem atrasada com tempo menor que o último tempo aceito.
  4. Enviar status final com tempo de conclusão.
- **Resultado esperado:** o cronômetro começa ao iniciar a tentativa e avança entre mensagens; não reinicia durante atualizações; nunca diminui após mensagem atrasada; ao receber status final, congela no tempo de conclusão informado pelo backend.

### CT-FE-09 — Listar o histórico de execuções

- **Rastreabilidade:** RF-65 · HU-FE-09 · RNF-41, RNF-42, RNF-43, RNF-44 e RNF-45.
- **Objetivo:** verificar consulta, apresentação dos campos e estados vazio e erro.
- **Pré-condições:** API disponível com até 200 execuções cadastradas.
- **Procedimentos:**
  1. Abrir a tela de histórico.
  2. Interceptar `GET /api/corridas` e retornar registros com data/hora, tipo, duração e resultado.
  3. Medir o tempo até a lista ser exibida.
  4. Repetir com resposta vazia e com erro HTTP.
- **Resultado esperado:** a tabela exibe os campos obrigatórios de cada execução em até 2 segundos; com resposta vazia mostra estado vazio; com falha mostra mensagem de erro e não apresenta dados antigos como se fossem atuais.

### CT-FE-10 — Filtrar execuções por tipo de labirinto

- **Rastreabilidade:** RF-66 · HU-FE-10 · RNF-43, RNF-44 e RNF-45.
- **Objetivo:** verificar os filtros Todos, 4x4, 8x4 e 12x4.
- **Pré-condições:** histórico com execuções dos três tipos.
- **Procedimentos:**
  1. Selecionar `4x4`, `8x4`, `12x4` e `Todos`, um de cada vez.
  2. Conferir o parâmetro `tipo` enviado à API.
  3. Conferir os registros exibidos após cada resposta.
  4. Selecionar um tipo sem registros correspondentes.
- **Resultado esperado:** cada seleção solicita e exibe somente o tipo correspondente; `Todos` exibe todos os tipos; o filtro selecionado permanece visível; nenhum resultado mostra estado vazio sem erro.

### CT-FE-11 — Detalhar uma execução passada

- **Rastreabilidade:** RF-67 · HU-FE-11 · RNF-40, RNF-43, RNF-44 e RNF-45.
- **Objetivo:** verificar a abertura do detalhe, a reutilização da visualização e o isolamento do modo histórico.
- **Pré-condições:** histórico com uma execução válida e uma identificação inexistente; WebSocket ao vivo ativo.
- **Procedimentos:**
  1. Selecionar uma execução válida.
  2. Conferir tipo, mapa, trajeto, métricas, tempo e resultado na visualização de detalhe.
  3. Enviar uma mensagem ao vivo pelo WebSocket.
  4. Tentar abrir uma execução inexistente.
- **Resultado esperado:** o detalhe usa a mesma visualização do modo ao vivo e exibe os dados da execução selecionada; é identificado como histórico; mensagens novas não alteram o detalhe; para execução inexistente, a interface informa o erro e mantém o usuário no histórico.

### CT-FE-12 — Analisar o consumo durante a tentativa

- **Rastreabilidade:** RF-68 · HU-FE-12 · RNF-37, RNF-38, RNF-40 e RNF-47.
- **Objetivo:** verificar séries de tensão, corrente, potência, carga estimada e variação de tensão sem perda de amostras.
- **Pré-condições:** tela de execução aberta; gráfico de consumo disponível.
- **Procedimentos:**
  1. Enviar amostras com tensão, corrente e potência ao longo do tempo.
  2. Conferir as três séries e os indicadores de carga estimada e ΔV.
  3. Enviar 6.000 amostras, equivalentes a 10 minutos a 10 Hz.
  4. Conferir o primeiro e o último ponto e a quantidade total armazenada.
- **Resultado esperado:** o gráfico exibe as três grandezas com unidades corretas; carga estimada e ΔV são exibidos quando fornecidos; novas amostras são acrescentadas sem apagar as anteriores; as 6.000 amostras permanecem disponíveis.

### CT-FE-13 — Sinalizar falha de execução

- **Rastreabilidade:** RF-69 · HU-FE-13 · RNF-37, RNF-39 e RNF-46.
- **Objetivo:** verificar sinalização de perda de comunicação, erro, timeout e retomada.
- **Pré-condições:** corrida em andamento; painel conectado.
- **Procedimentos:**
  1. Enviar evento `sinal` com estado `PERDIDO`.
  2. Enviar status de falha com motivo recebido do backend.
  3. Enviar evento `sinal` com estado `RETOMADO`.
  4. Comparar a sinalização de retomada com a sinalização de conclusão.
  5. Medir o tempo de atualização após cada evento.
- **Resultado esperado:** o painel exibe sem sinal após `PERDIDO`; exibe falha e motivo para erro ou timeout; diferencia retomada de execução concluída; cada alerta aparece em até 500 ms e a conexão passa ao estado correspondente.

### CT-FE-14 — Consultar dados em modo de depuração

- **Rastreabilidade:** RF-70 · HU-FE-14 · RNF-38, RNF-40, RNF-41, RNF-45 e RNF-47.
- **Objetivo:** verificar a área secundária de dados brutos e o tratamento de valores ausentes.
- **Pré-condições:** modo de depuração habilitado; mensagens de depuração disponíveis.
- **Procedimentos:**
  1. Abrir o painel de depuração.
  2. Enviar leituras dos sete sensores ToF, ângulo do MPU-6050 e contagens dos encoders.
  3. Enviar uma nova leitura e conferir que a atualização não apaga o histórico da tentativa.
  4. Enviar dados ausentes e inválidos.
  5. Verificar a área dos dados obrigatórios.
- **Resultado esperado:** todas as leituras brutas são exibidas na área secundária; novos valores atualizam o estado sem apagar amostras armazenadas; valores ausentes ou inválidos aparecem como indisponíveis; os dados obrigatórios continuam visíveis.

### CT-FE-15 — Exportar resultados da execução

- **Rastreabilidade:** RF-71 · HU-FE-15 · RNF-40, RNF-41 e RNF-45.
- **Objetivo:** verificar exportação em JSON e CSV e o tratamento de erro.
- **Pré-condições:** detalhe de uma execução carregado; navegador com suporte a download.
- **Procedimentos:**
  1. Acionar a exportação e selecionar JSON.
  2. Conferir o download, a extensão, o tipo MIME e os campos do conteúdo.
  3. Repetir selecionando CSV.
  4. Interceptar a requisição e simular falha do backend.
- **Resultado esperado:** a interface oferece JSON e CSV; o arquivo baixado tem extensão e tipo compatíveis; contém identificação, tipo de labirinto, trajeto, métricas, status e dados de energia; em caso de falha, informa o erro e preserva os dados exibidos.

## Estratégia de automação

### Testes unitários e de componentes

Devem cobrir, no mínimo, as regras puras de `ModeloLabirinto`, `Trajeto`, `SerieEnergia`, `RelogioTentativa`, formatadores, redutores e componentes de estado vazio, erro e carregamento. O relatório de cobertura deve atingir pelo menos 70% nas regras de domínio e formatação, conforme RNF-47, e a meta geral da documentação de testes de software deve ser de 80% quando os módulos estiverem implementados.

### Testes de integração

Usar um simulador de backend ou WebSocket controlado para verificar a aplicação das mensagens na store, a atualização do canvas e do gráfico, a reconexão e a preservação das amostras. As mensagens devem ser fornecidas com dados determinísticos, incluindo eventos fora de ordem, duplicados, ausentes e estados finais.

### Testes E2E

Usar Playwright com Chromium e Firefox para executar CT-FE-01, CT-FE-02, CT-FE-03, CT-FE-06, CT-FE-07, CT-FE-09, CT-FE-10, CT-FE-11, CT-FE-13 e CT-FE-15. O servidor do frontend deve ser executado localmente, e as respostas HTTP e WebSocket devem ser simuladas ou fornecidas pelo simulador do backend, sem CDN, fonte remota ou API externa.

## Critérios gerais de aprovação

- Todos os CT-FE-01 a CT-FE-15 devem estar associados a uma HU e a um RF.
- Não deve haver atualização da página para processar telemetria.
- Campos ausentes devem permanecer explicitamente indisponíveis.
- O painel não deve alterar dados históricos ao receber mensagens ao vivo.
- Os testes E2E devem passar em Chromium e Firefox nos fluxos aplicáveis.
- O relatório de cobertura deve ser anexado à documentação de testes após a implementação da suíte automatizada.
