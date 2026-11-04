// Testy vložitelného kalendáře (kalendar/hs-kalendar.js) bez prohlížeče a bez internetu.
//   TZ=Europe/Prague node testy/hs-kalendar.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require(path.join(__dirname, '..', 'kalendar', 'hs-kalendar.js'));
const L = require(path.join(__dirname, '..', 'kalendar', 'logika.js'));
const K = H.vytvor(L);

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

const TED = new Date(2026, 10, 4, 10, 0); // středa 4. 11. 2026
function akceNaDen(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2026, 10, 5 + i);
    out.push({ id: 'x' + i, nazev: 'Akce ' + i, zacatek: L.isoDen(d), typy: [i % 2 ? 'vlaky' : 'auta'],
      kraj: i % 3 ? 'Jihomoravský kraj' : 'Hlavní město Praha', obec: 'Brno', url: 'https://www.hravestroje.cz/kalendar-dopravnich-akci/a' + i + '/' });
  }
  return out;
}

test('základ ze src skriptu', () => {
  assert.equal(H.zakladZeSkriptu('https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js'),
    'https://hravestroje.github.io/hravestroje-web/kalendar/');
  assert.equal(H.zakladZeSkriptu('https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js?v=3'),
    'https://hravestroje.github.io/hravestroje-web/kalendar/');
  assert.equal(H.zakladZeSkriptu('http://127.0.0.1:8000/kalendar/hs-kalendar.js'), 'http://127.0.0.1:8000/kalendar/');
  assert.equal(H.zakladZeSkriptu(''), H.VYCHOZI_ZAKLAD);
  assert.equal(H.zakladZeSkriptu('https://cdn.example/jiny.js'), H.VYCHOZI_ZAKLAD);
});

test('předpona tříd z logika.js', () => {
  const html = H.prefixujTridy(L.zastupnyObrazek('vlaky'));
  const tridy = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  assert.ok(tridy.length >= 4);
  assert.ok(tridy.every((t) => t.startsWith('hs-kal-')), tridy.join(' '));
  assert.equal(H.prefixujTridy('<b class="hs-kal-x  y">'), '<b class="hs-kal-x hs-kal-y">');
});

test('filtry v adrese: cizí parametry zůstanou, staré filtry zmizí', () => {
  assert.equal(H.adresaSFiltry('?utm_source=fb&kraj=Zl%C3%ADnsk%C3%BD+kraj&kdy=dnes', 'kdy=vikend'), '?utm_source=fb&kdy=vikend');
  assert.equal(H.adresaSFiltry('?kraj=x', ''), '');
  assert.equal(H.adresaSFiltry('', L.adresaZeStavu(Object.assign(L.prazdnyStav(), { kraj: 'Jihomoravský kraj', kdy: 'pristi-vikend' }))),
    '?kraj=Jihomoravsk%C3%BD+kraj&kdy=pristi-vikend');
  // sdílený odkaz ?kraj=…&kdy=… → stav
  const s = L.stavZAdresy('?kraj=Jihomoravsk%C3%BD%20kraj&kdy=vikend&utm_source=x');
  assert.equal(s.kraj, 'Jihomoravský kraj');
  assert.equal(s.kdy, 'vikend');
});

test('místo pro reklamu po každé 8. kartě, nikdy za poslední', () => {
  for (const n of [1, 7, 8, 9, 16, 17, 25]) {
    const akce = L.pripravAkce({ akce: akceNaDen(n) }, TED);
    const html = K.seznamHtml(akce, { ted: TED, mon: null, reklamaKazda: 8 });
    const reklam = (html.match(/<div class="hs-kal-reklama"><\/div>/g) || []).length;
    assert.equal(reklam, Math.floor((n - 1) / 8), `n=${n}: reklam ${reklam}`);
    assert.equal((html.match(/<article class="hs-kal-karta/g) || []).length, n);
    // pořadí: přesně 8 karet před každou reklamou
    const casti = html.split('<div class="hs-kal-reklama"></div>');
    casti.slice(0, -1).forEach((c) => assert.equal((c.match(/<article /g) || []).length, 8, `n=${n}`));
  }
});

test('reklama se počítá přes měsíce a nepočítá dlaždice produktů', () => {
  // 5 akcí v listopadu, 6 v prosinci → reklama po 8. kartě (3. prosincová)
  const data = [];
  for (let i = 0; i < 5; i++) data.push({ id: 'n' + i, nazev: 'Listopad ' + i, zacatek: '2026-11-' + (10 + i), typy: ['vlaky'] });
  for (let i = 0; i < 6; i++) data.push({ id: 'p' + i, nazev: 'Prosinec ' + i, zacatek: '2026-12-' + (10 + i), typy: ['vlaky'] });
  const akce = L.pripravAkce({ akce: data }, TED);
  const produkty = { produkty: [1, 2, 3].map((i) => ({ nazev: 'Vláček ' + i, url: 'https://www.hravestroje.cz/v' + i + '/', cena: 100 * i, skladem: true })) };
  const mon = { zapnuto: true, eshop: true, eshop_kazda_karta: 2, nabidky: false };
  const html = K.seznamHtml(akce, { ted: TED, mon, produkty, reklamaKazda: 8, hostitel: 'www.hravestroje.cz' });
  const pred = html.split('<div class="hs-kal-reklama"></div>');
  assert.equal(pred.length, 2);
  assert.equal((pred[0].match(/<article /g) || []).length, 8);
  assert.ok(/Prosinec 2<\/h3>[\s\S]*$/.test(pred[0]) && !pred[0].includes('Prosinec 3'));
  assert.ok((html.match(/hs-kal-produkt"|hs-kal-produkt /g) || []).length >= 3, 'dlaždice produktů');
  // interní odkazy bez UTM, na jiném webu s UTM
  assert.ok(html.includes('href="https://www.hravestroje.cz/v1/"'), 'produkt na vlastním webu bez UTM');
  assert.equal(K.odkazWebu('https://www.hravestroje.cz/a/', 'vlaky', 'clanek', 'hravestroje.cz'), 'https://www.hravestroje.cz/a/');
  assert.ok(K.odkazWebu('https://www.hravestroje.cz/a/', 'vlaky', 'clanek', 'hravestroje.github.io').includes('utm_source=kalendar'));
});

test('data-reklama-kazda=0 vypne místa pro reklamu', () => {
  const akce = L.pripravAkce({ akce: akceNaDen(20) }, TED);
  assert.ok(!K.seznamHtml(akce, { ted: TED, mon: null, reklamaKazda: 0 }).includes('hs-kal-reklama'));
});

test('mřížka bez poloprázdné řady', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(H.sirokeVMrizce), [0, 2, 0, 4, 2, 0, 4, 2]);
});

test('mřížka: segment se 4 kartami (zbytek 1) dostane 2×2', () => {
  // 12 akcí v listopadu → 8 | reklama | 4 → druhý segment má 4 široké
  const akce = L.pripravAkce({ akce: akceNaDen(12) }, TED);
  const html = K.seznamHtml(akce, { ted: TED, mon: null, reklamaKazda: 8 });
  const [prvni, druhy] = html.split('<div class="hs-kal-reklama"></div>');
  assert.equal((prvni.match(/hs-kal-siroka/g) || []).length, 2, '8 karet = 3+3+2, poslední 2 přes celou řadu');
  assert.equal((druhy.match(/hs-kal-siroka/g) || []).length, 4);
});

test('všechny třídy ve vykresleném HTML mají předponu hs-kal-', () => {
  const data = akceNaDen(10);
  data[0].zruseno = true;
  data[1].presunuto = true;
  data.push({ id: 'pr', nazev: 'Probíhá', zacatek: '2026-11-01', konec: '2026-11-20', typy: ['lode'], obrazek: 'https://x.cz/a.jpg' });
  const akce = L.pripravAkce({ akce: data }, TED);
  const mon = { zapnuto: true, booking_aid: '123', eshop: true, eshop_kazda_karta: 3, nabidky: true };
  const nabidky = { nabidky: [{ nazev: 'Hotel', url: 'https://hotel.example/', popis: 'Tip' }] };
  const produkty = [{ nazev: 'Auto', url: 'https://www.hravestroje.cz/auto/', cena: 99, skladem: true }];
  const html = K.seznamHtml(akce, { ted: TED, mon, produkty, nabidky, reklamaKazda: 8, hostitel: 'www.hravestroje.cz' }) + H.kostraHtml();
  const tridy = new Set([...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  const spatne = [...tridy].filter((t) => !t.startsWith('hs-kal-'));
  assert.deepEqual(spatne, []);
  const idcka = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(idcka.every((i) => i.startsWith('hs-kal-')), idcka.join(' '));
  // monetizace jako na stránce kalendar/: nabídka (reklama), Booking, partnerské rel
  assert.ok(html.includes('Tip na výlet (reklama)'));
  assert.ok(html.includes('Ubytování poblíž'));
  assert.ok(html.includes('rel="sponsored nofollow noopener"'));
  assert.ok(html.includes('aid=123'));
  // zrušená akce bez komerčního prvku
  const zrusena = html.split('id="hs-kal-akce-x0"')[1].split('</article>')[0];
  assert.ok(!zrusena.includes('Booking') && !zrusena.includes('reklama'), 'zrušená akce nic neprodává');
});

test('CSS: každé pravidlo je pod #hs-kalendar', () => {
  const pravidla = H.CSS.replace(/@(container|media)[^{]+\{/g, '').split('}').map((r) => r.trim()).filter(Boolean);
  for (const r of pravidla) {
    const selektor = r.split('{')[0];
    if (!selektor.trim()) continue;
    for (const cast of selektor.split(',')) {
      assert.ok(cast.trim().startsWith('#hs-kalendar'), 'selektor mimo kalendář: ' + cast);
    }
  }
  const tridy = new Set([...H.CSS.replace(/url\("[^"]*"\)/g, '').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const spatne = [...tridy].filter((t) => !t.startsWith('hs-kal-'));
  assert.deepEqual(spatne, []);
});

test('JSON-LD: ItemList s Event, stav, místo, data', () => {
  const data = {
    akce: [
      { id: 'a', nazev: 'Parní vlak </script><b>', zacatek: '2026-11-07T10:00:00+01:00', konec: '2026-11-07T16:00:00+01:00',
        misto: 'Nádraží Lužná', obec: 'Lužná', kraj: 'Středočeský kraj', typy: ['vlaky'], url: 'https://www.hravestroje.cz/a/',
        obrazek: 'https://cdn.example/a.jpg', popis: 'Jízda' },
      { id: 'b', nazev: 'Zrušená', zacatek: '2026-11-08', typy: ['auta'], zruseno: true },
      { id: 'c', nazev: 'Přesunutá', zacatek: '2026-11-09', konec: '2026-11-10', typy: ['auta'], presunuto: true, obrazek: 'zastupny' },
      { id: 'd', nazev: 'Probíhá', zacatek: '2026-11-01', konec: '2026-11-20', typy: ['lode'] },
      { id: 'e', nazev: 'Skončená', zacatek: '2026-10-01', konec: '2026-11-01', typy: ['lode'] }
    ]
  };
  const akce = L.pripravAkce(data, TED);
  const ld = K.jsonLd(akce, TED, 'Kalendář', 'https://www.hravestroje.cz/kalendar-akci/');
  assert.equal(ld['@context'], 'https://schema.org');
  assert.equal(ld['@type'], 'ItemList');
  assert.equal(ld.numberOfItems, 4);
  assert.equal(ld.url, 'https://www.hravestroje.cz/kalendar-akci/');
  assert.deepEqual(ld.itemListElement.map((x) => x.position), [1, 2, 3, 4]);
  assert.deepEqual(ld.itemListElement.map((x) => x.item.name), ['Probíhá', 'Parní vlak </script><b>', 'Zrušená', 'Přesunutá']);
  const [d, a, b, c] = ld.itemListElement.map((x) => x.item);
  assert.ok(ld.itemListElement.every((x) => x['@type'] === 'ListItem' && x.item['@type'] === 'Event'));
  assert.equal(a.startDate, '2026-11-07T10:00:00+01:00');
  assert.equal(a.endDate, '2026-11-07T16:00:00+01:00');
  assert.equal(a.location.name, 'Nádraží Lužná');
  assert.equal(a.location.address.addressLocality, 'Lužná');
  assert.equal(a.location.address.addressRegion, 'Středočeský kraj');
  assert.equal(a.location.address.addressCountry, 'CZ');
  assert.deepEqual(a.image, ['https://cdn.example/a.jpg']);
  assert.equal(a.eventStatus, 'https://schema.org/EventScheduled');
  assert.equal(b.eventStatus, 'https://schema.org/EventCancelled');
  assert.equal(b.startDate, '2026-11-08');
  assert.equal(b.endDate, '2026-11-08');
  assert.equal(c.eventStatus, 'https://schema.org/EventRescheduled');
  assert.equal(c.image, undefined, 'zástupný obrázek se do JSON-LD nedává');
  assert.equal(c.endDate, '2026-11-10');
  assert.equal(d.startDate, '2026-11-01');
  const text = K.jsonLdText(ld);
  assert.ok(!text.includes('</script'), 'text JSON-LD nesmí ukončit <script>');
  assert.deepEqual(JSON.parse(text), ld);
});

test('JSON-LD na skutečném akce.json', () => {
  const data = require(path.join(__dirname, '..', 'kalendar', 'akce.json'));
  const ted = new Date(data.aktualizovano || Date.now());
  const akce = L.pripravAkce(data, ted);
  const ld = K.jsonLd(akce, ted);
  assert.equal(ld.itemListElement.length, Math.min(akce.length, 200));
  for (const { item } of ld.itemListElement) {
    assert.ok(item.name && /^\d{4}-\d{2}-\d{2}/.test(item.startDate) && item.location && item.location.name, JSON.stringify(item));
    assert.ok(item.endDate >= item.startDate.slice(0, 10), item.name);
  }
});

test('kostra: žádné cookies, žádné cizí skripty', () => {
  const zdroj = require('node:fs').readFileSync(path.join(__dirname, '..', 'kalendar', 'hs-kalendar.js'), 'utf8');
  assert.ok(!/document\.cookie|localStorage|sessionStorage/.test(zdroj));
  assert.ok(zdroj.includes("credentials: 'omit'"));
  const adresy = [...zdroj.matchAll(/https?:\/\/[^'"\s)]+/g)].map((m) => m[0]);
  for (const u of adresy) {
    assert.ok(/^https:\/\/(hravestroje\.github\.io|schema\.org|www\.booking\.com)|^http:\/\/www\.w3\.org\/2000\/svg/.test(u) || u.includes("w3.org"), 'neočekávaná adresa ' + u);
  }
});

console.log(`OK: ${pocet} testů vložitelného kalendáře (hs-kalendar.js)`);
