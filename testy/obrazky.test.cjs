// Testy generátoru obrázku akce (obrazky/kresleni.js) bez prohlížeče.
//   node --test testy/obrazky.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const K = require('../obrazky/kresleni.js');

// Přibližné měření textu: průměrná šířka znaku 0,56 × velikost písma (tučné 0,6).
const mer = (t, pismo) => {
  const v = +/(\d+)px/.exec(pismo)[1];
  return t.length * v * (pismo.startsWith('700') ? 0.6 : 0.56);
};

test('rozměry formátů', () => {
  assert.equal(K.FORMATY.web.sirka, 1200);
  assert.equal(K.FORMATY.web.vyska, 630);
  assert.equal(K.FORMATY.site.sirka, 1080);
  assert.equal(K.FORMATY.site.vyska, 1350);
  for (const f of Object.values(K.FORMATY)) {
    assert.ok(f.hlavicka < f.zeme && f.zeme < f.vyska, 'hlavička nad zemí, země nad spodkem');
  }
});

test('barvy podle webu', () => {
  assert.equal(K.BARVY.hlavicka, '#1e6f3f');
  assert.equal(K.BARVY.plocha, '#e9f4ec');
  assert.equal(K.BARVY.nazev, '#ffffff');
});

test('termín česky', () => {
  assert.equal(K.terminText('2026-11-07', '2026-11-07'), '7. listopadu 2026');
  assert.equal(K.terminText('2026-11-07T10:00:00+01:00', null), '7. listopadu 2026');
  assert.equal(K.terminText('2026-11-07', '2026-11-08'), '7.–8. listopadu 2026');
  assert.equal(K.terminText('2026-10-30', '2026-11-01'), '30. října – 1. listopadu 2026');
  assert.equal(K.terminText('2026-12-31', '2027-01-02'), '31. prosince 2026 – 2. ledna 2027');
  assert.equal(K.terminText('2026-02-30', null), '', 'neplatné datum');
  assert.equal(K.terminText('2026-11-08', '2026-11-01'), '8. listopadu 2026', 'konec před začátkem');
});

test('řádek Pořádá … · kraj', () => {
  assert.equal(K.poradatelText('KHKD', 'Zlínský kraj'), 'Pořádá KHKD · Zlínský kraj');
  assert.equal(K.poradatelText('', 'Zlínský kraj'), 'Zlínský kraj');
  assert.equal(K.poradatelText(' Spolek ', ''), 'Pořádá Spolek');
  assert.equal(K.poradatelText('', ''), '');
});

test('zalamování a zkracování textu', () => {
  const m = (t) => t.length * 10;
  assert.deepEqual(K.zalom('aaa bbb ccc', 70, m, 2), ['aaa bbb', 'ccc']);
  const r = K.zalom('aaa bbb ccc ddd eee', 70, m, 2);
  assert.equal(r.length, 2);
  assert.ok(r[1].endsWith('…') && m(r[1]) <= 70, r[1]);
  const dlouhe = K.zalom('x'.repeat(50), 100, m, 1);
  assert.ok(m(dlouhe[0]) <= 100 && dlouhe[0].endsWith('…'));
});

test('texty se vejdou do obrázku a nepřekrývají zemi', () => {
  const udaje = {
    nazev: 'Mikulášská jízda historickým motoráčkem po Švestkové dráze s mnoha zastávkami a překvapeními pro děti',
    datum: '30. října – 1. listopadu 2026', misto: 'Lužná u Rakovníka – Rakovník – Kolešovice, Muzeum ČD a okolí',
    poradatel: 'Klub přátel železnic', kraj: 'Středočeský kraj',
  };
  for (const [klic, f] of Object.entries(K.FORMATY)) {
    const r = K.rozvrzeni(klic, udaje, mer);
    for (const t of r.texty) {
      assert.ok(mer(t.text, t.pismo) <= f.sirka - 2 * f.okraj + 0.5, `${klic}: ${t.druh} je moc široký`);
      assert.ok(t.y > 0 && t.y < f.vyska, `${klic}: ${t.druh} mimo obrázek`);
      const v = +/(\d+)px/.exec(t.pismo)[1];
      if (t.druh === 'nazev' || t.druh === 'datum') {
        assert.ok(t.y - v * 0.8 > 0 && t.y + v * 0.25 < f.hlavicka, `${klic}: ${t.druh} přesahuje hlavičku (y ${t.y}, písmo ${v})`);
      }
      else assert.ok(t.y - v * 0.8 > f.zeme && t.y + v * 0.25 < f.vyska, `${klic}: ${t.druh} má být pod zemí`);
    }
    const druhy = r.texty.map((t) => t.druh);
    for (const d of ['nazev', 'datum', 'misto', 'poradatel', 'web']) assert.ok(druhy.includes(d), `${klic}: chybí ${d}`);
    assert.equal(r.texty.find((t) => t.druh === 'web').text, 'hravestroje.cz');
    const y = r.texty.map((t) => t.y);
    assert.deepEqual([...y].sort((a, b) => a - b), y, `${klic}: texty jdou shora dolů`);
  }
});

test('ilustrace stojí na spodní linii při libovolné velikosti a posunu', () => {
  const obrazky = [[800, 600, 0], [600, 900, 120], [1600, 400, 37], [300, 300, 0]];
  for (const [klic, f] of Object.entries(K.FORMATY)) {
    for (const [w, h, prazdnoDole] of obrazky) {
      for (const velikost of [20, 55, 80, 100]) {
        for (const posun of [-100, -30, 0, 60, 100]) {
          const u = K.umisteniIlustrace(klic, w, h, { velikost, posun, prazdnoDole });
          const spodekObsahu = u.y + (h - prazdnoDole) * u.meritko;
          assert.ok(Math.abs(spodekObsahu - f.zeme) < 1e-6, `${klic} ${w}×${h}: spodek ${spodekObsahu} ≠ země ${f.zeme}`);
          assert.ok(u.y >= f.hlavicka - 1e-6, `${klic} ${w}×${h} ${velikost}%: ilustrace zasahuje do hlavičky`);
          assert.ok(u.x >= f.okraj - 1e-6 && u.x + u.w <= f.sirka - f.okraj + 1e-6, `${klic}: ilustrace mimo okraje`);
        }
      }
    }
    const vlevo = K.umisteniIlustrace(klic, 400, 300, { velikost: 40, posun: -100 });
    const vpravo = K.umisteniIlustrace(klic, 400, 300, { velikost: 40, posun: 100 });
    const stred = K.umisteniIlustrace(klic, 400, 300, { velikost: 40, posun: 0 });
    assert.ok(Math.abs(vlevo.x - f.okraj) < 1e-6 && Math.abs(vpravo.x + vpravo.w - (f.sirka - f.okraj)) < 1e-6);
    assert.ok(Math.abs(stred.x + stred.w / 2 - f.sirka / 2) < 1e-6, 'posun 0 = na středu');
    const mala = K.umisteniIlustrace(klic, 400, 300, { velikost: 30 });
    const velka = K.umisteniIlustrace(klic, 400, 300, { velikost: 90 });
    assert.ok(velka.w > mala.w * 2.9, 'velikost mění rozměr');
  }
});

test('průhledné okraje obrázku', () => {
  const w = 4, h = 6;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 1; y <= 3; y++) data[(y * w + 2) * 4 + 3] = 255; // obsah v řádcích 1–3
  assert.deepEqual(K.prazdneOkraje(data, w, h), { dole: 2, nahore: 1 });
  assert.deepEqual(K.prazdneOkraje(new Uint8ClampedArray(w * h * 4).fill(255), w, h), { dole: 0, nahore: 0 });
});

test('seznam ilustrací: jen adresy z hravestroje.cz', () => {
  const p = K.pripravIlustrace({ ilustrace: [
    { nazev: 'Parní lokomotiva', url: 'https://www.hravestroje.cz/user/documents/upload/ilustrace/parni-lokomotiva.png', typy: ['vlaky'] },
    { url: 'https://www.hravestroje.cz/user/documents/upload/ilustrace/traktor%20cerveny.png' },
    { url: 'ilustrace/lod.png' },
    { url: 'https://example.com/obrazek.png' },
    { url: 'https://www.hravestroje.cz/user/documents/upload/ilustrace/../jiny/x.png' },
    { url: 'javascript:alert(1)' },
    null,
  ] });
  assert.deepEqual(p.ilustrace.map((i) => i.nazev), ['Parní lokomotiva', 'traktor cerveny', 'lod']);
  assert.deepEqual(p.ilustrace[0].typy, ['vlaky']);
  assert.equal(p.chyby.length, 4);
  assert.equal(K.pripravIlustrace({}).ilustrace.length, 0);
});

test('obrazky/ilustrace.json je platný a má návod', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'obrazky', 'ilustrace.json'), 'utf8'));
  assert.ok(Array.isArray(data.ilustrace));
  assert.ok(Array.isArray(data._navod) && data._navod.join(' ').includes(K.POVOLENA_ADRESA));
  assert.deepEqual(K.pripravIlustrace(data).chyby, []);
});

test('název staženého souboru', () => {
  assert.equal(K.nazevSouboru('Mikulášská jízda – Lužná!', 'web'), 'obrazek-mikulasska-jizda-luzna-1200x630.png');
  assert.equal(K.nazevSouboru('', 'site'), 'obrazek-akce-1080x1350.png');
});

test('na stránce nejsou emoji, cookies ani cizí skripty', () => {
  for (const s of ['index.html', 'app.js', 'kresleni.js', 'ilustrace.json']) {
    const text = fs.readFileSync(path.join(__dirname, '..', 'obrazky', s), 'utf8');
    assert.ok(!/\p{Extended_Pictographic}/u.test(text), `${s}: emoji`);
    assert.ok(!/document\.cookie|localStorage|sessionStorage/.test(text), `${s}: cookies/úložiště`);
    assert.ok(!/<script[^>]+src="(https?:)?\/\//.test(text), `${s}: cizí skript`);
  }
});
