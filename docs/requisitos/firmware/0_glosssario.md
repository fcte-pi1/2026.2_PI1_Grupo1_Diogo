# Glossário do Firmware — Dicionário de Domínio

**Versão:** 1.0
**Escopo:** Documento central projetado para garantir a Linguagem Ubíqua em todos os artefatos e cerimônias do projeto, com foco exclusivo no firmware do robô. Qualquer termo de algoritmo, de hardware embarcado, de protocolo ou de comportamento do sistema que possa gerar ambiguidade entre as frentes de Software, Hardware, Energia e Estruturas deve ser catalogado aqui.

> **Nota de escopo:** este glossário cobre exclusivamente os conceitos operacionalizados pelo firmware (código executado no ESP32). Termos de estrutura mecânica, dimensionamento elétrico de potência e interface web de telemetria, quando mencionados, aparecem apenas como referências contextuais — suas definições autoritativas residem nos documentos de domínio das respectivas frentes.

---

## Módulos do Firmware

Para efeito de rastreabilidade nos artefatos KAOS, o firmware é estruturado nos seguintes módulos internos:

| Módulo                  | Responsabilidade principal                                            |
| ----------------------- | --------------------------------------------------------------------- |
| **Inicialização**       | Boot, reendereçamento de sensores, leitura do DIP Switch e auto-teste |
| **Sensoriamento**       | Leitura periódica dos sensores ToF, IMU e INA219 via I2C              |
| **Mapeamento**          | Construção e atualização em tempo real do Mapa do Labirinto           |
| **Navegação**           | Execução do Algoritmo Flood Fill e tomada de decisão de movimento     |
| **Controle de Motores** | Geração de PWM e malha PID para velocidade e alinhamento              |
| **Odometria**           | Contagem de pulsos de encoder, distância percorrida e velocidade      |
| **Telemetria**          | Transmissão Wi-Fi de dados em tempo real ao sistema web               |
| **Interface Local**     | Leitura do DIP Switch, acionamento de LEDs e Buzzer de Depuração      |

---

## Termos

### A

#### Algoritmo Flood Fill

- **Definição:** Algoritmo de navegação central do firmware, responsável por atribuir a cada Célula do labirinto um Valor de Inundação representando sua distância mínima conhecida até a Célula Objetivo. O robô, a cada passo, move-se para a célula vizinha de menor Valor de Inundação. Sempre que uma nova Parede é detectada e invalida o caminho corrente, o firmware executa um Recálculo de Rota antes de prosseguir. O algoritmo opera tanto na fase de Mapeamento (labirinto parcialmente desconhecido) quanto na fase de percurso ótimo (mapa completo).
- **Sinônimos Evitados:** "BFS/DFS" (estruturas relacionadas, mas o Flood Fill é o algoritmo específico adotado), "Algoritmo de busca"
- **Módulos Associados:** Navegação, Mapeamento

#### Ângulo de Curva

- **Definição:** Medida angular, derivada das leituras do giroscópio do IMU (MPU-6050), que representa a rotação total executada pelo robô durante uma manobra de 90° ou 180°. O firmware monitora o Ângulo de Curva continuamente durante a manobra e só autoriza o avanço para a próxima Célula quando o valor acumulado atingir a rotação-alvo dentro da tolerância calibrada.
- **Sinônimos Evitados:** "Grau de rotação" (usar "Ângulo de Curva" para manter consistência nos artefatos), "Deflexão angular", "Giro"
- **Módulos Associados:** Controle de Motores, Sensoriamento

---

### B

#### Barramento I2C

- **Definição:** Protocolo de comunicação serial de dois fios (SDA/SCL) utilizado pelo firmware para se comunicar com todos os periféricos sensoriais — os sete sensores ToF VL53L1X, o IMU MPU-6050 e o INA219. Todos os dispositivos compartilham o mesmo par de linhas do ESP32 e são endereçados individualmente. Os sensores VL53L1X requerem o procedimento de Reendereçamento de Sensores durante a Inicialização, pois saem de fábrica com o mesmo endereço padrão (0x29).
- **Sinônimos Evitados:** "SPI" (protocolo distinto, não utilizado neste projeto), "Serial" (ambíguo — pode confundir com UART), "Wire" (nome de biblioteca Arduino; não usar como nome do protocolo)
- **Módulos Associados:** Sensoriamento, Inicialização

#### Buzzer de Depuração

- **Definição:** Componente de saída sonora acionado pelo firmware para sinalizar eventos internos discretos durante desenvolvimento e testes: conclusão bem-sucedida da Inicialização, detecção de falha em sensor, chegada à Célula Objetivo e transição para o Estado de Navegação `Erro`. Não é utilizado durante operação normal em competição; serve exclusivamente como ferramenta de diagnóstico embarcado sem necessidade de equipamento externo.
- **Sinônimos Evitados:** "Alarme" (implica condição de emergência persistente), "Beeper" (padronizar como "Buzzer de Depuração"), "Sinalizador"
- **Módulos Associados:** Interface Local, Inicialização

---

### C

#### Célula

- **Definição:** Unidade mínima de espaço navegável do labirinto. No Mapa do Labirinto, cada Célula é representada como um nó com quatro atributos de Parede (Norte, Sul, Leste, Oeste — cada um podendo ser `presente`, `ausente` ou `desconhecida`) e um Valor de Inundação inteiro calculado pelo Algoritmo Flood Fill. O robô ocupa exatamente uma Célula por vez e avança de Célula em Célula durante toda a navegação.
- **Sinônimos Evitados:** "Quadrado" (evitar informalidade), "Posição" (ambíguo — posição pode ser contínua; Célula é discreta), "Nó" (reservar para discussões de grafo na documentação de algoritmo; no contexto do labirinto, usar "Célula")
- **Módulos Associados:** Navegação, Mapeamento

#### Célula Objetivo

- **Definição:** Célula ou conjunto de células do labirinto que o robô deve alcançar para encerrar com êxito uma Sessão de Resolução. Sua posição no Mapa do Labirinto é determinada pelo Tipo de Labirinto selecionado via DIP Switch e carregada durante a Inicialização. O Algoritmo Flood Fill atribui Valor de Inundação 0 à Célula Objetivo e propaga valores crescentes para as demais células.
- **Sinônimos Evitados:** "Destino final" (vago), "Centro do labirinto" (descreve apenas um layout específico), "Meta" (impreciso no contexto do Flood Fill)
- **Módulos Associados:** Navegação, Interface Local, Inicialização

#### Controle PID

- **Definição:** Malha de controle proporcional-integral-derivativa executada pelo firmware para regular a velocidade e o alinhamento do robô durante a travessia de uma Célula em linha reta. O sinal de erro é derivado da diferença entre as leituras dos sensores ToF laterais (alinhamento com as paredes) e/ou da diferença de contagem de pulsos entre os encoders dos dois motores de tração. Cada motor recebe um valor de PWM individualmente ajustado pela malha.
- **Sinônimos Evitados:** "Controle on/off" (controle binário sem proporcionalidade), "Controle bang-bang" (sinônimo do anterior), "Regulação simples"
- **Módulos Associados:** Controle de Motores, Sensoriamento

#### Contador de Células

- **Definição:** Variável interna do firmware, incrementada a cada transição completa de Célula com base nos pulsos dos encoders, que registra o total de células percorridas desde o início da Sessão de Resolução corrente. É um dos campos incluídos na carga útil de Telemetria transmitida ao sistema web.
- **Sinônimos Evitados:** "Odômetro de células" (usar o termo padronizado "Contador de Células"), "Distância percorrida em células" (o Contador é uma variável inteira discreta, não uma grandeza contínua)
- **Módulos Associados:** Odometria, Telemetria

#### Correção de Trajetória

- **Definição:** Ajuste contínuo aplicado pelo firmware ao diferencial de velocidade entre os motores de tração durante a travessia em linha reta, com base nos dados do acelerômetro do IMU e/ou dos sensores ToF laterais, para compensar desvios de curso causados por assimetrias mecânicas ou de atrito. Difere do Controle PID de velocidade, que equaliza as rotações dos motores; a Correção de Trajetória atua no alinhamento direcional do robô dentro da Célula.
- **Sinônimos Evitados:** "Controle de direção" (vago, pode confundir com manobras de curva), "Steering" (manter o vocabulário em português nos artefatos)
- **Módulos Associados:** Controle de Motores, Sensoriamento

---

### D

#### DIP Switch

- **Definição:** Componente físico de múltiplas chaves individuais, lido pelo firmware durante a Inicialização (via GPIO do ESP32), utilizado pelo operador para selecionar o Tipo de Labirinto antes de ligar o robô. O estado das chaves determina a posição da Célula Objetivo e os demais parâmetros de operação derivados do layout. O DIP Switch não é relido após o boot — alterações durante uma Sessão de Resolução são ignoradas.
- **Sinônimos Evitados:** "Seletor de modo" (vago; usar o nome do componente), "Chave de configuração" (impreciso), "Botão" (um botão é momentâneo; o DIP Switch é de estado fixo)
- **Módulos Associados:** Interface Local, Inicialização

#### Driver de Motor (DRV8833)

- **Definição:** Circuito integrado de Ponte H que recebe os sinais PWM gerados pelo ESP32 e os converte em corrente de acionamento adequada aos motores DC N20. O firmware controla cada canal do DRV8833 por meio de dois pinos de sinal (IN1/IN2), combinando nível lógico e duty cycle para definir direção e velocidade do motor. O componente inclui proteções internas contra sobrecorrente e sobretemperatura que não requerem tratamento explícito no firmware nesta versão.
- **Sinônimos Evitados:** "Ponte H genérica" (especificar sempre "DRV8833" nos artefatos técnicos), "Driver L298N" (componente diferente com características distintas), "Controlador de motor" (vago)
- **Módulos Associados:** Controle de Motores

---

### E

#### Encoder

- **Definição:** Sensor acoplado ao eixo de cada Motor DC N20 que gera trens de pulsos elétricos proporcionais à rotação do motor. O firmware captura esses pulsos via rotinas de interrupção de hardware (GPIO do ESP32) e os utiliza para: calcular a distância percorrida (Odometria), determinar a velocidade instantânea de cada motor para o Controle PID, e incrementar o Contador de Células.
- **Sinônimos Evitados:** "Sensor de rotação" (usar "Encoder"), "Taquímetro" (terminologia de instrumentação industrial), "Sensor Hall" (tipo específico de encoder — não usar como sinônimo genérico, pois o princípio de operação pode diferir)
- **Módulos Associados:** Odometria, Controle de Motores

#### ESP32

- **Definição:** Microcontrolador dual-core de 32 bits (versão de 30 pinos) que atua como a unidade central de processamento do firmware. Suas responsabilidades incluem: executar o Algoritmo Flood Fill, ler todos os sensores via Barramento I2C, capturar pulsos de Encoder via interrupção, gerar sinais PWM pelos canais LEDC para os drivers de motor, ler o DIP Switch, acionar o Buzzer de Depuração e os LEDs, e transmitir Telemetria pelo módulo Wi-Fi integrado. Duas unidades são adquiridas (uma principal e uma reserva).
- **Sinônimos Evitados:** "Arduino" (plataforma distinta com arquitetura e recursos diferentes), "Microprocessador" (o ESP32 é um microcontrolador com periféricos integrados, não um microprocessador de uso geral), "MCU" (abreviação aceitável em contexto técnico, mas preferir "ESP32" nos artefatos de domínio)
- **Módulos Associados:** Todos os módulos

#### Estado de Navegação

- **Definição:** Condição operacional corrente do robô, gerenciada pelo firmware como uma máquina de estados. Os estados definidos são: `Inicializando` (boot e configuração de periféricos), `Aguardando` (robô parado, aguardando sinal de início), `Mapeando` (percorrendo células desconhecidas com Flood Fill dinâmico), `Resolvendo` (percorrendo o caminho ótimo com o mapa já completo), `Concluído` (Célula Objetivo alcançada) e `Erro` (falha detectada em sensor ou atuador). O Estado de Navegação compõe a carga útil da Telemetria.
- **Sinônimos Evitados:** "Modo do robô" (usar "Estado de Navegação"), "Status" isolado (especificar sempre qual estado), "Fase" (reservar para macrofases do projeto — ex.: fase de testes; no firmware, usar "Estado de Navegação")
- **Módulos Associados:** Navegação, Inicialização, Telemetria

---

### F

#### Firmware

- **Definição:** Software embarcado executado no ESP32 que implementa toda a lógica de controle autônomo do robô. Abrange: Inicialização de periféricos, leitura e processamento dos sensores (VL53L1X, MPU-6050, INA219 e encoders), execução do Algoritmo Flood Fill, Controle de Motores via PWM e PID, gerenciamento da máquina de Estados de Navegação e transmissão de Telemetria via Wi-Fi. O firmware é distinto do software web que recebe e exibe a Telemetria — os dois sistemas se comunicam, mas são desenvolvidos e versionados de forma independente.
- **Sinônimos Evitados:** "Software do robô" (usar "Firmware" para distinguir claramente do software web), "Código embarcado" (vago), "Programa do ESP32" (informal)
- **Módulos Associados:** Todos os módulos

---

### I

#### IMU (MPU-6050)

- **Definição:** Unidade de medição inercial composta por giroscópio de três eixos e acelerômetro de três eixos, comunicada ao ESP32 via Barramento I2C. O firmware utiliza os dados do giroscópio para medir o Ângulo de Curva durante manobras e os dados do acelerômetro como sinal auxiliar na Correção de Trajetória durante deslocamentos em linha reta.
- **Sinônimos Evitados:** "Giroscópio" ou "Acelerômetro" isolados (o MPU-6050 provê ambos — evitar reduzir ao subcomponente quando o contexto envolve os dois), "Sensor inercial genérico" (especificar "IMU" ou "MPU-6050")
- **Módulos Associados:** Sensoriamento, Controle de Motores

#### INA219

- **Definição:** Sensor de monitoramento de energia comunicado ao ESP32 via Barramento I2C. Realiza medições de tensão no barramento da bateria LiPo, corrente drenada pelo sistema e potência instantânea calculada internamente. O firmware lê esses valores periodicamente e os inclui na Telemetria, permitindo que o sistema web exiba o consumo de bateria em tempo real — requisito explícito da especificação de hardware.
- **Sinônimos Evitados:** "Sensor de corrente" (o INA219 mede tensão, corrente e potência — não reduzir a uma única grandeza), "Voltímetro embarcado" (idem), "Monitor de bateria" (vago)
- **Módulos Associados:** Sensoriamento, Telemetria

#### Inicialização

- **Definição:** Primeira fase do ciclo de execução do firmware, correspondente ao Estado de Navegação `Inicializando`. Compreende, em ordem: auto-teste do ESP32, configuração dos pinos GPIO, Reendereçamento de Sensores ToF no Barramento I2C, verificação de comunicação com o IMU e o INA219, leitura do DIP Switch para determinar o Tipo de Labirinto, construção da estrutura inicial do Mapa do Labirinto (todas as paredes internas marcadas como `desconhecidas` e o perímetro externo como `presente`) e sinalização de prontidão via Buzzer de Depuração e LED. Somente após a conclusão bem-sucedida da Inicialização o firmware transita para o Estado `Aguardando`.
- **Sinônimos Evitados:** "Boot" (etapa de sistema operacional; o ESP32 não executa SO — usar "Inicialização"), "Setup" (nome de função em Arduino; evitar usar como termo de domínio), "Configuração inicial"
- **Módulos Associados:** Inicialização, Sensoriamento, Interface Local

---

### L

#### Labirinto

- **Definição:** Estrutura física composta por um conjunto discreto de Células interligadas por passagens e separadas por Paredes que o robô deve explorar e resolver durante uma Sessão de Resolução. É representado internamente pelo firmware como o Mapa do Labirinto. Suas dimensões e a posição da Célula Objetivo variam conforme o Tipo de Labirinto.
- **Sinônimos Evitados:** "Maze" (usar "Labirinto" nos artefatos em português), "Pista" (reservado a competições de seguidor de linha — contexto distinto), "Ambiente" (genérico demais)
- **Módulos Associados:** Navegação, Mapeamento

#### Limiar de Detecção de Parede

- **Definição:** Valor de distância em milímetros, configurado durante a calibração do firmware, abaixo do qual uma leitura de um Sensor ToF é interpretada como presença de Parede em uma dada direção. Leituras acima do Limiar indicam passagem livre. O valor exato varia conforme a posição do sensor (frontal, lateral, diagonal) e as dimensões físicas da Célula. Um Limiar mal calibrado pode causar falsas detecções ou omissões de Parede, comprometendo a integridade do Mapa do Labirinto.
- **Sinônimos Evitados:** "Threshold" (padronizar como "Limiar de Detecção de Parede" nos artefatos em português), "Valor de corte", "Sensibilidade do sensor"
- **Módulos Associados:** Sensoriamento, Mapeamento

---

### M

#### Mapa do Labirinto

- **Definição:** Estrutura de dados matricial residente na memória do ESP32 que representa o estado corrente de conhecimento do robô sobre o labirinto. Para cada Célula, armazena: o estado de cada uma das quatro Paredes (`presente`, `ausente` ou `desconhecida`) e o Valor de Inundação calculado pelo Algoritmo Flood Fill. É inicializado com todas as paredes internas `desconhecidas` e o perímetro externo `presente`, sendo atualizado progressivamente a cada nova Parede detectada pelos sensores ToF.
- **Sinônimos Evitados:** "Grid" (usar "Mapa do Labirinto" como termo unificado nos artefatos), "Matriz de células" (idem), "Representação do ambiente"
- **Módulos Associados:** Navegação, Mapeamento

#### Mapeamento

- **Definição:** Sub-fase da Sessão de Resolução, correspondente ao Estado de Navegação `Mapeando`, em que o robô percorre células com Paredes ainda `desconhecidas`, atualiza o Mapa do Labirinto em tempo real com as leituras dos sensores ToF e executa Recálculos de Rota sempre que uma nova Parede invalida o caminho corrente. O Mapeamento encerra-se quando o robô alcança a Célula Objetivo ou quando todas as células do caminho ótimo já possuem Paredes totalmente conhecidas, permitindo transição para a fase de percurso ótimo.
- **Sinônimos Evitados:** "Exploração" (aceitável informalmente, mas "Mapeamento" é o termo técnico do firmware para esta fase), "Escaneamento", "Reconhecimento"
- **Módulos Associados:** Navegação, Sensoriamento

#### Modo de Operação

- **Definição:** Configuração de alto nível selecionada pelo operador via DIP Switch antes do boot, que determina o Tipo de Labirinto a ser resolvido e todos os parâmetros derivados (posição da Célula Objetivo e dimensões da grade). Diferentemente do Estado de Navegação — que é dinâmico e muda durante a execução — o Modo de Operação é estático: é lido uma única vez na Inicialização e não pode ser alterado durante uma Sessão de Resolução.
- **Sinônimos Evitados:** "Configuração" (vago; Modo de Operação é um conceito específico de seleção pré-execução), "Perfil de execução", "Preset"
- **Módulos Associados:** Interface Local, Inicialização

#### Motor DC N20

- **Definição:** Motor de corrente contínua com caixa de redução integrada e Encoder acoplado, responsável pela propulsão e pela geração de dados de Odometria do robô. O firmware controla velocidade e direção de cada motor por meio do Driver de Motor (DRV8833) com sinais PWM gerados pelos canais LEDC do ESP32. São utilizadas três unidades no projeto.
- **Sinônimos Evitados:** "Motor de passo" (atuador de posicionamento diferente), "Servo" (atuador com controle angular, diferente do N20), "Motor DC genérico" (a presença do Encoder é essencial para a Odometria e não deve ser omitida no nome)
- **Módulos Associados:** Controle de Motores, Odometria

---

### O

#### Odometria

- **Definição:** Técnica de estimativa de deslocamento e velocidade do robô baseada exclusivamente na contagem de pulsos dos Encoders dos motores, sem dependência de sensores externos de posicionamento. O firmware converte os pulsos em distância percorrida usando a relação (pulsos por revolução × diâmetro da roda), atualiza o Contador de Células e calcula a Velocidade Média da Sessão de Resolução, incluída na Telemetria.
- **Sinônimos Evitados:** "GPS" (indisponível e inadequado para uso interno em labirinto fechado), "Localização absoluta" (a Odometria fornece posição relativa, acumulando erro ao longo do tempo)
- **Módulos Associados:** Odometria, Navegação, Telemetria

---

### P

#### Parede

- **Definição:** Obstáculo físico situado entre duas Células adjacentes do labirinto, representado no Mapa do Labirinto como um atributo da face de uma Célula (Norte, Sul, Leste ou Oeste) com valor `presente`, `ausente` ou `desconhecida`. O firmware determina o estado de cada Parede comparando a leitura do Sensor ToF correspondente ao Limiar de Detecção de Parede. Uma Parede confirmada como `presente` bloqueia o movimento naquela direção e pode disparar um Recálculo de Rota.
- **Sinônimos Evitados:** "Obstáculo" (genérico; no labirinto, obstáculos são sempre Paredes entre células), "Barreira", "Limite de célula" (a ausência de Parede também delimita a célula, mas representa passagem livre)
- **Módulos Associados:** Sensoriamento, Mapeamento

#### PWM (Pulse Width Modulation)

- **Definição:** Técnica de modulação por largura de pulso utilizada pelo firmware para controlar a tensão efetiva aplicada a cada Motor DC N20 por meio do Driver de Motor DRV8833. O firmware gera os sinais PWM pelos canais LEDC do ESP32; o duty cycle de cada canal é ajustado dinamicamente pelo Controle PID a cada ciclo de controle. A frequência do PWM é configurada na Inicialização e mantida constante durante a operação.
- **Sinônimos Evitados:** "Tensão analógica" (PWM é sinal digital com largura variável, não sinal analógico), "DAC" (conversor digital-analógico — componente distinto, não utilizado para controle dos motores neste projeto)
- **Módulos Associados:** Controle de Motores

---

### R

#### Recálculo de Rota

- **Definição:** Operação executada pelo Algoritmo Flood Fill sempre que a detecção de uma nova Parede invalida o caminho que o robô estava seguindo. O firmware interrompe o movimento, registra a nova Parede no Mapa do Labirinto, propaga os novos Valores de Inundação a partir da Célula Objetivo por todas as células afetadas e, em seguida, determina a nova direção de menor Valor de Inundação antes de retomar o deslocamento.
- **Sinônimos Evitados:** "Replanejamento de trajetória" (usar "Recálculo de Rota" por coerência com o vocabulário do Flood Fill), "Desvio de obstáculo" (implica desvio lateral contínuo — no Flood Fill, a rota inteira é recalculada)
- **Módulos Associados:** Navegação, Mapeamento

#### Reendereçamento de Sensores

- **Definição:** Procedimento obrigatório executado durante a Inicialização que atribui endereços I2C únicos e distintos a cada um dos sete sensores ToF VL53L1X, contornando o fato de todos saírem de fábrica com o mesmo endereço padrão (0x29). O firmware sequencialmente desativa todos os sensores via pinos XSHUT (GPIO do ESP32), ativa-os individualmente e grava um novo endereço em cada um, repetindo até que todos os sete possuam endereços únicos e confirmem comunicação no Barramento I2C. A falha em qualquer etapa deste procedimento transita o firmware para o Estado de Navegação `Erro`.
- **Sinônimos Evitados:** "Configuração de endereço I2C" (usar o termo específico "Reendereçamento de Sensores"), "Mapeamento de I2C" (conflito com o termo "Mapeamento" do labirinto)
- **Módulos Associados:** Inicialização, Sensoriamento

---

### S

#### Sensor ToF (VL53L1X)

- **Definição:** Sensor de distância por tempo de voo (_Time-of-Flight_) a laser, operado via Barramento I2C, que emite um pulso de laser infravermelho e mede o tempo de retorno do reflexo para calcular a distância até a superfície detectada. O firmware realiza leituras periódicas dos sete sensores distribuídos nas posições frontal, duas laterais, duas diagonais e dois adicionais para determinar a presença ou ausência de Paredes ao redor da Célula atual. A tecnologia ToF independe da cor da superfície, não exigindo calibração por cor — condição crítica em labirinto de paredes brancas com piso preto.
- **Sinônimos Evitados:** "Sensor IR" ou "Sensor infravermelho de reflexão" (tecnologia substituída — não usar para se referir ao VL53L1X), "Sensor de proximidade" (genérico e implica apenas detecção binária)
- **Módulos Associados:** Sensoriamento, Mapeamento

#### Sessão de Resolução

- **Definição:** Ciclo completo de execução em que o robô parte da célula inicial, transita pelos Estados de Navegação `Mapeando` e/ou `Resolvendo` e encerra ao atingir a Célula Objetivo (conclusão) ou ao detectar uma falha irrecuperável (Estado `Erro`). Durante toda a Sessão, o firmware transmite continuamente dados de Telemetria. Uma nova Sessão só pode ser iniciada após o robô retornar ao Estado `Aguardando`.
- **Sinônimos Evitados:** "Corrida" (informal), "Run" (manter vocabulário em português nos artefatos formais), "Tentativa" (implica possibilidade de falha como estado normal — usar "Sessão de Resolução")
- **Módulos Associados:** Navegação, Telemetria

---

### T

#### Telemetria

- **Definição:** Conjunto de dados gerados pelo firmware durante uma Sessão de Resolução e transmitidos em tempo real, via Wi-Fi, ao sistema web externo. A carga útil inclui: Estado de Navegação atual, Contador de Células percorridas, Velocidade Média, posição corrente no Mapa do Labirinto, tensão da bateria, corrente e potência (lidas pelo INA219). A transmissão é unidirecional — o sistema web recebe dados, mas não envia comandos ao firmware durante a Sessão.
- **Sinônimos Evitados:** "Log" (arquivo gerado após execução — a Telemetria é transmissão em tempo real), "Dashboard" (é a interface web que exibe a Telemetria, não a Telemetria em si), "Monitoramento remoto" (vago)
- **Módulos Associados:** Telemetria

#### Tipo de Labirinto

- **Definição:** Parâmetro de configuração lido pelo firmware na Inicialização a partir do estado do DIP Switch, que determina as dimensões da grade do labirinto e a posição da Célula Objetivo. Define o Modo de Operação do robô para a Sessão de Resolução subsequente. O Tipo de Labirinto não pode ser alterado enquanto o firmware estiver em qualquer Estado de Navegação diferente de `Aguardando`.
- **Sinônimos Evitados:** "Layout do labirinto" (usar "Tipo de Labirinto" para padronização), "Configuração de mapa", "Perfil de execução"
- **Módulos Associados:** Interface Local, Inicialização, Navegação

---

### V

#### Valor de Inundação

- **Definição:** Número inteiro não-negativo atribuído pelo Algoritmo Flood Fill a cada Célula do Mapa do Labirinto, representando a distância mínima conhecida até a Célula Objetivo expressa em número de células. A Célula Objetivo recebe Valor de Inundação 0; suas vizinhas imediatas (sem Parede interposta), valor 1; e assim por diante. O robô sempre se move para a célula vizinha acessível com o menor Valor de Inundação. Após cada detecção de nova Parede, os valores afetados são recalculados.
- **Sinônimos Evitados:** "Custo de caminho" (terminologia de grafos ponderados — no Flood Fill padrão, todas as arestas têm custo unitário), "Distância em células" (usar "Valor de Inundação" para manter o vínculo semântico com o algoritmo), "Peso do nó"
- **Módulos Associados:** Navegação, Mapeamento

#### Velocidade Média

- **Definição:** Grandeza calculada pelo firmware ao longo de uma Sessão de Resolução como a razão entre a distância total percorrida (derivada da Odometria) e o tempo decorrido desde o início da Sessão. É atualizada a cada ciclo de Telemetria e transmitida ao sistema web. Distingue-se da velocidade instantânea de cada motor, utilizada internamente pelo Controle PID.
- **Sinônimos Evitados:** "Velocidade instantânea" (grandeza diferente, computada ciclo a ciclo para o PID), "Rapidez média" (usar "Velocidade Média" por ser o termo adotado nos requisitos de Telemetria)
- **Módulos Associados:** Odometria, Telemetria

---

### W

#### Wi-Fi

- **Definição:** Interface de comunicação sem fio integrada ao ESP32, utilizada pelo firmware exclusivamente para transmissão unidirecional de Telemetria ao sistema web externo. O firmware configura o módulo Wi-Fi no modo estação (STA) durante a Inicialização, conectando-se a uma rede previamente definida por parâmetro de compilação. A interface Wi-Fi não é utilizada para receber comandos nem para atualização de firmware em campo nesta versão do projeto.
- **Sinônimos Evitados:** "Bluetooth" (interface diferente, não utilizada neste projeto), "Comunicação sem fio" (vago — pode ser confundido com outros protocolos), "Rede local" (o Wi-Fi é o meio; usar "Wi-Fi" como termo específico)
- **Módulos Associados:** Telemetria
