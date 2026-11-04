#!/usr/bin/env bash
# Testy na ukázkových datech – nepotřebují žádný secret ani internet.
#   bash testy/spust-testy.sh
# 1) produkty: ukázkový marketingový export Shoptetu → produkty.json (varianty, starší názvy značek,
#    chyba při prázdném exportu), kontrola, že obsahuje jen veřejné údaje
# 2) kalendář: místní server s testovací sitemapou → akce.json, kontrola nalezených akcí
# 3) nabídky: kontrola nabidky.json, výběr podle kraje/typu, prošlé, mřížka (+ Chromium, je-li Playwright)
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
for tajne in ("HS121", "211.00", "Velikost", "Barva", "IMAGE_REF", "AVAILABILITY"):
    assert tajne not in text, f"v produkty.json je údaj z variant: {tajne}"
assert set(data) == {"vygenerovano", "mena", "sezony", "produkty"}, set(data)
assert data["mena"] == "CZK", data["mena"]
podle_url = {x["url"].rstrip("/").rsplit("-", 1)[-1]: x for x in p}
assert "118" not in podle_url, "skrytý produkt (VISIBILITY hidden) se nemá brát"
assert podle_url["101"]["cena"] == 549 and podle_url["101"]["skladem"] is True, podle_url["101"]
assert podle_url["101"]["url"] == "https://www.hravestroje.cz/produkt-101/", "odkaz z ORIG_URL"
assert "puvodni_cena" not in podle_url["101"], "prázdná ACTION_PRICE nesmí vytvořit slevu"
assert podle_url["103"]["skladem"] is False, "AMOUNT 0 = není skladem"
assert podle_url["110"]["cena"] == 499 and podle_url["110"]["puvodni_cena"] == 599, "akční cena"
assert podle_url["120"]["skladem"] is True, "PDF produkt (AMOUNT 5000) je skladem"
print(f"OK: {len(p)} produktů, jen veřejné údaje, ORIG_URL/PRICE/ACTION_PRICE sedí")
PY

echo "== 1a) Varianty (VARIANTS/VARIANT): sklad a cena „od“"
python3 - "$TMP/produkty.json" <<'PY'
import json, sys
p = {x["url"].rstrip("/").rsplit("-", 1)[-1]: x for x in json.load(open(sys.argv[1], encoding="utf-8"))["produkty"]}
# Tričko: nejlevnější viditelná varianta (499) je vyprodaná, skrytá (399) se nepočítá → od 549 Kč
assert p["121"]["skladem"] is True and p["121"]["cena"] == 549, p["121"]
assert p["121"]["obrazek"] and "Tri%C4%8Dko" in p["121"]["obrazek"], "obrázek z IMAGE_REF varianty"
# Kreativní sada: skladem je jen dražší varianta → cena 649
assert p["119"]["skladem"] is True and p["119"]["cena"] == 649, p["119"]
# Mikina: skladem je jen skrytá varianta (VISIBLE 0) → není skladem
assert p["122"]["skladem"] is False and p["122"]["cena"] == 790, p["122"]
print("OK: varianty – skladem, cena od nejlevnější skladové varianty, skryté varianty ignorovány")
PY

echo "== 1b) Starší názvy značek (URL, PRICE_VAT) dál fungují"
cat > "$TMP/stary.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<SHOP>
  <SHOPITEM id="1"><NAME>Starý vláček</NAME><VISIBILITY>visible</VISIBILITY>
    <URL>https://www.hravestroje.cz/stary-1/</URL><CURRENCY>CZK</CURRENCY>
    <PRICE>200.00</PRICE><PRICE_VAT>242.00</PRICE_VAT><STOCK><AMOUNT>1</AMOUNT></STOCK></SHOPITEM>
</SHOP>
XML
python3 "$KOREN/produkty/stahni_produkty.py" --soubor "$TMP/stary.xml" --vystup "$TMP/stary.json" >/dev/null
python3 - "$TMP/stary.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1], encoding="utf-8"))["produkty"]
assert len(p) == 1 and p[0]["url"].endswith("/stary-1/") and p[0]["cena"] == 242, p
print("OK: URL a PRICE_VAT (cena s DPH má přednost)")
PY

echo "== 1c) Export bez použitelných produktů → česká chyba, žádný soubor"
printf '<SHOP><SHOPITEM id="1"><NAME>Bez odkazu</NAME><PRICE>10</PRICE></SHOPITEM></SHOP>' > "$TMP/spatny.xml"
if python3 "$KOREN/produkty/stahni_produkty.py" --soubor "$TMP/spatny.xml" --vystup "$TMP/spatny.json" 2> "$TMP/chyba0.txt"; then
  echo "CHYBA: skript měl skončit chybou"; exit 1
fi
grep -q "použitelných produktů" "$TMP/chyba0.txt"
grep -q "Nic se nezveřejnilo" "$TMP/chyba0.txt"
test ! -e "$TMP/spatny.json"
echo "OK: $(cat "$TMP/chyba0.txt")"

echo "== 1d) Chybějící secret → jasná chyba, žádný soubor"
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

echo "== 3) Tipy na výlet (nabidky/)"
node "$KOREN/nabidky/zkontroluj-nabidky.mjs"
node "$KOREN/testy/nabidky-test.js"
node "$KOREN/testy/nabidky-prohlizec.js"

echo
echo "Všechny testy prošly."
