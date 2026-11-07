# RF-44: centralização pelas paredes laterais

Proposta para revisão, de 07/11/2026. A implementação está atrás da opção `RATO_CENTRALIZAR_PAREDES` do Kconfig, **desligada por padrão**: sem ligar a opção, o `advanceCell` faz exatamente o que fazia antes.

## Problema

Hoje o `advanceCell` anda só pelos encoders. O erro do controle de reta é a diferença acumulada de pulsos (esquerda − direita) desde o começo da célula, e os encoders são zerados a cada célula. Isso gera dois efeitos:

1. **Sobra de rumo por célula.** Com controle só P, o erro estabiliza em `correção / kp` pulsos. Na simulação do host (`StraightLineSimulationTest`), com rodas 25% diferentes e kp = 0,005, sobram ~13 pulsos por célula. Isso dá ~5 mm de caminho a mais numa roda, ou ~3° de rumo. Como o erro zera a cada célula, esses ~3° se somam a cada célula, e depois de 4 ou 5 células seguidas o robô encosta na parede.
2. **Posição lateral.** Os encoders não sabem onde o robô está entre as paredes. Uma curva imperfeita, ou uma partida torta, nunca é corrigida.

Só uma referência externa resolve isso: as paredes, lidas pelos ToF laterais.

## Proposta

### Sinal

A cada leitura nova dos ToF laterais (uma a cada ~50 ms, no modo contínuo atual), calcula-se o **deslocamento lateral** em mm, positivo quando o robô está mais perto da parede direita:

| Paredes utilizáveis | Deslocamento                         | Observação                                     |
| ------------------- | ------------------------------------ | ---------------------------------------------- |
| as duas             | `(E − D) / 2`                        | não depende de calibrar o centro               |
| só a esquerda       | `E − centro`                         | `centro` = leitura lateral com o robô centrado |
| só a direita        | `centro − D`                         |                                                |
| nenhuma             | termo = 0, só encoders               | como hoje                                      |

O termo de parede é `ganho × deslocamento`, em **pulsos equivalentes**, limitado a `±máximo`, e **somado ao erro dos encoders** antes do `MotionController`:

```text
erro = (pulsos_E − pulsos_D) + clamp(ganho_parede × deslocamento_mm, ±máximo)
```

O sinal é o mesmo do erro dos encoders: positivo acelera a roda direita e vira o robô para a esquerda. O teste `WallCentering.SignMatchesTheStraightController` amarra isso.

A função é pura (`domain/WallCentering`), testada no host. O adaptador só lê os ToF e soma o termo.

### Quando uma parede vale

Um lado só entra no cálculo se:

- a leitura for **medida de distância** (`ReadingKind::Distance`). "Sem alvo" e falha (inclusive SigmaFail e WrapTargetFail) **não** entram: o lado é tratado como "sem parede", e o controle segue pelos encoders e pelo outro lado;
- a distância for **menor que `useBelowMm`** (90 mm, o limiar de parede). Acima disso, o sensor está vendo a parede da célula vizinha ou o fim de uma parede, e a distância não diz nada sobre a posição na célula.

A leitura desconhecida nunca vira "parede no centro" nem "parede encostada". Ela simplesmente sai da conta.

### Leitura durante o movimento

No `advanceCell`, a cada ~10 ms, o adaptador pergunta aos dois ToF laterais se há medida nova (`freshReading`, que só lê se o sensor tiver dado pronto). A última leitura de cada lado fica guardada durante a célula e é descartada no começo da próxima. O frontal não é lido aqui.

Isso consome as medidas dos laterais durante o movimento. O `sense()` do fim da célula continua descartando a medida pronta e esperando uma nova, então o comportamento dele não muda. O descarte de medida do `sense()` está pendente de propósito e não foi mexido.

Custo: duas leituras de `GPIO__TIO_HV_STATUS` (~0,15 ms cada a 400 kHz) a cada 10 ms, e a leitura do resultado a cada ~50 ms.

### Ganhos iniciais (não calibrados)

Em `RobotParameters.hpp` (`kWallCentering`):

| Parâmetro         | Valor          | Por quê                                                                                                                                                                            |
| ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `centerMm`        | 35 mm          | (180 − 12 de parede − 100 de robô) / 2 ≈ 34 mm. **Medir:** robô centrado numa célula com as duas paredes, `tof 20`, média de E e D.                                                 |
| `useBelowMm`      | 90 mm          | o limiar de parede atual                                                                                                                                                          |
| `gainPulsesPerMm` | 0,5            | 10 mm fora do centro = 5 pulsos = correção 0,025 com kp 0,005. Um quarto do que a sobra dos encoders pede (~13 pulsos), para começar sem brigar com os encoders.                 |
| `maxPulses`       | 15             | 15 × 0,005 = correção 0,075, menos da metade do limite de 0,20: a parede sozinha nunca satura o controle (teste `RobotConfigCannotSaturateTheStraightControlAlone`).             |

### Riscos conhecidos

- **Só proporcional na posição.** A posição lateral é a integral do rumo, então P puro na posição tende a oscilar (o robô "serpenteia"). Com o ganho baixo e o limite, a oscilação deve ser lenta e pequena numa célula de 180 mm. Se aparecer, o próximo passo é um termo derivativo na posição lateral (a diferença entre duas leituras de 50 ms), filtrado.
- **Encoders e paredes podem discordar.** Se o robô começou a célula torto, o termo dos encoders tenta manter o rumo torto e o das paredes tenta centralizar. O equilíbrio fica entre os dois. Isso é aceitável numa primeira versão. Uma versão seguinte pode zerar o acumulado dos encoders quando as duas paredes estão visíveis.
- **Postes e fim de parede.** Ao passar de uma célula com parede para uma sem, a leitura salta. O corte em `useBelowMm` tira a maior parte desse efeito. Se aparecerem "trancos" no fim das células, vale ignorar saltos maiores que ~30 mm entre leituras seguidas.
- **Taxa de 20 Hz.** Com ~0,5 s por célula, são ~10 leituras por célula. É pouco para corrigir rápido, mas basta para não acumular desvio entre células.

## Testes

**No host (já existem):** `test/domain/WallCenteringTest.cpp`

- centrado entre duas paredes dá 0, mesmo com `centerMm` errado;
- mais perto da parede direita dá termo positivo (e o contrário);
- uma parede só compara com o centro;
- nenhuma parede, parede longe, leitura inválida: termo 0;
- limite do termo;
- o sinal fecha com o `MotionController` (a roda direita acelera);
- os valores do robô não saturam o controle sozinhos.

**Na pista (roteiro sugerido, depois da calibração do kp):**

1. Medir `centerMm` (acima).
2. Compilar com `RATO_CENTRALIZAR_PAREDES` e `RATO_LOG_RETA` ligados.
3. Corredor reto de 3 a 4 células com as duas paredes. Largar o robô **5 a 10 mm fora do centro**, alinhado. Esperado: chega ao fim sem encostar, e o erro final da linha `reta` não cresce de célula para célula.
4. O mesmo com **uma parede só** (tirar a parede direita): confere o `centerMm`.
5. O mesmo **sem paredes** laterais: tem que se comportar como com a opção desligada.
6. Largar **torto** (~5°): ver se corrige sem serpentear. Se serpentear, baixar `gainPulsesPerMm` para 0,25. Se demorar demais, subir para 1,0.
7. Só depois, uma corrida completa no 4×4.

## Fora do escopo

- Alinhar pela parede da frente ao parar (o "frontal lê ~40 a 50 mm a mais" ainda precisa da calibração do limiar, #209).
- Usar o giroscópio na reta.
