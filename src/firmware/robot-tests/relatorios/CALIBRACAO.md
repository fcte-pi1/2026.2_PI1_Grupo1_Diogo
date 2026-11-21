# Diário de calibração na pista

Uma linha por mudança de `calib` ou por teste que decide um valor. Roteiro e prioridades: `AJUSTES_FINAIS.md`.

- **Firmware:** copiar da linha de boot `main: firmware: versao ...` (cada gravação tem a sua).
- **Antes → depois:** o valor que estava e o novo. Se voltou atrás, outra linha.
- **Resultado:** o que o log mostrou (números) e o que o operador viu, separados.
- **Log:** caminho do arquivo em `robot-tests/resultados/`.
- **Medidas:** não há paquímetro; anotar o instrumento (fita métrica, trena) e o método (direto, por diferença, pelo ToF).

## Ponto de partida (fim de 20/11, firmware `cd15948`, calib14)

Calib em uso na SERPENTINA-29 (as 20 chaves fora do padrão):
`eixo_ate_frente=100 eixo_ate_tof_frente=98 largura_frente=112 tof_lado_ao_centro=55.5 escala_giro=1 freio_pivo=4 centralizar=1
ganho_rumo=1 ganho_parede=3 max_parede=22 folga_arco=18 antecipa_arco=12 arco_esq_atraso=-14 desfazer_tensao_fora=3.6
desfazer_tensao_dentro=2.2 ajuste_fino_min=0.4 alvo_pos_esq_mm=12 rumo_max_lateral=8 giro_aberto=1 bateria_minima=5.5`

Valores decididos antes, com a medida que os justifica:

| Chave | Valor | De onde veio |
|:--|:--|:--|
| `escala_giro` | 1,00 | `giroang`: duas voltas à mão (720 graus) deram 771,6 (20/11); com 1,08 o robô girava ~83 graus quando marcava 90 |
| `eixo_ate_frente` / `eixo_ate_tof_frente` | 100 / 98 | fita métrica / trena (sem paquímetro; ~2-3 mm de precisão), em uso nas corridas de 20/11 |
| `largura_frente` | 112 | idem (sem o cabo) |
| `tof_lado_ao_centro` | 55,5 | idem |
| `bateria_minima` | 5,5 | o INA219 às vezes lê ~1,7 V abaixo do cellmeter; limite só para os testes (operador, 20/11) |
| `alvo_lateral_dir_mm` | 0 | 10 jogou o robô na parede direita na SERPENTINA-27 |
| `max_parede` | 22 | com 50 a correção passava do limite de rumo (10 graus) na reta depois do giro (SERPENTINA-26) |
| `cabo_esq_mm` | 10 | **estimativa**, falta medir pela diferença entre dois anteparos (`AJUSTES_FINAIS.md`, etapa 1) |

## Sessões

| Data / hora | Firmware | Chave: antes → depois | Teste | Resultado (log) | O que o operador viu | Log |
|:--|:--|:--|:--|:--|:--|:--|
| 21/11 17:30 | g13d515a | `eixo_ate_tof_frente` 98 → 92 | virar e isolado (l2,c1) | saída centrada (E=38/D=30) em vez de 20 mm à direita; sem bater | operador: "não bateu em nada e reto" | `resultados/log_robo.txt` |
| 21/11 18:00 | g13d515a | `eixo_ate_tof_frente` 92 → 88; `max_parede` 22 → 35 | SERPENTINA-31 | passou; retas dentro de ±8 mm (antes 14-22 mm à direita) | operador: "quase bom", raspava na parede | SERPENTINA-31 |
| 21/11 18:10 | g13d515a | `alvo_pos_esq_mm` 12 → 6; `eixo_ate_tof_frente` 88 → 84 | SERPENTINA-32 | **falhou**: 1o giro da curva em S travou a 57,5° | operador: "girou 70 e disparou um erro" | SERPENTINA-32 |
| 21/11 18:30 | g13d515a | `eixo_ate_tof_frente` 84 → 88 | SERPENTINAS 33b, 34, 36 | passaram; 35 e 37 travaram na 1a curva em S (26° e 36°) | rodas limpas; ainda raspa | SERPENTINAS 33b-37 |
| 21/11 18:40 | g9336850 | recuperação da 2a tentativa (código) | SERPENTINA-38 | passou | | SERPENTINA-38 |
| 21/11 18:55 | g9336850 | `alvo_lateral_dir_mm` 0 → -4 → -8; `alvo_pos_esq_mm` 6 → 0; `curva_dir_fora` 0 → 8 | SERPENTINAS 38, 39 | 39 falhou: "rumo perdido 10,1" na diagonal do S | | SERPENTINAS 38, 39 |
| 21/11 19:05 | g264ef77 | diagonal do S tolera 18° (código) | SERPENTINAS 40-43 | **4 passaram**; a 43 usou a 2a tentativa do S (55,9° → +6 mm → 67,3°) | operador: ainda raspa na parede direita; última curva não fica a 90° | SERPENTINAS 40-43 |
| 21/11 19:25 | g264ef77 | operador parou 44 e 45 (arrastando na parede direita no passo 6) | SERPENTINAS 44, 45 | paradas pelo operador | sensores no ponto da parada: E=82 D=0 F=355 | SERPENTINAS 44, 45 |
| 21/11 19:35 | g264ef77 | `curva_continua` 1 → 0; `curva_dir_fora` 8 → 16; `ajuste_2a_tentativa` 12 → 24 | SERPENTINAS 46, 47, 48 | **0 de 3**: 46 parada; 47 travou o S (38,7° e 46,2° mesmo recuando 6 mm); 48 passou o S com +12 mm mas travou o arco parado em (l2,c2) | | SERPENTINAS 46-48 |
| 21/11 19:50 | g264ef77 | `curva_continua` 0 → 1; `curva_dir_fora` 16 → 8; `ajuste_2a_tentativa` 24 mantido | SERPENTINA-49 | **passou** (53,1 s) | operador: passou, mas voltou a arrastar na parede | SERPENTINA-49 |
