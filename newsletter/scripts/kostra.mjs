#!/usr/bin/env node
// Kostra víkendového newsletteru pro Ecomail.
//
// Z kalendar/akce.json a produkty/produkty.json vytvoří HTML e-mail:
//   - tabulkový layout 600 px, jen inline styly (kvůli e-mailovým klientům), značkové barvy,
//   - úvod (místo k dopsání),
//   - akce nejbližšího víkendu po krajích (Královéhradecký a sousední první),
//     u každé odkaz na náš článek a značka „OVĚŘIT U POŘADATELE“,
//   - 3 produkty z e-shopu (skladem, přednostně sezónní a ve slevě),
//   - patička s odhlášením přes proměnnou Ecomailu {unsubscribe}.
// Všechny odkazy na hravestroje.cz dostanou UTM (utm_source=newsletter).
//
// Výstup:  newsletter/kostry/RRRR-MM-DD.html (datum = pátek víkendu) – celý e-mail
//          newsletter/index.html (seznam koster s tlačítkem „Zkopírovat HTML“)
//
// Spuštění:  node newsletter/scripts/kostra.mjs [volby]
//   --vikend RRRR-MM-DD   víkend, do kterého datum patří (po–čt = nejbližší následující víkend)
//   --dnes RRRR-MM-DD     „dnešní“ datum (výchozí dnešek v Praze)
//   --akce SOUBOR         zdroj akcí (výchozí kalendar/akce.json)
//   --produkty SOUBOR     zdroj produktů (výchozí produkty/produkty.json)
//   --vystup SLOZKA       kam uložit index.html a kostry/ (výchozí newsletter/)
//
// Nepotřebuje žádné balíčky z npm, stačí Node.js 20 nebo novější.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import {
  vikendPro, akceVikendu, podleKraju, terminAkce, mistoAkce, nazevVikendu,
  escapeHtml, dnesVPraze, OVERIT,
} from '../../vikend/scripts/kostra.mjs';

export { OVERIT };

const KOREN_REPA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ODHLASENI = '{unsubscribe}';
export const POCET_PRODUKTU = 3;
const WEB_URL = 'https://www.hravestroje.cz/';
const KALENDAR_URL = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/';
const MAX_POPIS = 180;
// Gmail zkracuje e-maily větší než ~102 kB („Zobrazit celou zprávu“).
export const LIMIT_VELIKOSTI = 100 * 1024;

// Značkové barvy (stejné jako kalendar/styles.css).
export const BARVY = {
  zelena: '#1f6f3d',
  zelenaTmava: '#16532d',
  zelenaSvetla: '#e6f1ea',
  cihlova: '#c0392b',
  cihlovaSvetla: '#fbeae7',
  text: '#1d2420',
  tlumeny: '#59635d',
  pozadi: '#f6f5f1',
  karta: '#ffffff',
  okraj: '#dfe3dd',
};
const PISMO = 'Arial, Helvetica, sans-serif';

// ---------- odkazy ----------

const bezpecnaUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

/** Přidá UTM parametry k odkazu na hravestroje.cz (jiné adresy nechá být). */
export function sUtm(url, kampan) {
  const u = bezpecnaUrl(url);
  if (!u) return '';
  let adresa;
  try { adresa = new URL(u); } catch { return ''; }
  if (!/(^|\.)hravestroje\.cz$/i.test(adresa.hostname)) return u;
  adresa.searchParams.set('utm_source', 'newsletter');
  adresa.searchParams.set('utm_medium', 'email');
  adresa.searchParams.set('utm_campaign', kampan);
  return adresa.toString();
}

export const kampanPro = (vikend) => `vikend-${vikend.patek}`;

// ---------- produkty ----------

function hash(text) {
  // FNV-1a – stejný víkend = stejný výběr, jiný víkend = jiné pořadí
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Vybere produkty do newsletteru: jen skladem, s odkazem a cenou.
 * Přednost mají produkty s obrázkem, pak sezónní téma (např. Vánoce v říjnu–prosinci)
 * a sleva. Produkty s tématem mimo sezónu se vynechají (stejně jako v hs-darky.js).
 * Pořadí v rámci stejné priority se mění podle víkendu.
 */
export function vyberProdukty(data, vikend, pocet = POCET_PRODUKTU) {
  const produkty = Array.isArray(data?.produkty) ? data.produkty : [];
  const mesic = Number(vikend.patek.slice(5, 7));
  const vSezone = [], mimoSezonu = [];
  for (const s of data?.sezony || []) ((s.mesice || []).includes(mesic) ? vSezone : mimoSezonu).push(s.tema);

  const videno = new Set();
  return produkty
    .filter((p) => p && p.skladem === true && p.nazev && bezpecnaUrl(p.url) && Number(p.cena) > 0)
    .filter((p) => {
      const t = p.temata || [];
      return !t.some((x) => mimoSezonu.includes(x)) || t.some((x) => vSezone.includes(x));
    })
    .map((p) => {
      const t = p.temata || [];
      const skore = (bezpecnaUrl(p.obrazek) ? 8 : 0)
        + (t.some((x) => vSezone.includes(x)) ? 4 : 0)
        + (Number(p.puvodni_cena) > Number(p.cena) ? 2 : 0);
      return { p, skore, poradi: hash(`${vikend.patek}|${p.url}`) };
    })
    .sort((a, b) => b.skore - a.skore || a.poradi - b.poradi)
    .map((x) => x.p)
    .filter((p) => (videno.has(p.url) ? false : videno.add(p.url)))
    .slice(0, pocet);
}

export const cenaKc = (c) => `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 }).format(Math.round(Number(c)))} Kč`;

// ---------- HTML e-mailu ----------

const zkrat = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

const odkaz = (url, text, styl = '') => `<a href="${escapeHtml(url)}" target="_blank" style="color:${BARVY.zelena};text-decoration:underline;${styl}">${text}</a>`;

function tlacitko(url, text) {
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;">
<tr><td align="center" bgcolor="${BARVY.zelena}" style="background-color:${BARVY.zelena};border-radius:6px;">
<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:10px 18px;font-family:${PISMO};font-size:15px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:6px;">${text}</a>
</td></tr>
</table>`;
}

const radek = (obsah, styl = '') => `<tr>
<td style="padding:0 24px;${styl}">
${obsah}
</td>
</tr>`;

const nadpis2 = (text) => `<h2 style="margin:0;padding:24px 0 8px;font-family:${PISMO};font-size:22px;line-height:28px;color:${BARVY.zelenaTmava};">${text}</h2>`;

function htmlAkce(a, kampan) {
  const url = sUtm(a.url, kampan);
  const nazev = url
    ? odkaz(url, escapeHtml(a.nazev), `color:${BARVY.text};text-decoration:none;`)
    : escapeHtml(a.nazev);
  const znacka = (text) => `<span style="display:inline-block;padding:2px 8px;background-color:${BARVY.cihlova};color:#ffffff;font-family:${PISMO};font-size:12px;font-weight:bold;line-height:18px;border-radius:4px;letter-spacing:0.5px;">${text}</span>`;
  const misto = mistoAkce(a);
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr><td style="padding:12px 0;border-bottom:1px solid ${BARVY.okraj};font-family:${PISMO};color:${BARVY.text};">
<p style="margin:0 0 6px;font-size:17px;line-height:23px;font-weight:bold;">${nazev}</p>
<p style="margin:0 0 6px;">${znacka(OVERIT)}${a.presunuto ? ` ${znacka('POZOR: AKCE BYLA PŘESUNUTA')}` : ''}</p>
<p style="margin:0;font-size:15px;line-height:21px;color:${BARVY.tlumeny};"><strong style="color:${BARVY.text};">Kdy:</strong> ${escapeHtml(terminAkce(a))}${misto ? `<br><strong style="color:${BARVY.text};">Kde:</strong> ${escapeHtml(misto)}` : ''}</p>
${a.popis ? `<p style="margin:6px 0 0;font-size:15px;line-height:21px;">${escapeHtml(zkrat(a.popis, MAX_POPIS))}</p>\n` : ''}${url ? `<p style="margin:6px 0 0;font-size:15px;line-height:21px;">${odkaz(url, 'Podrobnosti v článku')}</p>\n` : ''}</td></tr>
</table>`;
}

function htmlProdukt(p, kampan) {
  const url = sUtm(p.url, kampan);
  const obrazek = bezpecnaUrl(p.obrazek);
  const sleva = Number(p.puvodni_cena) > Number(p.cena);
  const cena = `<strong style="color:${sleva ? BARVY.cihlova : BARVY.text};">${escapeHtml(cenaKc(p.cena))}</strong>`
    + (sleva ? ` <s style="color:${BARVY.tlumeny};">${escapeHtml(cenaKc(p.puvodni_cena))}</s>` : '');
  return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr>
<td width="120" valign="top" style="width:120px;padding:12px 16px 12px 0;border-bottom:1px solid ${BARVY.okraj};">
${obrazek ? `<a href="${escapeHtml(url)}" target="_blank"><img src="${escapeHtml(obrazek)}" width="120" height="120" alt="${escapeHtml(p.nazev)}" style="display:block;width:120px;height:120px;object-fit:contain;border:0;outline:none;text-decoration:none;background-color:${BARVY.pozadi};border-radius:6px;"></a>` : '&nbsp;'}
</td>
<td valign="top" style="padding:12px 0;border-bottom:1px solid ${BARVY.okraj};font-family:${PISMO};color:${BARVY.text};">
<p style="margin:0 0 6px;font-size:16px;line-height:22px;font-weight:bold;">${odkaz(url, escapeHtml(p.nazev), `color:${BARVY.text};text-decoration:none;`)}</p>
<p style="margin:0 0 10px;font-size:16px;line-height:22px;">${cena}</p>
${tlacitko(url, 'Prohlédnout')}
</td>
</tr>
</table>`;
}

/** Celý HTML e-mail. Vrací { html, pocet, produkty }. */
export function newsletter(vsechnyAkce, dataProduktu, vikend) {
  const kampan = kampanPro(vikend);
  const akce = akceVikendu(vsechnyAkce, vikend);
  const skupiny = podleKraju(akce);
  const produkty = vyberProdukty(dataProduktu, vikend);
  const nazev = nazevVikendu(vikend);
  const predmet = `Co se děje o víkendu ${nazev}`;

  const casti = [];
  // úvod
  casti.push(radek(`<p style="margin:24px 0 0;padding:12px;font-family:${PISMO};font-size:16px;line-height:24px;color:${BARVY.text};background-color:${BARVY.cihlovaSvetla};">DOPSAT ÚVOD</p>`));

  // akce
  casti.push(radek(nadpis2(`Akce o víkendu ${escapeHtml(nazev)}`)
    + `\n<p style="margin:0;font-family:${PISMO};font-size:14px;line-height:20px;color:${BARVY.tlumeny};">Termíny přebíráme od pořadatelů. Před cestou si prosím ověřte aktuální informace na jejich webu.</p>`));
  if (!akce.length) {
    casti.push(radek(`<p style="margin:12px 0 0;font-family:${PISMO};font-size:16px;line-height:24px;color:${BARVY.text};">V kalendáři zatím nejsou na tento víkend žádné akce.</p>`));
  }
  for (const s of skupiny) {
    casti.push(radek(`<h3 style="margin:0;padding:20px 0 4px;font-family:${PISMO};font-size:18px;line-height:24px;color:${BARVY.zelena};border-bottom:2px solid ${BARVY.zelena};">${escapeHtml(s.kraj)}</h3>`));
    for (const a of s.akce) casti.push(radek(htmlAkce(a, kampan)));
  }
  casti.push(radek(`<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td style="padding:20px 0 0;">\n${tlacitko(sUtm(KALENDAR_URL, kampan), 'Všechny akce v kalendáři')}\n</td></tr></table>`));

  // produkty
  if (produkty.length) {
    casti.push(radek(nadpis2('Z našeho e-shopu')));
    for (const p of produkty) casti.push(radek(htmlProdukt(p, kampan)));
  }

  const html = `<!DOCTYPE html>
<html lang="cs" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="hs-vikend" content="${vikend.patek}">
<meta name="hs-pocet-akci" content="${akce.length}">
<title>${escapeHtml(predmet)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BARVY.pozadi};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BARVY.pozadi};">Tipy na akce s vláčky, traktory a další technikou na víkend ${escapeHtml(nazev)}.</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${BARVY.pozadi}" style="border-collapse:collapse;background-color:${BARVY.pozadi};">
<tr>
<td align="center" style="padding:16px 8px;">
<table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" bgcolor="${BARVY.karta}" style="border-collapse:collapse;width:100%;max-width:600px;background-color:${BARVY.karta};">
<tr>
<td bgcolor="${BARVY.zelena}" style="padding:20px 24px;background-color:${BARVY.zelena};font-family:${PISMO};">
<a href="${escapeHtml(sUtm(WEB_URL, kampan))}" target="_blank" style="font-size:24px;line-height:30px;font-weight:bold;color:#ffffff;text-decoration:none;">Hravé stroje</a>
<p style="margin:4px 0 0;font-size:15px;line-height:21px;color:${BARVY.zelenaSvetla};">Co se děje o víkendu ${escapeHtml(nazev)}</p>
</td>
</tr>
${casti.join('\n')}
<tr>
<td style="padding:24px;">&nbsp;</td>
</tr>
<tr>
<td bgcolor="${BARVY.zelenaSvetla}" style="padding:20px 24px;background-color:${BARVY.zelenaSvetla};font-family:${PISMO};font-size:13px;line-height:19px;color:${BARVY.tlumeny};">
<p style="margin:0 0 8px;">Tento e-mail dostáváte, protože jste se přihlásili k odběru novinek z webu ${odkaz(sUtm(WEB_URL, kampan), 'hravestroje.cz')}.</p>
<p style="margin:0;">Pokud už o e-maily nestojíte, můžete se <a href="${ODHLASENI}" target="_blank" style="color:${BARVY.zelena};text-decoration:underline;">odhlásit z odběru</a>.</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;
  return { html, pocet: akce.length, produkty: produkty.length, predmet };
}

// ---------- seznam koster ----------

export function stranaSeznamu(kostry) {
  const polozky = kostry.map(({ patek, pocet }) => {
    const v = vikendPro(patek);
    const soubor = `kostry/${patek}.html`;
    return `<li class="hs-kostra">
<a href="${soubor}">Víkend ${escapeHtml(nazevVikendu(v))}</a> (akcí: ${pocet})
<button type="button" class="hs-kopirovat" data-soubor="${soubor}">Zkopírovat HTML</button>
<span class="hs-stav" aria-live="polite"></span>
<br><span class="hs-predmet">Předmět: Co se děje o víkendu ${escapeHtml(nazevVikendu(v))}</span>
</li>`;
  });
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Víkendový newsletter – kostry</title>
<style>
  body { margin: 0; background: #fbf7f0; color: #2b2622; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
  a { color: #1f6f3d; }
  .hs-kostra { margin: 12px 0; }
  .hs-kopirovat { margin-left: 8px; font: inherit; padding: 2px 10px; cursor: pointer; }
  .hs-stav { margin-left: 6px; color: #1f6f3d; }
  .hs-predmet { color: #59635d; font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>Víkendový newsletter – kostry pro Ecomail</h1>
<p>Kostry vznikají automaticky z <a href="../kalendar/">kalendáře akcí</a> a produktů z e-shopu každou středu večer.
Jsou to <strong>jen podklady</strong>: dopište úvod, každou akci ověřte u pořadatele a smažte u ní označení „${OVERIT}“.</p>
<p>Tlačítko „Zkopírovat HTML“ zkopíruje celý e-mail. V Ecomailu ho vložte do kampaně jako vlastní HTML šablonu.</p>
${polozky.length ? `<ul>\n${polozky.join('\n')}\n</ul>` : '<p>Zatím tu nejsou žádné kostry.</p>'}
<p><a href="../">Zpět na veřejné soubory webu</a></p>
</main>
<script>
(function () {
  function kopiruj(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, chyba) {
      var t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? ok() : chyba(new Error('kopírování odmítnuto')); }
      catch (e) { chyba(e); } finally { document.body.removeChild(t); }
    });
  }
  document.querySelectorAll('.hs-kopirovat').forEach(function (tl) {
    tl.addEventListener('click', function () {
      var stav = tl.parentNode.querySelector('.hs-stav');
      stav.textContent = 'Kopíruji…';
      fetch(tl.getAttribute('data-soubor'), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (html) {
          if (html.indexOf('{unsubscribe}') < 0) throw new Error('v souboru chybí odkaz na odhlášení');
          return kopiruj(html);
        })
        .then(function () { stav.textContent = 'Zkopírováno.'; })
        .catch(function (e) { stav.textContent = 'Nepodařilo se zkopírovat (' + e.message + ').'; });
    });
  });
})();
</script>
</body>
</html>
`;
}

async function nactiKostry(slozka) {
  let soubory = [];
  try { soubory = await readdir(slozka); } catch { return []; }
  const kostry = [];
  for (const f of soubory.filter((x) => /^\d{4}-\d{2}-\d{2}\.html$/.test(x)).sort().reverse()) {
    const text = await readFile(path.join(slozka, f), 'utf8');
    const pocet = (text.match(/<meta name="hs-pocet-akci" content="(\d+)">/) || [])[1] ?? '?';
    kostry.push({ patek: f.slice(0, 10), pocet });
  }
  return kostry;
}

// ---------- spuštění ----------

export function zpracujVolby(argv) {
  const volby = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(vikend|dnes|akce|produkty|vystup)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`Neznámá volba „${argv[i]}“. Povolené: --vikend, --dnes, --akce, --produkty, --vystup.`);
    const hodnota = m[2] ?? argv[++i];
    if (!hodnota) throw new Error(`U volby --${m[1]} chybí hodnota.`);
    volby[m[1]] = hodnota;
  }
  return volby;
}

async function nactiJson(soubor, co) {
  let text;
  try { text = await readFile(soubor, 'utf8'); } catch {
    throw new Error(`Soubor ${co} ${soubor} neexistuje.`);
  }
  try { return JSON.parse(text); } catch {
    throw new Error(`Soubor ${co} ${soubor} není platný JSON.`);
  }
}

export async function spust(argv = process.argv.slice(2)) {
  const volby = zpracujVolby(argv);
  const zdrojAkci = path.resolve(volby.akce || path.join(KOREN_REPA, 'kalendar', 'akce.json'));
  const zdrojProduktu = path.resolve(volby.produkty || path.join(KOREN_REPA, 'produkty', 'produkty.json'));
  const vystup = path.resolve(volby.vystup || path.join(KOREN_REPA, 'newsletter'));
  const vikend = vikendPro(volby.vikend || volby.dnes || dnesVPraze());

  const dataAkci = await nactiJson(zdrojAkci, 's akcemi');
  const akce = Array.isArray(dataAkci) ? dataAkci : dataAkci.akce;
  if (!Array.isArray(akce)) throw new Error(`V ${zdrojAkci} chybí seznam akcí.`);
  const dataProduktu = await nactiJson(zdrojProduktu, 's produkty');
  if (!Array.isArray(dataProduktu.produkty)) throw new Error(`V ${zdrojProduktu} chybí seznam produktů.`);

  const { html, pocet, produkty } = newsletter(akce, dataProduktu, vikend);
  const slozkaKoster = path.join(vystup, 'kostry');
  await mkdir(slozkaKoster, { recursive: true });
  const soubor = path.join(slozkaKoster, `${vikend.patek}.html`);
  await writeFile(soubor, html);
  await writeFile(path.join(vystup, 'index.html'), stranaSeznamu(await nactiKostry(slozkaKoster)));

  console.log(`Newsletter na víkend ${nazevVikendu(vikend)}: akcí ${pocet}, produktů ${produkty} → ${path.relative(process.cwd(), soubor) || soubor}`);
  if (produkty < POCET_PRODUKTU) console.warn(`Upozornění: skladem je jen ${produkty} vhodných produktů (čekám ${POCET_PRODUKTU}).`);
  const velikost = Buffer.byteLength(html);
  if (velikost > LIMIT_VELIKOSTI) {
    console.warn(`Upozornění: e-mail má ${Math.round(velikost / 1024)} kB, Gmail ho zkrátí (limit asi 102 kB). Zvažte vynechání některých akcí.`);
  }
  return { vikend, pocet, produkty, soubor, velikost };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  spust().catch((e) => {
    console.error(`Chyba: ${e.message}`);
    process.exit(1);
  });
}
