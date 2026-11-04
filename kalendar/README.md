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
