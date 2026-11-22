# Para a equipe de firmware — resumo de 19/11/2026

> **ERRATA (19/11, operador, versão corrigida):** o **robô físico** (estrutura, eletrônica, energia, fiação) **não será mexido em nada até segunda-feira**.
> **O firmware PODE ser alterado**: quem opera é da equipe de software. Os pedidos de hardware às equipes valem a partir de segunda; até lá os testes usam o robô
> **fisicamente como está** (ToF direito fora do ar, cabo da bateria como está). Firmware atual gravado: 11:01:54, com `ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1`.
> Mudanças de firmware continuam exigindo a aprovação do operador antes de aplicar, e a gravação só com a bateria desligada e o USB ligado.

## Commits do dia (branch `feat/controle-motores-tensao`, todos já no repositório)
`683e2c6` ToF "muito perto" (frontal ≤ 40 mm; laterais só 0), arco recua alvo−40 | `122ce8b` arco com bitola efetiva 74,2 mm e limite de rumo da reta 10° |
`4b2cde7` desfazer do arco com progresso (`ArcUndo`) | `46553cb` testes do XSHUT e da mensagem de erro | `c833a99` docs | `2d572c9` modelo do corpo (CAD, `preset_cad`, aviso de boot) |
`cec543b` pose lateral por célula | `534ac40` curva com uma roda (`modo_curva=1`) + `SweptFootprintTest` | `53ec23d` velocidade −25% e limite de 10 min |
`13e7cfe` testes de propriedade do Flood Fill | `7cc1aaa` labirinto em pé por comando BLE `labirinto` | `16704f7` docs | `62ef8b5` toque longo do botão |
`8282d64` bloco O no `t.py`.

## Mudanças de hoje, agora COMMITADAS (aprovadas pelo operador): `2b34729` (snprintf) e `2978466` (`tof_na_reta`); docs `0110e69`
1. `include/adapters/Drv8833MotionAdapter.hpp:41` `undoFailure_[112]`→`[192]`; `src/adapters/Drv8833MotionAdapter.cpp:1267-1268` `%.0f`→`%d` com `static_cast<int>(undo.angle())` (a placa não compilava com `-Werror`).
2. Chave `calib tof_na_reta` (padrão 1; 0 = não lê ToF durante a reta): `Calibration.hpp` (campo `tofInStraight`, contagem 17→18), `Calibration.cpp`, `Drv8833MotionAdapter.cpp` (`readTofInStraight` em `straight()`),
   `main.cpp` (chave NVS `calib2`→`calib3`), teste `CalibrationTest.TofInStraightDefaultsOnAndAcceptsOnlyZeroOrOne`. Host 318/318, 0 avisos; placa compilada.

## Estado do robô no fim do dia (valores na memória)
`ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1`, demais em padrão. Firmware gravado às 11:01:54.

## Achados no código
- **Pista B D1→A4 (inalcançável):** o Navigator esquece o mapa quando fecha o caminho, reabre as paredes desconhecidas, redescobre e repete: 28 rés em 64 passos até o limite de passos; nunca declara "sem caminho".
- **`t.py`:** D1 e D2 esperam 12 e 10 passos com 2 rés (pista antiga); nas pistas A e B reais são 10 passos sem rés. Critérios de tempo (ex.: curva < 1500 ms) são da velocidade antiga. Faltam os testes E1 a E8.
- **Modo seguro com ToF morto:** hoje `tof_na_reta=0` desliga TODOS os ToF na reta (perde a parada pela frente). Proposta: ignorar só o sensor fora do ar e continuar lendo os outros.
- **Centralização (RF-44) fraca:** ganho 0,8 pulso/mm, máx. 16 pulsos; a pose lateral estimou 12 a 19 mm de erro e corrigiu só 3 a 5 mm. Proposta (precisa de aprovação): subir o ganho de `kWallCentering`.
- **`ganho_rumo`:** 0 → entorta ~33 mm em 3 células; 1.0 → ~9 mm; 0.6 → ±3 mm numa rodada (variável). Com `centralizar=1` a 3+3+3 ficou estável (E 21→42 mm).
- **Contador de quedas de ToF por corrida** (log do fim): proposta, não implementada.
- O reinício na partida com carga no azulejo parece mecânico/elétrico (ver equipe de energia); `tof_na_reta=1` teve 1 reinício em 3 rés, `0` não teve nenhum em 9 manobras (amostra pequena).

## Pendências de decisão
Aumentar o ganho do `kWallCentering`; modo "ignorar sensor morto" (útil porque o robô não será alterado até segunda); corrigir D1/D2 do `t.py`; criar E1 a E8.

---

## Atualização de 21/11/2026 (noite) — LEIA `PASSAGEM_CALIBRACAO.md` primeiro
Os commits e o estado de 19/11 acima estão **ultrapassados**. O estado atual e as tarefas estão em `robot-tests/relatorios/PASSAGEM_CALIBRACAO.md`; o resumo da sessão, em `SESSAO_21_11.md`; a causa raiz e os números, em `auditoria/AUDITORIA-2026-11-21.md`.

**Resumo:** gravado `fase1-entrega-4` (tag `pista-21-11`, calib15, 60 chaves). **O robô completa a serpentina** (49, 50, 52 e 53 passaram; ~52 s) e **raspa na parede direita** na saída das curvas.
O que entrou desde 19/11: `domain/CellTurn` (**curva em S** com 4 postes e cabo), **2ª tentativa** quando o 1º giro do S trava, diagonal do S tolerando 18°, ré e reta contínuas, `calib` com 60 chaves (tudo sem regravar), `E0` com as 60 esperas.

**As duas tarefas decididas pelo operador (seção 7 da passagem, na ordem):**
1. **A curva contínua deve DESAPARECER do projeto.** Só ficam duas curvas, as duas **paradas no centro da célula**: o **arco parado com ré** e a **curva em S** (gira ~70°, anda na diagonal, completa). A **reta contínua** (várias células num movimento) **continua**; sai só o "virar sem parar dentro dela". Tabela de arquivos, chaves (8) e testes a remover na passagem.
2. **A cada curva o robô deve se calibrar para ficar completamente reto e centralizado** (medir pelas paredes, alinhar o rumo, corrigir o deslocamento lateral, repetir no máximo 2 vezes; critério |E-D| <= 6 mm e rumo <= 1,5°). Especificação completa e critério de aceitação na passagem.

**Outras pendências de firmware:** reiniciar o ToF que cai durante a reta (hoje só parado); aviso de desequilíbrio de tensão das rodas; reduzir o tempo do boot (4 planos de 8 a 12 s cada); decidir o destino da curva com uma roda e do giro no lugar.
**Achados que valem para quem mexe no código:** (a) o ToF frontal lê ~4,5 mm a mais perto da parede; (b) uma curva em S travou em ~1 de cada 4 vezes sem padrão, e a 2ª tentativa recupera; (c) `curva_continua=0` **piorou** (corridas 46 a 48) porque o robô chega encostado na parede direita: faça a Tarefa 2 antes ou junto da Tarefa 1; (d) hashes de commit: o histórico foi reescrito em 21/11, tabela de tradução na seção 9 da passagem.
