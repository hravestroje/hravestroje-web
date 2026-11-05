// Test uspořádání seznamu v Chromiu (Playwright) na mobilu i PC – stránka kalendar/ i hs-kalendar.js:
//  - jeden seznam podle data, probíhající akce pod „Dnes“ s dnešním datem a štítkem „probíhá do …“
//  - sbalitelná sekce „Sezónní a dlouhodobé akce“ pod seznamem (štítek od–do, odkaz #akce-… ji rozbalí)
//  - akce s konkrétními dny ("dny", "dny_v_tydnu") v každém dni konání, filtr „Tento víkend“
//  - hs-kalendar.js s data-kraj / data-typ (předvolba, JSON-LD jen pro stránku, adresa, Zrušit filtry)
//  - dlaždice produktu v kalendar/: obrázek 4:3 přes celou šířku, druhý obrázek z „obrazky“ po najetí
//    myší (PC) a listováním (mobil), bez „obrazky“ jen „obrazek“
// „Dnes“ je pevně středa 4. 11. 2026 (hodiny prohlížeče).  node testy/kalendar-seznam-prohlizec.js [složka-pro-snímky]
// Když Playwright není nainstalovaný (např. v GitHub Actions), test se přeskočí.
const http = require('http');
const fs = require('fs');
const path = require('path');
let pw;
try { pw = require('playwright'); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const { chromium, devices } = pw;
const KOREN = path.join(__dirname, '..');
const snimky = process.argv[2];
const ok = (podminka, text) => { if (!podminka) throw new Error(text); };
const TED = new Date(2026, 10, 4, 12, 0); // středa 4. 11. 2026

const W = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/';
const DATA = {
  aktualizovano: new Date(2026, 10, 4, 3, 0).toISOString(),
  akce: [
    { id: 'zub', nazev: 'Zubačka Tanvald – Harrachov', zacatek: '2026-10-03', konec: '2026-12-30', kraj: 'Liberecký kraj', typy: ['vlaky'] },
    { id: 'hal', nazev: 'Halloween zahrada', zacatek: '2026-10-28', konec: '2026-11-08', kraj: 'Plzeňský kraj', typy: ['ostatni'] },
    { id: 'leg', nazev: 'Legiovlak v Nymburce', zacatek: '2026-11-03', konec: '2026-11-08', kraj: 'Středočeský kraj', typy: ['vlaky'] },
    { id: 'dnes', nazev: 'Odpolední jízda', zacatek: '2026-11-04T14:00:00+01:00', kraj: 'Jihomoravský kraj', typy: ['vlaky'] },
    { id: 'trak', nazev: 'Traktoriáda Hradec', zacatek: '2026-11-07', kraj: 'Královéhradecký kraj', typy: ['traktory'] },
    { id: 'trak2', nazev: 'Orba s traktory', zacatek: '2026-11-21', kraj: 'Královéhradecký kraj', typy: ['traktory'] },
    { id: 'trak3', nazev: 'Traktory v Brně', zacatek: '2026-11-14', kraj: 'Jihomoravský kraj', typy: ['traktory'] },
    { id: 'vlakhk', nazev: 'Vláčky v Hradci', zacatek: '2026-11-15', kraj: 'Královéhradecký kraj', typy: ['vlaky'] },
    { id: 'vik', nazev: 'Parní víkendy', zacatek: '2026-11-01', konec: '2026-11-30', dny_v_tydnu: ['so', 'ne'], kraj: 'Zlínský kraj', typy: ['vlaky'] },
    { id: 'mik', nazev: 'Mikulášské vlaky', zacatek: '2026-12-05', konec: '2026-12-06', kraj: 'Zlínský kraj', typy: ['vlaky'] },
  ].map((a) => Object.assign({ obec: 'Obec', url: W + a.id + '/', obrazek: null }, a)),
};

const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const STRANKA_KRAJE = `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Traktory v Královéhradeckém kraji | Hravé stroje</title></head>
<body><h1>Traktory v Královéhradeckém kraji</h1>
<div id="hs-kalendar" data-kraj="Královéhradecký kraj" data-typ="traktory"></div>
<script src="/kalendar/hs-kalendar.js" defer></script></body></html>`;
const STRANKA_VSE = STRANKA_KRAJE.replace(' data-kraj="Královéhradecký kraj" data-typ="traktory"', '');

// Obrázky produktů: barevná SVG (nic se nestahuje z internetu)
const svg = (barva) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="${barva}"/></svg>`;
const PRODUKTY = { produkty: [
  { nazev: 'Dřevěný vláček', url: 'https://www.hravestroje.cz/vlacek/', cena: 499, skladem: true, temata: ['vlaky'],
    obrazek: 'http://localhost:PORT/__img/cervena.svg', obrazky: ['http://localhost:PORT/__img/cervena.svg', 'http://localhost:PORT/__img/modra.svg'] },
  { nazev: 'Traktor na baterie', url: 'https://www.hravestroje.cz/traktor/', cena: 899, skladem: true, temata: ['traktory', 'vlaky'],
    obrazek: 'http://localhost:PORT/__img/zluta.svg' },
] };
let sProdukty = false;

const server = http.createServer((req, res) => {
  let cesta = decodeURIComponent(req.url.split('?')[0]);
  const posli = (typ, telo) => { res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' }); res.end(telo); };
  if (cesta === '/kalendar/akce.json') return posli('application/json', JSON.stringify(DATA));
  if (cesta === '/kalendar/monetizace.json') {
    if (!sProdukty) { res.writeHead(404); return res.end(); }
    return posli('application/json', JSON.stringify({ zapnuto: true, eshop: true, eshop_kazda_karta: 2, booking: false, nabidky: false }));
  }
  if (cesta === '/produkty/produkty.json' && sProdukty) {
    return posli('application/json', JSON.stringify(PRODUKTY).replace(/PORT/g, server.address().port));
  }
  if (cesta.startsWith('/__img/')) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(svg({ cervena: '#c0392b', modra: '#2c6fbb', zluta: '#f1c40f' }[path.basename(cesta, '.svg')]));
  }
  if (cesta === '/__kraj.html') return posli('text/html', STRANKA_KRAJE);
  if (cesta === '/__vse.html') return posli('text/html', STRANKA_VSE);
  if (cesta.endsWith('/')) cesta += 'index.html';
  const soubor = path.join(KOREN, cesta);
  if (!soubor.startsWith(KOREN) || !fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) { res.writeHead(404); return res.end(); }
  posli(TYPY[path.extname(soubor)] || 'text/plain', fs.readFileSync(soubor));
});

async function stranka(browser, zarizeni, adresa) {
  const ctx = await browser.newContext({ ...zarizeni, serviceWorkers: 'block' });
  await ctx.route((u) => !/^http:\/\/localhost/.test(u.toString()), (r) => r.abort());
  const page = await ctx.newPage();
  const chyby = [];
  page.on('pageerror', (e) => chyby.push(e.message));
  await page.clock.setFixedTime(TED);
  await page.goto(adresa);
  return { ctx, page, chyby };
}

async function testKalendare(browser, nazevZarizeni, zarizeni, port) {
  const { ctx, page, chyby } = await stranka(browser, zarizeni, `http://localhost:${port}/kalendar/`);
  await page.waitForSelector('#seznam article');
  const info = await page.evaluate(() => {
    const sekce = [...document.querySelectorAll('#seznam > section, #seznam > details')];
    const karty = (s) => [...s.querySelectorAll('article')].map((k) => ({
      nazev: k.querySelector('h3').textContent,
      den: k.querySelector('.datum strong').textContent + ' ' + k.querySelector('.datum span').textContent,
      stitky: [...k.querySelectorAll('.stitky li')].map((l) => l.textContent),
      vidno: k.checkVisibility(),
    }));
    return {
      sekce: sekce.map((s) => ({ tag: s.tagName, nazev: s.querySelector('.mesic').textContent, open: s.open, karty: karty(s) })),
      sirka: document.documentElement.scrollWidth > window.innerWidth + 1,
      text: document.getElementById('seznam').textContent,
    };
  });
  const [dnes, listopad] = info.sekce;
  ok(dnes.nazev === 'Dnes', 'první skupina je „Dnes“: ' + dnes.nazev);
  ok(dnes.karty.map((k) => k.nazev).join('|') === 'Legiovlak v Nymburce|Odpolední jízda', 'Dnes: ' + dnes.karty.map((k) => k.nazev));
  ok(dnes.karty.every((k) => k.den === '4 lis'), 'na kartách pod „Dnes“ dnešní datum: ' + dnes.karty.map((k) => k.den));
  ok(dnes.karty[0].stitky.includes('probíhá do 8. listopadu'), 'štítek probíhá do: ' + dnes.karty[0].stitky);
  ok(!info.text.includes('Právě probíhá'), 'žádná sekce „Právě probíhá“');
  ok(/^listopad 2026$/i.test(listopad.nazev), 'druhá skupina listopad: ' + listopad.nazev);
  const vik = listopad.karty.filter((k) => k.nazev === 'Parní víkendy');
  ok(vik.length === 8, 'Parní víkendy v každý víkendový den listopadu (8×): ' + vik.length);
  ok(vik[0].den === '7 lis' && vik[0].stitky.some((s) => s === 'další termín neděle 8. listopadu'), 'den a další termín: ' + JSON.stringify(vik[0]));
  const dlouhe = info.sekce[info.sekce.length - 1];
  ok(dlouhe.tag === 'DETAILS' && /Sezónní a dlouhodobé akce \(2\)/.test(dlouhe.nazev), 'sekce dlouhodobých je poslední: ' + dlouhe.nazev);
  ok(!dlouhe.open && dlouhe.karty.every((k) => !k.vidno), 'sekce je sbalená');
  ok(dlouhe.karty.map((k) => k.nazev).join('|') === 'Zubačka Tanvald – Harrachov|Halloween zahrada', 'dlouhodobé: ' + dlouhe.karty.map((k) => k.nazev));
  ok(!info.sekce.slice(0, -1).some((s) => s.karty.some((k) => /Zubačka|Halloween/.test(k.nazev))), 'dlouhodobé nejsou v chronologickém seznamu');
  ok(!info.sirka, 'vodorovné posouvání');
  // pořadí podle data: dny karet jdou neklesající
  const MES = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  const cisla = info.sekce.slice(0, -1).flatMap((s) => s.karty.map((k) => { const [d, m] = k.den.split(' '); return MES.indexOf(m) * 100 + +d; }));
  ok(cisla.every((c, i) => !i || c >= cisla[i - 1]), 'pořadí podle data: ' + cisla);

  // rozbalení sekce
  await page.click('#dlouhodobe summary');
  const otevreno = await page.evaluate(() => {
    const d = document.getElementById('dlouhodobe');
    const k = d.querySelector('article');
    return { open: d.open, vidno: k.checkVisibility(), stitky: [...k.querySelectorAll('.stitky li')].map((l) => l.textContent),
      datum: k.querySelector('.datum').textContent };
  });
  ok(otevreno.open && otevreno.vidno, 'po klepnutí se sekce rozbalí');
  ok(otevreno.stitky.includes('od 3. října do 30. prosince'), 'štítek od–do: ' + otevreno.stitky);
  ok(otevreno.datum === 'do30pro', 'probíhající dlouhodobá: „do 30. 12.“: ' + otevreno.datum);
  if (snimky) {
    await page.locator('#dlouhodobe').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(snimky, `seznam-dlouhodobe-${nazevZarizeni}.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(snimky, `seznam-dnes-${nazevZarizeni}.png`) });
  }

  // filtr „Tento víkend“: jen sobota a neděle 7.–8. 11.
  if (nazevZarizeni === 'mobil') await page.click('#prepinac-filtru');
  await page.click('[data-kdy="vikend"]');
  const vikend = await page.evaluate(() => [...document.querySelectorAll('#seznam > section article')].map((k) =>
    k.querySelector('h3').textContent + '@' + k.querySelector('.datum strong').textContent));
  ok(vikend.join('|') === 'Legiovlak v Nymburce@7|Parní víkendy@7|Traktoriáda Hradec@7|Parní víkendy@8', 'víkend: ' + vikend.join('|'));

  // sdílený odkaz na dlouhodobou akci rozbalí sekci
  await page.goto(`http://localhost:${port}/kalendar/#akce-zub`);
  await page.waitForSelector('#seznam article');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.getElementById('dlouhodobe').open && document.getElementById('akce-zub').classList.contains('zvyraznena')),
    'odkaz #akce-zub rozbalí sekci a zvýrazní kartu');
  ok(await page.evaluate(() => new Set([...document.querySelectorAll('[id]')].map((e) => e.id)).size === document.querySelectorAll('[id]').length), 'duplicitní id');
  ok(!chyby.length, 'chyby na stránce: ' + chyby.join('; '));
  await ctx.close();
}

async function testProduktu(browser, nazevZarizeni, zarizeni, port) {
  sProdukty = true;
  const { ctx, page, chyby } = await stranka(browser, zarizeni, `http://localhost:${port}/kalendar/`);
  await page.waitForSelector('#seznam .produkt img');
  await page.waitForTimeout(300);
  const dlazdice = page.locator('#seznam .produkt').filter({ hasText: 'Dřevěný vláček' }).first();
  await dlazdice.scrollIntoViewIfNeeded();
  const rozmer = await dlazdice.evaluate((d) => {
    const o = d.querySelector('.produkt-obrazek').getBoundingClientRect();
    const k = d.getBoundingClientRect();
    return { w: o.width, h: o.height, karta: k.width, imgs: d.querySelectorAll('.produkt-snimky img').length };
  });
  ok(Math.abs(rozmer.w / rozmer.h - 4 / 3) < 0.02, 'poměr 4:3: ' + JSON.stringify(rozmer));
  ok(rozmer.karta - rozmer.w <= 2.5, 'obrázek přes celou šířku dlaždice: ' + JSON.stringify(rozmer));
  ok(rozmer.imgs === 2, 'dva obrázky z "obrazky": ' + rozmer.imgs);
  const viditelny = () => dlazdice.evaluate((d) => {
    const s = d.querySelector('.produkt-snimky');
    const imgs = d.querySelectorAll('.produkt-snimky img');
    const tecky = d.querySelector('.produkt-tecky');
    return { druhyOpacity: +getComputedStyle(imgs[1]).opacity, scroll: s.scrollLeft, sirka: s.clientWidth,
      aktivni: [...d.querySelectorAll('.produkt-tecky i')].findIndex((t) => t.classList.contains('aktivni')),
      teckyVidet: !!tecky && getComputedStyle(tecky).display !== 'none' };
  });
  if (nazevZarizeni === 'pc') {
    let v = await viditelny();
    ok(v.druhyOpacity === 0 && !v.teckyVidet, 'PC: na začátku první obrázek, bez teček: ' + JSON.stringify(v));
    if (snimky) await page.screenshot({ path: path.join(snimky, 'produkt-pc.png') });
    await dlazdice.hover();
    await page.waitForTimeout(400);
    v = await viditelny();
    ok(v.druhyOpacity === 1, 'PC: po najetí myší druhý obrázek: ' + JSON.stringify(v));
    if (snimky) await page.screenshot({ path: path.join(snimky, 'produkt-najeti-pc.png') });
  } else {
    let v = await viditelny();
    ok(v.teckyVidet && v.aktivni === 0 && v.scroll === 0, 'mobil: tečky, první obrázek: ' + JSON.stringify(v));
    if (snimky) await page.screenshot({ path: path.join(snimky, 'produkt-mobil.png') });
    // přejetí prstem doleva
    const box = await dlazdice.locator('.produkt-obrazek').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    // dotyk: prst přejede po obrázku zprava doleva
    const y0 = Math.round(box.y + box.height / 2), x0 = Math.round(box.x + box.width * 0.85);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 - box.width * 0.07 * i), y: y0 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
    v = await viditelny();
    ok(Math.abs(v.scroll - v.sirka) < 2 && v.aktivni === 1, 'mobil: po listování druhý obrázek a druhá tečka: ' + JSON.stringify(v));
    if (snimky) await page.screenshot({ path: path.join(snimky, 'produkt-mobil-listovani.png') });
  }
  // produkt bez "obrazky" → jen "obrazek", bez galerie
  const jeden = await page.locator('#seznam .produkt').filter({ hasText: 'Traktor na baterie' }).first().evaluate((d) => ({
    imgs: [...d.querySelectorAll('img')].map((i) => i.getAttribute('src').replace(/^.*\//, '')),
    galerie: !!d.querySelector('.produkt-galerie, .produkt-tecky') }));
  ok(jeden.imgs.join() === 'zluta.svg' && !jeden.galerie, 'bez "obrazky" jen "obrazek": ' + JSON.stringify(jeden));
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'vodorovné posouvání');
  ok(!chyby.length, 'chyby na stránce: ' + chyby.join('; '));
  sProdukty = false;
  await ctx.close();
}

async function testVlozeni(browser, nazevZarizeni, zarizeni, port) {
  // stránka kraje a typu
  let { ctx, page, chyby } = await stranka(browser, zarizeni, `http://localhost:${port}/__kraj.html?utm_source=x`);
  await page.waitForSelector('#hs-kalendar article');
  const info = await page.evaluate(() => {
    const ld = JSON.parse(document.getElementById('hs-kal-jsonld').textContent);
    return {
      kraj: document.querySelector('[data-hs-kal="kraj"]').value,
      typ: document.querySelector('[data-hs-kal="cipy-typ"] [data-typ="traktory"]').getAttribute('aria-pressed'),
      karty: [...document.querySelectorAll('#hs-kalendar article h3')].map((h) => h.textContent),
      ld: ld.itemListElement.map((i) => i.item.name),
      zrusit: document.querySelector('[data-hs-kal="zrusit"]').hidden,
      pocet: document.querySelector('[data-hs-kal="pocet"]').textContent,
      adresa: location.search,
      sirka: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  ok(info.kraj === 'Královéhradecký kraj' && info.typ === 'true', 'předvolba kraje a typu: ' + info.kraj + ' / ' + info.typ);
  ok(info.karty.join('|') === 'Traktoriáda Hradec|Orba s traktory', 'jen traktory v KH kraji: ' + info.karty);
  ok(info.ld.join('|') === 'Traktoriáda Hradec|Orba s traktory', 'JSON-LD jen akce stránky: ' + info.ld);
  ok(info.zrusit && info.pocet === 'Nadcházející akce: 2', 'předvolba není „filtr“: ' + info.pocet);
  ok(info.adresa === '?utm_source=x', 'adresa beze změny: ' + info.adresa);
  ok(!info.sirka, 'vodorovné posouvání');
  if (snimky) await page.screenshot({ path: path.join(snimky, `hs-kalendar-kraj-${nazevZarizeni}.png`) });
  // „Všechny kraje“ → v adrese kraj= (po obnovení zůstane), Zrušit filtry → zpět na předvolbu
  if (nazevZarizeni === 'mobil') await page.click('[data-hs-kal="prepinac"]');
  await page.selectOption('[data-hs-kal="kraj"]', '');
  let po = await page.evaluate(() => ({ adresa: location.search, karty: document.querySelectorAll('#hs-kalendar article').length,
    zrusit: document.querySelector('[data-hs-kal="zrusit"]').hidden }));
  ok(po.adresa === '?utm_source=x&kraj=' && po.karty === 3 && !po.zrusit, 'všechny kraje: ' + JSON.stringify(po));
  await page.reload();
  await page.waitForSelector('#hs-kalendar article');
  po = await page.evaluate(() => ({ kraj: document.querySelector('[data-hs-kal="kraj"]').value, karty: document.querySelectorAll('#hs-kalendar article').length }));
  ok(po.kraj === '' && po.karty === 3, 'po obnovení zůstanou všechny kraje: ' + JSON.stringify(po));
  await page.click('[data-hs-kal="zrusit"]');
  po = await page.evaluate(() => ({ kraj: document.querySelector('[data-hs-kal="kraj"]').value, adresa: location.search,
    karty: document.querySelectorAll('#hs-kalendar article').length }));
  ok(po.kraj === 'Královéhradecký kraj' && po.adresa === '?utm_source=x' && po.karty === 2, 'Zrušit filtry → předvolba: ' + JSON.stringify(po));
  ok(!chyby.length, 'chyby na stránce: ' + chyby.join('; '));
  await ctx.close();

  // stránka bez předvolby: Dnes + sekce dlouhodobých
  ({ ctx, page, chyby } = await stranka(browser, zarizeni, `http://localhost:${port}/__vse.html`));
  await page.waitForSelector('#hs-kalendar article');
  const vse = await page.evaluate(() => ({
    nadpisy: [...document.querySelectorAll('#hs-kalendar .hs-kal-mesic')].map((h) => h.textContent),
    dnes: [...document.querySelector('.hs-kal-dnes-sekce').querySelectorAll('article')].map((k) =>
      k.querySelector('.hs-kal-datum strong').textContent + ' ' + [...k.querySelectorAll('.hs-kal-stitky li')].map((l) => l.textContent).join(',')),
    open: document.getElementById('hs-kal-dlouhodobe').open,
  }));
  ok(vse.nadpisy[0] === 'Dnes' && /^Sezónní a dlouhodobé akce/.test(vse.nadpisy[vse.nadpisy.length - 1]), 'nadpisy: ' + vse.nadpisy);
  ok(/^4 .*probíhá do 8\. listopadu/.test(vse.dnes[0]), 'Dnes v hs-kalendar: ' + vse.dnes[0]);
  ok(!vse.open, 'sekce dlouhodobých sbalená');
  await page.click('#hs-kal-dlouhodobe summary');
  ok(await page.evaluate(() => document.getElementById('hs-kal-dlouhodobe').open), 'rozbalení');
  if (snimky) {
    await page.locator('#hs-kal-dlouhodobe').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(snimky, `hs-kalendar-dlouhodobe-${nazevZarizeni}.png`) });
  }
  ok(!chyby.length, 'chyby na stránce: ' + chyby.join('; '));
  await ctx.close();
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    for (const [nazev, zarizeni] of [['mobil', devices['Pixel 7']], ['pc', { viewport: { width: 1280, height: 900 } }]]) {
      await testKalendare(browser, nazev, zarizeni, port);
      await testProduktu(browser, nazev, zarizeni, port);
      await testVlozeni(browser, nazev, zarizeni, port);
    }
    console.log('OK: seznam v Chromiu – mobil i PC: „Dnes“ s dnešním datem, probíhá do, sbalitelné dlouhodobé akce, dny konání, víkend, data-kraj/data-typ, dlaždice produktu 4:3 s druhým obrázkem');
  } catch (e) {
    console.error('CHYBA: ' + e.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
