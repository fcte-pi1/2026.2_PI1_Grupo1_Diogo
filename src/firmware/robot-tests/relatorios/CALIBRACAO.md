# Diário de calibração na pista

Uma linha por mudança de `calib` ou por teste que decide um valor. Roteiro e prioridades: `AJUSTES_FINAIS.md`.

- **Firmware:** copiar da linha de boot `main: firmware: versao ...` (cada gravação tem a sua).
- **Antes → depois:** o valor que estava e o novo. Se voltou atrás, outra linha.
- **Resultado:** o que o log mostrou (números) e o que o operador viu, separados.
- **Log:** caminho do arquivo em `robot-tests/resultados/`.

## Ponto de partida (fim de 20/11, firmware `cd15948`, calib14)

Calib em uso na SERPENTINA-29 (as 20 chaves fora do padrão):
`eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 escala_giro=1 freio_pivo=4 centralizar=1
ganho_rumo=1 ganho_parede=3 max_parede=22 folga_arco=18 antecipa_arco=12 arco_esq_atraso=-14 desfazer_tensao_fora=3.6
desfazer_tensao_dentro=2.2 ajuste_fino_min=0.4 alvo_pos_esq_mm=12 rumo_max_lateral=8 giro_aberto=1 bateria_minima=5.5`

Valores decididos antes, com a medida que os justifica:

| Chave | Valor | De onde veio |
|:--|:--|:--|
| `escala_giro` | 1,00 | `giroang`: duas voltas à mão (720 graus) deram 771,6 (20/11); com 1,08 o robô girava ~83 graus quando marcava 90 |
| `eixo_ate_frente` / `eixo_ate_tof_frente` | 100 / 98 | medida do robô montado, em uso nas corridas de 20/11 |
| `largura_frente` | 112 | idem (sem o cabo) |
| `tof_lado_ao_centro` | 55,5 | idem |
| `bateria_minima` | 5,5 | o INA219 às vezes lê ~1,7 V abaixo do cellmeter; limite só para os testes (operador, 20/11) |
| `alvo_lateral_dir_mm` | 0 | 10 jogou o robô na parede direita na SERPENTINA-27 |
| `max_parede` | 22 | com 50 a correção passava do limite de rumo (10 graus) na reta depois do giro (SERPENTINA-26) |
| `cabo_esq_mm` | 10 | **estimativa**, falta medir (padrão do firmware a partir de `fase1-entrega`) |

## Sessões

| Data / hora | Firmware | Chave: antes → depois | Teste | Resultado (log) | O que o operador viu | Log |
|:--|:--|:--|:--|:--|:--|:--|
| | | | | | | |
