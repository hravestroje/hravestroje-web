# Tipy na výlet (reklama) v článcích

Skript `hs-nabidky.js` vloží do článku na hravestroje.cz blok **„Tip na výlet (reklama)“**
s kartami nabídek partnerů (Slevomat, Booking.com, zážitky…). Nabídky se vybírají podle kraje
a typu článku. Prošlé nabídky a ukázky se nezobrazují. Když nic nesedí, blok se vůbec neukáže
a v článku nezůstane prázdné místo.

- data: https://hravestroje.github.io/hravestroje-web/nabidky/nabidky.json
- skript: https://hravestroje.github.io/hravestroje-web/nabidky/hs-nabidky.js
- testovací stránka: https://hravestroje.github.io/hravestroje-web/nabidky/demo.html

Skript nepoužívá cookies ani cizí knihovny a nic neměří. Odkazy dostanou
`rel="sponsored nofollow noopener"`, otevřou se v novém okně a na konec adresy se přidá
`utm_source=hravestroje&utm_medium=clanek` (návštěvy pak uvidíte v Google Analytics i u partnera).

---

## 1. Přidání nabídky přímo v GitHubu

1. Otevřete soubor [`nabidky/nabidky.json`](nabidky.json) na GitHubu a vpravo nahoře klikněte na **tužku** (*Edit this file*).
2. Zkopírujte jednu nabídku – vše od `{` po `}` – a vložte ji za poslední nabídku.
   **Mezi nabídkami musí být čárka**, za poslední nabídkou čárka být nesmí.
3. Upravte údaje (tabulka níže). U skutečné nabídky **smažte řádek `"ukazka": true,`**
   – jinak se nezobrazí.
4. Vpravo nahoře klikněte na **Commit changes…** → nechte *Commit directly to the main branch* → **Commit changes**.
5. Za pár minut je nabídka na webu (GitHub Pages a prohlížeč si soubor pamatují ~10 minut).

Pokud v souboru uděláte chybu (chybějící čárka, překlep v kraji…), workflow v záložce **Actions**
skončí červeně, v kroku *Test na ukázkových datech* česky vypíše, co je špatně, a **nic nezveřejní**
– na webu zůstanou předchozí nabídky. Stačí chybu opravit stejným postupem.

Příklad skutečné nabídky (adresu i obrázek zkopírujte z partnerského programu):

```json
{
  "id": "slevomat-parni-vlak-2026",
  "nazev": "Jízda parním vlakem pro celou rodinu",
  "popis": "Celodenní výlet s dětmi, zastávka u muzea.",
  "url": "https://… adresa z partnerského programu …",
  "obrazek": "https://… adresa obrázku …",
  "zdroj": "slevomat",
  "kraje": ["Královéhradecký kraj"],
  "typy": ["vlaky"],
  "platnost_do": "2026-12-31"
}
```

| Pole | Co do něj patří |
| --- | --- |
| `id` | krátký jedinečný název bez mezer, např. `slevomat-parni-vlak-2026` (nesmí se opakovat) |
| `nazev` | nadpis karty |
| `popis` | 1–2 krátké věty (může být `""`) |
| `url` | partnerský odkaz, musí začínat `https://` (UTM parametry se přidají samy) |
| `obrazek` | adresa obrázku `https://…`, nebo `""` = karta bez obrázku |
| `zdroj` | `slevomat`, `booking`, `zazitky` nebo `jine` (zobrazí se malým písmem nad nadpisem; `jine` nic nezobrazí) |
| `kraje` | seznam krajů s přesným názvem, např. `["Královéhradecký kraj", "Pardubický kraj"]`. Prázdný `[]` = celá ČR |
| `typy` | `vlaky`, `traktory`, `auta`, `lode`, `letadla`, nebo `vse` (= hodí se ke všem článkům) |
| `platnost_do` | poslední den zobrazení `RRRR-MM-DD` (ten den se ještě ukáže), nebo `""` = bez omezení |
| `ukazka` | `true` = vzorová položka, nikdy se nezobrazí. U skutečných nabídek řádek vynechte |

Kraje: Hlavní město Praha, Středočeský kraj, Jihočeský kraj, Plzeňský kraj, Karlovarský kraj,
Ústecký kraj, Liberecký kraj, Královéhradecký kraj, Pardubický kraj, Kraj Vysočina,
Jihomoravský kraj, Olomoucký kraj, Zlínský kraj, Moravskoslezský kraj.

Prošlé nabídky se ze souboru mazat nemusí (na webu se samy přestanou ukazovat),
ale jednou za čas je pro přehlednost smažte.

### Jak se nabídky vybírají
Pro blok s `data-kraj` a `data-typ` se berou nabídky v tomto pořadí, dokud jich není dost:

1. daný kraj + daný typ
2. daný kraj + typ `vse`
3. celá ČR (`"kraje": []`) + daný typ
4. celá ČR + typ `vse`

Uvnitř každé skupiny platí pořadí v souboru – co má být víc vidět, dejte výš.

### Rozložení karet
Na počítači nikdy nezůstane poloprázdná poslední řada: 1–3 nabídky vedle sebe,
4 = 2×2, 6 = 3×2, 8 = 2×4, 9 = 3×3. Když vyjde 5 nebo 7, ukáže se o jednu méně (4, resp. 6).
Na mobilu jsou karty pod sebou.

---

## 2. Vložení skriptu do Shoptetu (jednou pro celý web)

**Vzhled a obsah → Editor → HTML kódy → Zápatí** přidejte řádek a uložte:

```html
<script src="https://hravestroje.github.io/hravestroje-web/nabidky/hs-nabidky.js" defer></script>
```

Skript se načte na všech stránkách, ale něco dělá jen tam, kde najde `div.hs-nabidky`.

## 3. Blok do článku

V editoru článku přepněte na **zdrojový kód** (tlačítko `<>` / *Zdroj*) a na místo, kde má tip být, vložte:

```html
<div class="hs-nabidky" data-kraj="Královéhradecký kraj" data-typ="vlaky" data-pocet="4"></div>
```

| Atribut | Význam | Výchozí |
| --- | --- | --- |
| `data-kraj` | přesný název kraje (viz seznam výše). Bez atributu = jen nabídky pro celou ČR | – |
| `data-typ` | `vlaky`, `traktory`, `auta`, `lode`, `letadla`. Bez atributu = jen nabídky typu `vse` | `vse` |
| `data-pocet` | kolik karet nejvýš ukázat (1–9) | `4` |

Do jednoho článku lze vložit i víc bloků (např. jeden v půlce, druhý na konci).
Dokud se blok nenačte, je skrytý – při výpadku nebo když nic nesedí tedy čtenář nic nevidí.

Test na živém webu: k adrese článku přidejte `?hs-datum=2027-01-15` (chová se, jako by bylo
15. 1. 2027 – hodí se na kontrolu `platnost_do`) nebo `?hs-nabidky=vypnout`.

---

## 4. Pro vývoj

| Soubor | K čemu je |
| --- | --- |
| `hs-nabidky.js` | skript pro Shoptet; barvy, texty a CSS v blocích `NASTAVENÍ` a `CSS` |
| `nabidky.json` | nabídky (zatím jen 2 ukázky, které se nezobrazují) |
| `zkontroluj-nabidky.mjs` | kontrola `nabidky.json` před zveřejněním |
| `demo.html` + `demo-data.js` | testovací stránka se smyšlenými nabídkami (odkazy na example.com) |

Testy: `bash testy/spust-testy.sh` (výběr podle kraje a typu, prošlé nabídky, mřížka, skryté ukázky,
UTM). Když je nainstalovaný Playwright, otestuje se i vykreslení v Chromiu na PC a mobilu
(`node testy/nabidky-prohlizec.js složka-pro-snímky` uloží i snímky obrazovky).
