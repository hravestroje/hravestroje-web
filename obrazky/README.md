# Obrázek akce – generátor

Statická stránka, která v prohlížeči vytvoří obrázek akce ve stylu webu hravestroje.cz:
zelená hlavička s bílým názvem a žlutým datem, světle zelená plocha s ilustrací uprostřed,
pod ní tučně trasa nebo místo, řádek „Pořádá … · kraj“ a malé „hravestroje.cz“.

Adresa: https://hravestroje.github.io/hravestroje-web/obrazky/

| Formát | Rozměr | K čemu |
| --- | --- | --- |
| Web | 1200 × 630 px | náhledový obrázek článku (og:image), sdílení odkazu |
| Sítě | 1080 × 1350 px | příspěvek na Instagram / Facebook (na výšku) |

Obrázek se kreslí jen ve vašem prohlížeči (canvas), nic se nikam neodesílá. Stránka nepoužívá
cookies, měřicí skripty ani cizí knihovny.

## Jak vytvořit obrázek

1. Otevřete stránku generátoru.
2. **Vybrat z kalendáře** – zvolte akci (nahoře jsou nadcházející, dole proběhlé). Předvyplní se
   název, datum, místo a kraj. Nebo nechte „vyplním ručně“ a vše napište sami.
   Všechna pole jdou po výběru akce ještě upravit.
3. **Pořádá** – kalendář pořadatele nezná, vyplňte ho ručně (nepovinné). Prázdné pole se
   na obrázku vynechá, zůstane jen kraj.
4. **Ilustrace** – vyberte ji ze seznamu, nebo nahrajte obrázek z počítače
   (**Ilustrace ze souboru**). U vybrané akce se sama nabídne ilustrace stejného typu (vlaky,
   traktory…), pokud ji seznam obsahuje.
5. **Velikost** a **Posun vlevo / vpravo** – ilustrace vždy stojí na spodní linii, nic nevisí
   ve vzduchu. Průhledný okraj pod kresbou se pozná automaticky a zapustí se pod linii.
   Tlačítko **Výchozí velikost a střed** vrátí výchozí stav. Každý formát má vlastní nastavení.
6. **Formát** – Web, nebo Sítě.
7. **Stáhnout PNG** – stáhne obrázek v přesném rozměru, např. `obrazek-cyklohracek-1200x630.png`.

Dlouhý název se sám zalomí a zmenší písmo, aby se vešel do hlavičky (web nejvýš 2 řádky,
sítě 3 řádky). Co se nevejde ani při nejmenším písmu, skončí třemi tečkami – v tom případě
název na obrázek zkraťte ručně.

## Jak přidat ilustraci do seznamu (`ilustrace.json`)

Seznam je zatím prázdný. Ilustrace se nahrávají do Shoptetu do složky
`https://www.hravestroje.cz/user/documents/upload/ilustrace/`.

1. Ilustraci (nejlépe **PNG s průhledným pozadím**, aspoň 1000 px na šířku) nahrajte v administraci
   Shoptetu do složky `ilustrace` (Soubory → `upload/ilustrace`). Zkopírujte si její adresu, např.
   `https://www.hravestroje.cz/user/documents/upload/ilustrace/parni-lokomotiva.png`.
2. Na github.com otevřete `obrazky/ilustrace.json` → **ikona tužky**.
3. Do hranatých závorek u `"ilustrace": []` vložte položku. Víc položek oddělte čárkou,
   za poslední čárka nesmí být:

   ```json
   "ilustrace": [
    { "nazev": "Parní lokomotiva", "url": "https://www.hravestroje.cz/user/documents/upload/ilustrace/parni-lokomotiva.png", "typy": ["vlaky"] },
    { "nazev": "Traktor", "url": "https://www.hravestroje.cz/user/documents/upload/ilustrace/traktor.png", "typy": ["traktory"] }
   ]
   ```

4. **Commit changes…** → *Commit directly to the `main` branch* → **Commit changes**.
   Za pár minut je ilustrace v nabídce generátoru.

| Pole | Co vyplnit |
| --- | --- |
| `url` | povinné – adresa musí začínat `https://www.hravestroje.cz/user/documents/upload/ilustrace/` (jiné adresy se ignorují) |
| `nazev` | nepovinné – text v nabídce; bez něj se použije název souboru |
| `typy` | nepovinné – `vlaky`, `traktory`, `auta`, `lode`, `letadla`, `ostatni`; ilustrace se sama nabídne k akci téhož typu |

Pole `_navod` je jen nápověda a generátor ho ignoruje. Správnost souboru hlídá test
(`bash testy/spust-testy.sh`).

### Když stažení PNG nejde

Prohlížeč smí z obrázku z cizího webu udělat PNG jen tehdy, když to ten web povolí
(hlavička CORS). Pokud se ilustrace v náhledu zobrazí, ale generátor napíše, že PNG nejde
stáhnout, máte dvě možnosti:

- ilustraci si stáhněte do počítače a nahrajte ji tlačítkem **Ilustrace ze souboru**, nebo
- soubor ilustrace dejte přímo do repozitáře do složky `obrazky/ilustrace/` a v `ilustrace.json`
  použijte adresu `"url": "ilustrace/parni-lokomotiva.png"` – ta funguje vždy.

## Co je kde

| Soubor | K čemu je |
| --- | --- |
| `index.html` | stránka generátoru |
| `app.js` | ovládání stránky (výběr akce, ilustrace, stažení PNG) |
| `kresleni.js` | rozvržení a kreslení obrázku (barvy, rozměry, zalamování, ilustrace na zemi) – jde testovat v Node.js |
| `ilustrace.json` | seznam ilustrací (viz výše) |
| `ilustrace/` | nepovinná složka pro ilustrace uložené přímo v repozitáři |

Data akcí bere stránka z `../kalendar/akce.json` (stejný soubor jako kalendář, aktualizuje se každou noc).

## Testy

```bash
node --test testy/obrazky.test.cjs
```

```bash
node testy/obrazky-prohlizec.js složka-pro-snímky
```

První test kontroluje bez prohlížeče rozměry formátů, barvy, český zápis termínu, zalamování
textu, že ilustrace stojí na spodní linii při libovolné velikosti a posunu, seznam ilustrací
a že stránka nemá emoji, cookies ani cizí skripty. Druhý otevře stránku v Chromiu (Playwright),
vybere akci z `akce.json`, zkontroluje pixely obrázku v obou formátech a stáhne PNG
(rozměr 1200 × 630 a 1080 × 1350). Bez Playwrightu se přeskočí. Oba běží i v `bash testy/spust-testy.sh`.
