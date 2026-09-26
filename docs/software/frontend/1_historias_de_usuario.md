 # Histórias de Usuário — Frontend

 **Versão:** 1.0  
 **Escopo:** backlog da frente de frontend. Cada Requisito Funcional RF-57 a RF-71 é detalhado em uma História de Usuário (HU), com critérios de aceitação verificáveis e rastreabilidade para os requisitos não funcionais e casos de teste.

 Os dados exibidos pelo painel são recebidos do backend por WebSocket, conforme o protocolo de telemetria e as regras de domínio definidas para o projeto. O frontend não recalcula dados que já são derivados pelo backend, como trajeto, tempo de passagem, carga estimada e status da corrida.

 ## Convenções

 - **ID:** `HU-FE-NN`, em correspondência 1:1 com os RF do frontend: **HU-FE-01 ↔ RF-57** até **HU-FE-15 ↔ RF-71**.
 - **Prioridade:** herdada do RF: Must have → P0, Should have → P1, Could have → P2.
 - **Critérios de aceitação:** escritos em Dado / Quando / Então. Critérios com † refinam o requisito e devem ser validados com as equipes de backend e firmware.
 - **Execução em tempo real:** a tela deve atualizar sem recarregar a página e preservar os dados recebidos durante a tentativa.
 - **Casos de teste:** identificados como `CT-FE-NN`; os números são referências sugeridas para a suíte de testes do frontend.

 ## Personas

 | Persona | Quem é | O que espera do painel |
 |:--|:--|:--|
 | **Operador** | Integrante da equipe que acompanha e conduz a apresentação. | Ver o estado do robô, o progresso da tentativa e os alertas em uma única tela. |
 | **Avaliador** | Professor, banca ou espectador da demonstração. | Acompanhar o labirinto, o trajeto, as métricas e o resultado com leitura rápida. |
 | **Equipe de desenvolvimento** | Pessoas que testam firmware, backend e integração. | Consultar histórico, detalhes, dados de depuração e exportar resultados. |

 ## Backlog do Produto — Frontend

 <u>Épico — Painel de acompanhamento ao vivo (RF-57 a RF-64)</u>

 | ID | Título | RF | Prioridade | Caso de teste |
 |:--|:--|:--|:--:|:--|
 | HU-FE-01 | Exibir os dados obrigatórios da execução | [RF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/137) | P0 | CT-FE-01 |
 | HU-FE-02 | Receber continuamente os dados da tentativa | [RF-58](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/138) | P0 | CT-FE-02 |
 | HU-FE-03 | Indicar o estado da conexão | [RF-59](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/139) | P0 | CT-FE-03 |
 | HU-FE-04 | Renderizar o labirinto atualizado | [RF-60](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/140) | P0 | CT-FE-04 |
 | HU-FE-05 | Visualizar o trajeto percorrido | [RF-61](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/141) | P0 | CT-FE-05 |
 | HU-FE-06 | Adaptar a tela ao tipo de labirinto | [RF-62](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/142) | P0 | CT-FE-06 |
 | HU-FE-07 | Indicar o desafio cumprido | [RF-63](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/143) | P0 | CT-FE-07 |
 | HU-FE-08 | Cronometrar a tentativa | [RF-64](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/144) | P0 | CT-FE-08 |

 <u>Épico — Histórico e análise de execuções (RF-65 a RF-71)</u>

 | ID | Título | RF | Prioridade | Caso de teste |
 |:--|:--|:--|:--:|:--|
 | HU-FE-09 | Listar o histórico de execuções | [RF-65](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/145) | P0 | CT-FE-09 |
 | HU-FE-10 | Filtrar execuções por tipo de labirinto | [RF-66](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/146) | P0 | CT-FE-10 |
 | HU-FE-11 | Detalhar uma execução passada | [RF-67](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/147) | P1 | CT-FE-11 |
 | HU-FE-12 | Analisar o consumo durante a tentativa | [RF-68](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/148) | P1 | CT-FE-12 |
 | HU-FE-13 | Sinalizar falha de execução | [RF-69](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/149) | P1 | CT-FE-13 |
 | HU-FE-14 | Consultar dados em modo de depuração | [RF-70](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/150) | P2 | CT-FE-14 |
 | HU-FE-15 | Exportar resultados da execução | [RF-71](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/151) | P2 | CT-FE-15 |

 ## Requisitos Não-Funcionais do frontend — rastreabilidade

 | RNF | Título | Rastreabilidade |
 |:--|:--|:--|
 | [RNF-37](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/215) | Latência de atualização | RF-57, RF-58, RF-60, RF-61, RF-63, RF-69 |
 | [RNF-38](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/216) | Taxa de atualização sustentada | RF-58, RF-60, RF-61, RF-70 |
 | [RNF-39](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/217) | Reconexão automática | RF-58, RF-59, RF-69 |
 | [RNF-40](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/218) | Retenção da tentativa completa | RF-57, RF-61, RF-64, RF-68, RF-70 |
 | [RNF-41](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/219) | Operação em rede local isolada | RF-57 a RF-71 |
 | [RNF-42](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/220) | Tempo de carregamento inicial | RF-57, RF-60, RF-65 |
 | [RNF-43](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/221) | Tempo de resposta das consultas | RF-65, RF-66, RF-67 |
 | [RNF-44](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/222) | Adaptação a diferentes telas | RF-57, RF-60, RF-65, RF-67 |
 | [RNF-45](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/223) | Compatibilidade de navegadores | RF-57 a RF-71 |
 | [RNF-46](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/224) | Legibilidade em apresentação | RF-57, RF-60, RF-61, RF-63, RF-64 |
 | [RNF-47](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/225) | Cobertura de testes | RF-57, RF-58, RF-60, RF-61, RF-64, RF-68 |

 ## Detalhamento das Histórias de Usuário

 ### HU-FE-01 — Exibir os dados obrigatórios da execução

 - **RF:** [RF-57](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/137) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-40, RNF-41, RNF-44, RNF-46, RNF-47
 - **História:** Eu, como **operador**, quero visualizar em uma única tela os dados essenciais da tentativa, para acompanhar a execução sem alternar entre telas.
 - **Critérios de aceitação:**
	 - **CA1:** Dada uma tentativa com telemetria recebida, quando o painel processa uma atualização, então exibe tipo do labirinto, trajeto, velocidade média, tempo, status do desafio, tensão, corrente e potência.
	 - **CA2:** Dado um campo ausente ou ainda sem amostra, quando a interface renderiza o painel, então apresenta estado explícito de indisponibilidade sem inventar valores.
	 - **CA3:** Dado um dado novo aceito pelo backend, quando ele chega, então o valor correspondente é atualizado em até 500 ms sem recarregar a página.
 - **Protótipo:** painel principal da execução.
 - **Casos de teste:** CT-FE-01.

 ### HU-FE-02 — Receber continuamente os dados da tentativa

 - **RF:** [RF-58](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/138) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-38, RNF-39, RNF-40, RNF-41, RNF-47
 - **História:** Eu, como **operador**, quero que o painel receba atualizações durante toda a tentativa, para acompanhar o robô em tempo real.
 - **Critérios de aceitação:**
	 - **CA1:** Dada uma tentativa em andamento, quando o painel abre o acompanhamento, então mantém uma conexão WebSocket ativa com o backend.
	 - **CA2:** Quando uma mensagem válida é recebida, então os dados visíveis são atualizados sem recarregar a página.
	 - **CA3:** Dado um fluxo de até 10 mensagens de telemetria por segundo, quando as mensagens são processadas, então a interface mantém renderização igual ou superior a 30 quadros por segundo e não perde amostras armazenadas da tentativa.
 - **Protótipo:** tela de acompanhamento ao vivo.
 - **Casos de teste:** CT-FE-02.

 ### HU-FE-03 — Indicar o estado da conexão

 - **RF:** [RF-59](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/139) · **Prioridade:** Must have (P0) · **RNF:** RNF-39, RNF-41, RNF-46
 - **História:** Eu, como **operador**, quero saber se o painel está conectado ao robô, para distinguir uma pausa de movimento de uma falha de comunicação.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o WebSocket está aberto e recebendo dados, então a interface exibe o estado `Conectado`.
	 - **CA2:** Quando a conexão cai e a tentativa de reconexão está ativa, então exibe `Reconectando`.
	 - **CA3:** Quando não há conexão ativa nem tentativa em andamento, então exibe `Desconectado`.
	 - **CA4:** Após uma queda, quando o backend volta a aceitar a conexão, então o estado muda para `Conectado` em até 5 s, sem intervenção do operador.
 - **Protótipo:** indicador de conexão.
 - **Casos de teste:** CT-FE-03.

 ### HU-FE-04 — Renderizar o labirinto atualizado

 - **RF:** [RF-60](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/140) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-38, RNF-41, RNF-42, RNF-44, RNF-46, RNF-47
 - **História:** Eu, como **avaliador**, quero ver a malha do labirinto e o estado de suas paredes, para entender o espaço descoberto pelo robô.
 - **Critérios de aceitação:**
	 - **CA1:** Dado um tipo de labirinto válido, quando o mapa é recebido, então a interface desenha uma grade exatamente no formato 4×4, 8×4 ou 12×4.
	 - **CA2:** Quando uma parede está desconhecida, presente ou ausente, então ela é exibida com representação visual distinta e consistente.
	 - **CA3:** Quando chega uma atualização de parede, então somente a célula ou aresta afetada é atualizada, preservando as demais informações do mapa.
	 - **CA4:** Dado o fluxo máximo previsto, quando o mapa é atualizado, então a interface continua responsiva e sem rolagem horizontal entre 360 px e 1920 px.
 - **Protótipo:** visualização da malha do labirinto.
 - **Casos de teste:** CT-FE-04.

 ### HU-FE-05 — Visualizar o trajeto percorrido

 - **RF:** [RF-61](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/141) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-38, RNF-40, RNF-46, RNF-47
 - **História:** Eu, como **avaliador**, quero ver as células visitadas e a posição atual sobre o labirinto, para acompanhar o caminho realizado pelo robô.
 - **Critérios de aceitação:**
	 - **CA1:** Dado um trajeto recebido do backend, quando a interface o renderiza, então destaca as células na ordem de sequência recebida.
	 - **CA2:** A posição atual do robô é visualmente distinta das células já visitadas.
	 - **CA3:** Dado que uma célula foi visitada mais de uma vez, quando o trajeto é exibido, então a revisita não apaga a ordem nem as passagens anteriores.
	 - **CA4:** Quando chegam mensagens fora de ordem, então o trajeto visual continua ordenado pelo número de sequência fornecido pelo backend.
 - **Protótipo:** visualização do trajeto.
 - **Casos de teste:** CT-FE-05.

 ### HU-FE-06 — Adaptar a tela ao tipo de labirinto

 - **RF:** [RF-62](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/142) · **Prioridade:** Must have (P0) · **RNF:** RNF-42, RNF-44, RNF-46
 - **História:** Eu, como **operador**, quero que a grade seja configurada automaticamente pelo tipo de labirinto informado pelo robô, para não precisar ajustar a tela manualmente.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o painel recebe o tipo `4x4`, `8x4` ou `12x4`, então cria a grade correspondente.
	 - **CA2:** Quando o tipo de labirinto muda entre execuções, então a grade anterior é descartada e a nova dimensão é aplicada.
	 - **CA3:** Quando o tipo recebido é inválido ou ainda não foi informado, então a interface não desenha uma grade incorreta e exibe estado de configuração pendente ou inválida.
 - **Protótipo:** seleção automática da grade no painel.
 - **Casos de teste:** CT-FE-06.

 ### HU-FE-07 — Indicar o desafio cumprido

 - **RF:** [RF-63](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/143) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-46
 - **História:** Eu, como **avaliador**, quero receber uma indicação explícita quando o robô alcançar o objetivo, para identificar imediatamente a conclusão do desafio.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o backend informa que o robô alcançou a célula objetivo, então a interface exibe o desafio como `Cumprido`.
	 - **CA2:** A indicação informa visualmente que a execução foi concluída e permanece visível até a troca de execução ou limpeza do painel.
	 - **CA3:** Enquanto o objetivo não foi alcançado, então a interface não exibe a execução como concluída.
 - **Protótipo:** indicador de desafio cumprido.
 - **Casos de teste:** CT-FE-07.

 ### HU-FE-08 — Cronometrar a tentativa

 - **RF:** [RF-64](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/144) · **Prioridade:** Must have (P0) · **RNF:** RNF-37, RNF-40, RNF-46, RNF-47
 - **História:** Eu, como **operador**, quero acompanhar o tempo decorrido e o tempo final da tentativa, para avaliar seu desempenho.
 - **Critérios de aceitação:**
	 - **CA1:** Quando a tentativa começa, então o cronômetro passa a mostrar o tempo decorrido.
	 - **CA2:** Durante a tentativa, quando novas mensagens chegam, então o cronômetro permanece crescente e não reinicia por causa de atualização da interface.
	 - **CA3:** Quando a tentativa termina com sucesso, falha ou interrupção, então o cronômetro congela e exibe o tempo de conclusão recebido ou derivado pelo backend.
	 - **CA4:** Quando a página recebe uma atualização atrasada, então o tempo exibido não diminui.
 - **Protótipo:** cronômetro da tentativa.
 - **Casos de teste:** CT-FE-08.

 ### HU-FE-09 — Listar o histórico de execuções

 - **RF:** [RF-65](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/145) · **Prioridade:** Must have (P0) · **RNF:** RNF-41, RNF-42, RNF-43, RNF-44, RNF-45
 - **História:** Eu, como **avaliador**, quero consultar as execuções armazenadas, para comparar tentativas anteriores.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o histórico é aberto, então a interface exibe data e hora, tipo de labirinto, tempo de execução e resultado de cada registro.
	 - **CA2:** Dado que não existem registros ou a consulta falhou, então a interface exibe uma mensagem de estado apropriada sem apresentar dados antigos como atuais.
	 - **CA3:** Para até 200 execuções, quando a consulta é solicitada, então a listagem é exibida em até 2 s.
 - **Protótipo:** tela de histórico.
 - **Casos de teste:** CT-FE-09.

 ### HU-FE-10 — Filtrar execuções por tipo de labirinto

 - **RF:** [RF-66](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/146) · **Prioridade:** Must have (P0) · **RNF:** RNF-43, RNF-44, RNF-45
 - **História:** Eu, como **avaliador**, quero filtrar o histórico por tipo de labirinto, para consultar somente as execuções relevantes.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o operador seleciona `4x4`, `8x4`, `12x4` ou `Todos`, então a interface solicita e exibe somente os registros correspondentes.
	 - **CA2:** Quando o filtro é alterado, então a listagem anterior é substituída pelos resultados do novo filtro e o estado selecionado permanece visível.
	 - **CA3:** Quando nenhum registro corresponde ao filtro, então a interface exibe estado vazio sem erro.
 - **Protótipo:** filtro do histórico.
 - **Casos de teste:** CT-FE-10.

 ### HU-FE-11 — Detalhar uma execução passada

 - **RF:** [RF-67](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/147) · **Prioridade:** Should have (P1) · **RNF:** RNF-40, RNF-43, RNF-44, RNF-45
 - **História:** Eu, como **operador**, quero abrir uma execução do histórico e vê-la na mesma visualização do acompanhamento ao vivo, para analisar seu trajeto e suas métricas.
 - **Critérios de aceitação:**
	 - **CA1:** Quando uma execução válida é selecionada, então a interface abre a visualização com tipo de labirinto, mapa, trajeto, métricas, tempo e resultado daquela execução.
	 - **CA2:** O modo histórico é distinguível do modo ao vivo e não permite que novas mensagens alterem a execução passada.
	 - **CA3:** Quando a execução não existe ou não pode ser carregada, então a interface informa o erro e mantém o usuário no histórico.
 - **Protótipo:** detalhe da execução.
 - **Casos de teste:** CT-FE-11.

 ### HU-FE-12 — Analisar o consumo durante a tentativa

 - **RF:** [RF-68](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/148) · **Prioridade:** Should have (P1) · **RNF:** RNF-37, RNF-38, RNF-40, RNF-47
 - **História:** Eu, como **operador**, quero acompanhar a evolução da energia da bateria, para avaliar o consumo e a autonomia do robô.
 - **Critérios de aceitação:**
	 - **CA1:** Dado um histórico de amostras, quando o gráfico é exibido, então apresenta tensão em V, corrente em A e potência em W ao longo da tentativa.
	 - **CA2:** Quando o backend fornece carga estimada e variação de tensão, então esses valores são exibidos no gráfico ou nos indicadores associados.
	 - **CA3:** Quando novas amostras chegam, então o gráfico é atualizado sem apagar os pontos anteriores da mesma tentativa.
	 - **CA4:** Dado uma tentativa de 10 minutos amostrada a 10 Hz, então a interface mantém as 6.000 amostras sem perda.
 - **Protótipo:** gráfico de consumo.
 - **Casos de teste:** CT-FE-12.

 ### HU-FE-13 — Sinalizar falha de execução

 - **RF:** [RF-69](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/149) · **Prioridade:** Should have (P1) · **RNF:** RNF-37, RNF-39, RNF-46
 - **História:** Eu, como **operador**, quero ser informado quando uma tentativa falhar ou for interrompida, para tomar a decisão adequada durante a apresentação.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o backend informa perda de comunicação, então o painel sinaliza que a execução está sem sinal.
	 - **CA2:** Quando o backend informa estouro de tempo limite ou erro do firmware, então o painel exibe a falha e o motivo recebido.
	 - **CA3:** Quando a comunicação é retomada, então a interface diferencia retomada de execução concluída e atualiza o estado da conexão.
	 - **CA4:** A sinalização de falha é exibida em até 500 ms após o recebimento do evento correspondente.
 - **Protótipo:** alerta de falha da execução.
 - **Casos de teste:** CT-FE-13.

 ### HU-FE-14 — Consultar dados em modo de depuração

 - **RF:** [RF-70](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/150) · **Prioridade:** Could have (P2) · **RNF:** RNF-38, RNF-40, RNF-41, RNF-45, RNF-47
 - **História:** Eu, como **equipe de desenvolvimento**, quero consultar os dados brutos dos sensores e atuadores, para diagnosticar problemas durante os testes.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o modo de depuração é habilitado, então a interface exibe as leituras dos sete sensores ToF, o ângulo do MPU-6050 e as contagens dos encoders.
	 - **CA2:** Quando chegam novas leituras, então os valores brutos são atualizados sem substituir o histórico da tentativa armazenado em memória.
	 - **CA3:** O modo de depuração fica em área secundária e não oculta os dados obrigatórios da execução.
	 - **CA4:** Dados ausentes ou inválidos são marcados como indisponíveis, sem serem convertidos silenciosamente em zero.
 - **Protótipo:** área secundária de depuração.
 - **Casos de teste:** CT-FE-14.

 ### HU-FE-15 — Exportar resultados da execução

 - **RF:** [RF-71](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/151) · **Prioridade:** Could have (P2) · **RNF:** RNF-40, RNF-41, RNF-45
 - **História:** Eu, como **equipe de desenvolvimento**, quero exportar os dados de uma execução, para utilizá-los no relatório final e em análises externas.
 - **Critérios de aceitação:**
	 - **CA1:** Quando o usuário solicita a exportação de uma execução, então a interface oferece formato CSV ou JSON.
	 - **CA2:** O arquivo exportado contém, no mínimo, identificação da execução, tipo de labirinto, trajeto, métricas, status e dados de energia recebidos.
	 - **CA3:** Quando a exportação é concluída, então o navegador inicia o download com extensão e tipo de conteúdo compatíveis com o formato escolhido.
	 - **CA4:** Quando a exportação falha, então a interface informa o erro sem apagar os dados atualmente exibidos.
 - **Protótipo:** controle de exportação no detalhe da execução.
 - **Casos de teste:** CT-FE-15.
