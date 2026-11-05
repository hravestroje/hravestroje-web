#!/usr/bin/env bash
# Testy generátoru pinů – bez internetu a bez secretů.
#   bash piny/testy/spust.sh [složka-pro-snímky]
# 1) logika (Node): rozměry 1000×1500, zalamování dlouhých textů, výběr akcí/produktů/ilustrací, titulek a popis
# 2) prohlížeč (Chromium přes Playwright, je-li nainstalovaný): vykreslení, stažení PNG, kopírování, CORS, mobil
set -euo pipefail
KOREN="$(cd "$(dirname "$0")/../.." && pwd)"
echo "== Piny – logika"
node --test "$KOREN/piny/testy/logika.test.cjs"
echo "== Piny – náhled v prohlížeči"
node "$KOREN/piny/testy/prohlizec.cjs" "${1:-}"
echo "Testy generátoru pinů prošly."
