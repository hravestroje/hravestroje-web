// Test vložitelného kalendáře (kalendar/hs-kalendar.js) v Chromiu přes Playwright, na PC i mobilu.
// Stránka kalendar/hs-kalendar-demo.html napodobuje šablonu Shoptetu s „agresivními“ styly.
//   node testy/hs-kalendar-prohlizec.js [složka-pro-snímky]
// Když Playwright není nainstalovaný (např. v GitHub Actions), test se přeskočí.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const L = require('../kalendar/logika.js');
const KOREN = path.join(__dirname, '..');
const snimky = process.argv[2];
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };

// Ukázková data: 20 akcí od 5. 11. 2026, „dnes“ = středa 4. 11. 2026
const DNES = '2026-11-04';
const KRAJE = ['Jihomoravský kraj', 'Zlínský kraj', 'Hlavní město Praha'];
const TYPY = ['vlaky', 'traktory', 'auta', 'lode', 'letadla'];
const AKCE = { aktualizovano: '2026-11-04T21:00:00Z', akce: [] };
for (let i = 0; i < 20; i++) {
  const d = new Date(2026, 10, 5 + i * 3);
  AKCE.akce.push({
    id: 'x' + i, nazev: 'Testovací akce ' + i, zacatek: L.isoDen(d), typy: [TYPY[i % 5]], kraj: KRAJE[i % 3],
    obec: 'Obec ' + i, misto: 'Místo ' + i, url: 'https://www.hravestroje.cz/kalendar-dopravnich-akci/test-' + i + '/',
    obrazek: i % 4 ? null : 'http://127.0.0.1/neexistuje-' + i + '.jpg', popis: 'Popis ' + i
  });
}
AKCE.akce.push({ id: 'prob', nazev: 'Probíhající výstava', zacatek: '2026-10-20', konec: '2026-11-30', typy: ['vlaky'], kraj: 'Zlínský kraj', obec: 'Zlín' });
const PRODUKTY = { produkty: [1, 2, 3, 4].map((i) => ({ nazev: 'Vláček ' + i, url: 'https://www.hravestroje.cz/vlacek-' + i + '/', cena: 199 * i, skladem: true, temata: ['vlaky'] })) };

const server = http.createServer((req, res) => {
  const cesta = path.join(KOREN, decodeURIComponent(req.url.split('?')[0]));
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  const typ = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' }[path.extname(cesta)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' });
  fs.createReadStream(cesta).pipe(res);
});

function ocekavanyPocet(search) {
  const ted = new Date(2026, 10, 4, 12);
  return L.filtruj(L.pripravAkce(AKCE, ted), L.stavZAdresy(search), ted).length;
}

async function stranka(browser, viewport, adresa) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 600, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  const cizi = [];
  const chyby = [];
  page.on('request', (r) => { if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())) cizi.push(r.url()); });
  page.on('pageerror', (e) => chyby.push(String(e)));
  await page.route('**/kalendar/akce.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(AKCE) }));
  await page.route('**/produkty/produkty.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(PRODUKTY) }));
  await page.route(/neexistuje/, (r) => r.fulfill({ status: 404, body: '' }));
  await page.goto(adresa);
  return { context, page, cizi, chyby };
}

async function cekejNaKarty(page) {
  await page.waitForSelector('#hs-kalendar .hs-kal-karta');
  await page.waitForTimeout(300);
}

const STYL_SABLONY = () => {
  const s = (sel) => { const c = getComputedStyle(document.querySelector(sel)); return [c.fontSize, c.color, c.backgroundColor, c.borderTopWidth, c.textTransform, c.margin, c.fontFamily].join('|'); };
  return { h1: s('h1'), h2: s('#sablona-h2'), karta: s('#sablona-karta'), p: s('#sablona-test'), body: s('body'), menu: s('.sablona-menu') };
};

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const zaklad = `http://127.0.0.1:${server.address().port}`;
  const demo = `${zaklad}/kalendar/hs-kalendar-demo.html`;
  const browser = await chromium.launch();
  try {
    for (const [nazev, viewport] of [['pc', { width: 1280, height: 900 }], ['mobil', { width: 390, height: 844 }]]) {
      // 0) styly šablony bez kalendáře (pro porovnání)
      const bez = await stranka(browser, viewport, `${demo}?hs-kal=vypnout`);
      const stylBez = await bez.page.evaluate(STYL_SABLONY);
      ok(await bez.page.evaluate(() => !document.getElementById('hs-kal-styly')), `${nazev}: ?hs-kal=vypnout má kalendář vypnout`);
      await bez.context.close();

      // 1) výchozí zobrazení
      const { context, page, cizi, chyby } = await stranka(browser, viewport, `${demo}?hs-kal-dnes=${DNES}&utm_source=test`);
      await cekejNaKarty(page);
      const r = await page.evaluate(() => {
        const k = document.getElementById('hs-kalendar');
        const karty = [...k.querySelectorAll('article.hs-kal-karta')];
        const x = new Set(karty.slice(1, 4).map((c) => Math.round(c.getBoundingClientRect().left)));
        const h3 = getComputedStyle(karty[0].querySelector('h3'));
        const li = k.querySelector('.hs-kal-stitky li');
        const cip = getComputedStyle(k.querySelector('.hs-kal-cip[data-typ="vlaky"]'));
        const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent));
        const tridy = new Set([...k.querySelectorAll('[class]')].flatMap((e) => [...e.classList]));
        return {
          karet: karty.length,
          reklam: k.querySelectorAll('.hs-kal-reklama').length,
          vyplnenych: [...k.querySelectorAll('.hs-kal-reklama')].filter((d) => d.textContent.includes('Místo pro reklamu')).length,
          produktu: k.querySelectorAll('.hs-kal-produkt').length,
          sloupcu: x.size,
          h3: [h3.fontSize, h3.color, h3.textDecorationLine, h3.marginTop].join('|'),
          liPred: getComputedStyle(li, '::before').content,
          liMargin: getComputedStyle(li).marginLeft,
          cip: [cip.height, cip.backgroundColor, cip.textTransform, cip.fontFamily].join('|'),
          zastupnych: k.querySelectorAll('.hs-kal-zastupny').length,
          ld, spatneTridy: [...tridy].filter((t) => !t.startsWith('hs-kal')),
          souhrn: k.querySelector('[data-hs-kal="pocet"]').textContent,
          presah: document.documentElement.scrollWidth - window.innerWidth,
          cookie: document.cookie,
          hlavicka: !!document.querySelector('style#hs-kal-styly')
        };
      });
      const n = ocekavanyPocet('');
      ok(r.karet === n, `${nazev}: čekám ${n} karet, je ${r.karet}`);
      ok(r.reklam === Math.floor((n - 1) / 8), `${nazev}: míst pro reklamu ${r.reklam}, čekám ${Math.floor((n - 1) / 8)}`);
      ok(r.vyplnenych === r.reklam, `${nazev}: událost hs-kalendar:vykresleno nepředala všechna místa (${r.vyplnenych}/${r.reklam})`);
      ok(r.produktu >= 1, `${nazev}: chybí dlaždice e-shopu`);
      ok(r.souhrn === 'Nadcházející akce: ' + n, `${nazev}: souhrn ${r.souhrn}`);
      ok(r.zastupnych >= 1, `${nazev}: nefunkční obrázek se má nahradit zástupným`);
      ok(r.sloupcu === (nazev === 'pc' ? 3 : 1), `${nazev}: sloupců ${r.sloupcu}`);
      ok(r.h3.startsWith('17.92px|rgb(29, 36, 32)|none|0px'), `${nazev}: styl šablony prosákl do nadpisu karty: ${r.h3}`);
      ok(r.liPred === 'none' && r.liMargin === '0px', `${nazev}: styl šablony prosákl do štítků: ${r.liPred} ${r.liMargin}`);
      ok(!r.cip.startsWith('30px') && r.cip.includes('rgb(255, 255, 255)') && r.cip.includes('|none|') && !r.cip.includes('monospace'), `${nazev}: styl šablony prosákl do tlačítek: ${r.cip}`);
      ok(r.spatneTridy.length === 0, `${nazev}: třídy bez předpony: ${r.spatneTridy}`);
      ok(r.presah <= 0, `${nazev}: stránka přetéká do šířky o ${r.presah}px`);
      ok(r.cookie === '' && (await context.cookies()).length === 0, `${nazev}: nesmí vzniknout cookies`);
      ok(cizi.length === 0, `${nazev}: požadavky mimo web: ${cizi.join(', ')}`);
      ok(chyby.length === 0, `${nazev}: chyby JS: ${chyby.join(' | ')}`);
      const ld = r.ld.find((x) => x['@type'] === 'ItemList');
      ok(ld && ld.itemListElement.length === AKCE.akce.length, `${nazev}: JSON-LD ItemList (${ld && ld.itemListElement.length})`);
      ok(ld.itemListElement.every((x) => x.item['@type'] === 'Event' && x.item.startDate && x.item.location), `${nazev}: JSON-LD Event`);
      ok(ld.url === 'https://www.hravestroje.cz/kalendar-akci/', `${nazev}: JSON-LD url z canonical: ${ld.url}`);
      const stylS = await page.evaluate(STYL_SABLONY);
      ok(JSON.stringify(stylS) === JSON.stringify(stylBez), `${nazev}: kalendář změnil vzhled šablony:\n${JSON.stringify(stylBez)}\n${JSON.stringify(stylS)}`);
      if (snimky) await page.screenshot({ path: path.join(snimky, `hs-kalendar-${nazev}.png`), fullPage: false });
      if (snimky) await page.locator('#hs-kalendar').screenshot({ path: path.join(snimky, `hs-kalendar-${nazev}-cely.png`) });

      // 2) klik na filtr → adresa ?kdy=…, cizí parametr zůstane
      if (nazev === 'mobil') {
        await page.click('[data-hs-kal="prepinac"]');
        ok(await page.isVisible('[data-hs-kal="panel"] [data-kdy="vikend"]'), 'mobil: panel filtrů se má otevřít');
      }
      await page.click('[data-kdy="vikend"]');
      await page.waitForTimeout(100);
      const url1 = new URL(page.url());
      ok(url1.searchParams.get('kdy') === 'vikend' && url1.searchParams.get('utm_source') === 'test', `${nazev}: adresa po filtru ${page.url()}`);
      const nV = ocekavanyPocet('?kdy=vikend');
      const karetV = await page.locator('#hs-kalendar article.hs-kal-karta').count();
      ok(karetV === nV, `${nazev}: víkend – čekám ${nV}, je ${karetV}`);
      await page.selectOption('[data-hs-kal="kraj"]', 'Zlínský kraj');
      const url2 = new URL(page.url());
      ok(url2.searchParams.get('kraj') === 'Zlínský kraj' && url2.searchParams.get('kdy') === 'vikend', `${nazev}: adresa po kraji ${page.url()}`);
      if (nazev === 'mobil') await page.click('[data-hs-kal="hotovo"]');
      await page.click('[data-hs-kal="zrusit"]');
      const url3 = new URL(page.url());
      ok(!url3.searchParams.has('kdy') && !url3.searchParams.has('kraj') && url3.searchParams.get('utm_source') === 'test', `${nazev}: zrušit filtry ${page.url()}`);
      await context.close();

      // 3) sdílený odkaz ?kraj=…&kdy=…
      const sdileny = '?kraj=' + encodeURIComponent('Zlínský kraj') + '&kdy=pristi-mesic';
      const s = await stranka(browser, viewport, `${demo}${sdileny}&hs-kal-dnes=${DNES}`);
      await cekejNaKarty(s.page);
      const nS = ocekavanyPocet(sdileny);
      const r3 = await s.page.evaluate(() => ({
        karet: document.querySelectorAll('#hs-kalendar article.hs-kal-karta').length,
        kraj: document.querySelector('[data-hs-kal="kraj"]').value,
        kdy: document.querySelector('[data-kdy="pristi-mesic"]').getAttribute('aria-pressed'),
        souhrn: document.querySelector('[data-hs-kal="pocet"]').textContent,
        kraje: [...document.querySelectorAll('#hs-kalendar article .hs-kal-stitky')].map((u) => u.textContent)
      }));
      ok(nS > 0 && r3.karet === nS, `${nazev}: sdílený odkaz – čekám ${nS}, je ${r3.karet}`);
      ok(r3.kraj === 'Zlínský kraj' && r3.kdy === 'true', `${nazev}: sdílený odkaz – filtry v ovládání ${r3.kraj} ${r3.kdy}`);
      ok(r3.kraje.every((t) => t.includes('Zlínský kraj')), `${nazev}: sdílený odkaz – jen Zlínský kraj`);
      ok(/^Nalezeno: /.test(r3.souhrn), `${nazev}: souhrn ${r3.souhrn}`);
      await s.context.close();

      // 4) odkaz na konkrétní akci (#hs-kal-akce-…)
      const h = await stranka(browser, viewport, `${demo}?hs-kal-dnes=${DNES}#hs-kal-akce-x10`);
      await cekejNaKarty(h.page);
      ok(await h.page.evaluate(() => document.getElementById('hs-kal-akce-x10').classList.contains('hs-kal-zvyraznena')), `${nazev}: zvýraznění sdílené akce`);
      await h.context.close();
    }

    // 4b) rozložení mřížky: obrázky 16:9 i se šablonou (img width/height:auto !important),
    // karty po řádcích podle data, stejná výška v řádku, žádná poloprázdná poslední řada
    const CTVEREC = fs.readFileSync(path.join(KOREN, 'kalendar', 'icons', 'icon-512.png'));
    for (const [nazev, viewport, sloupcu] of [['pc', { width: 1280, height: 900 }, 3], ['pc-uzke', { width: 1000, height: 900 }, 2], ['mobil', { width: 390, height: 844 }, 1]]) {
      for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const data = { aktualizovano: AKCE.aktualizovano, akce: [] };
        for (let i = 0; i < n; i++) {
          data.akce.push({ id: 'm' + i, nazev: 'Akce mřížky ' + i + (i % 2 ? ' s delším názvem, který se zalomí na víc řádků' : ''),
            zacatek: L.isoDen(new Date(2026, 11, 1 + i)), typy: [TYPY[i % 5]], kraj: KRAJE[i % 3], obec: 'Obec ' + i,
            url: 'https://www.hravestroje.cz/kalendar-dopravnich-akci/m-' + i + '/', obrazek: i % 3 === 2 ? null : 'http://127.0.0.1/ctverec-' + i + '.png' });
        }
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
        const page = await context.newPage();
        await page.route('**/kalendar/akce.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(data) }));
        await page.route('**/produkty/produkty.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(PRODUKTY) }));
        await page.route(/ctverec-\d+\.png/, (r) => r.fulfill({ contentType: 'image/png', body: CTVEREC }));
        await page.goto(`${demo}?hs-kal-dnes=${DNES}`);
        await cekejNaKarty(page);
        await page.waitForFunction(() => { const i = document.querySelector('#hs-kalendar .hs-kal-karta-obrazek img'); return i && i.complete && i.naturalWidth > 0; });
        const m = await page.evaluate(() => {
          const zaokr = (x) => Math.round(x);
          const chyby = [];
          let maxSloupcu = 0, obrazku = 0, nazvy = [];
          for (const mr of document.querySelectorAll('#hs-kalendar .hs-kal-mrizka')) {
            const box = mr.getBoundingClientRect();
            const deti = [...mr.children];
            const radky = new Map();
            for (const d of deti) {
              const r = d.getBoundingClientRect();
              const top = zaokr(r.top);
              if (!radky.has(top)) radky.set(top, []);
              radky.get(top).push(r);
            }
            const serazene = [...radky.keys()].sort((a, b) => a - b);
            serazene.forEach((top, i) => {
              const rr = radky.get(top);
              maxSloupcu = Math.max(maxSloupcu, rr.length);
              // řádek je zleva doprava a vyplňuje celou šířku mřížky
              const vlevo = Math.min(...rr.map((r) => r.left)), vpravo = Math.max(...rr.map((r) => r.right));
              if (Math.abs(vlevo - box.left) > 1 || Math.abs(vpravo - box.right) > 1) chyby.push(`řádek ${i + 1}/${serazene.length} nevyplňuje šířku (${zaokr(vlevo - box.left)}…${zaokr(box.right - vpravo)})`);
              const vysky = new Set(rr.map((r) => zaokr(r.height)));
              if (vysky.size > 1) chyby.push(`řádek ${i + 1}: různé výšky karet ${[...vysky]}`);
            });
            // pořadí v DOM = po řádcích zleva doprava
            const poradi = deti.map((d) => d.getBoundingClientRect()).map((r) => [zaokr(r.top), zaokr(r.left)]);
            for (let i = 1; i < poradi.length; i++) {
              const [t0, l0] = poradi[i - 1], [t1, l1] = poradi[i];
              if (t1 < t0 || (t1 === t0 && l1 <= l0)) chyby.push('karty nejsou po řádcích zleva doprava');
            }
            nazvy = nazvy.concat([...mr.querySelectorAll('h3')].map((h) => h.textContent));
          }
          for (const o of document.querySelectorAll('#hs-kalendar .hs-kal-karta-obrazek, #hs-kalendar .hs-kal-produkt-obrazek')) {
            const r = o.getBoundingClientRect();
            if (Math.abs(r.width * 9 / 16 - r.height) > 1.5) chyby.push(`obrázek není 16:9: ${zaokr(r.width)}×${zaokr(r.height)}`);
            const img = o.querySelector('img');
            if (img) {
              obrazku++;
              const ri = img.getBoundingClientRect();
              const st = getComputedStyle(img);
              if (Math.abs(ri.width - r.width) > 1 || Math.abs(ri.height - r.height) > 1) chyby.push(`img nevyplňuje rámeček: ${zaokr(ri.width)}×${zaokr(ri.height)} v ${zaokr(r.width)}×${zaokr(r.height)}`);
              if (o.classList.contains('hs-kal-karta-obrazek') && st.objectFit !== 'cover') chyby.push('img bez object-fit:cover');
            }
          }
          const presah = document.documentElement.scrollWidth - window.innerWidth;
          return { chyby, maxSloupcu, obrazku, nazvy, presah };
        });
        ok(m.chyby.length === 0, `${nazev} (${viewport.width} px), ${n} akcí: ${m.chyby.join('; ')}`);
        ok(m.obrazku >= 1, `${nazev}, ${n} akcí: chybí obrázky akcí`);
        ok(m.presah <= 0, `${nazev}, ${n} akcí: stránka přetéká do šířky o ${m.presah}px`);
        const akceNazvy = m.nazvy.filter((t) => t.startsWith('Akce mřížky'));
        ok(akceNazvy.map((t) => +t.split(' ')[2]).every((x, i) => x === i), `${nazev}, ${n} akcí: pořadí podle data ${akceNazvy}`);
        ok(m.maxSloupcu <= sloupcu && (n !== 3 || m.maxSloupcu === sloupcu), `${nazev}, ${n} akcí: čekám ${sloupcu} sloupce, je ${m.maxSloupcu}`);
        if (snimky && (n === 5 || n === 7)) await page.locator('#hs-kalendar').screenshot({ path: path.join(snimky, `hs-kalendar-mrizka-${nazev}-${n}.png`) });
        await context.close();
      }
    }

    // 5) stávající stránka kalendar/ dál funguje beze změny
    const p = await stranka(browser, { width: 1280, height: 900 }, `${zaklad}/kalendar/index.html?kraj=${encodeURIComponent('Zlínský kraj')}`);
    await p.page.waitForSelector('#seznam .karta');
    const r5 = await p.page.evaluate(() => ({ karet: document.querySelectorAll('#seznam article.karta').length, ld: document.querySelectorAll('script[type="application/ld+json"]').length }));
    ok(r5.karet > 0 && r5.ld === 0, `kalendar/index.html: ${JSON.stringify(r5)}`);
    await p.context.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log('OK: hs-kalendar.js v Chromiu – PC i mobil: karty, mřížka bez poloprázdné řady, obrázky 16:9, místa pro reklamu, filtry v adrese, sdílené odkazy, JSON-LD, izolované styly, bez cookies');
})().catch((e) => { console.error(e); process.exit(1); });
