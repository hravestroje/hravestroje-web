// Testy bloku „Akce v okolí“ (akce-v-okoli/hs-akce-v-okoli.js) a doplnění souřadnic
// (akce-v-okoli/scripts/souradnice.mjs). Bez internetu, bez balíčků:
//   node testy/akce-v-okoli.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const KOREN = path.resolve(__dirname, '..');
const L = require(path.join(KOREN, 'akce-v-okoli/hs-akce-v-okoli.js'));

let pocetTestu = 0;
const testy = [];
const test = (nazev, fn) => testy.push([nazev, fn]);

// ---------- Ukázková data ----------
// Místo článku: Rychnov nad Kněžnou (Královéhradecký kraj)
const MISTO = { lat: 50.1629, lon: 16.2749, kraj: 'Královéhradecký kraj' };
const DNES = new Date(2026, 10, 4); // 4. 11. 2026
const W = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/';
const akce = [
  { nazev: 'Blízko pozdě', zacatek: '2026-12-20', obec: 'Kostelec nad Orlicí', kraj: 'Královéhradecký kraj', typy: ['vlaky'], url: W + 'blizko-pozde/', obrazek: 'https://example.cz/a.jpg' },
  { nazev: 'Blízko brzy', zacatek: '2026-11-08', konec: '2026-11-09', obec: 'Vamberk', kraj: 'Královéhradecký kraj', typy: ['traktory'], url: W + 'blizko-brzy/', obrazek: 'https://example.cz/b.jpg' },
  { nazev: 'Pardubice (jiný kraj, ale do 50 km)', zacatek: '2026-11-15', obec: 'Pardubice', kraj: 'Pardubický kraj', typy: ['auta'], url: W + 'pardubice/', obrazek: 'https://example.cz/c.jpg' },
  { nazev: 'Trutnov (kraj, daleko)', zacatek: '2026-11-10', obec: 'Trutnov', kraj: 'Královéhradecký kraj', typy: ['vlaky'], url: W + 'trutnov/', obrazek: 'https://example.cz/d.jpg' },
  { nazev: 'Bez souřadnic v kraji', zacatek: '2026-11-12', obec: 'Neznámá ves', kraj: 'Královéhradecký kraj', typy: [], url: W + 'nezname/', obrazek: null },
  { nazev: 'Brno (jinde)', zacatek: '2026-11-06', obec: 'Brno', kraj: 'Jihomoravský kraj', typy: ['vlaky'], url: W + 'brno/', obrazek: 'https://example.cz/e.jpg' },
  { nazev: 'Skončená', zacatek: '2026-10-01', konec: '2026-11-03', obec: 'Vamberk', kraj: 'Královéhradecký kraj', typy: [], url: W + 'skoncena/' },
  { nazev: 'Zrušená', zacatek: '2026-11-07', obec: 'Vamberk', kraj: 'Královéhradecký kraj', typy: [], url: W + 'zrusena/', zruseno: true },
  { nazev: 'Probíhá celou sezónu', zacatek: '2026-04-01', konec: '2026-12-31', obec: 'Častolovice', kraj: 'Královéhradecký kraj', typy: ['lode'], url: W + 'probiha/', obrazek: 'https://example.cz/f.jpg' },
];
const souradnice = {
  [W + 'blizko-pozde/']: { lat: 50.1228, lon: 16.2128 },   // Kostelec n. O. ~6 km
  [W + 'blizko-brzy/']: { lat: 50.1171, lon: 16.2908 },    // Vamberk ~5 km
  [W + 'pardubice/']: { lat: 50.0343, lon: 15.7812 },      // ~38 km
  [W + 'trutnov/']: { lat: 50.5610, lon: 15.9127 },        // ~52 km
  [W + 'brno/']: { lat: 49.1952, lon: 16.6069 },
  [W + 'skoncena/']: { lat: 50.1171, lon: 16.2908 },
  [W + 'zrusena/']: { lat: 50.1171, lon: 16.2908 },
  [W + 'probiha/']: { lat: 50.1530, lon: 16.1680, obrazek: 'zastupny' },
};
const nazvy = (seznam) => seznam.map((p) => p.akce.nazev);
const vyber = (o = {}) => L.vyberAkce(akce, souradnice, { ...MISTO, pocet: 4, dnes: DNES, ...o });

// ---------- Vzdálenost ----------
test('vzdálenost Praha–Brno vzdušnou čarou ≈ 185 km', () => {
  const km = L.vzdalenost(50.0756, 14.4379, 49.1952, 16.6069);
  assert.ok(km > 180 && km < 190, km);
  assert.equal(L.vzdalenost(50, 16, 50, 16), 0);
});

test('text vzdálenosti „cca 25 km“', () => {
  assert.equal(L.textVzdalenosti(23.4), 'cca 25 km');
  assert.equal(L.textVzdalenosti(27.4), 'cca 25 km');
  assert.equal(L.textVzdalenosti(47.6), 'cca 50 km');
  assert.equal(L.textVzdalenosti(6.4), 'cca 6 km');
  assert.equal(L.textVzdalenosti(0.3), 'do 2 km');
  assert.equal(L.textVzdalenosti(null), '');
});

test('akce do 50 km, akce za hranicí okruhu se nebere jako blízká', () => {
  const v = vyber({ kraj: '' }); // bez kraje = jen okruh
  assert.deepEqual(nazvy(v), ['Probíhá celou sezónu', 'Blízko brzy', 'Pardubice (jiný kraj, ale do 50 km)', 'Blízko pozdě']);
  assert.ok(v.every((p) => p.km <= 50 && p.duvod === 'okruh'));
  assert.ok(!nazvy(v).includes('Trutnov (kraj, daleko)'), 'Trutnov je ~52 km');
  const pardubice = v.find((p) => p.akce.obec === 'Pardubice');
  assert.equal(L.textVzdalenosti(pardubice.km), 'cca 40 km');
});

// ---------- Řazení ----------
test('řazení podle data, probíhající akce jako „dnes“; skončené a zrušené vynechány', () => {
  const v = vyber({ pocet: 12 });
  const n = nazvy(v);
  assert.equal(n[0], 'Probíhá celou sezónu');
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].razeni <= v[i].razeni, 'řazení podle data');
  assert.ok(!n.includes('Skončená') && !n.includes('Zrušená'));
  assert.ok(!n.includes('Brno (jinde)'), 'jiný kraj a daleko → vůbec');
});

test('stejné datum → bližší dřív', () => {
  const dve = [
    { nazev: 'Dál', zacatek: '2026-11-20', url: W + 'dal/', kraj: 'X' },
    { nazev: 'Blíž', zacatek: '2026-11-20', url: W + 'bliz/', kraj: 'X' },
  ];
  const s = { [W + 'dal/']: { lat: 50.4, lon: 16.27 }, [W + 'bliz/']: { lat: 50.2, lon: 16.27 } };
  assert.deepEqual(nazvy(L.vyberAkce(dve, s, { ...MISTO, dnes: DNES })), ['Blíž', 'Dál']);
});

test('víc termínů jednoho článku → jedna karta s nejbližším termínem', () => {
  const serie = [
    { nazev: 'Jízda B', zacatek: '2026-12-13', url: W + 'serie/', kraj: 'Královéhradecký kraj' },
    { nazev: 'Jízda A', zacatek: '2026-12-06', url: W + 'serie/', kraj: 'Královéhradecký kraj' },
  ];
  const v = L.vyberAkce(serie, {}, { ...MISTO, dnes: DNES });
  assert.deepEqual(nazvy(v), ['Jízda A']);
});

// ---------- Doplnění z kraje ----------
test('málo blízkých → doplní akce ze stejného kraje (i bez souřadnic)', () => {
  const v = vyber({ pocet: 6 });
  const n = nazvy(v);
  assert.equal(v.length, 6);
  assert.ok(n.includes('Trutnov (kraj, daleko)') && n.includes('Bez souřadnic v kraji'), n.join(', '));
  assert.equal(v.find((p) => p.akce.nazev === 'Bez souřadnic v kraji').duvod, 'kraj');
  assert.equal(v.find((p) => p.akce.nazev === 'Bez souřadnic v kraji').km, null);
  assert.ok(!n.includes('Brno (jinde)'));
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].razeni <= v[i].razeni, 'i doplněné jsou seřazené podle data');
});

test('dost blízkých → z kraje se nedoplňuje', () => {
  const v = vyber({ pocet: 3 });
  assert.ok(v.every((p) => p.duvod === 'okruh'));
  assert.deepEqual(nazvy(v), ['Probíhá celou sezónu', 'Blízko brzy', 'Pardubice (jiný kraj, ale do 50 km)']);
});

test('jen kraj (bez souřadnic místa) a kraj zapsaný bez „kraj“ a bez diakritiky', () => {
  const v = L.vyberAkce(akce, souradnice, { kraj: 'kralovehradecky', pocet: 12, dnes: DNES });
  assert.deepEqual(nazvy(v).sort(), ['Blízko brzy', 'Blízko pozdě', 'Bez souřadnic v kraji', 'Probíhá celou sezónu', 'Trutnov (kraj, daleko)'].sort());
});

test('kraj ze souradnice.json (z tabulky obcí / doplnky.json) má přednost', () => {
  const a = [{ nazev: 'Bez kraje', zacatek: '2026-11-20', url: W + 'bez-kraje/', kraj: null }];
  const v = L.vyberAkce(a, { [W + 'bez-kraje/']: { kraj: 'Královéhradecký kraj' } }, { kraj: 'Královéhradecký kraj', dnes: DNES });
  assert.deepEqual(nazvy(v), ['Bez kraje']);
});

test('nic v okolí ani v kraji → prázdný výsledek a žádné HTML (blok se nezobrazí)', () => {
  const v = L.vyberAkce(akce, souradnice, { lat: 49.0, lon: 13.5, kraj: 'Plzeňský kraj', dnes: DNES });
  assert.equal(v.length, 0);
  assert.equal(L.sestavHtml(v, { kalendar: 'x' }), '');
  assert.equal(L.vyberAkce(akce, souradnice, { dnes: DNES }).length, 0, 'bez polohy i kraje nic');
});

// ---------- Vynechání aktuálního článku ----------
test('akce z právě otevřeného článku se vynechá (i s parametry, bez lomítka, jiná doména)', () => {
  for (const aktualni of [
    W + 'blizko-brzy/',
    W + 'blizko-brzy',
    W + 'blizko-brzy/?utm_source=fb#komentare',
    'https://hravestroje.cz/kalendar-dopravnich-akci/blizko-brzy/',
    'http://localhost:8000/kalendar-dopravnich-akci/blizko-brzy/',
  ]) {
    const n = nazvy(vyber({ aktualni, pocet: 12 }));
    assert.ok(!n.includes('Blízko brzy'), aktualni);
    assert.ok(n.includes('Blízko pozdě'));
  }
  assert.ok(nazvy(vyber({ aktualni: W + 'jiny-clanek/', pocet: 12 })).includes('Blízko brzy'));
});

// ---------- Obrázek ----------
test('zástupný obrázek: "zastupny" ze souradnice.json (doplnky.json), chybějící obrázek, jinak obrázek článku', () => {
  const v = vyber({ pocet: 12 });
  const p = (n) => v.find((x) => x.akce.nazev === n);
  assert.equal(p('Probíhá celou sezónu').obrazek, '', 'obrazek: zastupny');
  assert.equal(p('Bez souřadnic v kraji').obrazek, '', 'bez obrázku');
  assert.equal(p('Blízko brzy').obrazek, 'https://example.cz/b.jpg');
  assert.equal(L.obrazekAkce({ obrazek: 'zastupny' }, {}), '', 'zastupny přímo v akce.json');
  assert.equal(L.obrazekAkce({ obrazek: 'https://x.cz/a.jpg', url: W }, { obrazek: 'https://x.cz/novy.jpg' }), 'https://x.cz/novy.jpg');
  assert.equal(L.obrazekAkce({ obrazek: 'javascript:alert(1)' }, {}), '', 'jen http(s)');

  const html = L.sestavHtml(v.slice(0, 4), { kalendar: 'https://hravestroje.github.io/hravestroje-web/kalendar/', dnes: DNES });
  const kartaProbiha = html.split('<li').find((k) => k.includes('Probíhá celou sezónu'));
  assert.ok(kartaProbiha.includes('hsa-zastupny') && kartaProbiha.includes('aria-label="Lodě"'), 'zástupný obrázek s ikonou typu');
  assert.ok(!kartaProbiha.includes('example.cz/f.jpg'), 'původní obrázek se neukáže');
  assert.ok(html.split('<li').find((k) => k.includes('Blízko brzy')).includes('<img src="https://example.cz/b.jpg"'));
});

// ---------- Karta a mřížka ----------
test('karta: datum, název, obec, „cca X km“, odkaz na článek, odkaz na kalendář, SVG místo emoji', () => {
  const v = vyber();
  const html = L.sestavHtml(v, { kalendar: 'https://hravestroje.github.io/hravestroje-web/kalendar/', dnes: DNES });
  assert.ok(html.includes('href="' + W + 'blizko-brzy/"'));
  assert.ok(html.includes('8.–9. listopadu'));
  assert.ok(html.includes('Vamberk · cca 5 km'));
  assert.ok(html.includes('probíhá do 31. prosince'));
  assert.ok(html.includes('Všechny akce v kalendáři') && html.includes('href="https://hravestroje.github.io/hravestroje-web/kalendar/"'));
  assert.ok(html.includes('<svg'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'žádné emoji');
  assert.ok(html.includes('hsa-mrizka--2'), '4 karty = 2×2');
});

test('název s HTML se escapuje', () => {
  const a = [{ nazev: '<img src=x onerror=alert(1)>', zacatek: '2026-11-20', url: W + 'xss/', kraj: 'K' }];
  const html = L.sestavHtml(L.vyberAkce(a, {}, { kraj: 'K', dnes: DNES }), { kalendar: '/k/', dnes: DNES });
  assert.ok(!html.includes('<img src=x') && html.includes('&lt;img'));
});

test('mřížka bez poloprázdné řady', () => {
  const m = (n) => { const x = L.mrizka(n); return x.karet + '/' + x.sloupcu; };
  assert.equal(m(0), '0/0');
  assert.equal(m(1), '1/1');
  assert.equal(m(2), '2/2');
  assert.equal(m(3), '3/3');
  assert.equal(m(4), '4/2');
  assert.equal(m(5), '4/2');
  assert.equal(m(6), '6/3');
  assert.equal(m(7), '6/3');
  assert.equal(m(8), '8/2');
  for (let n = 1; n <= 12; n++) { const x = L.mrizka(n); assert.equal(x.karet % x.sloupcu, 0, 'n=' + n); }
});

test('datum: jeden den, rozsah přes měsíce i přes rok', () => {
  const p = (z, k) => ({ zacatek: new Date(z[0], z[1] - 1, z[2]), konec: new Date(k[0], k[1] - 1, k[2]) });
  assert.equal(L.textData(p([2026, 11, 7], [2026, 11, 7]), DNES), 'so 7. listopadu');
  assert.equal(L.textData(p([2026, 11, 28], [2026, 12, 6]), DNES), '28. listopadu – 6. prosince');
  assert.equal(L.textData(p([2026, 12, 30], [2027, 1, 2]), DNES), '30. prosince 2026 – 2. ledna 2027');
  assert.equal(L.textData(p([2027, 3, 1], [2027, 3, 1]), DNES), 'po 1. března 2027');
});

// ---------- Souřadnice obcí (souradnice.mjs) ----------
test('souradnice.mjs: obec z tabulky, Praha 6, Brno-Husovice, PSČ, kraj, doplnky, ruční souřadnice', async () => {
  const S = await import(pathToFileURL(path.join(KOREN, 'akce-v-okoli/scripts/souradnice.mjs')).href);
  const obce = S.prectiObce(fs.readFileSync(path.join(KOREN, 'akce-v-okoli/data/obce.csv'), 'utf8'));
  assert.ok(obce.size > 5000, 'tabulka obcí má přes 5000 různých názvů');
  const najdi = (a) => S.najdiObec(a, obce);
  assert.equal(najdi({ obec: 'Praha 6', kraj: 'Hlavní město Praha' }).obec.obec, 'Praha');
  assert.equal(najdi({ obec: 'Praha 7 – Holešovice', kraj: 'Hlavní město Praha' }).obec.obec, 'Praha');
  assert.equal(najdi({ obec: 'Brno-Husovice', kraj: 'Jihomoravský kraj' }).obec.obec, 'Brno');
  assert.equal(najdi({ obec: 'Lužná u Rakovníka', kraj: 'Středočeský kraj' }).obec.okres, 'Rakovník');
  assert.equal(najdi({ obec: 'Lužná', kraj: null, adresa: 'Stará správa 72, 270 51 Lužná' }).obec.okres, 'Rakovník', 'PSČ rozliší');
  assert.equal(najdi({ obec: 'Vinařice', kraj: null, adresa: 'Vinařice 56, 273 07 Vinařice' }).obec.okres, 'Kladno');
  assert.equal(najdi({ obec: '', kraj: 'Plzeňský kraj', adresa: 'Přestavlky 47' }).obec.obec, 'Přestavlky', 'z adresy');
  assert.equal(najdi({ obec: 'ceska trebova' }).obec.kraj, 'Pardubický kraj', 'bez diakritiky');
  assert.ok(najdi({ obec: 'Zbýšov', kraj: 'Jihomoravský kraj' }).chyba.includes('2×'), 'nejednoznačné → bez souřadnic');
  assert.ok(najdi({ obec: 'Dresden' }).chyba);

  const vstup = [
    { nazev: 'A', url: W + 'a/', obec: 'Česká Třebová', kraj: null, obrazek: 'https://x.cz/a.jpg' },
    { nazev: 'B', url: W + 'b/', obec: 'Dresden', kraj: null },
    { nazev: 'C', url: W + 'c/', obec: 'Zbýšov', kraj: 'Jihomoravský kraj' },
    { nazev: 'C2', url: W + 'c/', obec: 'Zbýšov', kraj: 'Jihomoravský kraj' },
  ];
  const doplnky = { [W + 'a/']: { obrazek: 'zastupny' }, [W + 'b/']: { kraj: 'Ústecký kraj', obrazek: 'https://x.cz/nove.jpg' } };
  const rucni = { [W + 'c/']: { lat: 49.1553, lon: 16.3496 } };
  const { akce: v, statistika } = S.sestavSouradnice(vstup, obce, doplnky, rucni);
  assert.equal(v[W + 'a/'].kraj, 'Pardubický kraj', 'kraj z tabulky obcí');
  assert.equal(v[W + 'a/'].obrazek, 'zastupny');
  assert.ok(Math.abs(v[W + 'a/'].lat - 49.89) < 0.05);
  assert.deepEqual(v[W + 'b/'], { kraj: 'Ústecký kraj', obrazek: 'https://x.cz/nove.jpg' }, 'bez souřadnic, jen kraj a obrázek');
  assert.deepEqual(v[W + 'c/'], { lat: 49.1553, lon: 16.3496 }, 'ruční souřadnice');
  assert.equal(statistika.celkem, 3, 'jeden článek se počítá jednou');
  assert.equal(statistika.bez.length, 1);
});

test('souradnice.mjs nevolá síť (žádný fetch/http v kódu)', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'akce-v-okoli/scripts/souradnice.mjs'), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/\bfetch\s*\(|node:https?|require\(['"]https?/.test(kod));
});

test('hs-akce-v-okoli.js: bez cookies a cizích knihoven', () => {
  const kod = fs.readFileSync(path.join(KOREN, 'akce-v-okoli/hs-akce-v-okoli.js'), 'utf8');
  assert.ok(!/document\.cookie|localStorage|sessionStorage/.test(kod));
  assert.ok(kod.includes("credentials: 'omit'"));
  assert.ok(!/<script|import\s|require\(/.test(kod));
});

(async () => {
  let chyby = 0;
  for (const [nazev, fn] of testy) {
    try {
      await fn();
      pocetTestu++;
      console.log('OK: ' + nazev);
    } catch (e) {
      chyby++;
      console.error('CHYBA: ' + nazev + '\n  ' + (e && e.stack || e));
    }
  }
  if (chyby) {
    console.error(`\n${chyby} z ${testy.length} testů selhalo.`);
    process.exit(1);
  }
  console.log(`\nAkce v okolí: všech ${pocetTestu} testů prošlo.`);
})();
