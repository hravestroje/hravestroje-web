#!/usr/bin/env bash
# Testy na ukázkových datech – nepotřebují žádný secret ani internet.
#   bash testy/spust-testy.sh
# 1) produkty: ukázkový marketingový export Shoptetu → produkty.json (varianty, starší názvy značek,
#    chyba při prázdném exportu), kontrola, že obsahuje jen veřejné údaje
# 2) kalendář: místní server s testovací sitemapou → akce.json, kontrola nalezených akcí
# 3) kalendář – logika stránky (řazení, filtry dat, typy, obrázky, monetizace, .ics): testy/kalendar-logika.test.cjs
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
find "$TMP/web" \( -name '*.xml' -o -name '*.json' \) -exec sed -i "s#__ZAKLAD__#http://127.0.0.1:$PORT#g" {} +
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$TMP/web" >/dev/null 2>&1 &
SERVER=$!
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PORT/sitemap.xml" >/dev/null 2>&1 && break; sleep 0.1; done

SITEMAP_URL="http://127.0.0.1:$PORT/sitemap.xml" VYSTUP="$TMP/akce.json" DOPLNKY="$TMP/web/doplnky-test.json" \
  node "$KOREN/kalendar/scripts/stahni-akce.mjs" | tee "$TMP/log.txt"
node - "$TMP/akce.json" <<'JS'
const d = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };
ok(d.pocet === 6 && d.akce.length === 6, `čekám 6 akcí, je ${d.pocet}`);
const najdi = (s) => d.akce.find((a) => a.nazev.includes(s));
const vlak = najdi('Mikulášská'), traktor = najdi('Traktoriáda'), hasici = najdi('hasičských');
const parnik = najdi('parníkem'), letecky = najdi('Letecký den'), pivovar = najdi('pivovaru');
ok(vlak && vlak.kraj === 'Jihomoravský kraj' && vlak.typy.join() === 'vlaky', 'Mikulášská jízda: kraj/typ');
ok(vlak.obrazek === null, 'Mikulášská jízda: doplnky "obrazek": "zastupny" (klíč bez lomítka) skryje obrázek');
ok(traktor && traktor.kraj === 'Zlínský kraj', 'Traktoriáda: kraj');
ok(traktor.typy.join() === 'traktory,auta', 'Traktoriáda: typy z doplnky.json, neznámý typ vynechán: ' + traktor.typy);
ok(traktor.obrazek === 'https://placehold.co/800x450/png?text=Traktori%C3%A1da', 'Traktoriáda: bez og:image → obrázek z JSON-LD: ' + traktor.obrazek);
ok(hasici.obrazek === null, 'Hasiči: bez og:image i bez JSON-LD obrázku → žádný obrázek');
ok(hasici && hasici.zruseno === true && hasici.kraj === 'Hlavní město Praha' && hasici.typy.includes('auta'), 'Hasiči: zrušeno/kraj/typ');
ok(parnik && parnik.typy.join() === 'lode', 'Parník: typ lode (ne vlaky kvůli „parní“): ' + parnik.typy);
ok(parnik.zacatek === '2027-07-03' && parnik.konec === '2027-07-05', 'Parník: vícedenní bez času');
ok(parnik.obrazek === 'https://placehold.co/800x450/png?text=Aktualni%20grafika', 'Parník: og:image má přednost před obrázkem z JSON-LD: ' + parnik.obrazek);
ok(letecky.obrazek === parnik.obrazek, 'Letecký den: og:image článku');
ok(letecky && letecky.typy.join() === 'letadla' && letecky.kraj === 'Královéhradecký kraj', 'Letecký den: typ letadla: ' + letecky.typy);
ok(pivovar && pivovar.typy.join() === 'ostatni', 'Pivovar: typ ostatni: ' + pivovar.typy);
ok(!d.akce.some((a) => a.url.includes('jiny-clanek')), 'článek mimo kalendář se nemá brát');
console.log('OK: 6 akcí, kraje, typy (i lodě, letadla, ostatní) a doplnky.json sedí');
JS
grep -q "Bez Event JSON-LD: .*kalendar-dopravnich-akci-bez-dat" "$TMP/log.txt"
echo "OK: článek bez JSON-LD je v logu"
grep -q "Neznámý typ v doplnky.json.*nesmysl" "$TMP/log.txt"
echo "OK: neznámý typ v doplnky.json je v logu"

echo "== 2a) Obrázek akce: og:image přednostně, JSON-LD jen jako záloha"
node --input-type=module - "$KOREN/kalendar/scripts/stahni-akce.mjs" <<'JS'
const { ogImage, obrazekAkce, pouzijDoplnek } = await import(process.argv[2]);
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };
const clanek = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/test/';
const ev = { image: { '@type': 'ImageObject', url: 'https://cdn.example/stary-jsonld.jpg' } };
const og = (atributy) => `<html><head><meta charset="utf-8"><meta ${atributy}></head></html>`;
const pripady = [
  [og('property="og:image" content="https://cdn.example/novy-og.jpg"'), 'https://cdn.example/novy-og.jpg', 'og:image má přednost'],
  [og('content="https://cdn.example/novy-og.jpg" property="og:image"'), 'https://cdn.example/novy-og.jpg', 'obrácené pořadí atributů'],
  [og("name='og:image' content='/user/obr.jpg?a=1&amp;b=2'"), 'https://www.hravestroje.cz/user/obr.jpg?a=1&b=2', 'name=, relativní adresa, entity'],
  [og('property="og:image:width" content="1200"'), 'https://cdn.example/stary-jsonld.jpg', 'og:image:width není og:image → JSON-LD'],
  [og('property="og:image" content=""'), 'https://cdn.example/stary-jsonld.jpg', 'prázdný og:image → JSON-LD'],
  ['<html><head></head></html>', 'https://cdn.example/stary-jsonld.jpg', 'bez og:image → JSON-LD'],
];
for (const [html, cekam, popis] of pripady) {
  const v = obrazekAkce(ev, html, clanek);
  ok(v === cekam, `${popis}: čekám ${cekam}, je ${v}`);
}
ok(obrazekAkce({}, '<html></html>', clanek) === null, 'bez og:image i JSON-LD → null');
ok(ogImage(og('property="og:image" content="https://a/b.jpg"')) === 'https://a/b.jpg', 'ogImage');
const a = { url: clanek, obrazek: 'https://cdn.example/novy-og.jpg' };
ok(pouzijDoplnek(a, { obrazek: 'https://cdn.example/rucni.jpg' }).obrazek === 'https://cdn.example/rucni.jpg', 'doplnky.json: vlastní obrázek má přednost i před og:image');
ok(pouzijDoplnek(a, { obrazek: 'zastupny' }).obrazek === null, 'doplnky.json: zastupny');
console.log(`OK: ${pripady.length + 4} případů výběru obrázku (og:image → JSON-LD → doplnky.json)`);
JS

echo "== 2b) Typy podle klíčových slov"
node --input-type=module - "$KOREN/kalendar/scripts/stahni-akce.mjs" <<'JS'
const { urciTypy } = await import(process.argv[2]);
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };
const pripady = [
  ['Výlet lodí po Labi', 'lode'], ['Lodní linka T91', 'lode'], ['Plavba po Vltavě', 'lode'],
  ['Parník Vyšehrad', 'lode'], ['Den v přístavu', 'lode'],
  ['Letadlo nad městem', 'letadla'], ['Den otevřených dveří na letišti', 'letadla'], ['Letecký den Pardubice', 'letadla'],
  ['Letecká show', 'letadla'], ['Aviatická pouť', 'letadla'], ['Vyhlídkový let vrtulníkem', 'letadla'],
  ['Parní vlak do Lužné', 'vlaky'], ['Jízda po Švestkové dráze', 'vlaky'], ['Výstava modelového kolejiště', 'vlaky'],
  ['Rozloučení s motoráčkem', 'vlaky'], ['Závody traktorů na trati', 'traktory'], ['Traktoriáda', 'traktory'], ['Sraz veteránů', 'auta'],
  ['Dýňový festival', 'ostatni'],
];
for (const [text, typ] of pripady) {
  const t = urciTypy(text);
  ok(t.join() === typ, `„${text}“ → čekám ${typ}, je ${t}`);
}
console.log(`OK: ${pripady.length} případů klíčových slov (lodě, letadla, ostatní)`);
JS

echo "== 3) Kalendář – logika stránky"
TZ=Europe/Prague node "$KOREN/testy/kalendar-logika.test.cjs"

echo "== 3) Akce v okolí (výběr akcí, souřadnice obcí)"
node "$KOREN/testy/akce-v-okoli.test.cjs"
VYSTUP="$TMP/souradnice.json" node "$KOREN/akce-v-okoli/scripts/souradnice.mjs" >/dev/null
test -s "$TMP/souradnice.json"
echo "OK: souradnice.mjs nad kalendar/akce.json proběhl"

echo "== 3) Tipy na výlet (nabidky/)"
node "$KOREN/nabidky/zkontroluj-nabidky.mjs"
node "$KOREN/testy/nabidky-test.js"
node "$KOREN/testy/nabidky-prohlizec.js"

echo
echo "Všechny testy prošly."
