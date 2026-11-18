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
                                manda "largar", espera o fim, salva o log em resultados/<rotulo>_t<N>.log,
                                imprime as métricas e acrescenta uma linha em resultados/corridas.csv

Com --auto o teste roda sem perguntar nada (para um programa conduzir): o preparo é só impresso,
e as perguntas ao operador saem como "PERGUNTAR:" para quem conduz responder com "nota".

Durante um teste, Ctrl+C manda "parar" ao robô na hora.
"""

import io
import json
import re
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "resultados"
LOG = RESULTS / "log_robo.txt"
COMMANDS = RESULTS / "comandos.txt"
STATE = RESULTS / "estado.txt"
REPORT = RESULTS / "RESULTADOS.md"
DONE = RESULTS / "feitos.json"

PASSOU, FALHOU, CONFERIR = "PASSOU", "FALHOU", "CONFERIR"

APOIADO = (
    "Robô APOIADO num suporte firme (uma caixa ou pilha de livros sob o chassi), com as DUAS "
    "rodas no ar e livres para girar. Não segure na mão."
)
LIVRE = "Nada a menos de 30 cm da frente e dos lados do robô (nem a sua mão)."
NAO_TOQUE = "Depois de dar o ok, não encoste no robô nem na mesa até o resultado aparecer."
CENTRADO = (
    "Robô no CHÃO da pista, no MEIO da célula (mesma distância das duas paredes laterais) e "
    "alinhado com o corredor."
)


# ----------------------------------------------------------------------------------------------
# Leitura do log e envio de comandos
# ----------------------------------------------------------------------------------------------
def clean(line):
    """Tira o prefixo "I (12345) " das linhas do robô."""
    return re.sub(r"^[IWE] \(\d+\) ", "", line.rstrip("\r\n"))


def state():
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"conectado": False, "boot": ""}


def log_size():
    return LOG.stat().st_size if LOG.exists() else 0


def read_from(offset):
    if not LOG.exists():
        return []
    with open(LOG, "rb") as handle:
        handle.seek(offset)
        data = handle.read()
    end = data.rfind(b"\n")
    if end < 0:
        return []
    return [clean(text) for text in data[: end + 1].decode("utf-8", errors="replace").splitlines()]


def send(command):
    with open(COMMANDS, "a", encoding="utf-8", newline="\n") as out:
        out.write(command + "\n")


def mark(text):
    with open(LOG, "a", encoding="utf-8", newline="\n") as out:
        out.write(f"===== {text} =====\n")


def wait_for(offset, pattern, timeout, count=1, settle=0.8, watch=None):
    """Espera `count` linhas que casem com `pattern` depois de `offset`. Devolve (linhas, achou).

    `watch(linhas)` é chamado a cada leitura e pode mandar comandos (o "parar" automático)."""
    regex = re.compile(pattern)
    deadline = time.time() + timeout
    lines = []
    while time.time() < deadline:
        lines = read_from(offset)
        if watch is not None:
            watch(lines)
        if sum(1 for line in lines if regex.search(line)) >= count:
            time.sleep(settle)
            return read_from(offset), True
        time.sleep(0.2)
    return read_from(offset), False


def require_bridge():
    if not STATE.exists():
        sys.exit(
            "A ponte não está rodando. Abra OUTRA janela nesta pasta e rode:  python ponte.py\n"
            "Espere aparecer '[ble] conectado' e tente de novo."
        )
    if not state().get("conectado"):
        sys.exit(
            "A ponte está aberta, mas NÃO está conectada ao robô.\n"
            "Confira: robô ligado na BATERIA, Bluetooth do computador ligado, robô a menos de "
            "3 m.\nEspere aparecer '[ble] conectado' na janela da ponte e tente de novo."
        )


def restart_robot(quiet=False):
    """Manda `reiniciar` e espera o robô reconectar (o boot muda)."""
    before = state().get("boot", "")
    send("reiniciar")
    if not quiet:
        print("Reiniciando o robô; esperando ele reconectar (até 40 s)...")
    deadline = time.time() + 40
    while time.time() < deadline:
        time.sleep(0.5)
        now = state()
        if now.get("conectado") and now.get("boot") and now.get("boot") != before:
            time.sleep(2.0)  # o robô confere os sensores e fica pronto
            if not quiet:
                print(f"Robô de volta (boot {now['boot']}).")
            return True
    print("ATENÇÃO: o robô não reconectou em 40 s. Veja a janela da ponte.")
    return False


# ----------------------------------------------------------------------------------------------
# Verificações automáticas. Cada uma devolve uma lista de (veredito, texto).
# ----------------------------------------------------------------------------------------------
def grep(lines, pattern):
    regex = re.compile(pattern)
    return [match for match in (regex.search(line) for line in lines) if match]


def has(lines, text):
    return any(text in line for line in lines)


def verdict(ok, text_ok, text_bad=None):
    return (PASSOU, text_ok) if ok else (FALHOU, text_bad or text_ok)


def check_loop(lines):
    """A linha "laco" de cada reta: laço rápido e nenhum erro de ToF durante o movimento."""
    out = []
    loops = grep(lines, r"reta: laco: (\d+) voltas, media ([\d.]+) ms, pior ([\d.]+) ms \| tof na reta: "
                        r"erros I2C E=(\d+) F=(\d+) D=(\d+), pulou E=(\d+) F=(\d+) D=(\d+)")
    for match in loops:
        mean = float(match.group(2))
        errors = sum(int(match.group(i)) for i in (4, 5, 6))
        skipped = sum(int(match.group(i)) for i in (7, 8, 9))
        out.append(verdict(mean < 4.0, f"laço da reta: média {mean} ms (limite 4,0)"))
        if skipped or errors > 2:
            out.append((FALHOU, f"ToF falhou durante a reta: {match.group(0).split('|')[1].strip()}"))
        elif errors:
            out.append((CONFERIR, f"erro isolado de ToF na reta: {match.group(0).split('|')[1].strip()}"))
    if not loops and grep(lines, r"reta: "):
        out.append((CONFERIR, "a linha 'reta: laco' não chegou (linha perdida, ou firmware antigo)"))
    return out


def check_straights(lines, name, count, pulses, tolerance=15, max_gyro=3.0):
    out = []
    found = grep(lines, rf"reta: {name} (-?\d+) mm: enc E=(-?\d+) D=(-?\d+) .*? giro=(-?[\d.]+) .* (\S.*)$")
    out.append(verdict(len(found) == count, f"{len(found)} de {count} retas '{name}' no log"))
    for index, match in enumerate(found, 1):
        left, right, gyro = int(match.group(2)), int(match.group(3)), float(match.group(4))
        ok_line = match.group(0).rstrip().endswith(" ok")
        out.append(verdict(ok_line, f"reta {index}: terminou ok",
                           f"reta {index}: NÃO terminou ok: {match.group(0)[-60:]}"))
        in_range = abs(left - pulses) <= tolerance and abs(right - pulses) <= tolerance
        out.append(verdict(in_range, f"reta {index}: pulsos E={left} D={right} (esperado {pulses} ± {tolerance})"))
        out.append(verdict(abs(gyro) < max_gyro, f"reta {index}: giro={gyro} graus (limite {max_gyro})"))
    return out + check_loop(lines)


def check_health(lines):
    """As duas linhas do `saude`: tudo zero."""
    out = []
    first = grep(lines, r"saude 1/2: ligado ha (\d+) s, reset=(.+?), bat=([\d.]+) V.*ble perdidos: "
                        r"linhas=(\d+) eventos=(\d+) pedacos=(\d+)")
    second = grep(lines, r"saude 2/2: i2c erros tof E=(\d+) F=(\d+) D=(\d+) imu=(\d+) ina=(\d+) .*"
                         r"tof quedas E=(\d+) F=(\d+) D=(\d+) \| reinicios XSHUT E=(\d+) F=(\d+) D=(\d+) "
                         r"\(falhos (\d+)/(\d+)/(\d+)\)")
    if not first or not second:
        return [(CONFERIR, "as linhas 'saude' não chegaram")]
    one, two = first[-1], second[-1]
    reset = one.group(2)
    out.append(verdict(not re.search("BROWNOUT|PANICO|WATCHDOG", reset), f"motivo do último reset: {reset}"))
    out.append(verdict(float(one.group(3)) >= 7.0, f"bateria {one.group(3)} V (mínimo 7,0)"))
    lost = [int(one.group(i)) for i in (4, 5, 6)]
    out.append(verdict(sum(lost) == 0, f"BLE perdidos: linhas={lost[0]} eventos={lost[1]} pedaços={lost[2]}"))
    i2c = [int(two.group(i)) for i in range(1, 6)]
    i2c_text = f"erros de I2C desde que ligou: ToF E={i2c[0]} F={i2c[1]} D={i2c[2]} IMU={i2c[3]} INA={i2c[4]}"
    if sum(i2c) == 0:
        out.append((PASSOU, i2c_text))
    elif sum(i2c) <= 5:
        out.append((CONFERIR, i2c_text + " (erros isolados: anote e siga)"))
    else:
        out.append((FALHOU, i2c_text + " (mais de 5: um sensor está falhando)"))
    drops = [int(two.group(i)) for i in range(6, 15)]
    out.append(verdict(sum(drops) == 0,
                       f"ToF: quedas {drops[0]}/{drops[1]}/{drops[2]}, reinícios {drops[3]}/{drops[4]}/{drops[5]}, "
                       f"reinícios falhos {drops[6]}/{drops[7]}/{drops[8]} (E/F/D)"))
    return out


def repo_commit():
    try:
        result = subprocess.run(["git", "-C", str(HERE.parent), "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""


def check_diag(lines):
    out = []
    end = grep(lines, r"diag: fim: (.*)$")
    if not end:
        return [(FALHOU, "o diag não terminou (sem a linha 'diag: fim')")]
    out.append(verdict(end[-1].group(1).startswith("OK"), "diag: fim: OK", f"diag: fim: {end[-1].group(1)}"))
    version = grep(lines, r"diag: firmware: versao (\S+), compilado em (.+?), IDF")
    if version:
        flashed, commit = version[-1].group(1), repo_commit()
        text = f"firmware gravado: versão {flashed}, compilado em {version[-1].group(2)}"
        # A versão vem do git na hora da compilação. Com "-dirty" havia mudança ainda sem commit:
        # é o normal quando o código novo foi só copiado para a pasta. A prova de que o firmware é
        # o que acabou de ser compilado é a DATA E HORA da compilação.
        if commit and commit[:7] in flashed:
            note = " (com mudanças ainda sem commit, o normal para código copiado)" if "dirty" in flashed else ""
            out.append((PASSOU, text + f"; base do repositório {commit}{note}. Confira que a data e a hora "
                        "são as da compilação que você acabou de fazer"))
        else:
            out.append((CONFERIR, text + f"; o repositório está em {commit or '(não consegui ler)'}. Se a data e a "
                        "hora não forem as da sua compilação, o robô está com outro firmware: compile e grave "
                        "de novo"))
    return out


def check_tofmon(lines):
    out = []
    end = grep(lines, r"tofmon fim: (\d+) rodadas .* -> (.*)$")
    if not end:
        return [(FALHOU, "o tofmon não terminou")]
    out.append(verdict(end[-1].group(2).startswith("OK"), f"tofmon: {end[-1].group(2)}"))
    for match in grep(lines, r"tofmon fim ([EFD]): (\d+) medidas: ok=(\d+) falha=(\d+) .*media=(-?[\d.]+) min=(-?\d+) max=(-?\d+)"):
        out.append((None, f"ToF {match.group(1)}: {match.group(2)} medidas, {match.group(4)} falhas, "
                          f"média {match.group(5)} mm ({match.group(6)} a {match.group(7)})"))
    return out


def check_gyro_series(lines):
    out = []
    found = grep(lines, r"giroscopio em repouso: (-?[\d.]+) graus/s \(media de (\d+) leituras\) min (-?[\d.]+) "
                        r"max (-?[\d.]+), (\d+) perdidas, temp (-?[\d.]+) C, ligado ha (\d+) s")
    out.append(verdict(len(found) >= 7, f"{len(found)} de 7 leituras do giroscópio"))
    for match in found:
        mean, low, high = float(match.group(1)), float(match.group(3)), float(match.group(4))
        still = high - low <= 3.0 and int(match.group(5)) == 0
        out.append(verdict(still, f"aos {match.group(7)} s: média {mean:+.3f} graus/s, variação {high - low:.2f} "
                                  f"(limite 3,0), temp {match.group(6)} C",
                           f"aos {match.group(7)} s: média {mean:+.3f}, variação {high - low:.2f} > 3,0 ou leituras "
                           "perdidas: o robô se mexeu, ou o sensor está ruim"))
    if found:
        means = [float(match.group(1)) for match in found]
        out.append(verdict(max(abs(value) for value in means) <= 25.0,
                           f"desvio entre {min(means):+.2f} e {max(means):+.2f} graus/s (limite ±25)"))
        out.append((None, f"mudança do desvio nos 3 min: {max(means) - min(means):.2f} graus/s "
                          "(o firmware desconta o desvio; anote para a equipe)"))
    return out


def check_enc(lines):
    end = grep(lines, r"enc fim: E=(-?\d+) D=(-?\d+)")
    if not end:
        return [(FALHOU, "o enc não terminou")]
    left, right = int(end[-1].group(1)), int(end[-1].group(2))
    return [verdict(225 <= left <= 345, f"roda esquerda: {left} pulsos (uma volta para a frente = +285, aceito 225 a 345)"),
            verdict(225 <= right <= 345, f"roda direita: {right} pulsos (aceito 225 a 345)")]


def check_wheels(lines):
    out = [(None, match.group(0)) for match in grep(lines, r"rodas: roda [ED] para \w+: .*")]
    end = grep(lines, r"rodas: resumo: (.*)$")
    if not end:
        return out + [(FALHOU, "o comando rodas não terminou")]
    return out + [verdict("-> OK" in end[-1].group(1), "rodas: " + end[-1].group(1))]


def check_motor(lines):
    end = grep(lines, r"motor fim: .* bateria minima ([\d.]+) V")
    if not end:
        return [(FALHOU, "o teste de motor não terminou (o robô reiniciou?)")]
    low = float(end[-1].group(1))
    return [verdict(low >= 6.5, f"bateria mínima com as duas rodas a 6 V: {low} V (mínimo 6,5)"),
            (None, end[-1].group(0))]


def check_tof_open(lines):
    found = grep(lines, r"tof (\d)/5: E=(-?\d+) \((.*?)\) F=(-?\d+) \((.*?)\) D=(-?\d+) \((.*?)\)")
    out = [verdict(len(found) == 5, f"{len(found)} de 5 linhas do tof")]
    faults = [match.group(0) for match in found if "-1" in (match.group(2), match.group(4), match.group(6))]
    out.append(verdict(not faults, "nenhum sensor em falha (-1)", f"sensor em falha: {faults[:1]}"))
    return out


def tof_means(lines):
    """Média de E, F e D nas linhas 2 a 5 do tof (a 1ª costuma sair com lixo)."""
    found = grep(lines, r"tof ([2-5])/5: E=(-?\d+) \(.*?\) F=(-?\d+) \(.*?\) D=(-?\d+) \(")
    if len(found) < 3:
        return None
    return [sum(int(match.group(i)) for match in found) / len(found) for i in (2, 3, 4)]


def check_tof_cell(lines, front, left, right):
    means = tof_means(lines)
    if means is None:
        return [(FALHOU, "menos de 3 linhas válidas do tof")]
    names = ("esquerdo", "frontal", "direito")
    out = []
    for name, value, (low, high) in zip(names, means, (left, front, right)):
        out.append(verdict(low <= value <= high, f"ToF {name}: média {value:.0f} mm (esperado {low} a {high})"))
    return out


def check_turn(lines, need_ok=True, max_ms=1500):
    out = []
    curves = grep(lines, r"curva: alvo=(\d+) parou=(-?[\d.]+) final=(-?[\d.]+) tempo=(\d+) ms .* continuou=(\w+) "
                         r"giro perdido=(\d+) (.*)$")
    if not curves:
        return [(FALHOU, "nenhuma linha 'curva: alvo=' no log")]
    last = curves[-1]
    if need_ok:
        out.append(verdict(last.group(7).strip() == "ok", f"curva terminou ok (final={last.group(3)} graus)",
                           f"curva NÃO terminou ok: {last.group(7).strip()}"))
    took = int(last.group(4))
    out.append((PASSOU if took < max_ms else CONFERIR, f"tempo da curva: {took} ms (meta: menos de {max_ms})"))
    if last.group(5) == "sim":
        out.append((None, "a curva emperrou perto do fim e o firmware insistiu (continuou=sim): anote"))
    trace = grep(lines, r"curva: angulo a cada 100 ms: (.*)$")
    if trace:
        out.append((None, "ângulo a cada 100 ms: " + trace[-1].group(1)))
    return out


def check_maneuver_ok(lines, count=1):
    found = grep(lines, r"teste: manobra (.+?): (.*)$")
    good = [match for match in found if match.group(2).strip() == "ok"]
    return [verdict(len(good) >= count, f"{len(good)} de {count} manobra(s) terminaram ok",
                    f"manobra falhou: {[match.group(0) for match in found if match.group(2).strip() != 'ok'][:2]}")]


def check_arc_start(lines):
    start = grep(lines, r"inicio do arco: alvo (\d+) mm, frontal (-?\d+) mm na parada, (-?\d+) mm depois do recuo")
    if not start:
        return [(FALHOU, "sem a linha 'inicio do arco: alvo ...' (o robô não viu a parede da frente?)")]
    after = int(start[-1].group(3))
    return [(PASSOU if 100 <= after <= 110 else CONFERIR,
             f"arco começou com o frontal a {after} mm da parede (alvo {start[-1].group(1)}; esperado 100 a 110)")]


def check_run(lines, success=True, steps=None, sequence=None, via3=None):
    out = []
    start = grep(lines, r"largada \d+: labirinto (\d+)x(\d+), via 3 (\w+) ")
    if via3 and start:
        seen = start[-1].group(3).lower()
        out.append(verdict(seen == via3, f"via 3 lida pelo robô: {seen} (o teste pede {via3})",
                           f"VIA 3 ERRADA: o robô leu {seen} e o teste pede {via3}. Ajuste a chave, rode "
                           "'python t.py reiniciar' e repita. Este resultado NÃO vale"))
    end = grep(lines, r"fim da corrida \d+: (\w+), (\d+) passos, (\d+) celulas, posicao \(l(\d+),c(\d+)\) rumo (\w), "
                      r"passagens para fora=(\d+), eventos perdidos=(\d+), linhas de log perdidas=(\d+)")
    if not end:
        return out + [(FALHOU, "a corrida não terminou no log (sem 'fim da corrida')")]
    last = end[-1]
    out.append(verdict((last.group(1) == "SUCESSO") == success,
                       f"fim da corrida: {last.group(1)}, {last.group(2)} passos, posição (l{last.group(4)},c{last.group(5)})"))
    if success:
        out.append(verdict(last.group(7) == "0", f"passagens para fora = {last.group(7)} (tem de ser 0)"))
        out.append(verdict(last.group(8) == "0" and last.group(9) == "0",
                           f"perdidos: {last.group(8)} eventos, {last.group(9)} linhas de log"))
    if steps is not None:
        out.append(verdict(int(last.group(2)) == steps, f"{last.group(2)} passos (esperado {steps})"))
    if sequence:
        seen = [(f"l{m.group(1)},c{m.group(2)}", m.group(3).strip())
                for m in grep(lines, r"nav: passo \d+: cel \(l(\d+),c(\d+)\) .* acao=([a-z ]+?)(?: \(|-> | ->)")]
        seen = [(cell, action.strip()) for cell, action in seen if action.strip() != "chegou"]
        wrong = [f"passo {i + 1}: esperado {exp}, veio {got}"
                 for i, (exp, got) in enumerate(zip(sequence, seen)) if exp != got]
        ok = not wrong and len(seen) >= len(sequence)
        out.append(verdict(ok, f"os {len(sequence)} passos na ordem esperada",
                           f"passos fora da ordem ({len(seen)} vistos): {wrong[:3]}"))
    moves = grep(lines, r"movimento: (\d+) arco\(s\) repetido\(s\), (\d+) parada\(s\) pela parede da frente, (\d+) leitura")
    if moves and success:
        out.append(verdict(moves[-1].group(1) == "0", f"arcos repetidos: {moves[-1].group(1)} (meta 0)"))
    if success:
        out += [item for item in check_health(lines) if item[0] != PASSOU]
        out += [item for item in check_loop(lines) if item[0] != PASSOU]
    return out


# ----------------------------------------------------------------------------------------------
# Os testes
# ----------------------------------------------------------------------------------------------
class Step:
    def __init__(self, command, end, timeout=20, count=1, settle=0.8, gap=0.0):
        self.command, self.end, self.timeout = command, end, timeout
        self.count, self.settle, self.gap = count, settle, gap


class Test:
    def __init__(self, ident, title, prepare, steps, criterion, check, questions=(), moves=False,
                 after=None, watch=None, repeat=1, ends_in_error=False):
        self.ident, self.title, self.prepare, self.steps = ident, title, prepare, steps
        self.criterion, self.check, self.questions = criterion, check, questions
        self.moves, self.after, self.watch, self.repeat = moves, after, watch, repeat
        self.ends_in_error = ends_in_error


MANEUVER = r"teste: manobra "
YES, NO = "s", "n"


def question(key, text, kind="sn", expect=None, low=None, high=None):
    return {"key": key, "text": text, "kind": kind, "expect": expect, "low": low, "high": high}


def stop_when_outside(lines, sent=[]):  # noqa: B006 (lista como memória entre chamadas)
    """D6: manda `parar` assim que o robô vê uma passagem para fora do labirinto."""
    if not sent and grep(lines, r"nav: passo \d+: .* fora=[1-9]"):
        send("parar")
        sent.append(True)


def stop_on_second_step(lines, sent=[]):  # noqa: B006
    """D7: manda `parar` 0,4 s depois de o robô decidir o passo 2 (no meio da 2ª reta)."""
    if not sent and grep(lines, r"nav: passo 2: "):
        time.sleep(0.4)
        send("parar")
        sent.append(True)


D1_SEQUENCE = [("l3,c0", "frente"), ("l2,c0", "frente"), ("l1,c0", "frente"), ("l0,c0", "direita"),
               ("l0,c1", "frente"), ("l0,c2", "direita"), ("l1,c2", "direita"), ("l1,c1", "esquerda"),
               ("l2,c1", "esquerda"), ("l2,c2", "frente"), ("l2,c3", "esquerda"), ("l1,c3", "frente")]
D2_SEQUENCE = [("l3,c3", "frente"), ("l2,c3", "frente"), ("l1,c3", "frente"), ("l0,c3", "re"),
               ("l1,c3", "re"), ("l2,c3", "esquerda"), ("l2,c2", "frente"), ("l2,c1", "direita"),
               ("l1,c1", "frente"), ("l0,c1", "esquerda")]
RUN_END = r"nav: mapa l3 "


def tof_calibration(letter, name, millimeters):
    def check(lines):
        out = check_tofmon(lines)
        mean = grep(lines, rf"tofmon fim {letter}: .*ok=(\d+) falha=(\d+) .*media=(-?[\d.]+)")
        if mean and int(mean[-1].group(1)) > 0:
            value = float(mean[-1].group(3))
            error = value - millimeters
            out.append((PASSOU if abs(error) <= 10 else CONFERIR,
                        f"ToF {name} a {millimeters} mm reais: leu {value:.1f} mm, erro {error:+.1f} mm (meta ±10)"))
        else:
            out.append((FALHOU, f"o ToF {name} não deu nenhuma medida válida"))
        return out

    return Test(
        f"B3-{letter}{millimeters}", f"Calibração do ToF {name} a {millimeters} mm",
        ["Robô no chão ou na mesa, PARADO.",
         f"Ponha uma caixa RÍGIDA de face lisa e clara (ou um livro em pé) na frente do sensor {name.upper()}, "
         "paralela ao sensor, APOIADA na mesa (não segure na mão).",
         f"Com a régua, deixe a face da caixa a EXATAMENTE {millimeters} mm da JANELA do sensor "
         "(o quadradinho preto do sensor, não a borda do chassi).",
         "Tire as mãos e a régua da frente antes de dar o ok."],
        [Step("tofmon 5", r"tofmon fim: ", timeout=20)],
        f"A média lida fica a menos de 10 mm de {millimeters} mm. Fora disso não é erro seu: o valor é anotado para "
        "a equipe calibrar.",
        check)


TESTS = [
    # ------------------------------ Bloco H: hardware ------------------------------
    Test("H1", "Diagnóstico geral do hardware",
         [APOIADO, "Robô parado e imóvel.", NAO_TOQUE + " O teste leva ~8 s."],
         [Step("diag", r"diag: fim: ", timeout=30)],
         "A última linha é 'diag: fim: OK'. A data e a hora de compilação do firmware são as de hoje.",
         check_diag),
    Test("H2", "ToF parados por 30 s",
         [APOIADO, NAO_TOQUE + " O teste leva 30 s."],
         [Step("tofmon 30", r"tofmon fim: ", timeout=50)],
         "Nenhuma leitura em falha nos três sensores.",
         check_tofmon),
    Test("H3", "ToF por 60 s, mexendo nos cabos",
         [APOIADO,
          "Tenha à mão um palito ou caneta de PLÁSTICO (nada de metal).",
          "Depois do ok, durante 60 s: com o palito, balance DE LEVE o cabo e o conector de cada sensor de distância, "
          "~15 s em cada um, nesta ordem: ESQUERDO, da FRENTE, DIREITO. Nos últimos 15 s, bata de leve com o dedo no "
          "chassi perto de cada sensor.",
          "Não puxe os fios. Não precisa evitar passar na frente do sensor."],
         [Step("tofmon 60", r"tofmon fim: ", timeout=80)],
         "Nenhuma leitura em falha mesmo mexendo nos cabos. Uma falha aqui é mau contato: a linha 'tof: ... PAROU' "
         "diz qual sensor.",
         check_tofmon),
    Test("H4", "Giroscópio parado por 3 minutos, logo depois de ligar",
         ["ANTES deste teste: desligue a bateria do robô, espere 10 s, ligue de novo e espere a janela da ponte "
          "mostrar '[ble] conectado'. Rode este teste em seguida (em menos de 1 minuto).",
          "Robô APOIADO numa mesa firme, que ninguém esbarre. NÃO segure na mão.",
          NAO_TOQUE + " O teste leva 3 minutos (7 leituras, uma a cada 30 s)."],
         [Step("giro", r"giroscopio em repouso: ", timeout=15, count=1, gap=30.0)] * 7,
         "Em cada leitura, a diferença entre máximo e mínimo fica abaixo de 3 graus/s e nenhuma leitura se perde. "
         "O valor médio pode ser diferente de zero (o firmware desconta).",
         check_gyro_series),
    Test("H5", "Encoders, girando as rodas à mão",
         [APOIADO,
          "Faça com uma caneta uma marca no pneu de CADA roda, na parte de cima.",
          "Depois do ok você tem 25 s. Gire a roda ESQUERDA (a da esquerda de quem olha o robô por trás) exatamente "
          "UMA volta para a FRENTE: a parte de cima da roda vai em direção à frente do robô. Pare quando a marca "
          "voltar ao topo.",
          "Em seguida gire a roda DIREITA exatamente UMA volta para a FRENTE.",
          "Gire devagar (uns 3 s por volta). Não gire para trás."],
         [Step("enc 25", r"enc fim: ", timeout=40)],
         "Cada roda conta entre 225 e 345 pulsos (uma volta = 285).",
         check_enc),
    Test("H6", "Cada roda sozinha, nos dois sentidos",
         [APOIADO, "As rodas VÃO GIRAR sozinhas por ~15 s. Mantenha dedos, cabos e roupas longe delas.",
          "Confira que nada encosta nos pneus (fios, chassi, suporte)."],
         [Step("rodas", r"rodas: resumo: ", timeout=60)],
         "A linha 'rodas: resumo' termina em '-> OK': as duas rodas partem com tensão parecida, giram com velocidade "
         "parecida e os encoders contam no sentido certo.",
         check_wheels, moves=True),
    Test("H7", "As duas rodas a 6 V (a bateria aguenta?)",
         [APOIADO, "As rodas VÃO GIRAR rápido por 1,5 s. Mantenha tudo longe delas."],
         [Step("motor ed 6 1500", r"motor fim: ", timeout=15)],
         "O robô não reinicia e a bateria não cai abaixo de 6,5 V.",
         check_motor, moves=True),
    Test("H8", "Contadores de erro depois do bloco H",
         [APOIADO, "Só leitura: nada se mexe."],
         [Step("saude", r"saude 2/2: ", timeout=10)],
         "Todos os contadores em zero: nenhum erro de I2C, nenhuma queda de sensor, nada perdido no Bluetooth.",
         check_health),
    # ------------------------------ Bloco A: suspenso ------------------------------
    Test("A1", "ToF sem nada por perto",
         [APOIADO, LIVRE],
         [Step("tof", r"tof 5/5: ", timeout=15)],
         "5 linhas, nenhum sensor com -1.",
         check_tof_open),
    Test("A2", "Uma célula para a frente, no ar",
         [APOIADO, "Segure o CHASSI firme contra o suporte com as duas mãos, sem tocar nas rodas e sem tapar os "
                   "sensores: o robô não pode girar nem escorregar.", "As rodas vão girar por ~1,5 s."],
         [Step("andar", MANEUVER, timeout=15)],
         "A reta termina 'ok' com ~511 pulsos em cada roda, giro abaixo de 3 graus e laço abaixo de 4 ms.",
         lambda lines: check_straights(lines, "andar 1 celula", 1, 511) + check_maneuver_ok(lines),
         moves=True),
    Test("A3", "Uma célula de ré, no ar",
         [APOIADO, "Segure o chassi firme contra o suporte, como no A2.", "As rodas vão girar para trás por ~1,5 s."],
         [Step("re", MANEUVER, timeout=15)],
         "A ré termina 'ok' com ~-511 pulsos em cada roda.",
         lambda lines: check_straights(lines, "re de 1 celula", 1, -511) + check_maneuver_ok(lines),
         moves=True),
    Test("A4", "Curva com o robô travado (tem de detectar que não girou)",
         [APOIADO, "Segure o chassi BEM firme contra o suporte: ele NÃO pode girar. Não toque nas rodas.",
          "As rodas vão girar em 4 trancos, por ~6 s no total. É o esperado."],
         [Step("virar d", MANEUVER, timeout=30)],
         "O log mostra 'curva travada' duas vezes, com 'desfez o arco' e 'tentativa 2 do arco' no meio. Aqui a "
         "manobra TEM de terminar em falha.",
         lambda lines: [
             verdict(len(grep(lines, r"curva travada")) >= 2, "'curva travada' apareceu 2 vezes",
                     "não detectou a curva travada 2 vezes: o robô girou no suporte? Repita segurando mais firme"),
             verdict(has(lines, "tentativa 2 do arco"), "fez a tentativa 2 do arco"),
             verdict(has(lines, "desfez o arco"), "desfez o arco antes da tentativa 2")],
         moves=True),
    Test("A5", "Largada sem paredes (tem de recusar)",
         [APOIADO, LIVRE, "Chave DIP: as 3 vias na posição ABERTA (OFF). Se mexeu na chave, rode antes "
                          "'python t.py reiniciar'.",
          "As rodas NÃO devem girar."],
         [Step("largar", RUN_END, timeout=30, settle=1.5)],
         "O robô recusa a largada ('largada recusada: sem parede a esquerda do robo') e não mexe as rodas.",
         lambda lines: [verdict(has(lines, "largada recusada: sem parede a esquerda"), "largada recusada"),
                        verdict(bool(grep(lines, r"fim da corrida \d+: FALHA, 0 passos")), "0 passos")],
         questions=[question("rodas_paradas", "As rodas ficaram PARADAS?", expect=YES)],
         ends_in_error=True),
    # ------------------------------ Bloco B: chão livre ------------------------------
    Test("B1", "5 células em linha reta no chão",
         ["Chão liso e livre, fora do labirinto, com pelo menos 1,2 m de espaço à frente do robô.",
          "Cole uma fita no chão e ponha as duas RODAS em cima dela (a fita marca o eixo). Marque também o centro "
          "do robô na fita.", "O robô vai andar 5 vezes seguidas, ~90 cm no total. Não toque nele."],
         [Step("andar", MANEUVER, timeout=15, gap=0.6)] * 5,
         "As 5 retas terminam 'ok'. Na régua: 900 mm ± 25 da fita até o eixo das rodas, e menos de 30 mm de desvio "
         "para o lado.",
         lambda lines: check_straights(lines, "andar 1 celula", 5, 511) + check_maneuver_ok(lines, 5),
         questions=[question("distancia_mm", "Distância da fita até o EIXO das rodas, em mm", "num", low=875, high=925),
                    question("desvio_mm", "Desvio para o lado (esquerda ou direita), em mm", "num", low=0, high=30)],
         moves=True),
    Test("B2", "3 células de ré no chão",
         ["Chão livre com 70 cm de espaço ATRÁS do robô.", "Fita no chão marcando o eixo das rodas, como no B1.",
          "O robô vai andar de ré 3 vezes seguidas, ~54 cm."],
         [Step("re", MANEUVER, timeout=15, gap=0.6)] * 3,
         "As 3 rés terminam 'ok'. Na régua: 540 mm ± 15.",
         lambda lines: check_straights(lines, "re de 1 celula", 3, -511) + check_maneuver_ok(lines, 3),
         questions=[question("distancia_mm", "Distância da fita até o eixo das rodas, em mm", "num", low=525, high=555)],
         moves=True),
    *[tof_calibration(letter, name, mm)
      for letter, name in (("E", "esquerdo"), ("F", "frontal"), ("D", "direito"))
      for mm in (50, 100, 150, 200)],
    Test("B4d", "Giro de 90 graus no lugar, para a direita",
         ["Chão livre. Desenhe numa folha um ângulo reto (duas linhas em L) e prenda a folha no chão.",
          "Ponha o robô com o eixo das rodas sobre o canto do L e a frente apontando ao longo de uma das linhas.",
          "O robô vai girar 90 graus para a DIREITA sem sair do lugar."],
         [Step("pivo d", MANEUVER, timeout=15)],
         "A curva termina 'ok' e o robô fica alinhado com a outra linha do L (entre 85 e 95 graus).",
         lambda lines: check_turn(lines) + check_maneuver_ok(lines),
         questions=[question("alinhado", "O robô ficou alinhado com a outra linha do L (erro menor que meio dedo "
                                         "na ponta do robô)?", expect=YES)],
         moves=True),
    Test("B4e", "Giro de 90 graus no lugar, para a esquerda",
         ["Como no B4d, mas o robô vai girar para a ESQUERDA."],
         [Step("pivo e", MANEUVER, timeout=15)],
         "A curva termina 'ok' e o robô fica alinhado com a outra linha do L.",
         lambda lines: check_turn(lines) + check_maneuver_ok(lines),
         questions=[question("alinhado", "O robô ficou alinhado com a outra linha do L?", expect=YES)],
         moves=True),
    Test("B5d", "Curva completa para a direita no chão livre (faça 3 vezes)",
         ["Chão livre, 50 cm de espaço em volta. Marque com fita onde estão as duas rodas.",
          "O robô recua ~7 cm, faz a curva para a DIREITA e recua de novo ~9 cm."],
         [Step("virar d", MANEUVER, timeout=20)],
         "A curva termina 'ok', sem 'tentativa 2'. O robô termina girado 90 graus para a direita.",
         lambda lines: check_turn(lines) + check_maneuver_ok(lines) + [
             verdict(not has(lines, "tentativa 2 do arco"), "sem tentativa 2 do arco")],
         questions=[question("girou_90", "Terminou girado ~90 graus para a DIREITA?", expect=YES)],
         moves=True, repeat=3),
    Test("B5e", "Curva completa para a esquerda no chão livre (faça 3 vezes)",
         ["Como no B5d, para a ESQUERDA."],
         [Step("virar e", MANEUVER, timeout=20)],
         "A curva termina 'ok', sem 'tentativa 2'. O robô termina girado 90 graus para a esquerda.",
         lambda lines: check_turn(lines) + check_maneuver_ok(lines) + [
             verdict(not has(lines, "tentativa 2 do arco"), "sem tentativa 2 do arco")],
         questions=[question("girou_90", "Terminou girado ~90 graus para a ESQUERDA?", expect=YES)],
         moves=True, repeat=3),
    # ------------------------------ Bloco C: labirinto, uma manobra por vez ------------------------------
    Test("C1", "Sensores na célula A2",
         [CENTRADO, "Célula A2, com a FRENTE do robô virada para A1 (há uma parede logo à frente).",
          "Tire as mãos de dentro do labirinto antes do ok."],
         [Step("tof", r"tof 5/5: ", timeout=15)],
         "Frontal entre 35 e 100 mm (parede à frente), esquerdo entre 15 e 60 mm (parede), direito acima de 140 mm "
         "(aberto).",
         lambda lines: check_tof_cell(lines, (35, 100), (15, 60), (140, 9999))),
    Test("C2", "Sensores na célula A3",
         [CENTRADO, "Célula A3, com a frente virada para A2 (sem parede logo à frente).", "Mãos fora do labirinto."],
         [Step("tof", r"tof 5/5: ", timeout=15)],
         "Frontal acima de 180 mm: a parede que ele vê é a do fim de A2, e ela NÃO pode contar como parede de A3.",
         lambda lines: [item for item in check_tof_cell(lines, (180, 9999), (0, 9999), (0, 9999))
                        if item[0] == FALHOU or "frontal" in item[1]]),
    Test("C3", "3 células de ré pelo corredor da linha 1",
         [CENTRADO, "Célula A1, com a FRENTE virada para a parede do fundo e as COSTAS para B1.",
          "O robô vai de ré 3 células seguidas: A1 -> B1 -> C1 -> D1."],
         [Step("re", MANEUVER, timeout=15, gap=0.8)] * 3,
         "As 3 rés terminam 'ok' com laço abaixo de 4 ms, e o robô para em D1 sem encostar nas paredes.",
         lambda lines: check_straights(lines, "re de 1 celula", 3, -511, max_gyro=5.0) + check_maneuver_ok(lines, 3),
         questions=[question("parou_em", "Em que célula o robô parou? (ex.: D1)", "txt", expect="D1"),
                    question("encostou", "Encostou em alguma parede?", expect=NO)],
         moves=True),
    Test("C4", "Curva para a direita em A2 (faça 3 vezes)",
         [CENTRADO, "Célula A2, frente virada para A1 (parede à frente).",
          "O robô ajusta a distância à parede, faz a curva para a DIREITA e termina virado para B2.",
          "Olhe se alguma parte do robô encosta numa parede durante a curva."],
         [Step("virar d", MANEUVER, timeout=25)],
         "O arco começa com o frontal entre 100 e 110 mm, a curva termina 'ok' em menos de 1,5 s, sem 'tentativa 2', "
         "sem encostar, virado para B2.",
         lambda lines: check_arc_start(lines) + check_turn(lines) + check_maneuver_ok(lines) + [
             verdict(not has(lines, "tentativa 2 do arco"), "sem tentativa 2 do arco")],
         questions=[question("encostou", "Encostou em alguma parede?", expect=NO),
                    question("virado_para", "Terminou virado para qual célula? (ex.: B2)", "txt", expect="B2")],
         moves=True, repeat=3),
    Test("C5", "Curva para a direita em A4 (faça 3 vezes)",
         [CENTRADO, "Célula A4, frente virada para a parede do fundo (a borda do labirinto além de A4), vindo de B4.",
          "O robô faz a curva para a DIREITA e termina virado para A3."],
         [Step("virar d", MANEUVER, timeout=25)],
         "Igual ao C4; termina virado para A3.",
         lambda lines: check_arc_start(lines) + check_turn(lines) + check_maneuver_ok(lines) + [
             verdict(not has(lines, "tentativa 2 do arco"), "sem tentativa 2 do arco")],
         questions=[question("encostou", "Encostou em alguma parede?", expect=NO),
                    question("virado_para", "Terminou virado para qual célula?", "txt", expect="A3")],
         moves=True, repeat=3),
    Test("C6", "Curva para a esquerda em C1, sem parede à frente (faça 3 vezes)",
         [CENTRADO, "Célula C1, frente virada para B1 (sem parede à frente).",
          "O robô faz a curva para a ESQUERDA e termina virado para C2."],
         [Step("virar e", MANEUVER, timeout=25)],
         "O log diz 'sem parede a frente ... recuo fixo 75 mm', a curva termina 'ok', virado para C2, sem encostar.",
         lambda lines: [verdict(has(lines, "inicio do arco: sem parede a frente"), "arco sem parede à frente")]
         + check_turn(lines) + check_maneuver_ok(lines),
         questions=[question("encostou", "Encostou em alguma parede?", expect=NO),
                    question("virado_para", "Terminou virado para qual célula?", "txt", expect="C2")],
         moves=True, repeat=3),
    Test("C7", "Curva para a esquerda em C3 (faça 3 vezes)",
         [CENTRADO, "Célula C3, frente virada para D3.", "O robô faz a curva para a ESQUERDA e termina virado para C2."],
         [Step("virar e", MANEUVER, timeout=25)],
         "'sem parede a frente', nenhuma linha 'avanco antes da curva', curva 'ok', virado para C2.",
         lambda lines: [verdict(has(lines, "inicio do arco: sem parede a frente"), "arco sem parede à frente"),
                        verdict(not has(lines, "avanco antes da curva"), "sem 'avanco antes da curva'")]
         + check_turn(lines) + check_maneuver_ok(lines),
         questions=[question("encostou", "Encostou em alguma parede?", expect=NO),
                    question("virado_para", "Terminou virado para qual célula?", "txt", expect="C2")],
         moves=True, repeat=3),
    Test("C8", "Curva em A2 segurando o robô no meio (a 2ª tentativa tem de funcionar)",
         [CENTRADO, "Célula A2, frente virada para A1, como no C4.",
          "Depois do ok: quando o robô COMEÇAR a girar, segure-o com a mão por ~1 segundo (ele para de girar) e "
          "SOLTE. Não o tire do lugar.",
          "Ele deve voltar, tentar de novo sozinho e completar a curva."],
         [Step("virar d", MANEUVER, timeout=35)],
         "O log mostra 'curva travada', 'desfez o arco' e 'tentativa 2 do arco', e a manobra termina 'ok'.",
         lambda lines: [verdict(has(lines, "curva travada"), "detectou a curva travada",
                                "não detectou: você segurou tarde ou soltou cedo demais? Repita"),
                        verdict(has(lines, "tentativa 2 do arco"), "fez a tentativa 2")]
         + check_maneuver_ok(lines),
         questions=[question("encostou", "Na 2ª tentativa, encostou em alguma parede (inclusive a de trás)?", expect=NO)],
         moves=True),
    # ------------------------------ Bloco D: corridas ------------------------------
    Test("D1", "Corrida completa a partir de D4 (faça 3 vezes)",
         ["Chave DIP: via 3 ABERTA (OFF). Se mexeu nela, rode antes 'python t.py reiniciar'.",
          CENTRADO, "Célula D4, frente virada para C4. A borda do labirinto fica à ESQUERDA do robô.",
          "O robô vai correr sozinho até A1 (~40 s). Fique pronto: Ctrl+C nesta janela manda parar."],
         [Step("largar", RUN_END, timeout=150, settle=2.0)],
         "12 passos na ordem esperada, 'SUCESSO', nenhuma passagem para fora, nenhum arco repetido, para em A1.",
         lambda lines: check_run(lines, True, 12, D1_SEQUENCE, "aberta"),
         questions=[question("parou_em", "Em que célula o robô parou?", "txt", expect="A1"),
                    question("batidas", "Quantas vezes encostou numa parede? (0 se nenhuma)", "num", low=0, high=0)],
         moves=True, repeat=3),
    Test("D2", "Corrida completa a partir de D1 (faça 3 vezes)",
         ["Chave DIP: via 3 FECHADA (ON). Depois de mexer nela, rode 'python t.py reiniciar'.",
          CENTRADO, "Célula D1, frente virada para C1. A borda do labirinto fica à DIREITA do robô.",
          "O robô vai até A1, volta DE RÉ duas células e segue até A4 (~40 s)."],
         [Step("largar", RUN_END, timeout=150, settle=2.0)],
         "10 passos na ordem esperada, com duas rés e nenhum giro de 180 graus, 'SUCESSO', para em A4.",
         lambda lines: check_run(lines, True, 10, D2_SEQUENCE, "fechada") + [
             verdict(not has(lines, "alvo=180"), "nenhum giro de 180 graus")],
         questions=[question("parou_em", "Em que célula o robô parou?", "txt", expect="A4"),
                    question("batidas", "Quantas vezes encostou numa parede?", "num", low=0, high=0)],
         moves=True, repeat=3),
    Test("D3", "Corrida a partir de A4",
         ["Chave DIP: via 3 ABERTA (OFF); 'python t.py reiniciar' se mexeu.", CENTRADO,
          "Célula A4, frente virada para A3.", "O robô deve chegar a D1."],
         [Step("largar", RUN_END, timeout=150, settle=2.0)],
         "'SUCESSO', para em D1.",
         lambda lines: check_run(lines, True, None, None, "aberta"),
         questions=[question("parou_em", "Em que célula o robô parou?", "txt", expect="D1"),
                    question("batidas", "Quantas vezes encostou numa parede?", "num", low=0, high=0)],
         moves=True),
    Test("D4", "Corrida a partir de A1",
         ["Chave DIP: via 3 ABERTA (OFF); 'python t.py reiniciar' se mexeu.", CENTRADO,
          "Célula A1, frente virada para B1.", "O robô deve chegar a D4."],
         [Step("largar", RUN_END, timeout=150, settle=2.0)],
         "'SUCESSO', para em D4.",
         lambda lines: check_run(lines, True, None, None, "aberta"),
         questions=[question("parou_em", "Em que célula o robô parou?", "txt", expect="D4"),
                    question("batidas", "Quantas vezes encostou numa parede?", "num", low=0, high=0)],
         moves=True),
    Test("D5", "Via 3 errada em A4 (tem de recusar a largada)",
         ["Chave DIP: via 3 FECHADA (ON), ERRADA de propósito. Rode 'python t.py reiniciar' depois de mexer.",
          CENTRADO, "Célula A4, frente virada para A3.", "O robô NÃO deve andar."],
         [Step("largar", RUN_END, timeout=30, settle=1.5)],
         "'largada recusada: sem parede a direita do robo'; as rodas não giram.",
         lambda lines: [verdict(has(lines, "largada recusada: sem parede a direita"), "largada recusada")],
         questions=[question("rodas_paradas", "As rodas ficaram PARADAS?", expect=YES)],
         ends_in_error=True),
    Test("D6", "Via 3 errada em D1 (o robô percebe e o teste freia sozinho)",
         ["Chave DIP: via 3 ABERTA (OFF), ERRADA de propósito para esta célula. 'python t.py reiniciar' se mexeu.",
          CENTRADO, "Célula D1, frente virada para C1.",
          "O robô vai andar 1 ou 2 células e o programa manda parar sozinho. Fique por perto."],
         [Step("largar", RUN_END, timeout=60, settle=2.0)],
         "No log, 'fora=' sai de 0 e a corrida termina em FALHA (parada pelo programa).",
         lambda lines: [verdict(bool(grep(lines, r"nav: passo \d+: .* fora=[1-9]")), "o robô viu a passagem para fora"),
                        verdict(bool(grep(lines, r"fim da corrida \d+: FALHA")), "corrida terminou em FALHA")],
         moves=True, watch=stop_when_outside, ends_in_error=True),
    Test("D7", "Parar no meio da corrida",
         ["Chave DIP: via 3 ABERTA (OFF); 'python t.py reiniciar' se mexeu.", CENTRADO,
          "Célula D4, frente virada para C4.",
          "O programa manda 'parar' sozinho no meio da 2ª reta. O robô tem de frear na hora."],
         [Step("largar", RUN_END, timeout=60, settle=2.0)],
         "O robô freia e o log diz 'parado pelo operador'.",
         lambda lines: [verdict(has(lines, "parado pelo operador"), "parou pelo comando"),
                        verdict(bool(grep(lines, r"fim da corrida \d+: FALHA")), "corrida terminou em FALHA")],
         questions=[question("freou", "O robô freou na hora, sem bater?", expect=YES)],
         moves=True, watch=stop_on_second_step, ends_in_error=True),
]
BY_ID = {test.ident.upper(): test for test in TESTS}
BLOCKS = {"H": "Bloco H: hardware (robô apoiado, rodas no ar)", "A": "Bloco A: movimentos no ar",
          "B": "Bloco B: chão livre, fora do labirinto", "C": "Bloco C: labirinto, uma manobra por vez",
          "D": "Bloco D: corridas completas"}


# ----------------------------------------------------------------------------------------------
# Execução
# ----------------------------------------------------------------------------------------------
def done():
    try:
        return json.loads(DONE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def record(test, attempt, verdict_text, checks, answers, note=""):
    history = done()
    history.setdefault(test.ident, []).append(
        {"hora": time.strftime("%H:%M:%S"), "tentativa": attempt, "veredito": verdict_text,
         "automatico": verdict_text.replace(" (falta a resposta do operador)", "")})
    DONE.write_text(json.dumps(history, indent=1), encoding="utf-8")
    new = not REPORT.exists()
    with open(REPORT, "a", encoding="utf-8", newline="\n") as out:
        if new:
            out.write(f"# Resultados dos testes do robô (firmware v3)\n\nData: {time.strftime('%d/%m/%Y')}. "
                      f"Repositório em: {repo_commit() or '?'} (a versão gravada no robô está no teste H1).\n\n")
        out.write(f"## {test.ident} (tentativa {attempt}) — {verdict_text} — {time.strftime('%H:%M:%S')}\n\n")
        out.write(f"{test.title}. Comando(s): {', '.join(sorted({step.command for step in test.steps}))}.\n\n")
        for status, text in checks:
            out.write(f"- {status or 'dado'}: {text}\n")
        for key, value in answers.items():
            out.write(f"- operador, {key}: {value}\n")
        if note:
            out.write(f"- observação: {note}\n")
        out.write("\n")


def overall(checks):
    statuses = [status for status, _ in checks]
    if FALHOU in statuses:
        return FALHOU
    if CONFERIR in statuses:
        return CONFERIR
    return PASSOU


def ask(item):
    while True:
        suffix = " [s/n]" if item["kind"] == "sn" else ""
        judged = judge_answer(item, input(f"  {item['text']}{suffix}: "))
        if judged is not None:
            return judged
        print("    Resposta não entendida; tente de novo." if item["kind"] != "num" else "    Digite só o número.")


def show_prepare(test, attempt):
    print("=" * 78)
    print(f"TESTE {test.ident} (tentativa {attempt}): {test.title}")
    if test.repeat > 1:
        print(f"Este teste é feito {test.repeat} vezes: rode 'python t.py {test.ident}' {test.repeat} vezes, "
              "reposicionando o robô a cada vez.")
    print("\nPREPARO (faça nesta ordem):")
    for index, text in enumerate(test.prepare, 1):
        print(f"  {index}. {text}")
    print(f"\nPASSA SE: {test.criterion}")
    commands = ", ".join(dict.fromkeys(step.command for step in test.steps))
    print(f"\nComando(s) que serão enviados: {commands}" + ("   *** AS RODAS VÃO GIRAR ***" if test.moves else ""))
    if test.questions:
        print("\nDepois do teste o operador responde:")
        for item in test.questions:
            print(f"  - ({item['key']}) {item['text']}")
    return commands


def judge_answer(item, answer):
    """Devolve (valor, certo) para uma resposta do operador, ou None se não deu para entender."""
    answer = answer.strip()
    if item["kind"] == "sn":
        if answer.lower() not in ("s", "n"):
            return None
        return answer.lower(), item["expect"] is None or answer.lower() == item["expect"]
    if item["kind"] == "num":
        try:
            value = float(answer.replace(",", "."))
        except ValueError:
            return None
        return value, item["low"] <= value <= item["high"]
    if not answer:
        return None
    return answer, item["expect"] is None or answer.upper().replace(" ", "") == item["expect"]


def record_answers(test, pairs):
    """`responder`: junta as respostas do operador ao último resultado do teste (rodado com --auto)."""
    history = done()
    runs = history.get(test.ident, [])
    if not runs:
        sys.exit(f"O teste {test.ident} ainda não foi rodado.")
    given = dict(pair.split("=", 1) for pair in pairs if "=" in pair)
    missing = [item["key"] for item in test.questions if item["key"] not in given]
    if missing:
        sys.exit(f"Faltam respostas: {', '.join(missing)}. Use chave=valor para cada uma.")
    all_ok = True
    lines = []
    for item in test.questions:
        judged = judge_answer(item, given[item["key"]])
        if judged is None:
            sys.exit(f"Não entendi a resposta de '{item['key']}': {given[item['key']]!r} "
                     f"({'s ou n' if item['kind'] == 'sn' else 'um número' if item['kind'] == 'num' else 'texto'}).")
        value, ok = judged
        all_ok = all_ok and ok
        lines.append(f"- {PASSOU if ok else FALHOU}: operador: {item['text']} -> {value}")
        print(f"  [{PASSOU if ok else FALHOU:8}] {item['text']} -> {value}")
    last = runs[-1]
    automatic = last.get("automatico", last["veredito"])
    final = automatic if all_ok or automatic == FALHOU else FALHOU
    last["veredito"] = final
    DONE.write_text(json.dumps(history, indent=1), encoding="utf-8")
    with open(REPORT, "a", encoding="utf-8", newline="\n") as out:
        out.write(f"Respostas do operador ao {test.ident} (tentativa {last['tentativa']}), "
                  f"{time.strftime('%H:%M:%S')}:\n\n" + "\n".join(lines) + f"\n- veredito final: {final}\n\n")
    print(f"\nRESULTADO FINAL DO {test.ident}: {final}")
    return final


def run_test(test, auto=False):
    require_bridge()
    attempt = len(done().get(test.ident, [])) + 1
    commands = show_prepare(test, attempt)
    if not auto:
        answer = input("\nQuando estiver tudo pronto, digite ok e ENTER (ou 'pular'): ").strip().lower()
        if answer != "ok":
            print("Teste não executado.")
            if answer == "pular":
                record(test, attempt, "PULADO", [], {})
            return None

    boot_before = state().get("boot", "")
    mark(f"TESTE {test.ident} tentativa {attempt} | {time.strftime('%H:%M:%S')} | comando: {commands}")
    start = log_size()
    finished = True
    try:
        for index, step in enumerate(test.steps):
            offset = log_size()
            send(step.command)
            print(f"  -> {step.command} ({index + 1}/{len(test.steps)}); esperando o robô (até {step.timeout} s)...")
            _, found = wait_for(offset, step.end, step.timeout, step.count, step.settle, test.watch)
            if not found:
                finished = False
                print("  !! O robô não respondeu no tempo esperado.")
                break
            if index + 1 < len(test.steps) and step.gap:
                time.sleep(step.gap)
    except KeyboardInterrupt:
        send("parar")
        finished = False
        print("\n  !! Ctrl+C: mandei 'parar' ao robô.")
        time.sleep(1.5)

    lines = read_from(start)
    (RESULTS / f"{test.ident}_t{attempt}.log").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\nO QUE O ROBÔ RESPONDEU:")
    for line in lines:
        print("   ", line)

    checks = []
    if not finished:
        checks.append((FALHOU, "o teste não chegou ao fim (sem resposta do robô, ou interrompido)"))
    boot_after = state().get("boot", "")
    if boot_before and boot_after and boot_after != boot_before:
        checks.append((FALHOU, f"O ROBÔ REINICIOU SOZINHO durante o teste (boot {boot_before} -> {boot_after}): "
                               "queda de tensão ou travamento. Rode 'python t.py H1' e veja o 'reset='"))
    if not state().get("conectado"):
        checks.append((FALHOU, "a ponte perdeu a conexão com o robô durante o teste"))
    try:
        checks += test.check(lines)
    except Exception as error:  # um formato de linha inesperado não pode derrubar o roteiro
        checks.append((CONFERIR, f"não consegui conferir sozinho ({error}); leia as linhas acima"))

    print("\nCONFERÊNCIA AUTOMÁTICA:")
    for status, text in checks:
        print(f"  [{status or 'dado':8}] {text}")

    answers = {}
    if test.questions:
        if auto:
            for item in test.questions:
                print(f"PERGUNTAR: ({item['key']}) {item['text']}")
        else:
            print("\nAGORA RESPONDA olhando o robô:")
            for item in test.questions:
                value, ok = ask(item)
                answers[item["key"]] = value
                checks.append((PASSOU if ok else FALHOU, f"operador: {item['text']} -> {value}"))

    result = overall(checks)
    if auto and test.questions:
        result += " (falta a resposta do operador)"
    print(f"\nRESULTADO DO {test.ident}: {result}")
    note = ""
    if not auto:
        note = input("Observação (o que você viu de diferente; ENTER se nada): ").strip()
    record(test, attempt, result, checks, answers, note)

    if test.ends_in_error:
        print("\nEste teste deixa o robô em Erro de propósito. Reiniciando...")
        restart_robot()
    elif any("fim da corrida" in line and "FALHA" in line for line in lines):
        print("\nA corrida terminou em FALHA: o robô está em Erro e NÃO aceita comandos de motor.")
        print("Antes de tirá-lo do lugar, se quiser ver onde ele parou:  python t.py cmd \"tof\"")
        print("Depois:  python t.py reiniciar")
    print(f"Log deste teste: resultados/{test.ident}_t{attempt}.log")
    return result


def gate():
    """Checagem rápida antes de cada bloco: os três ToF respondem e os contadores estão em zero."""
    require_bridge()
    mark(f"PORTAO | {time.strftime('%H:%M:%S')}")
    start = log_size()
    send("tofmon 3")
    wait_for(start, r"tofmon fim: ", 15)
    offset = log_size()
    send("saude")
    wait_for(offset, r"saude 2/2: ", 10)
    lines = read_from(start)
    checks = check_tofmon(lines) + check_health(lines)
    for line in lines:
        print("   ", line)
    print("\nPORTÃO:")
    for status, text in checks:
        print(f"  [{status or 'dado':8}] {text}")
    result = overall(checks)
    print(f"\nPORTÃO: {result}")
    if result == CONFERIR:
        print("Pode seguir. Anote o que ficou em CONFERIR.")
    if result == FALHOU:
        print("NÃO siga para o próximo bloco. Um sensor falhou ou há erros acumulados: anote, rode "
              "'python t.py H1' para o relatório completo e avise a equipe.")
        print("Os contadores só voltam a zero com 'python t.py reiniciar'. Depois de reiniciar, rode o portão "
              "de novo: se passar, o defeito é intermitente (anote a hora) e você pode seguir.")
    return result


# ----------------------------------------------------------------------------------------------
# Calibração pelo comando `calib` do robô (16/11)
# ----------------------------------------------------------------------------------------------
# (nome no robô, pergunta ao operador, mínimo, máximo)
MEASURES = [
    ("eixo_ate_frente", "Do MEIO DO EIXO das rodas até o ponto MAIS À FRENTE do robô (chassi ou sensor)",
     60, 115),
    ("largura_frente", "LARGURA do robô na parte da frente, no ponto mais largo, contando os suportes "
                       "dos sensores laterais", 80, 130),
    ("eixo_ate_tof_frente", "Do MEIO DO EIXO das rodas até a FACE (janela) do sensor de distância da "
                            "frente", 60, 115),
    ("largura_com_rodas", "LARGURA TOTAL com as rodas: de fora de um pneu até fora do outro", 80, 150),
    ("tof_lado_ao_centro", "Da FACE de um sensor lateral até a LINHA DO MEIO do robô (metade da "
                           "distância entre as faces dos dois sensores laterais)", 20, 75),
    ("tof_lado_a_frente_do_eixo", "Quanto os sensores laterais ficam À FRENTE do eixo das rodas", 0, 115),
]


def calib_send(arguments, wait=8.0):
    """Manda `calib ...` e devolve as linhas "calib:" que o robô respondeu."""
    require_bridge()
    mark(f"CALIB | {time.strftime('%H:%M:%S')} | {arguments or '(ver)'}")
    offset = log_size()
    send(("calib " + arguments).strip())
    lines, _ = wait_for(offset, r"calib: (fim:|RECUSADO)", wait)
    return [line for line in lines if line.startswith("calib: ")]


def calib_show(lines):
    for line in lines:
        print("   ", line)
    if not lines:
        print("O robô não respondeu ao `calib`. O firmware gravado é o de 16/11 ou mais novo, com "
              "RATO_LOG_RETA?")
        return False
    if any("RECUSADO" in line for line in lines):
        print("\nO robô RECUSOU: nada mudou. Veja o nome e a faixa na linha acima.")
        return False
    return True


def calib_note(text):
    with open(REPORT, "a", encoding="utf-8", newline="\n") as out:
        out.write(f"- calibração ({time.strftime('%d/%m %H:%M:%S')}): {text}\n\n")


def calib_values(lines):
    """{nome: valor} das linhas "calib: nome = valor ..."."""
    values = {}
    for match in grep(lines, r"calib: (\w+) = (-?[\d.]+) "):
        values[match.group(1)] = float(match.group(2))
    return values


def ask_measures():
    """`medidas`: pergunta cada medida pelo nome, confere a faixa e grava no robô."""
    current = calib_values(calib_send(""))
    print("Medidas do robô, em milímetros, com PAQUÍMETRO. ENTER sem número = não mudar.")
    print("O 'meio do eixo' é o ponto no meio entre as duas rodas, na linha dos eixos dos motores.\n")
    chosen = []
    for name, text, low, high in MEASURES:
        now = current.get(name)
        shown = "não medido" if not now else f"{now:g} mm"
        while True:
            answer = input(f"  {text}\n    ({name}; valor no robô: {shown}; aceito {low} a {high}): ").strip()
            if not answer:
                break
            try:
                value = float(answer.replace(",", "."))
            except ValueError:
                print("    Digite só o número, em mm.")
                continue
            if not low <= value <= high:
                print(f"    {value:g} mm está fora do esperado ({low} a {high}). Confira a medida.")
                continue
            chosen.append(f"{name}={value:g}")
            break
    if not chosen:
        print("Nada a gravar.")
        return
    command = " ".join(chosen)
    print(f"\nGravando no robô: calib {command}")
    if calib_show(calib_send(command)):
        calib_note(f"medidas gravadas no robô: {command}")
        print("\nGravado. As medidas valem também depois de reiniciar o robô.")


def heading_from_wall(start_mm, end_mm, travelled_mm, left_wall):
    """Ângulo do robô em relação à parede (graus, positivo = virado para a esquerda), pela
    distância lateral no começo e no fim de uma reta."""
    import math
    change = end_mm - start_mm  # afastou-se da parede: positivo
    angle = math.degrees(math.atan2(change, travelled_mm))
    return -angle if left_wall else angle  # afastar-se da parede ESQUERDA é virar à direita


def gyro_scale_from_runs(before_deg, after_deg, gyro_total_deg, scale_in_use, turns=4, right=True):
    """Escala nova do giroscópio. `before`/`after`: ângulo em relação à parede antes e depois das
    curvas; `gyro_total_deg`: o que o giroscópio somou nas curvas (com sinal: direita negativo)."""
    real_total = (-90.0 if right else 90.0) * turns + (after_deg - before_deg)
    if abs(gyro_total_deg) < 1.0:
        return None
    return scale_in_use * real_total / gyro_total_deg


def straight_along_wall(label):
    """Lê os ToF parados, anda uma célula e devolve (lado, início, fim, andado) pela parede mais
    perto. None se não houver parede lateral legível."""
    offset = log_size()
    send("tof")
    lines, found = wait_for(offset, r"tof 5/5: ", 15)
    means = tof_means(lines) if found else None
    offset = log_size()
    send("andar")
    lines, found = wait_for(offset, MANEUVER, 15)
    end = grep(lines, r"reta: andar 1 celula (-?\d+) mm: enc E=(-?\d+) D=(-?\d+) \((-?[\d.]+) / (-?[\d.]+) mm\)"
                      r".* lat E=(-?\d+) D=(-?\d+) (.*)$")
    if means is None or not found or not end or not end[-1].group(8).strip().endswith("ok"):
        print(f"  !! {label}: a reta ou a leitura dos sensores falhou.")
        return None
    travelled = 0.5 * (float(end[-1].group(4)) + float(end[-1].group(5)))
    left_start, right_start = means[0], means[2]
    left_end, right_end = int(end[-1].group(6)), int(end[-1].group(7))
    for left_wall, start, finish in ((True, left_start, left_end), (False, right_start, right_end)):
        if 15 <= start <= 80 and 15 <= finish <= 80:
            print(f"  {label}: parede à {'esquerda' if left_wall else 'direita'}, de {start:.0f} para "
                  f"{finish} mm em {travelled:.0f} mm")
            return left_wall, start, finish, travelled
    print(f"  !! {label}: nenhuma parede lateral entre 15 e 80 mm no começo e no fim (E {left_start:.0f}->"
          f"{left_end}, D {right_start:.0f}->{right_end}).")
    return None


def calibrate_gyro(auto):
    """`calib-giro`: mede a escala do giroscópio sem régua. O robô anda ao lado de uma parede, faz
    4 curvas à direita (uma volta) e anda de novo ao lado da mesma parede. A parede diz quanto ele
    girou DE VERDADE; o log diz quanto o giroscópio achou."""
    require_bridge()
    values = calib_values(calib_send(""))
    if "escala_giro" not in values:
        sys.exit("O robô não respondeu ao `calib`: não sei a escala em uso.")
    scale = values["escala_giro"]
    print("=" * 78)
    print("CALIBRAÇÃO DA ESCALA DO GIROSCÓPIO")
    print("\nPREPARO (faça nesta ordem):")
    print("  1. Um corredor RETO da pista com pelo menos 3 células e parede contínua de UM dos lados")
    print("     (por exemplo a linha de baixo do labirinto, ao lado da borda).")
    print("  2. Robô no CHÃO, no MEIO da primeira célula, alinhado com o corredor, com 2 células")
    print("     livres à frente.")
    print("  3. O robô anda 1 célula, faz 4 curvas à direita no lugar (uma volta) e anda mais 1 célula.")
    print("     Leva ~20 s. Não toque nele.")
    print(f"\nEscala em uso: {scale:.3f}")
    if not auto and input("\nQuando estiver pronto, digite ok e ENTER: ").strip().lower() != "ok":
        print("Não executado.")
        return
    mark(f"CALIB-GIRO | {time.strftime('%H:%M:%S')} | escala em uso {scale:.3f}")
    start = log_size()
    try:
        first = straight_along_wall("reta 1")
        if first is None:
            return
        turns_offset = log_size()
        for index in range(4):
            offset = log_size()
            send("virar d")
            lines, found = wait_for(offset, MANEUVER, 25)
            if not found or not grep(lines, r"teste: manobra .*: ok"):
                print(f"  !! a curva {index + 1} falhou; calibração interrompida.")
                return
            time.sleep(0.6)
        turn_lines = read_from(turns_offset)
        second = straight_along_wall("reta 2")
        if second is None:
            return
    except KeyboardInterrupt:
        send("parar")
        print("\n  !! Ctrl+C: mandei 'parar' ao robô.")
        return
    if first[0] != second[0]:
        print("  !! a parede usada na 2ª reta não é a do mesmo lado da 1ª. Repita num corredor com "
              "parede contínua.")
        return
    before = heading_from_wall(first[1], first[2], first[3], first[0])
    after = heading_from_wall(second[1], second[2], second[3], second[0])
    finals = [float(m.group(1)) for m in grep(turn_lines, r"curva: alvo=90 parou=-?[\d.]+ final=(-?[\d.]+) ")]
    drifts = [float(m.group(1)) for m in grep(turn_lines, r"reta: .* giro=(-?[\d.]+) ")]
    gyro_total = sum(finals) + sum(drifts)
    new_scale = gyro_scale_from_runs(before, after, gyro_total, scale)
    (RESULTS / f"calib-giro_{time.strftime('%H%M%S')}.log").write_text(
        "\n".join(read_from(start)) + "\n", encoding="utf-8")
    print(f"\n  ângulo em relação à parede: antes {before:+.1f}, depois {after:+.1f} graus")
    print(f"  o giroscópio somou {gyro_total:+.1f} graus em {len(finals)} curvas "
          f"(giro real: {-360.0 + after - before:+.1f})")
    if new_scale is None or len(finals) != 4 or not 0.90 <= new_scale <= 1.20:
        print("  !! resultado fora do esperado; não proponho valor. Repita com o robô bem alinhado.")
        return
    error = abs(after - before)
    print(f"\nESCALA MEDIDA: {new_scale:.3f} (em uso: {scale:.3f}). Erro da volta com a escala em uso: "
          f"{error:.1f} graus.")
    calib_note(f"calib-giro: antes {before:+.1f}, depois {after:+.1f} graus em relação à parede; "
               f"giroscópio {gyro_total:+.1f}; escala em uso {scale:.3f}, medida {new_scale:.3f}")
    if error < 1.5:
        print("A escala em uso já está boa (erro menor que 1,5 grau na volta): não mude.")
        return
    command = f"escala_giro={new_scale:.3f}"
    if auto:
        print(f"PROPOSTA: python t.py calib \"{command}\"   (repita o calib-giro depois para conferir)")
        return
    if input(f"Gravar no robô 'calib {command}'? [s/n]: ").strip().lower() == "s":
        if calib_show(calib_send(command)):
            calib_note(f"gravado no robô: {command}")
            print("Gravado. Rode 'python t.py calib-giro' de novo para conferir (erro esperado < 1,5 grau).")


# ----------------------------------------------------------------------------------------------
# Corrida livre (18/11): qualquer labirinto, só coleta e métricas
# ----------------------------------------------------------------------------------------------
RAW_LINE = re.compile(r"^[IWE] \((\d+)\) (.*)$")


def raw_from(offset):
    """Linhas do robô depois de `offset`, com o carimbo do robô em ms: [(ms, texto)]."""
    if not LOG.exists():
        return []
    with open(LOG, "rb") as handle:
        handle.seek(offset)
        data = handle.read().decode("utf-8", errors="replace")
    out = []
    for line in data.splitlines():
        match = RAW_LINE.match(line.rstrip("\r"))
        if match:
            out.append((int(match.group(1)), match.group(2)))
    return out


def run_metrics(raw):
    """Métricas de uma corrida, para comparar dias, pistas e valores do `calib`."""
    def first(pattern):
        regex = re.compile(pattern)
        for stamp, text in raw:
            found = regex.search(text)
            if found:
                return stamp, found
        return None, None

    metrics = {}
    start_ms, start = first(r"main: largada \d+: labirinto (\d+)x(\d+), via 3 (\w+)")
    end_ms, end = first(r"main: fim da corrida \d+: (\w+), (\d+) passos, (\d+) celulas, posicao \((l\d+,c\d+)\) "
                        r"rumo (\w), passagens para fora=(\d+)")
    if start:
        metrics["labirinto"] = f"{start.group(1)}x{start.group(2)}"
        metrics["via3"] = start.group(3).lower()
    if end:
        metrics.update(resultado=end.group(1), passos=int(end.group(2)), celulas=int(end.group(3)),
                       posicao_final=end.group(4), fora=int(end.group(6)))
    steps = [stamp for stamp, text in raw if text.startswith("nav: passo ")]
    if steps and start_ms is not None:
        metrics["tempo_s"] = round((steps[-1] - start_ms) / 1000.0, 1)
        if len(steps) > 1:
            metrics["s_por_passo"] = round((steps[-1] - steps[0]) / 1000.0 / (len(steps) - 1), 2)
    texts = [text for _, text in raw]
    metrics["curvas"] = sum(1 for text in texts if text.startswith("curva: alvo="))
    metrics["ajustes_antes_da_curva"] = sum(1 for text in texts if text.startswith("reta: ajuste antes da curva"))
    stops = [int(m.group(1)) for m in (re.search(r"frontal (-?\d+) mm na parada", t) for t in texts) if m]
    if stops:
        metrics["frontal_na_parada_min"] = min(stops)
        metrics["frontal_na_parada_abaixo_40"] = sum(1 for value in stops if value < 40)
    finals = [abs(float(m.group(1))) for m in (re.search(r"curva: alvo=90 parou=-?[\d.]+ final=(-?[\d.]+)", t)
                                               for t in texts) if m]
    if finals:
        metrics["curva_final_min"] = round(min(finals), 1)
        metrics["curva_final_max"] = round(max(finals), 1)
    gyros = [abs(float(m.group(1))) for m in (re.search(r"^reta: (?:andar|re de) .* giro=(-?[\d.]+) ", t)
                                              for t in texts) if m]
    if gyros:
        metrics["reta_giro_max"] = round(max(gyros), 1)
    sides = []
    for text in texts:
        found = re.search(r"tof: depois da curva: E=(-?\d+) .*D=(-?\d+)", text)
        if found:
            sides += [int(v) for v in found.groups() if 0 <= int(v) < 9999]
    if sides:
        metrics["lateral_pos_curva_min"] = min(sides)
    metrics["rumo_perdido"] = sum(1 for text in texts if "rumo perdido" in text)
    metrics["curva_travada"] = sum(1 for text in texts if "curva travada" in text)
    metrics["tentativa2"] = sum(1 for text in texts if "tentativa 2 do arco" in text)
    metrics["paradas_pela_frente"] = sum(1 for text in texts if re.search(r"parou antes=[1-9]\d* mm", text))
    metrics["mapa_esquecido"] = sum(1 for text in texts if "(mapa esquecido)" in text)
    metrics["espera_lado"] = sum(1 for text in texts if re.search(r"acao=(espera|assumiu parede)", text))
    metrics["tof_parou"] = sum(1 for text in texts if re.search(r"tof: \w+ PAROU", text))
    health = [m for m in (re.search(r"saude 2/2: i2c erros tof E=(\d+) F=(\d+) D=(\d+) .*tof quedas E=(\d+) F=(\d+) "
                                    r"D=(\d+)", t) for t in texts) if m]
    if health:
        metrics["i2c_erros_tof"] = sum(int(v) for v in health[-1].groups()[:3])
        metrics["quedas_tof"] = sum(int(v) for v in health[-1].groups()[3:])
    calib = [t for t in texts if t.startswith("main: calib em uso:")]
    if calib:
        metrics["calib"] = calib[-1].replace("main: calib em uso: ", "")
    return metrics


def free_run(label, description, auto):
    """`corrida`: larga, espera o fim e guarda o log e as métricas. Não confere caminho esperado."""
    require_bridge()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,40}", label):
        sys.exit("Rótulo inválido: use letras, números, ponto, hífen ou sublinhado (até 40), ex.: OF-4x4-A.")
    attempt = len(done().get(label, [])) + 1
    print("=" * 78)
    print(f"CORRIDA {label} (tentativa {attempt}): {description}")
    print("O robô vai correr sozinho até o canto oposto (até ~2 min). Ctrl+C manda parar.")
    if not auto and input("\nQuando estiver pronto, digite ok e ENTER (ou 'pular'): ").strip().lower() != "ok":
        print("Não executado.")
        return None
    boot_before = state().get("boot", "")
    mark(f"CORRIDA {label} tentativa {attempt} | {time.strftime('%H:%M:%S')} | {description}")
    start = log_size()
    finished = True
    try:
        send("largar")
        print("  -> largar; esperando o robô (até 180 s)...")
        _, finished = wait_for(start, RUN_END, 180, settle=2.0)
    except KeyboardInterrupt:
        send("parar")
        finished = False
        print("\n  !! Ctrl+C: mandei 'parar' ao robô.")
        time.sleep(1.5)
    lines = read_from(start)
    log_name = f"{label}_t{attempt}.log"
    (RESULTS / log_name).write_text("\n".join(lines) + "\n", encoding="utf-8")
    metrics = run_metrics(raw_from(start))
    rebooted = bool(boot_before and state().get("boot") and state().get("boot") != boot_before)
    print("\nMÉTRICAS:")
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    if not finished:
        print("  !! a corrida não terminou no log (tempo esgotado ou interrompida)")
    if rebooted:
        print("  !! O ROBÔ REINICIOU SOZINHO durante a corrida")
    result = metrics.get("resultado", "SEM FIM")
    verdict_text = PASSOU if result == "SUCESSO" and finished and not rebooted else FALHOU
    history = done()
    history.setdefault(label, []).append({"hora": time.strftime("%H:%M:%S"), "tentativa": attempt,
                                          "veredito": verdict_text, "automatico": verdict_text})
    DONE.write_text(json.dumps(history, indent=1), encoding="utf-8")
    with open(REPORT, "a", encoding="utf-8", newline="\n") as out:
        out.write(f"## {label} (tentativa {attempt}) — corrida — {verdict_text} — {time.strftime('%H:%M:%S')}\n\n")
        out.write(f"{description}. Log: {log_name}.\n\n")
        for key, value in metrics.items():
            out.write(f"- {key}: {value}\n")
        if rebooted:
            out.write("- O ROBÔ REINICIOU SOZINHO durante a corrida\n")
        out.write("\n")
    columns = ["data", "hora", "rotulo", "tentativa", "descricao", "resultado", "labirinto", "via3", "passos",
               "celulas", "tempo_s", "s_por_passo", "curvas", "ajustes_antes_da_curva", "frontal_na_parada_min",
               "frontal_na_parada_abaixo_40", "curva_final_min", "curva_final_max", "reta_giro_max",
               "lateral_pos_curva_min", "rumo_perdido", "curva_travada", "tentativa2", "paradas_pela_frente",
               "mapa_esquecido", "espera_lado", "tof_parou", "i2c_erros_tof", "quedas_tof", "fora",
               "posicao_final", "calib", "log"]
    row = dict(metrics, data=time.strftime("%Y-%m-%d"), hora=time.strftime("%H:%M:%S"), rotulo=label,
               tentativa=attempt, descricao=description, log=log_name)
    csv_path = RESULTS / "corridas.csv"
    new = not csv_path.exists()
    with open(csv_path, "a", encoding="utf-8", newline="") as out:
        import csv
        writer = csv.DictWriter(out, fieldnames=columns, extrasaction="ignore", delimiter=";")
        if new:
            writer.writeheader()
        writer.writerow(row)
    print(f"\nRESULTADO DA CORRIDA {label}: {verdict_text}   (log: resultados/{log_name})")
    if "FALHA" in result:
        print("A corrida terminou em FALHA: o robô está em Erro e NÃO aceita comandos de motor.")
        print("Antes de tirá-lo do lugar:  python t.py cmd \"tof\"   Depois:  python t.py reiniciar")
    return verdict_text


def list_tests():
    history = done()
    for block, title in BLOCKS.items():
        print(f"\n{title}")
        for test in TESTS:
            if test.ident[0] != block:
                continue
            runs = history.get(test.ident, [])
            status = ", ".join(f"{run['veredito']}" for run in runs) or "não feito"
            times = f" (x{test.repeat})" if test.repeat > 1 else ""
            print(f"  {test.ident:8} {test.title}{times}: {status}")
    print("\nRode um teste com:  python t.py <ID>     Antes de cada bloco:  python t.py portao")


def main():
    for stream in (sys.stdout, sys.stderr):
        if isinstance(stream, io.TextIOWrapper):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = [arg for arg in sys.argv[1:] if arg != "--auto"]
    auto = "--auto" in sys.argv
    RESULTS.mkdir(exist_ok=True)
    if not args or args[0] in ("lista", "resumo"):
        list_tests()
        return
    name = args[0]
    if name == "portao":
        sys.exit(1 if gate() == FALHOU else 0)
    if name == "reiniciar":
        require_bridge()
        sys.exit(0 if restart_robot() else 1)
    if name == "parar":
        send("parar")
        print("Mandei 'parar'.")
        return
    if name == "cmd" and len(args) >= 2:
        require_bridge()
        mark(f"COMANDO AVULSO | {time.strftime('%H:%M:%S')} | {args[1]}")
        offset = log_size()
        send(args[1])
        wait = float(args[2]) if len(args) > 2 else 6.0
        time.sleep(wait)
        for line in read_from(offset):
            print("   ", line)
        return
    if name == "nota" and len(args) >= 3:
        with open(REPORT, "a", encoding="utf-8", newline="\n") as out:
            out.write(f"- nota sobre o {args[1]} ({time.strftime('%H:%M:%S')}): {args[2]}\n\n")
        print("Anotado.")
        return
    if name == "corrida" and len(args) >= 2:
        result = free_run(args[1], args[2] if len(args) > 2 else "", auto)
        sys.exit(0 if result == PASSOU else 1)
    if name == "calib-ver":
        calib_show(calib_send(""))
        return
    if name == "calib" and len(args) >= 2:
        if calib_show(calib_send(" ".join(args[1:]))):
            calib_note(f"gravado no robô: {' '.join(args[1:])}")
        return
    if name == "medidas":
        ask_measures()
        return
    if name == "calib-giro":
        calibrate_gyro(auto)
        return
    if name in ("preparo", "responder") and len(args) >= 2:
        test = BY_ID.get(args[1].upper())
        if test is None:
            sys.exit(f"Não conheço o teste '{args[1]}'. Rode 'python t.py' para ver a lista.")
        if name == "preparo":
            show_prepare(test, len(done().get(test.ident, [])) + 1)
            return
        sys.exit(0 if record_answers(test, args[2:]) == PASSOU else 1)
    test = BY_ID.get(name.upper())
    if test is None:
        sys.exit(f"Não conheço o teste '{name}'. Rode 'python t.py' para ver a lista.")
    result = run_test(test, auto)
    sys.exit(0 if result and result.startswith(PASSOU) else 1)


if __name__ == "__main__":
    main()
