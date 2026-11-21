# Passagem da calibração (noite de 21/11/2026)

Documento para quem assumir a calibração do robô. Leia este arquivo primeiro; os detalhes estão em `auditoria/AUDITORIA-2026-11-21.md` (raiz do
repositório, seção 9), `CALIBRACAO.md` (diário, uma linha por mudança) e `AJUSTES_FINAIS.md`.

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

## 5. Pendências, em ordem de valor
1. **Viés para a direita na saída das curvas** (arcos à direita e curva em S): é o que o operador vê como arrasto. Ajustes cegos de `curva_dir_fora`, `alvo_lateral_dir_mm`, `max_parede` e `eixo_ate_tof_frente` já foram testados (tabela do `CALIBRACAO.md`). **Próximo passo: filmar de cima uma curva isolada e medir o ângulo e a posição da saída**, e comparar com o giroscópio.
2. **Reiniciar o ToF que cai DURANTE a reta/curva** (hoje só reinicia com o robô parado): ver a memória do projeto `tof-recuperacao-na-reta-pendente`.
3. **Cabo da bateria:** medir (`cabo_esq_mm` é estimativa) e prender rente ao chassi: com o cabo rente a folga do plano à esquerda sobe de 4,4 para ~7 mm.
4. **Pneus e motores (estrutura):** nada de WD-40 nem limpa-contatos nas rodas ou nas caixas; só fita adesiva e álcool no pneu. Trocar o N20 direito se o arrasto voltar.
5. **Tempo do boot** (4 planos x 8-12 s): busca mais grossa ou um plano por vez.
6. **Linha de log do desequilíbrio de tensão das rodas** (aviso quando passar de 1,5x).

## 6. Regras do projeto que continuam valendo
Responder e documentar em português; commits em Angular em português, **sem `Co-Authored-By` nem `Claude-Session`**, assinados (`ssh-add` se falhar); nunca `git add -A`;
nenhum `.zip`; não desativar componentes para um teste passar; sem push nem reescrita de histórico sem pedido; hardware só muda na segunda-feira.
