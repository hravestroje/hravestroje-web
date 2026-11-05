// Testy mapy akcí (mapa/hs-mapa.js) – logika bez prohlížeče, bez internetu, bez balíčků:
//   node testy/mapa.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const KOREN = path.resolve(__dirname, '..');
const M = require(path.join(KOREN, 'mapa/hs-mapa.js'));
const { W, akce, souradnice } = require('./mapa-data.cjs');

const testy = [];
const test = (nazev, fn) => testy.push([nazev, fn]);
const DNES = new Date(2026, 10, 4); // středa 4. 11. 2026
const priprav = () => M.pripravAkce(akce, souradnice, DNES);
const nazvy = (seznam) => seznam.map((p) => p.nazev);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- Příprava dat ----------
test('jen nadcházející a probíhající akce se souřadnicemi, seřazené podle data', () => {
  const { polozky, bezMista } = priprav();
  assert.deepEqual(nazvy(polozky), [
    'Výstava v depu Liberec',   // probíhá → řadí se jako dnes
    'Mikulášský vlak Praha',
    'Letecký den Ostrava',
    'Sraz veteránů Praha',
    'Traktoriáda Plzeň',
    'Plavba po Svratce',
    'Zimní <b>vlak</b> "Olomouc"',
  ]);
  assert.equal(bezMista, 1, 'akce bez souřadnic se počítá zvlášť');
});

test('skončená, zrušená a akce s nebezpečným odkazem se vynechají', () => {
  const n = nazvy(priprav().polozky);
  for (const x of ['Skončená akce', 'Zrušená akce', 'Podvodný odkaz', 'Akce bez souřadnic']) assert.ok(!n.includes(x), x);
});

test('kraj se doplní ze souradnice.json, akce bez typu je „ostatni“', () => {
  const liberec = priprav().polozky.find((p) => p.obec === 'Liberec');
  assert.equal(liberec.kraj, 'Liberecký kraj');
  assert.deepEqual(liberec.typy, ['ostatni']);
  assert.equal(liberec.typ, 'ostatni');
});

test('neznámý typ se ignoruje, víc typů zůstane', () => {
  const { polozky } = M.pripravAkce([{ nazev: 'X', zacatek: '2026-12-01', url: W + 'x/', typy: ['nesmysl', 'lode', 'vlaky', 'lode'] }],
    { [W + 'x/']: { lat: 50, lon: 15 } }, DNES);
  assert.deepEqual(polozky[0].typy, ['lode', 'vlaky']);
});

test('špatné souřadnice a datum se přeskočí', () => {
  const { polozky, bezMista } = M.pripravAkce([
    { nazev: 'A', zacatek: '2026-12-01', url: W + 'a/' },
    { nazev: 'B', zacatek: '2026-02-31', url: W + 'b/' },
    { nazev: 'C', zacatek: '2026-12-01', url: W + 'c/' },
  ], { [W + 'a/']: { lat: 'x', lon: 15 }, [W + 'b/']: { lat: 50, lon: 15 }, [W + 'c/']: { lat: 120, lon: 15 } }, DNES);
  assert.equal(polozky.length, 0);
  assert.equal(bezMista, 2);
});

test('vstup bez dat nespadne', () => {
  assert.deepEqual(M.pripravAkce(null, null, DNES), { polozky: [], bezMista: 0 });
  assert.deepEqual(M.seskup([]), []);
  assert.deepEqual(M.filtruj(null, {}, DNES), []);
});

// ---------- Filtr „kdy“ ----------
const rozsah = (kdy, d) => { const r = M.rozsahKdy(kdy, d); return r && [iso(r.od), iso(r.do)]; };

test('tento víkend: v pracovní den nadcházející sobota a neděle', () => {
  assert.deepEqual(rozsah('vikend', DNES), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 2)), ['2026-11-07', '2026-11-08']); // pondělí
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 6, 23, 30)), ['2026-11-07', '2026-11-08']); // pátek večer
});

test('tento víkend: v sobotu od dneška, v neděli jen neděle', () => {
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 7, 9)), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 8, 18)), ['2026-11-08', '2026-11-08']);
});

test('víkend přes přelom měsíce a roku', () => {
  assert.deepEqual(rozsah('vikend', new Date(2026, 9, 29)), ['2026-10-31', '2026-11-01']);
  assert.deepEqual(rozsah('vikend', new Date(2027, 0, 1)), ['2027-01-02', '2027-01-03']);
});

test('tento měsíc: od dneška do konce měsíce (i prosinec, únor)', () => {
  assert.deepEqual(rozsah('mesic', DNES), ['2026-11-04', '2026-11-30']);
  assert.deepEqual(rozsah('mesic', new Date(2026, 11, 31)), ['2026-12-31', '2026-12-31']);
  assert.deepEqual(rozsah('mesic', new Date(2028, 1, 10)), ['2028-02-10', '2028-02-29']);
});

test('vše = bez omezení', () => {
  assert.equal(M.rozsahKdy('vse', DNES), null);
  assert.equal(M.rozsahKdy('', DNES), null);
});

// ---------- Filtry ----------
const filtr = (f) => nazvy(M.filtruj(priprav().polozky, f, DNES));

test('filtr kdy: víkend bere i vícedenní probíhající akci', () => {
  assert.deepEqual(filtr({ kdy: 'vikend' }), ['Výstava v depu Liberec', 'Mikulášský vlak Praha', 'Letecký den Ostrava']);
});

test('filtr kdy: tento měsíc', () => {
  assert.deepEqual(filtr({ kdy: 'mesic' }), ['Výstava v depu Liberec', 'Mikulášský vlak Praha', 'Letecký den Ostrava',
    'Sraz veteránů Praha', 'Traktoriáda Plzeň']);
});

test('filtr typ: stačí jeden z typů akce', () => {
  assert.deepEqual(filtr({ typ: 'auta' }), ['Sraz veteránů Praha', 'Traktoriáda Plzeň']);
  assert.deepEqual(filtr({ typ: 'lode' }), ['Plavba po Svratce']);
  assert.deepEqual(filtr({ typ: 'letadla' }), ['Letecký den Ostrava']);
  assert.deepEqual(filtr({ typ: 'ostatni' }), ['Výstava v depu Liberec']);
});

test('filtr kraj (i doplněný ze souřadnic) a kombinace filtrů', () => {
  assert.deepEqual(filtr({ kraj: 'Liberecký kraj' }), ['Výstava v depu Liberec']);
  assert.deepEqual(filtr({ kraj: 'Hlavní město Praha', typ: 'vlaky', kdy: 'vikend' }), ['Mikulášský vlak Praha']);
  assert.deepEqual(filtr({ kraj: 'Hlavní město Praha', typ: 'lode' }), []);
});

test('seznam krajů abecedně česky', () => {
  assert.deepEqual(M.seznamKraju(priprav().polozky), ['Hlavní město Praha', 'Jihomoravský kraj', 'Liberecký kraj',
    'Moravskoslezský kraj', 'Olomoucký kraj', 'Plzeňský kraj']);
});

// ---------- Sloučení stejného místa ----------
test('akce na stejném místě jsou jeden bod, uvnitř podle data', () => {
  const body = M.seskup(priprav().polozky);
  assert.equal(body.length, 6);
  const praha = body.find((b) => b.obec === 'Praha');
  assert.deepEqual(nazvy(praha.polozky), ['Mikulášský vlak Praha', 'Sraz veteránů Praha']);
  assert.equal(praha.typ, 'vlaky', 'ikona bodu podle nejbližší akce');
  assert.deepEqual(body.map((b) => b.obec), ['Liberec', 'Praha', 'Ostrava', 'Plzeň', 'Brno', 'Olomouc']);
});

test('drobný rozdíl v souřadnicích (pod 4. desetinným místem) se sloučí, jiný ne', () => {
  const p = (lat, lon, n) => ({ nazev: n, lat, lon, obec: n, typ: 'vlaky', typy: ['vlaky'], zacatek: DNES, konec: DNES, razeni: DNES });
  assert.equal(M.seskup([p(50.07561, 14.43791, 'a'), p(50.07559, 14.43789, 'b')]).length, 1);
  assert.equal(M.seskup([p(50.0756, 14.4379, 'a'), p(50.0856, 14.4379, 'b')]).length, 2);
});

// ---------- Moje poloha ----------
test('řazení podle vzdálenosti od polohy (u Brna)', () => {
  const body = M.seradPodleVzdalenosti(M.seskup(priprav().polozky), { lat: 49.2, lon: 16.6 });
  assert.deepEqual(body.map((b) => b.obec), ['Brno', 'Olomouc', 'Ostrava', 'Praha', 'Liberec', 'Plzeň']);
  assert.ok(body[0].km < 2, body[0].km);
  assert.ok(body[3].km > 180 && body[3].km < 190, 'Praha–Brno ≈ 185 km: ' + body[3].km);
});

test('bez polohy se pořadí nemění', () => {
  const body = M.seskup(priprav().polozky);
  assert.deepEqual(M.seradPodleVzdalenosti(body, null).map((b) => b.klic), body.map((b) => b.klic));
});

test('text vzdálenosti', () => {
  assert.equal(M.textVzdalenosti(0.4), 'do 2 km');
  assert.equal(M.textVzdalenosti(6.4), 'cca 6 km');
  assert.equal(M.textVzdalenosti(23.4), 'cca 25 km');
  assert.equal(M.textVzdalenosti(undefined), '');
});

// ---------- Texty a HTML ----------
test('datum akce česky', () => {
  const p = (z, k) => ({ zacatek: new Date(...z), konec: new Date(...(k || z)) });
  assert.equal(M.textData(p([2026, 10, 7]), DNES), 'so 7. listopadu');
  assert.equal(M.textData(p([2026, 10, 28], [2026, 10, 29]), DNES), '28.–29. listopadu');
  assert.equal(M.textData(p([2026, 10, 30], [2026, 11, 2]), DNES), '30. listopadu – 2. prosince');
  assert.equal(M.textData(p([2027, 0, 10]), DNES), 'ne 10. ledna 2027');
  assert.equal(M.textData(p([2026, 9, 1], [2026, 10, 30]), DNES), 'probíhá do 30. listopadu');
});

test('počet akcí česky', () => {
  assert.equal(M.pocetAkci(1), '1 akce');
  assert.equal(M.pocetAkci(3), '3 akce');
  assert.equal(M.pocetAkci(5), '5 akcí');
  assert.equal(M.pocetAkci(0), '0 akcí');
});

test('karta bodu: místo, datum, název a odkaz na článek, vše escapované', () => {
  const body = M.seskup(priprav().polozky);
  const praha = M.htmlKarty(body.find((b) => b.obec === 'Praha'), DNES);
  assert.ok(praha.includes('so 7. listopadu') && praha.includes('so 21. listopadu'), praha);
  assert.ok(praha.includes('Mikulášský vlak Praha') && praha.includes('Sraz veteránů Praha'));
  assert.ok(praha.includes(`href="${W}praha-vlak/"`) && praha.includes(`href="${W}praha-auta/"`));
  assert.ok(praha.includes('Detail akce'));
  const olomouc = M.htmlKarty(body.find((b) => b.obec === 'Olomouc'), DNES);
  assert.ok(!olomouc.includes('<b>') && olomouc.includes('&lt;b&gt;vlak&lt;/b&gt; &quot;Olomouc&quot;'), olomouc);
});

test('karta po zjištění polohy ukáže vzdálenost', () => {
  const body = M.seradPodleVzdalenosti(M.seskup(priprav().polozky), { lat: 49.2, lon: 16.6 });
  assert.ok(M.htmlKarty(body[0], DNES).includes('Brno · do 2 km'));
});

test('značka: ikona typu a počet akcí u sloučeného místa', () => {
  const body = M.seskup(priprav().polozky);
  const praha = M.htmlZnacky(body.find((b) => b.obec === 'Praha'));
  assert.ok(praha.includes('data-typ="vlaky"') && praha.includes('hsm-znacka-pocet">2<'), praha);
  const brno = M.htmlZnacky(body.find((b) => b.obec === 'Brno'));
  assert.ok(brno.includes('data-typ="lode"') && !brno.includes('hsm-znacka-pocet'));
  assert.ok(brno.includes('fill="#1f6f3d"'), 'značková zelená');
});

test('bezpečné odkazy: jen http(s)', () => {
  assert.equal(M.bezpecnaUrl('javascript:alert(1)'), '');
  assert.equal(M.bezpecnaUrl('/kalendar-dopravnich-akci/x/'), 'https://www.hravestroje.cz/kalendar-dopravnich-akci/x/');
});

// ---------- Nastavení a soubory ----------
test('Leaflet z cdnjs v pevné verzi s kontrolním součtem, dlaždice OSM s atribucí', () => {
  const N = M.NASTAVENI;
  assert.match(N.leafletJs, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/\d+\.\d+\.\d+\/leaflet\.js$/);
  assert.match(N.leafletCss, /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/\d+\.\d+\.\d+\/leaflet\.css$/);
  assert.equal(N.leafletJs.split('/')[6], N.leafletCss.split('/')[6], 'stejná verze JS i CSS');
  assert.match(N.leafletJsIntegrity, /^sha384-[A-Za-z0-9+/]{64}$/);
  assert.match(N.leafletCssIntegrity, /^sha384-[A-Za-z0-9+/]{64}$/);
  assert.equal(N.dlazdice, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.ok(N.atribuce.includes('https://www.openstreetmap.org/copyright') && N.atribuce.includes('OpenStreetMap'));
});

test('skript ani stránka nepoužívají cookies ani úložiště', () => {
  for (const f of ['mapa/hs-mapa.js', 'mapa/index.html']) {
    const t = fs.readFileSync(path.join(KOREN, f), 'utf8');
    assert.ok(!/document\.cookie|localStorage|sessionStorage|indexedDB/.test(t), f);
  }
  const js = fs.readFileSync(path.join(KOREN, 'mapa/hs-mapa.js'), 'utf8');
  assert.ok(js.includes("credentials: 'omit'"), 'data se stahují bez cookies');
});

test('skutečná data z repozitáře projdou bez chyby', () => {
  const a = JSON.parse(fs.readFileSync(path.join(KOREN, 'kalendar/akce.json'), 'utf8')).akce;
  const s = JSON.parse(fs.readFileSync(path.join(KOREN, 'akce-v-okoli/souradnice.json'), 'utf8')).akce;
  const { polozky } = M.pripravAkce(a, s, new Date(2026, 0, 1));
  const body = M.seskup(polozky);
  assert.ok(body.length > 0 && body.length <= polozky.length);
  for (const b of body) assert.ok(M.htmlKarty(b, new Date()).includes('href="https://'));
});

// ---------- Spuštění ----------
let chyby = 0;
for (const [nazev, fn] of testy) {
  try { fn(); console.log('  ok  ' + nazev); } catch (e) { chyby++; console.error('  CHYBA  ' + nazev + '\n' + e.stack); }
}
if (chyby) { console.error(`${chyby} z ${testy.length} testů mapy selhalo.`); process.exit(1); }
console.log(`OK: ${testy.length} testů mapy prošlo.`);
