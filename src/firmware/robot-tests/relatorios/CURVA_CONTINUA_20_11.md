# Curva contínua (arco sem parar) — resultados de 20/11/2026

Comando de teste: `curvac d|e [N]` (anda N células e vira na última sem parar); teste `E16a` (direita) e `E16b` (esquerda).
Firmware: `9e42532` (curva contínua), `1796c62`, `b8eb419`, `1ac31ae`, `110187a` (comando `giroang`). Chaves novas do calib: `curva_continua` (0/1), `antecipa_arco` (mm).

## Rodadas do E16a (curva à direita, labirinto serpentina)

| # | Firmware | Giro (giroscópio) | Fim | Observação do operador |
|---|----------|-------------------|-----|------------------------|
| 1 | 9e42532 | -55,8 (travou) | desfazer sem progresso, robô torto -49 | chassi bateu no canto superior esquerdo |
| 2 | 1796c62 | -105,6 | E=66 (~38 mm fora do centro), rumo -11 | passou, quase reto, sem bater |
| 3 | b8eb419 | -89,1 | E=43 (~15 mm fora) | sem bater, traseira inclinada |
| 4 | 1ac31ae | -89,6 | E=28 (centro) | sem bater, traseira inclinada |
| 5 | 1ac31ae, escala 1,01 | -90,2 | E=49 | "está bom", reto |
| 6 | escala 1,00 | -88,9 | E=58 (~30 mm fora) | melhor, mas longe da parede esquerda |
| 7 | escala 1,00, antecipa 12 | -83,1 (rumo inicial -4,6) | E=54 | raspou levemente a parede direita da célula de partida; longe da parede esquerda |
| 8 | escala 1,00, antecipa 12, partida F=163 | -88,4 | E=40 (~6 mm fora) | não bateu, mais centralizado (E16a PASSOU) |
| 9 | idem, partida F=175 E=44 | -89,2 | E=53 (~20 mm fora) | não bateu |

### Duas curvas à direita em sequência (rodada 9 + `virar d`)
A 1ª pela curva contínua; a 2ª, na célula de saída (com parede à frente e sem espaço para a aproximação), pela curva parada com recuo: recuou 51 + 15 mm, arco de -88,9 graus sem 2ª tentativa, ajuste fino de -1,1; fim E=22 (11 mm perto da parede esquerda). Operador: "ficou bom", frente levemente inclinada à direita; no comando de teste o robô fica fora do centro depois da `volta ao centro` de 90 mm (isso é só do teste: na corrida o Navigator anda o resto até o centro da célula seguinte).

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


## Corridas da serpentina à noite (SERPENTINAS 5 a 20) e estado no fim do dia

Melhores corridas: SERPENTINA-18 (7 passos, 12 células, parou a 2 células do objetivo) e SERPENTINA-20 (igual). As 5 primeiras curvas e a
curva contínua do passo 6 passam; a falha que sobra é a **curva à esquerda do passo 7**, em (l2,c3).

### Achados (por ordem de importância)
1. **Roda direita presa depois da curva à direita (SERPENTINAS 6, 9, 14):** o recuo fixo de 105 mm (valor do arco com parede à frente) deixava a
   saída 15 mm para dentro, a roda de dentro a ~6 mm da parede e ela prendia na quina. Com recuo de 90 mm (célula sem parede à frente) passou
   (SERPENTINAS 15 a 20). Calib `recuo_sem_parede`.
2. **Curva à esquerda sem janela (SERPENTINAS 7, 15, 17, 18, 19, 20):** o cabo da bateria está do lado de dentro dela. Com o alvo frontal de 99 mm
   o arco trava a 38° (parede da frente), com 105 a 47°, com 111 a 55° (quina de dentro) e com 117 a 67° (quina). Não há janela segura com
   a variação da posição de partida (3 a 6 mm). Resolve com o cabo reposicionado (segunda-feira) ou outro tipo de curva à esquerda.
3. **Segunda metade do labirinto sem referência lateral:** as paredes ficam a 400-600 mm, a estimativa lateral só usa paredes a menos de 90 mm
   (`pose lateral: sem estimativa`, `termo = 0`). O desvio de cada curva (15-40 mm) e o rumo residual (1-4°) se acumulam e a curva seguinte trava
   (SERPENTINA-19, passo 4). Solução de fundo: localização pelo mapa com as paredes distantes (não feita).
4. **Escala do giroscópio** 1,08 -> 1,00 (duas voltas completas deram 771,6 graus para 720). Os freios do arco e do pivô foram calibrados com a
   escala antiga e podem precisar de novo ajuste.
5. **Bateria:** o INA219 do robô lê 6,0 a 6,6 V com o cellmeter em 7,85 a 8,18 V (diferença de ~1,7 V, cresceu ao longo do dia e voltou a subir
   com o robô parado). A proteção de bateria fraca (6,6 V) parava corridas com a bateria boa. Hoje: `calib bateria_minima=5.5`. ACHADO PARA A
   EQUIPE DE ENERGIA: mau contato ou componente que esquenta no caminho da alimentação, ou o INA219 lendo errado.
6. **Deriva para a direita na reta (SERPENTINAS 10, 11, 12):** -10° em ~230 mm com pulsos iguais nas duas rodas e V máx. da direita ~2x a da
   esquerda; não reproduziu depois (13 a 20). Suspeita: poeira de MDF ou desgaste do pneu direito. Conferir pneus na segunda-feira.
7. **Desfazer do arco** (2,8/1,6 V, 2,4 s): voltou de ~38-48° a 4° nas SERPENTINAS 18, 19 e 20; com 1,6 s faltaram ~4°.

### Estado do robô e do firmware
Firmware `534a34a` (51 chaves no calib, `calib10`): curva contínua, recuo de 90 mm sem parede à frente, desfazer suave, logs novos da curva
(ToF antes do recuo, caminho e tensão de cada roda, ToF no travamento). Calib em uso: eixo_ate_frente=100 eixo_ate_tof_frente=98
largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1 ganho_rumo=1.0 ganho_parede=3 max_parede=50 escala_giro=1.00 antecipa_arco=12
arco_esq_atraso=-14 bateria_minima=5.5. E0 passa.

### Próximos passos
1. Reposicionar o cabo da bateria e conferir o pneu direito e o caminho de alimentação (segunda-feira, hardware).
2. Localização pelo mapa com as paredes distantes (segunda metade do labirinto).
3. Curva à esquerda: outro modo (uma roda, `modo_curva`) ou raio maior, depois do cabo reposicionado.
4. Recalibrar `freio_arco` e `freio_pivo` com a escala nova do giroscópio.


## Fim da noite de 20/11: curva à esquerda do passo 7 (SERPENTINAS 21 a 26)

Firmware `5c3f5d4` (calib12, 54 chaves). Calib em uso: eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 centralizar=1
ganho_rumo=1.0 ganho_parede=3 max_parede=22 escala_giro=1.00 antecipa_arco=12 folga_arco=18 arco_esq_atraso=-14 giro_aberto=1 freio_pivo=4
desfazer_tensao_fora=3.6 desfazer_tensao_dentro=2.2 rumo_max_lateral=8 ajuste_fino_min=0.4 bateria_minima=5.5.

Resultado: passos 1 a 6 passam (inclusive a curva à direita que travava a 48-53° e agora recupera pelo desfazer + 2a tentativa); o giro no lugar em célula
aberta (novo) fecha em 86-89° e o ajuste fino depois dele leva a ~90°. A falha que sobra é a **reta depois do giro do passo 7**, em (l2,c3):
- o giro é feito a -36 mm do centro (o mais perto que a parede da frente permite: o nariz precisa de 115 mm de raio, a parede está a 84 do centro);
- esse desvio é maior que a folga lateral de 28 mm (corredor de 168 menos 112 do robô), e ao sair uma lateral encosta na ponta da parede do corredor: as rodas
  andam quase iguais (diferença de 2 mm) e o giroscópio marca +10° em ~42-67 mm = robô arrastado, não correção que passa do limite;
- `max_parede` 22/35/50 não muda o resultado.

Opções para continuar (decisão de projeto, não de calib):
1. Sair do giro com um deslocamento lateral antes de avançar (recuar na diagonal ou uma ré curta com o rumo desviado) para entrar no corredor dentro dos 28 mm.
2. Fazer a curva por outro caminho nessa célula: uma roda (`modo_curva=1`, que precisa de recuo e termina 19 mm deslocado) ou um arco de raio maior.
3. Hardware (segunda-feira): reposicionar o cabo da bateria (tira ~10 mm do lado esquerdo) e conferir a largura/folga do robô.
Também pendentes: localização lateral pelas paredes distantes (segunda metade do labirinto) e proteção de bateria (INA219 lê ~1,7 V abaixo do cellmeter).

## Nota de 21/11: a explicação do passo 7 estava incompleta

A seção acima diz que o giro do passo 7 falha porque "esse desvio é maior que a folga lateral de 28 mm". O número está certo, mas
a conclusão que ele sugere (girar mais perto do centro) não resolve: mais perto do centro o nariz bate na parede da frente, mais
longe a lateral bate no **poste do canto**, que o modelo do giro no lugar (`domain/PivotClearance`) não tinha. Com os postes, o giro
simples de 90 graus não cabe em posição nenhuma com este robô (folga de -8 mm na melhor posição). A mesma causa explica o arco à
direita que trava em (l0,c1): o giro à esquerda do passo 4 deixa o robô 26 mm à esquerda, e a correção pela parede, no teto, não
o traz de volta. Análise completa e correção (curva em S, `domain/CellTurn`): `auditoria/AUDITORIA-2026-11-21.md` na raiz do
repositório. O texto acima foi mantido como estava.
