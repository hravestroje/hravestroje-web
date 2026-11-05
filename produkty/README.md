# Produkty z e-shopu v článcích

| Soubor | K čemu je |
| --- | --- |
| `hs-darky.js` | skript pro Shoptet: v článcích vykreslí dlaždice aktuálních produktů skladem |
| `stahni_produkty.py` | z XML exportu Shoptetu vytvoří `produkty.json` (jen standardní Python) |
| `pravidla.json` | témata (vlaky, traktory, …) a sezóny |
| `nahledy.json` | **ruční výběr obrázků** – hlavní obrázek a náhled obsahu (viz níže) |
| `demo.html`, `demo-data.js` | testovací stránka s ukázkovými daty |
| `testy/` | testy generátoru a dlaždic v prohlížeči |

Vložení do Shoptetu a atributy boxu (`data-tema`, `data-pocet`, …) popisuje hlavní `README.md` v kořeni repozitáře.

## Jak dlaždice vypadají

- Obrázek přes celou šířku karty v poměru **4:3** (ořízne se na střed, `object-fit: cover`).
  Pod ním název, cena a zelené tlačítko **Prohlédnout**.
- Na PC nejvýš **3 karty vedle sebe** a poslední řada je vždy plná: 4 produkty = 2×2,
  6 = 3×2, 8 = 2×4 (5 se zkrátí na 4, 7 na 6). Na mobilu (do 640 px) jsou karty pod sebou.
  Výchozí počet karet je 6 (změníte atributem `data-pocet`).
- Má-li produkt víc obrázků, ukáže se **náhled obsahu**:
  - na PC po najetí myší se plynule přepne na 2. obrázek,
  - na mobilu jde obrázky listovat prstem, šipkami ‹ › a tečky ukazují, kde jste (nejvýš 5 obrázků).
- Štítek **„Ukázka obsahu uvnitř“** mají produkty, u kterých je v `nahledy.json` nastavený `nahled`.
- Obrázky se načítají líně (`loading="lazy"`) a mají pevné rozměry, takže stránka při načítání neposkakuje.
- Text tlačítka, štítku a počet obrázků na mobilu jsou v bloku `NASTAVENÍ` v `hs-darky.js`.

## Obrázky z exportu

`stahni_produkty.py` ukládá do `produkty.json` všechny obrázky produktu v pořadí z e-shopu
(`IMAGES/IMAGE`, u starších exportů `IMGURL` + `IMGURL_ALTERNATIVE`) do pole `obrazky`;
první je obálka. Pole `obrazek` (jen obálka) zůstává kvůli starším verzím skriptu.
Produkt bez vlastních obrázků vezme obrázky svých viditelných variant.

## Ruční náhled – `nahledy.json`

Hodí se hlavně u omalovánek, pracovních listů, knížek a her: jako druhý obrázek ukážete
stránku zevnitř, a ne jen zadní stranu obalu.

### Jak to vyplnit na GitHubu

1. Otevřete soubor **`produkty/nahledy.json`** a vpravo nahoře klikněte na **tužku** (Edit this file).
2. Do bloku `"produkty"` přidejte řádek pro každý produkt:

   ```json
   {
     "_napoveda": "…",
     "produkty": {
       "HS105": { "nahled": 3 },
       "https://www.hravestroje.cz/pexeso-masinky/": { "hlavni": 2, "nahled": 4 },
       "HS210": { "nahled": "https://cdn.myshoptet.com/…/ukazka-stranky.jpg" }
     }
   }
   ```

   - **Klíč** je **kód produktu** ze Shoptetu (Produkty → detail → Kód, velikost písmen nevadí)
     **nebo adresa produktu** (stačí i bez domény: `/pexeso-masinky/`).
   - `"hlavni"` – který obrázek bude na dlaždici. Nepovinné, výchozí je 1. obrázek z e-shopu.
   - `"nahled"` – druhý obrázek (ukázka obsahu). Zobrazí se po najetí myší / při listování
     a k dlaždici přibude štítek „Ukázka obsahu uvnitř“.
   - Hodnota je **pořadí obrázku v galerii produktu v e-shopu** (1 = první, 2 = druhý, …)
     **nebo celá adresa obrázku** `https://…`.
   - `"stitek": false` – náhled se použije, ale bez štítku (např. jen jiný úhel hračky).
3. Pozor na **čárky**: mezi řádky čárka je, za posledním řádkem v bloku ne. Klíče a adresy jsou v uvozovkách.
4. Dole klikněte na **Commit changes…** → uložit do větve `main`. Workflow se spustí samo
   a za pár minut je na webu nový `produkty.json`.

Řádky s klíčem začínajícím podtržítkem (`"_priklad…"`) se ignorují – slouží jako vzor.

### Když se něco nepovede

- V logu workflow (Actions → Zveřejnění webu → krok „Produkty“) se vypíše **UPOZORNĚNÍ**, když
  produkt s daným kódem/adresou v exportu není, když číslo obrázku je větší než počet obrázků
  produktu, nebo když soubor nejde přečíst (chybí čárka, uvozovka…).
- Chyba v `nahledy.json` **nikdy nezastaví** zveřejnění produktů – ruční náhledy se jen nepoužijí.
- Kontrola správnosti JSON: obsah souboru vložte např. do https://jsonlint.com.

## Testy

```bash
bash produkty/testy/spust.sh
```

- `testy/test_stahni_produkty.py` – víc obrázků, jeden obrázek, bez obrázku, Heureka formát,
  ruční náhled podle kódu i adresy, vlastní adresa obrázku, chybné hodnoty, rozbitý JSON.
- `testy/dlazdice-prohlizec.cjs` – Chromium (Playwright) na PC i mobilu: mřížka 2×2 a 3×2 bez
  poloprázdné řady, poměr 4:3 a `cover`, přepnutí obrázku po najetí myší, tečky a šipky na mobilu,
  štítek, líné načítání. Bez Playwrightu se přeskočí. Se složkou jako parametrem uloží snímky:
  `node produkty/testy/dlazdice-prohlizec.cjs /tmp/snimky`.

Ukázková data pro `demo.html` se přegenerují takto:

```bash
python3 produkty/stahni_produkty.py --soubor produkty/ukazka-export.xml --vystup /tmp/produkty.json \
  --nahledy produkty/testy/nahledy-ukazka.json --js produkty/demo-data.js
```
