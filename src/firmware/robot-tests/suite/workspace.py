"""Pastas e arquivos compartilhados entre a ponte (ponte.py) e o roteiro (t.py)."""

from dataclasses import dataclass
from pathlib import Path

ROBOT_TESTS_DIR = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Workspace:
    root: Path = ROBOT_TESTS_DIR

    @property
    def results(self) -> Path:
        return self.root / "resultados"

    @property
    def robot_log(self) -> Path:
        return self.results / "log_robo.txt"

    @property
    def commands(self) -> Path:
        return self.results / "comandos.txt"

    @property
    def bridge_state(self) -> Path:
        return self.results / "estado.txt"

    @property
    def bridge_output(self) -> Path:
        return self.results / "ponte.out"

    @property
    def telemetry(self) -> Path:
        return self.results / "telemetria.jsonl"

    @property
    def report(self) -> Path:
        return self.results / "RESULTADOS.md"

    @property
    def history(self) -> Path:
        return self.results / "feitos.json"

    @property
    def races_csv(self) -> Path:
        return self.results / "corridas.csv"

    @property
    def firmware_dir(self) -> Path:
        return self.root.parent

    @property
    def run_logs(self) -> Path:
        """Logs de cada execução, separados por categoria: testes/, corridas/ e calibracao/."""
        return self.results / "logs"

    def test_log(self, ident: str, attempt: int) -> Path:
        """logs/testes/<teste>/<teste>_t<N>.log: uma pasta por teste, com todas as tentativas."""
        return self.run_logs / "testes" / ident / f"{ident}_t{attempt}.log"

    def race_log(self, label: str, attempt: int) -> Path:
        """logs/corridas/<rotulo>/<rotulo>_t<N>.log: uma pasta por rótulo de corrida."""
        return self.run_logs / "corridas" / label / f"{label}_t{attempt}.log"

    def gyro_calibration_log(self, stamp: str) -> Path:
        return self.run_logs / "calibracao" / f"calib-giro_{stamp}.log"

    def relative_to_results(self, path: Path) -> str:
        return path.relative_to(self.results).as_posix()

    def save_log(self, path: Path, lines: list[str]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    def ensure_results_dir(self) -> None:
        self.results.mkdir(exist_ok=True)
