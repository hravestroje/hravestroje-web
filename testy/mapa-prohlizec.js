// Test mapy akcí v prohlížeči (Chromium přes Playwright) na PC i mobilu.
//   node testy/mapa-prohlizec.js [složka-pro-snímky]
// Když Playwright není nainstalovaný (např. v GitHub Actions), test se přeskočí.
// Data akcí jsou ukázková (testy/mapa-data.cjs). Mapové dlaždice se v testu nestahují z OpenStreetMap
// (nahradí je jednobarevný obrázek). Leaflet se stáhne z cdnjs; bez internetu lze nastavit
// LEAFLET_DIR=…/package/dist (rozbalený balíček leaflet ze npm) – kontrolní součet se ověří i tak.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const KOREN = path.join(__dirname, '..');
const M = require(path.join(KOREN, 'mapa/hs-mapa.js'));
const DATA = require('./mapa-data.cjs');
const snimky = process.argv[2];
const LEAFLET_DIR = process.env.LEAFLET_DIR;
const ok = (podminka, text) => { if (!podminka) throw new Error(text); };

// Jednobarevná dlaždice 256×256 (PNG) místo OpenStreetMap
function dlazdice() {
  const radek = Buffer.concat([Buffer.from([0]), Buffer.alloc(256 * 3, 0)]);
  for (let x = 0; x < 256; x++) radek.set(x % 64 === 0 ? [214, 222, 214] : [234, 239, 232], 1 + x * 3);
  const radky = [];
  for (let y = 0; y < 256; y++) radky.push(y % 64 === 0 ? Buffer.concat([Buffer.from([0]), Buffer.alloc(768, 214)]) : radek);
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const blok = (typ, data) => {
    const d = Buffer.concat([Buffer.from(typ), data]);
    const delka = Buffer.alloc(4); delka.writeUInt32BE(data.length);
    const k = Buffer.alloc(4); k.writeUInt32BE(crc(d));
    return Buffer.concat([delka, d, k]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', ihdr),
    blok('IDAT', zlib.deflateSync(Buffer.concat(radky))), blok('IEND', Buffer.alloc(0))]);
}
const DLAZDICE = dlazdice();

// Stránka, která napodobuje článek v Shoptetu: úzký obsah s okraji a „agresivní“ styly šablony
const VLOZENI = `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Článek</title>
<style>body{margin:0;font:15px/1.6 Arial,sans-serif}.content{max-width:780px;margin:0 auto;padding:0 15px}
img{max-width:100%;height:auto}button{background:#f0f;color:#000;text-transform:uppercase;padding:20px;width:100%}
ul,ol{padding-left:40px}li{margin:10px 0}li::before{content:"•";color:red}</style></head>
<body><div class="content"><h1>Článek o vláčcích</h1><p>Text článku…</p>
<div id="hs-mapa"></div><p>Konec článku.</p></div>
<script src="/mapa/hs-mapa.js?hs-mapa-dnes=${DATA.DNES}" defer></script></body></html>`;

const server = http.createServer((req, res) => {
  const adresa = decodeURIComponent(req.url.split('?')[0]);
  if (adresa === '/__vlozeni.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(VLOZENI); }
  if (adresa === '/kalendar/akce.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ akce: DATA.akce })); }
  if (adresa === '/akce-v-okoli/souradnice.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ akce: DATA.souradnice })); }
  const cesta = path.join(KOREN, adresa.endsWith('/') ? adresa + 'index.html' : adresa);
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  const typ = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' }[path.extname(cesta)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

async function priprav(context, pozadavky) {
  await context.route('https://tile.openstreetmap.org/**', (r) => {
    pozadavky.dlazdice++;
    return r.fulfill({ status: 200, contentType: 'image/png', body: DLAZDICE, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  if (LEAFLET_DIR) {
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/leaflet/**', (r) => {
      const soubor = path.join(LEAFLET_DIR, path.basename(new URL(r.request().url()).pathname));
      if (!fs.existsSync(soubor)) return r.fulfill({ status: 404 });
      return r.fulfill({ status: 200, body: fs.readFileSync(soubor), headers: {
        'Content-Type': soubor.endsWith('.css') ? 'text/css' : 'text/javascript', 'Access-Control-Allow-Origin': '*' } });
    });
  }
}

async function stavMapy(page) {
  return page.evaluate(() => {
    const el = document.getElementById('hs-mapa');
    const mapa = el.querySelector('.hsm-mapa').getBoundingClientRect();
    return {
      znacek: el.querySelectorAll('.leaflet-marker-icon.hsm-znacka-obal').length,
      pocet: el.querySelector('.hsm-pocet').textContent,
      seznam: [...el.querySelectorAll('.hsm-seznam .hsm-polozka-nazev')].map((a) => a.textContent),
      mista: [...el.querySelectorAll('.hsm-seznam .hsm-polozka-misto')].map((a) => a.textContent),
      atribuce: (el.querySelector('.leaflet-control-attribution') || {}).textContent || '',
      mapa: { left: mapa.left, width: mapa.width, height: mapa.height },
      sirka: document.documentElement.clientWidth,
      posun: document.documentElement.scrollWidth - window.innerWidth,
      cookie: document.cookie,
    };
  });
}

async function cekejNaMapu(page) {
  await page.waitForSelector('#hs-mapa[data-hs-mapa="hotovo"]', { timeout: 20000 });
  await page.waitForTimeout(400);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const zaklad = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const VSECH = 7, MIST = 6;
  try {
    for (const [nazev, viewport] of [['pc', { width: 1280, height: 900 }], ['mobil', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({
        viewport, deviceScaleFactor: 2, isMobile: nazev === 'mobil', hasTouch: nazev === 'mobil',
        geolocation: { latitude: 49.2, longitude: 16.6 }, permissions: ['geolocation'], locale: 'cs-CZ', timezoneId: 'Europe/Prague',
      });
      const pozadavky = { dlazdice: 0, cizi: [] };
      await priprav(context, pozadavky);
      const page = await context.newPage();
      const chybyStranky = [];
      page.on('pageerror', (e) => chybyStranky.push(e.message));
      page.on('request', (r) => {
        const u = r.url();
        if (!/^(http:\/\/127\.0\.0\.1|data:|https:\/\/tile\.openstreetmap\.org\/|https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/)/.test(u)) pozadavky.cizi.push(u);
      });

      // --- Samostatná stránka mapa/index.html ---
      await page.goto(`${zaklad}/mapa/?hs-mapa-dnes=${DATA.DNES}`);
      await cekejNaMapu(page);
      let s = await stavMapy(page);
      ok(s.znacek === MIST, `${nazev}: čekám ${MIST} bodů (Praha sloučená), je ${s.znacek}`);
      ok(s.pocet.includes(`${VSECH} akcí`) && s.pocet.includes(`${MIST} míst`), `${nazev}: počet: ${s.pocet}`);
      ok(s.seznam[0] === 'Výstava v depu Liberec' && s.seznam[1] === 'Mikulášský vlak Praha', `${nazev}: seznam podle data: ${s.seznam}`);
      ok(s.seznam.includes('Zimní <b>vlak</b> "Olomouc"'), `${nazev}: název s HTML se má ukázat jako text`);
      ok(/Leaflet/.test(s.atribuce) && /přispěvatelé OpenStreetMap/.test(s.atribuce), `${nazev}: atribuce: ${s.atribuce}`);
      ok(await page.$eval('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]', (a) => !!a), `${nazev}: odkaz na licenci OSM`);
      ok(pozadavky.dlazdice > 0, `${nazev}: nenačetly se dlaždice`);
      ok(await page.evaluate(() => {
        const sc = document.querySelector('script[src*="cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"]');
        return !!sc && /^sha384-/.test(sc.integrity) && sc.crossOrigin === 'anonymous';
      }), `${nazev}: Leaflet má mít integrity a crossorigin`);
      if (snimky) await page.screenshot({ path: path.join(snimky, `mapa-${nazev}.png`) });

      // Klik na sloučený bod Prahy → karta s oběma akcemi, datem a odkazem
      const praha = page.locator('.leaflet-marker-icon.hsm-znacka-obal', { has: page.locator('.hsm-znacka-pocet') });
      ok(await praha.count() === 1, `${nazev}: jeden bod s počtem akcí`);
      ok((await praha.textContent()).trim() === '2', `${nazev}: Praha má mít 2 akce`);
      await praha.click();
      await page.waitForSelector('.leaflet-popup .hsm-karta');
      const karta = await page.$eval('.leaflet-popup .hsm-karta', (k) => ({
        text: k.innerText, odkazy: [...k.querySelectorAll('a.hsm-karta-nazev')].map((a) => a.href) }));
      ok(karta.text.includes('so 7. listopadu') && karta.text.includes('so 21. listopadu'), `${nazev}: data v kartě: ${karta.text}`);
      ok(karta.text.includes('Mikulášský vlak Praha') && karta.text.includes('Sraz veteránů Praha'), `${nazev}: názvy v kartě`);
      ok(karta.odkazy.join() === `${DATA.W}praha-vlak/,${DATA.W}praha-auta/`, `${nazev}: odkazy v kartě: ${karta.odkazy}`);
      await page.waitForTimeout(400); // animace otevření karty
      if (snimky) await page.screenshot({ path: path.join(snimky, `mapa-${nazev}-karta.png`) });
      await page.keyboard.press('Escape');

      // Filtry: typ, kraj, kdy (+ uložení do adresy)
      await page.click('.hsm-typy .hsm-cip[data-typ="auta"]');
      s = await stavMapy(page);
      ok(s.znacek === 2 && s.seznam.join() === 'Sraz veteránů Praha,Traktoriáda Plzeň', `${nazev}: filtr auta: ${s.znacek} ${s.seznam}`);
      ok(page.url().includes('typ=auta'), `${nazev}: filtr v adrese: ${page.url()}`);
      await page.click('.hsm-typy .hsm-cip[data-typ=""]');
      await page.click('.hsm-kdy .hsm-cip[data-kdy="vikend"]');
      s = await stavMapy(page);
      ok(s.znacek === 3 && s.seznam.join() === 'Výstava v depu Liberec,Mikulášský vlak Praha,Letecký den Ostrava', `${nazev}: víkend: ${s.seznam}`);
      await page.click('.hsm-kdy .hsm-cip[data-kdy="mesic"]');
      s = await stavMapy(page);
      ok(s.znacek === 4 && s.seznam.length === 5, `${nazev}: tento měsíc: ${s.znacek} bodů, ${s.seznam.length} akcí`);
      await page.selectOption('.hsm-vyber', 'Liberecký kraj');
      s = await stavMapy(page);
      ok(s.znacek === 1 && s.seznam.join() === 'Výstava v depu Liberec', `${nazev}: kraj: ${s.seznam}`);
      await page.selectOption('.hsm-vyber', 'Olomoucký kraj');
      s = await stavMapy(page);
      ok(s.znacek === 0 && s.pocet.includes('žádné akce'), `${nazev}: prázdný výběr: ${s.pocet}`);
      ok(page.url().includes('kdy=mesic') && page.url().includes('kraj=Olomouck'), `${nazev}: adresa: ${page.url()}`);
      await page.selectOption('.hsm-vyber', '');
      await page.click('.hsm-kdy .hsm-cip[data-kdy="vse"]');

      // Odkaz s filtry funguje i po načtení
      const p2 = await context.newPage();
      await p2.goto(`${zaklad}/mapa/?hs-mapa-dnes=${DATA.DNES}&typ=lode`);
      await cekejNaMapu(p2);
      s = await stavMapy(p2);
      ok(s.znacek === 1 && s.seznam.join() === 'Plavba po Svratce', `${nazev}: ?typ=lode: ${s.seznam}`);
      ok(await p2.$eval('.hsm-cip[data-typ="lode"]', (b) => b.getAttribute('aria-pressed')) === 'true', `${nazev}: aktivní čip`);
      await p2.close();

      // Moje poloha (u Brna) → řazení podle vzdálenosti, značka polohy, nic se neposílá
      const predPolohou = pozadavky.cizi.length;
      await page.click('.hsm-poloha');
      await page.waitForSelector('.hsm-ja');
      await page.waitForTimeout(400);
      s = await stavMapy(page);
      ok(s.seznam[0] === 'Plavba po Svratce' && s.seznam[1] === 'Zimní <b>vlak</b> "Olomouc"', `${nazev}: podle vzdálenosti: ${s.seznam}`);
      ok(/do 2 km$/.test(s.mista[0]) && /cca \d+ km$/.test(s.mista[1]), `${nazev}: vzdálenost v seznamu: ${s.mista}`);
      ok(await page.$eval('.hsm-seznam-nadpis', (e) => e.textContent) === 'Nejbližší akce', `${nazev}: nadpis seznamu`);
      ok(pozadavky.cizi.length === predPolohou, `${nazev}: po zjištění polohy odešel požadavek`);
      const url = page.url();
      ok(!/49\.2|16\.6|lat|lon/.test(url), `${nazev}: poloha nesmí být v adrese: ${url}`);
      if (snimky) await page.screenshot({ path: path.join(snimky, `mapa-${nazev}-poloha.png`), fullPage: true });

      // Tlačítko „Na mapě“ v seznamu otevře kartu bodu
      await page.click('.hsm-seznam .hsm-ukazat');
      await page.waitForSelector('.leaflet-popup .hsm-karta');
      ok((await page.$eval('.leaflet-popup .hsm-karta', (k) => k.innerText)).includes('Plavba po Svratce'), `${nazev}: Na mapě → karta`);

      ok(!s.cookie && !(await context.cookies()).length, `${nazev}: nesmí vzniknout cookies`);
      ok(!pozadavky.cizi.length, `${nazev}: požadavky na cizí servery: ${pozadavky.cizi.join(', ')}`);
      if (nazev === 'mobil') ok(s.posun <= 0, `mobil: stránka se posouvá do strany o ${s.posun}px`);
      ok(!chybyStranky.length, `${nazev}: chyby JS: ${chybyStranky.join('; ')}`);

      // --- Vložení do článku (napodobenina Shoptetu) ---
      const v = await context.newPage();
      await v.goto(`${zaklad}/__vlozeni.html?hs-mapa-dnes=${DATA.DNES}`);
      await cekejNaMapu(v);
      s = await stavMapy(v);
      ok(s.znacek === MIST, `${nazev} (vložení): ${s.znacek} bodů`);
      if (nazev === 'mobil') {
        ok(Math.abs(s.mapa.left) < 1 && Math.abs(s.mapa.width - s.sirka) < 1, `mobil (vložení): mapa přes celou šířku: ${JSON.stringify(s.mapa)} / ${s.sirka}`);
        ok(s.posun <= 0, `mobil (vložení): posun do strany ${s.posun}px`);
        ok(s.mapa.height >= 360, `mobil (vložení): výška mapy ${s.mapa.height}`);
      } else {
        ok(s.mapa.left > 200 && s.mapa.width <= 780, `pc (vložení): mapa má zůstat v obsahu článku: ${JSON.stringify(s.mapa)}`);
      }
      const dl = await v.$eval('.leaflet-tile', (i) => ({ w: i.getBoundingClientRect().width, h: i.getBoundingClientRect().height }));
      ok(Math.round(dl.w) === 256 && Math.round(dl.h) === 256, `${nazev} (vložení): styly šablony rozbily dlaždice: ${JSON.stringify(dl)}`);
      const cip = await v.$eval('.hsm-cip', (b) => getComputedStyle(b).textTransform + '/' + Math.round(b.getBoundingClientRect().width));
      ok(cip.startsWith('none/') && parseInt(cip.split('/')[1], 10) < 200, `${nazev} (vložení): čip ovlivněný šablonou: ${cip}`);
      if (snimky) await v.screenshot({ path: path.join(snimky, `mapa-${nazev}-clanek.png`), fullPage: true });
      console.log(`OK (${nazev}): ${MIST} bodů, sloučené místo, karta s datem/názvem/odkazem, filtry typ/kraj/kdy, ` +
        'moje poloha, atribuce OSM, bez cookies, vložení do článku');
      await context.close();
    }

    // Leaflet se nenačte → zpráva a seznam akcí funguje dál
    const context = await browser.newContext({ viewport: { width: 1000, height: 800 } });
    await context.route('https://cdnjs.cloudflare.com/**', (r) => r.abort());
    const page = await context.newPage();
    await page.goto(`${zaklad}/mapa/?hs-mapa-dnes=${DATA.DNES}`);
    await page.waitForSelector('.hsm-mapa-stav:has-text("nepodařilo")', { timeout: 15000 });
    ok(await page.$$eval('.hsm-seznam .hsm-polozka', (l) => l.length) === VSECH, 'bez Leafletu: seznam akcí');
    console.log('OK: bez Leafletu (výpadek cdnjs) zůstane seznam akcí');
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error('CHYBA: ' + (e && e.message || e)); process.exit(1); });
