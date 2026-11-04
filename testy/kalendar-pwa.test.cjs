// Kontrola PWA a přípravy pro Google Play: manifest, ikony, snímky, service worker,
// Bubblewrap (twa-manifest.json), šablona assetlinks.json, workflow; bez emoji a bez cookies.
//   node testy/kalendar-pwa.test.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const KOREN = path.join(__dirname, '..');
const K = path.join(KOREN, 'kalendar');
const cti = (p) => fs.readFileSync(p, 'utf8');

let pocet = 0;
function test(nazev, fn) {
  try { fn(); pocet++; } catch (e) { console.error('CHYBA v testu „' + nazev + '“:\n', e.message); process.exit(1); }
}
function rozmeryPng(soubor) {
  const b = fs.readFileSync(soubor);
  assert.equal(b.toString('latin1', 1, 4), 'PNG', soubor + ' není PNG');
  return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20);
}

const m = JSON.parse(cti(path.join(K, 'manifest.webmanifest')));

test('manifest: název, krátký název, barvy, zobrazení', () => {
  assert.ok(m.name && m.name.includes('Hravé stroje'), 'name');
  assert.ok(m.short_name && m.short_name.length <= 12, 'short_name max 12 znaků (pod ikonou na ploše)');
  assert.equal(m.theme_color, '#1f6f3d');
  assert.equal(m.background_color, '#1f6f3d');
  assert.equal(m.lang, 'cs');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.ok(m.id, 'id');
  assert.ok(m.description && m.description.length <= 300);
  const html = cti(path.join(K, 'index.html'));
  assert.match(html, /<meta name="theme-color" content="#1f6f3d">/);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
});

test('manifest: ikony existují a mají uvedené rozměry', () => {
  const png = m.icons.filter((i) => i.type === 'image/png');
  assert.ok(png.some((i) => i.sizes === '192x192' && i.purpose.includes('any')), 'ikona 192');
  assert.ok(png.some((i) => i.sizes === '512x512' && i.purpose.includes('any')), 'ikona 512');
  assert.ok(png.some((i) => i.sizes === '512x512' && i.purpose.includes('maskable')), 'maskable 512 (Android/Google Play)');
  for (const i of m.icons) {
    const soubor = path.join(K, i.src);
    assert.ok(fs.existsSync(soubor), 'chybí ' + i.src);
    if (i.type === 'image/png') assert.equal(rozmeryPng(soubor), i.sizes, i.src);
  }
});

test('manifest: snímky obrazovky (mobil i počítač)', () => {
  assert.ok(m.screenshots.some((s) => s.form_factor === 'narrow'), 'snímek pro mobil');
  assert.ok(m.screenshots.some((s) => s.form_factor === 'wide'), 'snímek pro počítač');
  for (const s of m.screenshots) {
    const soubor = path.join(K, s.src);
    assert.ok(fs.existsSync(soubor), 'chybí ' + s.src);
    assert.equal(rozmeryPng(soubor), s.sizes, s.src);
    const [w, h] = s.sizes.split('x').map(Number);
    assert.ok(Math.max(w, h) / Math.min(w, h) <= 2.3, 'poměr stran snímku max 2,3 : ' + s.src);
    assert.ok(Math.min(w, h) >= 320 && Math.max(w, h) <= 3840, 'rozměr snímku 320–3840 px: ' + s.src);
    assert.ok(s.label, 'popisek snímku');
  }
});

test('service worker: ukládá stránku, akce.json a ikony; soubory existují', () => {
  const sw = cti(path.join(K, 'sw.js'));
  const zaklad = JSON.parse(sw.match(/const ZAKLAD = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const s of ['./', 'index.html', 'app.js', 'logika.js', 'zarizeni.js', 'styles.css', 'akce.json', 'manifest.webmanifest']) {
    assert.ok(zaklad.includes(s), 'sw.js neukládá ' + s);
  }
  for (const i of m.icons) assert.ok(zaklad.includes(i.src), 'sw.js neukládá ikonu ' + i.src);
  for (const s of zaklad) if (s !== './') assert.ok(fs.existsSync(path.join(K, s)), 'sw.js odkazuje na neexistující ' + s);
  assert.match(sw, /X-Kalendar-Offline/, 'označení uložených dat pro poznámku „naposledy aktualizováno“');
  assert.doesNotMatch(sw, /showNotification|pushManager/i, 'žádné notifikace');
  // každý skript stránky musí být v mezipaměti, jinak by offline nefungoval
  const html = cti(path.join(K, 'index.html'));
  for (const [, src] of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(zaklad.includes(src), 'sw.js neukládá ' + src);
});

test('workflow zveřejní všechny soubory aplikace a .well-known', () => {
  const wf = cti(path.join(KOREN, '.github', 'workflows', 'web.yml'));
  for (const s of ['index.html', 'styles.css', 'logika.js', 'zarizeni.js', 'app.js', 'akce.json', 'manifest.webmanifest', 'sw.js']) {
    assert.ok(wf.includes('kalendar/' + s), 'workflow nekopíruje kalendar/' + s);
  }
  assert.ok(wf.includes('kalendar/screenshots/'), 'workflow nekopíruje snímky');
  assert.ok(wf.includes('.well-known/assetlinks.json'), 'workflow nekopíruje assetlinks.json');
  assert.ok(!/uses: actions\/upload-pages-artifact/.test(wf) && wf.includes('name: github-pages'), 'upload-pages-artifact vynechává skryté složky (.well-known)');
});

test('Bubblewrap (twa-manifest.json) sedí s manifestem a assetlinks.json', () => {
  const t = JSON.parse(cti(path.join(K, 'android', 'twa-manifest.json')));
  const a = JSON.parse(cti(path.join(KOREN, '.well-known', 'assetlinks.json')));
  assert.equal(t.host, 'kalendar.hravestroje.cz');
  assert.equal(t.startUrl, '/kalendar/');
  assert.match(t.packageId, /^[a-z]+(\.[a-z][a-z0-9_]*)+$/);
  assert.equal(t.themeColor, m.theme_color);
  assert.equal(t.backgroundColor, m.background_color);
  assert.equal(t.enableNotifications, false);
  assert.equal(t.launcherName, m.short_name);
  assert.equal(t.webManifestUrl, 'https://' + t.host + t.startUrl + 'manifest.webmanifest');
  assert.ok(t.iconUrl.endsWith('/' + m.icons.find((i) => i.sizes === '512x512' && i.purpose === 'any').src));
  assert.ok(t.maskableIconUrl.endsWith('/icons/icon-maskable-512.png'));
  assert.ok(t.signingKey.path.endsWith('.keystore'));
  assert.ok(Array.isArray(a) && a.length === 1);
  assert.deepEqual(a[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(a[0].target.namespace, 'android_app');
  assert.equal(a[0].target.package_name, t.packageId, 'package_name v assetlinks.json = packageId');
  for (const f of a[0].target.sha256_cert_fingerprints) {
    assert.ok(f.includes('DOPLNTE') || /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f), 'otisk musí být 32 dvojic HEX oddělených dvojtečkou: ' + f);
  }
  const gi = cti(path.join(K, 'android', '.gitignore'));
  assert.match(gi, /\*\.keystore/, 'klíč nesmí do repozitáře');
  const klice = fs.readdirSync(path.join(K, 'android')).filter((f) => /\.(keystore|jks)$/.test(f));
  assert.deepEqual(klice, [], 'v repozitáři je podepisovací klíč!');
});

test('bez emoji a bez cookies', () => {
  const soubory = ['index.html', 'app.js', 'logika.js', 'zarizeni.js', 'sw.js', 'styles.css', 'manifest.webmanifest', 'README.md']
    .map((s) => path.join(K, s)).concat([path.join(K, 'android', 'twa-manifest.json'), path.join(KOREN, '.well-known', 'assetlinks.json')]);
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u;
  for (const s of soubory) {
    const text = cti(s);
    const nalez = text.match(emoji);
    assert.ok(!nalez, 'emoji v ' + path.relative(KOREN, s) + ': ' + (nalez && nalez[0]));
    if (/\.(js|html)$/.test(s)) assert.doesNotMatch(text, /document\.cookie|cookieStore/, 'cookies v ' + path.relative(KOREN, s));
  }
  // každý přístup k localStorage jen přes zarizeni.js (tam je v try/catch)
  for (const s of ['app.js', 'logika.js']) assert.doesNotMatch(cti(path.join(K, s)), /localStorage/, s + ' sahá přímo na localStorage');
});

console.log(`OK: ${pocet} kontrol PWA a přípravy pro Google Play (manifest, ikony, snímky, sw.js, Bubblewrap, assetlinks)`);
