"""Conferências do bloco O: orientação do labirinto (toque longo no botão e comando `labirinto`)."""

from ..log_parsing import contains, find_matches
from ..verdict import Check

_START = r"largada \d+: labirinto (?P<cols>\d+)x(?P<rows>\d+), via 3 \w+ \(borda a (?P<side>ESQUERDA|DIREITA) do robo\)"
_REPORT = (r"relato ao painel: labirinto (?P<kind>\d+x\d+), largada x=(?P<x>\d+) y=(?P<y>\d+) "
           r"rumo (?P<heading>[NLSO])(?P<rotated> \(mapa girado\))?")
_LONG_PRESS = r"toque longo: labirinto (?P<cols>\d+)x(?P<rows>\d+) (?P<state>EM PE|deitado)"


def expected_report(cols: int, rows: int, border_left: bool, rotated: bool) -> tuple[int, int, str]:
    """(x, y, rumo) que o painel deve receber na largada. Espelha domain::ReportFrame.

    O robô larga no canto de baixo virado para o NORTE. Sem giro: x = coluna, y = linha. Com giro,
    largada à esquerda: rotação anti-horária (o rumo vira OESTE); à direita: horária (vira LESTE)."""
    if not rotated:
        return (0 if border_left else cols - 1), rows - 1, "N"
    if border_left:
        return rows - 1, cols - 1, "O"
    return 0, cols - 1, "L"


def check_long_presses(lines: list[str]) -> list[Check]:
    """O1: o toque longo alterna em pé e deitado, nessa ordem, e o relato diz 'mapa girado'."""
    presses = find_matches(lines, _LONG_PRESS)
    if len(presses) < 2:
        return [Check.failed(f"só {len(presses)} toque(s) longo(s) no log (esperado 2): segurou ~1 s?")]
    return [
        Check.judge(presses[0]["state"] == "EM PE", "1o toque longo: labirinto EM PE",
                    f"o 1o toque deu '{presses[0]['state']}': o robô já estava em pé? Reinicie e repita"),
        Check.judge(presses[1]["state"] == "deitado", "2o toque longo: voltou a deitado"),
        Check.judge(not contains(lines, "botao de largada acionado"),
                    "o toque longo NÃO largou a corrida", "o toque longo largou a corrida"),
    ]


def check_short_press(lines: list[str]) -> list[Check]:
    """O2: o toque curto larga ao soltar e não alterna nada."""
    return [
        Check.judge(contains(lines, "botao de largada acionado"), "o toque curto largou ao soltar",
                    "a largada não veio: apertou e soltou rápido (menos de 1 s)?"),
        Check.judge(not contains(lines, "toque longo"), "nenhum toque longo foi contado",
                    "contou toque longo: soltou rápido o bastante?"),
        Check.judge(contains(lines, "largada recusada"), "largada recusada (sem paredes): rodas paradas"),
    ]


def check_reported_start(lines: list[str], rotated: bool) -> list[Check]:
    """O3/O4: a posição e o rumo da largada que o painel recebe, com o giro esperado."""
    start = find_matches(lines, _START)
    report = find_matches(lines, _REPORT)
    if not start or not report:
        return [Check.failed("faltam as linhas 'largada ...' e 'relato ao painel' no log")]
    cols, rows = int(start[-1]["cols"]), int(start[-1]["rows"])
    x, y, heading = expected_report(cols, rows, start[-1]["side"] == "ESQUERDA", rotated)
    got = report[-1]
    return [
        Check.judge(bool(got["rotated"]) == rotated,
                    "relato " + ("girado" if rotated else "sem giro"),
                    f"relato {'girado' if got['rotated'] else 'sem giro'}, esperado "
                    f"{'girado' if rotated else 'sem giro'}"),
        Check.judge((int(got["x"]), int(got["y"]), got["heading"]) == (x, y, heading),
                    f"largada relatada x={got['x']} y={got['y']} rumo {got['heading']} (esperado "
                    f"x={x} y={y} rumo {heading})",
                    f"largada relatada x={got['x']} y={got['y']} rumo {got['heading']}, esperado "
                    f"x={x} y={y} rumo {heading}"),
        Check.judge(contains(lines, "largada recusada"), "largada recusada (sem paredes): rodas paradas"),
    ]
