# Mapa dopravních akcí

Mapa ČR s body **nadcházejících akcí** z kalendáře (i těch, které právě probíhají). Funguje jako
samostatná stránka i jako blok vložený do stránky na Shoptetu.

| Adresa | Co to je |
| --- | --- |
| https://hravestroje.github.io/hravestroje-web/mapa/ | samostatná stránka s mapou |
| https://hravestroje.github.io/hravestroje-web/mapa/hs-mapa.js | skript pro vložení do Shoptetu |
| https://hravestroje.github.io/hravestroje-web/kalendar/akce.json | akce (zdroj, vzniká každou noc) |
| https://hravestroje.github.io/hravestroje-web/akce-v-okoli/souradnice.json | souřadnice akcí (zdroj, vzniká každou noc) |

## Co mapa umí

- **Body akcí** se špendlíkem ve značkové zelené a bílou ikonou typu (vlak, traktor, auto, loď,
  letadlo, vlaječka = ostatní).
- **Akce na stejném místě jsou jeden bod**: červené kolečko na špendlíku ukazuje počet akcí.
  Po kliknutí se otevře **karta** se všemi akcemi z místa: datum, název a odkaz „Detail akce“ na článek.
- **Filtry**: typ (Vše, Vlaky, Traktory, Auta, Lodě, Letadla, Ostatní), kraj a „kdy“
  (Tento víkend, Tento měsíc, Vše). Víkend se počítá stejně jako v kalendáři: v pracovní den
  nadcházející sobota a neděle, o víkendu ten aktuální. Vícedenní akce se ukáže, když do období zasahuje.
- **Moje poloha**: prohlížeč se zeptá na povolení polohy, pak se ukáže modrá tečka a seznam akcí
  pod mapou se seřadí **podle vzdálenosti** (vzdušnou čarou, „cca 25 km“). Poloha zůstane jen
  v prohlížeči – nikam se neposílá, neukládá se ani nedává do adresy stránky.
- Pod mapou je **seznam akcí** (po 12, tlačítko „Další akce“), u každé tlačítko „Na mapě“,
  a odkaz „Všechny akce v kalendáři“.
- **Na mobilu je mapa přes celou šířku obrazovky** (i když je v článku s okraji), filtry typu
  se posouvají do strany.
- Kolečko myši stránku posouvá dál; mapu přiblížíte tlačítky +/− nebo kolečkem po kliknutí do mapy.

Akce bez souřadnic (obec se nenašla v tabulce obcí) na mapě nejsou; pod mapou je věta, kolik jich je.
Souřadnice se doplňují ručně stejně jako pro blok Akce v okolí – viz
[akce-v-okoli/README.md, Ruční souřadnice](../akce-v-okoli/README.md#ruční-souřadnice).
Zrušené akce se na mapu nedávají.

## Soukromí, cookies, mapové podklady

- **Bez cookies** a bez měřicích skriptů. Data se stahují s `credentials: 'omit'`, nic se neukládá
  do prohlížeče.
- Knihovna **Leaflet 1.9.4** se načítá z **cdnjs** v pevné verzi s kontrolním součtem (`integrity`) –
  když by soubor na CDN někdo změnil, prohlížeč ho nespustí.
- Mapové dlaždice jsou z **OpenStreetMap** (`tile.openstreetmap.org`) s povinnou atribucí
  „© přispěvatelé OpenStreetMap“ (odkaz na licenci) vpravo dole v mapě. Dlaždice cookies nenastavují.
  Prohlížeč při stahování dlaždic pošle OpenStreetMap obvyklé údaje (IP adresa, adresa webu bez cesty) –
  stejně jako u každého obrázku z cizího serveru. Pravidla používání:
  https://operations.osmfoundation.org/policies/tiles/ (pro běžnou návštěvnost webu v pořádku;
  při velkém provozu je potřeba přejít na jiného poskytovatele dlaždic – mění se jen `dlazdice`
  a `atribuce` v bloku `NASTAVENÍ` v `hs-mapa.js`).
- Když se Leaflet nenačte (výpadek CDN), místo mapy je hláška a **seznam akcí funguje dál**.
  Když se nenačtou data, je odkaz do kalendáře.

## Vložení do Shoptetu

Do stránky (např. **Vzhled a obsah → Stránky → nová stránka „Mapa akcí“**) přepněte editor na
**zdrojový kód** a vložte:

```html
<div id="hs-mapa"></div>
<script src="https://hravestroje.github.io/hravestroje-web/mapa/hs-mapa.js" defer></script>
```

Skript si sám načte Leaflet, styly i data. Na stránce může být jen jedna mapa (`id="hs-mapa"`).
Kdyby editor Shoptetu `<script>` ze stránky mazal, dejte řádek se skriptem do
**Vzhled a obsah → Editor → HTML kódy → Zápatí** (na stránkách bez `#hs-mapa` nic nedělá).

Nepovinné atributy na `<div id="hs-mapa">`:

| Atribut | Význam |
| --- | --- |
| `data-typ="vlaky"` | výchozí typ (`vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni`) |
| `data-kraj="Zlínský kraj"` | výchozí kraj (přesně jako v kalendáři) |
| `data-kdy="vikend"` | výchozí období: `vikend`, `mesic`, `vse` (výchozí) |
| `data-adresa="ano"` | filtry se zapisují do adresy stránky (`?typ=lode&kraj=…&kdy=mesic`), takže jde poslat odkaz; zapnuté na samostatné stránce |
| `data-kalendar="https://…"` | jiný odkaz „Všechny akce v kalendáři“ |

Filtry jdou nastavit i adresou: `…/mapa/?typ=vlaky&kraj=Jihomoravský kraj&kdy=vikend`.

### Zkoušení na živém webu

- `?hs-mapa-dnes=2026-12-01` – mapa se chová, jako by byl 1. 12. 2026.
- `?hs-mapa=vypnout` – skript se nespustí.

## Soubory

| Soubor | K čemu je |
| --- | --- |
| `index.html` | samostatná stránka (hlavička, `<div id="hs-mapa" data-adresa="ano">`) |
| `hs-mapa.js` | celá mapa: výběr a sloučení akcí, filtry, vzdálenost, vykreslení, styly. Nastavení je v bloku `NASTAVENÍ` nahoře. |
| `../testy/mapa.test.cjs` | testy logiky (bez prohlížeče) |
| `../testy/mapa-prohlizec.js` | test v Chromiu na PC i mobilu (body, karta, filtry, poloha, atribuce, bez cookies, vložení do článku, výpadek CDN) |
| `../testy/mapa-data.cjs` | ukázková data pro oba testy |

Styly jsou jen uvnitř `#hs-mapa` (třídy `hsm-…`), aby se nepraly se šablonou Shoptetu.

## Testy

```bash
bash testy/spust-testy.sh
```

nebo jen mapa:

```bash
node testy/mapa.test.cjs
```

```bash
node testy/mapa-prohlizec.js složka-pro-snímky
```

Test v prohlížeči potřebuje Playwright s Chromiem; v GitHub Actions se přeskočí. Mapové dlaždice
v testu nahrazuje jednobarevný obrázek (testy OpenStreetMap nezatěžují). Bez přístupu na cdnjs
lze Leaflet podstrčit z balíčku npm: `npm pack leaflet@1.9.4`, rozbalit a spustit test s
`LEAFLET_DIR=…/package/dist` – kontrolní součet `integrity` se ověří i tak.

### Změna verze Leafletu

V `hs-mapa.js` změňte verzi v `leafletJs` i `leafletCss` a přepočítejte oba součty:

```bash
curl -s https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js | openssl dgst -sha384 -binary | base64
```

(výsledek zapište jako `sha384-…`, totéž pro `leaflet.css`).

Místní náhled: `python3 -m http.server 8000` v kořeni repozitáře a otevřít `http://localhost:8000/mapa/`.
