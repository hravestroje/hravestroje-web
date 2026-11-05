// Test dlaždic produktů (hs-darky.js) v Chromiu přes Playwright – PC i mobil.
//   node produkty/testy/dlazdice-prohlizec.cjs [složka-pro-snímky]
// Bez Playwrightu se test přeskočí. Obrázky se nestahují z internetu – podvrhnou se SVG.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const PRODUKTY = path.join(__dirname, '..');
const snimky = process.argv[2];
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };

const obr = (n) => `https://img.test/${n}.jpg`;
const produkt = (id, obrazky, navic) => Object.assign({
  nazev: 'Produkt ' + id + ' s dlouhým názvem, který se má hezky zalomit', cena: 100 + id,
  url: 'https://www.hravestroje.cz/p-' + id + '/', obrazek: obrazky[0] || null, obrazky,
  kategorie: [], skladem: true, temata: ['t' + Math.floor(id / 10)]
}, navic || {});
// t1: 4 produkty (2×2) – víc obrázků, jeden obrázek, ruční náhled, bez obrazky (starý formát)
// t2: 6 produktů (3×2), t3: 5 produktů → 4 (2×2), t4: 7 produktů → 6 (3×2), t9: daleko dole (lazy)
const DATA = {
  mena: 'CZK', sezony: [],
  produkty: [
    produkt(10, [obr('10a'), obr('10b'), obr('10c')]),
    produkt(11, [obr('11a')]),
    produkt(12, [obr('12a'), obr('12b'), obr('12c'), obr('12d'), obr('12e'), obr('12f')], { nahled: true }),
    Object.assign(produkt(13, []), { obrazek: obr('13a'), obrazky: undefined }),
  ]
};
for (let i = 20; i < 26; i++) DATA.produkty.push(produkt(i, [obr(i + 'a')]));
for (let i = 30; i < 35; i++) DATA.produkty.push(produkt(i, [obr(i + 'a')]));
for (let i = 40; i < 47; i++) DATA.produkty.push(produkt(i, [obr(i + 'a')]));
for (let i = 90; i < 94; i++) DATA.produkty.push(produkt(i, [obr(i + 'a'), obr(i + 'b')]));

const STRANKA = `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>test</title>
<style>body{margin:0;font:16px/1.5 sans-serif}main{max-width:900px;margin:0 auto;padding:16px}</style></head><body><main>
<div class="hs-darky" id="b1" data-tema="t1" data-doplnit="ne"><p>statické</p></div>
<div class="hs-darky" id="b2" data-tema="t2" data-doplnit="ne"><p>statické</p></div>
<div class="hs-darky" id="b3" data-tema="t3" data-doplnit="ne"><p>statické</p></div>
<div class="hs-darky" id="b4" data-tema="t4" data-doplnit="ne" data-pocet="8"><p>statické</p></div>
<div style="height:6000px"></div>
<div class="hs-darky" id="b9" data-tema="t9" data-doplnit="ne"><p>statické</p></div>
</main><script>window.HS_DARKY_DATA = ${JSON.stringify(DATA)};</script>
<script src="/hs-darky.js" defer></script></body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/test.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(STRANKA); }
  const cesta = path.join(PRODUKTY, decodeURIComponent(url));
  if (!cesta.startsWith(PRODUKTY) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  const typ = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' }[path.extname(cesta)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

const BARVY = ['#e8b04a', '#5b8fd1', '#7cb36b', '#d1665b', '#9a7cc9', '#4fb3b0'];
function svg(text) {
  const b = BARVY[[...text].reduce((s, z) => s + z.charCodeAt(0), 0) % BARVY.length];
  const t = text.replace(/[<&>]/g, '').slice(0, 40);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${b}"/>` +
    `<text x="400" y="320" font-size="44" text-anchor="middle" font-family="sans-serif" fill="#fff">${t}</text></svg>`;
}
async function podvrhniObrazky(context, pozadovane) {
  await context.route(/^https:\/\/(img\.test|placehold\.co)\//, (route) => {
    const u = new URL(route.request().url());
    pozadovane.push(u.href);
    const text = u.searchParams.get('text') || u.pathname.slice(1);
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(text) });
  });
}

function rozbor(page, id) {
  return page.evaluate((id) => {
    const box = document.getElementById(id);
    const karty = [...box.querySelectorAll('.hs-darky-karta')].map((k) => {
      const r = k.getBoundingClientRect(), f = k.querySelector('.hs-darky-foto').getBoundingClientRect();
      const img = k.querySelector('img');
      const ir = img ? img.getBoundingClientRect() : null;
      const vid = (s) => { const e = k.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; };
      return {
        id: +k.querySelector('a').href.match(/p-(\d+)/)[1], x: Math.round(r.left), y: Math.round(r.top), w: r.width, fotoW: f.width, fotoH: f.height,
        imgW: ir && ir.width, imgH: ir && ir.height, fit: img && getComputedStyle(img).objectFit,
        imgs: k.querySelectorAll('img').length, lazy: [...k.querySelectorAll('img')].every((i) => i.loading === 'lazy'),
        rozmery: [...k.querySelectorAll('img')].every((i) => i.getAttribute('width') === '800' && i.getAttribute('height') === '600'),
        tecky: k.querySelectorAll('.hs-darky-tecky span').length, tecky_vid: vid('.hs-darky-tecky'), sipky_vid: vid('.hs-darky-sipka'),
        stitek: (k.querySelector('.hs-darky-stitek') || {}).textContent || '',
        tlacitko: (k.querySelector('.hs-darky-tlacitko') || {}).textContent,
        tlacitkoBarva: k.querySelector('.hs-darky-tlacitko') && getComputedStyle(k.querySelector('.hs-darky-tlacitko')).backgroundColor,
        cena: (k.querySelector('.hs-darky-cena') || {}).textContent,
      };
    });
    return { karty, sloupce: new Set(karty.map((k) => k.x)).size, rady: new Set(karty.map((k) => k.y)).size,
      sirkaStranky: document.documentElement.scrollWidth, okno: innerWidth };
  }, id);
}

const ZELENA = 'rgb(31, 111, 61)';
function spolecne(r, id) {
  for (const k of r.karty) {
    ok(Math.abs(k.fotoH - k.fotoW * 0.75) < 1.5, `${id}: obrázek má mít poměr 4:3 (${k.fotoW}×${k.fotoH})`);
    ok(Math.abs(k.fotoW - k.w) < 3, `${id}: obrázek má být přes celou šířku karty (${k.fotoW} vs ${k.w})`);
    ok(Math.abs(k.imgW - k.fotoW) < 1.5 && Math.abs(k.imgH - k.fotoH) < 1.5 && k.fit === 'cover', `${id}: img vyplní plochu, object-fit cover`);
    ok(k.lazy && k.rozmery, `${id}: obrázky lazy a s rozměry width/height`);
    ok(k.tlacitko === 'Prohlédnout' && k.tlacitkoBarva === ZELENA, `${id}: tlačítko Prohlédnout zelené: ${k.tlacitkoBarva}`);
    ok(/Kč/.test(k.cena), `${id}: cena`);
  }
  ok(r.sirkaStranky <= r.okno, `${id}: stránka nesmí jít posouvat do strany (${r.sirkaStranky} > ${r.okno})`);
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const zaklad = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  // ------------------------------------------------------------------ PC
  {
    const pozadovane = [];
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await podvrhniObrazky(context, pozadovane);
    const page = await context.newPage();
    await page.goto(zaklad + '/test.html');
    await page.waitForSelector('#b1 .hs-darky-karta');
    await page.waitForLoadState('networkidle');

    const b1 = await rozbor(page, 'b1');
    spolecne(b1, 'PC b1');
    ok(b1.karty.length === 4 && b1.sloupce === 2 && b1.rady === 2, `PC: 4 produkty = 2×2, je ${b1.sloupce}×${b1.rady}`);
    const podle = (id) => b1.karty.find((k) => k.id === id);
    const [vice, jeden, nahled, stary] = [podle(10), podle(11), podle(12), podle(13)];
    ok(vice.imgs === 2, 'PC: víc obrázků → načtou se jen 2 (obálka + náhled po najetí), je ' + vice.imgs);
    ok(jeden.imgs === 1 && stary.imgs === 1, 'PC: jeden obrázek / starý formát bez "obrazky" → 1 img');
    ok(!vice.tecky_vid && !vice.sipky_vid, 'PC: bez teček a šipek');
    ok(nahled.stitek === 'Ukázka obsahu uvnitř' && vice.stitek === '' && jeden.stitek === '', 'PC: štítek jen u ručního náhledu');

    const b2 = await rozbor(page, 'b2');
    spolecne(b2, 'PC b2');
    ok(b2.karty.length === 6 && b2.sloupce === 3 && b2.rady === 2, `PC: 6 produktů = 3×2, je ${b2.sloupce}×${b2.rady}`);
    ok(b2.karty[0].w >= 260, 'PC: karty jsou velké (≥ 260 px), je ' + b2.karty[0].w);
    const b3 = await rozbor(page, 'b3');
    ok(b3.karty.length === 4 && b3.sloupce === 2 && b3.rady === 2, `PC: 5 produktů → 4 (2×2), je ${b3.karty.length} ${b3.sloupce}×${b3.rady}`);
    const b4 = await rozbor(page, 'b4');
    ok(b4.karty.length === 6 && b4.sloupce === 3, `PC: 7 produktů → 6 (3×2), je ${b4.karty.length}`);

    // lazy: obrázky boxu daleko pod okrajem se zatím nestahují
    ok(!pozadovane.some((u) => /\/9\d[ab]\.jpg/.test(u)), 'PC: obrázky daleko dole se nemají stahovat hned');
    ok(pozadovane.includes(obr('10b')), 'PC: náhled (2. obrázek) viditelné karty je přednačtený pro hladké přepnutí');

    // najetí myší → plynule 2. obrázek
    const pruhlednost = () => page.evaluate(() => {
      const i = document.querySelector('#b1 a[href$="/p-10/"]').closest('.hs-darky-karta').querySelectorAll('img');
      return [+getComputedStyle(i[0]).opacity, +getComputedStyle(i[1]).opacity, getComputedStyle(i[1]).transitionProperty];
    });
    let [o1, o2, prechod] = await pruhlednost();
    ok(o1 === 1 && o2 === 0 && /opacity/.test(prechod), `PC: před najetím je vidět obálka (${o1}/${o2}), přechod ${prechod}`);
    await page.locator('#b1 .hs-darky-karta', { has: page.locator('a[href$="/p-10/"]') }).hover();
    await page.waitForTimeout(700);
    [o1, o2] = await pruhlednost();
    ok(o2 === 1, 'PC: po najetí myší je vidět 2. obrázek, opacity ' + o2);
    if (snimky) await page.locator('#b1').screenshot({ path: path.join(snimky, 'test-pc-hover.png') });

    await page.mouse.move(5, 5);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    ok(pozadovane.some((u) => /\/90a\.jpg/.test(u)), 'PC: po doscrollování se obrázky dole stáhnou');
    await context.close();
    console.log('OK: PC – mřížka 2×2 / 3×2 bez poloprázdné řady, 4:3 cover, najetí myší, štítek, lazy');
  }

  // ------------------------------------------------------------------ mobil
  {
    const pozadovane = [];
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    await podvrhniObrazky(context, pozadovane);
    const page = await context.newPage();
    await page.goto(zaklad + '/test.html');
    await page.waitForSelector('#b1 .hs-darky-karta');
    const b1 = await rozbor(page, 'b1');
    spolecne(b1, 'mobil b1');
    ok(b1.sloupce === 1 && b1.rady === 4, `mobil: karty pod sebou, je ${b1.sloupce}×${b1.rady}`);
    const podle = (id) => b1.karty.find((k) => k.id === id);
    const [vice, jeden, nahled] = [podle(10), podle(11), podle(12)];
    ok(vice.imgs === 3 && vice.tecky === 3 && vice.tecky_vid && vice.sipky_vid, 'mobil: 3 obrázky, 3 tečky, šipky');
    ok(nahled.imgs === 5 && nahled.tecky === 5, 'mobil: nejvýš 5 obrázků k prolistování, je ' + nahled.imgs);
    ok(jeden.imgs === 1 && jeden.tecky === 0 && !jeden.sipky_vid, 'mobil: jeden obrázek → bez teček a šipek');
    ok(nahled.stitek === 'Ukázka obsahu uvnitř', 'mobil: štítek');
    const b2 = await rozbor(page, 'b2');
    ok(b2.sloupce === 1, 'mobil: i 6 produktů pod sebou');

    // šipka → další obrázek, tečka se přepne; odkaz se neotevře
    const karta = page.locator('#b1 .hs-darky-karta', { has: page.locator('a[href$="/p-10/"]') });
    await karta.scrollIntoViewIfNeeded();
    await karta.locator('.hs-darky-sipka--dal').tap();
    await page.waitForTimeout(800);
    const stav = () => karta.evaluate((k) => {
      const pas = k.querySelector('.hs-darky-pas');
      return { index: Math.round(pas.scrollLeft / pas.clientWidth),
        tecka: [...k.querySelectorAll('.hs-darky-tecky span')].findIndex((s) => s.className === 'hs-aktivni') };
    });
    let s = await stav();
    ok(page.url().endsWith('/test.html'), 'mobil: šipka nesmí otevřít produkt');
    ok(s.index === 1 && s.tecka === 1, `mobil: po šipce 2. obrázek a 2. tečka, je ${JSON.stringify(s)}`);
    await karta.locator('.hs-darky-sipka--zpet').tap();
    await karta.locator('.hs-darky-sipka--zpet').tap();
    await page.waitForTimeout(900);
    s = await stav();
    ok(s.index === 2 && s.tecka === 2, `mobil: zpět z 1. obrázku → poslední, je ${JSON.stringify(s)}`);
    // na mobilu snímek okna (snímek vysokého prvku natahuje okno a rozhodí scroll-snap)
    if (snimky) await page.screenshot({ path: path.join(snimky, 'test-mobil.png') });
    await context.close();
    console.log('OK: mobil – karty pod sebou, tečky a šipky, listování, bez posouvání stránky do strany');
  }

  // ------------------------------------------------------------------ snímky demo.html
  if (snimky) {
    for (const [nazev, nastaveni] of [['demo-pc', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }], ['demo-mobil', devices['iPhone 13']]]) {
      const context = await browser.newContext(nastaveni);
      await podvrhniObrazky(context, []);
      const page = await context.newPage();
      await page.goto(zaklad + '/demo.html?hs-mesic=3');
      await page.waitForSelector('#box-ctyri .hs-darky-karta');
      await page.locator('#box-ctyri').scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      if (nazev === 'demo-pc') await page.locator('#box-ctyri').screenshot({ path: path.join(snimky, nazev + '-2x2.png') });
      else await page.screenshot({ path: path.join(snimky, nazev + '-2x2.png') });
      await context.close();
    }
    console.log('Snímky uloženy do ' + snimky);
  }

  await browser.close();
  server.close();
  console.log('Všechny testy dlaždic v prohlížeči prošly.');
})().catch((e) => { console.error(e); process.exit(1); });
