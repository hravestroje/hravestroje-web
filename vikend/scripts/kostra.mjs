#!/usr/bin/env node
// Kostra článku „Co se děje o víkendu“ z kalendáře akcí.
//
// Vezme kalendar/akce.json, vybere akce, které zasahují do víkendu (pátek–neděle),
// a vytvoří HTML podklad pro článek:
//   - úvod (místo k dopsání),
//   - přehled akcí podle krajů (Královéhradecký a sousední kraje první),
//   - u každé akce výrazné „OVĚŘIT U POŘADATELE“ – kostra je jen podklad,
//   - tabulku všech akcí, FAQ a JSON-LD ItemList (skript jako poslední prvek obsahu).
//
// Výstup:  vikend/kostry/RRRR-MM-DD.html (datum = pátek víkendu)
//          vikend/index.html (seznam koster s tlačítkem „Zkopírovat HTML“)
//
// Spuštění:  node vikend/scripts/kostra.mjs [volby]
//   --vikend RRRR-MM-DD   víkend, do kterého datum patří (po–čt = nejbližší následující víkend)
//   --dnes RRRR-MM-DD     „dnešní“ datum (výchozí dnešek v Praze) – nejbližší víkend od něj
//   --akce SOUBOR         zdroj akcí (výchozí kalendar/akce.json)
//   --vystup SLOZKA       kam uložit index.html a kostry/ (výchozí vikend/)
//
// Nepotřebuje žádné balíčky z npm, stačí Node.js 20 nebo novější.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const KOREN_REPA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ZACATEK_KOSTRY = '<!-- HS-KOSTRA-ZACATEK -->';
export const KONEC_KOSTRY = '<!-- HS-KOSTRA-KONEC -->';
export const OVERIT = 'OVĚŘIT U POŘADATELE';
const BEZ_KRAJE = 'Kraj neuveden';
const KALENDAR_URL = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/';

// Královéhradecký kraj a jeho sousedé jdou první, ostatní kraje abecedně, akce bez kraje nakonec.
export const PRVNI_KRAJE = ['Královéhradecký kraj', 'Pardubický kraj', 'Liberecký kraj', 'Středočeský kraj'];

const DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];
const DNY_KRATCE = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const MESICE_2P = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
  'srpna', 'září', 'října', 'listopadu', 'prosince'];

// ---------- data a víkend ----------

const RE_DATUM = /^\d{4}-\d{2}-\d{2}$/;

function naDatum(ymd) {
  if (!RE_DATUM.test(ymd)) throw new Error(`Neplatné datum „${ymd}“ (čekám RRRR-MM-DD).`);
  const [r, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(r, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new Error(`Neplatné datum „${ymd}“.`);
  return dt;
}

const naText = (dt) => dt.toISOString().slice(0, 10);

export function pricti(ymd, dni) {
  const dt = naDatum(ymd);
  dt.setUTCDate(dt.getUTCDate() + dni);
  return naText(dt);
}

const denTydne = (ymd) => naDatum(ymd).getUTCDay();

/** Dnešní datum v Praze jako RRRR-MM-DD. */
export function dnesVPraze(ted = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ted);
}

/**
 * Víkend (pátek–neděle) pro dané datum: pátek až neděle = ten probíhající víkend,
 * pondělí až čtvrtek = nejbližší následující víkend.
 */
export function vikendPro(ymd) {
  const den = denTydne(ymd); // 0 = neděle … 6 = sobota
  const posun = den === 0 ? -2 : den === 6 ? -1 : 5 - den;
  const patek = pricti(ymd, posun);
  return { patek, sobota: pricti(patek, 1), nedele: pricti(patek, 2) };
}

/** Den začátku a konce akce (RRRR-MM-DD, místní čas podle zápisu v kalendáři). */
export function rozsahAkce(a) {
  const zacatek = String(a.zacatek || '').slice(0, 10);
  let konec = String(a.konec || a.zacatek || '').slice(0, 10);
  if (!RE_DATUM.test(konec) || konec < zacatek) konec = zacatek;
  return { zacatek, konec };
}

/** Akce, které aspoň jedním dnem zasahují do víkendu; zrušené akce vynechá. */
export function akceVikendu(akce, vikend) {
  return akce.filter((a) => {
    if (!a || !a.nazev || a.zruseno) return false;
    const { zacatek, konec } = rozsahAkce(a);
    if (!RE_DATUM.test(zacatek)) return false;
    return zacatek <= vikend.nedele && konec >= vikend.patek;
  });
}

// ---------- kraje ----------

const krajAkce = (a) => (a.kraj && String(a.kraj).trim()) || BEZ_KRAJE;

export function porovnejKraje(a, b) {
  const poradi = (k) => {
    const i = PRVNI_KRAJE.indexOf(k);
    if (i >= 0) return i;
    return k === BEZ_KRAJE ? 1000 : 100;
  };
  return poradi(a) - poradi(b) || a.localeCompare(b, 'cs');
}

const porovnejAkce = (a, b) => {
  const ra = rozsahAkce(a), rb = rozsahAkce(b);
  return ra.zacatek.localeCompare(rb.zacatek) || String(a.zacatek).localeCompare(String(b.zacatek))
    || a.nazev.localeCompare(b.nazev, 'cs');
};

/** Akce seskupené podle krajů ve správném pořadí: [{ kraj, akce: [...] }]. */
export function podleKraju(akce) {
  const skupiny = new Map();
  for (const a of akce) {
    const k = krajAkce(a);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(a);
  }
  return [...skupiny.keys()].sort(porovnejKraje)
    .map((kraj) => ({ kraj, akce: skupiny.get(kraj).sort(porovnejAkce) }));
}

// ---------- formátování ----------

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}

const bezpecnaUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');

const datumCesky = (ymd) => {
  const [r, m, d] = ymd.split('-').map(Number);
  return `${d}. ${m}. ${r}`;
};
const datumKratce = (ymd) => {
  const [, m, d] = ymd.split('-').map(Number);
  return `${d}. ${m}.`;
};
const cas = (s) => (/T\d{2}:\d{2}/.test(String(s || '')) ? String(s).slice(11, 16) : '');

/** Datum a čas akce pro přehled, např. „sobota 7. 11. 2026, 10:00–16:00“. */
export function terminAkce(a) {
  const { zacatek, konec } = rozsahAkce(a);
  const od = cas(a.zacatek), do_ = cas(a.konec);
  if (zacatek === konec) {
    const casy = od && do_ && do_ !== od ? `, ${od}–${do_}` : od ? `, od ${od}` : '';
    return `${DNY[denTydne(zacatek)]} ${datumCesky(zacatek)}${casy}`;
  }
  const s = (ymd, c) => `${DNY_KRATCE[denTydne(ymd)]} ${datumCesky(ymd)}${c ? ` ${c}` : ''}`;
  return `${s(zacatek, od)} – ${s(konec, do_)}`;
}

/** Krátké datum pro tabulku, např. „so 7. 11.“ nebo „21. 3. – 1. 11.“. */
export function terminKratce(a) {
  const { zacatek, konec } = rozsahAkce(a);
  if (zacatek === konec) return `${DNY_KRATCE[denTydne(zacatek)]} ${datumKratce(zacatek)}`;
  return `${datumKratce(zacatek)} – ${datumKratce(konec)}`;
}

export function mistoAkce(a) {
  const misto = String(a.misto || '').trim();
  const obec = String(a.obec || a.adresa || '').trim();
  if (!misto) return obec;
  if (!obec || misto.toLowerCase().includes(obec.toLowerCase())) return misto;
  return `${misto}, ${obec}`;
}

/** „6.–8. listopadu 2026“, přes měsíc „30. října – 1. listopadu 2026“, přes rok s oběma roky. */
export function nazevVikendu(v) {
  const [rp, mp, dp] = v.patek.split('-').map(Number);
  const [rn, mn, dn] = v.nedele.split('-').map(Number);
  if (rp !== rn) return `${dp}. ${MESICE_2P[mp - 1]} ${rp} – ${dn}. ${MESICE_2P[mn - 1]} ${rn}`;
  if (mp !== mn) return `${dp}. ${MESICE_2P[mp - 1]} – ${dn}. ${MESICE_2P[mn - 1]} ${rn}`;
  return `${dp}.–${dn}. ${MESICE_2P[mn - 1]} ${rn}`;
}

// ---------- kostra článku ----------

function htmlAkce(a) {
  const url = bezpecnaUrl(a.url);
  const radky = [
    `<li><strong>Kdy:</strong> ${escapeHtml(terminAkce(a))}</li>`,
    `<li><strong>Kde:</strong> ${escapeHtml(mistoAkce(a) || 'doplnit')}</li>`,
    `<li><strong>Kraj:</strong> ${escapeHtml(a.kraj || 'neuveden – doplnit')}</li>`,
  ];
  if (url) radky.push(`<li><a href="${escapeHtml(url)}">Podrobnosti v našem článku</a></li>`);
  return [
    '<div class="hs-vikend-akce">',
    `<h3>${escapeHtml(a.nazev)}</h3>`,
    `<p class="hs-overit"><strong>${OVERIT}</strong></p>`,
    ...(a.presunuto ? ['<p class="hs-overit"><strong>POZOR: AKCE BYLA PŘESUNUTA</strong></p>'] : []),
    '<ul class="hs-vikend-udaje">',
    ...radky,
    '</ul>',
    ...(a.popis ? [`<p class="hs-vikend-popis">${escapeHtml(a.popis)}</p>`] : []),
    '</div>',
  ].join('\n');
}

function jsonLd(akce, vikend) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Co se děje o víkendu ${nazevVikendu(vikend)}`,
    numberOfItems: akce.length,
    itemListElement: akce.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: a.nazev,
      ...(bezpecnaUrl(a.url) ? { url: bezpecnaUrl(a.url) } : {}),
    })),
  };
  // „<“ v JSON nesmí ukončit <script>
  return JSON.stringify(data, null, 1).replace(/</g, '\\u003c');
}

/** Obsah článku (to, co se kopíruje do editoru). Všechny <script> jsou na konci. */
export function obsahKostry(vsechnyAkce, vikend) {
  const akce = akceVikendu(vsechnyAkce, vikend);
  const skupiny = podleKraju(akce);
  // pořadí v přehledu (kraje, v kraji podle data) = pořadí v JSON-LD
  const poradi = skupiny.flatMap((s) => s.akce);
  const tabulka = [...akce].sort((a, b) => porovnejAkce(a, b)
    || porovnejKraje(krajAkce(a), krajAkce(b)));

  const casti = [
    '<div class="hs-vikend">',
    '<p class="hs-vikend-uvod">DOPSAT ÚVOD</p>',
    '',
  ];

  if (!akce.length) {
    casti.push('<p class="hs-vikend-prazdne">V kalendáři zatím nejsou na tento víkend žádné akce.</p>', '');
  }

  for (const s of skupiny) {
    casti.push('<div class="hs-vikend-kraj">', `<h2>${escapeHtml(s.kraj)}</h2>`, '');
    for (const a of s.akce) casti.push(htmlAkce(a), '');
    casti.push('</div>', '');
  }

  casti.push(
    '<h2>Přehled všech akcí o víkendu</h2>',
    '<table class="hs-vikend-tabulka">',
    '<thead><tr><th>Datum</th><th>Akce</th><th>Místo</th><th>Kraj</th></tr></thead>',
    '<tbody>',
    ...tabulka.map((a) => {
      const url = bezpecnaUrl(a.url);
      const nazev = url ? `<a href="${escapeHtml(url)}">${escapeHtml(a.nazev)}</a>` : escapeHtml(a.nazev);
      return `<tr><td>${escapeHtml(terminKratce(a))}</td><td>${nazev}</td>`
        + `<td>${escapeHtml(mistoAkce(a))}</td><td>${escapeHtml(a.kraj || '')}</td></tr>`;
    }),
    '</tbody>',
    '</table>',
    '',
    '<div class="hs-vikend-faq">',
    '<h2>Časté otázky</h2>',
    '<h3>Platí termíny a časy akcí tak, jak jsou uvedené?</h3>',
    '<p>Termíny přebíráme od pořadatelů, ale akce se mohou na poslední chvíli změnit, '
      + 'přesunout nebo zrušit, například kvůli počasí nebo technickým potížím. '
      + 'Před cestou si proto vždy ověřte aktuální informace na webu pořadatele.</p>',
    '<h3>Kde najdu akce na další víkendy?</h3>',
    `<p>Všechny akce s vláčky, traktory, auty a další technikou najdete v našem <a href="${KALENDAR_URL}">kalendáři dopravních akcí</a>. `
      + 'Můžete si v něm vybrat kraj i typ akce.</p>',
    '<h3>Jsou akce vhodné i pro malé děti?</h3>',
    '<p>Většina akcí v přehledu je určená rodinám s dětmi. U každé akce si ale zkontrolujte, '
      + 'zda je místo přístupné s kočárkem, jak je to s parkováním a zda je potřeba si vstupenky '
      + 'nebo místenky koupit předem.</p>',
    '</div>',
    '',
    '</div>',
    // skripty až jako poslední prvek obsahu
    `<script type="application/ld+json">\n${jsonLd(poradi, vikend)}\n</script>`,
  );
  return { html: casti.join('\n'), pocet: akce.length };
}

/** Celý soubor kostry: stránka k prohlédnutí, obsah k zkopírování je mezi značkami. */
export function souborKostry(vsechnyAkce, vikend, vygenerovano = new Date()) {
  const { html, pocet } = obsahKostry(vsechnyAkce, vikend);
  const titulek = `Co se děje o víkendu ${nazevVikendu(vikend)}`;
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="hs-vikend" content="${vikend.patek}">
<meta name="hs-pocet-akci" content="${pocet}">
<title>Kostra: ${escapeHtml(titulek)}</title>
<style>
  body { margin: 0; background: #fbf7f0; color: #2b2622; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px; }
  a { color: #1f6f3d; }
  .hs-overit { color: #b00020; }
  .hs-vikend-tabulka { border-collapse: collapse; width: 100%; }
  .hs-vikend-tabulka th, .hs-vikend-tabulka td { border: 1px solid #d8cfc2; padding: 4px 6px; text-align: left; vertical-align: top; }
  .hs-kostra-info { background: #fff3cd; border: 1px solid #e0c36b; padding: 8px 12px; }
</style>
</head>
<body>
<main>
<p class="hs-kostra-info"><strong>Podklad, ne hotový článek.</strong> Každou akci před zveřejněním ověřte u pořadatele
a pak u ní smažte označení „${OVERIT}“. Navrhovaný titulek: <strong>${escapeHtml(titulek)}</strong>.
Akcí: ${pocet}. Vygenerováno ${escapeHtml(vygenerovano.toISOString().slice(0, 16).replace('T', ' '))} UTC.
<a href="../">Zpět na seznam koster</a></p>
${ZACATEK_KOSTRY}
${html}
${KONEC_KOSTRY}
</main>
</body>
</html>
`;
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
</li>`;
  });
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Co se děje o víkendu – kostry článků</title>
<style>
  body { margin: 0; background: #fbf7f0; color: #2b2622; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px; }
  a { color: #1f6f3d; }
  .hs-kostra { margin: 10px 0; }
  .hs-kopirovat { margin-left: 8px; font: inherit; padding: 2px 10px; cursor: pointer; }
  .hs-stav { margin-left: 6px; color: #1f6f3d; }
</style>
</head>
<body>
<main>
<h1>Co se děje o víkendu – kostry článků</h1>
<p>Kostry vznikají automaticky z <a href="../kalendar/">kalendáře akcí</a> každý čtvrtek ráno a při každém sestavení webu.
Jsou to <strong>jen podklady</strong>: každou akci před zveřejněním ověřte u pořadatele a smažte u ní označení „${OVERIT}“.</p>
<p>Tlačítko „Zkopírovat HTML“ zkopíruje obsah článku. V editoru Shoptetu přepněte na zdrojový kód a vložte ho.</p>
${polozky.length ? `<ul>\n${polozky.join('\n')}\n</ul>` : '<p>Zatím tu nejsou žádné kostry.</p>'}
<p><a href="../">Zpět na veřejné soubory webu</a></p>
</main>
<script>
(function () {
  var ZACATEK = ${JSON.stringify(ZACATEK_KOSTRY)}, KONEC = ${JSON.stringify(KONEC_KOSTRY)};
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
          var a = html.indexOf(ZACATEK), b = html.indexOf(KONEC);
          if (a < 0 || b < a) throw new Error('v souboru chybí obsah kostry');
          return kopiruj(html.slice(a + ZACATEK.length, b).trim() + '\\n');
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
    const m = /^--(vikend|dnes|akce|vystup)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`Neznámá volba „${argv[i]}“. Povolené: --vikend, --dnes, --akce, --vystup.`);
    const hodnota = m[2] ?? argv[++i];
    if (!hodnota) throw new Error(`U volby --${m[1]} chybí hodnota.`);
    volby[m[1]] = hodnota;
  }
  return volby;
}

export async function spust(argv = process.argv.slice(2)) {
  const volby = zpracujVolby(argv);
  const zdroj = path.resolve(volby.akce || path.join(KOREN_REPA, 'kalendar', 'akce.json'));
  const vystup = path.resolve(volby.vystup || path.join(KOREN_REPA, 'vikend'));
  const vikend = vikendPro(volby.vikend || volby.dnes || dnesVPraze());

  const data = JSON.parse(await readFile(zdroj, 'utf8'));
  const akce = Array.isArray(data) ? data : data.akce;
  if (!Array.isArray(akce)) throw new Error(`V ${zdroj} chybí seznam akcí.`);

  const slozkaKoster = path.join(vystup, 'kostry');
  await mkdir(slozkaKoster, { recursive: true });
  const soubor = path.join(slozkaKoster, `${vikend.patek}.html`);
  await writeFile(soubor, souborKostry(akce, vikend));
  await writeFile(path.join(vystup, 'index.html'), stranaSeznamu(await nactiKostry(slozkaKoster)));

  const pocet = akceVikendu(akce, vikend).length;
  console.log(`Víkend ${nazevVikendu(vikend)}: ${pocet} akcí → ${path.relative(process.cwd(), soubor) || soubor}`);
  return { vikend, pocet, soubor };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  spust().catch((e) => {
    console.error(`Chyba: ${e.message}`);
    process.exit(1);
  });
}
