# Casos de Uso — Firmware do Robô Seguidor de Labirinto

**Versão:** 1.0
**Escopo:** Documento único contendo todos os casos de uso do firmware embarcado no ESP32, derivados dos Requisitos Funcionais e Não Funcionais v1.0. Todos os termos seguem o Glossário do Firmware v1.0. Os atores reconhecidos são: **Operador** (interage fisicamente com o robô), **Firmware** (o próprio sistema em execução autônoma) e **Sistema Web** (recebe a Telemetria).

---

## UC-F001

- **Título:** Inicializar o Sistema
- **`<` Backward:** RF-001, RF-002, RF-003, RF-004, RF-005, RF-006
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário), Operador (secundário — energiza o robô)
- **Relacionamentos:** Precede todos os demais casos de uso; é pré-condição de UC-F002, UC-F013
- **Fluxo principal:**
  1. O operador energiza o robô.
  2. O firmware executa o auto-teste do ESP32 e verifica a configuração dos pinos GPIO.
  3. O firmware executa o Reendereçamento de Sensores, desativando todos os sensores ToF VL53L1X via pinos XSHUT, ativando-os individualmente e gravando um endereço I²C único em cada um dos sete sensores, confirmando comunicação no Barramento I²C após cada atribuição.
  4. O firmware verifica a comunicação com o IMU MPU-6050 e com o INA219 no Barramento I²C.
  5. O firmware lê o estado do DIP Switch e determina o Tipo de Labirinto, as dimensões da grade e a posição da Célula Objetivo.
  6. O firmware aloca o Mapa do Labirinto na memória, inicializando todas as Paredes internas como `desconhecida` e o perímetro externo como `presente`, e propaga os Valores de Inundação iniciais a partir da Célula Objetivo (Valor 0).
  7. O firmware sinaliza prontidão ao operador via Buzzer de Depuração e LEDs e transita para o Estado de Navegação `Aguardando`.
- **Fluxo(s) alternativo(s):**
  - 2a. Auto-teste do ESP32 detecta falha em GPIO ou no microcontrolador → Firmware transita imediatamente para o Estado `Erro` e sinaliza via Buzzer de Depuração e LEDs; a Inicialização não prossegue.
  - 3a. Reendereçamento falha em qualquer sensor — sensor não responde no endereço gravado ou não é detectado no Barramento I²C → Firmware transita para o Estado `Erro` com sinalização sonora e luminosa.
  - 4a. IMU MPU-6050 ou INA219 não responde ao Barramento I²C → Firmware transita para o Estado `Erro` com sinalização sonora e luminosa.
- **Critério de aceitação:**
  - Ao término bem-sucedido, o firmware deve estar no Estado de Navegação `Aguardando`, com os sete sensores ToF endereçados individualmente e o Mapa do Labirinto inteiramente inicializado em memória.
  - Qualquer falha em etapa anterior à sinalização de prontidão deve impedir a transição para `Aguardando` e resultar obrigatoriamente em transição para o Estado `Erro`.

---

## UC-F002

- **Título:** Selecionar Tipo de Labirinto via DIP Switch
- **`<` Backward:** RF-004, RNF-005
- **`>` Forward:** N/A.
- **Ator(es):** Operador (primário)
- **Relacionamentos:** Precede UC-F001 (a seleção deve ocorrer antes da energização do robô)
- **Fluxo principal:**
  1. Com o robô desligado, o operador configura as chaves do DIP Switch para o Tipo de Labirinto desejado.
  2. O operador energiza o robô.
  3. O firmware lê o estado do DIP Switch durante a Inicialização (UC-F001) e determina as dimensões da grade e a posição da Célula Objetivo para a Sessão de Resolução subsequente.
- **Fluxo(s) alternativo(s):**
  - 1a. O operador altera o DIP Switch com o robô já ligado → A alteração é completamente ignorada pelo firmware; o Tipo de Labirinto permanece o definido na Inicialização, independentemente do Estado de Navegação corrente.
- **Critério de aceitação:**
  - O DIP Switch deve ser lido exclusivamente durante a Inicialização; alterações posteriores ao boot são ignoradas pelo firmware durante toda a Sessão de Resolução em curso.
  - A mudança de Tipo de Labirinto só pode ser efetivada após desligar o robô e realizar nova Inicialização completa.

---

## UC-F003

- **Título:** Detectar Paredes por Sensoriamento Periódico
- **`<` Backward:** RF-007, RF-008, RNF-001
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Estende UC-F006 (nova classificação de Parede dispara atualização do Mapa do Labirinto); estende UC-F008 (nova Parede `presente` pode disparar Recálculo de Rota); é utilizado por UC-F009 e UC-F010 (leituras laterais alimentam Correção de Trajetória e confirmação de curva)
- **Fluxo principal:**
  1. A cada ciclo de sensoriamento, o firmware solicita leitura de distância a cada um dos sete sensores ToF VL53L1X via Barramento I²C, cobrindo as posições frontal, duas laterais, duas diagonais e dois adicionais.
  2. O firmware recebe as medidas de distância em milímetros de cada sensor.
  3. O firmware compara cada leitura com o Limiar de Detecção de Parede configurado para aquela posição específica de sensor.
  4. Leituras abaixo do Limiar são classificadas como `presente`; leituras acima do Limiar, como `ausente`.
  5. As novas classificações são disponibilizadas ao módulo de Mapeamento para atualização do Mapa do Labirinto via UC-F006.
- **Fluxo(s) alternativo(s):**
  - 1a. Sensor ToF não responde no Barramento I²C durante a Sessão de Resolução → Firmware reporta a falha ao módulo de Estados de Navegação, que transita para o Estado `Erro` via UC-F014.
- **Critério de aceitação:**
  - As leituras devem cobrir obrigatoriamente as sete posições de sensor a cada ciclo de sensoriamento.
  - O Limiar de Detecção de Parede deve ser configurável individualmente por posição de sensor, sem necessidade de recompilação do firmware.
  - A calibração correta dos Limiares é pré-condição operacional (RNF-001); um Limiar mal calibrado pode causar falsas detecções ou omissões de Parede, comprometendo diretamente a integridade do Mapa do Labirinto.

---

## UC-F004

- **Título:** Coletar Dados Inerciais do IMU MPU-6050
- **`<` Backward:** RF-009, RNF-004
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Utilizado por UC-F009 (dados do acelerômetro alimentam Correção de Trajetória) e UC-F010 (dados do giroscópio alimentam controle de Ângulo de Curva)
- **Fluxo principal:**
  1. A cada ciclo de sensoriamento, o firmware solicita as leituras do giroscópio de três eixos e do acelerômetro de três eixos do IMU MPU-6050 via Barramento I²C.
  2. O firmware disponibiliza os dados do giroscópio ao módulo de Controle de Motores para medição do Ângulo de Curva acumulado durante manobras (UC-F010).
  3. O firmware disponibiliza os dados do acelerômetro ao módulo de Controle de Motores como sinal auxiliar na Correção de Trajetória durante deslocamentos em linha reta (UC-F009).
- **Fluxo(s) alternativo(s):**
  - 1a. IMU MPU-6050 não responde ao Barramento I²C durante a Sessão de Resolução → Firmware reporta a falha ao módulo de Estados de Navegação, que transita para o Estado `Erro` via UC-F014.
- **Critério de aceitação:**
  - Os dados do giroscópio e do acelerômetro devem ser coletados a cada ciclo de sensoriamento durante qualquer Estado de Navegação diferente de `Inicializando` e `Aguardando`.
  - A referência angular acumulada do giroscópio deve ser resetada após cada manobra de curva concluída, limitando a propagação de erro de deriva entre curvas consecutivas (RNF-004).

---

## UC-F005

- **Título:** Monitorar Consumo de Energia via INA219
- **`<` Backward:** RF-010
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Incluído em UC-F012 (dados alimentam a carga útil de Telemetria)
- **Fluxo principal:**
  1. A cada ciclo de Telemetria, o firmware solicita as medições do INA219 via Barramento I²C.
  2. O firmware recebe os valores de tensão no barramento da bateria LiPo (V), corrente drenada pelo sistema (A) e potência instantânea calculada internamente pelo INA219 (W).
  3. Os três valores são incluídos diretamente, sem transformação, na carga útil de Telemetria a ser transmitida por UC-F012.
- **Fluxo(s) alternativo(s):**
  - 1a. INA219 não responde ao Barramento I²C durante a Sessão de Resolução → Firmware reporta a falha ao módulo de Estados de Navegação, que transita para o Estado `Erro` via UC-F014.
- **Critério de aceitação:**
  - Os três campos — tensão (V), corrente (A) e potência (W) — devem ser incluídos sem transformação na carga útil de Telemetria, para exibição direta pelo sistema web.
  - A leitura deve ocorrer a cada ciclo de Telemetria e não a cada ciclo de sensoriamento, para não sobrecarregar desnecessariamente o Barramento I²C.

---

## UC-F006

- **Título:** Atualizar Mapa do Labirinto e Propagar Valores de Inundação
- **`<` Backward:** RF-011, RF-012
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Estende UC-F003 (disparado por nova classificação de Parede); estende UC-F007 (valores atualizados são consumidos pela seleção de próxima Célula); estende UC-F008 (recálculo completo após Recálculo de Rota)
- **Fluxo principal:**
  1. Ao receber nova classificação de Parede de UC-F003, o firmware verifica se o estado da face correspondente da Célula atual mudou em relação ao que estava registrado no Mapa do Labirinto.
  2. O firmware registra o novo estado (`presente` ou `ausente`) na face correspondente da Célula atual e, simetricamente, na face oposta da Célula vizinha compartilhante da Parede, garantindo consistência bidirecional.
  3. Se a atualização alterou algum estado de Parede que afete os Valores de Inundação de Células adjacentes, o firmware recalcula e propaga os novos valores a partir da Célula Objetivo (Valor 0), incrementando em 1 a cada Célula adjacente acessível sem Parede `presente` interposta.
  4. Os novos Valores de Inundação ficam disponíveis para a seleção de próxima Célula em UC-F007.
- **Fluxo(s) alternativo(s):**
  - 2a. A Parede já estava registrada com o mesmo estado → Nenhuma atualização é necessária e o recálculo de Valores de Inundação não é disparado.
- **Critério de aceitação:**
  - A consistência bidirecional deve ser garantida: toda Parede registrada em uma face deve ser simultaneamente registrada na face oposta da Célula vizinha.
  - O recálculo completo dos Valores de Inundação deve ser concluído antes da próxima seleção de Célula por UC-F007.
  - A Célula Objetivo deve sempre manter Valor de Inundação 0, independentemente de quaisquer atualizações de Parede.

---

## UC-F007

- **Título:** Navegar pelo Labirinto para a Célula Objetivo
- **`<` Backward:** RF-013, RF-014, RF-015, RNF-002
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Inclui UC-F006 (consulta valores do Mapa do Labirinto a cada passo); inclui UC-F008 (disparado quando nova Parede invalida o caminho); inclui UC-F009 (executa travessia em linha reta); inclui UC-F010 (executa manobra de curva); inclui UC-F011 (monitora posição discreta via Contador de Células)
- **Fluxo principal:**
  1. O firmware, no Estado de Navegação `Mapeando` ou `Resolvendo`, avalia os Valores de Inundação de todas as Células vizinhas acessíveis (sem Parede `presente` interposta) a partir da Célula atual.
  2. O firmware seleciona a Célula vizinha de menor Valor de Inundação como próximo destino.
  3. Se o próximo destino é alcançável em linha reta, o firmware executa UC-F009; se exige rotação, executa UC-F010.
  4. Ao concluir o movimento, o firmware atualiza a posição corrente com base no Contador de Células de UC-F011 e verifica se a Célula atual é a Célula Objetivo.
  5. Se a Célula Objetivo não foi alcançada, o firmware retorna ao passo 1.
  6. Se a Célula Objetivo foi alcançada, o firmware encerra a navegação via UC-F015.
- **Fluxo(s) alternativo(s):**
  - 2a. Dois ou mais vizinhos apresentam o mesmo Valor de Inundação → O firmware aplica o critério de desempate determinístico (frente > direita > esquerda > ré em relação à orientação corrente do robô), garantindo comportamento reproduzível entre Sessões sob as mesmas condições de labirinto (RNF-002).
  - 3a. Durante o movimento, UC-F003 classifica nova Parede `presente` que bloqueia ou invalida o caminho corrente → O firmware interrompe o movimento e executa UC-F008 antes de retomar o deslocamento.
  - 6a. Todas as Paredes do caminho ótimo já são conhecidas antes da chegada à Célula Objetivo → O firmware transita de `Mapeando` para `Resolvendo` e prossegue o percurso ótimo sem disparar novos Recálculos de Rota.
- **Critério de aceitação:**
  - O robô deve sempre se mover para a Célula vizinha acessível de menor Valor de Inundação; movimentos que aumentem o Valor de Inundação só são permitidos quando não há alternativa acessível.
  - Em caso de empate de Valores de Inundação, o critério de desempate deve ser determinístico, fixo e documentado (RNF-002).
  - A posição corrente deve ser atualizada ao término de cada Célula percorrida, nunca de forma fracionada.

---

## UC-F008

- **Título:** Executar Recálculo de Rota
- **`<` Backward:** RF-011, RF-012, RF-013, RF-014
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Estende UC-F007 (disparado quando nova Parede invalida o caminho corrente); inclui UC-F006 (atualiza o Mapa do Labirinto e propaga novos Valores de Inundação)
- **Fluxo principal:**
  1. UC-F003 classifica nova Parede como `presente` que bloqueia o caminho que o robô seguia ou torna o caminho corrente subótimo.
  2. O firmware interrompe imediatamente o movimento dos Motores DC N20.
  3. O firmware atualiza o Mapa do Labirinto com a nova Parede e propaga os novos Valores de Inundação via UC-F006.
  4. O firmware seleciona a nova direção de menor Valor de Inundação disponível na posição atual.
  5. O firmware retoma o deslocamento em direção à nova Célula selecionada, executando UC-F009 ou UC-F010 conforme a manobra necessária.
- **Fluxo(s) alternativo(s):**
  - 4a. Após o recálculo, nenhuma Célula vizinha possui Valor de Inundação menor que o da Célula atual — configuração de labirinto que pode isolar o robô temporariamente → O firmware aguarda confirmação de leitura adicional dos sensores antes de tentar rota alternativa de exploração.
- **Critério de aceitação:**
  - O movimento deve ser interrompido antes de qualquer atualização do Mapa do Labirinto ou recálculo de Valores de Inundação.
  - O Recálculo de Rota deve ser executado integralmente antes de o robô retomar qualquer deslocamento.
  - O comportamento deve ser idêntico independentemente do Estado de Navegação (`Mapeando` ou `Resolvendo`), sendo que no Estado `Resolvendo` o mapa está completo e portanto Recálculos de Rota não devem ocorrer em condições normais.

---

## UC-F009

- **Título:** Controlar Travessia em Linha Reta
- **`<` Backward:** RF-016, RF-017, RF-018
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Incluído em UC-F007 (chamado quando o próximo passo de navegação é em linha reta); utiliza UC-F004 (acelerômetro alimenta Correção de Trajetória); utiliza UC-F011 (encoder alimenta sinal de erro do PID e detecção de término de Célula)
- **Fluxo principal:**
  1. O firmware determina, a partir de UC-F007, que o próximo movimento é em linha reta.
  2. O firmware configura e ativa os canais LEDC do ESP32, gerando sinais PWM de duty cycle inicial para ambos os Motores DC N20 via Driver de Motor DRV8833.
  3. O firmware executa a malha Controle PID, utilizando como sinal de erro a diferença de contagem de pulsos entre os Encoders dos dois motores (UC-F011), ajustando dinamicamente o duty cycle de cada canal PWM a cada ciclo de controle para equalizar as velocidades dos dois motores.
  4. Simultaneamente, o firmware aplica a Correção de Trajetória, comparando as leituras dos sensores ToF laterais (UC-F003) para medir o desvio lateral em relação ao eixo da Célula e, opcionalmente, usando o acelerômetro do IMU (UC-F004) como sinal auxiliar, ajustando o diferencial de velocidade entre os motores para manter o alinhamento direcional.
  5. O firmware monitora o Contador de Células de UC-F011; ao detectar a conclusão da travessia da Célula atual, encerra o ciclo e retorna o controle a UC-F007.
- **Fluxo(s) alternativo(s):**
  - 3a. Assimetria mecânica ou de atrito excessiva faz com que a malha PID não equalize as velocidades dentro do ciclo de controle → A Correção de Trajetória por sensores ToF atua como compensação adicional de alinhamento direcional, complementando a malha PID.
- **Critério de aceitação:**
  - A malha Controle PID deve atuar exclusivamente durante deslocamentos em linha reta, sendo desativada durante manobras de curva executadas por UC-F010.
  - A Correção de Trajetória deve complementar a malha PID de velocidade, nunca substituí-la.
  - Os ganhos P, I e D devem ser parametrizáveis sem necessidade de recompilação do firmware.

---

## UC-F010

- **Título:** Executar Manobra de Curva
- **`<` Backward:** RF-016, RF-019, RF-020, RNF-004
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Incluído em UC-F007 (chamado quando o próximo passo de navegação exige rotação); utiliza UC-F004 (giroscópio alimenta o monitoramento do Ângulo de Curva)
- **Fluxo principal:**
  1. O firmware determina, a partir de UC-F007, que o próximo movimento exige uma curva de 90° ou de 180°.
  2. O firmware desativa a malha Controle PID de velocidade e a Correção de Trajetória utilizadas em UC-F009.
  3. O firmware ativa os canais PWM dos dois Motores DC N20 com velocidades assimétricas para gerar a rotação no sentido determinado por UC-F007.
  4. O firmware lê continuamente o giroscópio do IMU MPU-6050 via UC-F004, integrando o Ângulo de Curva acumulado desde o início da manobra.
  5. Quando o Ângulo de Curva acumulado atinge o valor-alvo (90° ou 180°) dentro da tolerância calibrada, o firmware interrompe a rotação.
  6. O firmware reseta a referência angular acumulada do giroscópio (RNF-004) e autoriza o avanço para a próxima Célula, retornando o controle a UC-F007.
- **Fluxo(s) alternativo(s):**
  - 4a. O giroscópio acumula deriva progressiva por manobras repetidas → O firmware limita o erro resetando a referência angular após cada manobra; não há fusão sensorial com outros sinais de posição nesta versão (RNF-004).
  - 5a. O valor-alvo não é atingido dentro de um tempo limite configurado em parâmetro de compilação → O firmware transita para o Estado `Erro` via UC-F014.
- **Critério de aceitação:**
  - O avanço para a próxima Célula deve ser bloqueado enquanto o Ângulo de Curva acumulado não atingir o valor-alvo dentro da tolerância calibrada.
  - A referência angular deve ser resetada ao final de cada manobra concluída, limitando a propagação de erro de deriva entre curvas consecutivas (RNF-004).
  - O valor-alvo de rotação e a tolerância devem ser parametrizáveis sem necessidade de recompilação do firmware.

---

## UC-F011

- **Título:** Registrar Odometria e Estimar Deslocamento
- **`<` Backward:** RF-021, RF-022, RF-023, RF-024, RNF-006
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Utilizado por UC-F009 (contagem de pulsos alimenta sinal de erro do Controle PID); utilizado por UC-F007 (Contador de Células alimenta estimativa de posição); incluído em UC-F012 (Contador de Células e Velocidade Média alimentam carga útil de Telemetria)
- **Fluxo principal:**
  1. O firmware registra, via rotinas de interrupção de hardware nos pinos GPIO do ESP32, cada pulso gerado pelos Encoders acoplados a cada Motor DC N20, mantendo contadores de pulsos independentes para cada motor.
  2. O firmware converte a contagem acumulada de pulsos em distância linear percorrida em milímetros, aplicando a relação (pulsos por revolução × diâmetro da roda) configurada por parâmetro de compilação.
  3. Ao acumular pulsos equivalentes à distância de uma Célula completa, o firmware incrementa o Contador de Células.
  4. O firmware atualiza continuamente a Velocidade Média da Sessão de Resolução como a razão entre a distância total percorrida e o tempo decorrido desde o início da Sessão corrente.
  5. O Contador de Células e a Velocidade Média são incluídos na carga útil de Telemetria a cada ciclo de transmissão de UC-F012.
- **Fluxo(s) alternativo(s):**
  - 2a. Escorregamento de rodas ou variação de atrito causa desvio entre pulsos contados e distância real percorrida → A estimativa de posição acumula erro relativo; a Correção de Trajetória por sensores ToF laterais de UC-F009 compensa parcialmente o desvio direcional, mas não a posição absoluta (RNF-006).
- **Critério de aceitação:**
  - A captura de pulsos deve ser implementada exclusivamente via interrupção de hardware (ISR), nunca por polling, garantindo que nenhum pulso seja perdido em condições de alta velocidade.
  - O Contador de Células deve ser uma variável inteira discreta, incrementada apenas ao término completo de cada Célula, nunca de forma fracionada.
  - A Velocidade Média deve ser calculada como razão entre distância total e tempo total da Sessão corrente, sendo distinta da velocidade instantânea de cada motor usada internamente pelo Controle PID (UC-F009).
  - A Odometria fornece apenas posição relativa; não há estimativa de posição absoluta implementada nesta versão (RNF-006).

---

## UC-F012

- **Título:** Transmitir Telemetria em Tempo Real ao Sistema Web
- **`<` Backward:** RF-025, RF-026, RF-027, RNF-003
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário), Sistema Web (secundário — receptor da Telemetria)
- **Relacionamentos:** Inclui UC-F005 (dados do INA219 alimentam a carga útil); inclui UC-F011 (Contador de Células e Velocidade Média alimentam a carga útil)
- **Fluxo principal:**
  1. Durante a Inicialização (UC-F001), o firmware configura o módulo Wi-Fi integrado ao ESP32 no modo estação (STA), conectando-o à rede definida por parâmetros de compilação, antes da transição para o Estado de Navegação `Aguardando`.
  2. A cada ciclo de Telemetria durante os Estados de Navegação `Mapeando`, `Resolvendo` e `Concluído`, o firmware monta a carga útil contendo obrigatoriamente: Estado de Navegação atual, Contador de Células percorridas, Velocidade Média, posição corrente no Mapa do Labirinto, tensão da bateria (V), corrente drenada (A) e potência instantânea (W).
  3. O firmware transmite a carga útil ao Sistema Web via Wi-Fi de forma unidirecional, sem aguardar confirmação de recebimento.
  4. O módulo de Navegação continua sua execução de forma completamente independente do estado da conexão Wi-Fi (RNF-003).
- **Fluxo(s) alternativo(s):**
  - 1a. A conexão Wi-Fi não é estabelecida durante a Inicialização → O firmware informa o operador via LED ou Buzzer de Depuração como aviso não bloqueante; a Sessão de Resolução pode ser iniciada normalmente.
  - 3a. Perda de pacotes individuais durante a transmissão → A perda é tolerada; o firmware não retransmite pacotes perdidos e prossegue com a navegação sem interrupção (RNF-003).
  - 3b. Conexão Wi-Fi é interrompida prolongadamente → O módulo de Telemetria aguarda a reconexão e retoma a transmissão automaticamente quando a conexão é restabelecida; o módulo de Navegação não é interrompido nem transita para o Estado `Erro` (RNF-003).
- **Critério de aceitação:**
  - A transmissão deve ser estritamente unidirecional: o firmware não processa, interpreta nem responde a mensagens recebidas pelo módulo Wi-Fi durante a Sessão de Resolução.
  - A carga útil deve conter obrigatoriamente os sete campos: Estado de Navegação, Contador de Células, Velocidade Média, posição no Mapa do Labirinto, tensão (V), corrente (A) e potência (W).
  - Falhas de conectividade Wi-Fi, de qualquer duração, não devem transitar o firmware para o Estado `Erro` nem interromper a execução autônoma da navegação (RNF-003).

---

## UC-F013

- **Título:** Iniciar Sessão de Resolução
- **`<` Backward:** RF-028, RF-030
- **`>` Forward:** N/A.
- **Ator(es):** Operador (primário), Firmware (secundário)
- **Relacionamentos:** Estende UC-F001 (pré-condição: sistema deve estar no Estado `Aguardando`); inicia UC-F007 (dispara a execução do Algoritmo Flood Fill)
- **Fluxo principal:**
  1. Com o robô no Estado de Navegação `Aguardando`, o operador fornece o sinal de início da Sessão de Resolução.
  2. O firmware reinicializa o Mapa do Labirinto, revertendo todas as Paredes internas para `desconhecida` e recalculando os Valores de Inundação iniciais a partir da Célula Objetivo.
  3. O firmware zera o Contador de Células e o temporizador de Sessão.
  4. O firmware transita para o Estado de Navegação `Mapeando` e inicia a execução de UC-F007.
- **Fluxo(s) alternativo(s):**
  - 1a. O sinal de início é fornecido com o robô em Estado de Navegação diferente de `Aguardando` → O firmware ignora o sinal completamente; nenhuma nova Sessão de Resolução é iniciada e o Estado corrente é mantido.
- **Critério de aceitação:**
  - Nenhuma nova Sessão de Resolução deve ser iniciada enquanto o firmware estiver em qualquer Estado de Navegação diferente de `Aguardando`.
  - O Mapa do Labirinto, o Contador de Células e o temporizador de Sessão devem ser reinicializados antes da transição para `Mapeando`, sem exceção.
  - Dados residuais de Sessões de Resolução anteriores não devem contaminar a execução da nova Sessão.

---

## UC-F014

- **Título:** Detectar Falha e Transitar para Estado Erro
- **`<` Backward:** RF-028, RF-029
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Estende UC-F003 (falha de sensor ToF), UC-F004 (falha do IMU MPU-6050), UC-F005 (falha do INA219), UC-F009 (Encoder sem pulsos durante travessia), UC-F010 (valor-alvo de Ângulo de Curva não atingido dentro do tempo limite)
- **Fluxo principal:**
  1. Durante a execução de qualquer módulo do firmware, é detectada uma condição de falha irrecuperável: sensor ToF sem resposta no Barramento I²C após a Inicialização; Encoder sem geração de pulsos esperados durante movimento comandado; ou perda de comunicação com o IMU MPU-6050 ou o INA219 durante a Sessão de Resolução.
  2. O firmware interrompe imediatamente todos os sinais PWM gerados pelos canais LEDC do ESP32 para os Motores DC N20 via Driver de Motor DRV8833, garantindo parada completa do robô.
  3. O firmware transita para o Estado de Navegação `Erro`.
  4. O firmware aciona sinalização sonora via Buzzer de Depuração e sinalização luminosa via LEDs com padrão distinto da sinalização de prontidão de UC-F001.
  5. O Estado `Erro` é incluído imediatamente na próxima carga útil de Telemetria de UC-F012.
  6. O firmware permanece no Estado `Erro` até que o operador desligue e religue o robô, reiniciando a Inicialização completa via UC-F001.
- **Fluxo(s) alternativo(s):**
  - Não se aplica — a transição para o Estado `Erro` é executada sem alternativas ao detectar qualquer falha irrecuperável listada.
- **Critério de aceitação:**
  - A parada completa dos motores deve ser imediata ao detectar a falha, antes de qualquer outra ação do firmware.
  - A sinalização de `Erro` deve ser visualmente e sonoramente distinguível da sinalização de prontidão de UC-F001 e de conclusão de UC-F015.
  - A transmissão do Estado `Erro` via Telemetria deve ocorrer no ciclo imediatamente seguinte à detecção da falha.

---

## UC-F015

- **Título:** Encerrar Sessão de Resolução ao Alcançar a Célula Objetivo
- **`<` Backward:** RF-015, RF-028
- **`>` Forward:** N/A.
- **Ator(es):** Firmware (primário)
- **Relacionamentos:** Estende UC-F007 (disparado quando o robô ocupa a Célula Objetivo); utiliza UC-F011 (Contador de Células fornece posição discreta para confirmação); utiliza UC-F003 (leituras ToF confirmam chegada); precede UC-F013 (o Estado `Concluído` deve transitar para `Aguardando` antes de nova Sessão)
- **Fluxo principal:**
  1. O firmware detecta, via UC-F011, que o Contador de Células acumulado corresponde à posição da Célula Objetivo determinada em UC-F001.
  2. O firmware confirma a chegada por meio de leitura dos sensores ToF de UC-F003.
  3. O firmware interrompe o movimento dos Motores DC N20 e transita para o Estado de Navegação `Concluído`.
  4. O firmware sinaliza a chegada ao operador via Buzzer de Depuração e LEDs com padrão distinto de UC-F014.
  5. O Estado `Concluído` é incluído na carga útil de Telemetria de UC-F012.
  6. O firmware permanece no Estado `Concluído` aguardando o operador; uma nova Sessão de Resolução só pode ser iniciada após retorno ao Estado `Aguardando` via UC-F013.
- **Fluxo(s) alternativo(s):**
  - 1a. Todas as Paredes do caminho ótimo já são conhecidas antes da chegada à Célula Objetivo → O firmware transita de `Mapeando` para `Resolvendo` e executa o percurso ótimo sem disparar Recálculos de Rota (UC-F008), até confirmar a chegada e transitar para `Concluído`.
- **Critério de aceitação:**
  - A confirmação de chegada deve ser baseada em ambos os critérios: Contador de Células (UC-F011) e leitura confirmatória dos sensores ToF (UC-F003).
  - A sinalização de conclusão deve ser visualmente e sonoramente distinguível da sinalização de prontidão de UC-F001 e de `Erro` de UC-F014.
  - O firmware não deve iniciar nova Sessão de Resolução automaticamente após alcançar a Célula Objetivo; o retorno ao Estado `Aguardando` deve depender de ação do operador.
