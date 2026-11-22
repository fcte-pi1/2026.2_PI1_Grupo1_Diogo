# Achados de alimentação para a equipe de energia/eletrônica (bateria de 19/11/2026)

Robô `rato-01`, firmware 8282d64. Bateria 2S LiPo (~8,0 V cheia), chave balancim atrás, conector JST de 2 pinos na
lateral esquerda (cabo vermelho/preto que pende além das rodas).

## Sintomas (todos de hardware; o firmware se comportou como projetado)
1. **BROWNOUT na partida, intermitente.** Ao ligar o balancim a placa às vezes reinicia com `reset=BROWNOUT (a tensao
   caiu)` (2 de 5 partidas: boots f7ba63 e 9ae85d). Nas outras, `reset=LIGOU (poweron)` (4e5d3a e 702f9d). Depois de
   ligado fica estável: bateria 7,95 V sob carga com as duas rodas a 6 V (H7), corrente 0,12 A (máx. 0,17 A).
2. **Corte de energia com o robô PARADO (~10:30), durante o B3-F50.** O robô reiniciou sozinho com
   `reset=LIGOU (poweron)` (não BROWNOUT): a energia foi interrompida por um instante. O ToF frontal (0x31) NÃO voltou:
   `id=0x0000`, 0x29 respondendo (o sensor reiniciou e voltou ao endereço de fábrica), 441 erros de I²C, 1 queda.
   Ao mandar `tofrec` (reinício pelo XSHUT) o sensor voltou a funcionar normalmente. Mesmo padrão do ToF direito em
   16/11 (3V3 do módulo oscilando).
3. **Causa não identificada** (o operador não sabe se encostou no cabo/conector/balancim). Hipóteses a verificar:
   (a) contato do conector JST da bateria ou do balancim; (b) o cabo vermelho/preto pendendo além das rodas e sendo
   puxado; (c) 3V3/XSHUT do ToF frontal (fiação, solda).

## O que NÃO é
Não foi o movimento dos motores: H6 e H7 (rodas a 6 V) e as retas A2/A3 não causaram reinício nem queda.

## O que pedir à equipe
- Reencaixar/trocar o conector JST da bateria e testar o balancim (contato intermitente).
- Prender o cabo da bateria DENTRO do chassi (hoje pende além das rodas e prende nas paredes do labirinto).
- Medir 3V3 e XSHUT do ToF frontal em funcionamento (multímetro, como foi feito no ToF direito em 16/11).
- Ver se há folga/solda fria no conector de 6 pinos do ToF frontal.

## Atualização (10:3x): o ToF frontal CAI SOZINHO, sem corte de energia do robô
Segunda queda do ToF frontal (0x31) em ~5 min com o robô PARADO e o resto ligado (uptime contínuo: 173 s -> 262 s,
reset=poweron do boot anterior; `tof quedas F=2`, 715 erros de I²C, XSHUT automático F=1). Recuperável com `tofrec`
(XSHUT), mas volta a cair: ToF frontal instável (3V3/XSHUT/fiação do módulo frontal), mesmo padrão do ToF direito de 16/11.
Esquerdo e direito sem nenhum erro nesse período. Prioridade para a equipe: medir 3V3 e XSHUT do módulo frontal em
funcionamento e rever o conector de 6 pinos e as soldas.

## Atualização (10:39): a placa inteira reiniciou por BROWNOUT, de novo parado, durante o B3-D50
Boot 0d7b97 às 10:38:57, ~8 s depois do início do teste (o operador estava ajustando a parede do lado direito).
`reset=BROWNOUT (a tensao caiu)`, bat=7,69 V (era 7,95 V no H7). Depois do reinício, zero erros de ToF/IMU/INA.
Resumo dos eventos de alimentação/sensor em ~45 min, todos com o robô PARADO e o operador mexendo perto do robô:
  - BROWNOUT na partida (2 de 5 partidas); poweron sem pedido (~10:30); ToF frontal caiu 3 vezes (10:31 a 10:37);
  - BROWNOUT da placa inteira (10:38).
Nenhum evento durante o movimento dos motores (H6, H7, A2, A3, A4).

## B1 (10:47 e 10:52): o robô REINICIA quando os motores partem com carga no chão
Duas tentativas, mesmo resultado: com o robô no chão (azulejo) o 1º `andar` foi executado (o robô andou ~1 a 2 células, foto
do operador) e a placa reiniciou sozinha (`reset=LIGOU (poweron)`; boots 0d7b97->684ac0 e 26d89b->d4f9ac). Na 2ª tentativa
o cabo da bateria estava preso com fita crepe (segundo o operador) e o resultado se repetiu. No ar (A2, A3, A4, H6, H7) os
mesmos motores NÃO derrubam a energia (bateria mín. 7,95 V, corrente máx. 0,17 A). Bateria em ~7,76 a 7,86 V.
Hipóteses para a equipe: (a) queda de tensão no arranque com carga (resistência interna da bateria/conectores/fios finos),
(b) conector JST de 2 pinos ou balancim com contato intermitente sob corrente, (c) regulador que cai (dropout) com a bateria
em ~7,8 V. Teste sugerido: medir a tensão na entrada do regulador durante o arranque, com osciloscópio ou multímetro de
mínimo/máximo, e trocar o conector JST por um de maior corrente (XT30).

## T6 (10:53): o reinício NÃO é queda de tensão por corrente — suspeita de CHOQUE MECÂNICO / contato intermitente
Degraus de motor com o robô no CHÃO (azulejo com rejunte), amostra a cada 100 ms do INA219:
  - 2,0 V, 1000 ms: andou ~17 mm, I média 0,13 A, I máx 0,18 A, bateria mín 7,62 V. SEM reinício.
  - 3,0 V: t=100..400 ms, I = 0,14 a 0,15 A, bateria 7,68 a 7,71 V (sem queda), andou ~40 mm em 400 ms; a placa
    REINICIOU (boot 91fbbf) logo depois, a ~0,4-0,5 s do arranque, com corrente e tensão normais na última amostra.
Conclusões: (1) a corrente é baixa (0,15 A); (2) a tensão da bateria não afunda antes do reset; (3) com o robô no AR os
mesmos motores a 6 V (1,5 s) nunca reiniciaram. Isso aponta para contato intermitente por CHOQUE/VIBRAÇÃO quando o robô se
move no chão (rejunte do azulejo, trancos de aceleração): conector JST da bateria, balancim, bateria solta dentro do
chassi, pinos do ESP32 na placa ou conectores dos ToF. Pedido: apertar/soldar conectores, prender a bateria no chassi,
revisar os pinos do ESP32 e repetir o teste numa superfície lisa e plana (MDF do labirinto).

## T6c (10:57): CONFIRMADO — no piso liso do labirinto (MDF) o mesmo degrau NÃO reinicia
3,0 V por 800 ms no MDF: andou ~113 mm (321 pulsos), I média 0,14 A (máx 0,18 A), bateria mín 7,79 V, sem reinício
(boot 685296 mantido). No azulejo com rejunte, o mesmo degrau reiniciou a placa (T6b, boot 91fbbf). Conclusão: o reinício é
disparado por CHOQUE/VIBRAÇÃO ao cruzar o rejunte (contato intermitente), não por falta de corrente. O ToF direito continua
caindo ~1 a 2 min depois de CADA partida (mesmo padrão de 16/11), independente do movimento.

## Revisão final (11:2x): no MDF liso o robô anda normal com o padrão; os reinícios em movimento foram no AZULEJO
No piso de MDF do labirinto (rodas realmente apoiadas), com `tof_na_reta=1` (padrão), 4 manobras seguidas sem reinício:
`andar` 504/504 pulsos (giro 1,0), `andar` 507/507 (giro -0,2), `re` -511/-511 e `re` -507/-507. No azulejo (rejunte) houve
reinício em B1 (2x) e a 3 V (T6b). Resta UM reinício sem explicação (10:58, `andar` no corredor, localização incerta do robô).
O teste decisivo de `tof_na_reta=0` foi descartado (robô estava no suporte). Chave `tof_na_reta` continua disponível, padrão 1.
Pedido à equipe: tratar o ToF direito (cai 1-2 min depois de cada partida) e o BROWNOUT na partida (2 de 6 partidas).
