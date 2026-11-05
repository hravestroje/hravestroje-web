// Test generátoru pinů v prohlížeči (Chromium přes Playwright).
//   node piny/testy/prohlizec.cjs [složka-pro-snímky]
// Když Playwright není nainstalovaný (např. v GitHub Actions), test se přeskočí.
const http = require('http');
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('PŘESKOČENO: Playwright není nainstalovaný (test v prohlížeči se spouští jen místně).');
  process.exit(0);
}
const KOREN = path.join(__dirname, '..', '..');
const DATA = path.join(__dirname, 'data');
const snimky = process.argv[2];
const ok = (podminka, text) => { if (!podminka) { console.error('CHYBA: ' + text); process.exit(1); } };
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

let testoveIlustrace = false;
let ciziAdresa = '';
function posli(res, soubor, nahrad) {
  const typ = TYPY[path.extname(soubor)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': typ + '; charset=utf-8' });
  if (nahrad) return res.end(nahrad(fs.readFileSync(soubor, 'utf8')));
  fs.createReadStream(soubor).pipe(res);
}
// Web: kořen repozitáře; produkty.json a (volitelně) ilustrace.json z testovacích dat.
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/produkty/produkty.json') return posli(res, path.join(DATA, 'produkty.json'), (t) => t.replace(/__CIZI__/g, ciziAdresa));
  if (url === '/piny/ilustrace.json' && testoveIlustrace) return posli(res, path.join(DATA, 'ilustrace.json'));
  let cesta = path.join(KOREN, url);
  if (cesta.endsWith(path.sep)) cesta = path.join(cesta, 'index.html');
  if (!cesta.startsWith(KOREN) || !fs.existsSync(cesta) || fs.statSync(cesta).isDirectory()) { res.writeHead(404); return res.end(); }
  posli(res, cesta);
});
// „Cizí server“ s obrázkem bez hlavičky CORS (jako CDN, která použití na canvasu nepovolí).
const cizi = http.createServer((req, res) => posli(res, path.join(DATA, 'vlacek.svg')));

async function rozvrh(page) {
  return page.evaluate(() => {
    const r = window.HSPinyApp.stav.posledniRozvrh;
    const c = document.createElement('canvas').getContext('2d');
    return {
      ilustrace: r.ilustrace, zem: r.zem, dolniTextu: r.dolniTextu,
      texty: r.prvky.filter((p) => p.typ === 'text').map((p) => { c.font = p.font; const w = c.measureText(p.text).width;
        return { text: p.text, role: p.role, y: p.y, levy: p.zarovnani === 'center' ? p.x - w / 2 : p.x, pravy: p.zarovnani === 'center' ? p.x + w / 2 : p.x + w, barva: p.barva }; })
    };
  });
}
async function pixel(page, x, y) {
  return page.evaluate(([x, y]) => [...document.getElementById('pin').getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
}
const hex = (p) => '#' + p.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
async function prekresleno(page, akce) {
  const pred = await page.evaluate(() => document.body.getAttribute('data-vykresleno'));
  await akce();
  await page.waitForFunction((pred) => document.body.getAttribute('data-vykresleno') !== pred, pred);
  await page.waitForTimeout(120);
  await page.waitForFunction(() => { const s = window.HSPinyApp.stav; return String(s.verze) === document.body.getAttribute('data-vykresleno'); });
}
function kontrolaTextu(r, popis) {
  for (const t of r.texty) {
    ok(t.levy >= 69 && t.pravy <= 931, `${popis}: text „${t.text}“ přesahuje okraj (${Math.round(t.levy)}–${Math.round(t.pravy)})`);
    if (t.role !== 'web') ok(t.y < r.zem, `${popis}: text „${t.text}“ je pod spodní linií`);
  }
  if (r.ilustrace) {
    ok(r.ilustrace.y + r.ilustrace.h === r.zem, `${popis}: ilustrace nestojí na linii`);
    ok(r.ilustrace.y >= r.dolniTextu, `${popis}: ilustrace překrývá text`);
  }
}
function rozmerPng(soubor) {
  const b = fs.readFileSync(soubor);
  ok(b.slice(1, 4).toString() === 'PNG', 'stažený soubor není PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await new Promise((r) => cizi.listen(0, '127.0.0.1', r));
  ciziAdresa = `http://127.0.0.1:${cizi.address().port}`;
  const zaklad = `http://127.0.0.1:${server.address().port}/piny/`;
  const browser = await chromium.launch();
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await kontext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${server.address().port}` });
  const page = await kontext.newPage();
  const chyby = [], ciziPozadavky = [];
  page.on('pageerror', (e) => chyby.push(e.message));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://127.0.0.1:' + server.address().port) && !u.startsWith(ciziAdresa) && !/^(data|blob):/.test(u)) ciziPozadavky.push(u); });
  try {
    // --- 1) Akce z kalendáře ---
    await page.goto(zaklad);
    await page.waitForSelector('body[data-hotovo]');
    const rozmer = await page.evaluate(() => [document.getElementById('pin').width, document.getElementById('pin').height]);
    ok(rozmer[0] === 1000 && rozmer[1] === 1500, `canvas má mít 1000×1500, má ${rozmer}`);
    const pocetAkci = await page.locator('#akce-seznam option').count();
    ok(pocetAkci > 5, `v seznamu akcí je jen ${pocetAkci} položek`);
    ok(await page.inputValue('#nadpis') !== '' && await page.inputValue('#datum') !== '', 'první akce se nepředvyplnila');
    ok(hex(await pixel(page, 5, 5)) === '#1e6f3f', 'nahoře má být zelená plocha');
    ok(hex(await pixel(page, 500, 1343)) === '#1e6f3f', 'chybí zelená spodní linie');
    ok(hex(await pixel(page, 5, 1480)) === '#e9f4ec', 'pozadí má být světle zelené');
    let r = await rozvrh(page);
    kontrolaTextu(r, 'akce');
    ok(r.texty.some((t) => t.role === 'nadpis' && t.barva === '#ffffff'), 'nadpis má být bílý');
    ok(r.texty.some((t) => t.role === 'web' && t.text === 'hravestroje.cz'), 'chybí hravestroje.cz');
    ok(r.texty.some((t) => t.text === 'DOPRAVNÍ AKCE') && await page.inputValue('#stitek') === 'Dopravní akce', 'chybí štítek Dopravní akce');
    ok(await page.locator('#ilu-stav').innerText().then((t) => t.includes('prázdný')), 'chybí upozornění na prázdný seznam ilustrací');

    // filtr kraje a výběr jiné akce
    await page.selectOption('#akce-kraj', 'Liberecký kraj');
    const kraje = await page.$$eval('#akce-seznam option', (o) => o.map((x) => x._akce.kraj));
    ok(kraje.length > 0 && kraje.every((k) => k === 'Liberecký kraj'), 'filtr kraje nefunguje');
    await prekresleno(page, () => page.selectOption('#akce-seznam', { index: 0 }));
    ok(await page.inputValue('#kraj') === 'Liberecký kraj', 'výběr akce nevyplnil kraj');
    const titulek = await page.inputValue('#titulek'), popis = await page.inputValue('#popis');
    ok(titulek.length > 0 && titulek.length <= 100, `titulek má ${titulek.length} znaků`);
    ok(popis.length > 0 && popis.length <= 500 && popis.includes('hravestroje.cz'), `popis má ${popis.length} znaků`);

    // dlouhý nadpis se zalomí a vejde
    await prekresleno(page, () => page.fill('#nadpis', 'Velká podzimní traktoriáda s jízdou historických strojů, soutěží zručnosti, ukázkami orby, dětským koutkem a vyhlášením nejkrásnějšího traktoru celého kraje i okolí'));
    r = await rozvrh(page);
    kontrolaTextu(r, 'dlouhý nadpis');
    const radkyNadpisu = r.texty.filter((t) => t.role === 'nadpis');
    ok(radkyNadpisu.length >= 3 && radkyNadpisu.length <= 4, `dlouhý nadpis má ${radkyNadpisu.length} řádků`);
    ok(radkyNadpisu[radkyNadpisu.length - 1].text.endsWith('…') && !/\s[vkszouai]…$/i.test(radkyNadpisu[radkyNadpisu.length - 1].text), 'zkrácený nadpis: ' + radkyNadpisu.map((t) => t.text).join(' | '));
    if (snimky) await page.locator('#pin').screenshot({ path: path.join(snimky, 'pin-akce.png') });

    // stažení PNG
    const [stazeni] = await Promise.all([page.waitForEvent('download'), page.click('#stahnout')]);
    const ulozeno = path.join(require('os').tmpdir(), 'pin-test-' + process.pid + '.png');
    await stazeni.saveAs(ulozeno);
    ok(/^pin-velka-podzimni-traktoriada.*\.png$/.test(stazeni.suggestedFilename()), 'název souboru: ' + stazeni.suggestedFilename());
    const [w, h] = rozmerPng(ulozeno);
    ok(w === 1000 && h === 1500, `stažené PNG má ${w}×${h}`);
    fs.unlinkSync(ulozeno);

    // kopírování titulku
    await page.click('[data-kopirovat=titulek]');
    await page.waitForFunction(() => document.getElementById('kopirovano').textContent.includes('zkopírován'));
    ok(await page.evaluate(() => navigator.clipboard.readText()) === await page.inputValue('#titulek'), 'schránka neobsahuje titulek');
    console.log(`OK (akce): 1000×1500, ${pocetAkci} akcí, filtr kraje, zalomení dlouhého nadpisu, PNG ${w}×${h}, kopírování`);

    // --- 2) Článek / výlet ---
    await prekresleno(page, () => page.check('input[value=clanek]'));
    ok(await page.isVisible('#odrazka1') && !(await page.isVisible('#datum')), 'formulář článku neukazuje správná pole');
    await prekresleno(page, () => page.fill('#odrazka2', 'Odrážka s velmi dlouhým textem, který se musí zalomit na dva řádky a nakonec se zkrátit trojtečkou, aby nepřetekla do další odrážky ani pod spodní linii pinu'));
    r = await rozvrh(page);
    kontrolaTextu(r, 'článek');
    const odrazky = r.texty.filter((t) => t.role === 'odrazka');
    ok(odrazky.length >= 4 && odrazky.length <= 6, `odrážky mají ${odrazky.length} řádků`);
    ok((await page.inputValue('#odrazka2')).length === 90, 'odrážka má mít nejvýš 90 znaků');
    ok(await page.inputValue('#popis').then((p) => p.endsWith('Celý článek na hravestroje.cz.')), 'popis článku');
    if (snimky) await page.locator('#pin').screenshot({ path: path.join(snimky, 'pin-clanek.png') });
    console.log('OK (článek): podnadpis, 3 odrážky, dlouhá odrážka na 2 řádky');

    // --- 3) Produkt ---
    await prekresleno(page, () => page.check('input[value=produkt]'));
    ok(await page.inputValue('#nadpis') === 'Dřevěný vláček s vagóny', 'první skladový produkt se nepředvyplnil');
    ok(await page.inputValue('#ilu-vyber') === 'produkt', 'u produktu se má nabídnout jeho obrázek');
    const produkty = await page.$$eval('#produkt-seznam option', (o) => o.map((x) => x.textContent));
    ok(produkty.length === 3 && !produkty.some((p) => p.includes('Vyprodaná')), 'jen skladem: ' + produkty);
    r = await rozvrh(page);
    kontrolaTextu(r, 'produkt');
    ok(r.ilustrace && r.texty.some((t) => t.role === 'cena' && t.text.replace(/\s/g, ' ') === '549 Kč'), 'chybí cena nebo obrázek');
    { const px = hex(await pixel(page, r.ilustrace.x + 12, r.ilustrace.y + r.ilustrace.h - 12)); ok(px === '#ffffff', 'fotka produktu má stát na bílé kartě: ' + px + ' ' + JSON.stringify(r.ilustrace)); }
    ok(!(await page.isDisabled('#stahnout')), 'obrázek ze stejného webu – stažení má jít');
    if (snimky) await page.locator('#pin').screenshot({ path: path.join(snimky, 'pin-produkt.png') });

    // obrázek z cizího serveru bez CORS → náhled ano, stažení ne, s vysvětlením
    await prekresleno(page, () => page.selectOption('#produkt-seznam', { label: 'Traktor s vlekem z cizího serveru – 1 890 Kč' }));
    ok(await page.isDisabled('#stahnout'), 'u obrázku bez CORS má být stažení zakázané');
    ok(await page.isVisible('#upozorneni') && (await page.innerText('#upozorneni')).includes('CORS'), 'chybí vysvětlení CORS');
    // bez obrázku jde stáhnout znovu
    await prekresleno(page, () => page.selectOption('#ilu-vyber', ''));
    ok(!(await page.isDisabled('#stahnout')) && !(await page.isVisible('#upozorneni')), 'po odebrání obrázku má jít stáhnout');
    // dlouhý název
    await prekresleno(page, () => page.selectOption('#produkt-seznam', { index: 2 }));
    r = await rozvrh(page);
    kontrolaTextu(r, 'dlouhý produkt');
    ok(r.texty.filter((t) => t.role === 'nadpis').length <= 4, 'dlouhý název produktu má max. 4 řádky');
    console.log('OK (produkt): jen skladem, cena, karta na linii, obrázek bez CORS → bez stažení, dlouhý název');

    // --- 4) Ilustrace ze seznamu (testovací ilustrace.json) ---
    testoveIlustrace = true;
    await page.reload();
    await page.waitForSelector('body[data-hotovo]');
    ok(await page.$$eval('#ilu-vyber option', (o) => o.map((x) => x.value)).then((v) => v.includes('ilu:testy/data/traktor.svg') && v.length === 3),
      'ilustrace.json: má se nabídnout jen platná položka');
    await prekresleno(page, () => page.selectOption('#ilu-vyber', 'ilu:testy/data/traktor.svg'));
    await prekresleno(page, () => page.fill('#ilu-velikost', '100'));
    r = await rozvrh(page);
    kontrolaTextu(r, 'ilustrace');
    const il = r.ilustrace;
    ok(Math.abs(il.w / il.h - 420 / 310) < 0.03, `průhledné okraje se mají oříznout (poměr ${(il.w / il.h).toFixed(2)})`);
    // spodek kola (v SVG y=360, levé kolo střed x=170 z 80–500) musí sedět přímo na lince
    const xKola = Math.round(il.x + (170 - 80) / 420 * il.w);
    ok(hex(await pixel(page, xKola, r.zem - 2)) === '#1d2420', 'kolo nestojí na spodní linii: ' + hex(await pixel(page, xKola, r.zem - 2)));
    await prekresleno(page, () => page.fill('#ilu-velikost', '40'));
    await prekresleno(page, () => page.fill('#ilu-posun', '-100'));
    r = await rozvrh(page);
    ok(r.ilustrace.x === 70 && r.ilustrace.y + r.ilustrace.h === r.zem && r.ilustrace.w < il.w * 0.5, 'posun vlevo / zmenšení');
    if (snimky) await page.locator('#pin').screenshot({ path: path.join(snimky, 'pin-ilustrace.png') });
    console.log('OK (ilustrace): seznam z ilustrace.json, ořez průhledných okrajů, stojí na linii, velikost a posun');

    ok(await page.evaluate(() => document.cookie) === '', 'stránka nastavila cookie');
    ok((await kontext.cookies()).length === 0, 'v prohlížeči je cookie');
    ok(!ciziPozadavky.length, 'požadavky na cizí servery: ' + ciziPozadavky.join(', '));
    ok(!chyby.length, 'chyby JavaScriptu: ' + chyby.join('; '));

    // --- 5) Mobil ---
    const mobil = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await mobil.goto(zaklad);
    await mobil.waitForSelector('body[data-hotovo]');
    const posun = await mobil.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(posun <= 0, `mobil: stránka se posouvá do strany o ${posun}px`);
    if (snimky) {
      await page.screenshot({ path: path.join(snimky, 'stranka-pc.png'), fullPage: true });
      await mobil.screenshot({ path: path.join(snimky, 'stranka-mobil.png'), fullPage: true });
    }
    console.log('OK (mobil): bez vodorovného posouvání; bez cookies, bez cizích požadavků, bez chyb JS');
  } finally {
    await browser.close();
    server.close(); cizi.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
