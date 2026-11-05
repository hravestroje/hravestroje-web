// Testy uspořádání seznamu kalendáře (kalendar/logika.js → sestavSeznam) a navazujících částí:
//  1) jeden souvislý seznam přísně podle data, probíhající akce (≤ 7 dní) pod „Dnes“ s dnešním datem
//  2) dlouhodobé akce (> 7 dní) zvlášť – ne v chronologickém seznamu
//  3) konkrétní dny konání ("dny", "dny_v_tydnu" z doplnky.json) a filtry Dnes / Víkend / Měsíc
//  4) hs-kalendar.js: přednastavený filtr data-kraj / data-typ, sekce dlouhodobých akcí v HTML
// Vše i přes přelom měsíce a roku.  Spouštět:  TZ=Europe/Prague node testy/kalendar-seznam.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const KOREN = path.join(__dirname, '..');
const L = require(path.join(KOREN, 'kalendar', 'logika.js'));
const H = require(path.join(KOREN, 'kalendar', 'hs-kalendar.js'));
const K = H.vytvor(L);

const testy = [];
const test = (nazev, fn) => testy.push([nazev, fn]);
const iso = (d) => L.isoDen(d);
const stav = (x) => Object.assign(L.prazdnyStav(), x || {});
// Seznam jako text: „skupina: název@den“ – přehledné porovnání pořadí
function prehled(akce, ted, s) {
  const sez = L.sestavSeznam(L.filtruj(akce, stav(s), ted), stav(s), ted);
  return {
    skupiny: sez.skupiny.map((g) => g.nazev + ': ' + g.polozky.map((p) => p.akce.nazev + '@' + iso(p.den)).join(', ')),
    dlouhodobe: sez.dlouhodobe.map((a) => a.nazev),
    sez,
  };
}

// ---------- 1) Řazení ----------
const TED = new Date(2026, 10, 4, 12, 0); // středa 4. 11. 2026, poledne
const DATA = { akce: [
  { id: 'a1', nazev: 'Zubačka', zacatek: '2026-10-03', konec: '2026-12-30', typy: ['vlaky'] },
  { id: 'a2', nazev: 'Halloween zahrada', zacatek: '2026-10-28', konec: '2026-11-08', typy: ['ostatni'] },
  { id: 'a3', nazev: 'Legiovlak', zacatek: '2026-11-03', konec: '2026-11-08', typy: ['vlaky'] },
  { id: 'a4', nazev: 'Výstava (7 dní, od 29. 10.)', zacatek: '2026-10-29', konec: '2026-11-04', typy: ['vlaky'] },
  { id: 'a5', nazev: 'Odpolední jízda', zacatek: '2026-11-04T14:00:00+01:00', konec: '2026-11-04T16:00:00+01:00', typy: ['vlaky'] },
  { id: 'a6', nazev: 'Dopolední jízda', zacatek: '2026-11-04T09:30:00+01:00', typy: ['auta'] },
  { id: 'a7', nazev: 'Zítřejší jízda', zacatek: '2026-11-05', typy: ['vlaky'] },
  { id: 'a8', nazev: 'Víkendová plavba', zacatek: '2026-11-07', konec: '2026-11-08', typy: ['lode'] },
  { id: 'a9', nazev: 'Týdenní výstava od zítřka (7 dní)', zacatek: '2026-11-05', konec: '2026-11-11', typy: ['vlaky'] },
  { id: 'a10', nazev: 'Dlouhá výstava od pátku (8 dní)', zacatek: '2026-11-06', konec: '2026-11-13', typy: ['vlaky'] },
  { id: 'a11', nazev: 'Mikulášská jízda', zacatek: '2026-12-05', typy: ['vlaky'] },
  { id: 'a12', nazev: 'Skončila včera', zacatek: '2026-11-01', konec: '2026-11-03', typy: ['auta'] },
] };
const AKCE = L.pripravAkce(DATA, TED);

test('délka akce a hranice 7 dní', () => {
  const a = (id) => AKCE.find((x) => x.id === id);
  assert.equal(L.delkaDni(a('a4')), 7);
  assert.equal(L.delkaDni(a('a9')), 7);
  assert.equal(L.delkaDni(a('a10')), 8);
  assert.equal(L.delkaDni(a('a6')), 1);
  assert.equal(L.jeDlouhodoba(a('a4')), false, '7 dní = ještě ne dlouhodobá');
  assert.equal(L.jeDlouhodoba(a('a10')), true, '8 dní = dlouhodobá');
  assert.equal(L.jeDlouhodoba(a('a1')), true);
});

test('jeden souvislý seznam podle data; probíhající pod „Dnes“ s dnešním datem', () => {
  const { skupiny, sez } = prehled(AKCE, TED);
  assert.deepEqual(skupiny, [
    'Dnes: Výstava (7 dní, od 29. 10.)@2026-11-04, Legiovlak@2026-11-04, Dopolední jízda@2026-11-04, Odpolední jízda@2026-11-04',
    'listopad 2026: Zítřejší jízda@2026-11-05, Týdenní výstava od zítřka (7 dní)@2026-11-05, Víkendová plavba@2026-11-07',
    'prosinec 2026: Mikulášská jízda@2026-12-05',
  ]);
  const dnes = sez.skupiny[0].polozky;
  assert.deepEqual(dnes.map((p) => p.probiha), [true, true, false, false], 'probíhá jen to, co začalo před dneškem');
  assert.ok(dnes.every((p) => iso(p.den) === '2026-11-04'), 'na kartě dnešní datum');
  assert.equal(L.stitekProbiha(dnes[0].akce, TED), 'probíhá do 4. listopadu');
  assert.equal(L.stitekProbiha(dnes[1].akce, TED), 'probíhá do 8. listopadu');
  // stejný den: probíhající dřív (podle začátku), pak podle času; stejný začátek → dřív končící
  // pořadí je přísně podle zobrazeného data
  const vse = sez.skupiny.flatMap((g) => g.polozky.map((p) => +p.den));
  assert.deepEqual(vse, [...vse].sort((a, b) => a - b));
  // žádná samostatná sekce „Právě probíhá“
  assert.ok(!sez.skupiny.some((g) => /probíhá/i.test(g.nazev)));
});

test('dlouhodobé akce (> 7 dní) jen v samostatné sekci, se štítkem od–do', () => {
  const { skupiny, dlouhodobe } = prehled(AKCE, TED);
  assert.deepEqual(dlouhodobe, ['Zubačka', 'Halloween zahrada', 'Dlouhá výstava od pátku (8 dní)']);
  for (const n of dlouhodobe) assert.ok(!skupiny.join('|').includes(n), n + ' nesmí být v chronologickém seznamu');
  const zubacka = AKCE.find((a) => a.id === 'a1');
  assert.equal(L.stitekOdDo(zubacka, TED), 'od 3. října do 30. prosince');
  const pres = L.pripravAkce({ akce: [{ nazev: 'X', zacatek: '2026-12-20', konec: '2027-01-10' }] }, TED)[0];
  assert.equal(L.stitekOdDo(pres, TED), 'od 20. prosince do 10. ledna 2027', 'přes Nový rok s rokem');
});

test('filtry data: probíhající pod začátkem termínu, dlouhodobé jen překrývající se', () => {
  // víkend 7.–8. 11.: Legiovlak (3.–8.) je od soboty, Halloween (do 8.) i Zubačka a Dlouhá výstava v dlouhodobých
  let p = prehled(AKCE, TED, { kdy: 'vikend' });
  assert.deepEqual(p.skupiny, ['listopad 2026: Legiovlak@2026-11-07, Týdenní výstava od zítřka (7 dní)@2026-11-07, Víkendová plavba@2026-11-07']);
  assert.deepEqual(p.dlouhodobe, ['Zubačka', 'Halloween zahrada', 'Dlouhá výstava od pátku (8 dní)']);
  // dnes: jen dnešní; Dlouhá výstava (od pátku) ne
  p = prehled(AKCE, TED, { kdy: 'dnes' });
  assert.equal(p.skupiny.length, 1);
  assert.ok(p.skupiny[0].startsWith('Dnes: '));
  assert.deepEqual(p.dlouhodobe, ['Zubačka', 'Halloween zahrada']);
  // příští měsíc: jen prosinec, z dlouhodobých jen Zubačka
  p = prehled(AKCE, TED, { kdy: 'pristi-mesic' });
  assert.deepEqual(p.skupiny, ['prosinec 2026: Mikulášská jízda@2026-12-05']);
  assert.deepEqual(p.dlouhodobe, ['Zubačka']);
});

test('přelom měsíce: probíhající z října pod „Dnes“, listopad zvlášť', () => {
  const ted = new Date(2026, 9, 31, 9, 0); // sobota 31. 10. 2026
  const akce = L.pripravAkce({ akce: [
    { id: 'p1', nazev: 'Říjen–listopad (4 dny)', zacatek: '2026-10-29', konec: '2026-11-01' },
    { id: 'p2', nazev: 'Dušičková jízda', zacatek: '2026-11-01' },
    { id: 'p3', nazev: 'Halloween dnes', zacatek: '2026-10-31' },
    { id: 'p4', nazev: 'Přes měsíc od zítřka (3 dny)', zacatek: '2026-11-01', konec: '2026-11-03' },
  ] }, ted);
  const p = prehled(akce, ted);
  assert.deepEqual(p.skupiny, [
    'Dnes: Říjen–listopad (4 dny)@2026-10-31, Halloween dnes@2026-10-31',
    'listopad 2026: Dušičková jízda@2026-11-01, Přes měsíc od zítřka (3 dny)@2026-11-01',
  ]);
  assert.equal(L.stitekProbiha(p.sez.skupiny[0].polozky[0].akce, ted), 'probíhá do 1. listopadu');
  // filtr „Tento měsíc“ 31. 10. = jen dnešek; „Příští měsíc“ = listopad (probíhající od 1. 11.)
  assert.deepEqual(prehled(akce, ted, { kdy: 'mesic' }).skupiny, ['Dnes: Říjen–listopad (4 dny)@2026-10-31, Halloween dnes@2026-10-31']);
  assert.deepEqual(prehled(akce, ted, { kdy: 'pristi-mesic' }).skupiny,
    ['listopad 2026: Říjen–listopad (4 dny)@2026-11-01, Dušičková jízda@2026-11-01, Přes měsíc od zítřka (3 dny)@2026-11-01']);
});

test('přelom roku: Silvestr pod „Dnes“, leden 2027 jako další skupina', () => {
  const ted = new Date(2026, 11, 31, 20, 0);
  const akce = L.pripravAkce({ akce: [
    { nazev: 'Silvestrovská (30. 12.–1. 1.)', zacatek: '2026-12-30', konec: '2027-01-01' },
    { nazev: 'Novoroční', zacatek: '2027-01-01T13:00:00+01:00' },
  ] }, ted);
  const p = prehled(akce, ted);
  assert.deepEqual(p.skupiny, ['Dnes: Silvestrovská (30. 12.–1. 1.)@2026-12-31', 'leden 2027: Novoroční@2027-01-01']);
  assert.equal(L.stitekProbiha(akce[0], ted), 'probíhá do 1. ledna 2027');
});

// ---------- 3) Konkrétní dny ----------
const TED2 = new Date(2026, 10, 4, 12, 0); // středa 4. 11. 2026
const DNY = L.pripravAkce({ akce: [
  { id: 'd1', nazev: 'Zubačka o víkendech', zacatek: '2026-10-03', konec: '2026-12-30', dny_v_tydnu: ['so', 'ne'], typy: ['vlaky'] },
  { id: 'd2', nazev: 'Mikulášské vlaky', zacatek: '2026-11-28', konec: '2026-12-06', dny: ['2026-12-06', '2026-11-28', '2026-11-29', 'nesmysl', '2026-12-05', '2026-11-28'] },
  { id: 'd3', nazev: 'Dnes a v pátek', zacatek: '2026-11-01', konec: '2026-11-30', dny: ['2026-11-01', '2026-11-04', '2026-11-06'] },
  { id: 'd4', nazev: 'Jen minulé dny', zacatek: '2026-11-01', konec: '2026-11-30', dny: ['2026-11-01', '2026-11-02'] },
  { id: 'd5', nazev: 'Úterky', zacatek: '2026-11-01', konec: '2026-11-11', dny_v_tydnu: ['Úterý'] },
] }, TED2);
const d = (id) => DNY.find((a) => a.id === id);

test('dny a dny_v_tydnu: načtení, řazení, neplatné hodnoty, skončené', () => {
  assert.deepEqual(d('d2')._dny.map(iso), ['2026-11-28', '2026-11-29', '2026-12-05', '2026-12-06'], 'seřazené, bez duplicit a neplatných');
  assert.equal(iso(d('d2')._z), '2026-11-28');
  assert.ok(!DNY.some((a) => a.id === 'd4'), 'akce, jejíž všechny dny jsou pryč, se vyřadí');
  assert.deepEqual(Object.keys(d('d1')._dnyTydne).sort(), ['0', '6']);
  assert.deepEqual(L.prectiDnyVTydnu(['sobota', 'NE', 'pá', 'xx']), { 6: true, 0: true, 5: true });
  assert.equal(L.prectiDnyVTydnu(['xx']), null);
  assert.equal(L.jeDlouhodoba(d('d1')), false, 'akce s konkrétními dny nepatří mezi dlouhodobé');
  assert.deepEqual(L.dnyKonani(d('d5'), TED2, null).map(iso), ['2026-11-10'], 'úterky jen do konce akce');
});

test('akce s konkrétními dny je v seznamu v každý takový den (s dalším termínem)', () => {
  const { skupiny, dlouhodobe, sez } = prehled(DNY, TED2, { mesic: '2026-11' });
  assert.deepEqual(dlouhodobe, []);
  assert.deepEqual(skupiny, [
    'Dnes: Dnes a v pátek@2026-11-04',
    'listopad 2026: Dnes a v pátek@2026-11-06, Zubačka o víkendech@2026-11-07, Zubačka o víkendech@2026-11-08, Úterky@2026-11-10, ' +
      'Zubačka o víkendech@2026-11-14, Zubačka o víkendech@2026-11-15, Zubačka o víkendech@2026-11-21, Zubačka o víkendech@2026-11-22, ' +
      'Zubačka o víkendech@2026-11-28, Mikulášské vlaky@2026-11-28, Zubačka o víkendech@2026-11-29, Mikulášské vlaky@2026-11-29',
  ]);
  const prvni = sez.skupiny[0].polozky[0];
  assert.equal(iso(prvni.dalsiDen), '2026-11-06');
  assert.equal(L.formatDenKonani(prvni.dalsiDen, TED2), 'pátek 6. listopadu');
  const posledniMikulas = sez.skupiny[1].polozky.filter((p) => p.akce.id === 'd2').pop();
  assert.equal(iso(posledniMikulas.dalsiDen), '2026-12-05', 'další termín i v dalším měsíci');
});

test('filtry Dnes / Víkend / Měsíc se řídí jen dny konání', () => {
  const nazvy = (s, ted = TED2) => L.filtruj(DNY, stav(s), ted).map((a) => a.nazev).sort();
  assert.deepEqual(nazvy({ kdy: 'dnes' }), ['Dnes a v pátek']);
  assert.deepEqual(nazvy({ kdy: 'zitra' }), [], 'čtvrtek: nic (Zubačka jen o víkendu, i když trvá)');
  assert.deepEqual(nazvy({ kdy: 'vikend' }), ['Zubačka o víkendech']);
  assert.deepEqual(nazvy({ kdy: 'tyden' }), ['Dnes a v pátek', 'Zubačka o víkendech']);
  assert.deepEqual(nazvy({ kdy: 'pristi-mesic' }), ['Mikulášské vlaky', 'Zubačka o víkendech']);
  assert.deepEqual(nazvy({ od: '2026-11-09', do: '2026-11-13' }), ['Úterky']);
  // víkend: jen sobota a neděle, ne pátek
  const v = prehled(DNY, TED2, { kdy: 'vikend' });
  assert.deepEqual(v.skupiny, ['listopad 2026: Zubačka o víkendech@2026-11-07, Zubačka o víkendech@2026-11-08']);
  // přelom měsíce: v neděli 29. 11. je „Tento měsíc“ jen 29. 11., „Příští měsíc“ jen prosincové dny
  const ned = new Date(2026, 10, 29, 10, 0);
  const akce = L.pripravAkce({ akce: [{ id: 'm', nazev: 'Mikulášské vlaky', zacatek: '2026-11-28', dny: ['2026-11-28', '2026-11-29', '2026-12-05', '2026-12-06'] }] }, ned);
  assert.deepEqual(prehled(akce, ned, { kdy: 'mesic' }).skupiny, ['Dnes: Mikulášské vlaky@2026-11-29']);
  assert.deepEqual(prehled(akce, ned, { kdy: 'pristi-mesic' }).skupiny, ['prosinec 2026: Mikulášské vlaky@2026-12-05, Mikulášské vlaky@2026-12-06']);
  assert.deepEqual(prehled(akce, ned, { kdy: 'vikend' }).skupiny, ['Dnes: Mikulášské vlaky@2026-11-29'], 'neděle = aktuální víkend');
});

// ---------- Dlaždice produktu: obrázky ----------
test('obrázky produktu: pole "obrazky", jinak "obrazek"; jen bezpečné adresy, bez duplicit, nejvýš 5', () => {
  assert.deepEqual(L.obrazkyProduktu({ obrazek: 'https://x.cz/a.jpg' }), ['https://x.cz/a.jpg']);
  assert.deepEqual(L.obrazkyProduktu({ obrazek: 'https://x.cz/a.jpg', obrazky: ['https://x.cz/b.jpg', 'https://x.cz/c.jpg'] }),
    ['https://x.cz/b.jpg', 'https://x.cz/c.jpg'], '"obrazky" má přednost');
  assert.deepEqual(L.obrazkyProduktu({ obrazek: 'https://x.cz/a.jpg', obrazky: [] }), ['https://x.cz/a.jpg'], 'prázdné pole → obrazek');
  assert.deepEqual(L.obrazkyProduktu({ obrazek: 'https://x.cz/a.jpg', obrazky: ['javascript:alert(1)', null, 5] }), ['https://x.cz/a.jpg'],
    'žádný platný v "obrazky" → obrazek');
  assert.deepEqual(L.obrazkyProduktu({ obrazky: ['https://x.cz/1.jpg', 'https://x.cz/1.jpg', 'https://x.cz/2.jpg', 'https://x.cz/3.jpg',
    'https://x.cz/4.jpg', 'https://x.cz/5.jpg', 'https://x.cz/6.jpg'] }).length, 5);
  assert.deepEqual(L.obrazkyProduktu({}), []);
  assert.deepEqual(L.obrazkyProduktu(null), []);
});

// ---------- doplnky.json → akce.json ----------
test('stahni-akce.mjs: "dny" a "dny_v_tydnu" z doplnky.json se přenesou do akce.json', async () => {
  const S = await import(pathToFileURL(path.join(KOREN, 'kalendar', 'scripts', 'stahni-akce.mjs')).href);
  const log = console.log; const zpravy = []; console.log = (m) => zpravy.push(String(m));
  try {
    const a = S.pouzijDoplnek({ url: 'https://x/', zacatek: '2026-11-01', typy: ['vlaky'] },
      { dny: ['2026-11-08', '2026-11-07', '2026-02-30', '7. 11.'], dny_v_tydnu: ['Sobota', 'ne', 'xx'] });
    assert.deepEqual(a.dny, ['2026-11-07', '2026-11-08']);
    assert.deepEqual(a.dny_v_tydnu, ['so', 'ne']);
    assert.ok(zpravy.some((z) => z.includes('Neplatné datum') && z.includes('2026-02-30') && z.includes('7. 11.')), zpravy.join('\n'));
    assert.ok(zpravy.some((z) => z.includes('Neznámý den') && z.includes('xx')));
    const b = S.pouzijDoplnek({ url: 'https://x/', zacatek: '2026-11-01' }, { kraj: 'Zlínský kraj' });
    assert.ok(!('dny' in b) && !('dny_v_tydnu' in b), 'bez doplnku nic navíc');
    assert.equal(S.normalizujDny([]), null);
  } finally { console.log = log; }
});

// ---------- 4) hs-kalendar.js ----------
test('hs-kalendar: předvolba data-kraj / data-typ (i bez diakritiky a bez „kraj“)', () => {
  assert.deepEqual(H.predvolba('Královéhradecký kraj', 'traktory', L.TYPY), { kraj: 'Královéhradecký kraj', typ: 'traktory' });
  assert.deepEqual(H.predvolba('kralovehradecky', 'Traktory', L.TYPY), { kraj: 'Královéhradecký kraj', typ: 'traktory' });
  assert.deepEqual(H.predvolba('Vysočina', 'Lodě', L.TYPY), { kraj: 'Kraj Vysočina', typ: 'lode' });
  assert.deepEqual(H.predvolba('Praha', '', L.TYPY), { kraj: 'Hlavní město Praha', typ: '' });
  assert.deepEqual(H.predvolba('Neexistující kraj', 'ponorky', L.TYPY), { kraj: '', typ: '' });
  assert.deepEqual(H.predvolba(null, null, L.TYPY), { kraj: '', typ: '' });
  const pred = { kraj: 'Zlínský kraj', typ: 'vlaky' };
  let s = H.pocatecniStav(L, '', pred);
  assert.equal(s.kraj, 'Zlínský kraj'); assert.equal(s.typ, 'vlaky');
  s = H.pocatecniStav(L, '?kraj=Jihomoravsk%C3%BD+kraj&kdy=vikend', pred);
  assert.equal(s.kraj, 'Jihomoravský kraj', 'sdílený odkaz má přednost'); assert.equal(s.typ, 'vlaky'); assert.equal(s.kdy, 'vikend');
  s = H.pocatecniStav(L, '?kraj=&typ=', pred);
  assert.equal(s.kraj, ''); assert.equal(s.typ, '', 'prázdný parametr = „Všechny“');
});

test('hs-kalendar: HTML – „Dnes“, štítek „probíhá do“, sbalená sekce dlouhodobých bez reklam, id jen jednou', () => {
  const html = K.seznamHtml(L.filtruj(AKCE.concat(DNY), stav(), TED), { ted: TED, stav: stav(), mon: null, reklamaKazda: 3 });
  const [chrono, dlouhe] = html.split('<details');
  assert.ok(dlouhe, 'sekce dlouhodobých akcí');
  assert.ok(/^ class="hs-kal-skupina-akci hs-kal-dlouhodobe" id="hs-kal-dlouhodobe">/.test(dlouhe), 'sbalená (bez open), když nad ní jsou akce');
  assert.ok(dlouhe.includes('Sezónní a dlouhodobé akce'));
  assert.ok(dlouhe.includes('od 3. října do 30. prosince'));
  assert.ok(!dlouhe.includes('hs-kal-reklama'), 've sbalené sekci reklama není');
  assert.ok(chrono.includes('hs-kal-reklama'));
  assert.ok(chrono.indexOf('<h2 class="hs-kal-mesic">Dnes</h2>') >= 0);
  assert.ok(chrono.includes('probíhá do 8. listopadu'));
  assert.ok(!html.includes('Právě probíhá'));
  assert.ok(!chrono.includes('>Zubačka<'), 'Zubačka (bez dnů) jen v dlouhodobých');
  assert.ok(chrono.includes('další termín'), 'akce s konkrétními dny má další termín');
  const idcka = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(new Set(idcka).size, idcka.length, 'žádné duplicitní id');
  const tridy = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  assert.deepEqual([...tridy].filter((t) => !t.startsWith('hs-kal-')), []);
  // jen dlouhodobé → sekce rozbalená
  const jen = K.seznamHtml(L.filtruj(AKCE, stav({ q: 'zubacka' }), TED), { ted: TED, stav: stav({ q: 'zubacka' }), mon: null, reklamaKazda: 8 });
  assert.ok(jen.startsWith('<details') && /id="hs-kal-dlouhodobe" open>/.test(jen));
});

(async () => {
  for (const [nazev, fn] of testy) {
    try { await fn(); } catch (e) {
      console.error('CHYBA v testu „' + nazev + '“:\n', e.message);
      process.exit(1);
    }
  }
  console.log(`OK: ${testy.length} testů seznamu kalendáře (řazení podle data, Dnes, dlouhodobé akce, konkrétní dny, přelom měsíce, data-kraj/data-typ, obrázky produktu)`);
})();
