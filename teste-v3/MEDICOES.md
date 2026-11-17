# Como medir cada valor do `calib` com régua e paquímetro

Este guia explica, passo a passo, como medir cada valor que o robô usa no comando `calib`, e como conferir a medida com o próprio robô. Os valores entram no robô pelo Bluetooth, sem regravar o firmware:

```
python t.py medidas                         # pergunta as medidas do corpo, uma por uma
python t.py calib "nome=valor nome=valor"   # grava um ou mais valores
python t.py calib-ver                       # mostra o que está em uso
python t.py calib "padrao"                  # volta tudo aos valores de 16/11
```

O robô **recusa** um valor fora da faixa aceita e, nesse caso, **não muda nada**. A tabela completa está na seção 6 do `src/firmware/LOGS_E_MEDIDAS.md`.

---

## 1. Antes de medir

### Material

| Item | Para quê |
|:--|:--|
| Paquímetro (de preferência digital, 150 mm) | Larguras e distâncias curtas, com precisão de 0,1 mm |
| Régua de 30 cm | Distâncias maiores que o paquímetro e alinhamentos |
| Esquadro (ou uma caixa com quina reta) | Fazer uma "parede" perpendicular à mesa |
| Folha de papel A4, fita crepe e lápis | Marcar pontos no chão |
| Mesa plana | Todas as medidas com o robô apoiado nas rodas, como no chão da pista |

### Como usar o paquímetro

- **Zere antes:** feche as pontas até encostarem e confira se o visor marca 0,0 (digital: aperte ZERO).
- **Bicos de fora** (as pontas grandes): medem por fora. É assim que se mede uma largura: o robô fica entre os bicos.
- **Haste de profundidade** (a lingueta que sai pela ponta da régua do paquímetro): mede a distância de uma superfície até um ponto mais fundo. Serve para medir "da parede até o eixo".
- **Aperte de leve:** os bicos só encostam. Apertar deforma o pneu e muda a medida.
- **Meça três vezes** e use a média. Se as três diferirem em mais de 1 mm, alguma estava torta: meça de novo.
- **Nunca encoste o paquímetro na janela dos sensores ToF** (o quadradinho preto). Encoste na placa do sensor, ao lado da janela.

### O ponto de referência: o "meio do eixo"

Quase todas as medidas partem do **meio do eixo das rodas**. É o ponto **no meio** entre as duas rodas, **na linha que passa pelo centro das duas rodas**. É em volta dele que o robô gira.

Como achar:
1. Olhe o robô **de lado**. O centro da roda é o centro do eixo do motor: o ponto no meio do cubo, onde a roda prende no motor.
2. A **linha do eixo** é a linha que liga o centro da roda esquerda ao centro da roda direita.
3. Para as medidas de comprimento (até a frente), basta o **centro de uma roda**: as duas rodas estão na mesma linha.

**Truque para marcar o eixo no chão:**
1. Cole uma folha A4 na mesa com fita crepe e ponha o robô em cima, apoiado nas rodas.
2. Encoste a régua **em pé**, de lado, rente ao pneu esquerdo, com a régua passando pelo **centro do cubo** da roda.
3. Faça um risco no papel onde a régua toca. Faça o mesmo na roda direita.
4. Tire o robô. A linha entre os dois riscos é o eixo. O **meio dela** é o "meio do eixo".

### Como fazer uma "parede" para medir

Muitas medidas são "do eixo até o ponto mais à frente". O jeito mais preciso:
1. Ponha o robô em cima da folha, com a frente perto de um **esquadro em pé** (ou uma caixa de quina reta), que serve de parede.
2. Empurre o robô devagar **até o ponto mais à frente encostar** na parede, com o robô **reto** (as duas rodas à mesma distância da parede).
3. Marque o eixo no papel (truque acima) **sem mexer no robô**.
4. Tire o robô e meça no papel, com a régua ou o paquímetro, **da parede até a linha do eixo**.

---

## 2. As medidas do corpo (entram pelo `python t.py medidas`)

As três primeiras **mudam onde a curva começa**. O robô calcula sozinho o novo ponto (a linha `calib: fim: arco comeca com o frontal a X mm` mostra o resultado). As outras três, por enquanto, ficam só registradas: serão usadas nas próximas mudanças, para centralizar depois das curvas.

### `eixo_ate_frente`: do meio do eixo até o ponto mais à frente do robô
- **Faixa aceita:** 60 a 115 mm. **Valor de 16/11:** 87 mm (estimado pelo desenho).
- **O que conta como "mais à frente":** **qualquer** coisa que sobressaia na frente: o chassi, o suporte do sensor, uma placa, um fio, um parafuso. É isso que bate na parede numa curva.
- **Como medir:** pelo método da "parede" (seção 1). Meça da parede até a linha do eixo.
- **Conferência:** com a régua, meça também do eixo até o ponto mais à frente olhando o robô de lado. As duas medidas devem bater em ±2 mm.

### `largura_frente`: largura do robô na parte da frente
- **Faixa aceita:** 80 a 130 mm. **Valor de 16/11:** 100 mm (o desenho do chassi).
- **O que conta:** a largura **na frente do eixo**, no ponto mais largo, **com os suportes dos sensores laterais**, as placas e tudo o que sobressai. **Não** conte as rodas: elas ficam atrás, no eixo.
- **Como medir:**
  1. Abra o paquímetro mais que o robô.
  2. Passe os **bicos de fora** pelos dois lados do robô, **na frente das rodas**.
  3. Feche até encostar dos dois lados e deslize de leve para a frente e para trás: a **maior** leitura é a largura.
- **Se o paquímetro for curto** (abre só 150 mm): ponha o robô entre duas caixas encostadas nos lados, tire o robô e meça a distância entre as caixas com a régua.

### `eixo_ate_tof_frente`: do meio do eixo até a face do sensor de distância da frente
- **Faixa aceita:** 60 a 115 mm. **Valor de 16/11:** 87 mm (estimado). A foto de 16/11 em A2 sugere **~85 mm**.
- **O que é a "face":** a frente da **janela** do sensor (o quadradinho preto), não a borda da placa.
- **Como medir:** pelo método da "parede", mas encostando a parede **na placa do sensor da frente, rente à janela**, sem tocar na janela. Se outra coisa sobressair mais que o sensor e impedir a parede de chegar nele, meça com a **haste de profundidade** do paquímetro: apoie a ponta do paquímetro na frente da janela e meça até a linha do eixo marcada no papel.
- **Conferência com o próprio robô (recomendada):**
  1. Ponha o robô na pista, numa célula com parede à frente, reto.
  2. Meça com a régua da **parede até o centro do cubo de uma roda** (a distância "parede–eixo").
  3. `python t.py cmd "tof"`: anote o **F=** das linhas 2 a 5 (a média).
  4. `eixo_ate_tof_frente` ≈ **parede–eixo − F**.
  5. Em 16/11 em A2: 127 − 42 = **85 mm**.

  Os ToF leem alguns mm a mais que o real (B3 de 16/11: o frontal ~+6 mm). Se a conferência der uns 5 mm a menos que o paquímetro, é isso. **Use o valor do paquímetro.**

### `largura_com_rodas`: largura total com as rodas
- **Faixa aceita:** 80 a 150 mm (0 = não medido). **Valor de 16/11:** não medido.
- **Como medir:** **bicos de fora** do paquímetro encostando na **face de fora de cada pneu**, na altura do centro da roda. Aperte de leve: o pneu é de borracha.
- **Para que serve:** é a largura que passa pelo corredor de 168 mm. A folga de cada lado = (168 − `largura_com_rodas`) ÷ 2.

### `tof_lado_ao_centro`: da face de um sensor lateral até a linha do meio do robô
- **Faixa aceita:** 20 a 75 mm (0 = não medido). **Valor de 16/11:** não medido. O firmware supõe ~34 mm.
- **Como medir:**
  1. Meça com os **bicos de fora** do paquímetro a distância **entre as faces dos dois sensores laterais**: um bico encostado na placa do sensor esquerdo, rente à janela, e o outro na do direito.
  2. Divida por 2.
- **Conferência com o próprio robô:**
  1. Ponha o robô num corredor com parede dos dois lados, **no meio exato** (meça com a régua: a mesma distância de cada parede até o robô), e reto.
  2. `python t.py cmd "tof"`: anote **E=** e **D=** (a média das linhas 2 a 5).
  3. `tof_lado_ao_centro` ≈ (168 − E − D) ÷ 2. O corredor tem 168 mm entre paredes (180 − 12).

### `tof_lado_a_frente_do_eixo`: quanto os sensores laterais ficam à frente do eixo
- **Faixa aceita:** 0 a 115 mm (0 = não medido). **Valor de 16/11:** não medido.
- **Como medir:**
  1. Olhe o robô de lado. Encoste a régua no centro do cubo da roda e leve-a, deitada e reta, até a **janela** do sensor lateral.
  2. Meça a distância, **ao longo do comprimento do robô**, do centro da roda até o **meio da janela** do sensor lateral.
  3. Faça dos dois lados. Se derem diferentes, use a média e anote a diferença.

---

## 3. Os valores do giroscópio e das curvas

Estes **não se medem diretamente com régua**: o robô mede, e a régua só confere.

### `escala_giro`: correção da escala do giroscópio
- **Faixa aceita:** 0,90 a 1,20. **Valor de 16/11:** 1,08.
- **Por que existe:** o giroscópio do robô é um clone (responde 0x72, e não 0x68 como o original) e lê ~8% a menos do que o robô gira.
- **Como medir (recomendado, sem régua):** `python t.py calib-giro`, num corredor da pista com **parede contínua de um lado** e 3 células livres. O robô anda ao lado da parede, faz uma volta (4 curvas) e anda de novo. A inclinação em relação à parede, antes e depois, diz quanto ele girou de verdade. Repita até o "erro da volta" ficar abaixo de 1,5 grau.
- **Como medir com régua (se o `calib-giro` não puder ser usado):**
  1. Cole no chão uma **fita reta** de ~50 cm.
  2. Ponha o robô com a **lateral** encostada na fita (as duas rodas rentes a ela).
  3. `python t.py cmd "virar d"` **4 vezes**, uma depois da outra, sem mexer no robô.
  4. Depois da volta, encoste a régua **na lateral do robô**, deitada, saindo para trás.
  5. Meça, a **100 mm** de distância ao longo da régua, quanto a régua se afastou da fita (o desvio, em mm).
  6. Erro da volta, em graus ≈ desvio × 0,57 (porque 1 grau a 100 mm dá ~1,75 mm).
  7. **Escala nova = escala em uso × (360 + erro) ÷ 360**, com o erro **positivo se o robô passou** da volta (virou mais que 360) e **negativo se faltou**.
  8. **Exemplo:** passou ~5 graus com 1,08: 1,08 × 365 ÷ 360 = **1,095**.

### `freio_arco` e `freio_pivo`: quantos graus antes dos 90 a curva freia
- **Faixa aceita:** arco 0 a 20; pivô 0 a 30. **Valores de 16/11:** 7,5 e 13,5.
- **Por que existem:** o robô continua girando depois de frear. Quanto ele gira depende do **piso**: no papel escorregou ~4 cm, na pista nada.
- **Como ajustar (recomendado):** `python t.py calib "autoajuste_freio=1"`. O robô mede em cada curva quanto girou depois do freio (linha `curva: freio:`) e acerta a próxima sozinho.
- **Como medir pelo log:** em cada curva, a linha `curva: alvo=90 parou=P final=F`. O robô girou **F − P** graus depois de frear. Faça 3 curvas de cada lado e use a média como `freio_arco` (ou `freio_pivo`).
- **Como conferir com régua (folha com um "L"):**
  1. Desenhe numa folha um **L** (dois traços em ângulo reto) e prenda no chão.
  2. Robô com o **eixo no canto do L** e a frente ao longo de um traço.
  3. Faça a curva (`pivo d` para o pivô).
  4. Meça, na **ponta da frente** do robô, a distância até o outro traço do L (o desvio) e a distância da ponta até o eixo (`eixo_ate_frente`).
  5. Erro em graus ≈ desvio ÷ `eixo_ate_frente` × 57.
  6. Passou da linha: **aumente** o freio nesse tanto. Faltou: **diminua**.

### `autoajuste_freio`: 0 ou 1
Liga (1) ou desliga (0) o ajuste automático acima. Não se mede.

---

## 4. Os valores das retas

### `parada_frente`: quando a reta para ao ver parede à frente
- **Faixa aceita:** 20 a 90 mm. **Valor de 16/11:** 35. **Valor calculado para testar:** 65.
- **O que é:** a reta para quando o sensor da frente lê menos que isto. Depois de disparar, o robô ainda anda ~2 cm até parar. O sensor só mede bem a partir de ~40 mm.
- **Como medir:**
  1. Numa célula com parede à frente, faça o robô chegar andando: `python t.py cmd "andar"` a partir da célula anterior.
  2. Com o robô **parado**, meça com a régua (ou com a **haste de profundidade** do paquímetro) a distância do **ponto mais à frente** do robô até a **parede**.
  3. A meta é **40 a 50 mm**.
  4. **Valor novo = valor em uso + (45 − medido)**.
  5. **Exemplo:** com 35 em uso, o nariz parou a 12 mm: 35 + 33 = **68**.
- **Conferência pelo log:** na curva seguinte, a linha `inicio do arco: ... frontal X mm na parada` deve mostrar X acima de 40, e não deve aparecer "ajuste antes da curva".

### `centralizar`: 0 ou 1
Liga (1) a correção da reta pelos sensores laterais. Não se mede. Para conferir se ajudou:
1. Num corredor com parede dos dois lados, depois de `andar`, meça com a régua a distância de **cada pneu** até a parede do seu lado.
2. A diferença entre os dois lados deve ficar **abaixo de 5 mm**.

### `ganho_rumo`: força com que o giroscópio segura o rumo na reta
- **Faixa aceita:** 0 a 3. **Valor de 16/11:** 0 (desligado). **Valor para testar:** 1,0.
- Não se mede diretamente. Para conferir, use o teste **B1** (5 células no chão livre): meça com a régua o **desvio lateral** no fim. Em 16/11 foi **22 mm**, e com o ganho certo deve diminuir.
- **Se o robô entortar MAIS:** volte a 0 (`python t.py calib "ganho_rumo=0"`) e avise. Seria o sinal da correção invertido.

---

## 5. Medidas que ainda NÃO entram pelo `calib`

Estas existem no `LOGS_E_MEDIDAS.md`, mas mudá-las exige alterar o código (com aprovação). Vale medir no mesmo dia e anotar no `RESULTADOS.md`.

| Medida | Como medir | Onde entra hoje |
|:--|:--|:--|
| **Eixo até a traseira** (M5) | Método da "parede" (seção 1), encostando a **traseira** na parede. Conte o pneu e o que sobressair atrás | Ainda em nenhum lugar: limite do recuo e da ré |
| **Diâmetro da roda** (M7) | Bicos de fora do paquímetro na **borracha**, no meio do pneu, sem apertar. Meça as duas rodas, 3 vezes cada | `kWheelDiameterMm` = 32 mm (medido em 11/11) |
| **Bitola** (M8) | Do **meio** de um pneu ao **meio** do outro. Jeito fácil: `largura_com_rodas` − largura de um pneu | `kWheelTrackMm` = 88 mm (valor de projeto) |
| **Raio das quinas da frente** (M4) | Compare a quina com moedas ou um gabarito de raios | Ainda em nenhum lugar |

---

## 6. Ordem sugerida no dia

1. Com o robô **desligado**, na mesa: as seis medidas do corpo (seção 2) e as da seção 5.
2. `python t.py medidas` com o robô ligado e conectado, para gravar.
3. Na pista: a conferência do `eixo_ate_tof_frente` e do `tof_lado_ao_centro` com o `tof` (seção 2).
4. `python t.py calib-giro` (seção 3).
5. Os testes do dia, ligando `parada_frente`, `autoajuste_freio`, `ganho_rumo` e `centralizar` **um por vez**, como no `ROTEIRO_23-11.md`.
6. No fim, `python t.py calib-ver` e anote a combinação final no `RESULTADOS.md`.
