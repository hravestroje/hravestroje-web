// Test bloku nabídek v prohlížeči (Chromium přes Playwright) na PC i mobilu.
//   node testy/nabidky-prohlizec.js [složka-pro-snímky]
// Když Playwright není nainstalovaný (např. v GitHub Actions), test se přeskočí.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const KOREN = path.join(__dirname, '..');
const snimky = process.argv[2];
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };

const server = http.createServer((req, res) => {
  const cesta = path.join(KOREN, decodeURIComponent(req.url.split('?')[0]));
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  const typ = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(cesta)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

async function rozbor(page, id) {
  return page.evaluate((id) => {
    const box = document.getElementById(id);
    const karty = [...box.querySelectorAll('.hs-nabidky-karta')].map((k) => {
      const r = k.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width) };
    });
    const odkazy = [...box.querySelectorAll('a')].map((a) => ({ href: a.href, rel: a.rel, target: a.target }));
    return {
      viditelny: box.offsetHeight > 0, vyska: box.offsetHeight, text: box.innerText, karty, odkazy,
      sloupce: new Set(karty.map((k) => k.x)).size, rady: new Set(karty.map((k) => k.y)).size
    };
  }, id);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const zaklad = `http://127.0.0.1:${server.address().port}/nabidky/demo.html`;
  const browser = await chromium.launch();
  try {
    for (const [nazev, viewport] of [['pc', { width: 1280, height: 900 }], ['mobil', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const ciziPozadavky = [];
      page.on('request', (r) => { if (!/^(http:\/\/127\.0\.0\.1|data:)/.test(r.url())) ciziPozadavky.push(r.url()); });
      await page.goto(zaklad);
      await page.waitForSelector('#blok-2x2[data-hs-hotovo]');

      const a = await rozbor(page, 'blok-2x2');
      ok(a.karty.length === 4, `${nazev}: 2×2 má mít 4 karty, má ${a.karty.length}`);
      ok(a.text.includes('Tip na výlet (reklama)') || a.text.includes('TIP NA VÝLET (REKLAMA)'), `${nazev}: chybí popisek reklamy`);
      ok(!/prošlá|skrytá vzorová/i.test(a.text), `${nazev}: zobrazila se prošlá nabídka nebo ukázka`);
      for (const o of a.odkazy) {
        ok(o.rel === 'sponsored nofollow noopener' && o.target === '_blank', `${nazev}: špatný rel/target ${JSON.stringify(o)}`);
        ok(o.href.includes('utm_source=hravestroje&utm_medium=clanek'), `${nazev}: chybí UTM v ${o.href}`);
      }
      const b = await rozbor(page, 'blok-3');
      const nic = await rozbor(page, 'blok-nic');
      ok(b.karty.length === 3, `${nazev}: blok-3 má mít 3 karty, má ${b.karty.length}`);
      ok(!nic.viditelny && nic.vyska === 0, `${nazev}: blok bez nabídek má být skrytý`);
      if (nazev === 'pc') {
        ok(a.sloupce === 2 && a.rady === 2, `pc: 4 nabídky mají být 2×2 (sloupce ${a.sloupce}, řady ${a.rady})`);
        ok(b.sloupce === 3 && b.rady === 1, `pc: 3 nabídky mají být vedle sebe (sloupce ${b.sloupce}, řady ${b.rady})`);
      } else {
        ok(a.sloupce === 1 && b.sloupce === 1, 'mobil: karty mají být pod sebou');
        const posun = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        ok(posun <= 0, `mobil: stránka se posouvá do strany o ${posun}px`);
      }
      ok(await page.evaluate(() => document.cookie) === '', `${nazev}: skript nastavil cookie`);
      ok(!ciziPozadavky.length, `${nazev}: požadavky na cizí servery: ${ciziPozadavky.join(', ')}`);
      if (snimky) await page.screenshot({ path: path.join(snimky, `nabidky-${nazev}.png`), fullPage: true });
      console.log(`OK (${nazev}): 2×2 / 3 vedle sebe / pod sebou, prázdný blok skrytý, rel+UTM, bez cookies`);
      await page.close();
    }

    // Skutečný nabidky.json (zatím jen ukázky) → nic se nezobrazí
    const page = await browser.newPage();
    await page.goto(zaklad + '?data=ziva');
    await page.waitForLoadState('networkidle');
    for (const id of ['blok-2x2', 'blok-3', 'blok-nic']) {
      const r = await rozbor(page, id);
      ok(!r.viditelny && !r.karty.length, `ostrá data: blok ${id} se nemá zobrazit (jsou tam jen ukázky)`);
    }
    console.log('OK: s ostrým nabidky.json (jen ukázky) se nezobrazí žádný blok');
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
