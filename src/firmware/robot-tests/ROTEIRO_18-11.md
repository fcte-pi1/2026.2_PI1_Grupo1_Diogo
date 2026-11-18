# Roteiro de quarta, 18/11: labirintos oficiais (integração)

Objetivo do dia: o robô resolver os labirintos oficiais com o comportamento que já conhecemos.
Nada de novidade ligada: o firmware novo tem tudo o que é novo DESLIGADO por padrão.

## 0. Antes de sair

- Bateria carregada (8,2 a 8,4 V) e uma reserva. Cabo USB de dados. Notebook com a ponte.
- Fita, régua, paquímetro (se a equipe de estrutura já tiver as medidas).
- ToF direito: se foi ressoldado, confira com o H1 e o H3 (passo 2).

## 1. Gravar o firmware novo (10 min)

O robô está com um build de TESTE de 16/11 (centralização ligada). Grave o build novo:

- Opções: `CONFIG_RATO_LOG_RETA=y`, `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`; `RATO_BANCADA`,
  `RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados.
- Bateria DESLIGADA, USB na porta UART, gravar, tirar o USB, ligar a bateria.
- No boot têm de aparecer as linhas `calib: ...` e NÃO pode aparecer "centralizacao ... LIGADA".

## 2. Conferência rápida (15 min)

1. `python ponte.py` (outra janela) e `python t.py portao`.
2. `python t.py H1` (robô apoiado): `diag: fim: OK`.
3. `python t.py H3` (60 s balançando os cabos dos ToF): nenhuma falha. Se o direito cair: é a solda.
4. `python t.py calib-ver`: todos os valores "padrao" (a não ser os que você gravou).
5. Se tiver as medidas: `python t.py medidas`.

## 3. O piso oficial (10 min)

O freio das curvas depende do piso. No chão do labirinto oficial, numa célula com parede à frente:

1. `python t.py C4` (curva à direita com parede à frente) e uma curva à esquerda (`python t.py cmd "virar e"`).
2. No log, `curva: alvo=90 parou=... final=...`: o `final` tem de ficar entre 87 e 93.
3. Se ficar fora nos dois lados: `python t.py calib "autoajuste_freio=1"`, repita as duas curvas
   3 vezes e veja a linha `curva: freio:` convergir. Se piorar: `python t.py calib "autoajuste_freio=0"`.

## 4. Cada labirinto oficial

1. Chave DIP: vias 1 e 2 = tamanho (0 0 = 4x4; via 1 fechada = 8x4; via 2 fechada = 12x4; as duas
   fechadas é proibido). Via 3 = canto: ABERTA se a borda fica à ESQUERDA do robô na largada,
   FECHADA se fica à DIREITA. Depois de mexer: `python t.py reiniciar`.
2. `python t.py cmd "diag" 12`, linha `entradas:`: confira tamanho e via 3.
3. Robô no canto de largada (linha de baixo do mapa do robô), no meio da célula, alinhado.
4. `python t.py cmd "largar" 5` (ou o botão). Filme a corrida.
5. No fim: `fim da corrida N: SUCESSO`. O robô volta a esperar a largada; o mapa é zerado sozinho.
6. Corrida em FALHA: `python t.py cmd "tof"` ANTES de tirar o robô, anote a célula, `python t.py reiniciar`.

## 5. O que fazer em cada tipo de falha

| O log diz | Causa provável | O que fazer |
|:--|:--|:--|
| `largada recusada: sem parede a ...` | via 3 errada para o canto | trocar a via 3, reiniciar |
| `fora=` sobe, `chegada nao confere` | via 3 ou tamanho errado, ou robô perdido | conferir a DIP; se certa, ver a reta/curva anterior |
| `reta ... rumo perdido` com `giro=` alto | pegou uma quina depois de uma curva | recolocar bem centrado; se repetir, `calib "centralizar=1"` e tentar de novo |
| `tof: direito PAROU` | a solda do ToF direito | parar; é hardware |
| `curva travada` duas vezes | quina presa | anotar célula e parede; ver a folga |
| `falha de sensor por 3 passos` | ToF mudo | H1 |

Com tempo sobrando, e só depois dos labirintos oficiais: `python t.py calib "parada_frente=65"`
e uma corrida para comparar (menos "ajuste antes da curva"). Voltar com `calib "parada_frente=35"`.

## 6. No fim

Guarde a pasta `teste-v3/resultados/` inteira (log_robo.txt, telemetria.jsonl, os .log) e os vídeos.
