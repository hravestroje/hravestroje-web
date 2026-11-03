#!/usr/bin/env bash
# Testy na ukázkových datech – nepotřebují žádný secret ani internet.
#   bash testy/spust-testy.sh
# 1) produkty: ukázkový export Shoptetu → produkty.json, kontrola, že obsahuje jen veřejné údaje
# 2) kalendář: místní server s testovací sitemapou → akce.json, kontrola nalezených akcí
set -euo pipefail
KOREN="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'kill "${SERVER:-}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

echo "== 1) Produkty z ukázkového exportu"
python3 "$KOREN/produkty/stahni_produkty.py" --soubor "$KOREN/produkty/ukazka-export.xml" \
  --vystup "$TMP/produkty.json" --min-produktu 5
python3 - "$TMP/produkty.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
povolene = {"nazev", "cena", "puvodni_cena", "url", "obrazek", "kategorie", "skladem", "temata"}
p = data["produkty"]
assert len(p) >= 5, "málo produktů"
for x in p:
    navic = set(x) - povolene
    assert not navic, f"neveřejné klíče v produkty.json: {navic}"
    assert x["url"].startswith("https://") and x["nazev"] and x["cena"] > 0
text = json.dumps(data, ensure_ascii=False)
for tajne in ("312", "Tajny dodavatel", "8590000000101", "HS101"):
    assert tajne not in text, f"v produkty.json je neveřejný údaj: {tajne}"
assert set(data) == {"vygenerovano", "mena", "sezony", "produkty"}, set(data)
print(f"OK: {len(p)} produktů, jen veřejné údaje")
PY

echo "== 1b) Chybějící secret → jasná chyba, žádný soubor"
if SHOPTET_FEED_URL="" python3 "$KOREN/produkty/stahni_produkty.py" --vystup "$TMP/prazdne.json" 2> "$TMP/chyba.txt"; then
  echo "CHYBA: skript měl bez secretu skončit chybou"; exit 1
fi
grep -q "chybí secret SHOPTET_FEED_URL" "$TMP/chyba.txt"
test ! -e "$TMP/prazdne.json"
echo "OK: $(cat "$TMP/chyba.txt")"

echo "== 2) Kalendář z testovací sitemapy"
PORT=$(( 18000 + RANDOM % 1000 ))
mkdir -p "$TMP/web"
cp -r "$KOREN/testy/sitemap-kalendar/." "$TMP/web/"
find "$TMP/web" -name '*.xml' -exec sed -i "s#__ZAKLAD__#http://127.0.0.1:$PORT#g" {} +
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$TMP/web" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/sitemap.xml" >/dev/null 2>&1 && break; sleep 0.1; done

SITEMAP_URL="http://127.0.0.1:$PORT/sitemap.xml" VYSTUP="$TMP/akce.json" \
  node "$KOREN/kalendar/scripts/stahni-akce.mjs" | tee "$TMP/log.txt"
node - "$TMP/akce.json" <<'JS'
const d = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };
ok(d.pocet === 3 && d.akce.length === 3, `čekám 3 akce, je ${d.pocet}`);
const najdi = (s) => d.akce.find((a) => a.nazev.includes(s));
const vlak = najdi('Mikulášská'), traktor = najdi('Traktoriáda'), hasici = najdi('hasičských');
ok(vlak && vlak.kraj === 'Jihomoravský kraj' && vlak.typy.includes('vlaky'), 'Mikulášská jízda: kraj/typ');
ok(vlak.obrazek && vlak.obrazek.startsWith('https://placehold.co/'), 'Mikulášská jízda: obrázek z og:image');
ok(traktor && traktor.kraj === 'Zlínský kraj' && traktor.typy.includes('traktory'), 'Traktoriáda: kraj/typ');
ok(hasici && hasici.zruseno === true && hasici.kraj === 'Hlavní město Praha' && hasici.typy.includes('auta'), 'Hasiči: zrušeno/kraj/typ');
ok(!d.akce.some((a) => a.url.includes('jiny-clanek')), 'článek mimo kalendář se nemá brát');
console.log('OK: 3 akce, kraje a typy sedí');
JS
grep -q "Bez Event JSON-LD: .*kalendar-dopravnich-akci-bez-dat" "$TMP/log.txt"
echo "OK: článek bez JSON-LD je v logu"

echo
echo "Všechny testy prošly."
