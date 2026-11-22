# Passagem da calibração (noite de 21/11/2026)

## RESUMO PARA QUEM HERDA O FIRMWARE (leia isto primeiro)
**Estado:** o robô **completa a serpentina 4x4** (~52 s) com o firmware `fase1-entrega-4` (tag `pista-21-11`, calib15, 60 chaves), mas **raspa na parede direita** na saída das curvas. O calib final está na seção 2 e já está gravado na memória do robô.

**O que fazer, nesta ordem (decisão do operador; detalhes na seção 7):**
1. **Calibrar a cada curva para ficar reto e centralizado** (Tarefa 2): depois de cada curva, medir pelas paredes, corrigir rumo e deslocamento lateral, repetir no máximo 2 vezes; aceitar com |E-D| <= 6 mm e rumo <= 1,5°. É o que resolve o arrasto.
2. **Remover a curva contínua do projeto** (Tarefa 1): ficam só o **arco parado com ré** e a **curva em S** (gira ~70°, diagonal, completa); a **reta contínua** continua. Tabela de arquivos, 8 chaves e testes a apagar na seção 7. Faça a Tarefa 2 antes ou junto: `curva_continua=0` sozinho piorou.
3. Reiniciar o ToF que cai **durante** a reta (hoje só parado), aviso de desequilíbrio de tensão das rodas, reduzir o tempo do boot (4 planos x 8-12 s).
4. Com as outras equipes: cabo da bateria, motor/caixa e pneu direitos (estrutura), alimentação do ToF direito (energia). Os documentos de cada equipe foram atualizados em 21/11 (`PARA_EQUIPE_*.md`).

**Como operar:** ponte BLE e `t.py` pelo **Python do Windows**; depois de um erro, `python t.py reiniciar` (~45 s); gravar **só com a bateria fora**; conferir com `python t.py E0 --auto` (60 chaves); rodar `tofrec` e `tofmon 60` antes de cada sessão. Seção 4.
**Onde está tudo:** `LEIA-ME.md` na raiz do pacote (`passagem-2026-11-21.zip`): documentos, logs de todas as corridas, firmware gravado, o código atual (`codigo/`, sem histórico; o histórico completo está no GitHub) e a conversa da sessão. Hashes antigos de commit: tabela na seção 9 (o histórico foi reescrito).

Documento para quem assumir a calibração do robô. Leia este arquivo primeiro; os detalhes estão em `auditoria/AUDITORIA-2026-11-21.md` (raiz do
repositório, seção 9), `CALIBRACAO.md` (diário, uma linha por mudança) e as baterias de teste (`BATERIA_TESTES_20_11.md` e `BATERIA_TESTES_21_11.md`).

## 1. Onde estamos
- **O robô completa a serpentina 4x4** (largada (l3,c0) virado ao norte, via 3 aberta, objetivo (l0,c3)): ~52 s, 7 passos, giros de 88 a 89°.
  Corridas que passaram na configuração final: 49, 50, 52, 53 (e 40 a 43 com a 2ª tentativa de 6 mm).
- **O que ainda não está bom:** o robô **raspa na parede direita** na saída dos arcos à direita (sensor direito em 0 mm) e na saída da última curva em S,
  e a estimativa lateral nas retas chega a 20 a 35 mm à direita. Isso **não** é arrasto de motor (com os motores limpos continua).
- Firmware gravado: `fase1-entrega-4-g264ef77` (tag `pista-21-11`), chave da memória `calib15` (60 chaves). **Não regravar sem necessidade**: o calib vive na memória do robô.

## 2. Calib final em uso (o `E0` espera exatamente isto)
Padrões, exceto:

| Chave | Valor | Observação |
|:--|:--|:--|
| `eixo_ate_frente` / `eixo_ate_tof_frente` / `largura_frente` | 100 / **88** / 112 | O 88 é o melhor medido na pista (medido com trena: 92 perto da parede, 96,5 a 229 mm); 84 travou a curva em S, 92/98 batiam no poste |
| `tof_lado_ao_centro` | 55,5 | |
| `escala_giro` / `freio_pivo` | 1,00 / 4 | |
| `centralizar` / `ganho_rumo` / `ganho_parede` / `max_parede` | 1 / 1,0 / 3 / **35** | 22 deixava o robô 14-22 mm à direita; 50 abortava por "rumo perdido" |
| `folga_arco` / `antecipa_arco` / `arco_esq_atraso` | 18 / 12 / -14 | |
| `desfazer_tensao_fora` / `desfazer_tensao_dentro` | 3,6 / 2,2 | |
| `ajuste_fino_min` | 0,4 | |
| `alvo_lateral_dir_mm` | **-8** | as retas miram 8 mm à esquerda do centro |
| `alvo_pos_esq_mm` | **0** | era 12; a saída das curvas em S já sai à direita |
| `curva_dir_fora` | **8** | **16 foi pior (54)**; 0 deixava as saídas dos arcos 22-27 mm à direita |
| `rumo_max_lateral` | 8 | |
| `ajuste_2a_tentativa` | **24** | a 2ª tentativa da curva em S desloca o eixo 12 mm (metade); também vale para o arco |
| `giro_aberto` | 1 | liga a curva em S em célula aberta |
| `bateria_minima` | 5,5 | só para testes: a INA219 lê 1,7 V abaixo do cellmeter |
| `cabo_esq_mm` | 10 (padrão) | **estimativa, falta medir** |

`curva_continua=1` (padrão). **Desligar não ajudou** (46 a 48: 0 de 3).

## 3. O que foi aprendido (resumo)
1. **Causa raiz das falhas originais:** o giro de 90° no lugar em célula aberta não cabe com os **postes dos cantos** (`domain/PivotClearance` não os tinha). Corrigido com a **curva em S** (`domain/CellTurn`): giro de ~70°, diagonal de ~76 mm, completa.
2. **A curva em S tem janela estreita:** ±5 mm de posição do eixo. Uma travada no 1º giro acontece em ~1 de cada 4 vezes; a **2ª tentativa automática** (gira de volta, desloca o eixo, tenta de novo) resolve a maioria.
3. **A diagonal do S aceita 18° de desvio de rumo** (um toque leve na parede não aborta).
4. **O ToF frontal lê ~4,5 mm a mais perto da parede**, então o `eixo_ate_tof_frente` depende da distância.
5. **O motor direito às vezes pesa** (corrida 51: 7,2 V contra 3,1 V para manter as rodas iguais; depois de limpar, 3,5 V contra 3,5 V). **Bom indicador:** compare a tensão máxima das duas rodas nas retas (linha `reta: ... V max E=.. D=..`); se diferirem mais de ~1,5x, limpe ou troque o N20 direito antes de calibrar.
6. **O ToF direito caiu sozinho** (volta ao endereço 0x29): `python t.py cmd tofrec` recupera. Rode `tofrec` e `tofmon 60` antes de cada sessão.
7. **A deriva das retas em malha aberta é pequena** (~+5 mm em 540 mm, com ±9 mm de ruído de posicionar à mão). Não é a causa dos 20-35 mm.

## 4. Como operar (WSL2, ponte BLE, Windows Python)
- A ponte tem de rodar pelo Python do Windows (o Bluetooth não funciona pelo WSL):
  `C:\Users\samue\AppData\Local\Programs\Python\Python312\python.exe` com o caminho de `wslpath -w src/firmware/robot-tests/ponte.py`; os comandos `t.py` também.
- **Depois de um erro o robô precisa reiniciar** (`t.py reiniciar`, ~45 s: calcula os 4 planos da curva em S, 8 a 12 s cada). Ele ignora `largar` em erro.
- **Gravar:** só com a **bateria fora**; confirmar pela serial `INA219 PAROU`. Build com `CONFIG_RATO_LOG_RETA=y` (modo calibração); compile também o modo prova (sem o log). Veja `CLAUDE.md` local (não versionado) e `LOGS_E_MEDIDAS.md`, seção 6.
- **Corrida:** `python trava_execucao.py SERPENTINA-N` e depois `python t.py corrida --auto SERPENTINA-N "<descrição>"` (um nome novo por corrida).
- **`calib`:** no máximo 4 chaves por comando (o BLE perde linhas longas); `python t.py E0 --auto` confere as 60 chaves.
- **Para parar rápido:** a chave do robô. O `parar` pelo BLE leva alguns segundos.
- Depois de mudar a lista de chaves do `calib`: subir `kCalibKey` (`src/main.cpp`) e o `EXPECTED_CALIBRATION` do E0.

## 5. Pendências de pista e hardware, em ordem de valor

> As duas tarefas de **firmware** decididas pelo operador (remover a curva contínua e calibrar a cada curva) estão em `AJUSTES_FINAIS.md` e vêm **antes** de tudo isto.
1. **Viés para a direita na saída das curvas** (arcos à direita e curva em S): é o que o operador vê como arrasto. Ajustes cegos de `curva_dir_fora`, `alvo_lateral_dir_mm`, `max_parede` e `eixo_ate_tof_frente` já foram testados (tabela do `CALIBRACAO.md`). **Próximo passo: filmar de cima uma curva isolada e medir o ângulo e a posição da saída**, e comparar com o giroscópio.
2. **Reiniciar o ToF que cai DURANTE a reta/curva** (hoje só reinicia com o robô parado): ver a memória do projeto `tof-recuperacao-na-reta-pendente`.
3. **Cabo da bateria:** medir (`cabo_esq_mm` é estimativa) e prender rente ao chassi: com o cabo rente a folga do plano à esquerda sobe de 4,4 para ~7 mm.
4. **Pneus e motores (estrutura):** nada de WD-40 nem limpa-contatos nas rodas ou nas caixas; só fita adesiva e álcool no pneu. Trocar o N20 direito se o arrasto voltar.
5. **Tempo do boot** (4 planos x 8-12 s): busca mais grossa ou um plano por vez.
6. **Linha de log do desequilíbrio de tensão das rodas** (aviso quando passar de 1,5x).

## 6. Regras do projeto que continuam valendo
Responder e documentar em português; commits em Angular em português, **sem `Co-Authored-By` nem `Claude-Session`**, assinados (`ssh-add` se falhar); nunca `git add -A`;
nenhum `.zip`; não desativar componentes para um teste passar; sem push nem reescrita de histórico sem pedido; hardware só muda na segunda-feira.

## 7. O que a pessoa que assumir deve fazer no firmware
**Está em `AJUSTES_FINAIS.md`** (documento único de ajustes finais), com a especificação completa e o critério de aceitação. Em uma linha cada:
1. **Calibrar reto e centralizado a cada curva** (medir pelas paredes, corrigir rumo e deslocamento lateral, no máximo 2 repetições; |E-D| <= 6 mm e rumo <= 1,5°): é o que resolve o arrasto na parede direita.
2. **Remover a curva contínua do projeto**: ficam só o arco parado com ré e a curva em S; a reta contínua continua (tabela de arquivos, 8 chaves e testes a apagar no `AJUSTES_FINAIS.md`).
3. Reiniciar o ToF que cai durante a reta, aviso de desequilíbrio de tensão das rodas, reduzir o tempo do boot, decidir o destino da curva com uma roda e do giro no lugar.

## 8. Índice do pacote de passagem
O pacote com **todos os logs, documentos, o resumo da sessão, o firmware gravado e o código atual (sem histórico; o histórico está no GitHub)** está descrito em `LEIA-ME.md` na raiz do pacote (`passagem-2026-11-21/`, fora do repositório).

## 9. Tradução de hashes (histórico reescrito em 21/11)

O histórico foi reescrito **duas vezes** em 21/11: a 1ª para remover as fotos enviadas pelo operador; a 2ª para tirar os planos desatualizados (`PLANO_AMANHA`, `PLANO_PROXIMA_SESSAO`) e as versões antigas do `AJUSTES_FINAIS`. **Os hashes mudaram; o conteúdo da branch é idêntico** (mesma árvore). Logs, `corridas.csv` e a versão que o robô mostra no boot (`g264ef77`, `g13d515a`...) trazem os hashes **originais**: use a tabela (coluna Antigo = original, Novo = atual). O robô gravado mostra `fase1-entrega-4-g264ef77`.

| Antigo | Novo | Assunto |
|:--|:--|:--|
| `9f800f5` | `9f800f5` | refactor: move teste-v3 para src/firmware/robot-tests |
| `7b1291a` | `7b1291a` | fix(hw): move botão START do GPIO 4 para o GPIO 13 após ressolda |
| `8e0c030` | `8e0c030` | fix(arco): reduz velocidade (90°/s), freio (4,2°) e folga frontal (20 mm) do arco |
| `900cce1` | `900cce1` | feat(motion): acumula erro de rumo entre movimentos, ajuste fino pós-arco e fallback sem r |
| `c659ccf` | `c659ccf` | test(teste): adiciona cenário C9 — curva esquerda em B2 (3 repetições) |
| `a0b4b77` | `a0b4b77` | chore(robot-tests): remove roteiros, prompts e anotações antigas |
| `dd0f2d3` | `dd0f2d3` | refactor(robot-tests): divide t.py e ponte.py no pacote suite |
| `683e2c6` | `683e2c6` | fix(firmware): leitura do ToF abaixo do alcance mínimo vira "muito perto" em vez de 0 mm o |
| `122ce8b` | `122ce8b` | fix(firmware): arco usa a bitola efetiva medida e reta que gira mais de 10 graus falha com |
| `4b2cde7` | `4b2cde7` | fix(firmware): desfazer do arco travado confere o progresso e falha com motivo claro |
| `46553cb` | `46553cb` | test(firmware): cobre o religamento do ToF pelo XSHUT e a mensagem de Erro por falha de se |
| `c833a99` | `c833a99` | docs(firmware): atualiza README e LOGS_E_MEDIDAS com as mudanças de 19/11 e o roteiro de r |
| `2d572c9` | `2d572c9` | feat(firmware): modelo do corpo do robô a partir do CAD, preset_cad e aviso de conflito na |
| `cec543b` | `cec543b` | feat(firmware): estimativa de pose lateral por célula, com rumo descontado, para a central |
| `534ac40` | `534ac40` | feat(firmware): curva fechada com uma roda (modo_curva=uma_roda) e SweptFootprintTest |
| `53ec23d` | `53ec23d` | feat(firmware): velocidade de corrida -25%, modelo de tempo por célula e limite de 10 min |
| `13e7cfe` | `13e7cfe` | test(firmware): testes de propriedade do Flood Fill contra um BFS independente |
| `7cc1aaa` | `7cc1aaa` | feat(firmware): labirinto em pé (4x8, 4x12) por comando BLE, relatado como o deitado com o |
| `16704f7` | `16704f7` | docs(firmware): README (308 testes), LOGS_E_MEDIDAS com as novidades e o roteiro de reconf |
| `62ef8b5` | `62ef8b5` | feat(firmware): toque longo no botão alterna a orientação do labirinto (inclusive o 4x4),  |
| `8282d64` | `8282d64` | test(robot-tests): bloco O do roteiro para a orientação do labirinto (toque longo e comand |
| `2b34729` | `2b34729` | fix(firmware): motivo do desfazer do arco cabe no buffer e a placa volta a compilar com -W |
| `2978466` | `2978466` | feat(firmware): chave tof_na_reta do calib para não ler os ToF durante a reta |
| `0110e69` | `df0c28d` | docs(robot-tests): prompt da bateria, relatórios de 19/11 para as equipes e trava de execu |
| `d024150` | `d8c9d7b` | docs(robot-tests): errata: o robô não será alterado até segunda e atualiza o estado dos co |
| `a21a857` | `a17ab09` | docs(robot-tests): corrige a errata: só o hardware fica parado até segunda, o firmware pod |
| `c0f5487` | `8fe41d8` | feat(firmware): velocidade menor e frenagem suave para acabar com o balanço ao parar |
| `4ee4622` | `835a28b` | fix(firmware): cabo_frente_mm padrão 0, já que não existe cabo à frente do robô |
| `8fe6bc1` | `12bd085` | feat(firmware): giro no lugar em célula fechada anda até a faixa em que cabe |
| `808b7b2` | `55619de` | test(robot-tests): blocos B1M, B1A, E1 a E4, E8 e E9, remove o H3 e atualiza o plano de am |
| `4819582` | `c1243e8` | chore: ignora arquivos zip |
| `1346633` | `1e1aebd` | feat(firmware): chaves rampa_tensao, fusao_rumo, reancorar_parede e parada_dinamica no cal |
| `64139b9` | `c976e10` | feat(firmware): rampa de tensão no motor (soft-start) contra o BROWNOUT na partida |
| `ddb2663` | `2eb6d00` | feat(firmware): fusão do rumo da reta entre giroscópio e encoders (chave fusao_rumo) |
| `e709b73` | `5567c51` | feat(firmware): reancorar a posição pela parede da frente (chave reancorar_parede) |
| `869d637` | `239d524` | feat(firmware): parada pela parede da frente que conta a velocidade (chave parada_dinamica |
| `9ae8faf` | `622c234` | feat(firmware): remede o desvio do giroscópio a cada parada (chave vies_giro) |
| `85626b0` | `0936927` | test(robot-tests): E10 a E14 para as malhas novas e documentação das chaves |
| `3d8e7dc` | `21de2b3` | test(firmware): giro com a rampa de tensão no simulador, nos dois sentidos |
| `266c748` | `1856479` | test(robot-tests): E0 confere a calibração depois de gravar e E9b cobre a curva de uma rod |
| `eaf1e9f` | `065d7c4` | feat(firmware): perfil de reta que muda de alvo andando, base da reta contínua |
| `91ebe0b` | `00a7c45` | feat(firmware): reta contínua no Navigator, várias células num movimento só |
| `0304009` | `6411049` | feat(firmware): reta contínua na placa, chave reta_continua e comando andar N |
| `1466e00` | `126c120` | test(robot-tests): E15 da reta contínua, reta_continua no E0 e passos de várias células na |
| `ba4e1e5` | `4c47310` | feat(firmware): largura do corredor e ganho do termo da parede calibráveis |
| `9efc0de` | `0b52404` | feat(firmware): registra a velocidade da reta a cada 50 ms e centraliza também na ré |
| `335d450` | `68216b0` | fix(firmware): suaviza o termo da parede para a reta não andar em arrancos |
| `0c99d6b` | `77c0d8c` | fix(firmware): retune do controle de cada roda, que oscilava com a inércia real |
| `bc99c89` | `db1e11c` | feat(firmware): registra os ToF laterais e a centralização a cada 50 ms na reta |
| `486995a` | `7c9f644` | feat(firmware): ré contínua, várias células de ré num movimento só |
| `938d825` | `e0c4de2` | fix(firmware): o desfazer do arco para na hora se o ângulo se afastar do zero |
| `0a2770d` | `aaa6635` | docs(firmware): atualiza os hashes citados depois da reescrita do histórico e acrescenta a |
| `eaf326c` | `4aa4e4b` | docs(firmware): atualiza os documentos das equipes de energia, estrutura e firmware com os |
| `588fa58` | `35b3d19` | docs(firmware): resumo no topo da passagem para quem herdar o firmware |
| `a679cce` | `f8b3db3` | chore(firmware): versiona os relatórios e o resumo das corridas de 21/11 e ignora os logs  |
| `8a447d8` | `77bf9d0` | docs(firmware): descreve as baterias de teste de 20/11 e 21/11 (o que foi rodado, resultad |
| `5100d19` | `381039d` | docs(firmware): retira o roteiro da próxima sessão (AJUSTES_FINAIS) e move o método de med |
| `8cb2a39` | `95a3578` | docs(firmware): a passagem descreve o pacote com o código atual e o histórico no GitHub |
| `58a557e` | `2e3940e` | docs(firmware): restaura o AJUSTES_FINAIS como documento único do que fazer no firmware e  |
| `debd247` | `e8adb74` | docs: medidas reais do robô lidas de fotos (frente 100 mm, ToF frontal 98, laterais a 55,5 |
| `01656cd` | `93ea302` | fix(firmware): a centralização lembra o centro quando uma parede some e vale antes da curv |
| `8667915` | `ac961bc` | fix(firmware): o giro no lugar que não cabe falha com motivo claro em vez de raspar na par |
| `a8bbdc6` | `d7b143a` | feat(firmware): modelo do arco com o robô real e chave folga_arco (padrão 12 mm) |
| `5d32666` | `167e376` | feat(firmware): a 2a tentativa do arco vai para o lado certo, pelo ângulo em que travou |
| `85a82bd` | `54cf3c2` | test(robot-tests): interpreta a curva travada (parede da frente ou quina de dentro) e diz  |
| `5e87895` | `35d1525` | test(robot-tests): o E0 confere a calibração medida de 20/11 (corpo real, ganhos da centra |
| `05785dc` | `cb7f052` | test(robot-tests): corrige a contagem de chaves do E0 |
| `41ac069` | `0cfca84` | docs(robot-tests): plano da próxima sessão com o estado de 20/11 |
| `9fe702a` | `37c24ab` | feat(controller): trajetória de curva contínua (PathMove) que parte em movimento |
| `38456a6` | `77a87fa` | fix(firmware): o ajuste fino depois da curva desconta do erro de rumo o que corrigiu |
| `e870e67` | `8b3f807` | feat(firmware): curva contínua sem parar (arco de raio 90 dentro da reta, com giroscópio e |
| `076f9e5` | `351fef8` | test(robot-tests): E16 confere a curva contínua e o E0 passa a conferir 30 chaves |
| `8457f35` | `9797d8b` | fix(firmware): curva contínua entra a 80 mm/s, giroscópio manda no arco e leitura brusca d |
| `7431b4f` | `c631cb8` | fix(firmware): a curva contínua para o arco pelo giroscópio e sai com reta centralizada pe |
| `775ac49` | `30459db` | fix(firmware): a curva contínua soma o giro que sobra ao frear o arco no rumo da saída |
| `05c5edf` | `c7fcc0f` | feat(firmware): comando giroang soma o giroscópio para conferir a escala girando o robô na |
| `a1e9515` | `b459608` | test(robot-tests): o E0 espera escala_giro 1,01, medida em duas voltas completas |
| `0691217` | `f50a9ef` | test(robot-tests): o E0 espera escala_giro 1,00 depois do E16a |
| `d3c75c1` | `babcc30` | docs(robot-tests): resultados da curva contínua de 20/11 e a medida da escala do giroscópi |
| `c82df7f` | `407b506` | docs(robot-tests): rodadas 8 e 9 da curva contínua e a sequência de duas curvas à direita |
| `13a111a` | `fbddb4f` | fix(firmware): arco sem parede à frente recua pelo modelo da frente real e arco parado per |
| `ce8ff24` | `e71336d` | fix(firmware): ré mais lenta e suave, e arco à esquerda começa 4 mm mais tarde por causa d |
| `6d9df5d` | `31464f1` | fix(firmware): desfazer do arco mais suave, ré normal volta ao padrão e a curva à direita  |
| `91f0ac2` | `148686a` | fix(firmware): correção de rumo da reta com teto de 14 mm e ganho 1,2 (a reta derivava -10 |
| `18fded0` | `a5f8ea2` | test(robot-tests): o E0 espera max_parede 20: acima de ~7 mm a correção inclina o robô alé |
| `e96a51b` | `c2fce62` | revert(firmware): volta ao estado do ce8ff24, em que a reta da corrida funcionava (desfaz  |
| `427e642` | `d387cce` | feat(firmware): o recuo antes da curva à direita se alinha 8 mm para fora do centro |
| `5c3a5a5` | `6546fbb` | fix(firmware): arco sem parede à frente recua 90 mm (saída centrada) e não 105, que prendi |
| `4d37dbb` | `7603fbc` | feat(firmware): arco_esq_atraso no calib para ajustar na pista quando a curva à esquerda c |
| `2869145` | `af5088f` | fix(firmware): desfazer do arco mais suave (2,8/1,6 V) |
| `83aa5c2` | `e0ce05c` | feat(firmware): mais logs da curva: ToF antes do recuo, caminho e tensão de cada roda e To |
| `6b9096b` | `5a25455` | chore(firmware): limite de bateria fraca em 5,5 V só nos testes de 20/11 (o INA219 lê ~1,7 |
| `29ce24a` | `feffd56` | fix(firmware): desfazer suave com tempo de 2,4 s e o E0 espera arco_esq_atraso -14 |
| `967fb7c` | `b87491d` | fix(firmware): desliga o alinhamento de 8 mm para fora no recuo da curva à direita (a roda |
| `a959dfd` | `c63ab24` | feat(firmware): constantes de pista da curva, desfazer, ré e bateria passam para o calib ( |
| `d5cac0d` | `59549b7` | test(robot-tests): o E0 espera ganho_rumo 1,0 e bateria_minima 5,5, o estado de 20/11 |
| `9ea28b7` | `eb79105` | docs(robot-tests): corridas da serpentina de 20/11 à noite, achados e estado do robô |
| `473792d` | `7ac0360` | feat(firmware): giro no lugar em célula aberta (giro_aberto e lado_aberto_mm no calib, cal |
| `e7bc691` | `dbfabb1` | test(robot-tests): o E0 espera giro_aberto 1 durante o teste da célula aberta |
| `7b14d1f` | `cbe9d48` | feat(firmware): o giro no lugar em célula aberta vai ao ponto mais perto do centro em que  |
| `3503c95` | `723e6bb` | fix(firmware): ajuste fino depois do giro no lugar em célula aberta |
| `6a81396` | `41757a8` | feat(firmware): ajuste_fino_min no calib (calib12) e E0 com o estado de 20/11 |
| `5bc5f00` | `b145451` | docs(robot-tests): a falha do passo 7 é o desvio do giro maior que a folga lateral do corr |
| `59838e3` | `f9e86b2` | feat(firmware): alvo_lateral_dir_mm no calib para compensar o cabo da bateria no lado esqu |
| `d5b7498` | `06ad1df` | test(robot-tests): o E0 volta a esperar alvo_lateral_dir_mm 0 (10 mm empurrava o robô para |
| `cd15948` | `34a7b7c` | feat(firmware): alvo_pos_esq_mm no calib: só a reta logo depois da curva à esquerda mira à |
| `fc2cad8` | `6fbcafc` | fix(firmware): curva em célula aberta em S (o giro de 90 no lugar não cabe com os postes d |
| `cda846b` | `2f038b7` | fix(firmware): o modo prova (sem LOG_RETA) volta a compilar, versão do firmware no boot e  |
| `fef95e6` | `0a01d9e` | test(robot-tests): o E0 espera a linha final do calib (a captura fechava antes das últimas |
| `77810c9` | `70a98ae` | test(use_cases): a serpentina de 20/11 reconstruída pelos logs, com reta e curva contínuas |
| `d12bf8a` | `7c86104` | perf(firmware): os quatro planos da curva em S calculados com o robô parado, só quando o c |
| `1a9d405` | `a36cfd6` | fix(firmware): curva em S sem parede à frente usa a odometria para saber onde está o eixo, |
| `7fda4dd` | `43e58f6` | fix(firmware): espaço da linha do plano da curva em S quando o plano existe |
| `b5b1dda` | `e21ba47` | docs(firmware): auditoria da serpentina de 20/11, roteiro da Fase 2, diário de calibração  |
| `b4b4ce0` | `602871d` | fix(firmware): o aviso de boot e o t.py medidas pedem trena, não paquímetro (o operador nã |
| `13d515a` | `0a5a11c` | docs(firmware): medidas com trena (sem paquímetro), o método por diferença e pelo ToF, e q |
| `9336850` | `0f49ea1` | fix(firmware): curva em S tenta de novo quando o 1o giro trava (volta o giro e desloca o e |
| `264ef77` | `e0d2bd6` | fix(firmware): a diagonal da curva em S aceita até 18 graus de desvio de rumo (um toque le |
| `98f458f` | `f4cd9d2` | docs(firmware): sessão de pista de 21/11 (SERPENTINAS 30 a 50), calib final no E0, achados |
| `ed2da82` | `d501015` | docs(firmware): passagem da calibração (estado, calib final, achados, como operar e pendên |
| `122774f` | `62dbc57` | chore(firmware): retira as fotos enviadas pelo operador do repositório e documenta a passa |
