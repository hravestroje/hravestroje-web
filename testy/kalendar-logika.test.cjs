// Testy logiky kalendáře (kalendar/logika.js) – bez prohlížeče a bez internetu.
// Spouštět s českým časovým pásmem:  TZ=Europe/Prague node testy/kalendar-logika.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const L = require(path.join(__dirname, '..', 'kalendar', 'logika.js'));

let pocet = 0;
function test(nazev, fn) {
  try {
    fn();
    pocet++;
  } catch (e) {
    console.error('CHYBA v testu „' + nazev + '“:\n', e.message);
    process.exit(1);
  }
}
const den = (s) => L.isoDen(s);
const nazvy = (seznam) => seznam.map((a) => a.nazev);

// Ukázková data: vícedenní akce, akce bez času, s časem, skončené, neplatné.
const DATA = {
  akce: [
    { id: 'a1', nazev: 'Cyklohráček (celá sezóna)', zacatek: '2026-03-21', konec: '2026-11-29', typy: ['vlaky'], kraj: 'Hlavní město Praha', obec: 'Praha' },
    { id: 'a2', nazev: 'Výstava modelů (od včera)', zacatek: '2026-11-03', konec: '2026-11-08', typy: ['vlaky'], kraj: 'Jihomoravský kraj', obec: 'Brno' },
    { id: 'a3', nazev: 'Skončená akce', zacatek: '2026-10-01', konec: '2026-11-03', typy: ['auta'] },
    { id: 'a4', nazev: 'Odpolední jízda dnes', zacatek: '2026-11-04T14:00:00+01:00', konec: '2026-11-04T16:00:00+01:00', typy: ['vlaky'], kraj: 'Jihomoravský kraj', obec: 'Brno' },
    { id: 'a5', nazev: 'Dopolední jízda dnes', zacatek: '2026-11-04T09:30:00+01:00', typy: ['auta'], kraj: 'Zlínský kraj', obec: 'Zlín' },
    { id: 'a6', nazev: 'Celodenní výstava dnes (bez času)', zacatek: '2026-11-04', typy: ['traktory'], kraj: 'Zlínský kraj' },
    { id: 'a7', nazev: 'Víkendová plavba', zacatek: '2026-11-07', konec: '2026-11-08', typy: ['lode'], kraj: 'Hlavní město Praha', obec: 'Praha' },
    { id: 'a8', nazev: 'Letecký den příští víkend', zacatek: '2026-11-14T10:00:00+01:00', konec: '2026-11-14T17:00:00+01:00', typy: ['letadla'], kraj: 'Královéhradecký kraj', obec: 'Hradec Králové' },
    { id: 'a9', nazev: 'Mikulášská jízda', zacatek: '2026-12-05T10:00:00+01:00', konec: '2026-12-05T16:00:00+01:00', typy: ['vlaky'], kraj: 'Jihomoravský kraj', obec: 'Brno' },
    { id: 'a10', nazev: 'Silvestrovská jízda přes Nový rok', zacatek: '2026-12-31', konec: '2027-01-01', typy: [], kraj: 'Plzeňský kraj' },
    { id: 'a11', nazev: 'Novoroční jízda', zacatek: '2027-01-01T13:00:00+01:00', typy: ['vlaky'], kraj: 'Plzeňský kraj' },
    { id: 'a12', nazev: 'Jarní traktoriáda', zacatek: '2027-04-10', typy: ['traktory', 'auta'], kraj: 'Zlínský kraj' },
    { id: 'a13', nazev: 'Akce bez data', zacatek: '' },
    { id: 'a14', nazev: 'Akce s konečnou před začátkem', zacatek: '2026-11-20', konec: '2026-11-10', typy: ['nesmysl'] },
  ],
};
const TED = new Date(2026, 10, 4, 12, 0); // středa 4. 11. 2026, poledne
const AKCE = L.pripravAkce(DATA, TED);

// ---------- 1) Řazení a sekce ----------
test('pripravAkce vyřadí skončené a neplatné, doplní typ ostatni', () => {
  assert.ok(!nazvy(AKCE).includes('Skončená akce'));
  assert.ok(!nazvy(AKCE).includes('Akce bez data'));
  const silvestr = AKCE.find((a) => a.id === 'a10');
  assert.deepEqual(silvestr._typy, ['ostatni']);
  const spatna = AKCE.find((a) => a.id === 'a14');
  assert.deepEqual(spatna._typy, ['ostatni'], 'neznámý typ → ostatni');
  assert.equal(den(spatna._k), '2026-11-20', 'konec před začátkem → konec dne začátku');
});

test('Právě probíhá = začaly před dneškem a ještě trvají; seřazené podle začátku', () => {
  const { probiha } = L.rozdelAkce(AKCE, TED);
  assert.deepEqual(nazvy(probiha), ['Cyklohráček (celá sezóna)', 'Výstava modelů (od včera)']);
});

test('nadcházející: přísně podle data a času, akce bez času na začátku dne', () => {
  const { nadchazejici } = L.rozdelAkce(AKCE, TED);
  assert.deepEqual(nazvy(nadchazejici), [
    'Celodenní výstava dnes (bez času)',
    'Dopolední jízda dnes',
    'Odpolední jízda dnes',
    'Víkendová plavba',
    'Letecký den příští víkend',
    'Akce s konečnou před začátkem',
    'Mikulášská jízda',
    'Silvestrovská jízda přes Nový rok',
    'Novoroční jízda',
    'Jarní traktoriáda',
  ]);
  for (let i = 1; i < nadchazejici.length; i++) {
    assert.ok(nadchazejici[i - 1]._z <= nadchazejici[i]._z, 'pořadí podle začátku');
  }
});

test('dnešní jednodenní akce (i už začatá) není v „Právě probíhá“', () => {
  const vecer = new Date(2026, 10, 4, 15, 0);
  const { probiha } = L.rozdelAkce(L.pripravAkce(DATA, vecer), vecer);
  assert.ok(!nazvy(probiha).includes('Odpolední jízda dnes'));
  assert.ok(!nazvy(probiha).includes('Celodenní výstava dnes (bez času)'));
});

test('skupiny podle měsíců (i přes přelom roku)', () => {
  const { nadchazejici } = L.rozdelAkce(AKCE, TED);
  const skupiny = L.seskupPodleMesicu(nadchazejici);
  assert.deepEqual(skupiny.map((s) => s.nazev), ['listopad 2026', 'prosinec 2026', 'leden 2027', 'duben 2027']);
  assert.deepEqual(skupiny.map((s) => s.akce.length), [6, 2, 1, 1]);
});

test('vícedenní akce, která začne zítra, je v nadcházejících; dnes už je probíhající', () => {
  const zitra = new Date(2026, 10, 8, 9, 0); // neděle 8. 11.: plavba začala v sobotu
  const { probiha, nadchazejici } = L.rozdelAkce(L.pripravAkce(DATA, zitra), zitra);
  assert.ok(nazvy(probiha).includes('Víkendová plavba'));
  assert.ok(!nazvy(nadchazejici).includes('Víkendová plavba'));
});

// ---------- 2) Filtry podle data ----------
const rozsah = (kdy, ted, navic) => {
  const r = L.rozsahData(Object.assign({ kdy }, navic), ted);
  return r && [den(r.od), den(r.do)];
};

test('Dnes, Zítra', () => {
  assert.deepEqual(rozsah('dnes', TED), ['2026-11-04', '2026-11-04']);
  assert.deepEqual(rozsah('zitra', TED), ['2026-11-05', '2026-11-05']);
  assert.deepEqual(rozsah('zitra', new Date(2026, 10, 30, 22)), ['2026-12-01', '2026-12-01'], 'zítra přes přelom měsíce');
  assert.deepEqual(rozsah('zitra', new Date(2026, 11, 31, 22)), ['2027-01-01', '2027-01-01'], 'zítra přes přelom roku');
  const r = L.rozsahData({ kdy: 'dnes' }, TED);
  assert.equal(r.do.getHours(), 23, 'do konce dne');
});

test('Tento týden (do neděle)', () => {
  assert.deepEqual(rozsah('tyden', TED), ['2026-11-04', '2026-11-08']);
  assert.deepEqual(rozsah('tyden', new Date(2026, 10, 8, 10)), ['2026-11-08', '2026-11-08'], 'v neděli jen neděle');
  assert.deepEqual(rozsah('tyden', new Date(2026, 11, 30, 10)), ['2026-12-30', '2027-01-03'], 'přes přelom roku');
});

test('Tento víkend, Příští víkend', () => {
  assert.deepEqual(rozsah('vikend', TED), ['2026-11-07', '2026-11-08']);
  assert.deepEqual(rozsah('pristi-vikend', TED), ['2026-11-14', '2026-11-15']);
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 7, 10)), ['2026-11-07', '2026-11-08'], 'v sobotu');
  assert.deepEqual(rozsah('vikend', new Date(2026, 10, 8, 10)), ['2026-11-08', '2026-11-08'], 'v neděli zbytek víkendu');
  assert.deepEqual(rozsah('pristi-vikend', new Date(2026, 10, 8, 10)), ['2026-11-14', '2026-11-15'], 'příští víkend z neděle');
  assert.deepEqual(rozsah('vikend', new Date(2026, 9, 29, 10)), ['2026-10-31', '2026-11-01'], 'víkend přes přelom měsíce');
  assert.deepEqual(rozsah('pristi-vikend', new Date(2026, 11, 28, 10)), ['2027-01-09', '2027-01-10'], 'přes přelom roku');
  assert.deepEqual(rozsah('vikend', new Date(2027, 0, 1, 10)), ['2027-01-02', '2027-01-03']);
});

test('Tento měsíc, Příští měsíc (i prosinec → leden, únor)', () => {
  assert.deepEqual(rozsah('mesic', TED), ['2026-11-04', '2026-11-30']);
  assert.deepEqual(rozsah('pristi-mesic', TED), ['2026-12-01', '2026-12-31']);
  assert.deepEqual(rozsah('pristi-mesic', new Date(2026, 11, 15)), ['2027-01-01', '2027-01-31'], 'přelom roku');
  assert.deepEqual(rozsah('pristi-mesic', new Date(2027, 0, 31)), ['2027-02-01', '2027-02-28'], '31. ledna → únor');
  assert.deepEqual(rozsah('mesic', new Date(2028, 1, 10)), ['2028-02-10', '2028-02-29'], 'přestupný únor');
});

test('konkrétní měsíc a vlastní rozsah od–do', () => {
  assert.deepEqual(rozsah('', TED, { mesic: '2027-01' }), ['2027-01-01', '2027-01-31']);
  assert.deepEqual(rozsah('', TED, { od: '2026-12-01', do: '2026-12-10' }), ['2026-12-01', '2026-12-10']);
  assert.deepEqual(rozsah('', TED, { od: '2026-12-10', do: '2026-12-01' }), ['2026-12-01', '2026-12-10'], 'prohozené od/do');
  const jenOd = L.rozsahData({ od: '2026-12-24' }, TED);
  assert.equal(den(jenOd.od), '2026-12-24');
  assert.ok(jenOd.do > new Date(3000, 0, 1));
  assert.equal(L.rozsahData({}, TED), null);
  assert.equal(L.rozsahData({ od: 'nesmysl' }, TED), null);
});

const filtr = (s, ted) => nazvy(L.filtruj(AKCE, Object.assign(L.prazdnyStav(), s), ted || TED));

test('filtr Tento víkend bere i probíhající a vícedenní akce', () => {
  assert.deepEqual(filtr({ kdy: 'vikend' }).sort(), [
    'Cyklohráček (celá sezóna)', 'Výstava modelů (od včera)', 'Víkendová plavba'].sort());
});

test('filtr Dnes', () => {
  assert.deepEqual(filtr({ kdy: 'dnes' }).sort(), [
    'Celodenní výstava dnes (bez času)', 'Cyklohráček (celá sezóna)', 'Dopolední jízda dnes',
    'Odpolední jízda dnes', 'Výstava modelů (od včera)'].sort());
});

test('filtr Příští měsíc a měsíc přes přelom roku', () => {
  assert.deepEqual(filtr({ kdy: 'pristi-mesic' }), ['Mikulášská jízda', 'Silvestrovská jízda přes Nový rok']);
  assert.deepEqual(filtr({ mesic: '2027-01' }), ['Silvestrovská jízda přes Nový rok', 'Novoroční jízda'],
    'akce 31. 12.–1. 1. patří do prosince i ledna');
  const prosinec = new Date(2026, 11, 20, 12);
  assert.deepEqual(filtr({ kdy: 'pristi-mesic' }, prosinec), ['Silvestrovská jízda přes Nový rok', 'Novoroční jízda']);
});

test('datum jde kombinovat s typem, krajem a hledáním', () => {
  assert.deepEqual(filtr({ kdy: 'mesic', typ: 'vlaky' }), ['Cyklohráček (celá sezóna)', 'Výstava modelů (od včera)', 'Odpolední jízda dnes']);
  assert.deepEqual(filtr({ kdy: 'mesic', typ: 'vlaky', kraj: 'Jihomoravský kraj' }), ['Výstava modelů (od včera)', 'Odpolední jízda dnes']);
  assert.deepEqual(filtr({ kdy: 'mesic', q: 'brno odpoledni' }), ['Odpolední jízda dnes'], 'hledání bez diakritiky');
  assert.deepEqual(filtr({ typ: 'lode' }), ['Víkendová plavba']);
  assert.deepEqual(filtr({ typ: 'letadla' }), ['Letecký den příští víkend']);
  assert.deepEqual(filtr({ typ: 'ostatni' }), ['Silvestrovská jízda přes Nový rok', 'Akce s konečnou před začátkem']);
  assert.deepEqual(filtr({ typ: 'auta', od: '2027-01-01' }), ['Jarní traktoriáda']);
});

test('stav v adrese: uložení a načtení (sdílení odkazu)', () => {
  const s = Object.assign(L.prazdnyStav(), { q: 'parní vlak', typ: 'lode', kraj: 'Zlínský kraj', kdy: 'pristi-vikend' });
  const qs = L.adresaZeStavu(s);
  assert.deepEqual(L.stavZAdresy('?' + qs), s);
  assert.deepEqual(L.stavZAdresy('?od=2026-12-01&do=2026-12-10'), Object.assign(L.prazdnyStav(), { od: '2026-12-01', do: '2026-12-10' }));
  assert.equal(L.stavZAdresy('?mesic=2027-01').mesic, '2027-01');
  assert.equal(L.stavZAdresy('?mesic=2027-13').mesic, '', 'neplatný měsíc');
  assert.equal(L.stavZAdresy('?vikend=1').kdy, 'vikend', 'starý odkaz ?vikend=1 dál funguje');
  assert.equal(L.stavZAdresy('?kdy=nesmysl&typ=lodicky').kdy + L.stavZAdresy('?typ=lodicky').typ, '');
  assert.equal(L.adresaZeStavu(L.prazdnyStav()), '');
});

test('výběr měsíce: 12 měsíců dopředu přes přelom roku', () => {
  const m = L.mesiceDopredu(TED, 12);
  assert.equal(m.length, 12);
  assert.deepEqual(m[0], { hodnota: '2026-11', nazev: 'listopad 2026' });
  assert.deepEqual(m[2], { hodnota: '2027-01', nazev: 'leden 2027' });
  assert.deepEqual(m[11], { hodnota: '2027-10', nazev: 'říjen 2027' });
});

// ---------- Mřížka ----------
test('mřížka: poslední řada na PC není poloprázdná (4 = 2×2)', () => {
  assert.equal(L.sirokeNaKonci(4), 4);
  assert.equal(L.sirokeNaKonci(7), 4);
  assert.equal(L.sirokeNaKonci(10), 4);
  [1, 2, 3, 5, 6, 8, 9].forEach((n) => assert.equal(L.sirokeNaKonci(n), 0, 'n=' + n));
});

// ---------- Obrázky ----------
test('zástupný obrázek: bez obrázku, "zastupny", nebezpečná adresa', () => {
  assert.equal(L.obrazekAkce({ obrazek: null }), '');
  assert.equal(L.obrazekAkce({ obrazek: 'zastupny' }), '');
  assert.equal(L.obrazekAkce({ obrazek: 'javascript:alert(1)' }), '');
  assert.equal(L.obrazekAkce({ obrazek: 'https://example.cz/a.jpg' }), 'https://example.cz/a.jpg');
  const html = L.zastupnyObrazek('lode');
  assert.ok(html.includes('zastupny--lode') && html.includes('<svg') && html.includes('aria-label="Lodě"'));
  assert.ok(L.zastupnyObrazek('neznamy').includes('zastupny--ostatni'));
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html), 'žádné emoji');
});

test('ikony jsou SVG s currentColor pro všechny typy', () => {
  L.PORADI_TYPU.forEach((t) => {
    const s = L.ikona(t);
    assert.ok(s.startsWith('<svg') && s.includes('stroke="currentColor"') && s.includes('aria-hidden="true"'), t);
  });
});

// ---------- Monetizace ----------
const plavba = AKCE.find((a) => a.id === 'a7');
const cyklo = AKCE.find((a) => a.id === 'a1');

test('Booking: bez partnerského ID žádný odkaz (tlačítko se nezobrazí)', () => {
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: true, booking_aid: '' }, TED), '');
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: true }, TED), '');
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: true, booking_aid: '   ' }, TED), '');
  assert.equal(L.bookingOdkaz(plavba, null, TED), '', 'bez monetizace.json');
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: false, booking_aid: '123' }, TED), '', 'monetizace vypnutá');
  assert.equal(L.bookingOdkaz(plavba, { booking_aid: '"><script>' }, TED), '', 'nesmyslné ID');
});

test('Booking: místo, příjezd v den začátku (u probíhající dnes), utm', () => {
  const u = new URL(L.bookingOdkaz(plavba, { booking_aid: '1234567', booking_label: 'kalendar-akci' }, TED));
  assert.equal(u.hostname, 'www.booking.com');
  assert.equal(u.searchParams.get('aid'), '1234567');
  assert.equal(u.searchParams.get('ss'), 'Praha');
  assert.equal(u.searchParams.get('checkin'), '2026-11-07');
  assert.equal(u.searchParams.get('checkout'), '2026-11-08');
  assert.equal(u.searchParams.get('label'), 'kalendar-akci');
  assert.equal(u.searchParams.get('utm_source'), 'kalendar');
  assert.equal(u.searchParams.get('utm_medium'), 'karta');
  assert.equal(u.searchParams.get('utm_campaign'), 'lode');
  const c = new URL(L.bookingOdkaz(cyklo, { booking_aid: '1234567' }, TED));
  assert.equal(c.searchParams.get('checkin'), '2026-11-04', 'probíhající akce → příjezd dnes, ne v minulosti');
  const silvestr = AKCE.find((a) => a.id === 'a10');
  assert.equal(L.bookingOdkaz(silvestr, { booking_aid: '1' }, TED), '', 'bez místa žádný odkaz');
});

const CJ = 'https://www.anrdoezrs.net/click-101692290-14312907';

test('Booking přes CJ: booking_cj + ?url=<zakódovaná adresa Booking.com>&sid=kalendar-<typ>', () => {
  const odkaz = L.bookingOdkaz(plavba, { booking_cj: CJ, booking_aid: '1234567', booking_label: 'kalendar-akci' }, TED);
  assert.ok(odkaz.startsWith(CJ + '?url='), odkaz);
  const u = new URL(odkaz);
  assert.equal(u.hostname, 'www.anrdoezrs.net');
  assert.deepEqual([...u.searchParams.keys()], ['url', 'sid']);
  assert.equal(u.searchParams.get('sid'), 'kalendar-lode');
  // adresa Booking.com je celá zakódovaná (encodeURIComponent) – v odkazu CJ nesmí být holé & ani ? navíc
  const zakodovana = odkaz.slice((CJ + '?url=').length, odkaz.indexOf('&sid='));
  assert.ok(!/[?&=:/]/.test(zakodovana), 'nezakódované znaky: ' + zakodovana);
  const b = new URL(decodeURIComponent(zakodovana));
  assert.equal(b.href, u.searchParams.get('url'));
  assert.equal(b.hostname, 'www.booking.com');
  assert.equal(b.searchParams.get('ss'), 'Praha');
  assert.equal(b.searchParams.get('checkin'), '2026-11-07');
  assert.equal(b.searchParams.get('checkout'), '2026-11-08');
  assert.equal(b.searchParams.get('group_adults'), '2');
  assert.equal(b.searchParams.get('no_rooms'), '1');
  for (const k of ['aid', 'label', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    assert.ok(!b.searchParams.has(k), 'v CJ variantě nesmí být ' + k);
  }
  assert.ok(!odkaz.includes('aid') && !odkaz.includes('1234567') && !odkaz.includes('utm_'), odkaz);
  // funguje i bez booking_aid; probíhající akce → příjezd dnes
  const c = new URL(L.bookingOdkaz(cyklo, { booking_cj: CJ }, TED));
  assert.equal(new URL(c.searchParams.get('url')).searchParams.get('checkin'), '2026-11-04');
  assert.equal(c.searchParams.get('sid'), 'kalendar-' + L.hlavniTyp(cyklo));
  // aid/label v booking_odkaz se v CJ variantě také zahodí
  const z = new URL(L.bookingOdkaz(plavba, { booking_cj: CJ, booking_odkaz: 'https://www.booking.com/searchresults.cs.html?aid=9&label=x' }, TED));
  const zb = new URL(z.searchParams.get('url'));
  assert.ok(!zb.searchParams.has('aid') && !zb.searchParams.has('label'), zb.href);
  // ostatní domény CJ
  for (const d of ['www.dpbolvw.net', 'www.jdoqocy.com', 'www.kqzyfj.com', 'www.tkqlhce.com', 'anrdoezrs.net']) {
    assert.ok(L.bookingOdkaz(plavba, { booking_cj: 'https://' + d + '/click-1-2' }, TED).startsWith('https://' + d + '/click-1-2?url='), d);
  }
});

test('Booking přes CJ: neplatný booking_cj se nepoužije, prázdný = dosavadní aid', () => {
  // prázdné booking_cj → dosavadní odkaz s aid
  const u = new URL(L.bookingOdkaz(plavba, { booking_cj: '', booking_aid: '1234567' }, TED));
  assert.equal(u.hostname, 'www.booking.com');
  assert.equal(u.searchParams.get('aid'), '1234567');
  // prázdné booking_cj i aid → tlačítko se nezobrazí
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: true, booking_cj: '', booking_aid: '' }, TED), '');
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: true, booking_cj: '   ' }, TED), '');
  // cizí doména / http / podvržená doména → jako by nebylo vyplněné
  for (const spatne of ['http://www.anrdoezrs.net/click-1-2', 'https://www.anrdoezrs.net.evil.cz/click', 'https://evilanrdoezrs.net/x',
    'https://www.example.com/click', 'javascript:alert(1)', 'https://user:pw@www.anrdoezrs.net/click']) {
    assert.equal(L.bookingOdkaz(plavba, { booking_cj: spatne }, TED), '', spatne);
    assert.equal(new URL(L.bookingOdkaz(plavba, { booking_cj: spatne, booking_aid: '7' }, TED)).hostname, 'www.booking.com', spatne);
  }
  // vypnutá monetizace / bez místa
  assert.equal(L.bookingOdkaz(plavba, { zapnuto: false, booking_cj: CJ }, TED), '');
  assert.equal(L.bookingOdkaz(AKCE.find((a) => a.id === 'a10'), { booking_cj: CJ }, TED), '');
});

test('monetizace.json: booking_cj je vyplněné odkazem CJ a s nápovědou', () => {
  const mon = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'kalendar', 'monetizace.json'), 'utf8'));
  assert.equal(mon.booking_cj, CJ);
  assert.ok(typeof mon._booking_cj === 'string' && mon._booking_cj.length > 20);
  assert.equal(L.cjOdkaz(mon.booking_cj), CJ);
});

test('utm parametry v odkazech', () => {
  const u = new URL(L.pridejUtm('https://www.hravestroje.cz/clanek/?x=1', 'vlaky', 'clanek'));
  assert.equal(u.searchParams.get('x'), '1');
  assert.equal(u.search, '?x=1&utm_source=kalendar&utm_medium=karta&utm_campaign=vlaky&utm_content=clanek');
  assert.equal(L.pridejUtm('javascript:alert(1)', 'vlaky'), '');
});

const PRODUKTY = { produkty: [
  { nazev: 'Dřevěný vláček s vagóny', url: 'https://e.cz/p1', skladem: true, temata: ['vlaky'], kategorie: ['Hračky > Vláčky'] },
  { nazev: 'Lokomotiva na baterie', url: 'https://e.cz/p2', skladem: true, temata: ['vlaky'] },
  { nazev: 'Traktor s vlečkou', url: 'https://e.cz/p3', skladem: true, temata: ['traktory'] },
  { nazev: 'Autorská omalovánka', url: 'https://e.cz/p4', skladem: true, temata: [] },
  { nazev: 'Dřevěná loďka do vany', url: 'https://e.cz/p5', skladem: true, temata: [] },
  { nazev: 'Vlak vyprodaný', url: 'https://e.cz/p6', skladem: false, temata: ['vlaky'] },
  { nazev: 'Puzzle letadlo', url: 'https://e.cz/p7', skladem: true, temata: [] },
] };

test('výběr produktu podle typu akce', () => {
  for (let i = 0; i < 20; i++) {
    const p = L.vyberProdukt(PRODUKTY, 'vlaky', 'seed' + i);
    assert.ok(['p1', 'p2'].includes(p.url.slice(-2)), 'vlak → produkt s vlakem skladem: ' + p.nazev);
  }
  assert.equal(L.vyberProdukt(PRODUKTY, 'traktory', 'x').nazev, 'Traktor s vlečkou');
  assert.equal(L.vyberProdukt(PRODUKTY, 'lode', 'x').nazev, 'Dřevěná loďka do vany');
  assert.equal(L.vyberProdukt(PRODUKTY, 'letadla', 'x').nazev, 'Puzzle letadlo');
  assert.ok(!L.produktOdpovidaTypu(PRODUKTY.produkty[3], 'auta'), '„Autorská“ není auto');
  // bez shody → náhodný (ale stabilní pro stejnou akci), nikdy vyprodaný
  const a = L.vyberProdukt(PRODUKTY, 'auta', 'akce-1');
  assert.ok(a && a.skladem !== false);
  assert.equal(L.vyberProdukt(PRODUKTY, 'auta', 'akce-1').url, a.url, 'stabilní výběr');
  const ruzne = new Set();
  for (let i = 0; i < 30; i++) ruzne.add(L.vyberProdukt(PRODUKTY, 'ostatni', 'akce-' + i).url);
  assert.ok(ruzne.size > 2, 'ostatni → náhodný produkt z celé nabídky');
  assert.ok(!ruzne.has('https://e.cz/p6'), 'vyprodaný produkt nikdy');
  // neopakovat už použitý produkt
  const druhy = L.vyberProdukt(PRODUKTY, 'traktory', 'x', { 'https://e.cz/p3': true });
  assert.notEqual(druhy.url, 'https://e.cz/p3');
  assert.equal(L.vyberProdukt({ produkty: [] }, 'vlaky', 'x'), null);
  assert.equal(L.vyberProdukt(null, 'vlaky', 'x'), null);
});

test('nabídky (nabidky.json): kraj/typ, platnost, každá jen jednou', () => {
  const N = { nabidky: [
    { nazev: 'Celostátní tip', url: 'https://p.cz/1' },
    { nazev: 'Praha – lodě', url: 'https://p.cz/2', kraje: ['Hlavní město Praha'], typy: ['lode'] },
    { nazev: 'Vlaky kdekoli', url: 'https://p.cz/3', typ: 'vlaky' },
    { nazev: 'Prošlá', url: 'https://p.cz/4', kraj: 'Hlavní město Praha', do: '2026-10-31' },
    { nazev: 'Bez adresy', kraj: 'Hlavní město Praha' },
  ] };
  assert.equal(L.vyberNabidku(N, plavba, {}, TED).nazev, 'Praha – lodě');
  assert.equal(L.vyberNabidku(N, cyklo, {}, TED).nazev, 'Vlaky kdekoli');
  assert.equal(L.vyberNabidku(N, plavba, { 'https://p.cz/2': true }, TED).nazev, 'Celostátní tip');
  assert.equal(L.vyberNabidku(N, plavba, { 'https://p.cz/2': true, 'https://p.cz/1': true }, TED), null);
  assert.equal(L.vyberNabidku(null, plavba, {}, TED), null, 'soubor zatím neexistuje');
  assert.equal(L.vyberNabidku([{ nazev: 'Pole', url: 'https://p.cz/9', kraj: 'Hlavní město Praha' }], plavba, {}, TED).nazev, 'Pole');
});

test('nabídky: ukázky a položky bez skutečné adresy se nezobrazí', () => {
  const ukazky = JSON.parse(require('node:fs').readFileSync(path.join(__dirname, '..', 'nabidky', 'nabidky.json'), 'utf8'));
  assert.ok(ukazky.nabidky.length && ukazky.nabidky.every((n) => n.ukazka === true), 'nabidky.json má zatím jen ukázky');
  for (const a of AKCE) assert.equal(L.vyberNabidku(ukazky, a, {}, TED), null, 'ukázka u ' + a.id);
  const N = { nabidky: [
    { nazev: 'Ukázka', url: 'https://p.cz/u', ukazka: true },
    { nazev: 'Mřížka', url: '#' },
    { nazev: 'Prázdná', url: '' },
    { nazev: 'Mezery', url: '   ' },
    { nazev: 'Http', url: 'http://p.cz/h' },
    { nazev: 'Relativní', url: '/clanek/' },
    { nazev: 'Bez https', url: 'p.cz/x' },
    { nazev: 'JS', url: 'javascript:alert(1)' },
    { nazev: 'Odkaz #', odkaz: '#' },
  ] };
  for (const a of AKCE) assert.equal(L.vyberNabidku(N, a, {}, TED), null, 'neplatná nabídka u ' + a.id);
  assert.equal(L.nabidkaKZobrazeni({ nazev: 'OK', url: 'https://p.cz/ok' }), true);
  assert.equal(L.nabidkaKZobrazeni({ nazev: 'OK', url: 'https://p.cz/ok', ukazka: true }), false);
  assert.equal(L.nabidkaKZobrazeni({ nazev: 'OK', url: 'https://p.cz/ok', ukazka: false }), true);
  // skutečná nabídka vedle ukázky se zobrazí; "vse" a platnost_do jako v nabidky.json
  const S = { nabidky: ukazky.nabidky.concat([
    { nazev: 'Skutečná', url: 'https://p.cz/s', kraje: [], typy: ['vse'], platnost_do: '2026-12-31' },
    { nazev: 'Prošlá', url: 'https://p.cz/p', kraje: [], typy: ['vse'], platnost_do: '2026-10-31' },
  ]) };
  assert.equal(L.vyberNabidku(S, plavba, {}, TED).nazev, 'Skutečná');
  assert.equal(L.vyberNabidku(S, plavba, { 'https://p.cz/s': true }, TED), null, 'prošlá podle platnost_do');
});

// ---------- .ics ----------
test('.ics pro akci s časem', () => {
  const a = AKCE.find((x) => x.id === 'a9');
  const t = L.ics(Object.assign({}, a, { misto: 'Nádraží, Brno; nástupiště 1', url: 'https://www.hravestroje.cz/mikulas/' }), TED);
  assert.ok(t.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(t.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n'));
  assert.ok(t.includes('\r\nDTSTART:20261205T090000Z\r\n'), 'začátek v UTC');
  assert.ok(t.includes('\r\nDTEND:20261205T150000Z\r\n'), 'konec v UTC');
  assert.ok(t.includes('\r\nUID:a9@hravestroje.cz\r\n'));
  assert.ok(t.includes('LOCATION:Nádraží\\, Brno\\; nástupiště 1'), 'escapování čárky a středníku');
  assert.ok(t.includes('\r\nURL:https://www.hravestroje.cz/mikulas/\r\n'));
  t.split('\r\n').forEach((r) => assert.ok(Buffer.byteLength(r) <= 75, 'řádek max 75 bajtů: ' + r));
});

test('.ics pro celodenní vícedenní akci (konec je exkluzivní) a přes přelom roku', () => {
  const t = L.ics(plavba, TED);
  assert.ok(t.includes('DTSTART;VALUE=DATE:20261107'));
  assert.ok(t.includes('DTEND;VALUE=DATE:20261109'));
  const s = L.ics(AKCE.find((x) => x.id === 'a10'), TED);
  assert.ok(s.includes('DTSTART;VALUE=DATE:20261231') && s.includes('DTEND;VALUE=DATE:20270102'));
  const bezKonce = L.ics(AKCE.find((x) => x.id === 'a5'), TED);
  assert.ok(bezKonce.includes('DTSTART:20261104T083000Z') && !bezKonce.includes('DTEND'), 'bez konce žádný DTEND');
  const zrusena = L.ics(Object.assign({}, plavba, { zruseno: true }), TED);
  assert.ok(zrusena.includes('STATUS:CANCELLED'));
  const dlouhy = L.ics(Object.assign({}, plavba, { popis: 'Žluťoučký kůň úpěl ďábelské ódy. '.repeat(10) }), TED);
  dlouhy.split('\r\n').forEach((r) => assert.ok(Buffer.byteLength(r) <= 75, 'zalomení UTF-8'));
  assert.equal(L.nazevSouboru(plavba), 'vikendova-plavba.ics');
});

// ---------- Termín ----------
test('formát termínu', () => {
  assert.equal(L.formatTermin(AKCE.find((x) => x.id === 'a4'), TED), 'středa 4. listopadu, 14:00–16:00');
  assert.equal(L.formatTermin(plavba, TED), '7.–8. listopadu');
  assert.equal(L.formatTermin(AKCE.find((x) => x.id === 'a10'), TED), '31. prosince 2026 – 1. ledna 2027');
});

console.log('OK: ' + pocet + ' testů logiky kalendáře (řazení, filtry dat, typy, obrázky, monetizace, .ics)');
