# Requisitos — Firmware do Robô Seguidor de Labirinto

**Versão:** 1.0
**Escopo:** Documento único contendo todos os Requisitos Funcionais (RFs) e Requisitos Não Funcionais (RNFs) do firmware embarcado no ESP32, derivados do Modelo de Metas KAOS v1.0. Todos os termos seguem o Glossário do Firmware v1.0. Referências a hardware, energia e estrutura mecânica aparecem apenas como contexto.

---

## Inicialização

### RF-001 — Auto-teste do ESP32 ao Boot

- **Descrição:** O firmware deve verificar o funcionamento básico do microcontrolador ESP32 e a configuração correta dos pinos GPIO no momento do boot, antes de qualquer operação com periféricos externos.
- **`<` Backward:** G-F001.1.
- **`>` Forward:** Módulo de Firmware: Inicialização; UC-F001.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O auto-teste deve ser executado como primeira ação do firmware após a energização do ESP32, antes do Reendereçamento de Sensores e de qualquer leitura via Barramento I²C.
  - Qualquer falha detectada no auto-teste deve impedir o prosseguimento da Inicialização e transitar o firmware para o Estado de Navegação `Erro`, com sinalização via Buzzer de Depuração e LEDs.

---

### RF-002 — Reendereçamento de Sensores ToF no Barramento I²C

- **Descrição:** O firmware deve atribuir endereços I²C únicos e distintos a cada um dos sete sensores ToF VL53L1X durante a Inicialização, desativando todos os sensores via pinos XSHUT, ativando-os individualmente e gravando um novo endereço em cada um, com confirmação de comunicação no Barramento I²C após cada atribuição.
- **`<` Backward:** G-F001.2.
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Sensoriamento; UC-F001.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - Ao final do procedimento, os sete sensores ToF devem responder em endereços I²C distintos e únicos no Barramento I²C, sem conflito de endereçamento.
  - O procedimento deve ser executado após RF-001 e antes da verificação de IMU e INA219 (RF-003).
  - A falha em qualquer etapa — incluindo sensor sem resposta no endereço gravado ou ausência de dispositivo no barramento — deve transitar imediatamente o firmware para o Estado de Navegação `Erro` e sinalizar via Buzzer de Depuração e LEDs.

---

### RF-003 — Verificação de Comunicação com IMU e INA219

- **Descrição:** O firmware deve confirmar que o IMU MPU-6050 e o sensor INA219 respondem corretamente no Barramento I²C após a conclusão do Reendereçamento de Sensores (RF-002), antes de qualquer leitura de dados sensoriais.
- **`<` Backward:** G-F001.3.
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Sensoriamento; UC-F001.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A verificação deve confirmar resposta de comunicação válida para o MPU-6050 e para o INA219 individualmente no Barramento I²C.
  - A ausência de resposta de qualquer um dos dois dispositivos deve transitar o firmware para o Estado de Navegação `Erro` e sinalizar via Buzzer de Depuração e LEDs.

---

### RF-004 — Leitura do DIP Switch e Determinação do Tipo de Labirinto

- **Descrição:** O firmware deve ler o estado das chaves do DIP Switch via GPIO do ESP32 durante a Inicialização para determinar o Tipo de Labirinto selecionado pelo operador, definindo as dimensões da grade do Mapa do Labirinto e a posição da Célula Objetivo para a Sessão de Resolução subsequente.
- **`<` Backward:** G-F001.4.
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Interface Local; UC-F001, UC-F002.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O DIP Switch deve ser lido exatamente uma vez, durante a Inicialização; alterações realizadas após o boot devem ser ignoradas pelo firmware durante toda a Sessão de Resolução em curso.
  - O Tipo de Labirinto determinado pela leitura deve definir corretamente as dimensões da grade e a posição da Célula Objetivo utilizadas em RF-005.
  - O Modo de Operação derivado da leitura não deve ser alterável enquanto o firmware estiver em qualquer Estado de Navegação diferente de `Aguardando`.

---

### RF-005 — Inicialização do Mapa do Labirinto

- **Descrição:** O firmware deve alocar na memória do ESP32 a estrutura matricial do Mapa do Labirinto com dimensões derivadas do Tipo de Labirinto lido em RF-004, inicializando todas as Paredes internas com estado `desconhecida` e o perímetro externo com estado `presente`, e propagar os Valores de Inundação iniciais a partir da Célula Objetivo.
- **`<` Backward:** G-F001.5.
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Mapeamento; Módulo de Firmware: Navegação; UC-F001.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - Cada Célula da estrutura deve conter quatro atributos de Parede (Norte, Sul, Leste, Oeste — cada um podendo ser `presente`, `ausente` ou `desconhecida`) e um Valor de Inundação inteiro não-negativo.
  - Todas as Paredes internas devem ser inicializadas com estado `desconhecida` e o perímetro externo com estado `presente`.
  - Os Valores de Inundação iniciais devem ser calculados tratando Paredes internas `desconhecidas` como `ausentes`, propagando o Valor 0 atribuído à Célula Objetivo e incrementando em 1 a cada Célula adjacente acessível.
  - A estrutura completa deve estar disponível em memória antes da sinalização de prontidão de RF-006.

---

### RF-006 — Sinalização de Prontidão e Transição para Estado Aguardando

- **Descrição:** Após a conclusão bem-sucedida de todos os passos anteriores da Inicialização, o firmware deve acionar o Buzzer de Depuração e os LEDs de Interface Local para informar o operador que o robô está pronto para operar, e em seguida transitar para o Estado de Navegação `Aguardando`.
- **`<` Backward:** G-F001.6.
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Interface Local; UC-F001.
- **Tipo:** Funcional.
- **Subtipo:** Inicialização.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A sinalização de prontidão deve ocorrer somente após conclusão bem-sucedida de RF-001, RF-002, RF-003, RF-004 e RF-005, nessa ordem.
  - Após a sinalização, o firmware deve transitar para o Estado de Navegação `Aguardando` e permanecer parado aguardando o sinal de início da Sessão de Resolução.
  - Qualquer falha em etapa anterior deve impedir a sinalização de prontidão e transitar o firmware para o Estado `Erro`.

---

## Sensoriamento

### RF-007 — Leitura Periódica dos Sensores ToF VL53L1X

- **Descrição:** O firmware deve executar leituras temporizadas e sequenciais dos sete sensores ToF VL53L1X via Barramento I²C a cada ciclo de sensoriamento, cobrindo as posições frontal, duas laterais, duas diagonais e dois adicionais, obtendo medidas de distância em milímetros a partir de cada direção ao redor da Célula atual.
- **`<` Backward:** G-F002.1.
- **`>` Forward:** Módulo de Firmware: Sensoriamento; UC-F003.
- **Tipo:** Funcional.
- **Subtipo:** Sensoriamento.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O firmware deve realizar leituras de todos os sete sensores a cada ciclo de sensoriamento durante qualquer Estado de Navegação diferente de `Inicializando` e `Aguardando`.
  - A leitura deve ser sequencial, respeitando os endereços I²C distintos atribuídos a cada sensor em RF-002.
  - Falha de comunicação com qualquer sensor durante a operação deve ser detectada e reportada ao módulo de Estados de Navegação (RF-029).

---

### RF-008 — Classificação de Paredes por Limiar de Detecção

- **Descrição:** O firmware deve comparar cada leitura de distância obtida em RF-007 com o Limiar de Detecção de Parede configurado para aquela posição específica de sensor, classificando cada face da Célula atual como `presente` (leitura abaixo do Limiar) ou `ausente` (leitura acima do Limiar).
- **`<` Backward:** G-F002.2.
- **`>` Forward:** Módulo de Firmware: Sensoriamento; Módulo de Firmware: Mapeamento; UC-F003.
- **Tipo:** Funcional.
- **Subtipo:** Sensoriamento.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O Limiar de Detecção de Parede deve ser configurável individualmente por posição de sensor (frontal, laterais, diagonais e adicionais), sem necessidade de recompilação do firmware.
  - Leituras com distância abaixo do Limiar devem classificar a face como `presente`; leituras acima do Limiar, como `ausente`.
  - Toda nova classificação deve disparar imediatamente a atualização do estado da Parede correspondente no Mapa do Labirinto (RF-011).

---

### RF-009 — Leitura de Dados do IMU MPU-6050

- **Descrição:** O firmware deve coletar leituras do giroscópio de três eixos e do acelerômetro de três eixos do IMU MPU-6050 via Barramento I²C a cada ciclo de sensoriamento, fornecendo os dados de giroscópio ao controle de Ângulo de Curva (RF-019) e os dados de acelerômetro à Correção de Trajetória (RF-018).
- **`<` Backward:** G-F002.3.
- **`>` Forward:** Módulo de Firmware: Sensoriamento; Módulo de Firmware: Controle de Motores; UC-F004.
- **Tipo:** Funcional.
- **Subtipo:** Sensoriamento.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - Os dados do giroscópio devem ser disponibilizados a RF-019 para medição do Ângulo de Curva durante manobras.
  - Os dados do acelerômetro devem ser disponibilizados a RF-018 como sinal auxiliar na Correção de Trajetória durante deslocamentos em linha reta.
  - Falha de comunicação com o IMU MPU-6050 durante a Sessão de Resolução deve ser reportada ao módulo de Estados de Navegação (RF-029).

---

### RF-010 — Leitura de Dados de Energia do INA219

- **Descrição:** O firmware deve coletar periodicamente as medições de tensão no barramento da bateria LiPo, corrente drenada pelo sistema e potência instantânea calculada pelo INA219 via Barramento I²C, incluindo os três valores na carga útil de Telemetria.
- **`<` Backward:** G-F002.4.
- **`>` Forward:** Módulo de Firmware: Sensoriamento; Módulo de Firmware: Telemetria; UC-F005.
- **Tipo:** Funcional.
- **Subtipo:** Sensoriamento.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O firmware deve ler tensão (V), corrente (A) e potência (W) do INA219 a cada ciclo de Telemetria.
  - Os três valores devem ser incluídos sem transformação na carga útil de Telemetria de RF-026, para exibição direta pelo sistema web.

---

## Mapeamento e Navegação

### RF-011 — Atualização do Mapa do Labirinto

- **Descrição:** O firmware deve registrar no Mapa do Labirinto o estado `presente` ou `ausente` de cada Parede classificada por RF-008, garantindo consistência bidirecional: uma Parede compartilhada entre as Células A e B deve ser registrada simultaneamente como atributo da face correspondente em ambas as Células.
- **`<` Backward:** G-F003.1.
- **`>` Forward:** Módulo de Firmware: Mapeamento; UC-F006, UC-F008.
- **Tipo:** Funcional.
- **Subtipo:** Mapeamento.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A atualização deve ocorrer imediatamente após cada nova classificação de Parede por RF-008.
  - Toda Parede recém-detectada como `presente` deve ser registrada como atributo da face correspondente na Célula atual e, simetricamente, como atributo da face oposta na Célula vizinha.
  - Qualquer atualização que altere o estado de uma Parede de `desconhecida` ou `ausente` para `presente` deve disparar o recálculo de Valores de Inundação de RF-012 para todas as Células afetadas.

---

### RF-012 — Cálculo e Propagação de Valores de Inundação

- **Descrição:** O firmware deve propagar, a partir da Célula Objetivo (Valor de Inundação 0), os Valores de Inundação de todas as Células do Mapa do Labirinto, incrementando em 1 a cada Célula adjacente sem Parede `presente` interposta. O cálculo deve ser executado na Inicialização e repetido após cada atualização disparada por RF-011 que resulte em novos valores para Células afetadas.
- **`<` Backward:** G-F003.2.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Mapeamento; UC-F006, UC-F008.
- **Tipo:** Funcional.
- **Subtipo:** Algoritmo Flood Fill.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A Célula Objetivo deve receber Valor de Inundação 0; cada Célula vizinha acessível (sem Parede `presente` interposta) deve receber o Valor da Célula de origem acrescido de 1.
  - A propagação deve percorrer todas as Células afetadas pela mudança, não apenas as imediatamente adjacentes à nova Parede.
  - O recálculo completo deve ser concluído antes da execução da próxima seleção de Célula por RF-013.

---

### RF-013 — Seleção da Próxima Célula de Menor Valor de Inundação

- **Descrição:** O firmware deve, a cada passo de navegação, selecionar como destino do próximo movimento a Célula vizinha acessível (sem Parede `presente` interposta) com o menor Valor de Inundação, aplicando critério de desempate determinístico pré-definido quando dois ou mais vizinhos apresentarem o mesmo valor.
- **`<` Backward:** G-F003.3.
- **`>` Forward:** Módulo de Firmware: Navegação; UC-F007, UC-F008.
- **Tipo:** Funcional.
- **Subtipo:** Algoritmo Flood Fill.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A seleção deve considerar apenas Células vizinhas sem Parede `presente` na face correspondente da Célula atual.
  - O critério de desempate deve ser determinístico, com ordem de preferência de direção relativa ao robô: frente > direita > esquerda > ré, aplicada sempre que o empate ocorrer (ver RNF-002).
  - A Célula selecionada deve determinar a manobra a ser executada pelos Motores DC N20 via RF-016.

---

### RF-014 — Recálculo de Rota por Nova Parede Detectada

- **Descrição:** O firmware deve, ao detectar uma nova Parede `presente` que invalide o caminho corrente, interromper o movimento, registrar a nova Parede no Mapa do Labirinto via RF-011, acionar o recálculo de todos os Valores de Inundação afetados via RF-012 e determinar nova direção via RF-013 antes de retomar o deslocamento.
- **`<` Backward:** G-F003.4.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Mapeamento; UC-F007, UC-F008.
- **Tipo:** Funcional.
- **Subtipo:** Algoritmo Flood Fill.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O Recálculo de Rota deve ser iniciado sempre que uma Parede recém-detectada tornar o caminho corrente inacessível ou subótimo.
  - O firmware deve interromper o movimento antes de executar o recálculo dos Valores de Inundação.
  - Após o recálculo, o robô deve retomar o deslocamento em direção à Célula de menor Valor de Inundação determinada por RF-013.

---

### RF-015 — Encerramento da Fase de Mapeamento e Transição de Estado

- **Descrição:** O firmware deve detectar quando o robô ocupa a Célula Objetivo, comparando a posição corrente (derivada do Contador de Células de RF-023) com a posição definida em RF-004, transitando o Estado de Navegação para `Concluído`. Se o mapa estiver completo antes da chegada, o firmware deve transitar de `Mapeando` para `Resolvendo` e executar o percurso ótimo sem novos Recálculos de Rota.
- **`<` Backward:** G-F003.5.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Estados de Navegação; UC-F007, UC-F015.
- **Tipo:** Funcional.
- **Subtipo:** Navegação.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A confirmação de chegada à Célula Objetivo deve ser baseada na posição discreta derivada do Contador de Células (RF-023), com confirmação adicional pelos sensores ToF.
  - Ao atingir a Célula Objetivo, o firmware deve transitar para o Estado `Concluído` e sinalizar via Buzzer de Depuração e LEDs.
  - Quando todas as Paredes do caminho ótimo já forem conhecidas antes da chegada à Célula Objetivo, o Estado de Navegação deve transitar de `Mapeando` para `Resolvendo`, cessando os Recálculos de Rota.

---

## Controle de Motores

### RF-016 — Geração de Sinais PWM via Canais LEDC do ESP32

- **Descrição:** O firmware deve configurar os canais LEDC do ESP32 com frequência de PWM fixa na Inicialização e gerar, a cada ciclo de controle, sinais PWM de duty cycle variável para cada canal do Driver de Motor DRV8833, controlando de forma independente direção e velocidade de cada Motor DC N20.
- **`<` Backward:** G-F004.1.
- **`>` Forward:** Módulo de Firmware: Controle de Motores; UC-F009, UC-F010.
- **Tipo:** Funcional.
- **Subtipo:** Controle de Motores.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A frequência do PWM deve ser configurada na Inicialização e mantida constante durante toda a operação.
  - O firmware deve controlar direção e velocidade de cada Motor DC N20 de forma independente por meio dos pinos IN1/IN2 de cada canal do DRV8833.
  - O duty cycle de cada canal deve ser ajustável dinamicamente a cada ciclo de controle pelo Controle PID (RF-017) e pela Correção de Trajetória (RF-018).
  - Ao transitar para o Estado de Navegação `Erro`, todos os sinais PWM devem ser desligados imediatamente, garantindo parada completa do robô.

---

### RF-017 — Malha de Controle PID para Equalização de Velocidades

- **Descrição:** O firmware deve executar a malha Controle PID durante a travessia em linha reta de uma Célula, utilizando como sinal de erro a diferença de contagem de pulsos entre os Encoders dos dois Motores DC N20, ajustando dinamicamente o duty cycle de cada canal PWM para equalizar as velocidades dos dois motores e compensar assimetrias mecânicas ou de atrito.
- **`<` Backward:** G-F004.2.
- **`>` Forward:** Módulo de Firmware: Controle de Motores; Módulo de Firmware: Odometria; UC-F009.
- **Tipo:** Funcional.
- **Subtipo:** Controle de Motores.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O sinal de erro do Controle PID deve ser derivado exclusivamente da diferença de contagem de pulsos entre os dois Encoders (RF-021) a cada ciclo de controle.
  - Os ganhos P, I e D devem ser parametrizáveis sem necessidade de recompilação do firmware para calibração em bancada.
  - A malha deve atuar somente durante deslocamentos em linha reta, sendo desativada durante manobras de curva controladas por RF-019.

---

### RF-018 — Correção de Trajetória por Sensores ToF Laterais e IMU

- **Descrição:** O firmware deve, durante a travessia em linha reta, comparar as leituras dos sensores ToF laterais para medir o desvio lateral do robô em relação ao eixo da Célula e, opcionalmente, utilizar dados do acelerômetro do IMU como sinal auxiliar, ajustando o diferencial de velocidade entre os motores para manter o alinhamento direcional dentro da Célula.
- **`<` Backward:** G-F004.3.
- **`>` Forward:** Módulo de Firmware: Controle de Motores; Módulo de Firmware: Sensoriamento; UC-F009.
- **Tipo:** Funcional.
- **Subtipo:** Controle de Motores.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A Correção de Trajetória deve atuar de forma complementar ao Controle PID de velocidade de RF-017, sem substituí-lo.
  - O sinal de correção deve ser calculado a partir da diferença entre as leituras dos dois sensores ToF laterais (RF-007).
  - A correção deve ser aplicada como ajuste no diferencial de velocidade entre os motores, via atualização do duty cycle dos respectivos canais PWM (RF-016).

---

### RF-019 — Monitoramento e Controle do Ângulo de Curva

- **Descrição:** O firmware deve, durante manobras de 90° ou 180°, ler continuamente o giroscópio do IMU MPU-6050 para integrar o Ângulo de Curva acumulado desde o início da manobra e controlar os Motores DC N20 para que a rotação executada convirja para o valor-alvo dentro da tolerância calibrada.
- **`<` Backward:** G-F004.4.
- **`>` Forward:** Módulo de Firmware: Controle de Motores; Módulo de Firmware: Sensoriamento; UC-F010.
- **Tipo:** Funcional.
- **Subtipo:** Controle de Motores.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O valor-alvo deve ser 90° para curvas de 90° e 180° para inversões de marcha, ambos com tolerância em graus definida por parâmetro de calibração em bancada.
  - A referência angular acumulada deve ser resetada após a confirmação de cada manobra concluída, limitando a propagação de erro de deriva entre curvas consecutivas (ver RNF-004).
  - A leitura do giroscópio deve ser contínua durante toda a manobra, não pontual ao final.

---

### RF-020 — Autorização de Avanço após Conclusão de Curva

- **Descrição:** O firmware deve verificar, ao final de cada manobra de curva, se o Ângulo de Curva acumulado medido pelo giroscópio do IMU atingiu o valor-alvo dentro da tolerância calibrada, autorizando o avanço para a próxima Célula somente após essa condição ser satisfeita.
- **`<` Backward:** G-F004.5.
- **`>` Forward:** Módulo de Firmware: Controle de Motores; Módulo de Firmware: Navegação; UC-F010.
- **Tipo:** Funcional.
- **Subtipo:** Controle de Motores.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O avanço para a próxima Célula deve ser bloqueado enquanto o Ângulo de Curva acumulado não atingir o valor-alvo dentro da tolerância definida em RF-019.
  - Após a autorização, o controle deve retornar à seleção da próxima Célula (RF-013) e ao início da travessia em linha reta com Controle PID (RF-017) e Correção de Trajetória (RF-018).

---

## Odometria

### RF-021 — Captura de Pulsos dos Encoders por Interrupção de Hardware

- **Descrição:** O firmware deve registrar cada pulso gerado pelos Encoders acoplados aos eixos dos Motores DC N20 por meio de rotinas de interrupção de hardware nos pinos GPIO do ESP32, garantindo que nenhum pulso seja perdido em condições de alta velocidade ou de grande carga de processamento.
- **`<` Backward:** G-F005.1.
- **`>` Forward:** Módulo de Firmware: Odometria; UC-F011.
- **Tipo:** Funcional.
- **Subtipo:** Odometria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A captura de pulsos deve ser implementada exclusivamente via rotinas de interrupção de hardware (ISR), nunca por polling.
  - Cada Motor DC N20 deve ter seu contador de pulsos independente, incrementado a cada borda de pulso do respectivo Encoder.
  - Os contadores de pulsos devem ser acessíveis ao módulo de Odometria (RF-022, RF-023) e ao módulo de Controle de Motores para o sinal de erro do Controle PID (RF-017).

---

### RF-022 — Conversão de Pulsos em Distância Percorrida

- **Descrição:** O firmware deve aplicar a relação (pulsos por revolução × diâmetro da roda) para converter a contagem acumulada de pulsos dos Encoders em distância linear percorrida em milímetros, atualizando o valor a cada ciclo de Odometria.
- **`<` Backward:** G-F005.2.
- **`>` Forward:** Módulo de Firmware: Odometria; Módulo de Firmware: Telemetria; UC-F011.
- **Tipo:** Funcional.
- **Subtipo:** Odometria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - Os parâmetros de conversão (pulsos por revolução e diâmetro da roda) devem ser configuráveis por parâmetro de compilação.
  - A distância calculada deve ser utilizada tanto para detectar a transição completa de Célula em RF-023 quanto para o cálculo da Velocidade Média em RF-024.
  - A estimativa fornece posição relativa e acumula erro intrínseco ao longo da Sessão de Resolução; não há compensação automática de posição absoluta nesta versão (ver RNF-006).

---

### RF-023 — Contagem de Células Percorridas

- **Descrição:** O firmware deve detectar, com base nos pulsos acumulados dos Encoders, o momento em que o robô completou a travessia de uma Célula inteira, incrementar o Contador de Células e incluir o valor atualizado a cada ciclo na carga útil de Telemetria transmitida ao sistema web.
- **`<` Backward:** G-F005.3.
- **`>` Forward:** Módulo de Firmware: Odometria; Módulo de Firmware: Telemetria; UC-F011.
- **Tipo:** Funcional.
- **Subtipo:** Odometria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O Contador de Células deve ser uma variável inteira discreta, incrementada a cada transição completa de Célula, nunca por fração de Célula.
  - O valor deve ser zerado ao início de cada nova Sessão de Resolução (ver RF-030).
  - O valor atualizado deve ser incluído a cada ciclo na carga útil de Telemetria de RF-026.

---

### RF-024 — Cálculo da Velocidade Média da Sessão de Resolução

- **Descrição:** O firmware deve calcular continuamente, ao longo de toda a Sessão de Resolução corrente, a razão entre a distância total percorrida derivada de RF-022 e o tempo decorrido desde o início da Sessão, obtendo a Velocidade Média, e incluir o valor a cada ciclo de Telemetria na carga útil transmitida ao sistema web.
- **`<` Backward:** G-F005.4.
- **`>` Forward:** Módulo de Firmware: Odometria; Módulo de Firmware: Telemetria; UC-F011.
- **Tipo:** Funcional.
- **Subtipo:** Odometria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A Velocidade Média deve ser calculada como a razão entre distância total percorrida e tempo total da Sessão corrente, não como média das velocidades instantâneas dos motores.
  - O valor da Velocidade Média deve ser distinto e independente da velocidade instantânea de cada motor utilizada internamente pelo Controle PID de RF-017.
  - O valor atualizado deve ser incluído na carga útil de Telemetria de RF-026 a cada ciclo de transmissão.

---

## Telemetria

### RF-025 — Configuração do Módulo Wi-Fi em Modo Estação

- **Descrição:** O firmware deve configurar o módulo Wi-Fi integrado ao ESP32 no modo estação (STA) durante a Inicialização, conectando-o à rede definida por parâmetros de compilação antes da transição para o Estado de Navegação `Aguardando`.
- **`<` Backward:** G-F006.1.
- **`>` Forward:** Módulo de Firmware: Telemetria; Módulo de Firmware: Inicialização; UC-F012.
- **Tipo:** Funcional.
- **Subtipo:** Telemetria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A conexão Wi-Fi deve ser estabelecida durante a Inicialização, antes da transição para o Estado `Aguardando`.
  - Falha na conexão Wi-Fi durante a Inicialização não deve transitar o firmware para o Estado `Erro` nem impedir o início da Sessão de Resolução; a condição deve ser informada ao operador via LED ou Buzzer de Depuração como aviso não bloqueante.
  - As credenciais de rede (SSID e senha) devem ser configuráveis exclusivamente por parâmetro de compilação, sem interface de configuração em tempo de execução nesta versão.

---

### RF-026 — Transmissão Contínua da Carga Útil de Telemetria

- **Descrição:** O firmware deve transmitir periodicamente ao sistema web, via Wi-Fi, durante toda a Sessão de Resolução, a carga útil de Telemetria contendo: Estado de Navegação atual, Contador de Células percorridas (RF-023), Velocidade Média (RF-024), posição corrente no Mapa do Labirinto e dados de energia do INA219 — tensão da bateria, corrente drenada e potência instantânea (RF-010).
- **`<` Backward:** G-F006.2.
- **`>` Forward:** Módulo de Firmware: Telemetria; UC-F012.
- **Tipo:** Funcional.
- **Subtipo:** Telemetria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - A carga útil deve incluir obrigatoriamente os sete campos: Estado de Navegação, Contador de Células, Velocidade Média, posição corrente no Mapa do Labirinto, tensão da bateria (V), corrente drenada (A) e potência instantânea (W).
  - A transmissão deve ser periódica e contínua durante os Estados de Navegação `Mapeando`, `Resolvendo` e `Concluído`.
  - Perdas de pacotes individuais são toleradas; o firmware não deve aguardar confirmação de recebimento pelo sistema web antes de retomar a navegação.
  - A transmissão deve ser estritamente unidirecional, conforme RF-027.

---

### RF-027 — Garantia de Transmissão Unidirecional de Telemetria

- **Descrição:** O firmware deve operar o módulo Wi-Fi exclusivamente como emissor de Telemetria, sem processar, interpretar ou responder a mensagens de entrada enviadas pelo sistema web durante a Sessão de Resolução.
- **`<` Backward:** G-F006.3.
- **`>` Forward:** Módulo de Firmware: Telemetria; UC-F012.
- **Tipo:** Funcional.
- **Subtipo:** Telemetria.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - Nenhuma interface de controle remoto deve ser implementada no firmware nesta versão.
  - Nenhum mecanismo de atualização de firmware em campo (OTA) deve ser ativado durante a operação normal.
  - Pacotes recebidos pela interface Wi-Fi durante a Sessão de Resolução devem ser ignorados sem nenhum impacto sobre os módulos de Navegação, Mapeamento ou Controle de Motores.

---

## Estados de Navegação

### RF-028 — Implementação da Máquina de Estados de Navegação

- **Descrição:** O firmware deve implementar os seis Estados de Navegação definidos — `Inicializando`, `Aguardando`, `Mapeando`, `Resolvendo`, `Concluído` e `Erro` — com as transições autorizadas entre eles, incluindo o Estado de Navegação corrente na carga útil de Telemetria a cada ciclo de transmissão.
- **`<` Backward:** G-F007.1.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Inicialização; Módulo de Firmware: Interface Local; Módulo de Firmware: Telemetria; UC-F013, UC-F014, UC-F015.
- **Tipo:** Funcional.
- **Subtipo:** Estados de Navegação.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - As únicas transições autorizadas são: `Inicializando` → `Aguardando` (ao concluir RF-006); `Aguardando` → `Mapeando` (ao receber sinal de início); `Mapeando` → `Resolvendo` (ao completar o mapa); `Mapeando` ou `Resolvendo` → `Concluído` (ao atingir a Célula Objetivo, RF-015); qualquer estado → `Erro` (RF-029); `Concluído` ou `Erro` → `Aguardando` (RF-030).
  - Transições não listadas acima não devem ser executadas pelo firmware.
  - O Estado de Navegação corrente deve compor obrigatoriamente a carga útil de Telemetria (RF-026) a cada ciclo de transmissão.

---

### RF-029 — Detecção de Falhas e Transição para Estado Erro

- **Descrição:** O firmware deve monitorar continuamente a integridade dos sensores e atuadores durante a operação e, ao detectar falha irrecuperável, transitar imediatamente para o Estado de Navegação `Erro`, interrompendo todos os sinais PWM para os Motores DC N20 e sinalizando a condição via Buzzer de Depuração e LEDs de Interface Local.
- **`<` Backward:** G-F007.2.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Interface Local; UC-F014.
- **Tipo:** Funcional.
- **Subtipo:** Estados de Navegação.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - São consideradas falhas irrecuperáveis: sensor ToF sem resposta no Barramento I²C após a Inicialização; Encoder sem geração de pulsos esperados durante movimento comandado; e perda de comunicação com o IMU MPU-6050 ou o INA219 durante a Sessão de Resolução.
  - Ao transitar para `Erro`, o firmware deve interromper imediatamente todos os sinais PWM dos Motores DC N20 via Driver de Motor DRV8833, garantindo parada completa do robô.
  - A sinalização sonora e luminosa de `Erro` deve ser distinta da sinalização de prontidão de RF-006.
  - A transição para `Erro` deve ser imediatamente incluída na carga útil de Telemetria de RF-026.

---

### RF-030 — Isolamento entre Sessões de Resolução Consecutivas

- **Descrição:** O firmware deve garantir que uma nova Sessão de Resolução só possa ser iniciada após o retorno ao Estado de Navegação `Aguardando`, com o Mapa do Labirinto reinicializado, o Contador de Células zerado e o temporizador de Sessão zerado, evitando contaminação de dados residuais de Sessões anteriores.
- **`<` Backward:** G-F007.3.
- **`>` Forward:** Módulo de Firmware: Navegação; Módulo de Firmware: Inicialização; UC-F013.
- **Tipo:** Funcional.
- **Subtipo:** Estados de Navegação.
- **Prioridade:** Must.
- **Critérios de aceitação:**
  - O Mapa do Labirinto deve ser reinicializado com todas as Paredes internas revertidas para `desconhecida` e os Valores de Inundação recalculados a partir do zero antes de cada nova Sessão de Resolução.
  - O Contador de Células (RF-023) e o temporizador de Sessão devem ser zerados na transição de `Aguardando` para `Mapeando`.
  - O firmware não deve aceitar sinal de início de Sessão de Resolução enquanto estiver em qualquer Estado de Navegação diferente de `Aguardando`.

---

## Requisitos Não Funcionais

### RNF-001 — Calibração Obrigatória dos Limiares de Detecção de Parede antes de Operação

- **Descrição:** Os Limiares de Detecção de Parede de cada Sensor ToF devem ser calibrados individualmente em bancada, com paredes e condições de iluminação representativas do ambiente real de competição, antes de cada evento. Não há compensação automática de limiar em firmware nesta versão.
- **`<` Backward:** G-F002.2 (OBS-F002).
- **`>` Forward:** Módulo de Firmware: Sensoriamento; UC-F003; UC-F003.
- **Tipo:** Não Funcional.
- **Subtipo:** Calibração.
- **Prioridade:** Must.

---

### RNF-002 — Critério de Desempate Determinístico no Algoritmo Flood Fill

- **Descrição:** O firmware deve implementar um critério de desempate determinístico fixo e documentado para a seleção da próxima Célula quando dois ou mais vizinhos apresentarem o mesmo Valor de Inundação, garantindo comportamento reproduzível entre Sessões de Resolução sob as mesmas condições de labirinto. A ordem de preferência é: frente > direita > esquerda > ré, em relação à orientação corrente do robô.
- **`<` Backward:** G-F003.3 (OBS-F006).
- **`>` Forward:** Módulo de Firmware: Navegação; UC-F007; UC-F007.
- **Tipo:** Não Funcional.
- **Subtipo:** Determinismo Algorítmico.
- **Prioridade:** Must.

---

### RNF-003 — Isolamento entre Módulo de Telemetria e Módulo de Navegação

- **Descrição:** Falhas, perdas de pacote ou interrupções prolongadas na transmissão Wi-Fi não devem transitar o firmware para o Estado de Navegação `Erro` nem interromper a execução autônoma da navegação. A navegação deve prosseguir independentemente do estado da conexão Wi-Fi; a Telemetria deve retomar automaticamente quando a conexão for restabelecida.
- **`<` Backward:** G-F006.2 (OBS-F005).
- **`>` Forward:** Módulo de Firmware: Telemetria; Módulo de Firmware: Navegação; UC-F012; UC-F012.
- **Tipo:** Não Funcional.
- **Subtipo:** Resiliência.
- **Prioridade:** Must.

---

### RNF-004 — Compensação de Deriva do Giroscópio entre Manobras Consecutivas

- **Descrição:** O firmware deve resetar a referência angular acumulada do giroscópio do IMU MPU-6050 após a confirmação de cada manobra concluída, limitando a propagação do erro de deriva entre curvas consecutivas. Não há compensação de deriva absoluta por fusão sensorial nesta versão.
- **`<` Backward:** G-F004.4 (OBS-F003).
- **`>` Forward:** Módulo de Firmware: Controle de Motores; Módulo de Firmware: Sensoriamento; UC-F004, UC-F010; UC-F004, UC-F010.
- **Tipo:** Não Funcional.
- **Subtipo:** Precisão de Controle.
- **Prioridade:** Must.

---

### RNF-005 — Restrição de Leitura do DIP Switch Exclusivamente ao Boot

- **Descrição:** O DIP Switch deve ser lido exclusivamente durante a Inicialização (RF-004). Alterações realizadas pelo operador após o boot são completamente ignoradas pelo firmware durante toda a Sessão de Resolução em curso. O Tipo de Labirinto e o Modo de Operação só podem ser modificados com o robô desligado e com nova Inicialização subsequente.
- **`<` Backward:** G-F001.4 (OBS-F007).
- **`>` Forward:** Módulo de Firmware: Inicialização; Módulo de Firmware: Interface Local; UC-F002; UC-F002.
- **Tipo:** Não Funcional.
- **Subtipo:** Restrição de Comportamento.
- **Prioridade:** Must.

---

### RNF-006 — Odometria Fornece Apenas Posição Relativa sem Garantia de Posição Absoluta

- **Descrição:** A Odometria do firmware fornece estimativa de posição relativa (distância percorrida e Contador de Células) sem garantia de posição absoluta — o erro se acumula ao longo da Sessão de Resolução por escorregamento de rodas ou variações de atrito. A Correção de Trajetória por sensores ToF laterais (RF-018) é o único mecanismo de compensação de desvio direcional disponível nesta versão; não há fusão de posição absoluta implementada.
- **`<` Backward:** G-F005.2 (OBS-F004).
- **`>` Forward:** Módulo de Firmware: Odometria; UC-F011; UC-F011.
- **Tipo:** Não Funcional.
- **Subtipo:** Restrição de Precisão.
- **Prioridade:** Must.

---

## Síntese de Requisitos

| ID          | Título                                                      | Tipo          | Subtipo                    | Prioridade | Meta KAOS           |
| ----------- | ----------------------------------------------------------- | ------------- | -------------------------- | ---------- | ------------------- |
| **RF-001**  | Auto-teste do ESP32 ao Boot                                 | Funcional     | Inicialização              | Must       | G-F001.1            |
| **RF-002**  | Reendereçamento de Sensores ToF no Barramento I²C           | Funcional     | Inicialização              | Must       | G-F001.2            |
| **RF-003**  | Verificação de Comunicação com IMU e INA219                 | Funcional     | Inicialização              | Must       | G-F001.3            |
| **RF-004**  | Leitura do DIP Switch e Determinação do Tipo de Labirinto   | Funcional     | Inicialização              | Must       | G-F001.4            |
| **RF-005**  | Inicialização do Mapa do Labirinto                          | Funcional     | Inicialização              | Must       | G-F001.5            |
| **RF-006**  | Sinalização de Prontidão e Transição para Estado Aguardando | Funcional     | Inicialização              | Must       | G-F001.6            |
| **RF-007**  | Leitura Periódica dos Sensores ToF VL53L1X                  | Funcional     | Sensoriamento              | Must       | G-F002.1            |
| **RF-008**  | Classificação de Paredes por Limiar de Detecção             | Funcional     | Sensoriamento              | Must       | G-F002.2            |
| **RF-009**  | Leitura de Dados do IMU MPU-6050                            | Funcional     | Sensoriamento              | Must       | G-F002.3            |
| **RF-010**  | Leitura de Dados de Energia do INA219                       | Funcional     | Sensoriamento              | Must       | G-F002.4            |
| **RF-011**  | Atualização do Mapa do Labirinto                            | Funcional     | Mapeamento                 | Must       | G-F003.1            |
| **RF-012**  | Cálculo e Propagação de Valores de Inundação                | Funcional     | Algoritmo Flood Fill       | Must       | G-F003.2            |
| **RF-013**  | Seleção da Próxima Célula de Menor Valor de Inundação       | Funcional     | Algoritmo Flood Fill       | Must       | G-F003.3            |
| **RF-014**  | Recálculo de Rota por Nova Parede Detectada                 | Funcional     | Algoritmo Flood Fill       | Must       | G-F003.4            |
| **RF-015**  | Encerramento da Fase de Mapeamento e Transição de Estado    | Funcional     | Navegação                  | Must       | G-F003.5            |
| **RF-016**  | Geração de Sinais PWM via Canais LEDC do ESP32              | Funcional     | Controle de Motores        | Must       | G-F004.1            |
| **RF-017**  | Malha de Controle PID para Equalização de Velocidades       | Funcional     | Controle de Motores        | Must       | G-F004.2            |
| **RF-018**  | Correção de Trajetória por Sensores ToF Laterais e IMU      | Funcional     | Controle de Motores        | Must       | G-F004.3            |
| **RF-019**  | Monitoramento e Controle do Ângulo de Curva                 | Funcional     | Controle de Motores        | Must       | G-F004.4            |
| **RF-020**  | Autorização de Avanço após Conclusão de Curva               | Funcional     | Controle de Motores        | Must       | G-F004.5            |
| **RF-021**  | Captura de Pulsos dos Encoders por Interrupção de Hardware  | Funcional     | Odometria                  | Must       | G-F005.1            |
| **RF-022**  | Conversão de Pulsos em Distância Percorrida                 | Funcional     | Odometria                  | Must       | G-F005.2            |
| **RF-023**  | Contagem de Células Percorridas                             | Funcional     | Odometria                  | Must       | G-F005.3            |
| **RF-024**  | Cálculo da Velocidade Média da Sessão de Resolução          | Funcional     | Odometria                  | Must       | G-F005.4            |
| **RF-025**  | Configuração do Módulo Wi-Fi em Modo Estação                | Funcional     | Telemetria                 | Must       | G-F006.1            |
| **RF-026**  | Transmissão Contínua da Carga Útil de Telemetria            | Funcional     | Telemetria                 | Must       | G-F006.2            |
| **RF-027**  | Garantia de Transmissão Unidirecional de Telemetria         | Funcional     | Telemetria                 | Must       | G-F006.3            |
| **RF-028**  | Implementação da Máquina de Estados de Navegação            | Funcional     | Estados de Navegação       | Must       | G-F007.1            |
| **RF-029**  | Detecção de Falhas e Transição para Estado Erro             | Funcional     | Estados de Navegação       | Must       | G-F007.2            |
| **RF-030**  | Isolamento entre Sessões de Resolução Consecutivas          | Funcional     | Estados de Navegação       | Must       | G-F007.3            |
| **RNF-001** | Calibração Obrigatória dos Limiares de Detecção de Parede   | Não Funcional | Calibração                 | Must       | G-F002.2 (OBS-F002) |
| **RNF-002** | Critério de Desempate Determinístico no Flood Fill          | Não Funcional | Determinismo Algorítmico   | Must       | G-F003.3 (OBS-F006) |
| **RNF-003** | Isolamento entre Módulo de Telemetria e Módulo de Navegação | Não Funcional | Resiliência                | Must       | G-F006.2 (OBS-F005) |
| **RNF-004** | Compensação de Deriva do Giroscópio entre Manobras          | Não Funcional | Precisão de Controle       | Must       | G-F004.4 (OBS-F003) |
| **RNF-005** | Restrição de Leitura do DIP Switch Exclusivamente ao Boot   | Não Funcional | Restrição de Comportamento | Must       | G-F001.4 (OBS-F007) |
| **RNF-006** | Odometria Fornece Apenas Posição Relativa                   | Não Funcional | Restrição de Precisão      | Must       | G-F005.2 (OBS-F004) |
