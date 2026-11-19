"""Bloco O: orientação do labirinto (19/11). Toque longo no botão e comando `labirinto`, robô parado."""

from ..checks.orientation import check_long_presses, check_reported_start, check_short_press
from ..checks.race import RACE_END
from ..model import YES, Step, Test, yes_no
from .instructions import CLEAR_SURROUNDINGS, SUPPORTED

NO_MOTION = "As rodas NÃO devem girar em nenhum momento deste teste."
OPEN_SPACE = (SUPPORTED, CLEAR_SURROUNDINGS, NO_MOTION)
LONG_PRESS_EM_PE = r"toque longo: labirinto \d+x\d+ EM PE"
LONG_PRESS_DEITADO = r"toque longo: labirinto \d+x\d+ deitado"

ORIENTATION_TESTS: tuple[Test, ...] = (
    Test("O1", "Toque longo alterna em pé e deitado (sem mover)",
         OPEN_SPACE + (
             "Reinicie antes ('python t.py reiniciar'): o robô tem de estar no padrão do DIP.",
             "Depois do ok: SEGURE o botão de largada por ~1 s até ouvir os bips e SOLTE. Espere e faça de novo.",
             "O 1o toque longo dá 3 bips curtos (em pé); o 2o dá 1 bip longo (deitado). O teste espera até 60 s por toque."),
         (Step("", LONG_PRESS_EM_PE, timeout=60), Step("", LONG_PRESS_DEITADO, timeout=60)),
         "Dois 'toque longo' no log (EM PE e depois deitado), sem 'botao de largada acionado'.",
         check_long_presses,
         questions=(yes_no("bips", "Ouviu 3 bips curtos no 1o toque e 1 bip longo no 2o?", expected=YES),)),
    Test("O2", "Toque curto larga ao soltar e não alterna",
         OPEN_SPACE + (
             "Chave DIP: as 3 vias ABERTAS (OFF). Se mexeu na chave, rode antes 'python t.py reiniciar'.",
             "Depois do ok: aperte e SOLTE o botão rápido (menos de 1 s).",
             "O robô recusa a largada, porque não há paredes: as rodas ficam paradas."),
         (Step("", RACE_END, timeout=60, settle=1.5),),
         "'botao de largada acionado' aparece depois de SOLTAR, nenhum 'toque longo', e a largada é recusada.",
         check_short_press,
         questions=(yes_no("rodas_paradas", "As rodas ficaram PARADAS?", expected=YES),),
         ends_in_error=True),
    Test("O3", "4x4 girado pelo toque longo: o relato ao painel gira 90 graus",
         OPEN_SPACE + (
             "Chave DIP: 4x4 (vias 1 e 2 ABERTAS). Rode antes 'python t.py reiniciar'.",
             "Depois do ok: SEGURE o botão ~1 s (3 bips, 'EM PE') e SOLTE. O teste manda 'largar' sozinho.",
             "O robô recusa a largada (sem paredes) e as rodas ficam paradas. Confira o mapa no painel, se ele estiver aberto."),
         (Step("", LONG_PRESS_EM_PE, timeout=60), Step("largar", RACE_END, timeout=30, settle=1.5)),
         "Linha 'relato ao painel: labirinto 4x4, largada x=.. y=.. rumo .. (mapa girado)' com a largada "
         "girada: à esquerda x=3 y=3 rumo O; à direita x=0 y=3 rumo L.",
         lambda lines: check_reported_start(lines, rotated=True),
         questions=(yes_no("painel", "No painel, o mapa 4x4 apareceu GIRADO 90 graus, com a largada embaixo? "
                                     "(só responda s se estiver olhando o painel)", expected=YES),),
         ends_in_error=True),
    Test("O4", "Comando 'labirinto 4x8' (em pé) relatado como o deitado, girado",
         OPEN_SPACE + (
             "Qualquer DIP (o canto vem da via 3). Rode antes 'python t.py reiniciar'.",
             "Os comandos 'labirinto 4x8' e 'largar' são enviados pelo teste; o robô recusa a largada."),
         (Step("labirinto 4x8", r"labirinto da proxima largada: 4x8", timeout=10),
          Step("largar", RACE_END, timeout=30, settle=1.5)),
         "O log diz 'labirinto da proxima largada: 4x8 (em pe)' e o relato sai 8x4 girado: à esquerda "
         "x=7 y=3 rumo O; à direita x=0 y=3 rumo L.",
         lambda lines: check_reported_start(lines, rotated=True),
         ends_in_error=True),
)
