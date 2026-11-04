// Testy kostry článku „Co se děje o víkendu“.
//   node --test vikend/testy/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  vikendPro, akceVikendu, podleKraju, obsahKostry, nazevVikendu, terminAkce,
  spust, ZACATEK_KOSTRY, KONEC_KOSTRY, OVERIT,
} from '../scripts/kostra.mjs';

const akce = (nazev, zacatek, konec, kraj, navic = {}) => ({
  id: nazev, nazev, zacatek, konec, kraj, misto: `Místo ${nazev}`, obec: '', typy: [],
  url: `https://www.hravestroje.cz/kalendar-dopravnich-akci/${encodeURIComponent(nazev)}/`, popis: '', ...navic,
});

test('výběr víkendu v běžném týdnu', () => {
  const cekam = { patek: '2026-11-06', sobota: '2026-11-07', nedele: '2026-11-08' };
  for (const den of ['2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) {
    assert.deepEqual(vikendPro(den), cekam, den);
  }
  assert.equal(vikendPro('2026-11-09').patek, '2026-11-13', 'pondělí = až další víkend');
});

test('výběr víkendu přes přelom měsíce', () => {
  assert.deepEqual(vikendPro('2026-10-29'), { patek: '2026-10-30', sobota: '2026-10-31', nedele: '2026-11-01' });
  assert.equal(vikendPro('2026-11-01').patek, '2026-10-30', 'neděle 1. 11. patří k víkendu od 30. 10.');
  assert.deepEqual(vikendPro('2028-02-28'), { patek: '2028-03-03', sobota: '2028-03-04', nedele: '2028-03-05' });
  assert.deepEqual(vikendPro('2024-02-29'), { patek: '2024-03-01', sobota: '2024-03-02', nedele: '2024-03-03' }, 'přestupný rok');
  assert.equal(nazevVikendu(vikendPro('2026-10-29')), '30. října – 1. listopadu 2026');
  assert.equal(nazevVikendu(vikendPro('2026-11-05')), '6.–8. listopadu 2026');
});

test('výběr víkendu přes přelom roku', () => {
  assert.deepEqual(vikendPro('2026-12-31'), { patek: '2027-01-01', sobota: '2027-01-02', nedele: '2027-01-03' });
  assert.deepEqual(vikendPro('2027-12-30'), { patek: '2027-12-31', sobota: '2028-01-01', nedele: '2028-01-02' });
  assert.equal(vikendPro('2028-01-02').patek, '2027-12-31', 'neděle v novém roce patří k pátku ve starém');
  assert.equal(nazevVikendu(vikendPro('2027-12-30')), '31. prosince 2027 – 2. ledna 2028');
});

test('neplatné datum skončí chybou', () => {
  assert.throws(() => vikendPro('2026-02-30'), /Neplatné datum/);
  assert.throws(() => vikendPro('6. 11. 2026'), /Neplatné datum/);
});

test('vícedenní akce zasahující do víkendu', () => {
  const v = vikendPro('2026-11-05'); // 6.–8. 11. 2026
  const seznam = [
    akce('Končí v pátek', '2026-11-02', '2026-11-06', 'Zlínský kraj'),
    akce('Končí ve čtvrtek', '2026-11-02', '2026-11-05', 'Zlínský kraj'),
    akce('Začíná v neděli', '2026-11-08T10:00:00+01:00', '2026-11-12T16:00:00+01:00', 'Zlínský kraj'),
    akce('Začíná v pondělí', '2026-11-09', '2026-11-10', 'Zlínský kraj'),
    akce('Přes celý víkend', '2026-10-01', '2026-12-31', 'Zlínský kraj'),
    akce('Sobota bez konce', '2026-11-07T09:00:00+01:00', null, 'Zlínský kraj'),
    akce('Zrušená', '2026-11-07', '2026-11-07', 'Zlínský kraj', { zruseno: true }),
    akce('Přes přelom měsíce', '2026-10-30', '2026-11-01', 'Zlínský kraj'),
  ];
  assert.deepEqual(akceVikendu(seznam, v).map((a) => a.nazev).sort(),
    ['Končí v pátek', 'Přes celý víkend', 'Sobota bez konce', 'Začíná v neděli']);

  // víkend 30. 10. – 1. 11. (přelom měsíce) a 1.–3. 1. 2027 (přelom roku)
  assert.deepEqual(akceVikendu(seznam, vikendPro('2026-10-30')).map((a) => a.nazev).sort(),
    ['Přes celý víkend', 'Přes přelom měsíce']);
  const silvestr = [akce('Silvestrovský vlak', '2026-12-31T20:00:00+01:00', '2027-01-01T01:00:00+01:00', 'Zlínský kraj'),
    akce('Novoroční jízda', '2027-01-02', '2027-01-02', 'Zlínský kraj'),
    akce('Vánoční výstava', '2026-12-20', '2026-12-31', 'Zlínský kraj')];
  assert.deepEqual(akceVikendu(silvestr, vikendPro('2026-12-31')).map((a) => a.nazev),
    ['Silvestrovský vlak', 'Novoroční jízda']);

  assert.equal(terminAkce(seznam[4]), 'čt 1. 10. 2026 – čt 31. 12. 2026');
  assert.equal(terminAkce(seznam[5]), 'sobota 7. 11. 2026, od 09:00');
  assert.equal(terminAkce(akce('x', '2026-11-07T10:00:00+01:00', '2026-11-07T16:00:00+01:00')), 'sobota 7. 11. 2026, 10:00–16:00');
});

test('řazení krajů: Královéhradecký a sousední první, bez kraje nakonec', () => {
  const seznam = [
    akce('A', '2026-11-07', null, 'Zlínský kraj'),
    akce('B', '2026-11-07', null, null),
    akce('C', '2026-11-07', null, 'Pardubický kraj'),
    akce('D', '2026-11-07', null, 'Hlavní město Praha'),
    akce('E', '2026-11-07', null, 'Středočeský kraj'),
    akce('F', '2026-11-07', null, 'Liberecký kraj'),
    akce('G', '2026-11-08', null, 'Královéhradecký kraj'),
    akce('H', '2026-11-06', null, 'Královéhradecký kraj'),
    akce('I', '2026-11-07', null, 'Jihočeský kraj'),
  ];
  const skupiny = podleKraju(seznam);
  assert.deepEqual(skupiny.map((s) => s.kraj), [
    'Královéhradecký kraj', 'Pardubický kraj', 'Liberecký kraj', 'Středočeský kraj',
    'Hlavní město Praha', 'Jihočeský kraj', 'Zlínský kraj', 'Kraj neuveden',
  ]);
  assert.deepEqual(skupiny[0].akce.map((a) => a.nazev), ['H', 'G'], 'v kraji podle data');
});

test('obsah kostry: označení, tabulka, FAQ, JSON-LD jako poslední, bez stylů a emoji', () => {
  const v = vikendPro('2026-11-05');
  const seznam = [
    akce('Mikulášský vlak <speciál>', '2026-11-07T10:00:00+01:00', '2026-11-07T16:00:00+01:00', 'Pardubický kraj'),
    akce('Hradecká jízda', '2026-11-08', '2026-11-08', 'Královéhradecký kraj'),
    akce('Dlouhá výstava', '2026-10-01', '2026-12-31', 'Jihomoravský kraj'),
    akce('Mimo víkend', '2026-11-20', '2026-11-20', 'Královéhradecký kraj'),
  ];
  const { html, pocet } = obsahKostry(seznam, v);
  assert.equal(pocet, 3);
  assert.equal(html.split(OVERIT).length - 1, 3, 'každá akce má OVĚŘIT U POŘADATELE');
  assert.ok(html.includes('DOPSAT ÚVOD'));
  assert.ok(!html.includes('Mimo víkend'));
  assert.ok(html.includes('Mikulášský vlak &lt;speciál&gt;'), 'escapování');
  assert.ok(html.indexOf('Hradecká jízda') < html.indexOf('Mikulášský vlak'), 'Královéhradecký kraj první');
  assert.ok(html.indexOf('Mikulášský vlak') < html.indexOf('Dlouhá výstava'));
  assert.ok(html.includes('href="https://www.hravestroje.cz/kalendar-dopravnich-akci/Hradeck%C3%A1%20j%C3%ADzda/"'));
  assert.equal((html.match(/<tr>/g) || []).length, 4, 'hlavička + 3 řádky tabulky');
  assert.ok(/<th>Datum<\/th><th>Akce<\/th><th>Místo<\/th><th>Kraj<\/th>/.test(html));
  assert.equal((html.match(/<h3>/g) || []).length, 3 + 3, '3 akce + 3 otázky FAQ');
  assert.ok(html.includes('Časté otázky'));

  assert.ok(!/style\s*=/i.test(html), 'žádné inline styly');
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'žádné emoji');
  for (const [, trida] of html.matchAll(/class="([^"]+)"/g)) {
    for (const t of trida.split(/\s+/)) assert.ok(t.startsWith('hs-'), `třída bez předpony hs-: ${t}`);
  }

  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.ok(/<script type="application\/ld\+json">[\s\S]*<\/script>$/.test(html), 'skript je poslední prvek');
  const ld = JSON.parse(html.slice(html.indexOf('>', html.indexOf('<script')) + 1, html.lastIndexOf('</script>')));
  assert.equal(ld['@type'], 'ItemList');
  assert.equal(ld.numberOfItems, 3);
  assert.deepEqual(ld.itemListElement.map((x) => x.position), [1, 2, 3]);
  assert.equal(ld.itemListElement[0].name, 'Hradecká jízda');
  assert.ok(!html.slice(html.indexOf('<script')).includes('<speciál>'), '„<“ v JSON-LD je escapované');
});

test('víkend bez akcí vytvoří kostru s upozorněním', () => {
  const { html, pocet } = obsahKostry([], vikendPro('2026-11-05'));
  assert.equal(pocet, 0);
  assert.ok(html.includes('žádné akce'));
  assert.ok(html.includes('"numberOfItems": 0'));
});

test('spuštění zapíše kostru a seznam s tlačítkem', async () => {
  const slozka = await mkdtemp(path.join(tmpdir(), 'hs-vikend-'));
  try {
    const zdroj = path.join(slozka, 'akce.json');
    await writeFile(zdroj, JSON.stringify({ akce: [akce('Vlak', '2027-01-02', '2027-01-02', 'Liberecký kraj')] }));
    const vysledek = await spust(['--vikend', '2026-12-31', '--akce', zdroj, '--vystup', slozka]);
    assert.equal(vysledek.pocet, 1);
    const kostra = await readFile(path.join(slozka, 'kostry', '2027-01-01.html'), 'utf8');
    assert.ok(kostra.includes(ZACATEK_KOSTRY) && kostra.includes(KONEC_KOSTRY));
    const obsah = kostra.slice(kostra.indexOf(ZACATEK_KOSTRY), kostra.indexOf(KONEC_KOSTRY));
    assert.ok(obsah.includes('Vlak') && obsah.trim().endsWith('</script>'));
    const index = await readFile(path.join(slozka, 'index.html'), 'utf8');
    assert.ok(index.includes('kostry/2027-01-01.html'));
    assert.ok(index.includes('Zkopírovat HTML'));
    assert.ok(index.includes('(akcí: 1)'));
    await spust(['--dnes', '2027-01-05', '--akce', zdroj, '--vystup', slozka]);
    const index2 = await readFile(path.join(slozka, 'index.html'), 'utf8');
    assert.ok(index2.indexOf('2027-01-08') < index2.indexOf('2027-01-01'), 'nejnovější kostra nahoře');
  } finally {
    await rm(slozka, { recursive: true, force: true });
  }
});
