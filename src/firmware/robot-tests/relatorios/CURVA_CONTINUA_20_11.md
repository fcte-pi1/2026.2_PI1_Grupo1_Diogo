# Curva contínua (arco sem parar) — resultados de 20/11/2026

Comando de teste: `curvac d|e [N]` (anda N células e vira na última sem parar); teste `E16a` (direita) e `E16b` (esquerda).
Firmware: `e870e67` (curva contínua), `8457f35`, `7431b4f`, `775ac49`, `05c5edf` (comando `giroang`). Chaves novas do calib: `curva_continua` (0/1), `antecipa_arco` (mm).

## Rodadas do E16a (curva à direita, labirinto serpentina)

| # | Firmware | Giro (giroscópio) | Fim | Observação do operador |
|---|----------|-------------------|-----|------------------------|
| 1 | e870e67 | -55,8 (travou) | desfazer sem progresso, robô torto -49 | chassi bateu no canto superior esquerdo |
| 2 | 8457f35 | -105,6 | E=66 (~38 mm fora do centro), rumo -11 | passou, quase reto, sem bater |
| 3 | 7431b4f | -89,1 | E=43 (~15 mm fora) | sem bater, traseira inclinada |
| 4 | 775ac49 | -89,6 | E=28 (centro) | sem bater, traseira inclinada |
| 5 | 775ac49, escala 1,01 | -90,2 | E=49 | "está bom", reto |
| 6 | escala 1,00 | -88,9 | E=58 (~30 mm fora) | melhor, mas longe da parede esquerda |
| 7 | escala 1,00, antecipa 12 | -83,1 (rumo inicial -4,6) | E=54 | raspou levemente a parede direita da célula de partida; longe da parede esquerda |

## O que mudou e por quê
1. Entrada do arco a 80 mm/s (a 132 mm/s o giro foi 2/3 do planejado) e giroscópio mandando no arco (sem a sincronia das rodas brigando).
2. O arco para pelo giroscópio; a saída é uma reta normal (rumo + paredes).
3. Soma do giro que sobra ao frear o arco (sem isso a reta de saída parte achando que está reta).
4. Filtro de leitura brusca de bateria (o INA219 leu 6,11 V com 7,98 V no cellmeter).
5. **`escala_giro` 1,08 -> 1,00.** Medida com `giroang`: 90 graus à mão deram 97,1; duas voltas completas (720) deram 771,6 (relação 1,072). Com 1,08 o robô girava só ~83 graus quando o giroscópio marcava 90.

## Geometria do desvio lateral na saída
O desvio da saída em relação ao centro da célula é igual a `antecipa_arco` mais o erro da posição de partida (F lido contra o ideal ~166 mm). O raio não muda isso. O modelo (domain/ArcClearance) dá a folga contra a quina: 12 mm com antecipa 16, ~9 mm com 12, ~5 mm com 8. Cada 4 mm de desvio a menos custa 3-4 mm de folga.

## Pendências
- O rumo no início do arco variou de -4,6 a +3 graus: a centralização na aproximação (70 mm) oscila, e o ToF direito perto da parede (D < 25 mm) é instável (hardware, segunda-feira). A rodada 7 raspou a parede direita da célula de partida por isso.
- Falta o E16b (curva à esquerda), testar numa corrida da serpentina e calibrar de novo os freios do arco e do pivô com a escala nova do giroscópio.
- `calib`: o padrão do firmware ainda é `escala_giro=1.08` e `antecipa_arco=16`; o robô está com 1.00 e 12. Decidir antes de mudar o padrão.
