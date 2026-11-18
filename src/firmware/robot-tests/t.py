"""Roteiro de testes do robô, um teste por vez (firmware v3).

A ponte tem de estar aberta em OUTRA janela (python ponte.py). Depois:

    python t.py                 lista os testes e o que já foi feito
    python t.py H1              roda o teste H1: mostra o preparo, espera o seu "ok", manda o
                                comando, espera o robô, julga e anota
    python t.py portao          checagem rápida dos sensores (rode antes de cada bloco)
    python t.py reiniciar       reinicia o robô e espera ele reconectar
    python t.py parar           freia o robô
    python t.py cmd "tof"       manda um comando avulso e mostra a resposta
    python t.py nota H1 "..."   acrescenta uma observação ao teste H1
    python t.py resumo          mostra o resumo dos resultados
    python t.py preparo H1      só mostra o preparo e o critério do teste, sem mandar nada
    python t.py responder C4 encostou=n virado_para=B2
                                registra as respostas do operador a um teste rodado com --auto

Calibração sem regravar o firmware (comando `calib` do robô, gravado na memória dele):

    python t.py calib-ver       mostra os valores em uso no robô
    python t.py medidas         pergunta as medidas do robô (paquímetro) e grava no robô
    python t.py calib-giro      o robô mede sozinho a escala do giroscópio (4 curvas ao lado de uma
                                parede) e propõe o valor
    python t.py calib "parada_frente=65 autoajuste_freio=1"
                                grava um ou mais valores (nome=valor); "padrao" volta aos de fábrica

Corrida em qualquer labirinto (oficial ou montado), sem sequência esperada:

    python t.py corrida OF-4x4-A "4x4 oficial, layout A, largada D4 pela esquerda"
                                manda "largar", espera o fim, salva o log em
                                resultados/logs/corridas/<rotulo>/<rotulo>_t<N>.log, imprime as métricas
                                e acrescenta uma linha em resultados/corridas.csv

Com --auto o teste roda sem perguntar nada (para um programa conduzir): o preparo é só impresso,
e as perguntas ao operador saem como "PERGUNTAR:" para quem conduz responder com "nota".

Durante um teste, Ctrl+C manda "parar" ao robô na hora.

O código fica no pacote `suite/` (a linha de comando em suite/cli.py); este arquivo é só o ponto
de entrada.
"""

import sys

from suite.cli import main

if __name__ == "__main__":
    sys.exit(main())
