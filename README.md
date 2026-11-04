# hravestroje-web

Veřejný repozitář s veřejnými soubory pro web [hravestroje.cz](https://www.hravestroje.cz/).
Každou noc se tu samo stáhnou aktuální data a zveřejní se přes **GitHub Pages**:

| Co | Adresa |
| --- | --- |
| Kalendář dopravních akcí (PWA, lze přidat na plochu) | https://hravestroje.github.io/hravestroje-web/kalendar/ |
| Produkty z e-shopu pro články – data | https://hravestroje.github.io/hravestroje-web/produkty/produkty.json |
| Produkty z e-shopu pro články – skript | https://hravestroje.github.io/hravestroje-web/produkty/hs-darky.js |
| Testovací stránka produktů | https://hravestroje.github.io/hravestroje-web/produkty/demo.html |

V repozitáři **není nic tajného**. Adresa exportu ze Shoptetu je jen v GitHub secretu
`SHOPTET_FEED_URL` – secrety zůstávají skryté i ve veřejném repozitáři a nikde se nevypisují.
Nepotřebujete žádný osobní token, workflow si vystačí s automatickým `GITHUB_TOKEN`.

## Co je kde

| Složka / soubor | K čemu je |
| --- | --- |
| `kalendar/` | stránka kalendáře (`index.html`, `app.js`, `styles.css`), data `akce.json`, PWA (`manifest.webmanifest`, `sw.js`, `icons/`) |
| `kalendar/scripts/stahni-akce.mjs` | stáhne akce ze sitemapy hravestroje.cz (Node.js, bez balíčků) |
| `kalendar/doplnky.json` | ruční opravy kraje nebo typu akce u jednotlivých článků |
| `produkty/hs-darky.js` | skript pro Shoptet: v článcích vykreslí aktuální produkty skladem |
| `produkty/stahni_produkty.py` | z XML exportu Shoptetu vytvoří `produkty.json` (jen standardní Python) |
| `produkty/pravidla.json` | **témata a sezóny** produktů (vlaky, traktory, auta, Vánoce…) |
| `produkty/demo.html` + `demo-data.js` | testovací stránka s ukázkovými daty |
| `produkty/ukazka-export.xml` | ukázkový marketingový export Shoptetu (smyšlené produkty, i s variantami) |
| `testy/` | testy na ukázkových datech + testovací sitemapa kalendáře |
| `.github/workflows/web.yml` | noční workflow: stažení dat → zveřejnění na GitHub Pages |

`produkty.json` se v repozitáři neukládá, vzniká každou noc a jde rovnou na GitHub Pages.
Obsahuje **jen veřejné údaje**: název, cenu (případně původní přeškrtnutou cenu), adresu produktu,
obrázek, kategorie, skladem ano/ne a téma. Nákupní ceny, počty kusů, kódy, EAN, dodavatelé
ani nic dalšího z exportu se nezveřejňuje – skript propouští jen výslovně povolené údaje
a test to hlídá.

---

## 1. Co udělat ručně (jednou)

### 1.1 Secret `SHOPTET_FEED_URL`
1. V administraci Shoptetu zkopírujte adresu **marketingového XML exportu produktů**
   (`productsMarketing.xml`, i s tajným klíčem/hashem). Export musí obsahovat aspoň název,
   odkaz (`ORIG_URL`), obrázky, kategorie, cenu s DPH (`PRICE`), sklad (`STOCK/AMOUNT`),
   viditelnost a varianty. Skript umí i starší názvy značek (`URL`, `PRICE_VAT`).
   U produktů s variantami platí: skladem = aspoň jedna viditelná varianta má počet > 0,
   cena = nejnižší cena skladové varianty (na webu „od 549 Kč“).
2. Tento repozitář → **Settings → Secrets and variables → Actions → New repository secret**.
3. *Name*: `SHOPTET_FEED_URL`, *Secret*: adresa exportu → **Add secret**.

Adresu nikam jinam nevkládejte (do kódu, README, issue…).

### 1.2 Zapnout GitHub Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions**. Nic dalšího se nevybírá.

### 1.3 První ruční spuštění
**Actions → Zveřejnění webu → Run workflow** (větev `main`) → **Run workflow**.
Po 1–3 minutách zkontrolujte adresy z tabulky nahoře.

Dál se vše děje samo: každou noc v 1:23 UTC (2:23 v zimě, 3:23 v létě) a po každé změně
souborů ve větvi `main`.

> Když secret chybí, workflow skončí červeně s hláškou **„Chybí secret SHOPTET_FEED_URL“**
> a **nic nezveřejní** – na webu zůstanou data z posledního úspěšného běhu.
> Totéž platí, když se export nepodaří stáhnout nebo má méně než 5 produktů.
> Když se nepodaří stáhnout akce z hravestroje.cz, produkty se zveřejní, v kalendáři zůstanou
> akce z minula a běh skončí červeně (GitHub pošle e-mail).

---

## 2. Vložení skriptu do Shoptetu (produkty v článcích)

### 2.1 Jednou pro celý web
**Vzhled a obsah → Editor → HTML kódy → Zápatí** přidejte:

```html
<script src="https://hravestroje.github.io/hravestroje-web/produkty/hs-darky.js" defer></script>
```

Skript se načte na všech stránkách, ale něco dělá jen tam, kde najde `div.hs-darky`.
`produkty.json` si sám načte ze stejné složky.

### 2.2 Do článků
V editoru článku přepněte na **zdrojový kód** a místo pro produkty obalte takto:

```html
<div class="hs-darky" data-tema="vlaky">
  … sem nechte dosavadní statickou mřížku produktů (záloha při výpadku) …
</div>
```

| Atribut | Význam | Výchozí |
| --- | --- | --- |
| `data-tema` | `vlaky`, `traktory`, `auta`, `vanoce` (nebo jiné téma z `produkty/pravidla.json`), lze i víc: `"vlaky auta"`. Bez atributu = obecný výběr. | – |
| `data-pocet` | počet karet | `8` |
| `data-doplnit="ne"` | nedoplňovat jinými produkty, když je k tématu málo produktů skladem | doplňuje |

- Skript obsah nahradí, jen když najde aspoň 4 vhodné produkty skladem; jinak zůstane původní obsah.
- Kdyby editor Shoptetu mazal `data-tema`, použijte třídu: `<div class="hs-darky hs-darky--vlaky">`.
- Test na živém webu: k adrese článku přidejte `?hs-mesic=11` (chová se jako listopad)
  nebo `?hs-darky=vypnout` (ukáže statickou zálohu).

### 2.3 Témata a sezóny
Upravte `produkty/pravidla.json` (na GitHubu ikona tužky → uložit do `main`). Workflow se spustí
samo a za pár minut je nový `produkty.json` venku. Slova pište malými písmeny bez diakritiky,
hledají se na začátku slov (`vlac` najde „vláček“). Sezóna Vánoc je výchozí v říjnu–prosinci;
mimo sezónu se vánoční produkty ukazují jen v boxu `data-tema="vanoce"`.

Vzhled karet (CSS) a text tlačítka jsou v `produkty/hs-darky.js` (blok `NASTAVENÍ` a proměnná `CSS`).

---

## 3. Kalendář akcí

Workflow projde `https://www.hravestroje.cz/sitemap.xml` (i dílčí sitemapy), vezme články
s adresou začínající `/kalendar-dopravnich-akci` a z nich strukturovaná data **JSON-LD typu
`Event`** (název, začátek, konec, místo, adresa, obrázek). Články bez Event JSON-LD přeskočí
a vypíše je do logu a souhrnu běhu. Výsledek uloží do `kalendar/akce.json` (commit robota
`github-actions[bot]` – díky tomu GitHub nevypne noční spouštění po 60 dnech bez změn).

Ukázka JSON-LD do článku:

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Mikulášská jízda parním vlakem",
  "startDate": "2026-12-05T10:00:00+01:00",
  "endDate": "2026-12-05T16:00:00+01:00",
  "location": {
    "@type": "Place",
    "name": "Nádraží Brno-Židenice",
    "address": { "@type": "PostalAddress", "addressLocality": "Brno", "addressRegion": "Jihomoravský kraj" }
  },
  "image": "https://www.hravestroje.cz/…/vlak.jpg"
}
```

- Zrušená akce: `"eventStatus": "https://schema.org/EventCancelled"` (v kalendáři přeškrtnutá).
- Nepozná-li skript kraj nebo typ (v logu „Nezjištěn kraj“), doplňte ho v `kalendar/doplnky.json`.
- Jinou sitemapu lze nastavit proměnnou repozitáře `SITEMAP_URL`
  (Settings → Secrets and variables → Actions → záložka *Variables*). Není potřeba.
- Po změně `kalendar/index.html`, `app.js` nebo `styles.css` zvyšte verzi v `kalendar/sw.js`
  (`kalendar-v2` → `kalendar-v3`), aby si telefony s přidanou aplikací stáhly novou verzi.

Filtry jdou sdílet odkazem, např. `…/kalendar/?typ=vlaky` nebo `?vikend=1`.

---

## 4. Později: vlastní adresa akce.hravestroje.cz

GitHub Pages umí jednu vlastní doménu na repozitář. Po nastavení bude celý web na
`https://akce.hravestroje.cz/` – kalendář na `https://akce.hravestroje.cz/kalendar/`
a produkty na `https://akce.hravestroje.cz/produkty/…`. Stará adresa `hravestroje.github.io/hravestroje-web/…`
se pak sama přesměruje na novou, takže skript v Shoptetu dál funguje (doporučuji ho ale přepsat na novou adresu).

1. **DNS** – u správce domény hravestroje.cz přidejte záznam (ostatních se nedotýkejte):

   | Typ | Název | Hodnota |
   | --- | --- | --- |
   | CNAME | `akce` | `hravestroje.github.io.` |

2. **GitHub** – tento repozitář → **Settings → Pages → Custom domain** → `akce.hravestroje.cz` → **Save**.
   Až GitHub ověří DNS (minuty až hodiny), zaškrtněte **Enforce HTTPS**.
3. **Zabezpečení (doporučeno)** – nastavení *účtu/organizace* GitHub → **Pages → Add a domain** →
   `hravestroje.cz`, přidejte do DNS ukázaný TXT záznam. Nikdo cizí pak subdoménu nepoužije.
4. V Shoptetu změňte skript na
   `<script src="https://akce.hravestroje.cz/produkty/hs-darky.js" defer></script>`.

Kalendář i skript používají jen relativní cesty, fungují na obou adresách beze změn.
Kalendář přidaný na plochu telefonu z adresy `github.io` se na novou adresu sám nepřesune,
proto adresu nastavte ideálně dřív, než kalendář začnete propagovat.

---

## 5. Testy a zkoušení na počítači

Testy na ukázkových datech (bez secretu i bez internetu; spouští se i u každého pull requestu):

```bash
bash testy/spust-testy.sh
```

Testují: produkty z `produkty/ukazka-export.xml` (a že v `produkty.json` nejsou neveřejné údaje),
jasnou chybu při chybějícím secretu a kalendář nad testovací sitemapou `testy/sitemap-kalendar/`
(3 akce, kraje, typy, zrušená akce, článek bez JSON-LD, smazaný článek).

Testovací stránka produktů: otevřete `produkty/demo.html` dvojklikem. Na GitHub Pages
`demo.html?data=ziva` ukáže skutečné produkty z `produkty.json`.

Kalendář místně:

```bash
python3 -m http.server 8000
```

Pak otevřete `http://localhost:8000/kalendar/`.

## 6. Řešení problémů

| Příznak | Co zkontrolovat |
| --- | --- |
| „Chybí secret SHOPTET_FEED_URL“ | secret v *tomto* repozitáři, název přesně `SHOPTET_FEED_URL` |
| „HTTP 403/404“ při stahování exportu | adresa exportu se změnila → přepište secret |
| „jen 0 použitelných produktů“ | export není XML export produktů Shoptetu, nebo produktům chybí název, odkaz (`ORIG_URL`/`URL`) či cena (`PRICE`/`PRICE_VAT`); hláška uvádí i počet položek `SHOPITEM` |
| Zveřejnění selže „Pages not enabled“ / 404 | Settings → Pages → Source: **GitHub Actions** |
| Nová data se neprojevila | GitHub Pages i prohlížeč si soubory pamatují ~10 minut |
| Noční běhy se zastavily | Actions → Zveřejnění webu → **Enable workflow** |
