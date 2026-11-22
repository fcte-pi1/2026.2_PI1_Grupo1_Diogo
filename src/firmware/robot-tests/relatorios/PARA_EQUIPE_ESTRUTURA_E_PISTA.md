# Para a equipe de estrutura e pista — medidas e achados de 19/11/2026

> **ERRATA (19/11, operador, versão corrigida):** o **robô físico** (estrutura, eletrônica, energia, fiação) **não será mexido em nada até segunda-feira**.
> **O firmware PODE ser alterado**: quem opera é da equipe de software. Os pedidos de hardware às equipes valem a partir de segunda; até lá os testes usam o robô
> **fisicamente como está** (ToF direito fora do ar, cabo da bateria como está). Firmware atual gravado: 11:01:54, com `ganho_rumo=0.6`, `centralizar=1`, `tof_na_reta=1`.
> Mudanças de firmware continuam exigindo a aprovação do operador antes de aplicar, e a gravação só com a bateria desligada e o USB ligado.

## Medidas feitas hoje
- **Largura com as rodas: 108 mm** (trena, roda a roda): confere com o CAD e com `largura_com_rodas=108`. Folga lateral no corredor de 168 mm: **30 mm por lado**.
- Cabo da bateria (vermelho/preto): faz uma alça **~10 mm para fora** do lado esquerdo do chassi, além da linha das rodas: **prende nas paredes**. Precisa ficar preso dentro do chassi.
- **Frente do robô (CONFLITO, ainda não medida):** CAD 107,25 chassi / 107,75 até a face do ToF; campo ~85 a 91; `.3mf` 102,25. O firmware usa 87 / 85. **Pendente: paquímetro** (eixo até a frente do chassi, até a face do ToF frontal, e quanto sai de cabo à frente).
- Apoio frontal: **esfera metálica** num suporte branco (não roda boba).

## Pista (labirinto de MDF)
- O corredor reto usado como "4 células" tem **~3,7 células (~670 mm)** entre as pontas: a 3ª reta de 179 mm chega à parede do fundo.
- Algumas paredes são de papel/MDF fino coladas e **levemente tortas/descoladas** (rejunte de cola visível); uma das paredes tem degrau na emenda.
- O **azulejo do piso (com rejunte)** é um ambiente ruim para o robô: reinicia a placa ao partir; o MDF liso funciona.

## Pedidos
1. Medir com paquímetro as três cotas da frente e o cabo (ver `MEDICOES.md`).
2. Montar **um canto** (curva de 90°) no labirinto: sem ele não dá para testar as curvas (B4/B5/C).
3. Reforçar/alinhar as paredes do corredor e deixar 4 células livres de verdade (180 mm cada) para os testes de reta.
4. Prender o cabo da bateria dentro do chassi (item da equipe de energia).

---

## Atualização de 21/11/2026 (noite)
**Correção:** o pedido 1 acima (paquímetro) fica assim: **o operador não tem paquímetro**. As medidas do robô foram feitas com **fita métrica e trena**, com precisão de ~2 a 3 mm
(frente 100 mm, ToF frontal 98 mm, largura da frente 112 mm, ToF lateral a 55,5 mm do centro). Quem tiver paquímetro: medir o cabo da bateria (item 1 abaixo) e o eixo até a frente.

O robô agora **completa a serpentina** (~52 s). O que sobra é **mecânico**, e a estrutura pode resolver:

1. **Cabo da bateria (prioridade 1).** Ele sai **~10 mm (estimativa) para fora da lateral esquerda** e estreita a "janela" da curva em S à esquerda. Pelo modelo (`domain/CellTurn`): **cabo rente = folga de 7,4 mm; 10 mm = 4,4 mm; 14 mm = 2,3 mm; 18 mm = 0,2 mm; acima disso a curva não cabe.** Prender o cabo **rente ao chassi** é a melhor melhoria; o conector JST também.
2. **Motor/caixa de redução direita (prioridade 2).** Na corrida 51 o motor direito exigiu **7,2 V contra 3,1 V no esquerdo** para andar igual; depois de **limpar**, 3,5 V contra 3,5 V. O arrasto é **intermitente** e some e volta. Para o N20 (6 V, 750 RPM, com encoder, ~R$ 76 cada): **trocar o direito** ou abrir a caixa, limpar com cotonete e passar **uma quantidade mínima de graxa leve de silicone ou PTFE** para engrenagem plástica.
3. **Pneus.** O 1º giro depois de ligar patinou nas duas rodas (288 pulsos contra ~180 para o mesmo giro). **Limpar só com fita adesiva e álcool isopropílico no pneu; se houver óleo, água morna com detergente neutro e depois álcool.** **Não usar WD-40 nem limpa-contatos** nas rodas ou nas caixas: ele lava a graxa e deixa filme na borracha.
   Teste simples do diâmetro: **uma volta de cada pneu sobre um barbante**, medir o barbante: se o direito for 2 a 3% menor, está confirmado.
4. **Paredes e postes do labirinto.** O modelo supõe corredor de **168 mm** (parede de 12 mm, célula de 180) e **postes de 12x12 mm nos 4 cantos**. As folgas das curvas em S são de **4 a 7 mm**: parede torta ou poste maior de 2 a 3 mm já muda o resultado. Conferir largura do corredor e o alinhamento dos postes nas células (l2,c1), (l2,c3) e (l0,c1).
5. **Piso do labirinto:** passar **pano úmido ou de microfibra** antes de cada sessão (poeira faz a roda patinar).
6. O robô **raspa na parede direita** na saída das curvas; a causa não está fechada (ver `PASSAGEM_CALIBRACAO.md`). Qualquer folga do lado direito (parede, pneu) ajuda.
