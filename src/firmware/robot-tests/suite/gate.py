"""Portão: checagem rápida antes de cada bloco (ToF respondem e contadores em zero)."""

from .checks.sensors import check_health, check_tof_monitor
from .console import print_checks, print_robot_lines
from .robot_link import RobotLink
from .verdict import Verdict, overall_verdict


def run_gate(link: RobotLink) -> Verdict:
    link.require_bridge()
    link.mark("PORTAO")
    start = link.log_size()
    link.send_and_wait("tofmon 3", r"tofmon fim: ", 15)
    link.send_and_wait("saude", r"saude 2/2: ", 10)
    lines = link.read_from(start)
    checks = check_tof_monitor(lines) + check_health(lines)
    print_robot_lines(lines)
    print("\nPORTÃO:")
    print_checks(checks)
    verdict = overall_verdict(checks)
    print(f"\nPORTÃO: {verdict}")
    if verdict is Verdict.REVIEW:
        print("Pode seguir. Anote o que ficou em CONFERIR.")
    if verdict is Verdict.FAILED:
        print("NÃO siga para o próximo bloco. Um sensor falhou ou há erros acumulados: anote, rode "
              "'python t.py H1' para o relatório completo e avise a equipe.")
        print("Os contadores só voltam a zero com 'python t.py reiniciar'. Depois de reiniciar, rode o portão "
              "de novo: se passar, o defeito é intermitente (anote a hora) e você pode seguir.")
    return verdict
