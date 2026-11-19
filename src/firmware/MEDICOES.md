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
| margem de cabos à frente | não está no CAD | 12 (proposta) | `cabo_frente_mm` | pegada (<= 165 mm) |
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
