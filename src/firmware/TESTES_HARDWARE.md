# Testes de hardware com o firmware de diagnóstico

Roteiro para testar **cada componente do robô separadamente**, com o mesmo código que o robô usa. Os testes seguem a tabela do documento `7.3 - Testes de hardware` (IDs 3.1 a 3.16).

> **Público:** equipe de eletrônica e hardware. Não é preciso instalar o ESP-IDF nem compilar nada. Basta o **Chrome ou o Edge** e um **cabo USB de dados**.

## Como funciona

O firmware de diagnóstico (`esp32-diagnostico/`) abre um console na serial. Nele, cada comando testa um componente: `i2c`, `tof`, `imu`, `ina`, `motor`, `enc`, `dip`, `botao`, `led`, `buzzer`, `ble`, `taxa` e `inverter`.

- Cada periférico só é ligado no primeiro comando que o usa. Um componente ausente ou com defeito **não impede** o teste dos outros.
- Os drivers são os do robô (`src/adapters/`). Se o componente passa aqui, ele também funciona no firmware da corrida.

## 1. Baixar o binário

O CI compila o firmware a cada mudança e publica os binários prontos.

1. No GitHub, entre em **Actions → Firmware CI** e abra a execução mais recente da `software-dev`, com o ✅ verde.
2. Em **Artifacts**, baixe o arquivo da sua placa:

   | Placa | Arquivo |
   |:--|:--|
   | ESP32-S3 (a placa oficial do robô) | `esp32-diagnostico-esp32s3` |
   | ESP32 clássica (DevKit ESP-WROOM-32, bancada) | `esp32-diagnostico-esp32` |

3. Descompacte o `.zip`. Dentro dele há um único `.bin`.

Para gravar o firmware **da corrida**, os artefatos são `esp32-esp32s3` e `esp32-esp32`.

## 2. Gravar pelo navegador

1. Ligue a placa no USB.
   - Na ESP32-S3-DevKitC, use a porta marcada **UART**: é nela que o console aparece.
   - No Windows, se a porta não aparecer, instale o driver do conversor da placa (CP210x ou CH340).
2. Abra o gravador web da Espressif: <https://espressif.github.io/esptool-js/>.
3. **Connect** e escolha a porta da placa.
4. Em **Flash Address**, deixe `0x0` e selecione o `.bin`. Clique em **Program**.
5. Ao terminar, aperte o botão **RST** (ou **EN**) da placa.

## 3. Abrir o console

Use um monitor serial a **115200 baud**. Pode ser o console da própria página do esptool-js, o Monitor Serial da IDE do Arduino ou o PuTTY. Envie as linhas com quebra de linha (*newline*).

Depois do reinício, aparece:

```
=== Rato Borrachudo: firmware de diagnóstico ===
Digite `help` para ver os comandos, ou `verificar` para começar.
rato>
```

`help` lista todos os comandos. `pinos` mostra o mapa de pinos em uso, que deve bater com o esquemático (`4.3 - Projeto conceitual de hardware`, §9).

## 4. Roteiro de testes (tabela do 7.3)

Para cada linha: monte o componente, rode o comando, compare com o resultado esperado e anote o resultado obtido no `7.3`. Copie a saída do console para as observações; ela é a evidência do teste.

As tolerâncias (±10 mm, ±0,05 V, ±10 mA) são **sugestões**: o `4.3` não define critérios de exatidão. Ajustem antes de testar, se a equipe preferir outros valores.

| ID | Teste | Comando | Resultado esperado |
|:--:|:--|:--|:--|
| 3.1 | Processador: exemplo mínimo | `info` | Mostra o chip (`esp32s3`), 2 núcleos e 16 MB de flash |
| 3.2 | Barramento I²C | `i2c` | Lista o `0x40` (INA219), o `0x68` (MPU-6050) e os ToF |
| 3.3 | ToF: fiação de cada XSHUT | `tof xshut` | Os 3 sensores respondem em `0x29`, um de cada vez; nada responde com todos desligados |
| 3.4 | ToF: leitura e reendereçamento | `tof 20`, com um obstáculo a 50, 100 e 200 mm de cada sensor | Distâncias com erro de até ±10 mm. Parede (`S`) abaixo de 90 mm. Depois, `i2c` mostra `0x30`, `0x31` e `0x32` |
| 3.5 | ToF: taxa de amostragem | `taxa tof` | Leituras por segundo; anote o valor |
| 3.6 | IMU: identificação | `imu 1` | `WHO_AM_I` de um MPU-6050 (`0x68`) ou de um compatível (`0x70` a `0x73`), com o modelo ao lado. O auto-teste do robô aceita todos esses |
| 3.7 | IMU: calibração do giro | `imu 10` parado; depois `imu 5` girando 90° à mão | Parado: a média do giro perto de 0 (anote o desvio). Girando: ângulo final perto de ±90° |
| 3.8 | INA219: leitura e calibração | `ina 10`, com o multímetro em paralelo (tensão) e em série (corrente) | Tensão com erro de até ±0,05 V e corrente até ±10 mA em relação ao multímetro |
| 3.9 | Motores: acionamento básico | `motor 0.5 0.5`, `motor -0.5 -0.5`, `motor 0.5 -0.5` | As duas rodas para frente, para trás, e girando em sentidos opostos. **Robô suspenso, com as rodas fora da mesa**. Se a roda esquerda girar ao contrário, rode `inverter motor` e repita (ver "Sentido da roda esquerda") |
| 3.10 | Encoders: sentido | `motor 0.5 0.5` | Os dois encoders contam **positivo** para frente. Se o esquerdo vier negativo, rode `inverter enc` e repita |
| 3.11 | Encoders: pulsos por volta | `enc zerar`, girar a roda **uma volta** à mão, `enc 1` | O valor de cada roda. O firmware usa **280**: se der outro, avise a equipe de firmware |
| 3.12 | Motores com encoders: velocidade | `motor 0.3 0.3 2000`, `motor 0.5 0.5 2000`, `motor 0.7 0.7 2000` | Pulsos/s crescem com a potência, e as duas rodas ficam parecidas (anote a diferença). **Não passe de 0.7** (aviso abaixo) |
| 3.13 | DIP switch | `dip`, em cada combinação | Vias 1/2: abertas = 4x4, só a 1 = 8x4, só a 2 = 12x4, as duas = "combinação reservada". Via 3: canto de partida |
| 3.14 | Botão, LEDs e buzzer | `botao`, `led pronto`, `led erro`, `led apagar`, `buzzer` | Cada toque aparece como "pressionado"/"solto"; os LEDs e o buzzer acionam |
| 3.15 | Bluetooth: transmissão | `ble 60`, e no PC a ponte com `--print-only` (pasta `bridge/`) | As mensagens chegam na ponte com o `n` de 0 até o fim, sem faltar nenhum |
| 3.16 | Verificação geral | `verificar` | Todos os itens com `[ OK ]` |

### Sobre os motores (3.9 a 3.12)

> ⚠️ **Robô sempre suspenso, com as rodas fora da mesa.** A potência do comando `motor` é uma fração da tensão da bateria. Com a 2S cheia (8,4 V), `1` aplica 8,4 V nos motores N20, que são de **6 V**. Até `0.7` (cerca de 5,9 V), eles ficam na tensão nominal. Comece por `0.3`, use no máximo 2 s por comando e não passe de `0.7`. O próprio comando avisa acima disso.

### Sentido da roda esquerda (3.9 e 3.10)

Os motores N20 são montados espelhados e o chicote é igual nos dois lados. Por isso o firmware **inverte a roda esquerda**, tanto no acionamento do motor quanto na contagem do encoder (decisão do hardware, #394). As constantes ficam em `include/adapters/BoardPins.hpp`:

| Constante | Padrão | O que inverte |
|:--|:--|:--|
| `kInvertLeftMotor` | `true` | o acionamento do motor esquerdo |
| `kInvertLeftEncoder` | `true` | a contagem do encoder esquerdo |

Como saber se o padrão está certo no chassi: rode `motor 0.5 0.5` (robô suspenso) e `enc`. As duas rodas têm que girar **para frente** e os dois encoders têm que contar **positivo**.

Se algo vier ao contrário, o comando **`inverter motor`** (ou **`inverter enc`**) inverte aquele lado **na hora, sem recompilar**, e `inverter` sozinho mostra o estado. Vale até reiniciar a placa. Quando achar a combinação certa, anote e peça à equipe de firmware para ajustar a constante correspondente.

### Sobre os ToF (3.3 a 3.5)

Hoje a leitura dos VL53L1X ainda está em *stub* no firmware: o `tof` avisa isso e devolve 9999. Enquanto o driver não entra:
- o **3.3 já pode ser feito**, porque testa a fiação e os sensores, sem depender do driver;
- o 3.4 e o 3.5 ficam para quando o driver entrar (#295). Basta baixar o binário novo e repetir.

### Sobre o buzzer (3.14)

O buzzer da placa final é **passivo**, ligado por um **BC547 (NPN)**: ele precisa de um tom, e o nível alto no pino liga o transistor (decisão do hardware, #392). O firmware toca os três padrões do robô, e o comando `buzzer` os reproduz:

| Comando | O que toca | Requisito |
|:--|:--|:--|
| `buzzer pronto` | 2 bips de 1,3 kHz | RF-32 |
| `buzzer objetivo` | 3 tons que sobem (1,2, 1,35 e 1,5 kHz) | RF-8 |
| `buzzer alarme` | 3 bips de 1,8 kHz, e depois silêncio | RF-9 e RF-55 |
| `buzzer [ms]` | um tom de 1,2 kHz (a ressonância do transdutor) por `ms` (padrão 300) | |

O que conferir: o buzzer fica **silencioso ao ligar a placa** e depois de cada padrão, e os três padrões se distinguem de ouvido. Os motores não são afetados: o PWM do buzzer usa um timer do LEDC só dele, e o dos motores segue a 20 kHz.

### Na bancada com a ESP32 clássica

O mapa de pinos é outro (`pinos` mostra qual). Ele vale só para testar os módulos na protoboard, antes da placa oficial.

## Problemas comuns

| Sintoma | O que conferir |
|:--|:--|
| `i2c` não encontra nada, ou encontra só às vezes | 3V3 e GND dos módulos; SDA e SCL trocados; **pull-ups** no SDA e no SCL. O firmware usa só os internos do ESP32 (~45 kΩ), fracos para 400 kHz com 5 dispositivos. O `4.3` não prevê pull-ups externos. Muitos módulos já trazem os seus: confira os resistores de cada módulo |
| `WHO_AM_I` fora de `0x68` e `0x70` a `0x73` | O módulo é de outra família ou não respondeu direito (`0x00` e `0xFF` indicam barramento sem dispositivo). Avise a equipe de firmware |
| Algo responde em `0x29` com todos os XSHUT em 0 | Um XSHUT está solto ou ligado direto ao 3V3 |
| Encoder conta negativo para frente | `inverter enc` (só vale até reiniciar) e depois ajustar `kInvertLeftEncoder`. Se for o direito, inverter A e B do encoder ou os fios do motor |
| O console não responde | Porta errada (use a **UART** na S3); baud diferente de 115200; aperte o RST |
| Uma roda gira ao contrário no `motor 0.5 0.5` | `inverter motor` e depois ajustar `kInvertLeftMotor`. Se for a direita, inverter os fios do motor |
| A placa reinicia sozinha durante o `motor` | Queda de tensão: alimente os motores pela bateria, não só pelo USB |
| O buzzer só dá um clique, sem tom | O buzzer é **ativo** (tem oscilador interno). O firmware precisa de um **passivo** (#392) |
| O buzzer fica ligado direto, desde o boot | O transistor é um PNP no lugar do BC547 (NPN), que é o do esquemático. Se for mesmo PNP, troque `kBuzzerActiveHigh` para `false` em `BoardPins.hpp` |

## Para quem mexe no código

Para compilar e gravar localmente, com o ESP-IDF 5.3 instalado (ver `GUIA_DESENVOLVIMENTO.md`):

```bash
idf.py -C esp32-diagnostico set-target esp32s3   # ou esp32, para a bancada
idf.py -C esp32-diagnostico build
idf.py -C esp32-diagnostico -p /dev/ttyUSB0 flash monitor
```

Os comandos ficam em `esp32-diagnostico/main/diagnostico.cpp`. Um comando novo é uma função `int cmdX(int argc, char** argv)` mais uma linha na tabela `kCommands`.
