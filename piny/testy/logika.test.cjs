// Testy logiky generátoru pinů (bez prohlížeče): rozměry, zalamování, výběr dat, texty pinu.
//   node --test piny/testy/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../logika.js');

// Odhad šířky textu bez canvasu: průměrná šířka znaku podle tučnosti (o něco víc, než mají skutečná písma).
function mer(text, font) {
  const px = Number(/(\d+)px/.exec(font)[1]);
  const vaha = Number(font.split(' ')[0]);
  let sirka = 0;
  for (const z of String(text)) {
    const k = /[mwMWŽŠČ@]/.test(z) ? 0.9 : /[ilj.,:;'!|ť\s]/.test(z) ? 0.3 : /[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(z) ? 0.7 : 0.56;
    sirka += k * px * (vaha >= 700 ? 1.08 : 1);
  }
  return sirka;
}

const KOREN = path.join(__dirname, '..', '..');
const AKCE = JSON.parse(fs.readFileSync(path.join(KOREN, 'kalendar', 'akce.json'), 'utf8'));
const PRODUKTY = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'produkty.json'), 'utf8'));

const DLOUHY = 'Velká podzimní traktoriáda s jízdou historických strojů, soutěží zručnosti, ukázkami orby, ' +
  'dětským koutkem a vyhlášením nejkrásnějšího traktoru celého Královéhradeckého kraje';
const OBRI_SLOVO = 'Supermegavláčkodráhovýtrhakdesetiletíprovšechnymaléstrojvedoucíajejichrodiče';

function zkontrolujRozvrh(r, popis) {
  for (const p of r.prvky) {
    if (p.typ === 'obdelnik' || p.typ === 'obrazek') {
      assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= P.SIRKA + 0.5 && p.y + p.h <= P.VYSKA + 0.5,
        `${popis}: ${p.typ} ${p.role || ''} mimo plochu ${JSON.stringify(p)}`);
    }
    if (p.typ === 'text') {
      const w = mer(p.text, p.font);
      const levy = p.zarovnani === 'center' ? p.x - w / 2 : p.x;
      assert.ok(levy >= P.OKRAJ - 1 && levy + w <= P.SIRKA - P.OKRAJ + 1, `${popis}: text přesahuje okraj: „${p.text}“ (${Math.round(w)} px)`);
      assert.ok(p.y > 0 && p.y < P.VYSKA, `${popis}: text mimo výšku: „${p.text}“`);
      assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(p.text), `${popis}: emoji v textu`);
    }
  }
  const zelena = r.prvky.find((p) => p.role === 'zelena');
  for (const n of r.prvky.filter((p) => p.role === 'nadpis')) {
    assert.equal(n.barva, '#ffffff', `${popis}: nadpis má být bílý`);
    assert.ok(n.y < zelena.y + zelena.h, `${popis}: nadpis musí ležet na zelené ploše`);
  }
  assert.equal(zelena.barva, '#1e6f3f');
  const texty = r.prvky.filter((p) => p.typ === 'text' && p.role !== 'web');
  for (const t of texty) assert.ok(t.y < P.ZEM, `${popis}: text „${t.text}“ zasahuje pod spodní linii`);
  const web = r.prvky.filter((p) => p.role === 'web');
  assert.equal(web.length, 1); assert.equal(web[0].text, 'hravestroje.cz'); assert.ok(web[0].y > P.ZEM, 'hravestroje.cz pod linií');
  assert.ok(Number(/(\d+)px/.exec(web[0].font)[1]) <= 40, 'hravestroje.cz má být malé');
  const zem = r.prvky.find((p) => p.role === 'zem');
  assert.equal(zem.y, P.ZEM);
  const obr = r.prvky.find((p) => p.typ === 'obrazek');
  if (obr) {
    assert.equal(obr.y + obr.h, P.ZEM, `${popis}: ilustrace musí stát na spodní linii`);
    assert.ok(obr.y >= r.dolniTextu, `${popis}: ilustrace překrývá text (${obr.y} < ${r.dolniTextu})`);
    assert.ok(obr.x >= P.OKRAJ - 1 && obr.x + obr.w <= P.SIRKA - P.OKRAJ + 1, `${popis}: ilustrace přesahuje okraje`);
  }
  return { texty, obr };
}

test('rozměry pinu 1000×1500 a barvy webu', () => {
  assert.equal(P.SIRKA, 1000);
  assert.equal(P.VYSKA, 1500);
  assert.deepEqual([P.BARVY.zelena, P.BARVY.svetla, P.BARVY.cihlova], ['#1e6f3f', '#e9f4ec', '#c0392b']);
  const r = P.rozvrh({ sablona: 'clanek', nadpis: 'Výlet', podnadpis: 'Krátce', odrazky: ['a'] }, mer, null);
  const pozadi = r.prvky[0];
  assert.deepEqual([pozadi.x, pozadi.y, pozadi.w, pozadi.h, pozadi.barva], [0, 0, 1000, 1500, '#e9f4ec']);
  zkontrolujRozvrh(r, 'krátký článek');
});

test('zalamování: řádky se vejdou, nic se neztratí, předložky nezůstanou na konci', () => {
  const f = P.font('700', 60);
  const m = (t) => mer(t, f);
  const radky = P.zalom(DLOUHY, 860, m);
  assert.ok(radky.length > 2);
  for (const r of radky) assert.ok(m(r) <= 860, `řádek je moc široký: ${r}`);
  assert.equal(radky.join(' '), DLOUHY, 'zalomením se nesmí ztratit ani přidat slovo');
  const sPredlozkou = P.zalom('Jízda vlakem v sobotu a v neděli s Mikulášem a čertem k nádraží v Lužné u Rakovníka', 420, m);
  for (const r of sPredlozkou) assert.ok(!/(^|\s)[vkszouai]$/i.test(r), `jednopísmenné slovo na konci řádku: „${r}“`);
  const obri = P.zalom(OBRI_SLOVO, 500, m);
  assert.ok(obri.length > 1, 'dlouhé slovo se musí rozdělit');
  for (const r of obri) assert.ok(m(r) <= 500, `kus slova je moc široký: ${r}`);
  assert.equal(obri.join(''), OBRI_SLOVO);
  assert.deepEqual(P.zalom('   ', 500, m), []);
});

test('přizpůsobení: písmo se zmenší, a když to nestačí, text se zkrátí trojtečkou', () => {
  const kratky = P.prizpusob('Krátký nadpis', { sirka: 860, maxRadku: 4, max: 96, min: 58, vaha: '800', mer });
  assert.equal(kratky.px, 96); assert.equal(kratky.radky.length, 1); assert.equal(kratky.zkraceno, false);
  const stredni = P.prizpusob(DLOUHY, { sirka: 860, maxRadku: 6, max: 96, min: 40, vaha: '800', mer });
  assert.ok(stredni.px < 96 && stredni.radky.length <= 6 && !stredni.zkraceno, `px ${stredni.px}, řádků ${stredni.radky.length}`);
  const moc = P.prizpusob(DLOUHY + ' ' + DLOUHY, { sirka: 860, maxRadku: 3, max: 96, min: 58, vaha: '800', mer });
  assert.equal(moc.px, 58); assert.equal(moc.radky.length, 3); assert.equal(moc.zkraceno, true);
  assert.ok(moc.radky[2].endsWith('…'));
  for (const r of moc.radky) assert.ok(mer(r, moc.font) <= 860, `zkrácený řádek přesahuje: ${r}`);
  assert.equal(moc.vyska, 3 * moc.vyskaRadku);
});

test('všechny šablony s dlouhými texty zůstanou v ploše, ilustrace stojí na linii', () => {
  const pripady = [
    ['akce', { sablona: 'akce', nadpis: DLOUHY, datum: P.datumAkce('2026-03-21', '2026-11-01'),
      misto: 'Areál zemědělského muzea a přilehlé louky u rybníka Velký Tisý, Lomnice nad Lužnicí, Třeboňsko', kraj: 'Královéhradecký kraj' }],
    ['clanek', { sablona: 'clanek', nadpis: DLOUHY, podnadpis: DLOUHY, odrazky: [DLOUHY, OBRI_SLOVO, 'Krátká odrážka'] }],
    ['produkt', { sablona: 'produkt', nadpis: PRODUKTY.produkty[3].nazev, cena: 12990, podnadpis: DLOUHY }],
    ['obří slovo', { sablona: 'akce', nadpis: OBRI_SLOVO + ' ' + OBRI_SLOVO, datum: OBRI_SLOVO, misto: OBRI_SLOVO, kraj: OBRI_SLOVO }],
  ];
  const ilustrace = [null, { sirka: 600, vyska: 300 }, { sirka: 300, vyska: 900, karta: true }, { sirka: 1200, vyska: 1200 }];
  for (const [nazev, d] of pripady) {
    for (const ilu of ilustrace) {
      for (const [velikost, posun] of [[1, 0], [0.3, -1], [0.6, 1], [5, 9]]) {
        const r = P.rozvrh(d, mer, ilu && { ...ilu, velikost, posun });
        const { obr } = zkontrolujRozvrh(r, `${nazev}/${ilu ? ilu.sirka + '×' + ilu.vyska : 'bez'}/${velikost}/${posun}`);
        if (ilu) {
          assert.ok(obr && obr.h >= 100, `${nazev}: ilustrace je moc malá (${obr && obr.h})`);
          assert.ok(Math.abs(obr.w / obr.h - ilu.sirka / ilu.vyska) < 0.02, `${nazev}: ilustrace je zdeformovaná`);
        } else assert.equal(obr, undefined);
      }
    }
  }
});

test('velikost a posun ilustrace', () => {
  const d = { sablona: 'akce', nadpis: 'Traktoriáda', datum: 'sobota 7. listopadu 2026', misto: 'Hořice', kraj: 'Královéhradecký kraj' };
  const ilu = { sirka: 600, vyska: 300 };
  const velka = P.rozvrh(d, mer, { ...ilu, velikost: 1 }).ilustrace;
  const mala = P.rozvrh(d, mer, { ...ilu, velikost: 0.5 }).ilustrace;
  assert.ok(Math.abs(mala.w - velka.w / 2) <= 1, 'poloviční velikost');
  assert.equal(mala.x + mala.w / 2, 500, 'bez posunu uprostřed');
  const vlevo = P.rozvrh(d, mer, { ...ilu, velikost: 0.5, posun: -1 }).ilustrace;
  const vpravo = P.rozvrh(d, mer, { ...ilu, velikost: 0.5, posun: 1 }).ilustrace;
  assert.equal(vlevo.x, P.OKRAJ);
  assert.equal(vpravo.x + vpravo.w, P.SIRKA - P.OKRAJ);
  for (const o of [velka, mala, vlevo, vpravo]) assert.equal(o.y + o.h, P.ZEM, 'vždy stojí na linii');
});

test('výběr akcí z kalendar/akce.json: jen probíhající a budoucí, bez zrušených, podle data', () => {
  const dnes = '2026-11-05';
  const vyber = P.vyberAkce(AKCE, { dnes });
  assert.ok(vyber.length > 0 && vyber.length < AKCE.akce.length, `vybráno ${vyber.length} z ${AKCE.akce.length}`);
  for (const a of vyber) assert.ok((a.konec || a.zacatek).slice(0, 10) >= dnes && !a.zruseno, a.nazev);
  for (let i = 1; i < vyber.length; i++) assert.ok(vyber[i - 1].zacatek.slice(0, 10) <= vyber[i].zacatek.slice(0, 10), 'řazení');

  const akce = (nazev, zacatek, konec, navic = {}) => ({ id: nazev, nazev, zacatek, konec, kraj: 'Zlínský kraj', misto: 'Místo', obec: 'Zlín', ...navic });
  const seznam = { akce: [
    akce('Skončila včera', '2026-11-01', '2026-11-04'),
    akce('Končí dnes', '2026-10-01', '2026-11-05T16:00:00+01:00'),
    akce('Zítra bez konce', '2026-11-06T09:00:00+01:00', null),
    akce('Včera bez konce', '2026-11-04', null),
    akce('Zrušená', '2026-11-20', '2026-11-20', { zruseno: true }),
    akce('Jiný kraj', '2026-12-01', '2026-12-01', { kraj: 'Plzeňský kraj', obec: 'Plzeň' }),
    akce('Bez kraje', '2026-12-02', '2026-12-02', { kraj: null }),
    akce('', '2026-12-01', '2026-12-01'),
    akce('Špatné datum', '7. 12. 2026', null),
  ] };
  assert.deepEqual(P.vyberAkce(seznam, { dnes }).map((a) => a.nazev), ['Končí dnes', 'Zítra bez konce', 'Jiný kraj', 'Bez kraje']);
  assert.deepEqual(P.vyberAkce(seznam, { dnes, kraj: 'Plzeňský kraj' }).map((a) => a.nazev), ['Jiný kraj']);
  assert.deepEqual(P.vyberAkce(seznam, { dnes, kraj: '-' }).map((a) => a.nazev), ['Bez kraje']);
  assert.deepEqual(P.vyberAkce(seznam, { dnes, hledat: 'PLZEN' }).map((a) => a.nazev), ['Jiný kraj'], 'hledání bez diakritiky a velikosti');
  assert.ok(P.vyberAkce(seznam, { dnes, vcetneZrusenych: true }).some((a) => a.nazev === 'Zrušená'));
  assert.deepEqual(P.vyberAkce(null, { dnes }), []);
  const kraje = P.krajeAkci(AKCE);
  assert.ok(kraje.includes('Hlavní město Praha') && !kraje.includes(null));
  assert.deepEqual([...kraje].sort((a, b) => a.localeCompare(b, 'cs')), kraje);
});

test('data akce v češtině', () => {
  assert.equal(P.datumAkce('2026-11-07', '2026-11-07'), 'sobota 7. listopadu 2026');
  assert.equal(P.datumAkce('2026-11-08T10:00:00+01:00', null), 'neděle 8. listopadu 2026');
  assert.equal(P.datumAkce('2027-07-03', '2027-07-05'), '3.–5. července 2027');
  assert.equal(P.datumAkce('2026-03-21', '2026-11-01'), '21. března – 1. listopadu 2026');
  assert.equal(P.datumAkce('2026-12-31T20:00:00+01:00', '2027-01-01T01:00:00+01:00'), '31. prosince 2026 – 1. ledna 2027');
  assert.equal(P.datumAkce('', ''), '');
});

test('výběr produktů z produkty.json', () => {
  assert.equal(P.vyberProdukty(PRODUKTY).length, 4);
  assert.deepEqual(P.vyberProdukty(PRODUKTY, { jenSkladem: true }).map((p) => p.cena), [549, 1890, 12990]);
  assert.deepEqual(P.vyberProdukty(PRODUKTY, { hledat: 'traktory' }).map((p) => p.cena), [1890], 'hledá i v kategorii');
  assert.deepEqual(P.vyberProdukty({ produkty: [{ nazev: 'Bez ceny' }, { nazev: '', cena: 5 }, null] }), []);
  assert.equal(P.cena(12990), '12 990 Kč');
  assert.equal(P.cena(549), '549 Kč');
  assert.equal(P.cena(0), '');
  // stejný tvar jako skutečný produkty.json (ukázka z produkty/demo-data.js)
  const demo = fs.readFileSync(path.join(KOREN, 'produkty', 'demo-data.js'), 'utf8');
  const data = JSON.parse(demo.slice(demo.indexOf('{'), demo.lastIndexOf('}') + 1));
  assert.ok(P.vyberProdukty(data, { jenSkladem: true }).length >= 3);
});

test('ilustrace.json: prázdný seznam s návodem, bezpečné cesty, výběr podle témat', () => {
  const vlastni = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'ilustrace.json'), 'utf8'));
  assert.deepEqual(vlastni.ilustrace, [], 'seznam je zatím prázdný');
  assert.ok(vlastni.navod.join(' ').includes('piny/ilustrace/'), 'návod je v souboru');
  const test = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ilustrace.json'), 'utf8'));
  const s = P.seznamIlustraci(test);
  assert.deepEqual(s.map((i) => i.soubor), ['testy/data/traktor.svg'], 'cizí adresy a cesty mimo složku se vynechají');
  assert.equal(P.ilustracePro(s, ['auta', 'traktory']).nazev, 'Testovací traktor');
  assert.equal(P.ilustracePro(s, ['lode']), null);
  assert.deepEqual(P.seznamIlustraci(null), []);
});

test('ořez průhledných okrajů', () => {
  const w = 10, h = 8, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 2; y <= 6; y++) for (let x = 3; x <= 7; x++) data[(y * w + x) * 4 + 3] = 255;
  assert.deepEqual(P.orezPruhledne(data, w, h), { x: 3, y: 2, w: 5, h: 5, pruhledny: true });
  assert.equal(P.orezPruhledne(new Uint8ClampedArray(16), 2, 2), null);
  assert.equal(P.orezPruhledne(new Uint8ClampedArray(16).fill(255), 2, 2).pruhledny, false);
});

test('titulek do 100 a popis do 500 znaků', () => {
  const akce = P.vyberAkce(AKCE, { dnes: '2026-01-01' });
  for (const a of akce) {
    const t = P.textyPinu({ sablona: 'akce', nadpis: a.nazev, datum: P.datumAkce(a.zacatek, a.konec), misto: a.misto, kraj: a.kraj, popis: a.popis });
    assert.ok(t.titulek.length > 0 && t.titulek.length <= 100, `titulek ${t.titulek.length}: ${t.titulek}`);
    assert.ok(t.popis.length > 0 && t.popis.length <= 500, `popis ${t.popis.length}`);
    assert.ok(t.popis.includes('hravestroje.cz'), 'popis odkazuje na web');
    assert.ok(t.popis.startsWith(a.nazev.slice(0, 20)), 'popis začíná názvem akce');
  }
  const dlouhe = [
    { sablona: 'akce', nadpis: DLOUHY + DLOUHY, datum: 'sobota 7. listopadu 2026', misto: DLOUHY, kraj: 'Zlínský kraj', popis: DLOUHY.repeat(5) },
    { sablona: 'clanek', nadpis: DLOUHY, podnadpis: DLOUHY, odrazky: [DLOUHY, DLOUHY, DLOUHY] },
    { sablona: 'produkt', nadpis: PRODUKTY.produkty[3].nazev, cena: 12990, podnadpis: DLOUHY.repeat(4) },
    { sablona: 'clanek', nadpis: OBRI_SLOVO.repeat(3), podnadpis: '', odrazky: [] },
  ];
  for (const d of dlouhe) {
    const t = P.textyPinu(d);
    assert.ok(t.titulek.length <= 100 && t.titulek.length > 10, `${d.sablona}: titulek ${t.titulek.length}`);
    assert.ok(t.popis.length <= 500 && t.popis.length > 40, `${d.sablona}: popis ${t.popis.length}`);
    assert.ok(t.popis.endsWith('hravestroje.cz.') || t.popis.endsWith('…'), `${d.sablona}: konec popisu: ${t.popis.slice(-40)}`);
    assert.ok(!/ /.test(t.popis + t.titulek), 'bez nezlomitelných mezer');
  }
  const p = P.textyPinu({ sablona: 'produkt', nadpis: 'Dřevěný vláček', cena: 549 });
  assert.equal(p.titulek, 'Dřevěný vláček – 549 Kč – Hravé stroje');
  assert.ok(p.popis.startsWith('Dřevěný vláček za 549 Kč.'));
  const c = P.textyPinu({ sablona: 'clanek', nadpis: 'Kam za vláčky', podnadpis: 'Tipy na podzim', odrazky: ['Parní vlak', '', 'Muzeum'] });
  assert.equal(c.titulek, 'Kam za vláčky – Tipy na podzim');
  assert.equal(c.popis, 'Kam za vláčky. Tipy na podzim. Parní vlak. Muzeum. Celý článek na hravestroje.cz.');
  assert.equal(P.zkrat('a'.repeat(30), 10).length, 10);
});

test('název staženého souboru', () => {
  assert.equal(P.nazevSouboru('Mikulášská jízda – Lužná u Rakovníka'), 'pin-mikulasska-jizda-luzna-u-rakovnika.png');
  assert.equal(P.nazevSouboru(''), 'pin-hravestroje.png');
});
