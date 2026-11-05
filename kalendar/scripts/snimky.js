// Vytvoří snímky obrazovky pro manifest (instalační nabídka Androidu) a podklad pro Google Play.
//   python3 -m http.server 8765 --bind 127.0.0.1   (v kořeni repozitáře, v jiném okně)
//   node kalendar/scripts/snimky.js [http://localhost:8765/kalendar/]
// Potřebuje Playwright s Chromiem. Výsledek: kalendar/screenshots/mobil-*.png a pocitac.png.
const path = require('path');
const { chromium } = require('playwright');
const ADRESA = process.argv[2] || 'http://localhost:8765/kalendar/';
const CIL = path.join(__dirname, '..', 'screenshots');

(async () => {
  const b = await chromium.launch();
  const snimky = [
    ['mobil-seznam.png', { width: 412, height: 892 }, 2, true, ''],
    ['mobil-filtry.png', { width: 412, height: 892 }, 2, true, 'filtry'],
    ['pocitac.png', { width: 1280, height: 800 }, 1, false, ''],
  ];
  for (const [soubor, viewport, deviceScaleFactor, isMobile, rezim] of snimky) {
    const ctx = await b.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch: isMobile, serviceWorkers: 'block' });
    // na snímcích bez tlačítka „Přidat do mobilu“
    await ctx.addInitScript(() => { try { localStorage.setItem('hs-kalendar-instalace', 'zavreno'); } catch (e) {} });
    const p = await ctx.newPage();
    await p.goto(ADRESA);
    await p.waitForSelector('.karta');
    if (rezim === 'filtry') await p.click('#prepinac-filtru');
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(CIL, soubor) });
    console.log('OK', soubor);
    await ctx.close();
  }
  await b.close();
})();
