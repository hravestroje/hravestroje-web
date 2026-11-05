// Testy výběru nabídek (nabidky/hs-nabidky.js) – Node.js bez balíčků.
//   node testy/nabidky-test.js
const assert = require('assert');
const path = require('path');
const { vyber, rozlozeni, platna, sUtm } = require(path.join(__dirname, '..', 'nabidky', 'hs-nabidky.js'));

const n = (id, kraje, typy, extra = {}) => ({ id, nazev: id, url: 'https://example.com/' + id, zdroj: 'jine', kraje, typy, ...extra });
const KHK = 'Královéhradecký kraj';
const data = [
  n('khk-lode', [KHK], ['lode']),
  n('khk-vlak-1', [KHK], ['vlaky']),
  n('celostatni-vlak', [], ['vlaky']),
  n('khk-vse', [KHK], ['vse']),
  n('celostatni-vse', [], ['vse']),
  n('khk-vlak-2', [KHK, 'Pardubický kraj'], ['vlaky', 'auta']),
  n('zlin-vlak', ['Zlínský kraj'], ['vlaky']),
  n('khk-vlak-prosly', [KHK], ['vlaky'], { platnost_do: '2026-11-03' }),
  n('khk-vlak-dnes', [KHK], ['vlaky'], { platnost_do: '2026-11-04' }),
  n('khk-vlak-ukazka', [KHK], ['vlaky'], { ukazka: true }),
  n('khk-vlak-bez-https', [KHK], ['vlaky'], { url: '#' })
];
const DNES = '2026-11-04';
const ids = (x) => x.map((y) => y.id);

// 1) pořadí: kraj+typ, kraj+vse, celá ČR+typ, celá ČR+vse
assert.deepStrictEqual(ids(vyber(data, KHK, 'vlaky', 9, DNES)),
  ['khk-vlak-1', 'khk-vlak-2', 'khk-vlak-dnes', 'khk-vse', 'celostatni-vlak', 'celostatni-vse']);
assert.deepStrictEqual(ids(vyber(data, KHK, 'vlaky', 4, DNES)), ['khk-vlak-1', 'khk-vlak-2', 'khk-vlak-dnes', 'khk-vse']);
// velká/malá písmena a mezery v atributech nevadí
assert.deepStrictEqual(ids(vyber(data, ' královéhradecký kraj ', 'VLAKY', 2, DNES)), ['khk-vlak-1', 'khk-vlak-2']);
// jiný kraj: jen jeho nabídky + celostátní, nikdy nabídky z KHK
assert.deepStrictEqual(ids(vyber(data, 'Zlínský kraj', 'vlaky', 9, DNES)), ['zlin-vlak', 'celostatni-vlak', 'celostatni-vse']);
assert.deepStrictEqual(ids(vyber(data, 'Pardubický kraj', 'auta', 9, DNES)), ['khk-vlak-2', 'celostatni-vse']);
// bez typu = jen nabídky „vse“; bez kraje = jen celostátní
assert.deepStrictEqual(ids(vyber(data, KHK, '', 9, DNES)), ['khk-vse', 'celostatni-vse']);
assert.deepStrictEqual(ids(vyber(data, '', 'vlaky', 9, DNES)), ['celostatni-vlak', 'celostatni-vse']);
// nic nesedí → prázdný výběr (blok se nezobrazí)
assert.deepStrictEqual(vyber(data.filter((x) => x.kraje.length), 'Plzeňský kraj', 'lode', 4, DNES), []);
console.log('OK: výběr podle kraje a typu (pak „vse“, pak celá ČR)');

// 2) prošlé nabídky: platnost_do včetně daného dne
assert.ok(!platna(data[7], DNES), 'včera prošlá');
assert.ok(platna(data[8], DNES), 'platí i v den platnost_do');
assert.ok(!platna(data[8], '2026-11-05'), 'den po platnost_do');
assert.ok(!ids(vyber(data, KHK, 'vlaky', 9, '2026-11-05')).includes('khk-vlak-dnes'));
console.log('OK: prošlé nabídky se vynechají');

// 3) ukázky a nabídky bez https odkazu se nikdy nezobrazí
const vse = ids(vyber(data, KHK, 'vlaky', 99, DNES));
assert.ok(!vse.includes('khk-vlak-ukazka') && !vse.includes('khk-vlak-bez-https'));
const ostra = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'nabidky', 'nabidky.json'), 'utf8'));
for (const kraj of ['', KHK, 'Zlínský kraj']) for (const typ of ['', 'vlaky', 'traktory', 'auta', 'lode', 'letadla', 'vse']) {
  assert.ok(vyber(ostra.nabidky, kraj, typ, 9, DNES).every((x) => !x.ukazka), 'ukázka z nabidky.json by se zobrazila');
}
for (const kraj of ['', KHK, 'Zlínský kraj']) for (const typ of ['', 'vlaky', 'vse']) {
  assert.strictEqual(vyber(ostra.nabidky.filter((x) => x.ukazka), kraj, typ, 9, DNES).length, 0, 'nabidky.json jen s ukázkami → nic');
}
for (const url of ['#', '', 'https://', 'https://#x', 'http://p.cz/a', '/clanek/']) {
  assert.ok(!platna({ nazev: 'X', url }, DNES), 'neskutečná adresa ' + JSON.stringify(url));
}
console.log('OK: ukázky (i ty v nabidky.json) jsou skryté');

// 4) mřížka bez poloprázdné poslední řady
const r = (p) => { const x = rozlozeni(p); return x.pocet + '/' + x.sloupce; };
assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(r),
  ['0/0', '1/1', '2/2', '3/3', '4/2', '4/2', '6/3', '6/3', '8/2', '9/3']);
for (let p = 1; p <= 9; p++) { const x = rozlozeni(p); assert.strictEqual(x.pocet % x.sloupce, 0); }
console.log('OK: mřížka – 4 = 2×2, 3 vedle sebe, poslední řada vždy plná');

// 5) UTM parametry
assert.strictEqual(sUtm('https://example.com/a'), 'https://example.com/a?utm_source=hravestroje&utm_medium=clanek');
assert.strictEqual(sUtm('https://example.com/a?x=1#d'), 'https://example.com/a?x=1&utm_source=hravestroje&utm_medium=clanek#d');
assert.strictEqual(sUtm('https://example.com/a?utm_source=jiny&x=1'), 'https://example.com/a?x=1&utm_source=hravestroje&utm_medium=clanek');
console.log('OK: odkazy dostanou utm_source=hravestroje&utm_medium=clanek');
