# Co se děje o víkendu – kostry článků

Generátor podkladu pro článek „Co se děje o víkendu“. Z kalendáře akcí (`kalendar/akce.json`)
vybere akce, které zasahují do víkendu (pátek–neděle), a připraví HTML kostru článku.

**Kostra je jen podklad, ne hotový článek.** U každé akce je výrazné označení
**OVĚŘIT U POŘADATELE**. Každou akci před zveřejněním ověřte (termín, čas, místo, zda se koná)
a teprve pak označení smažte.

Seznam koster na webu: https://hravestroje.github.io/hravestroje-web/vikend/

## Co je kde

| Soubor | K čemu je |
| --- | --- |
| `scripts/kostra.mjs` | generátor (Node.js 20+, bez balíčků z npm) |
| `kostry/RRRR-MM-DD.html` | kostra pro víkend začínající daným pátkem |
| `index.html` | seznam koster s tlačítkem „Zkopírovat HTML“ (vzniká automaticky, ručně neupravovat) |
| `testy/kostra.test.mjs` | testy (spouští je i `bash testy/spust-testy.sh`) |

## Kdy kostry vznikají

Automaticky ve workflow **Zveřejnění webu** (`.github/workflows/web.yml`):

- **každý čtvrtek ráno** (5:17 UTC, tj. 6:17 v zimě a 7:17 v létě),
- **při každém sestavení webu** – každou noc a po každé změně ve větvi `main`.

Pokaždé se vytvoří (nebo přepíše) kostra pro nejbližší víkend z nejčerstvějšího `akce.json`
a uloží se i do repozitáře (commit robota `github-actions[bot]`). Starší kostry zůstávají
v seznamu, nejnovější je nahoře.

Který víkend je „nejbližší“ (podle data v Praze):

| Den spuštění | Víkend |
| --- | --- |
| pondělí až čtvrtek | nadcházející pátek až neděle |
| pátek až neděle | právě probíhající víkend |

## Jak kostru použít

1. Otevřete seznam koster a klikněte u víkendu na **Zkopírovat HTML**.
   Zkopíruje se jen obsah článku (bez záhlaví stránky s upozorněním).
2. V Shoptetu založte článek, v editoru přepněte na **zdrojový kód** a obsah vložte.
3. Místo textu **DOPSAT ÚVOD** napište úvod.
4. U každé akce ověřte údaje u pořadatele, opravte je a smažte řádek **OVĚŘIT U POŘADATELE**.
   Akci, která se nekoná, smažte i z tabulky a ze skriptu JSON-LD na konci.
5. Navrhovaný titulek je v záhlaví kostry (např. „Co se děje o víkendu 6.–8. listopadu 2026“).

## Co kostra obsahuje

1. Úvod – místo k dopsání (`<p class="hs-vikend-uvod">DOPSAT ÚVOD</p>`).
2. Přehled akcí podle krajů: nejdřív **Královéhradecký kraj**, pak sousední **Pardubický,
   Liberecký a Středočeský kraj**, potom ostatní kraje abecedně a nakonec akce bez kraje
   („Kraj neuveden“). V kraji jsou akce seřazené podle začátku.
   U každé akce: název, datum a čas, místo, kraj, odkaz na náš článek, popis a označení
   OVĚŘIT U POŘADATELE (u přesunutých akcí ještě „POZOR: AKCE BYLA PŘESUNUTA“).
3. Tabulka všech akcí víkendu (datum, akce, místo, kraj), seřazená podle data.
4. FAQ – tři obecné otázky.
5. Strukturovaná data JSON-LD `ItemList` se všemi akcemi (ve stejném pořadí jako přehled).
   Všechny `<script>` jsou až jako poslední prvek obsahu.

Pravidla výběru akcí:

- Akce se vezme, když **aspoň jedním dnem zasahuje do pátku, soboty nebo neděle** – tedy
  i vícedenní a dlouhodobé akce (výstavy, sezónní vlaky). U nich je v přehledu celý rozsah,
  konkrétní dny o víkendu je potřeba ověřit.
- Zrušené akce (`zruseno` v `akce.json`) se vynechají.
- Datum a čas se berou tak, jak jsou zapsané v kalendáři (místní čas akce).

HTML je jednoduché, bez inline stylů a bez emoji, všechny třídy mají předponu `hs-`
(`hs-vikend`, `hs-vikend-kraj`, `hs-vikend-akce`, `hs-overit`, `hs-vikend-udaje`,
`hs-vikend-popis`, `hs-vikend-tabulka`, `hs-vikend-faq`). Vzhled si tak lze nastavit
v CSS šablony Shoptetu.

## Ruční spuštění

```bash
node vikend/scripts/kostra.mjs
```

Volby:

| Volba | Význam |
| --- | --- |
| `--vikend RRRR-MM-DD` | kostra pro víkend, do kterého datum patří (po–čt = nejbližší následující víkend), např. `--vikend 2026-12-31` → víkend 1.–3. ledna 2027 |
| `--dnes RRRR-MM-DD` | jako by byl daný den (pro zkoušení) |
| `--akce SOUBOR` | jiný zdroj akcí (výchozí `kalendar/akce.json`) |
| `--vystup SLOŽKA` | kam uložit `index.html` a `kostry/` (výchozí `vikend/`) |

## Testy

```bash
node --test vikend/testy/kostra.test.mjs
```

Testují výběr víkendu (běžný týden, přelom měsíce, přelom roku, přestupný rok), vícedenní akce
zasahující do víkendu, vynechání zrušených akcí, řazení krajů, obsah kostry (označení OVĚŘIT,
tabulka, FAQ, JSON-LD jako poslední prvek, žádné inline styly ani emoji, třídy `hs-`)
a zápis souborů včetně seznamu s tlačítkem.
