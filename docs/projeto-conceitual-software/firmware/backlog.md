# Backlog do Produto - Histórias de Usuário do Firmware (RF-27 a RF-56)

- **Atividade:** 1.1 - Escrever HUs do Firmware - [issue #241](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/241)
- **Épico:** Backlog do Produto
- **Responsável:** Gustavo Oki / Samuel
- **Entrega da etapa (AP5):** 28/09/2026
- **Projeto:** Rato Borrachudo
- **Grupo 1 - PI1 2026/2**

---

## 1. Escopo e como usar este documento

Este documento detalha os **30 requisitos funcionais de firmware** (RF-27 a RF-56, embarcados no ESP32) em **Histórias de Usuário (HU)**, no formato exigido pelo documento `4.4 - Projeto conceitual de software.md`: cada HU tem **descrição Eu-Como-Para**, **critérios de aceitação** e **rastreabilidade** ao RF de origem.

Cada bloco de HU abaixo já está pronto para ser **colado no corpo de uma issue** no GitHub (uma issue por HU), como sub-issue do respectivo épico. Ao criar a issue, copie o número gerado para a coluna "ID (Link Github Projects)" da tabela consolidada da seção 5.

## 2. Atores

Para o firmware, o beneficiário das histórias é quase sempre o **Operador** - a pessoa que prepara, dispara e acompanha o micromouse na bancada e na competição. Quando a história beneficia diretamente quem depura o robô, o ator é a **Equipe de software (depuração)**.

## 3. Convenção sobre protótipos de interface

O documento `4.4` exige protótipos de interface **para HUs que possuem tela**. O firmware **não possui interface gráfica** - sua interação com o operador é **física**, por meio de: botão de disparo, DIP switch (tipo de labirinto e canto de partida), LEDs de estado e buzzer de depuração. Assim, para as HUs de firmware não há protótipo de alta fidelidade; onde há interação física, ela está indicada no campo **Interface** da HU. Os protótipos de alta fidelidade pertencem às HUs do **frontend** (dashboard).

Todos os RF de firmware desta faixa são de prioridade **Must have**.

---

## 4. Épicos e Histórias de Usuário

### Épico FW-1 - Inicialização e Auto-teste (RF-27 a RF-32)

---

**HU-01 - Auto-teste do ESP32 ao boot**

- **Rastreabilidade:** RF-27 - [#107](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/107)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **verifique o funcionamento do ESP32 e a configuração dos pinos GPIO ao ligar**, para **ter certeza de que o robô está apto antes de qualquer operação com periféricos**.
- **Critérios de aceitação:**
  1. Ao energizar, antes de acessar qualquer periférico externo, o firmware executa a verificação básica do microcontrolador e dos GPIO.
  2. Se a verificação falhar, o firmware **não** prossegue para a inicialização dos periféricos.
  3. O resultado do auto-teste é registrado (log serial) e, em caso de falha, sinalizado fisicamente.
- **Interface:** física (LED/buzzer em caso de falha).

---

**HU-02 - Reendereçamento dos sensores ToF no barramento I2C**

- **Rastreabilidade:** RF-28 - [#108](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/108)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **atribua endereços I2C únicos aos sete sensores VL53L1X na inicialização**, para que **todos possam ser lidos individualmente no mesmo barramento**.
- **Critérios de aceitação:**
  1. Na inicialização, o firmware desativa todos os sensores via XSHUT, ativa um a um e grava um novo endereço em cada.
  2. Após cada atribuição há confirmação de comunicação no barramento I2C.
  3. Ao final, os sete sensores respondem em endereços distintos; endereço duplicado ou sensor sem resposta gera falha de inicialização.
- **Interface:** não se aplica.

---

**HU-03 - Verificação de comunicação com IMU e INA219**

- **Rastreabilidade:** RF-29 - [#109](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/109)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **confirme que o MPU-6050 e o INA219 respondem no I2C após o reendereçamento**, para **garantir que os sensores essenciais estão operantes antes de ler dados**.
- **Critérios de aceitação:**
  1. Após o reendereçamento dos ToF, o firmware consulta IMU e INA219 no barramento.
  2. Se qualquer um não responder, a inicialização falha e é sinalizada.
  3. Nenhuma leitura de dados sensoriais ocorre antes dessa confirmação.
- **Interface:** física (sinalização em caso de falha).

---

**HU-04 - Leitura do DIP switch e determinação do tipo de labirinto**

- **Rastreabilidade:** RF-30 - [#110](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/110)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero **selecionar o tipo de labirinto (4x4, 8x4 ou 12x4) no DIP switch e que o firmware o leia no boot**, para que **o robô monte o mapa nas dimensões corretas**.
- **Critérios de aceitação:**
  1. Na inicialização, o firmware lê o estado das chaves do DIP switch via GPIO.
  2. O tipo lido define as dimensões da grade e a posição da célula objetivo.
  3. A seleção é fixada para a sessão em curso.
- **Interface:** física (DIP switch).

---

**HU-05 - Inicialização do mapa do labirinto**

- **Rastreabilidade:** RF-31 - [#111](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/111)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **aloque e prepare a matriz do labirinto conforme o tipo lido**, para que **a navegação comece com um mapa consistente**.
- **Critérios de aceitação:**
  1. A estrutura matricial é alocada com dimensões derivadas do tipo de labirinto.
  2. As paredes internas iniciam com estado "desconhecida" e o perímetro externo com "presente".
  3. Os valores de inundação iniciais são propagados a partir da célula objetivo.
- **Interface:** não se aplica.

---

**HU-06 - Sinalização de prontidão e transição para Aguardando**

- **Rastreabilidade:** RF-32 - [#112](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/112)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o robô **sinalize quando terminou a inicialização**, para **saber que posso dispará-lo**.
- **Critérios de aceitação:**
  1. Após todos os passos de inicialização bem-sucedidos, o firmware aciona o buzzer e os LEDs de interface local.
  2. Em seguida, transita para o estado de navegação Aguardando.
  3. Se algum passo anterior falhou, a prontidão não é sinalizada.
- **Interface:** física (LED/buzzer).

### Épico FW-2 - Sensoriamento e Percepção (RF-33 a RF-37)

---

**HU-07 - Leitura periódica dos sensores ToF VL53L1X**

- **Rastreabilidade:** RF-33 - [#113](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/113)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **leia os sete ToF a cada ciclo de sensoriamento**, para que **o robô perceba as paredes ao redor da célula atual**.
- **Critérios de aceitação:**
  1. A cada ciclo, os sete sensores são lidos de forma temporizada e sequencial via I2C.
  2. As posições cobertas são frontal, duas laterais, duas diagonais e duas adicionais.
  3. Cada leitura retorna distância em milímetros.
- **Interface:** não se aplica.

---

**HU-08 - Classificação de paredes por limiar de detecção**

- **Rastreabilidade:** RF-34 - [#114](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/114)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **classifique cada face da célula como parede presente ou ausente comparando a leitura ao limiar**, para **identificar a configuração da célula atual**.
- **Critérios de aceitação:**
  1. Cada leitura é comparada ao limiar de detecção configurado para aquela posição de sensor.
  2. Leitura abaixo do limiar → parede presente; acima do limiar → parede ausente.
  3. A classificação cobre todas as faces relevantes da célula atual.
- **Interface:** não se aplica.

---

**HU-09 - Leitura de dados do IMU MPU-6050**

- **Rastreabilidade:** RF-35 - [#115](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/115)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **colete giroscópio e acelerômetro do MPU-6050 a cada ciclo**, para **alimentar o controle de curvas e a correção de trajetória**.
- **Critérios de aceitação:**
  1. A cada ciclo, o giroscópio (3 eixos) e o acelerômetro (3 eixos) são lidos via I2C.
  2. Os dados do giroscópio alimentam o controle de ângulo de curva.
  3. Os dados do acelerômetro alimentam a correção de trajetória.
- **Interface:** não se aplica.

---

**HU-10 - Leitura de dados de energia do INA219**

- **Rastreabilidade:** RF-36 - [#116](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/116)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **leia tensão, corrente e potência do INA219 periodicamente**, para que **o consumo de bateria apareça na telemetria em tempo real**.
- **Critérios de aceitação:**
  1. Tensão no barramento da bateria, corrente drenada e potência instantânea são medidas periodicamente via I2C.
  2. Os três valores são incluídos na carga útil de telemetria.
- **Interface:** não se aplica.

---

**HU-11 - Atualização do mapa do labirinto**

- **Rastreabilidade:** RF-37 - [#117](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/117)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **registre as paredes classificadas no mapa de forma bidirecional**, para **manter a consistência entre células vizinhas**.
- **Critérios de aceitação:**
  1. Cada parede classificada (presente/ausente) é registrada no mapa.
  2. Uma parede compartilhada entre as células A e B é registrada simultaneamente nas faces correspondentes de ambas.
- **Interface:** não se aplica.

### Épico FW-3 - Navegação e Algoritmo Flood Fill (RF-38 a RF-41)

---

**HU-12 - Cálculo e propagação dos valores de inundação**

- **Rastreabilidade:** RF-38 - [#118](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/118)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **calcule os valores de inundação a partir da célula objetivo**, para que **o robô saiba a distância de cada célula até o destino**.
- **Critérios de aceitação:**
  1. A célula objetivo recebe valor de inundação 0.
  2. Cada célula adjacente sem parede presente interposta recebe o valor incrementado em 1.
  3. A propagação cobre todas as células alcançáveis do mapa.
- **Interface:** não se aplica.

---

**HU-13 - Seleção da próxima célula de menor valor de inundação**

- **Rastreabilidade:** RF-39 - [#119](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/119)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **escolha como próximo passo a célula vizinha acessível de menor valor de inundação**, para que **o robô se aproxime do objetivo a cada movimento**.
- **Critérios de aceitação:**
  1. A cada passo, seleciona a vizinha acessível (sem parede interposta) com o menor valor de inundação.
  2. Em caso de empate, aplica um critério de desempate determinístico pré-definido (ver RNF-32).
- **Interface:** não se aplica.

---

**HU-14 - Recálculo de rota por nova parede detectada**

- **Rastreabilidade:** RF-40 - [#120](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/120)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **recalcule a rota ao detectar uma parede que invalida o caminho corrente**, para que **o robô contorne obstáculos sem travar**.
- **Critérios de aceitação:**
  1. Ao detectar uma nova parede que invalida o caminho, o firmware interrompe o movimento.
  2. Registra a nova parede, recalcula os valores de inundação afetados e determina nova direção.
  3. Só retoma o deslocamento após o recálculo.
- **Interface:** não se aplica.

---

**HU-15 - Encerramento da fase de mapeamento e transição de estado**

- **Rastreabilidade:** RF-41 - [#121](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/121)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **detecte a chegada ao objetivo e conclua o percurso ótimo quando o mapa estiver completo**, para **encerrar a tentativa corretamente**.
- **Critérios de aceitação:**
  1. Ao ocupar a célula objetivo, o firmware transita o estado para Concluído.
  2. Se o mapa completar antes da chegada, transita de Mapeando para Resolvendo e executa o percurso ótimo sem novos recálculos de rota.
- **Interface:** não se aplica.

### Épico FW-4 - Controle de Movimento (RF-42 a RF-46)

---

**HU-16 - Geração de sinais PWM via canais LEDC do ESP32**

- **Rastreabilidade:** RF-42 - [#122](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/122)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **gere PWM para o driver DRV8833 controlando direção e velocidade de cada motor**, para que **o robô se mova de forma controlada**.
- **Critérios de aceitação:**
  1. Os canais LEDC são configurados com frequência de PWM fixa na inicialização.
  2. A cada ciclo de controle, gera PWM de duty cycle variável para cada canal do driver.
  3. Direção e velocidade de cada motor N20 são controladas de forma independente.
- **Interface:** não se aplica.

---

**HU-17 - Malha de controle PID para equalização de velocidades**

- **Rastreabilidade:** RF-43 - [#123](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/123)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **equalize a velocidade dos dois motores em linha reta via PID**, para que **o robô ande reto compensando assimetrias mecânicas e de atrito**.
- **Critérios de aceitação:**
  1. Durante a travessia em linha reta, o sinal de erro é a diferença de contagem de pulsos entre os encoders dos dois motores.
  2. O PID ajusta dinamicamente o duty cycle de cada canal para igualar as velocidades.
- **Interface:** não se aplica.

---

**HU-18 - Correção de trajetória por ToF laterais e IMU**

- **Rastreabilidade:** RF-44 - [#124](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/124)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **corrija o desvio lateral usando os ToF laterais (e o IMU como auxílio)**, para **manter o robô alinhado ao centro da célula**.
- **Critérios de aceitação:**
  1. Em linha reta, compara as leituras dos ToF laterais para medir o desvio lateral em relação ao eixo da célula.
  2. Opcionalmente usa o acelerômetro do IMU como sinal auxiliar.
  3. Ajusta o diferencial de velocidade entre os motores para manter o alinhamento dentro da célula.
- **Interface:** não se aplica.

---

**HU-19 - Monitoramento e controle do ângulo de curva**

- **Rastreabilidade:** RF-45 - [#125](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/125)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **integre o giroscópio durante curvas de 90°/180° e controle os motores até o ângulo-alvo**, para que **as curvas sejam precisas**.
- **Critérios de aceitação:**
  1. Durante a manobra, o firmware lê continuamente o giroscópio e integra o ângulo acumulado desde o início.
  2. Controla os motores para que a rotação convirja ao valor-alvo dentro da tolerância calibrada.
- **Interface:** não se aplica.

---

**HU-20 - Autorização de avanço após conclusão de curva**

- **Rastreabilidade:** RF-46 - [#126](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/126)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **só autorize o avanço quando a curva tiver atingido o ângulo-alvo**, para **evitar acúmulo de erro de direção**.
- **Critérios de aceitação:**
  1. Ao final da curva, verifica se o ângulo acumulado atingiu o valor-alvo dentro da tolerância calibrada.
  2. O avanço para a próxima célula só é autorizado após essa condição ser satisfeita.
- **Interface:** não se aplica.

### Épico FW-5 - Odometria (RF-47 a RF-50)

---

**HU-21 - Captura de pulsos dos encoders por interrupção de hardware**

- **Rastreabilidade:** RF-47 - [#127](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/127)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **capture cada pulso dos encoders por interrupção de hardware**, para **não perder pulsos em alta velocidade ou sob alta carga**.
- **Critérios de aceitação:**
  1. Cada pulso dos encoders é registrado por rotina de interrupção nos GPIO do ESP32.
  2. Nenhum pulso é perdido em condições de alta velocidade ou de grande carga de processamento (validar em teste).
- **Interface:** não se aplica.

---

**HU-22 - Conversão de pulsos em distância percorrida**

- **Rastreabilidade:** RF-48 - [#128](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/128)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **converta a contagem de pulsos em distância percorrida**, para **medir o deslocamento linear do robô**.
- **Critérios de aceitação:**
  1. Aplica a relação (pulsos por revolução × diâmetro da roda) para obter a distância em milímetros.
  2. O valor é atualizado a cada ciclo de odometria.
- **Interface:** não se aplica.

---

**HU-23 - Contagem de células percorridas**

- **Rastreabilidade:** RF-49 - [#129](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/129)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **conte as células percorridas**, para **acompanhar o progresso do robô na telemetria**.
- **Critérios de aceitação:**
  1. Detecta, pelos pulsos acumulados, o momento em que o robô completou a travessia de uma célula inteira.
  2. Incrementa o contador de células e inclui o valor atualizado na carga útil de telemetria.
- **Interface:** não se aplica.

---

**HU-24 - Cálculo da velocidade média da sessão de resolução**

- **Rastreabilidade:** RF-50 - [#130](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/130)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **calcule a velocidade média da sessão**, para **exibi-la na telemetria em tempo real**.
- **Critérios de aceitação:**
  1. Calcula continuamente a razão entre a distância total percorrida e o tempo decorrido desde o início da sessão.
  2. Inclui o valor a cada ciclo na carga útil de telemetria.
- **Interface:** não se aplica.

### Épico FW-6 - Telemetria e Comunicação (RF-51 a RF-53)

---

**HU-25 - Configuração do Wi-Fi em modo estação (STA)**

- **Rastreabilidade:** RF-51 - [#131](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/131)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **conecte o ESP32 à rede local em modo estação na inicialização**, para que **o robô possa transmitir a telemetria**.
- **Critérios de aceitação:**
  1. Na inicialização, configura o Wi-Fi em modo STA e conecta à rede definida por parâmetros de compilação.
  2. A conexão ocorre antes da transição para o estado Aguardando.
- **Interface:** não se aplica.

---

**HU-26 - Transmissão contínua da carga útil de telemetria**

- **Rastreabilidade:** RF-52 - [#132](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/132)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **transmita a carga útil de telemetria durante toda a sessão**, para **acompanhar a tentativa no painel web**.
- **Critérios de aceitação:**
  1. Transmite periodicamente via Wi-Fi durante toda a sessão de resolução.
  2. A carga útil inclui: estado de navegação atual, contador de células, velocidade média, posição corrente no mapa e dados de energia do INA219.
- **Interface:** não se aplica.

---

**HU-27 - Garantia de transmissão unidirecional de telemetria**

- **Rastreabilidade:** RF-53 - [#133](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/133)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **opere o Wi-Fi exclusivamente como emissor**, para que **a navegação não dependa de mensagens externas**.
- **Critérios de aceitação:**
  1. O firmware não processa, interpreta ou responde a mensagens de entrada enviadas pelo sistema web durante a sessão.
  2. Comporta-se em conformidade com o isolamento telemetria × navegação (RNF-33).
- **Interface:** não se aplica.

### Épico FW-7 - Máquina de Estados e Robustez (RF-54 a RF-56)

---

**HU-28 - Implementação da máquina de estados de navegação**

- **Rastreabilidade:** RF-54 - [#134](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/134)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **implemente os seis estados de navegação e suas transições autorizadas**, para que **o comportamento do robô seja previsível e reproduzível**.
- **Critérios de aceitação:**
  1. Estados implementados: Inicializando, Aguardando, Mapeando, Resolvendo, Concluído e Erro.
  2. Apenas as transições autorizadas entre eles ocorrem.
  3. O estado corrente entra na carga útil de telemetria a cada ciclo de transmissão.
- **Interface:** não se aplica.

---

**HU-29 - Detecção de falhas e transição para o estado Erro**

- **Rastreabilidade:** RF-55 - [#135](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/135)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que o firmware **entre no estado Erro ao detectar falha irrecuperável**, para que **o robô pare com segurança**.
- **Critérios de aceitação:**
  1. Monitora continuamente a integridade dos sensores e atuadores durante a operação.
  2. Ao detectar falha irrecuperável, transita imediatamente para Erro, interrompe todos os sinais PWM dos motores e sinaliza via buzzer e LEDs.
- **Interface:** física (LED/buzzer).

---

**HU-30 - Isolamento entre sessões de resolução consecutivas**

- **Rastreabilidade:** RF-56 - [#136](https://github.com/fcte-pi1/2026.2_PI1_Grupo1_Diogo/issues/136)
- **Prioridade:** Must have
- **Descrição:** Eu, como **operador**, quero que **cada nova sessão comece limpa**, para **evitar contaminação por dados residuais de tentativas anteriores**.
- **Critérios de aceitação:**
  1. Uma nova sessão só pode iniciar após o retorno ao estado Aguardando.
  2. Ao iniciar, o mapa é reinicializado, o contador de células é zerado e o temporizador de sessão é zerado.
- **Interface:** não se aplica.

---

## 5. Tabela consolidada (formato de exportação - 4.4)

Preencha a coluna "ID (Link Github Projects)" com o número da issue criada para cada HU.

**Épico FW-1 - Inicialização e Auto-teste** (RF-27 a RF-32)

| ID (Link Github Projects) | Título                                               | Prioridade |
| :------------------------ | :--------------------------------------------------- | :--------- |
| HU-01                     | Auto-teste do ESP32 ao boot                          | Must have  |
| HU-02                     | Reendereçamento dos sensores ToF no I2C              | Must have  |
| HU-03                     | Verificação de comunicação com IMU e INA219          | Must have  |
| HU-04                     | Leitura do DIP switch e tipo de labirinto            | Must have  |
| HU-05                     | Inicialização do mapa do labirinto                   | Must have  |
| HU-06                     | Sinalização de prontidão e transição para Aguardando | Must have  |

**Épico FW-2 - Sensoriamento e Percepção** (RF-33 a RF-37)

| ID (Link Github Projects) | Título                                          | Prioridade |
| :------------------------ | :---------------------------------------------- | :--------- |
| HU-07                     | Leitura periódica dos sensores ToF VL53L1X      | Must have  |
| HU-08                     | Classificação de paredes por limiar de detecção | Must have  |
| HU-09                     | Leitura de dados do IMU MPU-6050                | Must have  |
| HU-10                     | Leitura de dados de energia do INA219           | Must have  |
| HU-11                     | Atualização do mapa do labirinto                | Must have  |

**Épico FW-3 - Navegação e Algoritmo Flood Fill** (RF-38 a RF-41)

| ID (Link Github Projects) | Título                                                | Prioridade |
| :------------------------ | :---------------------------------------------------- | :--------- |
| HU-12                     | Cálculo e propagação dos valores de inundação         | Must have  |
| HU-13                     | Seleção da próxima célula de menor valor de inundação | Must have  |
| HU-14                     | Recálculo de rota por nova parede detectada           | Must have  |
| HU-15                     | Encerramento do mapeamento e transição de estado      | Must have  |

**Épico FW-4 - Controle de Movimento** (RF-42 a RF-46)

| ID (Link Github Projects) | Título                                                | Prioridade |
| :------------------------ | :---------------------------------------------------- | :--------- |
| HU-16                     | Geração de sinais PWM via canais LEDC                 | Must have  |
| HU-17                     | Malha de controle PID para equalização de velocidades | Must have  |
| HU-18                     | Correção de trajetória por ToF laterais e IMU         | Must have  |
| HU-19                     | Monitoramento e controle do ângulo de curva           | Must have  |
| HU-20                     | Autorização de avanço após conclusão de curva         | Must have  |

**Épico FW-5 - Odometria** (RF-47 a RF-50)

| ID (Link Github Projects) | Título                                         | Prioridade |
| :------------------------ | :--------------------------------------------- | :--------- |
| HU-21                     | Captura de pulsos dos encoders por interrupção | Must have  |
| HU-22                     | Conversão de pulsos em distância percorrida    | Must have  |
| HU-23                     | Contagem de células percorridas                | Must have  |
| HU-24                     | Cálculo da velocidade média da sessão          | Must have  |

**Épico FW-6 - Telemetria e Comunicação** (RF-51 a RF-53)

| ID (Link Github Projects) | Título                                              | Prioridade |
| :------------------------ | :-------------------------------------------------- | :--------- |
| HU-25                     | Configuração do Wi-Fi em modo estação (STA)         | Must have  |
| HU-26                     | Transmissão contínua da carga útil de telemetria    | Must have  |
| HU-27                     | Garantia de transmissão unidirecional de telemetria | Must have  |

**Épico FW-7 - Máquina de Estados e Robustez** (RF-54 a RF-56)

| ID (Link Github Projects) | Título                                             | Prioridade |
| :------------------------ | :------------------------------------------------- | :--------- |
| HU-28                     | Implementação da máquina de estados de navegação   | Must have  |
| HU-29                     | Detecção de falhas e transição para o estado Erro  | Must have  |
| HU-30                     | Isolamento entre sessões de resolução consecutivas | Must have  |
