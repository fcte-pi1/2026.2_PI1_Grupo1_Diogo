# Medidas do robô e chaves do `calib` (19/11)

Guia do que medir no robô e de onde cada medida entra. Os valores ficam na memória do robô (NVS) e são
trocados pelo comando `calib` do BLE sem regravar o firmware (`calib` mostra todos; `calib padrao`
volta aos de fábrica). Referencial do CAD (`assembly.step`): origem na traseira do chassi, x para a
frente, y para a esquerda; eixo das rodas em x = 17,25 mm. Tudo em mm.

| Cota | CAD | Padrão do firmware | Chave do `calib` | Onde entra |
|:--|--:|--:|:--|:--|
| eixo até a frente do chassi | 107,25 | 87 (campo) | `eixo_ate_frente` | início do arco, pegada, curva com uma roda |
| eixo até a face do ToF frontal | 107,75 | 85 (campo) | `eixo_ate_tof_frente` | início do arco, curva com uma roda |
| largura da frente | 101,0 | 101 | `largura_frente` | início do arco, pegada |
| largura com as rodas | 108,0 | 108 | `largura_com_rodas` | pegada e folga lateral (30 mm por lado) |
| ToF lateral até o centro | 50,5 | 50,5 | `tof_lado_ao_centro` | leitura nominal lateral = 84 - 50,5 = 33,5 |
| ToF lateral à frente do eixo | 59,15 | 59,15 | `tof_lado_a_frente_do_eixo` | pose lateral: 59,15 x tan(rumo) |
| margem de cabo à frente | não existe cabo à frente | 0 | `cabo_frente_mm` | pegada (<= 165 mm) |
| bitola | 87,8 | 88 | (constante) | giro no lugar; o arco usa 74,2 (medida em 45 arcos) |
| diâmetro da roda | 32,0 | 32 | (constante) | pulsos por mm |

Outros: `escala_giro` (1,08), `freio_arco` (3,2), `freio_pivo` (10,1), `freio_uma_roda` (3,2),
`autoajuste_freio`, `parada_frente` (35), `centralizar`, `ganho_rumo`, `modo_curva` (0 = arco, 1 = uma
roda) e `preset_cad` (1 = frente do CAD). Detalhes e faixas aceitas: `LOGS_E_MEDIDAS.md`, seção 6.

## CONFLITO na frente do robô: decide o paquímetro
Três fontes divergem: **CAD** 107,75 (ToF), **.3mf impresso** 102,25 (chassi de 119,5 em vez de
124,5) e **campo** (A2: parede-eixo 127 menos F=42) ~85 a 91. Se o CAD estivesse certo, o frontal leria
~19 mm na parede (abaixo do mínimo). O firmware roda com o valor de campo (87 / 85) e avisa no boot
enquanto ele difere do CAD em mais de 10 mm. **Medir com paquímetro** o eixo até a frente do chassi, até
a face do ToF frontal e os cabos, e só então trocar o padrão. Atalho: `calib preset_cad=1`.

## Não aumentar o robô fisicamente
Com 108 mm de largura com as rodas, a folga no corredor de 168 mm é de 30 mm por lado. Aumentar o robô
reduz essa folga (e a faixa em que a curva com uma roda cabe). O firmware só atualiza o MODELO do
robô; mudar a estrutura pede conversa.

## Posição dos 3 ToF no CAD (extraída do `assembly.step` em 19/11)
Origem do CAD na traseira do chassi, x para a frente, y para a esquerda, eixo das rodas em x = 17,25. Posição da ORIGEM de cada módulo VL53L1X
(`ITEM_DEFINED_TRANSFORMATION` das instâncias VL53l1X:1, :2 e :3), z = 35,25 nos três:
| Módulo | x (CAD) | y (CAD) | Do eixo | Do centro do robô |
|:--|--:|--:|--:|--:|
| ToF esquerdo (:1) | 76,445 | +47,5 | **59,195 à frente** | 47,5 |
| ToF frontal (:2) | 122,000 | 0 | **104,75 à frente** | 0 |
| ToF direito (:3) | 76,445 | -47,5 | **59,195 à frente** | 47,5 |
O firmware usa 50,5 (= 47,5 + 3,0 até a janela do sensor) e 59,15 para os laterais, e 107,75 para a face do frontal (= 104,75 + 3,0): batem com o CAD.
Os 3 mm até a janela foram assumidos na versão anterior; confirmar com paquímetro se o módulo real tem a janela a 3 mm da origem.
Lateral: confere com o campo (84 - 50,5 = 33,5 mm; medido 33,6). Frontal: o CAD (107,75) contradiz o campo (~85): ver o conflito acima.
Não existe cabo à frente do robô (operador, 19/11): `cabo_frente_mm` = 0. O cabo vermelho e preto da bateria sai pela lateral esquerda e não entra no modelo. `preset_cad` é só um registro.

## Medidas do robô reais (20/11), lidas de fotos com uma fita métrica
Só havia a fita; as medidas foram lidas das fotos (`robot-tests/fotos/medida_*_20_11.jpg`), com incerteza de ~3 mm.
| Cota | Valor lido | Antes no `calib` | Como saiu |
|:--|--:|--:|:--|
| Comprimento do chassi (traseira até a placa da frente, foto de baixo) | ~120 mm | 17,25 + 87 = 104 | confere com o `.3mf` (119,5), não com o CAD (124,5) nem com o campo |
| Eixo até a frente do chassi | ~100 mm | 87 | 120 - 17,25 (traseira) ≈ 102; foto de cima ≈ 96-100 |
| Eixo até a janela do ToF frontal | ~98 mm | 85 | o ToF frontal lê ~13 mm A MAIS perto da parede (B3-F50: +13,1): A2 (eixo a 127 mm da parede, F=42) = janela a 127 - (42 - 13) = 98 mm. O "85" de campo estava contaminado por esse desvio |
| Distância entre as janelas dos ToF laterais | ~111 mm (±55,5 do centro) | 101 (±50,5) | foto de cima; confere com as leituras: robô centrado lê E=28 e D=27, e 28 + 27 + 111 = 166 mm de corredor (≈ 168) |
| Largura sobre as rodas | ~106 mm | 108 | foto frontal |
Conclusões: (1) o corredor de teste NÃO é de 150 mm, é de ~166-168 mm; a "largura de 150" vinha de somar 101 em vez de 111. (2) A frente do robô é ~13 mm mais longa do que o firmware supunha, e os sensores laterais são a parte mais larga (~112-114 mm, contra 108 das rodas). (3) O arco de 19/11 e de hoje (SERPENTINA-2, travou a -66 graus) partiu com a frente 13 mm mais perto da parede do que o modelo achava.
Aplicado no robô (calib): eixo_ate_frente=100, eixo_ate_tof_frente=98, largura_frente=112, tof_lado_ao_centro=55,5, largura_corredor=168 (volta ao padrão), ganho_parede=3, max_parede=50.
