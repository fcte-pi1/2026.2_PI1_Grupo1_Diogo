# Roteiro de segunda, 23/11: bateria detalhada e calibração

Mesmo firmware de 18/11. Cada novidade é ligada pelo `calib`, UMA por vez, e medida antes e depois.
Se uma piorar, desligue (o comando de volta está em cada passo) e siga.

Build: `CONFIG_RATO_LOG_RETA=y`, `CONFIG_RATO_FIOS_MOTORES_TROCADOS=y`; `RATO_BANCADA`,
`RATO_CENTRALIZAR_PAREDES` e `RATO_SLOW_DECAY` desligados. Comece com `python t.py calib "padrao"`
e regrave as medidas com `python t.py medidas`.

## 1. Hardware (bloco H inteiro)

`python t.py portao`, depois H1 a H8 na ordem. O H3 (cabos dos ToF) é o que prova a solda do ToF
direito. H8: todos os contadores em zero. Se o H1 ou o H3 falhar duas vezes: pare, é montagem.

## 2. Medidas e giroscópio

1. `python t.py medidas`: eixo até a frente, largura da frente, eixo até o ToF da frente, largura
   com as rodas, ToF lateral ao centro, ToF lateral à frente do eixo (paquímetro, mm).
2. `python t.py calib-ver`: a linha `calib: fim: arco comeca com o frontal a X mm` mostra o efeito.
3. `python t.py calib-giro` num corredor com parede contínua de um lado e 3 células. Repita até o
   "erro da volta" ficar abaixo de 1,5 grau (em geral uma ou duas vezes).

## 3. No ar e no chão livre (blocos A e B)

A1 a A5; B1 e B2 (régua: 900 ± 25 mm e 540 ± 15 mm); B3 (12 medidas); B4d/B4e; B5d x3 e B5e x3.
Meta nas curvas: `final` entre 88 e 92 no arco.

## 4. Labirinto, uma manobra por vez (bloco C), com o padrão

C1, C2, C3, C4 x3, C5 x3, C6 x3, C7 x3, C8. Anote, em cada curva com parede, se apareceu
"ajuste antes da curva" e o "frontal X mm na parada". No C8: segure ~1 s e SOLTE antes de o robô
tentar voltar (em 16/11 o "desfez o arco" não voltou; queremos saber se foi a mão).

## 5. Novidades, uma por vez (repita os testes indicados e compare)

| # | Ligar | Repetir | Passa se | Desligar |
|:--|:--|:--|:--|:--|
| 1 | `python t.py calib "parada_frente=65"` | C4 x3, C5 x3 | `frontal X mm na parada` acima de 40 e NENHUM "ajuste antes da curva"; sem encostar | `calib "parada_frente=35"` |
| 2 | `python t.py calib "autoajuste_freio=1"` | B5d x3, B5e x3, C4 x3 | a linha `curva: freio:` converge e `final` fica entre 88 e 92 | `calib "autoajuste_freio=0"` |
| 3 | `python t.py calib "ganho_rumo=1.0"` | B1, C3 de frente (`andar` x3 no corredor) | `giro=` de cada reta perto de 0 e desvio lateral menor que antes (22 mm em 16/11). Se entortar MAIS: desligue e avise (sinal invertido) | `calib "ganho_rumo=0"` |
| 4 | `python t.py calib "centralizar=1"` | C3, `andar` x3 no corredor, a curva em C1 seguida de `andar` | `lat E=` e `lat D=` perto um do outro no fim de cada reta; sem balançar; entra em B1 sem pegar a quina | `calib "centralizar=0"` |

Deixe ligado o que passou. Anote a combinação final (`python t.py calib-ver`).

## 6. Corridas (bloco D) com a combinação final

D1 x3, D2 x3, D3, D4, D5, D6, D7. Em cada corrida, o log tem de mostrar:

- `fim da corrida N: SUCESSO`, `passagens para fora=0`, `movimento: 0 arco(s) repetido(s)`;
- nenhuma reta com `giro=` acima de ~3 graus e nenhum `rumo perdido`;
- `saude`: zero erros de I2C e zero quedas de ToF;
- tempo por célula (carimbos das linhas `nav: passo`) menor ou igual ao de 16/11 (~2,6 s na média).

## 7. Uma pista DIFERENTE do desenho 4x4

Mude pelo menos 4 paredes internas (crie um beco novo e abra um laço) e rode 3 corridas de cada
canto. Se houver peças, monte um 8x4 (via 1 fechada) e rode 2 corridas. Passa se chega ao canto
oposto nas mesmas condições do passo 6. É o teste que mostra que nada ficou ajustado para a pista
da equipe. Rode também duas corridas seguidas SEM reiniciar, trocando paredes entre elas: a
segunda tem de começar com o mapa zerado (linha `nav: mapa` do fim da 2ª só com o que ela viu).

## 8. Fechamento

`python t.py`, os números finais do `calib-ver`, a pasta `resultados/` compactada e os vídeos.
Com esses dados entram as mudanças seguintes: rumo absoluto entre movimentos e não parar no centro
da célula quando o caminho segue reto.
