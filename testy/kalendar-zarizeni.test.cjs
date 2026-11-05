// Testy údajů v zařízení (kalendar/zarizeni.js): oblíbené, můj kraj, „Přidat do mobilu“,
// chování při zakázaném úložišti a rozpoznání iPhonu.  node testy/kalendar-zarizeni.test.cjs
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const Z = require(path.join(__dirname, '..', 'kalendar', 'zarizeni.js'));

let pocet = 0;
function test(nazev, fn) {
  try { fn(); pocet++; } catch (e) { console.error('CHYBA v testu „' + nazev + '“:\n', e.message); process.exit(1); }
}
function pamet() {
  const d = new Map();
  return {
    d,
    getItem: (k) => (d.has(k) ? d.get(k) : null),
    setItem: (k, v) => d.set(k, String(v)),
    removeItem: (k) => d.delete(k),
  };
}
const rozbite = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

test('oblíbené: přidat, odebrat, přežije nové otevření', () => {
  const u = pamet();
  const z = Z.vytvor(u);
  assert.deepEqual(z.oblibene(), []);
  assert.equal(z.prepniOblibenou('a1'), true);
  assert.equal(z.prepniOblibenou('a2'), true);
  assert.equal(z.jeOblibena('a1'), true);
  assert.deepEqual(Z.vytvor(u).oblibene(), ['a1', 'a2'], 'jiná instance (nové otevření) vidí totéž');
  assert.equal(z.prepniOblibenou('a1'), false);
  assert.deepEqual(z.oblibene(), ['a2']);
  z.prepniOblibenou('a2');
  assert.equal(u.d.has(Z.KLICE.oblibene), false, 'prázdný seznam se z úložiště smaže');
});

test('oblíbené: poškozená data a cizí hodnoty se ignorují', () => {
  const u = pamet();
  u.setItem(Z.KLICE.oblibene, '{nesmysl');
  assert.deepEqual(Z.vytvor(u).oblibene(), []);
  u.setItem(Z.KLICE.oblibene, JSON.stringify(['x', 5, null, '', 'y']));
  assert.deepEqual(Z.vytvor(u).oblibene(), ['x', 'y']);
  u.setItem(Z.KLICE.oblibene, '"text"');
  assert.deepEqual(Z.vytvor(u).oblibene(), []);
});

test('oblíbené: seznam má strop (nejstarší se zahodí)', () => {
  const z = Z.vytvor(pamet());
  for (let i = 0; i < 320; i++) z.prepniOblibenou('id' + i);
  const s = z.oblibene();
  assert.equal(s.length, 300);
  assert.equal(s[0], 'id20');
  assert.equal(s[299], 'id319');
});

test('filtr Moje oblíbené', () => {
  const akce = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, null];
  assert.deepEqual(Z.filtrujOblibene(akce, ['c', 'a', 'neexistuje']).map((a) => a.id), ['a', 'c'], 'pořadí podle seznamu akcí');
  assert.deepEqual(Z.filtrujOblibene(akce, []), []);
  assert.deepEqual(Z.filtrujOblibene(null, ['a']), []);
});

test('můj kraj', () => {
  const u = pamet();
  const z = Z.vytvor(u);
  assert.equal(z.mujKraj(), '');
  z.nastavMujKraj('Zlínský kraj');
  assert.equal(Z.vytvor(u).mujKraj(), 'Zlínský kraj');
  z.nastavMujKraj('');
  assert.equal(z.mujKraj(), '');
  assert.equal(u.d.size, 0);
});

test('Přidat do mobilu: po instalaci nebo zavření už ne', () => {
  const u = pamet();
  assert.equal(Z.vytvor(u).instalaceVyrizena(), false);
  Z.vytvor(u).oznacInstalaci('zavreno');
  assert.equal(Z.vytvor(u).instalaceVyrizena(), true);
  const u2 = pamet();
  Z.vytvor(u2).oznacInstalaci('nainstalovano');
  assert.equal(Z.vytvor(u2).instalaceVyrizena(), true);
});

test('zakázané úložiště (výjimky) i žádné úložiště: nic nespadne, funguje do zavření stránky', () => {
  for (const u of [rozbite, null]) {
    const z = Z.vytvor(u);
    assert.deepEqual(z.oblibene(), []);
    assert.equal(z.prepniOblibenou('a'), true);
    assert.equal(z.jeOblibena('a'), true, 'do zavření stránky si oblíbenou pamatuje');
    assert.equal(z.nastavMujKraj('Zlínský kraj'), false, 'zápis hlásí, že se neuložil');
    assert.equal(z.mujKraj(), 'Zlínský kraj');
    assert.equal(z.oznacInstalaci('zavreno'), false);
    assert.equal(z.instalaceVyrizena(), true);
    z.nastavMujKraj('');
    assert.equal(z.mujKraj(), '');
    const nove = Z.vytvor(u); // nové otevření stránky
    assert.deepEqual(nove.oblibene(), [], 'po novém otevření nic');
    assert.equal(nove.instalaceVyrizena(), false);
  }
  // V Node.js není localStorage → výchozí úložiště je null
  assert.deepEqual(Z.vytvor().oblibene(), []);
});

test('rozpoznání iPhonu/iPadu', () => {
  assert.equal(Z.jeIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', 'iPhone', 5), true);
  assert.equal(Z.jeIos('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)', 'iPad', 5), true);
  assert.equal(Z.jeIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 'MacIntel', 5), true, 'iPad jako Mac');
  assert.equal(Z.jeIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false, 'Mac bez dotyku');
  assert.equal(Z.jeIos('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/126.0 Mobile Safari/537.36', 'Linux armv8l', 5), false);
});

test('běží jako nainstalovaná aplikace', () => {
  const okno = (rezim, standalone) => ({
    navigator: { standalone },
    matchMedia: (q) => ({ matches: q === '(display-mode: ' + rezim + ')' }),
  });
  assert.equal(Z.jeNainstalovana(okno('standalone')), true);
  assert.equal(Z.jeNainstalovana(okno('browser')), false);
  assert.equal(Z.jeNainstalovana(okno('browser', true)), true, 'iOS navigator.standalone');
  assert.equal(Z.jeNainstalovana({ navigator: {} }), false);
});

console.log(`OK: ${pocet} testů údajů v zařízení (oblíbené, můj kraj, instalace, zakázané úložiště)`);
