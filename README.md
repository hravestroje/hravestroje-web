# hravestroje-web

Veřejný repozitář s veřejnými soubory pro web [hravestroje.cz](https://www.hravestroje.cz/).
Každou noc se tu samo stáhnou aktuální data a zveřejní se přes **GitHub Pages**:

| Co | Adresa |
| --- | --- |
| Kalendář dopravních akcí (PWA, lze přidat na plochu) | https://hravestroje.github.io/hravestroje-web/kalendar/ |
| Kalendář vložený do stránky Shoptetu – skript, návod v [kalendar/README.md](kalendar/README.md) | https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js |
| Produkty z e-shopu pro články – data | https://hravestroje.github.io/hravestroje-web/produkty/produkty.json |
| Produkty z e-shopu pro články – skript | https://hravestroje.github.io/hravestroje-web/produkty/hs-darky.js |
| Testovací stránka produktů | https://hravestroje.github.io/hravestroje-web/produkty/demo.html |
| Akce v okolí pro články – skript | https://hravestroje.github.io/hravestroje-web/akce-v-okoli/hs-akce-v-okoli.js |
| Tipy na výlet v článcích – skript a data | https://hravestroje.github.io/hravestroje-web/nabidky/hs-nabidky.js, …/nabidky/nabidky.json |
| Kostry článku „Co se děje o víkendu“ | https://hravestroje.github.io/hravestroje-web/vikend/ |

V repozitáři **není nic tajného**. Adresa exportu ze Shoptetu je jen v GitHub secretu
`SHOPTET_FEED_URL` – secrety zůstávají skryté i ve veřejném repozitáři a nikde se nevypisují.
Nepotřebujete žádný osobní token, workflow si vystačí s automatickým `GITHUB_TOKEN`.

## Co je kde

| Složka / soubor | K čemu je |
| --- | --- |
| `kalendar/` | stránka kalendáře (`index.html`, `app.js`, `styles.css`), data `akce.json`, PWA (`manifest.webmanifest`, `sw.js`, `icons/`) |
| `kalendar/logika.js` | logika kalendáře (řazení, filtry dat, typy, odkazy, .ics) – oddělená od stránky, aby šla testovat |
| `kalendar/monetizace.json` | **nastavení komerčních prvků** kalendáře (Booking.com, e-shop, tipy na výlet) – viz [Monetizace](#7-monetizace-kalendáře) |
| `kalendar/scripts/stahni-akce.mjs` | stáhne akce ze sitemapy hravestroje.cz (Node.js, bez balíčků) |
| `kalendar/doplnky.json` | ruční opravy kraje, typu nebo obrázku akce u jednotlivých článků |
| `produkty/hs-darky.js` | skript pro Shoptet: v článcích vykreslí aktuální produkty skladem |
| `produkty/stahni_produkty.py` | z XML exportu Shoptetu vytvoří `produkty.json` (jen standardní Python) |
| `produkty/pravidla.json` | **témata a sezóny** produktů (vlaky, traktory, auta, Vánoce…) |
| `produkty/demo.html` + `demo-data.js` | testovací stránka s ukázkovými daty |
| `produkty/ukazka-export.xml` | ukázkový marketingový export Shoptetu (smyšlené produkty, i s variantami) |
| `akce-v-okoli/` | blok „Akce v okolí“ do článků + souřadnice akcí z offline tabulky obcí – **návod v [akce-v-okoli/README.md](akce-v-okoli/README.md)** |
| `nabidky/` | **tipy na výlet (reklama)** v článcích: `hs-nabidky.js`, data `nabidky.json` – návod v [`nabidky/README.md`](nabidky/README.md) |
| `vikend/` | kostry článku „Co se děje o víkendu“ z kalendáře akcí – viz [`vikend/README.md`](vikend/README.md) |
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
- Nepozná-li skript kraj nebo typ (v logu „Nezjištěn kraj“), doplňte ho v `kalendar/doplnky.json`
  (viz [3.2](#32-ruční-opravy-v-doplnkyjson-kraj-typ-obrázek)).
- Jinou sitemapu lze nastavit proměnnou repozitáře `SITEMAP_URL`
  (Settings → Secrets and variables → Actions → záložka *Variables*). Není potřeba.
- Po změně `kalendar/index.html`, `app.js`, `logika.js` nebo `styles.css` zvyšte verzi v `kalendar/sw.js`
  (`kalendar-v3` → `kalendar-v4`), aby si telefony s přidanou aplikací stáhly novou verzi.

### 3.1 Co kalendář zobrazuje

- **Pořadí:** nahoře sekce **„Právě probíhá“** (vícedenní akce, které začaly před dneškem a ještě trvají),
  pod ní nadcházející akce přísně podle data a času začátku, rozdělené po měsících. Akce bez času
  (celodenní) jsou v rámci dne první. Na kartě probíhající akce je „do 30. pro“ (do kdy trvá).
- **Typy** se poznají podle slov v názvu, popisu a adrese článku:

  | Typ (`typy` v datech) | Klíčová slova (příklady) |
  | --- | --- |
  | `vlaky` | vlak, vláček, železnice, lokomotiva, parní, mašinka, drezína, nádraží, motoráček, tramvaj, dráha, kolejiště, depo, expres |
  | `traktory` | traktor, zemědělský, kombajn, buldoček, Zetor, farma |
  | `auta` | auto, automobil, autobus, veterán, náklaďák, kamion, Tatra, hasiči, truck, off-road, rallye, jeep |
  | `lode` | loď, lodní, plavba, parník, přístav |
  | `letadla` | letadlo, letiště, letecký den, letecká, aviatika, vrtulník |
  | `ostatni` | vše ostatní (žádné slovo se nenašlo) |

  Slova jsou v `kalendar/scripts/stahni-akce.mjs` (blok `TYPY`). Typ jde u článku ručně přepsat (3.2).
- **Obrázky:** bere se přednostně **obrázek pro sdílení článku (`og:image`)** – ten bývá aktuální
  a opravený. Obrázek z JSON-LD (`"image"` v Event) se použije jen tehdy, když článek `og:image` nemá.
  Všechny akce z jednoho článku tak mají stejný obrázek. Ruční nastavení v `doplnky.json` (3.2) má přednost
  před obojím. Karta bez obrázku nebo s nefunkčním obrázkem ukáže jednotný zástupný obrázek
  (zelený se značkou a čárovou ikonou typu).
- **Filtry** (typ, kraj, hledání a datum) jdou kombinovat a ukládají se do adresy, takže jde poslat odkaz:

  | Filtr | Adresa |
  | --- | --- |
  | Dnes / Zítra | `?kdy=dnes`, `?kdy=zitra` |
  | Tento týden (do neděle) | `?kdy=tyden` |
  | Tento víkend / Příští víkend | `?kdy=vikend` (funguje i starý `?vikend=1`), `?kdy=pristi-vikend` |
  | Tento měsíc / Příští měsíc | `?kdy=mesic`, `?kdy=pristi-mesic` |
  | Konkrétní měsíc | `?mesic=2026-12` |
  | Vlastní termín od–do | `?od=2026-12-01&do=2026-12-10` (jde i jen `od` nebo jen `do`) |
  | Typ, kraj, hledání | `?typ=lode`, `?kraj=Zlínský kraj`, `?q=parní` |

  Příklad: `…/kalendar/?typ=vlaky&kraj=Jihomoravský kraj&kdy=pristi-vikend`.
  Na mobilu jsou filtry v rozbalovacím panelu **Filtry** (číslo na tlačítku = počet aktivních filtrů).
- U každé akce je **Přidat do kalendáře** (stáhne soubor `.ics` pro Google/Apple/Outlook kalendář)
  a **Sdílet** (na telefonu nabídka sdílení, na počítači zkopíruje odkaz na akci).

### 3.2 Ruční opravy v doplnky.json (kraj, typ, obrázek)

V `kalendar/doplnky.json` je u každého článku (klíč = **přesná adresa článku**) možné nastavit:

| Klíč | Hodnota | Co udělá |
| --- | --- | --- |
| `"kraj"` | `"Jihomoravský kraj"` | přepíše kraj |
| `"typy"` | `["lode"]` nebo víc: `["vlaky", "lode"]` | přepíše typ (`vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni`) |
| `"obrazek"` | `"zastupny"` | **skryje obrázek článku** a ukáže jednotný zástupný obrázek (např. stará grafika, která se teprve předělává) |
| `"obrazek"` | `"https://…/novy-obrazek.jpg"` | použije vlastní obrázek místo obrázku z článku |

Ukázka celého souboru:

```json
{
 "_navod": "…tento řádek nechte být…",
 "https://www.hravestroje.cz/kalendar-dopravnich-akci/lodni-linka-t91-labe/": {
  "typy": ["lode"],
  "obrazek": "zastupny"
 },
 "https://www.hravestroje.cz/kalendar-dopravnich-akci/mikulasska-jizda/": {
  "kraj": "Jihomoravský kraj",
  "obrazek": "https://cdn.myshoptet.com/usr/www.hravestroje.cz/user/documents/upload/nova-grafika.jpg"
 }
}
```

**Jak to udělat přímo v GitHubu (bez instalace čehokoli):**

1. Otevřete repozitář na github.com → složka `kalendar` → soubor `doplnky.json`.
2. Vpravo nahoře klikněte na **ikonu tužky** (*Edit this file*).
3. Před poslední `}` přidejte čárku za předchozí blok a nový blok podle ukázky. Adresu článku
   zkopírujte z prohlížeče (lomítko na konci nevadí). Pozor na uvozovky `"` a čárky mezi bloky.
4. Vpravo nahoře klikněte na **Commit changes…**, nechte vybrané *Commit directly to the `main` branch*
   a potvrďte **Commit changes**.
5. Workflow se spustí samo (záložka **Actions**), za 2–5 minut je změna na webu.
   Když je v souboru chyba (chybějící čárka…), běh zčervená a kalendář zůstane beze změny –
   opravte soubor stejným postupem. Neznámý typ se v logu ukáže jako „Neznámý typ v doplnky.json“.

Až bude nová grafika hotová, blok s `"obrazek": "zastupny"` prostě smažte (zase tužka → Commit).

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
jasnou chybu při chybějícím secretu, kalendář nad testovací sitemapou `testy/sitemap-kalendar/`
(6 akcí, kraje, typy včetně lodí, letadel a „ostatní“, ruční opravy z `doplnky-test.json`, zrušená akce,
článek bez JSON-LD, smazaný článek), logiku stránky v `testy/kalendar-logika.test.cjs` (řazení
a „Právě probíhá“, filtry dat včetně přelomu měsíce a roku, zástupné obrázky, skrytí tlačítka Booking
bez ID, výběr produktu podle typu, nabídky, soubor .ics) a kostru článku
o víkendu (výběr víkendu, vícedenní akce, řazení krajů).

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
| Typ nebo obrázek akce je špatně | oprava v `kalendar/doplnky.json` (viz 3.2) |

## 7. Monetizace kalendáře

Kalendář obsahuje nenápadné komerční prvky. Každý je označený a na jedné kartě je **nejvýš jeden**:

| Prvek | Kde | Označení |
| --- | --- | --- |
| **Ubytování poblíž** – odkaz na Booking.com s místem akce a daty (příjezd v den akce, u vícedenní v den začátku, u probíhající dnes; 1 noc, 2 dospělí) | na kartě akce | „partnerský odkaz · Booking.com“ |
| **Tip na výlet** z `nabidky.json` odpovídající kraji/typu akce (každá nabídka jen jednou na stránce) | na kartě akce místo Bookingu | „Tip na výlet (reklama)“ |
| **Produkt z e-shopu** po každé 6. kartě, vybraný podle typu akce (vlak → produkty se slovem vlak…, jinak náhodný skladem) z `../produkty/produkty.json` | samostatná dlaždice mezi kartami | „Z našeho e-shopu“ |

- Partnerské odkazy (Booking, tipy na výlet) mají `rel="sponsored nofollow noopener"` a otevírají se
  v novém okně. V patičce je věta „Některé odkazy jsou partnerské – pomáhají nám kalendář provozovat zdarma.“
- **Měření prokliků bez cookies:** všechny odkazy z karet mají `utm_source=kalendar&utm_medium=karta&utm_campaign=<typ>`
  (`vlaky`, `lode`…) a `utm_content` (`clanek`, `booking`, `eshop`, `nabidka`). Prokliky na hravestroje.cz
  uvidíte ve statistikách webu (např. Google Analytics → Akvizice → Kampaně, zdroj `kalendar`).
  Kalendář sám žádné cookies ani měřicí skripty nemá.

### 7.1 Co kam vyplnit v `kalendar/monetizace.json`

```json
{
 "zapnuto": true,
 "booking_aid": "",
 "booking_odkaz": "https://www.booking.com/searchresults.cs.html",
 "booking_label": "kalendar-akci",
 "eshop": true,
 "eshop_kazda_karta": 6,
 "nabidky": true
}
```

| Pole | Co vyplnit |
| --- | --- |
| `zapnuto` | `true` = komerční prvky zapnuté, `false` = **vše vypnuté** (i věta v patičce) |
| `booking_aid` | vaše **partnerské ID (aid)** z Booking.com Affiliate Partner Programme (jen písmena, číslice, `-`, `_`). **Dokud je prázdné, tlačítko „Ubytování poblíž“ se nezobrazuje.** Nikdy sem nedávejte vymyšlené číslo. |
| `booking_odkaz` | základní adresa vyhledávání Bookingu; měňte jen tehdy, když vám partnerský program dá jinou |
| `booking_label` | volitelný štítek, podle kterého v přehledu Bookingu poznáte prokliky z kalendáře |
| `eshop` | `false` = bez dlaždic produktů z e-shopu |
| `eshop_kazda_karta` | po kolika kartách se vloží produkt (výchozí 6) |
| `nabidky` | `false` = nezobrazovat tipy na výlet z `nabidky.json` |

Řádky začínající podtržítkem (`"_booking": "…"`) jsou jen nápověda a ignorují se.

**Krok za krokem v GitHubu:**

1. Zaregistrujte se v partnerském programu Booking.com (*Booking.com Affiliate Partner Programme*)
   a po schválení si v jejich administraci zkopírujte své **aid** (číslo partnera).
2. Na github.com otevřete `kalendar/monetizace.json` → **ikona tužky**.
3. Mezi uvozovky u `"booking_aid": ""` vložte své ID, např. `"booking_aid": "1234567"` (uvozovky nechte).
4. **Commit changes…** → *Commit directly to the `main` branch* → **Commit changes**.
5. Za pár minut se na kartách objeví „Ubytování poblíž“. Odkaz si vyzkoušejte – v adrese musí být `aid=…`
   s vaším číslem.

### 7.2 Tipy na výlet (`nabidky.json`)

Kalendář sám hledá soubor nabídek na adresách `kalendar/nabidky.json`, `nabidky/nabidky.json`
nebo `nabidky.json` (v kořeni repozitáře) – první nalezený použije. **Dokud soubor neexistuje,
nic se nezobrazí; jakmile vznikne, začne to fungovat samo** (workflow ho zkopíruje na web).
Očekávaný tvar:

```json
{
 "nabidky": [
  {
   "nazev": "Název nabídky",
   "url": "https://partner.example/odkaz",
   "popis": "Krátký popis (nepovinné)",
   "kraje": ["Jihomoravský kraj"],
   "typy": ["vlaky"],
   "od": "2026-11-01",
   "do": "2026-12-31"
  }
 ]
}
```

`kraje` / `typy` (lze i jednotlivě `"kraj": "…"`, `"typ": "…"`) jsou nepovinné – prázdné = platí pro všechny.
`od` / `do` jsou nepovinné – mimo toto období se nabídka neukáže. `"aktivni": false` nabídku dočasně skryje.
Přednost má nabídka, která sedí na kraj i typ.

### 7.3 Jak monetizaci vypnout

- **Vše najednou:** v `kalendar/monetizace.json` změňte `"zapnuto": true` na `"zapnuto": false` (tužka → Commit).
- **Jen něco:** `"booking_aid": ""` (bez Bookingu), `"eshop": false` (bez produktů), `"nabidky": false` (bez tipů).
- Kdyby soubor `monetizace.json` chyběl nebo byl rozbitý, kalendář funguje dál – jen bez komerčních prvků.
