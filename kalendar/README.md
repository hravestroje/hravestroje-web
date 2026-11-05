# Kalendář akcí přímo na hravestroje.cz (Shoptet)

Skript `hs-kalendar.js` vykreslí **celý kalendář dopravních akcí** uvnitř běžné stránky e-shopu.
Funguje stejně jako samostatná stránka [kalendar/](https://hravestroje.github.io/hravestroje-web/kalendar/):
stejné řazení, filtry (typ, kdy, měsíc, vlastní termín, kraj, hledání), probíhající akce nahoře,
skupiny po měsících, „Přidat do kalendáře“ (.ics), „Sdílet“ i komerční prvky z `monetizace.json`
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
| `data-reklama-kazda` | `8` | místo pro reklamu po každé N-té kartě, `0` = vypnout |
| `data-akce` | `…/kalendar/akce.json` | jiný soubor s akcemi (jen pro testy) |
| `data-zaklad` | složka skriptu | odkud brát `logika.js`, `akce.json`, `monetizace.json` |
| `data-dnes` | dnešek | jen pro test: kalendář se chová, jako by bylo zadané datum (`2026-12-01`) |

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
