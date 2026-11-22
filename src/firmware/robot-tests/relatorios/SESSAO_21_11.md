# Resumo compacto da sessão de 20 e 21/11/2026 (SERPENTINAS 5 a 54)

Para quem assume o projeto: este arquivo conta **o que foi tentado, o que funcionou, o que foi retirado e por quê**. O estado atual e as tarefas estão em
`PASSAGEM_CALIBRACAO.md`; os números e as hipóteses, em `auditoria/AUDITORIA-2026-11-21.md`; o diário de cada ajuste, em `CALIBRACAO.md`.

## 1. O pedido e o robô
Firmware do micromouse "Rato Borrachudo" (ESP32-S3, ESP-IDF 5.3, C++17, arquitetura limpa). Objetivo: completar o labirinto **serpentina 4x4**
(largada (l3,c0) virado ao norte, via 3 aberta, objetivo (l0,c3)). O operador é da equipe de software; os testes foram feitos no robô real pela ponte BLE
(`robot-tests/ponte.py`, `t.py`). Medidas do robô feitas com **fita métrica e trena** (não há paquímetro): frente 100 mm (ToF 98), largura 112, cabo da bateria ~10 mm
na lateral **esquerda**.

## 2. Linha do tempo
**20/11 (SERPENTINAS 5 a 29):** curva contínua (arco sem parar dentro da reta), ré contínua, desfazer suave, `calib` com 51 a 56 chaves para ajustar sem regravar.
Nenhuma chegou ao objetivo. As falhas sobraram em dois pontos: o arco à direita de (l0,c1) (passo 5) e a reta depois do giro no lugar à esquerda de (l2,c3) (passo 7).
Um commit explicou o passo 7 como "desvio maior que a folga lateral" (28 mm); **essa explicação estava incompleta** (nota de retratação em `CURVA_CONTINUA_20_11.md`).

**21/11, manhã (Fase 1, sem robô):** auditoria dos logs e modelo geométrico. **Causa raiz:** o modelo do giro no lugar (`domain/PivotClearance`) trata as paredes como retas infinitas e
**ignora os postes dos cantos** (12x12 mm); com os postes e o cabo, o giro simples de 90° **não cabe em posição nenhuma** (folga de -8 mm). Criada a **curva em S**
(`domain/CellTurn`): gira (90 - beta) graus, anda na diagonal e completa; o plano é conferido contra paredes, postes e cabo. Commits `c94a204`, `c97f13d`, `520008e`, `c399f89`, `c463bec`, `507c955`.

**21/11, noite (Fase 2, pista):**
1. Gravado o firmware; o cálculo dos 4 planos da curva em S levou **8 a 12 s cada** no ESP32 (estimei 1 a 3 s).
2. Medidas com trena: eixo->sensor frontal = 92 mm perto da parede (96,5 a 229 mm); o ToF **lê ~4,5 mm a mais perto da parede**. `eixo_ate_tof_frente` 98 -> 92 -> 88 (o melhor medido na pista; 84 travou o S).
3. Retas dentro de ±8 mm com `max_parede` 22 -> 35 (22 deixava o robô 14 a 22 mm à direita; 50 abortava por rumo perdido).
4. A 1ª curva em S travou em ~1 de cada 4 vezes sem padrão (bateria, frontal, avanço, posição). Implementada a **2ª tentativa** (`540f6b0`): gira de volta, desloca o eixo meia `ajuste_2a_tentativa` e repete.
5. A diagonal do S aborta com "rumo perdido 10,1°" por toque leve na parede: limite da diagonal subiu para 18° (`4f80eec`).
6. **ToF direito caiu sozinho** (voltou ao endereço 0x29: a alimentação do módulo piscou); `tofrec` recupera. Suspeitei do cálculo dos planos e **estava errada**: caiu com o robô parado, sem cálculo.
7. **Motor direito com arrasto intermitente** (corrida 51: 7,2 V contra 3,1 V na ré; depois de limpar os motores, 3,5 / 3,5 V). Teste de 10 giros em piso livre mostrou as rodas simétricas; 5 retas em malha aberta deram deriva de -4 a +15 mm (ruído de posicionar à mão).
8. Ajustes de calib (`alvo_lateral_dir_mm` -8, `alvo_pos_esq_mm` 0, `curva_dir_fora` 8, `ajuste_2a_tentativa` 24) levaram a 4 corridas seguidas (40 a 43) e depois a 49, 50, 52, 53.
9. **Não funcionou:** `curva_continua=0` (46 a 48: 0 de 3), `curva_dir_fora=16` (54: pior), `eixo_ate_tof_frente=84`.

## 3. O que o robô faz hoje
Completa a serpentina em ~52 s (7 passos, giros de 88 a 89°) e **ainda raspa na parede direita** na saída dos arcos à direita e da curva em S (sensor direito em 0 mm; estimativa lateral de 20 a 35 mm à direita).
Ver a decisão do operador sobre o rumo (remover a curva contínua e calibrar a cada curva) em `PASSAGEM_CALIBRACAO.md`, seção 7.

## 4. Erros meus nesta sessão (para ninguém repetir)
- Estimei 1 a 3 s para o cálculo dos planos e eram 8 a 12 s por plano (~40 s de boot).
- Atribuí a falha da 32 ao valor 84 do `eixo_ate_tof_frente` sem poder separar de escorregamento da roda.
- Atribuí as quedas do ToF ao cálculo dos planos no boot; era hardware.
- A primeira gravação saiu em modo prova (sem log) porque a cópia do `sdkconfig` sumiu do diretório temporário; sempre conferir `CONFIG_RATO_LOG_RETA=y`.
- Um `pkill -f` encerrou o próprio comando do shell; usar o PID.

## 5. Todas as corridas (SERPENTINAS 5 a 54)
Fonte: `robot-tests/resultados/corridas.csv` e `logs/corridas/SERPENTINA-N/`.

| Corrida | Resultado | Passos | Tempo (s) | Curvas travadas | Posição final |
|:--|:--|:--|:--|:--|:--|
| SERPENTINA-5 | FALHA | 3 | 16.6 | 3 | l2,c0 |
| SERPENTINA-6 | FALHA | 3 | 16.1 | 0 | l2,c1 |
| SERPENTINA-7 | FALHA | 4 | 21.4 | 3 | l2,c1 |
| SERPENTINA-8 | FALHA | 1 | 6.1 | 0 | l0,c0 |
| SERPENTINA-9 | FALHA | 3 | 18.7 | 0 | l2,c1 |
| SERPENTINA-10 | FALHA | 1 | 3.1 | 0 | l2,c0 |
| SERPENTINA-11 | FALHA | 1 | 3.3 | 0 | l2,c0 |
| SERPENTINA-12 | FALHA | 1 | 3.3 | 0 | l2,c0 |
| SERPENTINA-13 | FALHA | 3 | 18.6 | 0 | l2,c1 |
| SERPENTINA-14 | FALHA | 3 | 18.7 | 0 | l2,c1 |
| SERPENTINA-15 | FALHA | 4 | 24.3 | 3 | l2,c1 |
| SERPENTINA-16 | FALHA | 4 | 26.8 | 0 | l0,c1 |
| SERPENTINA-17 | FALHA | 5 | 26.1 | 3 | l2,c1 |
| SERPENTINA-18 | FALHA | 7 | 53.8 | 5 | l1,c3 |
| SERPENTINA-19 | FALHA | 5 | 34.3 | 3 | l0,c1 |
| SERPENTINA-20 | FALHA | 7 | 55.5 | 5 | l1,c3 |
| SERPENTINA-21 | FALHA | 5 | 35.2 | 3 | l0,c1 |
| SERPENTINA-22 | FALHA | 5 | 35.2 | 3 | l0,c1 |
| SERPENTINA-23 | FALHA | 7 | 53.7 | 0 | l2,c3 |
| SERPENTINA-24 | FALHA | 7 | 55.3 | 0 | l2,c3 |
| SERPENTINA-25 | FALHA | 7 | 72.0 | 2 | l2,c3 |
| SERPENTINA-26 | FALHA | 7 | 68.1 | 0 | l2,c3 |
| SERPENTINA-27 | FALHA | 2 | 10.0 | 0 | l2,c0 |
| SERPENTINA-28 | FALHA | 5 | 41.4 | 3 | l0,c1 |
| SERPENTINA-29 | FALHA | 5 | 42.3 | 3 | l0,c1 |
| SERPENTINA-30 | SUCESSO | 7 | 52.5 | 0 | l0,c3 |
| SERPENTINA-31 | SUCESSO | 7 | 53.5 | 0 | l0,c3 |
| SERPENTINA-32 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-33b | SUCESSO | 7 | 53.6 | 0 | l0,c3 |
| SERPENTINA-34 | SUCESSO | 7 | 53.7 | 0 | l0,c3 |
| SERPENTINA-35 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-36 | SUCESSO | 7 | 51.6 | 0 | l0,c3 |
| SERPENTINA-37 | FALHA | 4 | 23.2 | 3 | l2,c1 |
| SERPENTINA-38 | SUCESSO | 7 | 53.0 | 0 | l0,c3 |
| SERPENTINA-39 | FALHA | 7 | 47.2 | 0 | l2,c3 |
| SERPENTINA-40 | SUCESSO | 7 | 52.7 | 0 | l0,c3 |
| SERPENTINA-41 | SUCESSO | 7 | 52.5 | 0 | l0,c3 |
| SERPENTINA-42 | SUCESSO | 7 | 53.3 | 0 | l0,c3 |
| SERPENTINA-43 | SUCESSO | 7 | 57.1 | 1 | l0,c3 |
| SERPENTINA-44 | FALHA | 6 | 43.6 | 0 | l2,c3 |
| SERPENTINA-45 | FALHA | 6 | 40.7 | 0 | l1,c2 |
| SERPENTINA-46 | FALHA | 6 | 43.2 | 0 | l2,c2 |
| SERPENTINA-47 | FALHA | 4 | 27.0 | 3 | l2,c1 |
| SERPENTINA-48 | FALHA | 7 | 52.1 | 3 | l2,c3 |
| SERPENTINA-49 | SUCESSO | 7 | 53.1 | 0 | l0,c3 |
| SERPENTINA-50 | SUCESSO | 7 | 52.3 | 0 | l0,c3 |
| SERPENTINA-51 | FALHA | 2 | 9.0 | 0 | l2,c0 |
| SERPENTINA-52 | SUCESSO | 7 | 51.2 | 0 | l0,c3 |
| SERPENTINA-53 | SUCESSO | 7 | 53.4 | 0 | l0,c3 |
| SERPENTINA-54 | SUCESSO | 7 | 52.8 | 0 | l0,c3 |

Corridas 44, 45 e 46 foram **paradas pelo operador** (arrasto na parede direita). A 51 falhou por arrasto do motor direito.

## 6. Regras do projeto
Português; commits Angular em português **sem `Co-Authored-By` nem `Claude-Session`**, assinados por SSH (`ssh-add` se falhar); nunca `git add -A`/`.`; nenhum `.zip` no git;
sem push nem reescrita de histórico sem pedido; não desativar componentes para um teste passar; bateria e USB nunca juntos; gravar só com a bateria fora.
