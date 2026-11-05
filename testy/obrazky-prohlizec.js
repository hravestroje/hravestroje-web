// Test generátoru obrázku akce v prohlížeči (Chromium přes Playwright).
//   node testy/obrazky-prohlizec.js [složka-pro-snímky]
// Kontroluje rozměry obou formátů, barvy, předvyplnění z akce.json, že ilustrace stojí
// na spodní linii (i po změně velikosti a posunu) a že tlačítko stáhne PNG správných rozměrů.
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

const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let cesta = path.join(KOREN, decodeURIComponent(req.url.split('?')[0]));
  if (cesta.endsWith(path.sep)) cesta = path.join(cesta, 'index.html');
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (TYPY[path.extname(cesta)] || 'text/plain') + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

const rozmeryPng = (buf) => {
  ok(buf.slice(1, 4).toString() === 'PNG', 'stažený soubor není PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};

// Rozbor plátna: barvy na místech a řádky, kde je červená ilustrace.
async function rozbor(page) {
  return page.evaluate(() => {
    const c = document.getElementById('platno');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    let horni = -1, dolni = -1, levy = c.width, pravy = -1, zluta = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] > d[i + 1] + 20 && d[i] > d[i + 2] + 20 && d[i + 1] < 150) { // červená (i vyhlazený okraj)
          if (horni < 0) horni = y;
          dolni = y; levy = Math.min(levy, x); pravy = Math.max(pravy, x);
        }
        if (d[i] > 220 && d[i + 1] > 170 && d[i + 2] < 80) zluta++;
      }
    }
    return { w: c.width, h: c.height, zeme: +c.dataset.zeme, roh: px(5, 5), plocha: px(8, Math.round(c.height * 0.55)),
      horni, dolni, levy, pravy, zluta };
  });
}

async function nastavRozsah(page, id, hodnota) {
  await page.evaluate(([id, v]) => {
    const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [id, String(hodnota)]);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const zaklad = `http://127.0.0.1:${server.address().port}`;
  const prohlizec = await chromium.launch();
  const kontext = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });

  // Testovací ilustrace 300×200: červený obdélník, spodních 40 řádků průhledných (nesmí viset ve vzduchu).
  const pomocna = await kontext.newPage();
  const png = Buffer.from((await pomocna.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#ff0000'; x.fillRect(10, 20, 280, 140);
    return c.toDataURL('image/png');
  })).split(',')[1], 'base64');
  await pomocna.close();

  const page = await kontext.newPage();
  const chyby = [];
  page.on('pageerror', (e) => chyby.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
  await page.route('**/obrazky/ilustrace.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ilustrace: [{ nazev: 'Testovací červená', url: 'ilustrace/test-cervena.png', typy: ['vlaky'] }] }),
  }));
  await page.route('**/obrazky/ilustrace/test-cervena.png', (route) => route.fulfill({ contentType: 'image/png', body: png }));

  await page.goto(`${zaklad}/obrazky/`);
  await page.waitForSelector('body[data-pripraveno="1"]');

  // Výchozí stav: 1200×630, barvy hlavičky a plochy
  let r = await rozbor(page);
  ok(r.w === 1200 && r.h === 630, `web: rozměr ${r.w}×${r.h}`);
  ok(r.roh.join() === '30,111,63', 'hlavička #1e6f3f: ' + r.roh);
  ok(r.plocha.join() === '233,244,236', 'plocha #e9f4ec: ' + r.plocha);
  ok(r.horni === -1, 'bez ilustrace nemá být nic červeného');

  // Výběr akce z kalendáře předvyplní údaje
  const akce = JSON.parse(fs.readFileSync(path.join(KOREN, 'kalendar/akce.json'), 'utf8')).akce;
  const pocetMoznosti = await page.locator('#akce option').count();
  ok(pocetMoznosti > 1, 'v nabídce nejsou akce z akce.json');
  const vlakova = akce.find((a) => !a.zruseno && (a.typy || []).includes('vlaky') && a.misto && a.kraj);
  const hodnota = await page.evaluate((nazev) => {
    const o = [...document.querySelectorAll('#akce option')].find((x) => x.textContent.endsWith(' – ' + nazev));
    return o && o.value;
  }, vlakova.nazev);
  ok(hodnota, 'akce není v nabídce: ' + vlakova.nazev);
  await page.selectOption('#akce', hodnota);
  ok(await page.inputValue('#nazev') === vlakova.nazev, 'název nepředvyplněn');
  ok(await page.inputValue('#misto') === vlakova.misto, 'místo nepředvyplněno');
  ok(await page.inputValue('#kraj') === vlakova.kraj, 'kraj nepředvyplněn');
  ok((await page.inputValue('#datum')).length > 5, 'datum nepředvyplněno');
  await page.fill('#poradatel', 'Klub přátel železnic');

  // Vlaková akce sama vybere ilustraci s typem vlaky; ta stojí na zemi
  await page.waitForFunction(() => document.getElementById('platno').dataset.ilustrace);
  ok(await page.inputValue('#ilustrace') === '0', 'ilustrace podle typu akce se nevybrala');
  for (const format of ['web', 'site']) {
    await page.check(`input[name="format"][value="${format}"]`);
    for (const [velikost, posun] of [[80, 0], [100, 0], [35, -100], [50, 100], [20, 40]]) {
      await nastavRozsah(page, 'velikost', velikost);
      await nastavRozsah(page, 'posun', posun);
      r = await rozbor(page);
      const cekam = format === 'web' ? [1200, 630] : [1080, 1350];
      ok(r.w === cekam[0] && r.h === cekam[1], `${format}: rozměr ${r.w}×${r.h}`);
      ok(r.horni >= 0, `${format} ${velikost}/${posun}: ilustrace není vidět`);
      ok(r.dolni >= r.zeme - 2 && r.dolni <= r.zeme - 1, `${format} ${velikost}/${posun}: ilustrace končí na ř. ${r.dolni}, země je ${r.zeme} (visí ve vzduchu?)`);
      ok(r.levy >= 0 && r.pravy < r.w, `${format}: ilustrace mimo obrázek`);
      ok(r.zluta > 200, `${format}: chybí žluté datum`);
      if (posun === -100) ok(r.pravy < r.w / 2, `${format}: posun vlevo nefunguje`);
      if (posun === 100) ok(r.levy > r.w / 2, `${format}: posun vpravo nefunguje`);
    }
    await page.click('#vystredit');
    if (snimky) await page.locator('#platno').screenshot({ path: path.join(snimky, `obrazky-${format}.png`) });
  }

  // Stažení PNG v obou formátech
  for (const [format, w, h] of [['web', 1200, 630], ['site', 1080, 1350]]) {
    await page.check(`input[name="format"][value="${format}"]`);
    const [stazeni] = await Promise.all([page.waitForEvent('download'), page.click('#stahnout')]);
    const soubor = await stazeni.path();
    const rozm = rozmeryPng(fs.readFileSync(soubor));
    ok(rozm.w === w && rozm.h === h, `${format}: stažené PNG má ${rozm.w}×${rozm.h}`);
    ok(/^obrazek-.+-\d+x\d+\.png$/.test(stazeni.suggestedFilename()), 'název souboru: ' + stazeni.suggestedFilename());
    if (snimky) fs.copyFileSync(soubor, path.join(snimky, `stazeno-${format}.png`));
  }

  // Ruční vyplnění a ilustrace ze souboru
  await page.selectOption('#akce', '');
  await page.fill('#nazev', 'Ruční akce');
  await page.setInputFiles('#soubor', { name: 'moje.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.getElementById('ilustrace').value === '');
  await page.check('input[name="format"][value="web"]');
  r = await rozbor(page);
  ok(r.dolni >= r.zeme - 2 && r.dolni <= r.zeme - 1, 'ilustrace ze souboru nestojí na zemi');
  const [stazeni] = await Promise.all([page.waitForEvent('download'), page.click('#stahnout')]);
  ok(stazeni.suggestedFilename() === 'obrazek-rucni-akce-1200x630.png', stazeni.suggestedFilename());

  // Mobil: bez vodorovného posouvání stránky
  await page.setViewportSize({ width: 375, height: 800 });
  const presah = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(presah <= 0, `na mobilu stránka přetéká o ${presah} px`);
  if (snimky) await page.screenshot({ path: path.join(snimky, 'obrazky-mobil.png'), fullPage: true });

  ok((await kontext.cookies()).length === 0, 'stránka nastavila cookies');
  ok(chyby.length === 0, 'chyby na stránce: ' + chyby.join(' | '));
  await prohlizec.close();
  server.close();
  console.log('OK: obrázek akce – rozměry 1200×630 a 1080×1350, barvy, předvyplnění z akce.json, ilustrace na zemi, stažení PNG, bez cookies');
})().catch((e) => { console.error(e); process.exit(1); });
