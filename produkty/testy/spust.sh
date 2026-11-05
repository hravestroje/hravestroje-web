#!/usr/bin/env bash
# Testy dlaždic produktů (obrázky, ruční náhledy, vzhled v prohlížeči).
#   bash produkty/testy/spust.sh
set -euo pipefail
ADRESAR="$(cd "$(dirname "$0")" && pwd)"
echo "== Produkty: obrázky a nahledy.json"
python3 "$ADRESAR/test_stahni_produkty.py"
echo "== Produkty: dlaždice v prohlížeči (PC + mobil)"
node "$ADRESAR/dlazdice-prohlizec.cjs" "$@"
