# Para a equipe de energia e eletrônica — achados de 19/11/2026 (robô `rato-01`)

Bateria 2S LiPo (~8,0 V cheia, 7,8 V ao fim do dia). O operador **só pode mexer em software**: tudo abaixo precisa de mão de vocês.

## Defeitos observados (todos com o robô PARADO, ou no 1º arranque dos motores)
1. **ToF direito (0x32): cai 1 a 2 minutos depois de CADA partida** e volta ao endereço de fábrica 0x29; o `tofrec` (reinício pelo XSHUT) "dá certo" mas ele passa a ler `-1`. Mesmo padrão de 16/11
   (3V3 do módulo oscilando de 3,3 a 1,85 V). Depois das 10:30 o sensor deixou de ser confiável.
2. **ToF frontal (0x31): caiu 3 vezes** em ~7 min, sempre logo depois de o operador mexer na parede perto da frente (hipótese: toque mecânico no módulo ou no cabo). Voltou com `tofrec`.
3. **BROWNOUT (`reset=BROWNOUT`) ao ligar o balancim:** 3 de ~8 partidas. Depois de ligado fica estável (bateria 7,95 V sob 2 rodas a 6 V; corrente 0,12 A, máx. 0,17 A).
4. **Corte de energia sem pedido** (`reset=LIGOU (poweron)`) com o robô parado e a placa inteira reiniciando por BROWNOUT em repouso (10:38, bateria 7,69 V).
5. **Reinício ao partir com carga no azulejo:** B1 (2x) e a 3 V (T6b): a placa reinicia ~0,4 a 0,5 s depois do arranque, com corrente 0,14 A e tensão normal na última amostra (INA219, a cada 100 ms).
   No piso liso (MDF) o mesmo degrau NÃO reiniciou; ~30 manobras no MDF sem reinício (1 reinício sem explicação às 10:58 e 1 numa ré com `tof_na_reta=1`).

## O que NÃO é
Não é falta de corrente (0,14 a 0,18 A) nem afundamento da bateria antes do reset. Os motores a 6 V no ar (H6, H7) nunca reiniciaram a placa.

## Pedidos (em ordem de prioridade)
1. **ToF direito:** medir 3V3 e XSHUT do módulo em funcionamento (multímetro) e reencaixar/ressoldar o conector de 6 pinos; se não resolver, trocar o módulo.
2. **ToF frontal:** mesma medição; prender o cabo/conector do módulo frontal para não ser tocado.
3. **Conector JST de 2 pinos da bateria e balancim:** trocar/reapertar (contato intermitente). Sugestão: conector de maior corrente (XT30) e balancim mais firme.
4. **Prender a bateria e todos os fios DENTRO do chassi** (o cabo vermelho/preto pende ~1 cm para fora do lado esquerdo e prende nas paredes do labirinto).
5. **Pinos do ESP32 na placa perfurada e conectores dos ToF:** verificar solda fria.
6. Depois: repetir o teste T6 (3 V no azulejo e no MDF) para confirmar que os reinícios sumiram.

## Dados úteis
- Roda esquerda mais fraca: a 6 V E 2348 e D 2475 pulsos/s (5,4%); a 3 V E 1112 e D 1330 (20%). Lubrificar/inspecionar a engrenagem da roda esquerda.
- Firmware sempre reconfigura e reinicia o ToF que cai, mas só com o robô parado (entre células).
