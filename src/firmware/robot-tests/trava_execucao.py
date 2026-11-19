"""Trava de execução única (regra 4, K8): cria resultados/travas/<NOME> e RECUSA se já existir.

Uso:  python trava_execucao.py D1_ok_3 && python t.py D1 --auto
O NOME é fixo por 'ok' do operador (nunca calculado do número da tentativa)."""

import sys
from pathlib import Path

if len(sys.argv) != 2:
    sys.exit("uso: python trava_execucao.py NOME_FIXO_POR_OK")
pasta = Path(__file__).resolve().parent / "resultados" / "travas" / sys.argv[1]
try:
    pasta.mkdir(parents=True, exist_ok=False)
except FileExistsError:
    sys.exit(f"RECUSADO: a trava '{sys.argv[1]}' já existe: este 'ok' já foi usado. Não rode de novo.")
print(f"trava criada: {pasta.name}")
