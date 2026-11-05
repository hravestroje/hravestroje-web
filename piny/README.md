# Generátor pinů pro Pinterest

Statická stránka `piny/index.html`: vytvoří obrázek pinu **1000 × 1500 px** ve stylu webu
(zelená `#1e6f3f`, světle zelená `#e9f4ec`, cihlová `#c0392b`, bílý nadpis na zelené ploše,
ilustrace stojí na spodní linii, dole malé „hravestroje.cz“), stáhne ho jako PNG a navrhne
**titulek** (do 100 znaků) a **popis** pinu (do 500 znaků) s tlačítky Zkopírovat.

Vše běží v prohlížeči (canvas). Žádné cookies, žádné cizí knihovny ani písma, žádná analytika.

## Šablony

| Šablona | Zdroj dat | Na pinu |
|---|---|---|
| Akce z kalendáře | `../kalendar/akce.json` (probíhající a budoucí akce, bez zrušených; hledání a filtr kraje) | štítek, název, datum, místo, kraj |
| Článek / výlet | ruční vyplnění | štítek, nadpis, podnadpis, 3 krátké odrážky |
| Produkt | `../produkty/produkty.json` (jen skladem lze vypnout) | štítek, název, cena, obrázek produktu |

Po výběru akce/produktu se texty předvyplní a dají se libovolně upravit. Dlouhé texty se
zalomí, písmo se podle potřeby zmenší a když ani to nestačí, text se zkrátí trojtečkou –
nic nepřeteče přes okraj ani pod spodní linii.

Místně (bez sestavení webu) `produkty/produkty.json` neexistuje – stránka pak použije
ukázková data z `produkty/demo-data.js` a upozorní na to.

## Ilustrace

Výběr: bez ilustrace, obrázek produktu, položka z `piny/ilustrace.json`, nebo vlastní
obrázek ze souboru (zůstane jen v prohlížeči). Velikost a posun do stran jdou nastavit
posuvníky; svisle se ilustrace neposouvá – vždy stojí na spodní linii. Průhledné okraje
PNG se oříznou, takže kola stojí přesně na lince. Obrázek bez průhlednosti (fotka
produktu) se vykreslí na bílé kartě, která na lince stojí.

`piny/ilustrace.json` je zatím prázdný, návod je přímo v souboru. Stručně:

1. PNG s průhledným pozadím uložte do `piny/ilustrace/` (např. `piny/ilustrace/traktor.png`).
2. Přidejte položku: `{ "soubor": "ilustrace/traktor.png", "nazev": "Traktor", "temata": ["traktory"] }`.
   Témata = typy z kalendáře (`vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni`);
   u akce s takovým typem se ilustrace nabídne sama.

**Obrázky z jiného serveru:** canvas smí stáhnout jen obrázky ze stejného webu nebo ze
serveru, který to povolí hlavičkou CORS. Když obrázek produktu z CDN Shoptetu CORS
nepovolí, náhled se zobrazí, ale tlačítko Stáhnout PNG se zakáže s vysvětlením – stačí
obrázek uložit do počítače a vybrat ho jako „Vlastní obrázek ze souboru…“.

## Testy

```bash
bash piny/testy/spust.sh
```

- `piny/testy/logika.test.cjs` (Node, bez prohlížeče): rozměry a barvy, zalamování
  (dlouhé texty, předložky na konci řádku, obří slova, zkrácení trojtečkou), všechny
  šablony s dlouhými texty a různými ilustracemi zůstanou v ploše, ilustrace stojí na
  linii, výběr akcí ze skutečného `kalendar/akce.json` (probíhající/budoucí, zrušené,
  kraj, hledání), výběr produktů, `ilustrace.json`, české datum, titulek ≤ 100 a popis ≤ 500.
- `piny/testy/prohlizec.cjs` (Chromium přes Playwright; bez Playwrightu se přeskočí):
  vykreslení všech šablon, pixely (zelená plocha, linie, kolo na lince, karta produktu),
  stažení PNG 1000 × 1500, kopírování do schránky, obrázek z cizího serveru bez CORS,
  mobil bez vodorovného posouvání, žádné cookies ani cizí požadavky.
  Volitelný argument = složka pro snímky: `node piny/testy/prohlizec.cjs /cesta/ke/snimkum`.
- Testovací data jsou v `piny/testy/data/`.

## Zveřejnění na GitHub Pages (doplnit do `.github/workflows/web.yml`)

Výsledná adresa: `https://hravestroje.github.io/hravestroje-web/piny/`

1. Do `on: push: paths:` přidat řádek (mezi ostatní cesty):

   ```yaml
         - "piny/**"
   ```

2. Do jobu `test` za řádek `- run: bash testy/spust-testy.sh` přidat:

   ```yaml
         - run: bash piny/testy/spust.sh
   ```

3. Do jobu `sestaveni` těsně před krok `- uses: actions/configure-pages@v5` přidat krok:

   ```yaml
         - name: Piny – generátor pinů na web
           run: |
             mkdir -p _site/piny
             cp piny/index.html piny/styles.css piny/logika.js piny/app.js piny/ilustrace.json _site/piny/
             cp -r piny/ilustrace _site/piny/
             test -s _site/piny/index.html
   ```

   Stránka načítá `../kalendar/akce.json` a `../produkty/produkty.json`, které už web
   zveřejňuje. Testovací data (`piny/testy/`) se nezveřejňují.

Volitelně lze do kořenového `index.html` přidat odkaz
`<li><a href="piny/">Generátor pinů pro Pinterest</a></li>`.
