"""Informação do repositório git."""

import subprocess
from pathlib import Path


def short_commit(repo_dir: Path) -> str:
    """Hash curto do HEAD, ou "" se o git não responder."""
    try:
        result = subprocess.run(["git", "-C", str(repo_dir), "rev-parse", "--short", "HEAD"],
                                capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""
