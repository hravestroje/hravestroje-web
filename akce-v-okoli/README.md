# Akce v okolí – blok do článků na hravestroje.cz

Pod článkem (třeba o výletě nebo o muzeu) ukáže **nejbližší nadcházející dopravní akce do 50 km**
od místa z článku, seřazené podle data. Když je v okolí akcí málo, doplní akce ze **stejného kraje**.
Akce, na jejíž článek se právě díváte, se nikdy neukáže. Když se nenajde nic, blok se vůbec
nezobrazí (na stránce nezůstane prázdné místo).

Každá karta má: datum, název, obec, vzdálenost („cca 25 km“), obrázek článku a odkaz na článek.
Pod kartami je odkaz **„Všechny akce v kalendáři“**. Na počítači jsou karty v mřížce bez
poloprázdné řady (4 karty = 2×2, 3 karty = 3 vedle sebe), na mobilu pod sebou.

Bez cookies, bez cizích knihoven, nic se nikam neposílá – skript jen stáhne dva veřejné soubory
z GitHub Pages.

| Adresa | Co to je |
| --- | --- |
| https://hravestroje.github.io/hravestroje-web/akce-v-okoli/hs-akce-v-okoli.js | skript pro Shoptet |
| https://hravestroje.github.io/hravestroje-web/akce-v-okoli/souradnice.json | souřadnice akcí (vzniká každou noc) |
| https://hravestroje.github.io/hravestroje-web/akce-v-okoli/demo.html | ukázková stránka |
| https://hravestroje.github.io/hravestroje-web/kalendar/akce.json | akce z kalendáře (zdroj) |

---

## 1. Vložení do Shoptetu (jednou pro celý web)

**Vzhled a obsah → Editor → HTML kódy → Zápatí** přidejte (vedle skriptu `hs-darky.js`):

```html
<script src="https://hravestroje.github.io/hravestroje-web/akce-v-okoli/hs-akce-v-okoli.js" defer></script>
```

Uložte. Na stránkách bez bloku skript nic nedělá.

## 2. Vložení do článku

V editoru článku přepněte na **zdrojový kód** (tlačítko `<>`/„Zdroj“) a na místo, kde se mají
akce ukázat (typicky na konec článku), vložte:

```html
<div class="hs-akce-v-okoli" data-lat="50.21" data-lon="16.07" data-kraj="Královéhradecký kraj" data-pocet="4"></div>
```

| Atribut | Povinný | Význam |
| --- | --- | --- |
| `data-lat`, `data-lon` | doporučené | souřadnice místa z článku (zeměpisná šířka a délka, s **desetinnou tečkou**) |
| `data-kraj` | doporučené | kraj místa, přesně jako v kalendáři, např. `Královéhradecký kraj`, `Hlavní město Praha`, `Kraj Vysočina` |
| `data-pocet` | ne | kolik karet ukázat, výchozí 4 (doporučeno 2, 3, 4 nebo 6) |
| `data-okruh` | ne | okruh v km, výchozí 50 |
| `data-nadpis` | ne | jiný nadpis místo „Akce v okolí“ |

- Stačí i jen `data-kraj` (pak se berou akce z kraje), nebo jen souřadnice (pak jen okruh 50 km).
- Bez souřadnic i bez kraje se blok nezobrazí.
- Počet karet se zarovná tak, aby na počítači nezůstala poloprázdná řada (např. 5 → 4).

### Odkud vzít souřadnice místa

1. Otevřete **[mapy.cz](https://mapy.cz)** a najděte místo z článku (muzeum, nádraží, rozhlednu…).
2. Klikněte na místo **pravým tlačítkem** → v okně se ukáže řádek se souřadnicemi, např.
   `50.2100181N, 16.0700000E`. Kliknutím na něj se zkopíruje.
3. Do článku napište jen čísla s tečkou a 2–4 desetinnými místy:
   `data-lat="50.21" data-lon="16.07"`. (N = `data-lat`, E = `data-lon`.)

Funguje i Google Mapy: pravé tlačítko na místo → první řádek jsou souřadnice
(`50.21001, 16.07000` – první číslo je `data-lat`, druhé `data-lon`).
Na přesnosti nezáleží – vzdálenost se ukazuje zaokrouhleně („cca 25 km“).

### Test na živém webu

- `?hs-akce-dnes=2026-12-01` za adresou článku – blok se chová, jako by bylo 1. 12. 2026.
- `?hs-akce=vypnout` – blok se nespustí.

---

## 3. Odkud mají akce souřadnice

Každou noc ve workflow (po stažení akcí do `kalendar/akce.json`) proběhne
`akce-v-okoli/scripts/souradnice.mjs`. Ten u každé akce najde obec v **offline tabulce obcí ČR**
uložené v repozitáři (`akce-v-okoli/data/obce.csv`) a souřadnice obce zapíše do
`akce-v-okoli/souradnice.json`. **Nevolá žádnou cizí službu ani internet.**

- „Praha 6“, „Praha 7 – Holešovice“ → Praha; „Brno-Husovice“ → Brno; „Lužná u Rakovníka“ → Lužná.
- Víc obcí stejného jména se rozliší podle kraje a PSČ z adresy akce.
- Když obec chybí v tabulce (akce v zahraničí, místní část) nebo je nejednoznačná,
  akce souřadnice nedostane a do bloku se dostane **jen podle kraje**. V logu workflow je řádek
  „Bez souřadnic (jen podle kraje): …“.
- Když akce nemá kraj, doplní se z tabulky obcí.
- Z `kalendar/doplnky.json` se převezme ruční oprava kraje a `"obrazek"`
  (`"zastupny"` = místo obrázku článku se ukáže zástupný obrázek s ikonou typu akce,
  adresa `https://…` = vlastní obrázek).

### Ruční souřadnice

Pro akce bez souřadnic (nebo když akce není ve středu obce) doplňte do
`akce-v-okoli/rucni-souradnice.json` (na GitHubu tužka → upravit → **Commit changes**):

```json
"https://www.hravestroje.cz/kalendar-dopravnich-akci/nazev-clanku/": { "lat": 49.1553, "lon": 16.3496 }
```

Klíč je přesná adresa článku akce. Ruční souřadnice mají vždy přednost před tabulkou obcí.

Ručně spustit lze i lokálně: `node akce-v-okoli/scripts/souradnice.mjs`.

### Tabulka obcí

`data/obce.csv` – 6 259 obcí ČR se souřadnicemi, okresem, krajem a PSČ (stav k 1. 1. 2018, data
ČSÚ), převzato z veřejného repozitáře [33bcdd/souradnice-mest](https://github.com/33bcdd/souradnice-mest)
(„volně k použití“). Obce se mění zřídka; při aktualizaci stačí soubor nahradit novější verzí
se stejnými sloupci (`Obec, …, Okres, …, Kraj, …, PSČ, Latitude, Longitude`).

---

## 4. Soubory

| Soubor | K čemu je |
| --- | --- |
| `hs-akce-v-okoli.js` | skript pro Shoptet (výběr akcí, vykreslení karet, styly) |
| `scripts/souradnice.mjs` | doplní souřadnice akcí podle obce (Node.js, bez balíčků, bez internetu) |
| `data/obce.csv` | offline tabulka obcí ČR |
| `rucni-souradnice.json` | ruční souřadnice pro jednotlivé články |
| `souradnice.json` | výsledek – souřadnice, kraj a obrázek podle adresy článku |
| `demo.html` | ukázková stránka (lze měnit místo: `?lat=50.08&lon=14.44&kraj=Hlavní město Praha&pocet=3`) |
| `../testy/akce-v-okoli.test.cjs` | testy (vzdálenost, řazení, doplnění z kraje, vynechání článku, zástupný obrázek…) |

Testy: `bash testy/spust-testy.sh` (všechny) nebo `node testy/akce-v-okoli.test.cjs`.
