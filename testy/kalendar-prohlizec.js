// Test kalendáře jako mobilní aplikace v Chromiu (Playwright): oblíbené, filtr „Moje oblíbené“,
// můj kraj, zakázané úložiště, tlačítko „Přidat do mobilu“ (Android i iPhone), offline režim
// a žádné cookies.  node testy/kalendar-prohlizec.js [složka-pro-snímky]
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
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };

// Testovací akce vždy v budoucnu (nezávisle na dnešním datu)
const AKTUALIZOVANO = new Date(Date.now() - 3 * 3600 * 1000);
function den(posun) {
  const d = new Date();
  d.setDate(d.getDate() + posun);
  return d.toISOString().slice(0, 10);
}
const DATA = {
  aktualizovano: AKTUALIZOVANO.toISOString(),
  akce: [
    ['t1', 'Parní vlak na Mikuláše', 3, 'Jihomoravský kraj', 'vlaky', 'Brno'],
    ['t2', 'Traktoriáda pod horami', 5, 'Zlínský kraj', 'traktory', 'Zlín'],
    ['t3', 'Plavba po Vltavě', 8, 'Hlavní město Praha', 'lode', 'Praha'],
    ['t4', 'Letecký den', 12, 'Královéhradecký kraj', 'letadla', 'Hradec Králové'],
    ['t5', 'Sraz veteránů', 15, 'Zlínský kraj', 'auta', 'Kroměříž'],
    ['t6', 'Jízda motoráčkem', 20, 'Jihomoravský kraj', 'vlaky', 'Znojmo'],
  ].map(([id, nazev, posun, kraj, typ, obec]) => ({
    id, nazev, zacatek: den(posun), kraj, obec, typy: [typ],
    url: 'https://www.hravestroje.cz/kalendar-dopravnich-akci/' + id + '/', obrazek: null,
  })),
};

const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let cesta = decodeURIComponent(req.url.split('?')[0]);
  if (cesta === '/kalendar/akce.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(DATA));
  }
  if (cesta.endsWith('/')) cesta += 'index.html';
  const soubor = path.join(KOREN, cesta);
  if (!soubor.startsWith(KOREN) || !fs.existsSync(soubor) || fs.statSync(soubor).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': (TYPY[path.extname(soubor)] || 'text/plain') + '; charset=utf-8' });
  fs.createReadStream(soubor).pipe(res);
});

let chybyStranky = [];
async function novyKontext(browser, volby = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block', ...volby });
  // obrázky z cizích webů v testu nestahovat
  await ctx.route((u) => !/^http:\/\/localhost/.test(u.toString()), (r) => r.abort());
  return ctx;
}
async function otevri(ctx, adresa) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => chybyStranky.push(e.message));
  await p.goto(adresa);
  await p.waitForSelector('.karta');
  return p;
}
const viditelny = (p, sel) => p.$eval(sel, (e) => !e.hidden && e.offsetParent !== null).catch(() => false);
const falesnaInstalace = (vysledek) => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  window.__prompt = 0;
  e.prompt = () => { window.__prompt++; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: vysledek, platform: 'web' });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

(async () => {
  await new Promise((r) => server.listen(0, 'localhost', r));
  const ADR = `http://localhost:${server.address().port}/kalendar/`;
  const browser = await chromium.launch();
  let n = 0;
  try {
    // ---------- Oblíbené ----------
    {
      const ctx = await novyKontext(browser);
      const p = await otevri(ctx, ADR);
      ok((await p.$$('.karta')).length === 6, 'čekám 6 akcí');
      ok(await p.$eval('#akce-t3 .srdce svg', (s) => s.tagName.toLowerCase() === 'svg'), 'srdíčko je SVG ikona');
      await p.click('#akce-t3 .srdce');
      await p.click('#akce-t5 .srdce');
      ok(await p.$eval('#akce-t3 .srdce', (b) => b.getAttribute('aria-pressed')) === 'true', 'srdíčko po klepnutí aria-pressed=true');
      ok(await p.textContent('#pocet-oblibenych') === '2', 'počet oblíbených 2');
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-oblibene-srdicko.png') });
      await p.reload();
      await p.waitForSelector('.karta');
      ok(await p.$eval('#akce-t5 .srdce', (b) => b.getAttribute('aria-pressed')) === 'true', 'oblíbené přežijí nové otevření');
      await p.click('#jen-oblibene');
      const ids = await p.$$eval('.karta', (k) => k.map((x) => x.id));
      ok(ids.join() === 'akce-t3,akce-t5', 'filtr Moje oblíbené: ' + ids);
      ok((await p.textContent('#pocet')).includes('Moje oblíbené: 2 akce'), 'souhrn filtru');
      ok(await viditelny(p, '#zrusit'), 'Zrušit filtry viditelné');
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-moje-oblibene.png') });
      await p.click('#akce-t3 .srdce');
      ok((await p.$$('.karta')).length === 1, 'odebraná akce zmizí z filtru');
      await p.click('#akce-t5 .srdce');
      ok((await p.textContent('#seznam')).includes('Zatím nemáte žádné oblíbené akce'), 'prázdné oblíbené – vysvětlení');
      await p.click('#zrusit');
      ok((await p.$$('.karta')).length === 6, 'Zrušit filtry vypne i Moje oblíbené');
      ok((await ctx.cookies()).length === 0, 'žádné cookies');
      await ctx.close();
      n++;
    }

    // ---------- Můj kraj ----------
    {
      const ctx = await novyKontext(browser);
      const p = await otevri(ctx, ADR);
      ok(!(await viditelny(p, '#muj-kraj-obal')), 'bez vybraného kraje není „Můj kraj“');
      await p.click('#prepinac-filtru');
      await p.selectOption('#kraj', 'Zlínský kraj');
      ok(await viditelny(p, '#muj-kraj-obal'), 'po výběru kraje je nabídka „Můj kraj“');
      await p.check('#muj-kraj');
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-muj-kraj.png') });
      const p2 = await otevri(ctx, ADR); // nové otevření bez filtrů v adrese
      ok(await p2.inputValue('#kraj') === 'Zlínský kraj', 'můj kraj je předvybraný');
      ok((await p2.$$('.karta')).length === 2, 'jen akce z mého kraje');
      ok((await p2.textContent('#kraj option:checked')).includes('můj kraj'), 'v nabídce označeno „můj kraj“');
      const p3 = await otevri(ctx, ADR + '?kraj=Hlavn%C3%AD%20m%C4%9Bsto%20Praha');
      ok(await p3.inputValue('#kraj') === 'Hlavní město Praha', 'kraj z odkazu má přednost před mým krajem');
      await p2.click('#prepinac-filtru');
      await p2.uncheck('#muj-kraj');
      const p4 = await otevri(ctx, ADR);
      ok(await p4.inputValue('#kraj') === '', 'zrušený můj kraj se už nepředvybere');
      await ctx.close();
      n++;
    }

    // ---------- Zakázané úložiště ----------
    {
      const ctx = await novyKontext(browser);
      await ctx.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Zakázáno', 'SecurityError'); } });
      });
      const p = await otevri(ctx, ADR);
      await p.click('#akce-t1 .srdce');
      ok(await p.$eval('#akce-t1 .srdce', (b) => b.getAttribute('aria-pressed')) === 'true', 'bez úložiště oblíbené fungují do zavření stránky');
      await p.click('#jen-oblibene');
      ok((await p.$$('.karta')).length === 1, 'bez úložiště funguje i filtr Moje oblíbené');
      await p.click('#jen-oblibene');
      await p.reload();
      await p.waitForSelector('.karta');
      ok(await p.$eval('#akce-t1 .srdce', (b) => b.getAttribute('aria-pressed')) === 'false', 'bez úložiště se po zavření nic nepamatuje');
      ok(await p.evaluate(falesnaInstalace, 'accepted'), 'beforeinstallprompt zachycen');
      await p.click('#instalovat');
      ok(chybyStranky.length === 0, 'chyby stránky bez úložiště: ' + chybyStranky.join(' | '));
      await ctx.close();
      n++;
    }

    // ---------- Přidat do mobilu – Android ----------
    {
      const ctx = await novyKontext(browser);
      const p = await otevri(ctx, ADR);
      ok(!(await viditelny(p, '#instalace')), 'bez beforeinstallprompt se tlačítko neukazuje');
      ok(await p.evaluate(falesnaInstalace, 'accepted'), 'výchozí lišta prohlížeče potlačena (preventDefault)');
      ok(await viditelny(p, '#instalace'), 'tlačítko Přidat do mobilu');
      ok((await p.textContent('#instalovat')).includes('Přidat do mobilu'), 'text tlačítka');
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-pridat-android.png') });
      await p.click('#instalovat');
      ok(await p.evaluate(() => window.__prompt) === 1, 'klepnutí spustí systémovou instalaci');
      await p.waitForFunction(() => document.getElementById('instalace').hidden);
      const p2 = await otevri(ctx, ADR);
      await p2.evaluate(falesnaInstalace, 'accepted');
      ok(!(await viditelny(p2, '#instalace')), 'po instalaci se už neukazuje');
      await ctx.close();

      const ctx2 = await novyKontext(browser);
      const q = await otevri(ctx2, ADR);
      await q.evaluate(falesnaInstalace, 'dismissed');
      await q.click('#zavrit-instalaci');
      ok(!(await viditelny(q, '#instalace')), 'křížek tlačítko skryje');
      const q2 = await otevri(ctx2, ADR);
      await q2.evaluate(falesnaInstalace, 'dismissed');
      ok(!(await viditelny(q2, '#instalace')), 'po zavření se už neukazuje');
      await ctx2.close();
      n++;
    }

    // ---------- Přidat do mobilu – iPhone ----------
    {
      const ctx = await novyKontext(browser, { ...devices['iPhone 13'] });
      const p = await otevri(ctx, ADR);
      ok(await viditelny(p, '#instalace'), 'iPhone: tlačítko i bez beforeinstallprompt');
      ok(!(await viditelny(p, '#navod-ios')), 'návod je zatím schovaný');
      await p.click('#instalovat');
      ok(await viditelny(p, '#navod-ios'), 'iPhone: návod po klepnutí');
      const navod = await p.textContent('#navod-ios');
      ok(navod.includes('Sdílet') && navod.includes('Přidat na plochu'), 'návod Sdílet → Přidat na plochu');
      ok((await p.$$('#navod-ios svg')).length >= 2, 'ikony v návodu jsou SVG');
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-pridat-iphone.png') });
      await p.click('#navod-hotovo');
      ok(!(await viditelny(p, '#instalace')), 'Rozumím skryje návod');
      const p2 = await otevri(ctx, ADR);
      ok(!(await viditelny(p2, '#instalace')), 'iPhone: po zavření se už neukazuje');
      await ctx.close();
      n++;
    }

    // ---------- Offline ----------
    {
      const ctx = await novyKontext(browser, { serviceWorkers: 'allow' });
      const p = await otevri(ctx, ADR);
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.reload();
      await p.waitForSelector('.karta');
      ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker řídí stránku');
      await p.click('#akce-t2 .srdce');
      ok(!(await viditelny(p, '#offline')), 'online: bez poznámky offline');
      await ctx.setOffline(true);
      await p.reload();
      await p.waitForSelector('.karta');
      ok((await p.$$('.karta')).length === 6, 'offline: uložený seznam akcí');
      ok(await viditelny(p, '#offline'), 'offline: poznámka je vidět');
      const text = await p.textContent('#offline');
      const d = AKTUALIZOVANO;
      const cekam = 'naposledy aktualizováno ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
      ok(text.includes(cekam), `offline: „${cekam}“ v textu „${text}“`);
      ok(await p.$eval('#akce-t2 .srdce', (b) => b.getAttribute('aria-pressed')) === 'true', 'offline: oblíbené zůstaly');
      for (const soubor of ['icons/icon-192.png', 'icons/icon-maskable-512.png', 'manifest.webmanifest', 'zarizeni.js']) {
        const st = await p.evaluate((u) => fetch(u).then((r) => r.status, () => 0), soubor);
        ok(st === 200, 'offline: ' + soubor + ' z mezipaměti, stav ' + st);
      }
      if (snimky) await p.screenshot({ path: path.join(snimky, 'mobil-offline.png') });
      await ctx.setOffline(false);
      await p.evaluate(() => window.dispatchEvent(new Event('online')));
      await p.waitForFunction(() => document.getElementById('offline').hidden);
      await ctx.close();
      n++;
    }
    ok(chybyStranky.filter((t) => !/Zakázáno/.test(t)).length === 0, 'chyby JavaScriptu: ' + chybyStranky.join(' | '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`OK: ${n} scénářů v Chromiu na mobilu (oblíbené, můj kraj, bez úložiště, instalace Android/iPhone, offline)`);
})().catch((e) => { console.error('CHYBA:', e.message); process.exit(1); });
