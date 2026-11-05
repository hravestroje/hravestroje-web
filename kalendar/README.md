# Kalendář akcí přímo na hravestroje.cz (Shoptet)

Skript `hs-kalendar.js` vykreslí **celý kalendář dopravních akcí** uvnitř běžné stránky e-shopu.
Funguje stejně jako samostatná stránka [kalendar/](https://hravestroje.github.io/hravestroje-web/kalendar/):
stejné řazení (jeden seznam podle data: „Dnes“ s probíhajícími akcemi, pak měsíce; pod ním
sbalitelná sekce „Sezónní a dlouhodobé akce“), filtry (typ, kdy, měsíc, vlastní termín, kraj, hledání), „Přidat do kalendáře“ (.ics), „Sdílet“ i komerční prvky z `monetizace.json`
(tipy na výlet, Booking.com, dlaždice z e-shopu). Logiku nemá vlastní – načítá `logika.js`
ze stejné složky, takže každá oprava kalendáře platí na obou místech.

Navíc oproti samostatné stránce:

- **Filtry jsou v adrese stránky** – `?kraj=Jihomoravský kraj&kdy=vikend`. Sdílený odkaz otevře
  kalendář rovnou s filtry. Ostatní parametry adresy (např. `utm_source` z Facebooku) zůstanou.
- **Data pro Google (JSON-LD)** – do stránky vloží seznam nadcházejících akcí
  (`ItemList` s `Event`: název, termín, místo, kraj, obrázek, odkaz, zrušeno/přesunuto).
- **Místo pro reklamu** – po každé 8. kartě prázdný `<div class="hs-kal-reklama"></div>`
  (nikdy za úplně poslední kartou). Viz [kapitola 3](#3-reklama-adsense).
- Odkazy na články a produkty na hravestroje.cz se otevírají ve stejném okně a **bez UTM**
  (interní UTM by v Google Analytics přepsaly, odkud návštěvník přišel). Odkazy na partnery
  (Booking, tipy na výlet) UTM a `rel="sponsored nofollow"` mají jako dřív.

**Šablonu Shoptetu nerozbije:** všechny styly jsou jen uvnitř `#hs-kalendar` a všechny třídy
začínají `hs-kal-`. Písmo se přebírá ze šablony. Kalendář se přizpůsobí šířce obsahu stránky
(ne šířce okna), takže funguje i vedle levého menu: úzký obsah = 1 sloupec, střední 2, široký 3.

**Bez cookies a bez cizích knihoven.** Skript stahuje jen veřejné soubory z GitHub Pages
(bez přihlašovacích údajů) a nic nikam neposílá.

| Adresa | Co to je |
| --- | --- |
| https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js | skript pro Shoptet |
| https://hravestroje.github.io/hravestroje-web/kalendar/akce.json | akce (každou noc se aktualizují) |
| https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar-demo.html | ukázka se „zlou“ šablonou e-shopu |

---

## 1. Založení stránky v Shoptetu – krok za krokem

Stačí jednou. Trvá to asi 10 minut.

### Krok 1: skript do HTML kódů (jednou pro celý web)

1. V administraci Shoptetu otevřete **Vzhled a obsah → Editor → HTML kódy**.
2. Do pole **Zápatí** přidejte na nový řádek (vedle `hs-darky.js` a dalších skriptů):

   ```html
   <script src="https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js" defer></script>
   ```

3. Klikněte na **Uložit**.

Skript se tím načte na všech stránkách, ale na stránkách bez `<div id="hs-kalendar">`
hned skončí – nic nestahuje a nic nemění.

### Krok 2: nová stránka

1. Otevřete **Vzhled a obsah → Stránky** a klikněte na **Přidat stránku** (tlačítko vpravo nahoře).
2. **Název:** třeba `Kalendář dopravních akcí pro děti` (bude to nadpis H1 stránky).
3. V editoru obsahu přepněte na **zdrojový kód** (tlačítko `<>` / „Zdroj“).
4. Napište krátký úvod (2–3 věty pro Google i pro lidi) a pod něj vložte přesně:

   ```html
   <div id="hs-kalendar"></div>
   ```

   Pokud by editor prázdný `div` po uložení smazal, vložte ho s mezerou:
   `<div id="hs-kalendar">&nbsp;</div>` – skript obsah stejně nahradí.
5. Přepněte zpět z režimu zdrojového kódu a stránku **uložte**.
6. Zkontrolujte, že je stránka **viditelná** (přepínač *Viditelnost* / *Zobrazovat*).

### Krok 3: adresa a SEO

Ve stejné stránce, v části **SEO** (nebo *Pokročilé nastavení*):

- **URL:** krátká a bez data, např. `kalendar-akci` → `https://www.hravestroje.cz/kalendar-akci/`.
  Nepoužívejte adresu, kterou už má sekce článků (`/kalendar-dopravnich-akci/`), jinak by se přepsala.
- **Titulek (title):** `Kalendář dopravních akcí pro děti – vlaky, traktory, auta | Hravé stroje`
- **Meta popis:** `Nadcházející akce s vlaky, traktory, auty, loděmi a letadly pro děti po celé ČR. Filtr podle kraje a termínu.`

Uložte. Pokud chcete, přidejte stránku do menu (**Vzhled a obsah → Menu**).

### Krok 4: kontrola

1. Otevřete novou stránku – po chvilce se ukážou filtry a karty akcí.
2. Klikněte na **Tento víkend** – v adrese se objeví `?kdy=vikend`. Zkopírujte adresu, otevřete ji
   v anonymním okně: kalendář se otevře rovnou s filtrem.
3. Na mobilu jsou filtry pod tlačítkem **Filtry**.
4. Data pro Google: otevřete [Test výsledků s bohatým obsahem](https://search.google.com/test/rich-results),
   zadejte adresu stránky → mají se najít **Události** (Event).

Hotovo. Akce se aktualizují každou noc samy, na stránce v Shoptetu se už nic nemění.

---

## 2. Odkazy s filtry

Filtry jdou poskládat do adresy (hodí se do článků, newsletteru, na Facebook):

| Parametr | Hodnoty | Příklad |
| --- | --- | --- |
| `kraj` | přesný název kraje jako v kalendáři | `?kraj=Jihomoravský kraj` |
| `kdy` | `dnes`, `zitra`, `tyden`, `vikend`, `pristi-vikend`, `mesic`, `pristi-mesic` | `?kdy=pristi-vikend` |
| `typ` | `vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni` | `?typ=vlaky` |
| `mesic` | `RRRR-MM` | `?mesic=2026-12` |
| `od`, `do` | `RRRR-MM-DD` | `?od=2026-12-01&do=2026-12-24` |
| `q` | hledaný text | `?q=mikulášská` |

Příklad: `https://www.hravestroje.cz/kalendar-akci/?typ=vlaky&kraj=Jihomoravský kraj&kdy=vikend`

Odkaz na konkrétní akci (tlačítko **Sdílet**) končí `#hs-kal-akce-…` – stránka k akci sjede
a zvýrazní ji.

---

## 3. Reklama (AdSense)

Po každé 8. kartě je v kalendáři prázdné místo `<div class="hs-kal-reklama"></div>`
přes celou šířku (karty kolem něj zůstanou v úplných řadách).

Kalendář se při každé změně filtru **překreslí** a místa pro reklamu vzniknou znovu prázdná.
Proto kód reklamy nevkládejte do stránky natvrdo, ale nechte ho vkládat při každém vykreslení –
kalendář po každém vykreslení pošle událost `hs-kalendar:vykresleno` se seznamem prázdných míst.

Do **Vzhled a obsah → Editor → HTML kódy → Zápatí** (nad řádek s `hs-kalendar.js`) vložte
a doplňte svá čísla `ca-pub-…` a `data-ad-slot` z AdSense (*Reklamy → Podle reklamní jednotky*):

```html
<script>
document.addEventListener('hs-kalendar:vykresleno', function (e) {
  e.detail.reklamy.forEach(function (misto) {
    misto.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"' +
      ' data-ad-slot="1234567890" data-ad-format="auto" data-full-width-responsive="true"></ins>';
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  });
});
</script>
```

(Načtení samotného `adsbygoogle.js` už na webu máte, pokud AdSense používáte; jinak ho přidejte
podle návodu AdSense.)

- Jiný rozestup: `<div id="hs-kalendar" data-reklama-kazda="6"></div>`. `data-reklama-kazda="0"` místa vypne.
- Prázdné místo bez reklamy nezabere skoro žádnou výšku – stránka nevypadá rozbitě.

---

## 4. Nastavení na `<div id="hs-kalendar">` (nepovinné)

| Atribut | Výchozí | Význam |
| --- | --- | --- |
| `data-reklama-kazda` | `8` | místo pro reklamu po každé N-té kartě, `0` = vypnout (ve sbalené sekci dlouhodobých akcí reklama není nikdy) |
| `data-kraj` | – | přednastavený kraj, např. `Královéhradecký kraj` (viz níže) |
| `data-typ` | – | přednastavený typ: `vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni` |
| `data-akce` | `…/kalendar/akce.json` | jiný soubor s akcemi (jen pro testy) |
| `data-zaklad` | složka skriptu | odkud brát `logika.js`, `akce.json`, `monetizace.json` |
| `data-dnes` | dnešek | jen pro test: kalendář se chová, jako by bylo zadané datum (`2026-12-01`) |

### Stránky pro jednotlivé kraje a typy (`data-kraj`, `data-typ`)

Stačí v Shoptetu založit další stránku (stejně jako v kapitole 1, krok 2–3) a do ní místo
`<div id="hs-kalendar"></div>` vložit například:

```html
<div id="hs-kalendar" data-kraj="Královéhradecký kraj" data-typ="traktory"></div>
```

- Stránka se otevře rovnou s tímto krajem a typem; návštěvník je může ve filtrech změnit.
  **Zrušit filtry** vrátí stránku na její kraj a typ.
- Jde použít jen jeden z atributů (`data-kraj="Jihomoravský kraj"` = všechny akce v kraji,
  `data-typ="vlaky"` = všechny vlaky v ČR).
- Kraj stačí napsat i bez „kraj“, bez diakritiky a malými písmeny (`kralovehradecky`, `Vysočina`,
  `Praha`). Typ i jako `Traktory` nebo `Lodě`. Neznámá hodnota se ignoruje (ukáže se vše).
- Adresa stránky zůstane čistá (bez `?kraj=…`). Odkaz s filtry v adrese (kapitola 2) má přednost –
  `?kdy=vikend` na stránce kraje ukáže víkend v tom kraji.
- JSON-LD pro Google na takové stránce obsahuje jen akce daného kraje a typu.
- Doporučené adresy a nadpisy: `/kalendar-akci-kralovehradecky-kraj/` – „Akce pro děti
  v Královéhradeckém kraji“, `/kalendar-akci-traktory/` – „Traktoriády a akce s traktory“.

Test na živém webu bez úprav stránky: `?hs-kal-dnes=2026-12-01` za adresou stránky,
`?hs-kal=vypnout` kalendář nespustí.

Komerční prvky (Booking, e-shop, tipy na výlet) se řídí stejným souborem
[`kalendar/monetizace.json`](monetizace.json) jako samostatná stránka – viz hlavní README, kapitola 7.

---

## 5. Pro vývojáře

- `hs-kalendar.js` – skript; čisté funkce (JSON-LD, rozložení karet a reklam, adresa) jdou
  testovat v Node.js (`require`), v prohlížeči se sám spustí.
- `hs-kalendar-demo.html` – ukázková stránka napodobující šablonu e-shopu se schválně
  „agresivními“ styly (nadpisy, seznamy, tlačítka, třída `.karta`…). Místně:
  `python3 -m http.server 8000` v kořeni repozitáře → `http://localhost:8000/kalendar/hs-kalendar-demo.html`.
- Testy: `testy/hs-kalendar.test.cjs` (Node) a `testy/hs-kalendar-prohlizec.js` (Chromium, PC i mobil:
  karty, místa pro reklamu, filtry v adrese, sdílené odkazy, JSON-LD, izolace stylů, žádné cookies,
  žádné požadavky mimo web, stávající `kalendar/index.html` dál funguje). Spouští je `bash testy/spust-testy.sh`.
- Stránka `kalendar/index.html` (a `app.js`, `logika.js`, `styles.css`) se tímto skriptem nemění.

---

# Kalendář jako mobilní aplikace

Kalendář dopravních akcí je **PWA** – webová stránka, kterou jde přidat na plochu telefonu a která
se pak chová jako aplikace (vlastní ikona, bez adresního řádku, funguje i bez signálu).
Stejnou stránku lze později zabalit do **aplikace pro Google Play** (TWA – Trusted Web Activity).
Aplikace z Google Play pak jen zobrazuje web, takže každá změna webu se v ní projeví sama
a do Google Play se nahrává znovu jen výjimečně.

Obsah:

1. [Co aplikace umí](#1-co-aplikace-umí)
2. [Soubory](#2-soubory)
3. [Vlastní adresa kalendar.hravestroje.cz](#3-vlastní-adresa-kalendarhravestrojecz-active24--github-pages)
4. [Účet Google Play](#4-účet-google-play-vývojáře)
5. [Sestavení aplikace (Bubblewrap)](#5-sestavení-aplikace-pro-google-play-bubblewrap)
6. [Nahrání do Google Play a assetlinks.json](#6-nahrání-do-google-play-a-propojení-s-webem-assetlinksjson)
7. [Nová verze aplikace](#7-nová-verze-aplikace)
8. [Testy](#8-testy)

> Nic z kroků 3–7 zatím není hotové ani založené. Vše je jen připravené – kroky udělejte,
> až budete chtít aplikaci opravdu vydat.

---

## 1. Co aplikace umí

| Funkce | Jak to funguje |
| --- | --- |
| **Přidat do mobilu** | Na Androidu (Chrome, Edge, Samsung Internet) se v zelené hlavičce objeví tlačítko **Přidat do mobilu**, které otevře systémovou nabídku instalace. Na iPhonu/iPadu tlačítko ukáže krátký návod **Sdílet → Přidat na plochu** (Safari jinou cestu nenabízí). Po instalaci, po zavření křížkem nebo po „Rozumím“ se tlačítko v tomto zařízení už neukáže. V nainstalované aplikaci se neukazuje nikdy. |
| **Oblíbené akce** | Srdíčko v rohu obrázku každé akce. Tlačítko se srdíčkem vedle hledání zapne filtr **Moje oblíbené** (číslo = počet oblíbených nadcházejících akcí). |
| **Můj kraj** | Ve filtrech po výběru kraje zaškrtněte **Můj kraj – zobrazit při každém otevření**. Kalendář pak při otevření (z plochy i bez filtrů v adrese) rovnou ukáže akce z tohoto kraje. Odkaz s jiným krajem v adrese má přednost. |
| **Offline** | Service worker (`sw.js`) si uloží stránku, skripty, ikony a poslední `akce.json`. Bez signálu se ukáže uložený seznam a žlutá poznámka *„Jste offline. Zobrazuji uložený seznam – naposledy aktualizováno 4. 11. 2026 v 22:24.“* Po návratu signálu se seznam sám obnoví. Obrázky akcí z hravestroje.cz se offline nahradí zástupným obrázkem. |

**Soukromí:** oblíbené, můj kraj i stav tlačítka „Přidat do mobilu“ jsou uložené **jen v tomto
zařízení** (`localStorage`, klíče `hs-kalendar-oblibene`, `hs-kalendar-muj-kraj`, `hs-kalendar-instalace`).
Nic se neposílá na server, nepoužívají se **žádné cookies** a žádné notifikace. Když prohlížeč ukládání
zakáže (soukromé okno…), vše funguje do zavření stránky, jen si to kalendář nezapamatuje.
Smazáním dat webu v prohlížeči (nebo odinstalováním aplikace) se vše smaže.

## 2. Soubory

| Soubor | K čemu je |
| --- | --- |
| `manifest.webmanifest` | název „Kalendář dopravních akcí – Hravé stroje“, krátký název pod ikonou „Hravé akce“, barvy `#1f6f3d`, ikony, snímky obrazovky |
| `zarizeni.js` | oblíbené, můj kraj, tlačítko „Přidat do mobilu“ – vše v `try/catch`, testovatelné bez prohlížeče |
| `sw.js` | offline režim; **po změně `index.html`, `app.js`, `logika.js`, `zarizeni.js` nebo `styles.css` zvyšte verzi** (`kalendar-v4` → `kalendar-v5`) |
| `icons/` | ikony 192 a 512 px, „maskable“ ikona pro Android (kulaté/čtvercové ořezy), ikona pro iPhone |
| `screenshots/` | snímky pro instalační nabídku Androidu (a jako podklad pro Google Play); znovu vytvoří `node kalendar/scripts/snimky.js` |
| `android/twa-manifest.json` | nastavení pro **Bubblewrap** (nástroj Googlu, který z webu udělá aplikaci pro Google Play) |
| `android/.gitignore` | pojistka, aby se do veřejného repozitáře nedostal podepisovací klíč ani sestavená aplikace |
| `../.well-known/assetlinks.json` | **šablona** propojení webu s aplikací; na web se zveřejní až po doplnění otisku klíče (krok 6) |

## 3. Vlastní adresa kalendar.hravestroje.cz (Active24 + GitHub Pages)

Aplikace pro Google Play musí běžet na doméně, kde můžeme mít soubor
`https://<doména>/.well-known/assetlinks.json`. Na `hravestroje.github.io/hravestroje-web/` to nejde,
proto je potřeba vlastní adresa. GitHub Pages umí **jednu** vlastní doménu na repozitář – po nastavení
bude celý tento web na `https://kalendar.hravestroje.cz/` a kalendář na
**`https://kalendar.hravestroje.cz/kalendar/`** (skripty pro články pak na
`https://kalendar.hravestroje.cz/produkty/…` atd.). Tato adresa nahrazuje dříve plánovanou
`akce.hravestroje.cz` z kořenového README (kapitola 4) – použijte jen jednu z nich.

> Proč nejdřív adresa a pak propagace: kalendář přidaný na plochu z adresy `github.io` se na novou
> adresu sám nepřesune (oblíbené a můj kraj zůstanou u staré adresy).

### 3.1 DNS u Active24

1. Přihlaste se na **https://customer.active24.cz/** (zákaznické centrum Active24).
2. **Domény** → `hravestroje.cz` → **DNS záznamy** (případně „Správa DNS“).
3. **Přidat záznam** → typ **CNAME**:

   | Typ | Název (host) | Hodnota (cíl) | TTL |
   | --- | --- | --- | --- |
   | CNAME | `kalendar` | `hravestroje.github.io.` | 3600 (výchozí) |

   Do názvu napište jen `kalendar` (Active24 doplní `.hravestroje.cz` samo). Tečka na konci hodnoty
   nevadí; pokud ji formulář nepřijme, napište `hravestroje.github.io`. **Ostatních záznamů
   (www, e-mail, MX, Shoptet) se nedotýkejte.**
4. Uložte. Změna se projeví za několik minut až hodin. Ověřit jde např. na
   https://dnschecker.org/ (typ CNAME, `kalendar.hravestroje.cz` → `hravestroje.github.io`).

### 3.2 GitHub Pages

1. Na github.com otevřete tento repozitář → **Settings → Pages**.
2. **Custom domain** → napište `kalendar.hravestroje.cz` → **Save**. GitHub zkontroluje DNS
   (u nesprávného záznamu napíše chybu – počkejte a zkuste znovu).
3. Až kontrola projde, zaškrtněte **Enforce HTTPS** (certifikát může trvat až 24 hodin;
   bez HTTPS nefunguje instalace ani offline režim).
4. **Doporučené zabezpečení:** vpravo nahoře profilová fotka → **Settings → Pages → Add a domain** →
   `hravestroje.cz` → GitHub ukáže **TXT záznam** → přidejte ho u Active24 stejně jako CNAME (typ TXT)
   → **Verify**. Nikdo cizí pak subdoménu na GitHubu nepoužije.
5. Vyzkoušejte `https://kalendar.hravestroje.cz/kalendar/`. Stará adresa
   `hravestroje.github.io/hravestroje-web/…` se sama přesměruje na novou.
6. Skripty v Shoptetu fungují dál přes přesměrování; doporučuji je ale přepsat na novou adresu,
   např. `<script src="https://kalendar.hravestroje.cz/produkty/hs-darky.js" defer></script>`.

Soubor `CNAME` do repozitáře přidávat **nemusíte** – web se zveřejňuje přes GitHub Actions
a doména se pamatuje v nastavení Pages.

## 4. Účet Google Play vývojáře

1. Otevřete **https://play.google.com/console/signup** a přihlaste se Google účtem, pod kterým má
   aplikace zůstat natrvalo (ideálně firemní, ne osobní – převod účtu je složitý).
2. Vyberte typ účtu:
   - **Organizace** (doporučeno pro firmu): je potřeba **číslo D-U-N-S** (zdarma na
     https://www.dnb.com/duns-number/get-a-duns.html, vyřízení trvá i několik dní) a firemní údaje.
     Nové aplikace firem nemusí procházet povinným testováním.
   - **Osobní účet**: u nových osobních účtů Google před zveřejněním vyžaduje **uzavřené testování
     s alespoň 12 testery po dobu 14 dní** (pravidlo platí od listopadu 2023, před založením si
     ho ověřte v nápovědě Play Console).
3. Zaplaťte **jednorázový registrační poplatek 25 USD** (kartou; žádný roční poplatek).
4. Projděte **ověření totožnosti** (doklad, u organizace i firma) a ověření telefonu a e-mailu.
   Ověření může trvat několik dní.
5. Ve **veřejném profilu vývojáře** vyplňte kontaktní e-mail a web `https://www.hravestroje.cz/`.

## 5. Sestavení aplikace pro Google Play (Bubblewrap)

Potřebujete počítač (Windows, Mac nebo Linux) a **Node.js 18 nebo novější** (https://nodejs.org/).
Bubblewrap si při prvním spuštění sám stáhne Java JDK a Android SDK (odpovězte `Y`).

1. Nainstalujte Bubblewrap (jednou):

   ```bash
   npm install -g @bubblewrap/cli
   ```

2. Stáhněte repozitář (nebo jen složku `kalendar/android`) a otevřete v ní terminál:

   ```bash
   cd kalendar/android
   ```

3. Připravte projekt aplikace podle `twa-manifest.json` (předvyplněné: balíček
   `cz.hravestroje.kalendar`, adresa `kalendar.hravestroje.cz/kalendar/`, barvy `#1f6f3d`,
   ikony, bez notifikací):

   ```bash
   bubblewrap update --manifest=./twa-manifest.json
   ```

   Kdyby `update` hlásil, že projekt neexistuje, použijte místo něj
   `bubblewrap init --manifest=https://kalendar.hravestroje.cz/kalendar/manifest.webmanifest`
   a na otázky odpovídejte podle hodnot v `twa-manifest.json` (Application ID `cz.hravestroje.kalendar`).

4. **Podepisovací klíč** – při prvním sestavení se Bubblewrap zeptá na hesla a vytvoří soubor
   `hravestroje-kalendar.keystore`.
   - Hesla i soubor si **uložte na bezpečné místo** (správce hesel + záloha mimo počítač).
     Bez klíče nepůjde vydat novou verzi.
   - Klíč **nikdy nenahrávejte do tohoto repozitáře** (je veřejný). `android/.gitignore` to hlídá.

5. Sestavte aplikaci:

   ```bash
   bubblewrap build
   ```

   Vznikne `app-release-bundle.aab` (pro Google Play) a `app-release-signed.apk` (na zkoušku
   do vlastního telefonu – přeneste ho do telefonu a nainstalujte).

6. Otisk klíče pro `assetlinks.json` (ten z vašeho klíče, uvidíte ho i v Play Console – krok 6):

   ```bash
   bubblewrap fingerprint list
   ```

## 6. Nahrání do Google Play a propojení s webem (assetlinks.json)

1. **Play Console → Vytvořit aplikaci**: název *Kalendář dopravních akcí – Hravé stroje*,
   jazyk čeština, typ **Aplikace**, **Zdarma**, potvrďte prohlášení.
2. **Nastavení aplikace** (levé menu → *Panel*) – vyplňte všechny úkoly:
   - **Zásady ochrany soukromí**: odkaz na stránku zásad na hravestroje.cz (je povinný i u aplikace
     bez sběru dat).
   - **Přístup k aplikaci**: vše je přístupné bez přihlášení.
   - **Reklamy**: aplikace obsahuje odkazy označené „reklama“ / partnerské → odpovězte **Ano,
     obsahuje reklamy** (pokud je monetizace v `monetizace.json` zapnutá).
   - **Hodnocení obsahu**: dotazník (bez násilí apod.) → vhodné pro všechny.
   - **Cílová skupina**: obsah je pro **rodiče** malých dětí. Pokud zvolíte i věk do 13 let, aplikace
     spadá pod program *Families* s přísnějšími pravidly pro reklamy – doporučuji cílit na **18+**
     (rodiče) a v popisu uvést, že je pro rodiče.
   - **Bezpečnost údajů**: aplikace **neshromažďuje ani nesdílí žádné údaje** (oblíbené a kraj zůstávají
     v telefonu, žádné cookies, žádné účty). Pokud web používá Google Analytics, uveďte to.
   - Kategorie **Cestování a místní informace** (nebo Rodičovství), kontaktní e-mail.
3. **Hlavní záznam v obchodě**: krátký popis (max 80 znaků), plný popis, **ikona 512×512**
   (`icons/icon-512.png`), **grafika 1024×500** (je potřeba připravit), **snímky telefonu**
   (alespoň 2; použijte `screenshots/mobil-*.png` nebo vlastní snímky z telefonu).
4. **Testování → Interní testování → Vytvořit verzi** → nahrajte `app-release-bundle.aab`.
   Play Console nabídne **Podepisování aplikací Google Play** – přijměte (doporučeno).
5. **Otisk klíče do assetlinks.json:** Play Console → *Testování a vydání → Nastavení → Integrita
   aplikace → Podepisování aplikací* → zkopírujte **Otisk certifikátu SHA-256** z části
   *Podpisový klíč aplikace* (ne z části „Klíč pro nahrávání“).
6. Na github.com otevřete soubor `.well-known/assetlinks.json` → **ikona tužky** → nahraďte text
   `DOPLNTE:OTISK:KLICE:Z:GOOGLE:PLAY:CONSOLE` zkopírovaným otiskem (tvar `AB:CD:…`, 32 dvojic).
   Chcete-li, aby fungovala i zkušební APK z kroku 5.5, přidejte do hranatých závorek čárku a druhý
   otisk z `bubblewrap fingerprint list`. → **Commit changes**.
7. Workflow soubor zveřejní na `https://kalendar.hravestroje.cz/.well-known/assetlinks.json`
   (dokud v něm je `DOPLNTE`, nezveřejní ho). Ověřte ho nástrojem Googlu:
   https://developers.google.com/digital-asset-links/tools/generator
   (doména `kalendar.hravestroje.cz`, balíček `cz.hravestroje.kalendar`, otisk) → **Test statement**.
8. Nainstalujte interní testovací verzi do telefonu. **Když je nahoře vidět adresní řádek**, propojení
   ještě nefunguje (špatný otisk, soubor není na webu, nebo chybí HTTPS) – zkontrolujte body 5–7.
9. Pak **Produkční verze → Vytvořit verzi** (nebo nejdřív uzavřené testování, viz krok 4 – osobní
   účty). První kontrola Googlem trvá obvykle několik dní.

## 7. Nová verze aplikace

Běžné změny kalendáře (data, vzhled, funkce) se v aplikaci projeví **samy** – stačí upravit web
a zvýšit verzi v `sw.js`. Novou verzi do Google Play nahrávejte jen při změně ikony, názvu, barev
nebo adresy:

1. v `android/twa-manifest.json` zvyšte `appVersionCode` (o 1) a `appVersionName` (např. `1.0.1`),
2. `bubblewrap update` a `bubblewrap build` (se stejným klíčem),
3. nahrajte nový `.aab` jako novou verzi v Play Console.

## 8. Testy

```bash
bash testy/spust-testy.sh
```

Kalendáře jako aplikace se týkají:

- `testy/kalendar-zarizeni.test.cjs` – oblíbené (přidání, odebrání, poškozená data, strop),
  filtr Moje oblíbené, můj kraj, tlačítko instalace, **zakázané úložiště**, rozpoznání iPhonu,
- `testy/kalendar-pwa.test.cjs` – manifest (názvy, barvy, ikony a jejich rozměry, snímky),
  `sw.js` ukládá všechny potřebné soubory, workflow je zveřejní, `twa-manifest.json` sedí s manifestem
  a `assetlinks.json`, žádný klíč v repozitáři, **žádné emoji ani cookies**,
- `testy/kalendar-prohlizec.js` – v **Chromiu na mobilu** (Pixel 7, iPhone 13): srdíčka a filtr,
  můj kraj, chod bez úložiště, tlačítko „Přidat do mobilu“ na Androidu i iPhonu, **offline** (uložený
  seznam a poznámka „naposledy aktualizováno“), žádné cookies. Spouští se jen tam, kde je nainstalovaný
  Playwright (v GitHub Actions se přeskočí); s cestou ke složce uloží i snímky:
  `node testy/kalendar-prohlizec.js /cesta/ke/slozce`.
