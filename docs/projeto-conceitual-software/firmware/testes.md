# Roteiro de Testes Funcionais - Firmware (RF-27 a RF-56)

- **Atividade:** 4.1 - Casos de teste do firmware (RF Must have) - [issue #257](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/257)
- **Épico:** Roteiro de Testes Funcionais
- **Responsável:** Gustavo Oki / Samuel
- **Entrega da etapa (AP5):** 28/09/2026
- **Projeto:** Rato Borrachudo
- **Grupo 1 - PI1 2026/2**

---

## 1. Escopo e como usar

Este documento define os **casos de teste funcionais** do firmware embarcado no ESP32, cobrindo todos os requisitos **Must have** da faixa RF-27 a RF-56. Cada caso segue o formato exigido pelo `4.4 - Projeto conceitual de software.md`: **código, nome, rastreabilidade (RF/HU), objetivo, pré-condições, procedimento e resultado esperado**. Há um caso de teste por requisito, rastreado à HU correspondente do documento `4.4.3 - Backlog Firmware`.

Cada caso já está pronto para virar item de teste no GitHub. Os casos que dependem apenas de lógica (Flood Fill, derivações) podem ser executados como **testes automatizados** (Unity/native no PlatformIO); os demais são **testes de bancada** ou **na pista de testes 4×4**.

## 2. Ambientes e instrumentos de teste

- **Bancada (protoboard):** validação de módulos individuais com o monitor serial.
- **Pista de testes 4×4** (RF-4): validação de navegação, movimento e sensoriamento em condição real.
- **Ambiente _native_ (PlatformIO + Unity):** lógica desacoplada do hardware (Flood Fill, conversões, máquina de estados).
- **Instrumentos:** multímetro, osciloscópio (verificação de PWM), fonte de bancada, monitor serial e o **painel web/simulador** para conferência da telemetria.
- **Condição padrão:** salvo indicação, os limiares de detecção dos ToF já estão calibrados (RNF-31) e a bateria LiPo 2S está carregada.

## 3. Convenção do caso de teste

Cada caso contém: **Código** (CT-FW-XX) - **Nome** - **Rastreabilidade** (RF + issue + HU) - **Objetivo** - **Pré-condições** - **Procedimento** - **Resultado esperado (pós-condição)**. Todos os RF cobertos são de prioridade **Must have**.

---

## 4. Casos de teste

### Épico FW-1 - Inicialização e Auto-teste

**CT-FW-01 - Auto-teste do ESP32 ao boot**

- **Rastreabilidade:** RF-27 - [#107](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/107) - HU-01
- **Objetivo:** verificar que o firmware valida o microcontrolador e os GPIO antes de acessar periféricos.
- **Pré-condições:** ESP32 energizado; monitor serial conectado.
- **Procedimento:**
  1. Energizar a placa.
  2. Observar o log de boot no monitor serial.
  3. Repetir induzindo falha (ex.: GPIO essencial em curto/aberto conhecido).
- **Resultado esperado:** no boot normal, o log confirma auto-teste OK antes de qualquer acesso a periférico; sob falha, o firmware **não** prossegue à inicialização dos periféricos e sinaliza a falha (LED/buzzer).

**CT-FW-02 - Reendereçamento dos sensores ToF no I²C**

- **Rastreabilidade:** RF-28 - [#108](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/108) - HU-02
- **Objetivo:** confirmar que os sete VL53L1X recebem endereços I²C únicos.
- **Pré-condições:** sete ToF conectados com seus pinos XSHUT no barramento; monitor serial.
- **Procedimento:**
  1. Energizar.
  2. Acompanhar o log de reendereçamento.
  3. Executar varredura I²C após a inicialização.
- **Resultado esperado:** o log mostra desativação por XSHUT, ativação individual e gravação de endereço com confirmação a cada passo; a varredura final acusa **7 endereços distintos**. Endereço duplicado ou sensor mudo gera falha de inicialização.

**CT-FW-03 - Verificação de comunicação com IMU e INA219**

- **Rastreabilidade:** RF-29 - [#109](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/109) - HU-03
- **Objetivo:** garantir que MPU-6050 e INA219 respondem após o reendereçamento.
- **Pré-condições:** IMU e INA219 no barramento; ToF já reendereçados.
- **Procedimento:**
  1. Energizar.
  2. Observar a verificação de IMU e INA219 no log.
  3. Repetir desconectando o IMU.
- **Resultado esperado:** com ambos presentes, o log confirma resposta dos dois antes de qualquer leitura sensorial; com um ausente, a inicialização falha e é sinalizada.

**CT-FW-04 - Leitura do DIP switch e tipo de labirinto**

- **Rastreabilidade:** RF-30 - [#110](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/110) - HU-04
- **Objetivo:** validar que o tipo de labirinto lido define as dimensões da grade e a célula objetivo.
- **Pré-condições:** DIP switch acessível; monitor serial.
- **Procedimento:** para cada configuração {4×4, 8×4, 12×4}:
  1. posicionar o DIP switch;
  2. energizar;
  3. ler no log as dimensões da grade e a célula objetivo.
- **Resultado esperado:** para cada configuração, o log reporta as dimensões e a célula objetivo corretas para aquele tipo.

**CT-FW-05 - Inicialização do mapa do labirinto**

- **Rastreabilidade:** RF-31 - [#111](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/111) - HU-05
- **Objetivo:** confirmar o estado inicial correto do mapa.
- **Pré-condições:** tipo de labirinto definido no DIP switch.
- **Procedimento:**
  1. Energizar.
  2. Exportar/imprimir o estado inicial do mapa e dos valores de inundação (log/serial).
- **Resultado esperado:** paredes internas = "desconhecida"; perímetro externo = "presente"; valores de inundação propagados a partir da célula objetivo (objetivo = 0, crescendo).

**CT-FW-06 - Sinalização de prontidão e transição para Aguardando**

- **Rastreabilidade:** RF-32 - [#112](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/112) - HU-06
- **Objetivo:** verificar a sinalização de prontidão ao fim da inicialização.
- **Pré-condições:** inicialização completa sem falhas.
- **Procedimento:**
  1. Energizar e aguardar o fim da inicialização.
  2. Observar LEDs/buzzer e o estado reportado.
- **Resultado esperado:** ao concluir todos os passos, buzzer/LEDs sinalizam prontidão e o estado passa a **Aguardando**; se algum passo falhou, a prontidão **não** é sinalizada.

### Épico FW-2 - Sensoriamento e Percepção

**CT-FW-07 - Leitura periódica dos ToF**

- **Rastreabilidade:** RF-33 - [#113](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/113) - HU-07
- **Objetivo:** validar a leitura sequencial dos sete ToF a cada ciclo.
- **Pré-condições:** robô no estado Mapeando, em célula com paredes conhecidas na bancada/pista.
- **Procedimento:**
  1. Posicionar o robô a distâncias medidas com paquímetro/régua.
  2. Registrar as leituras dos sete sensores no serial.
- **Resultado esperado:** os sete sensores retornam distância em mm a cada ciclo, cobrindo frontal, 2 laterais, 2 diagonais e 2 adicionais, condizentes com as distâncias reais.

**CT-FW-08 - Classificação de paredes por limiar**

- **Rastreabilidade:** RF-34 - [#114](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/114) - HU-08
- **Objetivo:** verificar a classificação presente/ausente por limiar.
- **Pré-condições:** limiares calibrados (RNF-31).
- **Procedimento:**
  1. Colocar parede a uma distância abaixo do limiar;
  2. retirar a parede (acima do limiar);
  3. registrar a classificação para cada face.
- **Resultado esperado:** leitura abaixo do limiar → "presente"; acima → "ausente", para cada face avaliada.

**CT-FW-09 - Leitura de dados do IMU**

- **Rastreabilidade:** RF-35 - [#115](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/115) - HU-09
- **Objetivo:** validar a leitura de giroscópio e acelerômetro.
- **Pré-condições:** IMU operante.
- **Procedimento:**
  1. Manter o robô parado (referência).
  2. Girar 90° manualmente.
  3. Registrar giroscópio e acelerômetro.
- **Resultado esperado:** parado, taxas próximas de zero; ao girar, o giroscópio acusa a rotação; leituras dos 3 eixos disponíveis a cada ciclo para curva e correção.

**CT-FW-10 - Leitura de energia do INA219**

- **Rastreabilidade:** RF-36 - [#116](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/116) - HU-10
- **Objetivo:** validar a leitura de tensão, corrente e potência.
- **Pré-condições:** INA219 no barramento de bateria; multímetro de referência.
- **Procedimento:**
  1. Medir a tensão da bateria com multímetro.
  2. Comparar com a leitura do INA219 no serial e na telemetria.
- **Resultado esperado:** tensão, corrente e potência são lidas periodicamente e entram na telemetria; a tensão bate com o multímetro dentro da tolerância (ver RNF-10, ±0,1 V no circuito de leitura).

**CT-FW-11 - Atualização bidirecional do mapa**

- **Rastreabilidade:** RF-37 - [#117](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/117) - HU-11
- **Objetivo:** garantir consistência da parede compartilhada entre células vizinhas.
- **Pré-condições:** robô mapeando.
- **Procedimento:**
  1. Detectar uma parede entre as células A e B.
  2. Inspecionar o registro das faces de A e de B no mapa.
- **Resultado esperado:** a parede é registrada simultaneamente na face correspondente de A **e** de B.

### Épico FW-3 - Navegação e Algoritmo Flood Fill

**CT-FW-12 - Propagação dos valores de inundação**

- **Rastreabilidade:** RF-38 - [#118](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/118) - HU-12
- **Objetivo:** validar o cálculo do Flood Fill. _(Teste automatizado - ambiente native.)_
- **Pré-condições:** mapa de teste conhecido carregado no teste unitário.
- **Procedimento:**
  1. Carregar um labirinto de referência.
  2. Executar a propagação.
  3. Comparar a matriz de valores com o gabarito.
- **Resultado esperado:** objetivo = 0; cada célula acessível recebe (valor do vizinho + 1); matriz idêntica ao gabarito.

**CT-FW-13 - Seleção da próxima célula de menor valor**

- **Rastreabilidade:** RF-39 - [#119](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/119) - HU-13
- **Objetivo:** validar a escolha do próximo passo e o desempate. _(Automatizado.)_
- **Pré-condições:** mapa com valores de inundação e um caso de empate montado.
- **Procedimento:**
  1. Posicionar em célula com vizinhos de valores distintos → verificar escolha.
  2. Montar empate entre dois vizinhos → verificar desempate.
- **Resultado esperado:** escolhe a vizinha acessível de menor valor; no empate, aplica o critério determinístico documentado (RNF-32), com resultado reproduzível.

**CT-FW-14 - Recálculo de rota por nova parede**

- **Rastreabilidade:** RF-40 - [#120](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/120) - HU-14
- **Objetivo:** validar o recálculo ao detectar parede que invalida a rota.
- **Pré-condições:** robô mapeando na pista 4×4 com um beco.
- **Procedimento:**
  1. Conduzir o robô a uma rota que leva a um beco sem saída.
  2. Observar a reação ao detectar a parede.
- **Resultado esperado:** o robô interrompe o movimento, registra a parede, recalcula os valores de inundação afetados e só então segue por nova direção.

**CT-FW-15 - Encerramento do mapeamento e transição**

- **Rastreabilidade:** RF-41 - [#121](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/121) - HU-15
- **Objetivo:** validar a chegada ao objetivo e a transição Mapeando→Resolvendo.
- **Pré-condições:** pista 4×4; sessão iniciada.
- **Procedimento:**
  1. Executar uma tentativa completa até o objetivo.
  2. Em outra execução, forçar o mapa a completar antes da chegada.
- **Resultado esperado:** ao ocupar a célula objetivo, o estado vai a **Concluído**; se o mapa completa antes, transita para **Resolvendo** e executa o percurso ótimo sem novos recálculos.

### Épico FW-4 - Controle de Movimento

**CT-FW-16 - Geração de PWM via LEDC**

- **Rastreabilidade:** RF-42 - [#122](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/122) - HU-16
- **Objetivo:** validar a geração de PWM independente por motor.
- **Pré-condições:** DRV8833 conectado; osciloscópio nas saídas.
- **Procedimento:**
  1. Comandar duty cycles distintos e sentidos opostos para cada motor.
  2. Medir os sinais no osciloscópio.
- **Resultado esperado:** frequência fixa configurada na inicialização; duty variável por canal; direção e velocidade de cada motor controladas de forma independente.

**CT-FW-17 - Malha PID de equalização de velocidades**

- **Rastreabilidade:** RF-43 - [#123](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/123) - HU-17
- **Objetivo:** validar que o robô anda reto igualando as velocidades.
- **Pré-condições:** robô montado, encoders funcionando, pista com trecho reto.
- **Procedimento:**
  1. Comandar a travessia de uma célula em linha reta.
  2. Registrar a contagem dos dois encoders e medir o desvio lateral ao final.
- **Resultado esperado:** o PID reduz a diferença de contagem entre os encoders; o robô conclui o trecho reto com desvio dentro do tolerado (referência RNF-16).

**CT-FW-18 - Correção de trajetória por ToF laterais e IMU**

- **Rastreabilidade:** RF-44 - [#124](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/124) - HU-18
- **Objetivo:** validar a correção do desvio lateral.
- **Pré-condições:** pista com paredes laterais; robô introduzido levemente descentralizado.
- **Procedimento:**
  1. Iniciar a travessia deslocado do eixo.
  2. Observar a correção ao longo da célula.
- **Resultado esperado:** o robô ajusta o diferencial de velocidade e converge para o centro da célula, sem tocar as paredes.

**CT-FW-19 - Controle do ângulo de curva**

- **Rastreabilidade:** RF-45 - [#125](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/125) - HU-19
- **Objetivo:** validar curvas de 90°/180° pelo giroscópio.
- **Pré-condições:** IMU calibrado; espaço de uma célula.
- **Procedimento:**
  1. Comandar uma curva de 90°.
  2. Comandar 180°.
  3. Medir o ângulo real (gabarito/transferidor) e comparar com o alvo.
- **Resultado esperado:** a rotação converge ao ângulo-alvo dentro da tolerância calibrada.

**CT-FW-20 - Autorização de avanço após curva**

- **Rastreabilidade:** RF-46 - [#126](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/126) - HU-20
- **Objetivo:** garantir que o avanço só ocorre após a curva concluída.
- **Pré-condições:** robô executando uma curva.
- **Procedimento:**
  1. Comandar uma curva e observar o momento do avanço.
  2. Induzir uma curva incompleta (segurar levemente o robô) e observar.
- **Resultado esperado:** o avanço só é autorizado quando o ângulo acumulado atinge o alvo dentro da tolerância; se não atingir, o robô **não** avança.

### Épico FW-5 - Odometria

**CT-FW-21 - Captura de pulsos por interrupção**

- **Rastreabilidade:** RF-47 - [#127](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/127) - HU-21
- **Objetivo:** garantir que nenhum pulso é perdido.
- **Pré-condições:** encoders acoplados; referência de voltas conhecida.
- **Procedimento:**
  1. Girar a roda um número conhecido de voltas (à mão ou motor).
  2. Comparar a contagem por interrupção com o esperado.
  3. Repetir em alta velocidade.
- **Resultado esperado:** contagem por interrupção igual ao esperado, inclusive em alta velocidade/carga (sem perda de pulsos).

**CT-FW-22 - Conversão de pulsos em distância**

- **Rastreabilidade:** RF-48 - [#128](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/128) - HU-22
- **Objetivo:** validar a distância calculada. _(Parcialmente automatizado.)_
- **Pré-condições:** parâmetros (pulsos/rev, diâmetro da roda) configurados.
- **Procedimento:**
  1. Deslocar o robô uma distância medida (ex.: 180 mm, uma célula).
  2. Comparar a distância calculada com a medida.
- **Resultado esperado:** a distância em mm corresponde à real dentro da tolerância; valor atualizado a cada ciclo de odometria.

**CT-FW-23 - Contagem de células percorridas**

- **Rastreabilidade:** RF-49 - [#129](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/129) - HU-23
- **Objetivo:** validar o incremento do contador de células.
- **Pré-condições:** pista 4×4.
- **Procedimento:**
  1. Conduzir o robô por um caminho de N células conhecido.
  2. Ler o contador na telemetria.
- **Resultado esperado:** o contador incrementa a cada célula inteira percorrida e o valor atualizado aparece na telemetria; total = N.

**CT-FW-24 - Cálculo da velocidade média**

- **Rastreabilidade:** RF-50 - [#130](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/130) - HU-24
- **Objetivo:** validar a velocidade média da sessão.
- **Pré-condições:** sessão em andamento com tempo e distância conhecidos.
- **Procedimento:**
  1. Executar um percurso e cronometrar.
  2. Comparar (distância total ÷ tempo) com o valor reportado.
- **Resultado esperado:** a velocidade média reportada corresponde à razão distância/tempo, atualizada a cada ciclo de telemetria.

### Épico FW-6 - Telemetria e Comunicação

**CT-FW-25 - Conexão Wi-Fi em modo estação (STA)**

- **Rastreabilidade:** RF-51 - [#131](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/131) - HU-25
- **Objetivo:** validar a conexão à rede local antes de Aguardando.
- **Pré-condições:** rede local configurada nos parâmetros de compilação.
- **Procedimento:**
  1. Energizar.
  2. Acompanhar no serial a conexão Wi-Fi.
- **Resultado esperado:** o ESP32 conecta em modo STA à rede definida **antes** de transitar para Aguardando.

**CT-FW-26 - Transmissão contínua da telemetria**

- **Rastreabilidade:** RF-52 - [#132](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/132) - HU-26
- **Objetivo:** validar a carga útil transmitida durante a sessão.
- **Pré-condições:** backend/simulador ativo; sessão iniciada.
- **Procedimento:**
  1. Iniciar uma tentativa.
  2. Inspecionar as mensagens recebidas no backend/painel.
- **Resultado esperado:** durante toda a sessão chegam mensagens contendo estado de navegação, contador de células, velocidade média, posição no mapa e dados de energia (INA219).

**CT-FW-27 - Transmissão unidirecional**

- **Rastreabilidade:** RF-53 - [#133](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/133) - HU-27
- **Objetivo:** garantir que o firmware não reage a mensagens de entrada.
- **Pré-condições:** sessão ativa.
- **Procedimento:**
  1. Enviar mensagens do servidor ao robô durante a sessão.
  2. Observar o comportamento da navegação.
- **Resultado esperado:** o firmware ignora as mensagens de entrada (não processa/responde) e a navegação segue inalterada (ver também CT-FW-31/RNF-33).

### Épico FW-7 - Máquina de Estados e Robustez

**CT-FW-28 - Máquina de estados de navegação**

- **Rastreabilidade:** RF-54 - [#134](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/134) - HU-28
- **Objetivo:** validar os seis estados e apenas as transições autorizadas.
- **Pré-condições:** telemetria acessível para leitura do estado corrente.
- **Procedimento:**
  1. Percorrer o ciclo completo (Inicializando→Aguardando→Mapeando→[Resolvendo]→Concluído).
  2. Tentar disparar transições não autorizadas.
- **Resultado esperado:** os seis estados ocorrem; apenas as transições previstas acontecem; o estado corrente aparece na telemetria a cada ciclo.

**CT-FW-29 - Detecção de falha e estado Erro**

- **Rastreabilidade:** RF-55 - [#135](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/135) - HU-29
- **Objetivo:** validar a parada segura em falha irrecuperável.
- **Pré-condições:** robô em operação.
- **Procedimento:**
  1. Induzir uma falha irrecuperável (ex.: desconectar um sensor essencial durante a navegação).
  2. Observar a reação.
- **Resultado esperado:** o firmware transita para **Erro**, interrompe todos os PWM dos motores e sinaliza via buzzer/LEDs.

**CT-FW-30 - Isolamento entre sessões consecutivas**

- **Rastreabilidade:** RF-56 - [#136](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/136) - HU-30
- **Objetivo:** garantir que uma nova sessão começa limpa.
- **Pré-condições:** uma sessão concluída.
- **Procedimento:**
  1. Concluir uma tentativa.
  2. Iniciar nova sessão.
  3. Inspecionar mapa, contador de células e temporizador.
- **Resultado esperado:** a nova sessão só inicia após retorno a Aguardando, com mapa reinicializado, contador zerado e temporizador zerado (sem resíduo da sessão anterior).

---

## 5. Apêndice - Casos para os RNF de firmware (Must have)

Requisitos não-funcionais de firmware fortemente ligados aos casos acima; incluídos por serem Must have e testáveis.

**CT-FW-31 - Isolamento telemetria × navegação**

- **Rastreabilidade:** RNF-33 - [#211](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/211)
- **Objetivo:** garantir que falhas de Wi-Fi não afetam a navegação.
- **Procedimento:** durante uma tentativa, derrubar a rede Wi-Fi por período prolongado e observar a navegação; restabelecer a rede.
- **Resultado esperado:** a navegação prossegue normalmente (não vai a Erro); a telemetria retoma automaticamente ao voltar a conexão.

**CT-FW-32 - Desempate determinístico do Flood Fill**

- **Rastreabilidade:** RNF-32 - [#210](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/210)
- **Objetivo:** garantir reprodutibilidade sob empate. _(Automatizado.)_
- **Procedimento:** executar o mesmo labirinto com empates N vezes.
- **Resultado esperado:** a mesma sequência de decisões em todas as execuções.

**CT-FW-33 - Compensação de deriva do giroscópio**

- **Rastreabilidade:** RNF-34 - [#212](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/212)
- **Objetivo:** limitar a propagação de erro entre curvas.
- **Procedimento:** executar várias curvas consecutivas e medir o erro angular acumulado.
- **Resultado esperado:** a referência angular é resetada após cada curva confirmada; o erro não cresce indefinidamente entre curvas.

**CT-FW-34 - DIP switch lido apenas no boot**

- **Rastreabilidade:** RNF-35 - [#213](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/213)
- **Objetivo:** garantir que alterações no DIP após o boot são ignoradas.
- **Procedimento:** iniciar uma sessão e, durante ela, alterar o DIP switch; observar o comportamento.
- **Resultado esperado:** a alteração é ignorada durante toda a sessão em curso.

---

## 6. Matriz de rastreabilidade

| Caso de teste          | RF                 | HU            |
| :--------------------- | :----------------- | :------------ |
| CT-FW-01…06            | RF-27 a RF-32      | HU-01 a HU-06 |
| CT-FW-07…11            | RF-33 a RF-37      | HU-07 a HU-11 |
| CT-FW-12…15            | RF-38 a RF-41      | HU-12 a HU-15 |
| CT-FW-16…20            | RF-42 a RF-46      | HU-16 a HU-20 |
| CT-FW-21…24            | RF-47 a RF-50      | HU-21 a HU-24 |
| CT-FW-25…27            | RF-51 a RF-53      | HU-25 a HU-27 |
| CT-FW-28…30            | RF-54 a RF-56      | HU-28 a HU-30 |
| CT-FW-31…34 (apêndice) | RNF-32, 33, 34, 35 | -             |

**Cobertura:** 30 casos cobrem os 30 RF Must have de firmware (RF-27 a RF-56), 1:1; 4 casos adicionais cobrem os RNF de firmware testáveis. Cada caso é rastreável ao RF/HU e reaproveita os critérios de aceitação já definidos no backlog.
