# Para a equipe de energia e eletrônica — achados de 19/11/2026 (robô `rato-01`)

> **ERRATA (19/11, operador, versão corrigida):** o **robô físico** (estrutura, eletrônica, energia, fiação) **não será mexido em nada até segunda-feira**.
> **O firmware PODE ser alterado**: quem opera é da equipe de software. Os pedidos de hardware às equipes valem a partir de segunda; até lá os testes usam o robô
> **fisicamente como está** (ToF direito fora do ar, cabo da bateria como está). Firmware atual gravado: 11:01:54, com `ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1`.
> Mudanças de firmware continuam exigindo a aprovação do operador antes de aplicar, e a gravação só com a bateria desligada e o USB ligado.

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

## Pedidos (em ordem de prioridade) — a partir de segunda-feira; até lá o robô fica como está
1. **ToF direito:** medir 3V3 e XSHUT do módulo em funcionamento (multímetro) e reencaixar/ressoldar o conector de 6 pinos; se não resolver, trocar o módulo.
2. **ToF frontal:** mesma medição; prender o cabo/conector do módulo frontal para não ser tocado.
3. **Conector JST de 2 pinos da bateria e balancim:** trocar/reapertar (contato intermitente). Sugestão: conector de maior corrente (XT30) e balancim mais firme.
4. **Prender a bateria e todos os fios DENTRO do chassi** (o cabo vermelho/preto pende ~1 cm para fora do lado esquerdo e prende nas paredes do labirinto).
5. **Pinos do ESP32 na placa perfurada e conectores dos ToF:** verificar solda fria.
6. Depois: repetir o teste T6 (3 V no azulejo e no MDF) para confirmar que os reinícios sumiram.

## Dados úteis
- Roda esquerda mais fraca: a 6 V E 2348 e D 2475 pulsos/s (5,4%); a 3 V E 1112 e D 1330 (20%). Lubrificar/inspecionar a engrenagem da roda esquerda.
- Firmware sempre reconfigura e reinicia o ToF que cai, mas só com o robô parado (entre células).

---

## Atualização de 21/11/2026 (noite): o que a pista mostrou
Firmware gravado `fase1-entrega-4` (tag `pista-21-11`), 50 corridas na serpentina (SERPENTINAS 5 a 54, logs no pacote de passagem). O firmware **não** é a causa do que segue.

**ToF direito (0x32) continua caindo sozinho.** Em ~2 h de sessão ele caiu **6 vezes** (aos 66 s, 115 s, 169 s, 856 s e outras), sempre com o robô **parado**, e o log diz o mesmo de 19/11: `0x32 NAO responde, 0x29 responde -> o sensor REINICIOU sozinho`.
Isso prova que **a alimentação (3V3) ou o XSHUT do módulo direito pisca**; não é fio solto de dados. Uma vez o **esquerdo** também ficou mudo junto com o direito (aos 42 s). O `python t.py cmd tofrec` recupera na hora; depois o sensor ficou estável (990 leituras seguidas sem falha) e as corridas 40 a 54 não tiveram queda.
- **Testei a hipótese de ser o firmware** (o cálculo de 4 planos no boot levava 40 s): a queda aconteceu com o robô parado, sem cálculo. **Não é o firmware.**
- **Sugestão de menor custo:** capacitor de **10 a 100 µF** (cerâmico + eletrolítico) o mais perto possível do pino 3V3 do módulo direito, e conferir o pino **XSHUT** dele (solda e trilha). Se o direito é o único que cai, o problema é local desse módulo.

**Reset:** em todas as partidas de hoje o motivo foi `LIGOU (poweron)` (a chave). **Nenhum BROWNOUT** nesta noite (bateria 8,0 V no cellmeter).

**INA219:** continua lendo oscilante e abaixo do real: 6,3 a 7,3 V enquanto o cellmeter dava 7,9 a 8,0 V. O limite de bateria do firmware foi baixado para 5,5 V só para os testes (`bateria_minima`). Vale a equipe conferir o shunt/endereço do INA.

**Motor direito (corrida 51):** para manter as duas rodas na mesma velocidade o robô pediu **7,2 V no motor direito contra 3,1 V no esquerdo** na ré, e 6,5 V contra 4,6 V na reta; depois de **limpar os motores**, 3,1 V contra 3,0 V. Um motor que pede o dobro de tensão consome mais corrente e pode ajudar a derrubar a alimentação. Ver o documento da estrutura (o motor/caixa de redução).

**Como a equipe confere sem o robô andar:**
    python t.py cmd tofrec        # reinicia o ToF que cair (pelo XSHUT)
    python t.py cmd "tofmon 60"   # 60 s de leitura dos 3 ToF, mostra falhas por segundo
    python t.py cmd saude         # quedas e reinícios por sensor, bateria, reset
Pedidos (continuam valendo os de 19/11): 1) ToF direito: 3V3 e XSHUT com multímetro e o capacitor acima; 2) revisar o conector de 6 pinos; 3) prender fios e o cabo da bateria (ver estrutura).
