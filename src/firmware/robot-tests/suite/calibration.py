"""Calibração sem regravar o firmware, pelo comando `calib` do robô (valores gravados na memória dele)."""

import math
import sys
import time
from dataclasses import dataclass
from typing import NamedTuple

from . import clock
from .checks.motion import MANEUVER_END
from .checks.sensors import tof_means
from .console import SEPARATOR, print_robot_lines
from .log_parsing import find_matches
from .operator_io import Operator, StartDecision
from .results import Report
from .robot_link import RobotLink
from .workspace import Workspace

GYRO_SCALE_KEY = "escala_giro"
TURNS_PER_LAP = 4
ACCEPTABLE_LAP_ERROR_DEG = 1.5
PLAUSIBLE_GYRO_SCALE = (0.90, 1.20)
WALL_RANGE_MM = (15, 80)


@dataclass(frozen=True)
class Measure:
    name: str  # nome do valor no robô
    question: str
    low_mm: float
    high_mm: float


MEASURES = (
    Measure("eixo_ate_frente", "Do MEIO DO EIXO das rodas até o ponto MAIS À FRENTE do robô (chassi ou sensor)",
            60, 115),
    Measure("largura_frente", "LARGURA do robô na parte da frente, no ponto mais largo, contando os suportes "
                              "dos sensores laterais", 80, 130),
    Measure("eixo_ate_tof_frente", "Do MEIO DO EIXO das rodas até a FACE (janela) do sensor de distância da "
                                   "frente", 60, 115),
    Measure("largura_com_rodas", "LARGURA TOTAL com as rodas: de fora de um pneu até fora do outro", 80, 150),
    Measure("tof_lado_ao_centro", "Da FACE de um sensor lateral até a LINHA DO MEIO do robô (metade da "
                                  "distância entre as faces dos dois sensores laterais)", 20, 75),
    Measure("tof_lado_a_frente_do_eixo", "Quanto os sensores laterais ficam À FRENTE do eixo das rodas", 0, 115),
)


class CalibrationClient:
    """Lê e grava os valores do `calib` no robô e anota as mudanças no relatório."""

    def __init__(self, link: RobotLink, report: Report) -> None:
        self._link = link
        self._report = report

    def send(self, arguments: str = "", wait_s: float = 8.0) -> list[str]:
        """Manda `calib ...` e devolve as linhas "calib:" que o robô respondeu."""
        self._link.require_bridge()
        self._link.mark("CALIB", arguments or "(ver)")
        offset = self._link.log_size()
        self._link.send(("calib " + arguments).strip())
        lines, _ = self._link.wait_for(offset, r"calib: (fim:|RECUSADO)", wait_s)
        return [line for line in lines if line.startswith("calib: ")]

    @staticmethod
    def show(lines: list[str]) -> bool:
        """Mostra a resposta; False se o robô não respondeu ou recusou."""
        print_robot_lines(lines)
        if not lines:
            print("O robô não respondeu ao `calib`. O firmware gravado é o de 16/11 ou mais novo, com "
                  "RATO_LOG_RETA?")
            return False
        if any("RECUSADO" in line for line in lines):
            print("\nO robô RECUSOU: nada mudou. Veja o nome e a faixa na linha acima.")
            return False
        return True

    def current_values(self) -> dict[str, float]:
        return {match.group(1): float(match.group(2))
                for match in find_matches(self.send(), r"calib: (\w+) = (-?[\d.]+) ")}

    def write(self, assignments: str, note_prefix: str = "gravado no robô") -> bool:
        if not self.show(self.send(assignments)):
            return False
        self.note(f"{note_prefix}: {assignments}")
        return True

    def note(self, text: str) -> None:
        self._report.add_calibration_note(text)


def ask_measures(client: CalibrationClient) -> None:
    """`medidas`: pergunta cada medida pelo nome, confere a faixa e grava no robô."""
    current = client.current_values()
    print("Medidas do robô, em milímetros (trena ou fita métrica; por diferença entre dois anteparos). "
          "ENTER sem número = não mudar.")
    print("O 'meio do eixo' é o ponto no meio entre as duas rodas, na linha dos eixos dos motores.\n")
    assignments = [f"{measure.name}={value:g}" for measure in MEASURES
                   if (value := _ask_measure(measure, current.get(measure.name))) is not None]
    if not assignments:
        print("Nada a gravar.")
        return
    command = " ".join(assignments)
    print(f"\nGravando no robô: calib {command}")
    if client.write(command, note_prefix="medidas gravadas no robô"):
        print("\nGravado. As medidas valem também depois de reiniciar o robô.")


def _ask_measure(measure: Measure, current: float | None) -> float | None:
    shown = f"{current:g} mm" if current else "não medido"
    while True:
        answer = input(f"  {measure.question}\n    ({measure.name}; valor no robô: {shown}; "
                       f"aceito {measure.low_mm} a {measure.high_mm}): ").strip()
        if not answer:
            return None
        try:
            value = float(answer.replace(",", "."))
        except ValueError:
            print("    Digite só o número, em mm.")
            continue
        if measure.low_mm <= value <= measure.high_mm:
            return value
        print(f"    {value:g} mm está fora do esperado ({measure.low_mm} a {measure.high_mm}). Confira a medida.")


# --- escala do giroscópio ----------------------------------------------------------------------
class WallPass(NamedTuple):
    """Uma reta ao lado de uma parede: distância lateral no começo e no fim."""

    left_wall: bool
    start_mm: float
    end_mm: float
    travelled_mm: float

    def heading_deg(self) -> float:
        """Ângulo do robô em relação à parede (graus, positivo = virado para a esquerda)."""
        angle = math.degrees(math.atan2(self.end_mm - self.start_mm, self.travelled_mm))
        return -angle if self.left_wall else angle  # afastar-se da parede ESQUERDA é virar à direita


def gyro_scale_from_lap(heading_before_deg: float, heading_after_deg: float, gyro_total_deg: float,
                        scale_in_use: float, turns: int = TURNS_PER_LAP, right: bool = True) -> float | None:
    """Escala nova do giroscópio. `gyro_total_deg`: o que o giroscópio somou nas curvas (direita negativo)."""
    real_total = (-90.0 if right else 90.0) * turns + (heading_after_deg - heading_before_deg)
    if abs(gyro_total_deg) < 1.0:
        return None
    return scale_in_use * real_total / gyro_total_deg


class GyroCalibration:
    """`calib-giro`: mede a escala do giroscópio sem régua.

    O robô anda ao lado de uma parede, faz 4 curvas à direita (uma volta) e anda de novo ao lado da
    mesma parede. A parede diz quanto ele girou DE VERDADE; o log diz quanto o giroscópio achou."""

    def __init__(self, link: RobotLink, client: CalibrationClient, operator: Operator,
                 workspace: Workspace) -> None:
        self._link = link
        self._client = client
        self._operator = operator
        self._workspace = workspace

    def run(self) -> None:
        self._link.require_bridge()
        values = self._client.current_values()
        if GYRO_SCALE_KEY not in values:
            sys.exit("O robô não respondeu ao `calib`: não sei a escala em uso.")
        scale = values[GYRO_SCALE_KEY]
        self._describe(scale)
        if self._operator.confirm_start(allow_skip=False) is not StartDecision.RUN:
            print("Não executado.")
            return
        self._link.mark("CALIB-GIRO", f"escala em uso {scale:.3f}")
        start = self._link.log_size()
        try:
            measured = self._drive_lap()
        except KeyboardInterrupt:
            self._link.stop_after_interrupt()
            return
        if measured is None:
            return
        first, second, turn_lines = measured
        self._workspace.save_log(self._workspace.gyro_calibration_log(clock.compact_time_of_day()),
                                 self._link.read_from(start))
        self._propose(scale, first, second, turn_lines)

    @staticmethod
    def _describe(scale: float) -> None:
        print(SEPARATOR)
        print("CALIBRAÇÃO DA ESCALA DO GIROSCÓPIO")
        print("\nPREPARO (faça nesta ordem):")
        print("  1. Um corredor RETO da pista com pelo menos 3 células e parede contínua de UM dos lados")
        print("     (por exemplo a linha de baixo do labirinto, ao lado da borda).")
        print("  2. Robô no CHÃO, no MEIO da primeira célula, alinhado com o corredor, com 2 células")
        print("     livres à frente.")
        print("  3. O robô anda 1 célula, faz 4 curvas à direita no lugar (uma volta) e anda mais 1 célula.")
        print("     Leva ~20 s. Não toque nele.")
        print(f"\nEscala em uso: {scale:.3f}")

    def _drive_lap(self) -> tuple[WallPass, WallPass, list[str]] | None:
        first = self._straight_along_wall("reta 1")
        if first is None:
            return None
        turns_offset = self._link.log_size()
        for index in range(TURNS_PER_LAP):
            lines, found = self._link.send_and_wait("virar d", MANEUVER_END, 25)
            if not found or not find_matches(lines, r"teste: manobra .*: ok"):
                print(f"  !! a curva {index + 1} falhou; calibração interrompida.")
                return None
            time.sleep(0.6)
        turn_lines = self._link.read_from(turns_offset)
        second = self._straight_along_wall("reta 2")
        if second is None:
            return None
        if first.left_wall != second.left_wall:
            print("  !! a parede usada na 2ª reta não é a do mesmo lado da 1ª. Repita num corredor com "
                  "parede contínua.")
            return None
        return first, second, turn_lines

    def _straight_along_wall(self, label: str) -> WallPass | None:
        """Lê os ToF parados, anda uma célula e mede a parede lateral mais perto."""
        lines, found = self._link.send_and_wait("tof", r"tof 5/5: ", 15)
        means = tof_means(lines) if found else None
        lines, found = self._link.send_and_wait("andar", MANEUVER_END, 15)
        end = find_matches(lines, r"reta: andar 1 celula (-?\d+) mm: enc E=(-?\d+) D=(-?\d+) "
                                  r"\((?P<left_mm>-?[\d.]+) / (?P<right_mm>-?[\d.]+) mm\)"
                                  r".* lat E=(?P<lat_left>-?\d+) D=(?P<lat_right>-?\d+) (?P<outcome>.*)$")
        if means is None or not found or not end or not end[-1]["outcome"].strip().endswith("ok"):
            print(f"  !! {label}: a reta ou a leitura dos sensores falhou.")
            return None
        last = end[-1]
        travelled = 0.5 * (float(last["left_mm"]) + float(last["right_mm"]))
        left_start, right_start = means[0], means[2]
        left_end, right_end = int(last["lat_left"]), int(last["lat_right"])
        low, high = WALL_RANGE_MM
        for left_wall, start, finish in ((True, left_start, left_end), (False, right_start, right_end)):
            if low <= start <= high and low <= finish <= high:
                print(f"  {label}: parede à {'esquerda' if left_wall else 'direita'}, de {start:.0f} para "
                      f"{finish} mm em {travelled:.0f} mm")
                return WallPass(left_wall, start, finish, travelled)
        print(f"  !! {label}: nenhuma parede lateral entre {low} e {high} mm no começo e no fim "
              f"(E {left_start:.0f}->{left_end}, D {right_start:.0f}->{right_end}).")
        return None

    def _propose(self, scale: float, first: WallPass, second: WallPass, turn_lines: list[str]) -> None:
        before, after = first.heading_deg(), second.heading_deg()
        turn_finals = [float(match.group(1)) for match in
                       find_matches(turn_lines, r"curva: alvo=90 parou=-?[\d.]+ final=(-?[\d.]+) ")]
        straight_drifts = [float(match.group(1)) for match in find_matches(turn_lines, r"reta: .* giro=(-?[\d.]+) ")]
        gyro_total = sum(turn_finals) + sum(straight_drifts)
        new_scale = gyro_scale_from_lap(before, after, gyro_total, scale)
        print(f"\n  ângulo em relação à parede: antes {before:+.1f}, depois {after:+.1f} graus")
        print(f"  o giroscópio somou {gyro_total:+.1f} graus em {len(turn_finals)} curvas "
              f"(giro real: {-360.0 + after - before:+.1f})")
        low, high = PLAUSIBLE_GYRO_SCALE
        if new_scale is None or len(turn_finals) != TURNS_PER_LAP or not low <= new_scale <= high:
            print("  !! resultado fora do esperado; não proponho valor. Repita com o robô bem alinhado.")
            return
        lap_error = abs(after - before)
        print(f"\nESCALA MEDIDA: {new_scale:.3f} (em uso: {scale:.3f}). Erro da volta com a escala em uso: "
              f"{lap_error:.1f} graus.")
        self._client.note(f"calib-giro: antes {before:+.1f}, depois {after:+.1f} graus em relação à parede; "
                          f"giroscópio {gyro_total:+.1f}; escala em uso {scale:.3f}, medida {new_scale:.3f}")
        if lap_error < ACCEPTABLE_LAP_ERROR_DEG:
            print("A escala em uso já está boa (erro menor que 1,5 grau na volta): não mude.")
            return
        assignment = f"{GYRO_SCALE_KEY}={new_scale:.3f}"
        if self._operator.defers_answers:
            print(f"PROPOSTA: python t.py calib \"{assignment}\"   (repita o calib-giro depois para conferir)")
            return
        if self._operator.confirm(f"Gravar no robô 'calib {assignment}'?") and self._client.write(assignment):
            print("Gravado. Rode 'python t.py calib-giro' de novo para conferir (erro esperado < 1,5 grau).")
