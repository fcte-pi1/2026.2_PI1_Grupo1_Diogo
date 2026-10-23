# Testes de hardware com o firmware de diagnóstico

Roteiro para testar **cada componente do robô separadamente**, com o mesmo código que o robô usa. Os testes seguem a tabela do documento `7.3 - Testes de hardware` (IDs 3.1 a 3.16).

> **Público:** equipe de eletrônica e hardware. Não é preciso instalar o ESP-IDF nem compilar nada. Basta o **Chrome ou o Edge** e um **cabo USB de dados**.

## Como funciona

O firmware de diagnóstico (`esp32-diagnostico/`) abre um console na serial. Nele, cada comando testa um componente: `i2c`, `tof`, `imu`, `ina`, `motor`, `enc`, `dip`, `botao`, `led`, `buzzer`, `ble` e `taxa`.

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
| 3.6 | IMU: identificação | `imu 1` | `WHO_AM_I = 0x68 (MPU-6050 OK)` |
| 3.7 | IMU: calibração do giro | `imu 10` parado; depois `imu 5` girando 90° à mão | Parado: a média do giro perto de 0 (anote o desvio). Girando: ângulo final perto de ±90° |
| 3.8 | INA219: leitura e calibração | `ina 10`, com o multímetro em paralelo (tensão) e em série (corrente) | Tensão com erro de até ±0,05 V e corrente até ±10 mA em relação ao multímetro |
| 3.9 | Motores: acionamento básico | `motor 0.5 0.5`, `motor -0.5 -0.5`, `motor 0.5 -0.5` | As duas rodas para frente, para trás, e girando em sentidos opostos. **Robô suspenso, com as rodas fora da mesa** |
| 3.10 | Encoders: sentido | `motor 0.5 0.5` | Os dois encoders contam **positivo** para frente |
| 3.11 | Encoders: pulsos por volta | `enc zerar`, girar a roda **uma volta** à mão, `enc 1` | O valor de cada roda. O firmware usa **280**: se der outro, avise a equipe de firmware |
| 3.12 | Motores com encoders: velocidade | `motor 0.3 0.3 2000`, `motor 0.5 0.5 2000`, `motor 0.7 0.7 2000` | Pulsos/s crescem com a potência, e as duas rodas ficam parecidas (anote a diferença). **Não passe de 0.7** (aviso abaixo) |
| 3.13 | DIP switch | `dip`, em cada combinação | Vias 1/2: abertas = 4x4, só a 1 = 8x4, só a 2 = 12x4, as duas = "combinação reservada". Via 3: canto de partida |
| 3.14 | Botão, LEDs e buzzer | `botao`, `led pronto`, `led erro`, `led apagar`, `buzzer` | Cada toque aparece como "pressionado"/"solto"; os LEDs e o buzzer acionam |
| 3.15 | Bluetooth: transmissão | `ble 60`, e no PC a ponte com `--print-only` (pasta `bridge/`) | As mensagens chegam na ponte com o `n` de 0 até o fim, sem faltar nenhum |
| 3.16 | Verificação geral | `verificar` | Todos os itens com `[ OK ]` |

### Sobre os motores (3.9 a 3.12)

> ⚠️ **Robô sempre suspenso, com as rodas fora da mesa.** A potência do comando `motor` é uma fração da tensão da bateria. Com a 2S cheia (8,4 V), `1` aplica 8,4 V nos motores N20, que são de **6 V**. Até `0.7` (cerca de 5,9 V), eles ficam na tensão nominal. Comece por `0.3`, use no máximo 2 s por comando e não passe de `0.7`. O próprio comando avisa acima disso.

### Sobre os ToF (3.3 a 3.5)

Hoje a leitura dos VL53L1X ainda está em *stub* no firmware: o `tof` avisa isso e devolve 9999. Enquanto o driver não entra:
- o **3.3 já pode ser feito**, porque testa a fiação e os sensores, sem depender do driver;
- o 3.4 e o 3.5 ficam para quando o driver entrar (#295). Basta baixar o binário novo e repetir.

### Na bancada com a ESP32 clássica

O mapa de pinos é outro (`pinos` mostra qual). Ele vale só para testar os módulos na protoboard, antes da placa oficial.

## Problemas comuns

| Sintoma | O que conferir |
|:--|:--|
| `i2c` não encontra nada, ou encontra só às vezes | 3V3 e GND dos módulos; SDA e SCL trocados; **pull-ups** no SDA e no SCL. O firmware usa só os internos do ESP32 (~45 kΩ), fracos para 400 kHz com 5 dispositivos. O `4.3` não prevê pull-ups externos. Muitos módulos já trazem os seus: confira os resistores de cada módulo |
| `WHO_AM_I` diferente de `0x68` | O módulo é outro modelo ou um clone (por exemplo, `0x70` é o MPU-6500). Avise a equipe de firmware |
| Algo responde em `0x29` com todos os XSHUT em 0 | Um XSHUT está solto ou ligado direto ao 3V3 |
| Encoder conta negativo para frente | Inverter A e B do encoder, ou os fios do motor |
| O console não responde | Porta errada (use a **UART** na S3); baud diferente de 115200; aperte o RST |
| A placa reinicia sozinha durante o `motor` | Queda de tensão: alimente os motores pela bateria, não só pelo USB |

## Para quem mexe no código

Para compilar e gravar localmente, com o ESP-IDF 5.3 instalado (ver `GUIA_DESENVOLVIMENTO.md`):

```bash
idf.py -C esp32-diagnostico set-target esp32s3   # ou esp32, para a bancada
idf.py -C esp32-diagnostico build
idf.py -C esp32-diagnostico -p /dev/ttyUSB0 flash monitor
```

Os comandos ficam em `esp32-diagnostico/main/diagnostico.cpp`. Um comando novo é uma função `int cmdX(int argc, char** argv)` mais uma linha na tabela `kCommands`.
