# Fase 1 (21/11): plano e andamento

Objetivo: achar a causa das falhas da serpentina de 20/11 e deixar o firmware e o roteiro prontos para a próxima sessão na pista,
**sem gravar a placa e sem acionar o hardware**. Branch `feat/controle-motores-tensao`; início na tag `antes-fase1` (`34a7b7c`);
entrega na tag `fase1-entrega`.

## Plano e estado

| # | Etapa | Estado | Onde |
|:--|:--|:--|:--|
| 1 | Reconstruir o contexto: corridas SERPENTINA-5 a 29, calib em uso, firmware gravado | feito | `auditoria/AUDITORIA-2026-11-21.md`, seções 2 e 3 |
| 2 | Auditar as duas falhas que sobraram (passo 5 em (l0,c1), passo 7 em (l2,c3)) pelos logs | feito | idem, 4.1 e 4.2 |
| 3 | Causa raiz com modelo e números | feito: o giro no lugar ignorava os postes e não cabe em lugar nenhum | idem, 4.3; `domain/CellTurn`, teste `CellTurn.*` |
| 4 | Correção com TDD: curva em S em célula aberta, chaves no `calib` | feito | `6fbcafc`, `7c86104`, `a36cfd6` |
| 5 | Outras correções achadas no caminho (modo prova não compilava, versão no log, E0 cortado) | feito | `2f038b7`, `0a01d9e` |
| 6 | Teste da serpentina inteira no simulador (navegação) | feito | `70a98ae` |
| 7 | Verificação: host, ESP32 nos dois modos, 0 avisos | feito: 430/430, 0 avisos | auditoria, seção 6 |
| 8 | Roteiro da Fase 2 e diário de calibração | feito | `BATERIA_TESTES_21_11.md`, `CALIBRACAO.md` |
| 9 | Documentação das chaves e linhas de log novas | feito | `LOGS_E_MEDIDAS.md`, seção 6 |
| 10 | Tag `fase1-entrega` | feito | |

## Suposições (a conferir na Fase 2)

1. **Janela do robô:** não informada ("[PREENCHER]" no pedido). Suposto: a próxima sessão é segunda-feira, com o hardware como
   em 20/11 (o robô não muda até segunda).
2. **Cabo da bateria:** ~10 mm para fora na lateral esquerda, da traseira até 20 mm à frente do eixo. É estimativa
   (`cabo_esq_mm`, para medir).
3. **Labirinto:** paredes de 12 mm, postes de 12 x 12 mm em todos os cantos, corredor de 168 mm. Os postes não foram medidos
   nesta fase.
4. **Robô rígido:** o modelo trata robô e postes como retângulos. Na pista o robô escorrega, e o deslocamento medido depois do giro
   (23-26 mm) foi menor que o planejado (36 mm).
5. **Medidas do robô feitas com fita métrica e trena** (não há paquímetro): precisão de ~2-3 mm. A curva à direita aguenta esse
   erro; a da esquerda depende do cabo e do `eixo_ate_tof_frente` (`MEDICOES.md`, seção "Medidas com trena", com a tabela de sensibilidade).
6. **Tempo do plano no ESP32:** estimado em 1 a 3 s por plano (35 ms no PC com `-O2`). Não medido.

## O que fica para a pista

- Medir o cabo e conferir os planos (`BATERIA_TESTES_21_11.md` (seção 2) e `MEDICOES.md`).
- Curva em S isolada, à esquerda e à direita (etapa 2).
- Corrida completa (etapa 3) e ajuste pela tabela de prioridades (etapa 4).
- Confirmar por que o giro simples às vezes passava no passo 4 (auditoria, 4.5).

## Atualização da noite de 21/11 (sessão de pista)
A pista foi feita no mesmo dia: gravado `fase1-entrega-4-g264ef77`, SERPENTINAS 30 a 50. Resultado: o robô chega ao objetivo (49 e 50 passaram; 40 a 43 também);
raspa na parede direita; recuperação automática da curva em S funciona; ToF direito caiu 2 vezes (hardware). Detalhes em `auditoria/AUDITORIA-2026-11-21.md`, seção 9.
