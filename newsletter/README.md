# Víkendový newsletter – kostry pro Ecomail

Generátor podkladu pro víkendový newsletter. Z kalendáře akcí (`kalendar/akce.json`)
a produktů z e-shopu (`produkty.json`) připraví **celý HTML e-mail**, který se vloží do Ecomailu.

**Kostra je jen podklad, ne hotový e-mail.** U každé akce je výrazná červená značka
**OVĚŘIT U POŘADATELE**. Každou akci před odesláním ověřte (termín, čas, místo, zda se koná)
a teprve pak značku smažte.

Seznam koster na webu: https://hravestroje.github.io/hravestroje-web/newsletter/

## Co je kde

| Soubor | K čemu je |
| --- | --- |
| `scripts/kostra.mjs` | generátor (Node.js 20+, bez balíčků z npm); výběr víkendu a krajů sdílí s `vikend/scripts/kostra.mjs` |
| `kostry/RRRR-MM-DD.html` | e-mail pro víkend začínající daným pátkem |
| `index.html` | seznam koster s tlačítkem „Zkopírovat HTML“ (vzniká automaticky, ručně neupravovat) |
| `testy/kostra.test.mjs` | testy (spouští je i `bash testy/spust-testy.sh`) |

## Kdy kostry vznikají

Automaticky ve workflow **Zveřejnění webu** (`.github/workflows/web.yml`):

- **každou středu večer** v 18:41 UTC (19:41 v zimě, 20:41 v létě),
- při **ručním spuštění** (Actions → Zveřejnění webu → Run workflow).

Při běžném nočním sestavení webu se nová kostra nevytváří, jen se zveřejní ty uložené.
Kostra se vytvoří z čerstvě stažených akcí a produktů a uloží se i do repozitáře
(commit robota `github-actions[bot]`). Starší kostry zůstávají v seznamu, nejnovější je nahoře.

Víkend se vybírá stejně jako u koster článků: pondělí až čtvrtek = nadcházející pátek až neděle,
pátek až neděle = právě probíhající víkend. Ve středu tedy vždy vznikne e-mail na nejbližší víkend.

## Jak kostru použít v Ecomailu

1. Otevřete seznam koster a u víkendu klikněte na **Zkopírovat HTML**. Zkopíruje se celý e-mail.
   Odkazem na název víkendu si e-mail nejdřív můžete prohlédnout.
2. V Ecomailu založte kampaň, jako šablonu zvolte **vlastní HTML kód** a obsah vložte.
3. Předmět: **Co se děje o víkendu 6.–8. listopadu 2026** (je u kostry v seznamu i v `<title>`).
4. Místo textu **DOPSAT ÚVOD** napište úvod (a smažte u něj růžové podbarvení, pokud nechcete).
5. U každé akce ověřte údaje u pořadatele, opravte je a smažte značku **OVĚŘIT U POŘADATELE**.
   Akci, která se nekoná, smažte celou.
6. Zkontrolujte produkty (jsou pořád skladem?) a pošlete si testovací e-mail.

## Co e-mail obsahuje

1. Záhlaví v zelené barvě webu a skrytý text náhledu (preheader) pro poštovní schránky.
2. Úvod – místo k dopsání.
3. Akce víkendu podle krajů: nejdřív **Královéhradecký kraj**, pak sousední **Pardubický,
   Liberecký a Středočeský kraj**, potom ostatní kraje abecedně a nakonec akce bez kraje.
   U každé akce: název (odkaz na náš článek), značka OVĚŘIT U POŘADATELE (u přesunutých akcí
   ještě „POZOR: AKCE BYLA PŘESUNUTA“), kdy, kde, zkrácený popis a odkaz „Podrobnosti v článku“.
   Na konci tlačítko na celý kalendář akcí.
4. **3 produkty z e-shopu** (obrázek, název, cena, tlačítko „Prohlédnout“).
5. Patička s odkazem na odhlášení přes proměnnou Ecomailu **`{unsubscribe}`**.

Pravidla výběru akcí jsou stejná jako u koster článků (viz [`vikend/README.md`](../vikend/README.md)):
akce aspoň jedním dnem zasahuje do pátku až neděle, zrušené akce se vynechají.

Pravidla výběru produktů:

- jen produkty **skladem** s odkazem a cenou,
- přednost mají produkty s obrázkem, pak produkty se **sezónním tématem** (podle `sezony`
  v `produkty/pravidla.json`, např. Vánoce v říjnu až prosinci) a pak produkty ve **slevě**,
- produkty s tématem mimo sezónu se vynechají,
- jinak se pořadí mění podle víkendu, takže každý týden přijdou jiné produkty.

## Technické poznámky

- Layout je z tabulek, šířka **600 px** (na telefonu se zúží), všechny styly jsou **inline**,
  bez `<style>`, bez skriptů a bez tříd – kvůli Outlooku, Gmailu a dalším klientům.
- Barvy jsou stejné jako v kalendáři (zelená `#1f6f3d`, cihlová `#c0392b` pro značky).
- **Žádné emoji.**
- Všechny odkazy na hravestroje.cz mají UTM parametry
  `utm_source=newsletter&utm_medium=email&utm_campaign=vikend-RRRR-MM-DD` (datum pátku).
  Pokud máte v Ecomailu zapnuté automatické přidávání UTM pro Google Analytics, vypněte ho,
  ať se parametry nepřepisují.
- Odkaz na odhlášení je `<a href="{unsubscribe}">`. Ecomail ho při odeslání nahradí skutečným
  odkazem. Tlačítko „Zkopírovat HTML“ odmítne zkopírovat soubor, ve kterém odkaz chybí.
- Když má e-mail víc než 100 kB (hodně akcí), skript vypíše upozornění – Gmail delší e-maily zkracuje.

## Ruční spuštění

`produkty.json` se v repozitáři neukládá (vzniká ve workflow), pro zkoušení si ho vytvořte
z ukázkového exportu:

```bash
python3 produkty/stahni_produkty.py --soubor produkty/ukazka-export.xml --vystup /tmp/produkty.json
```

```bash
node newsletter/scripts/kostra.mjs --produkty /tmp/produkty.json --vystup /tmp/newsletter
```

Volby:

| Volba | Význam |
| --- | --- |
| `--vikend RRRR-MM-DD` | e-mail pro víkend, do kterého datum patří (po–čt = nejbližší následující víkend) |
| `--dnes RRRR-MM-DD` | jako by byl daný den (pro zkoušení) |
| `--akce SOUBOR` | jiný zdroj akcí (výchozí `kalendar/akce.json`) |
| `--produkty SOUBOR` | zdroj produktů (výchozí `produkty/produkty.json`) |
| `--vystup SLOŽKA` | kam uložit `index.html` a `kostry/` (výchozí `newsletter/`) |

## Testy

```bash
node --test newsletter/testy/kostra.test.mjs
```

Testují UTM odkazy, výběr produktů (skladem, sezóna, sleva, mimo sezónu), pořadí krajů,
značky OVĚŘIT U POŘADATELE, escapování, e-mailový layout (600 px, inline styly, žádné `<style>`,
skripty ani emoji, obrázky s `alt`), odkaz `{unsubscribe}` v patičce, prázdný víkend
a zápis souborů včetně seznamu s tlačítkem.
