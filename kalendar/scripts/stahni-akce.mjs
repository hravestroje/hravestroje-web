#!/usr/bin/env node
// Stáhne akce z hravestroje.cz do souboru akce.json.
//
// 1. Projde sitemapu (i sitemap index s dalšími sitemapami).
// 2. Vybere články, jejichž adresa začíná /kalendar-dopravnich-akci.
// 3. Z každého článku vytáhne strukturovaná data JSON-LD typu Event.
// 4. Články bez Event JSON-LD přeskočí a vypíše do logu.
//
// Spuštění:  node scripts/stahni-akce.mjs
// Volby (proměnné prostředí):
//   SITEMAP_URL  – jiná sitemapa (výchozí https://www.hravestroje.cz/sitemap.xml)
//   PREFIX       – začátek cesty článků (výchozí /kalendar-dopravnich-akci)
//   VYSTUP       – kam uložit výsledek (výchozí akce.json vedle index.html)
//   DOPLNKY      – soubor s ručními opravami (výchozí doplnky.json vedle index.html)
//
// Nepotřebuje žádné balíčky z npm, stačí Node.js 20 nebo novější.

import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP_URL = process.env.SITEMAP_URL || 'https://www.hravestroje.cz/sitemap.xml';
const PREFIX = process.env.PREFIX || '/kalendar-dopravnich-akci';
const VYSTUP = path.resolve(KOREN, process.env.VYSTUP || 'akce.json');
const DOPLNKY = path.resolve(KOREN, process.env.DOPLNKY || 'doplnky.json');
const SOUBEZNE = 4;
const USER_AGENT = 'HraveStroje-KalendarAkci/1.0 (+https://www.hravestroje.cz)';
const V_GITHUB = !!process.env.GITHUB_ACTIONS;

// ---------- Kraje ----------
export const KRAJE = [
  ['praha', 'Hlavní město Praha', ['praha', 'prague']],
  ['stredocesky', 'Středočeský kraj', ['stredocesk', 'kladno', 'mlada boleslav', 'kolin', 'kutna hora', 'pribram', 'benesov', 'beroun', 'melnik', 'nymburk', 'rakovnik', 'lysa nad labem']],
  ['jihocesky', 'Jihočeský kraj', ['jihocesk', 'ceske budejovice', 'cesky krumlov', 'tabor', 'pisek', 'strakonice', 'jindrichuv hradec', 'prachatice']],
  ['plzensky', 'Plzeňský kraj', ['plzensk', 'plzen', 'klatovy', 'domazlice', 'rokycany', 'tachov']],
  ['karlovarsky', 'Karlovarský kraj', ['karlovarsk', 'karlovy vary', 'cheb', 'sokolov', 'marianske lazne']],
  ['ustecky', 'Ústecký kraj', ['ustecky', 'usti nad labem', 'decin', 'teplice', 'most', 'chomutov', 'litomerice', 'louny', 'zatec']],
  ['liberecky', 'Liberecký kraj', ['libereck', 'liberec', 'jablonec nad nisou', 'ceska lipa', 'semily', 'turnov']],
  ['kralovehradecky', 'Královéhradecký kraj', ['kralovehradeck', 'hradec kralove', 'trutnov', 'nachod', 'jicin', 'rychnov nad kneznou']],
  ['pardubicky', 'Pardubický kraj', ['pardubick', 'pardubice', 'chrudim', 'svitavy', 'usti nad orlici']],
  ['vysocina', 'Kraj Vysočina', ['vysocin', 'jihlava', 'trebic', 'havlickuv brod', 'zdar nad sazavou', 'pelhrimov']],
  ['jihomoravsky', 'Jihomoravský kraj', ['jihomoravsk', 'brno', 'znojmo', 'breclav', 'hodonin', 'vyskov', 'blansko']],
  ['olomoucky', 'Olomoucký kraj', ['olomouck', 'olomouc', 'prostejov', 'prerov', 'sumperk', 'jesenik']],
  ['zlinsky', 'Zlínský kraj', ['zlinsk', 'zlin', 'uherske hradiste', 'kromeriz', 'vsetin', 'valasske mezirici']],
  ['moravskoslezsky', 'Moravskoslezský kraj', ['moravskoslezsk', 'ostrava', 'opava', 'karvina', 'frydek', 'novy jicin', 'havirov', 'trinec', 'bruntal']],
];

// ---------- Typy akcí ----------
// Slova se hledají v názvu, popisu, klíčových slovech a adrese článku (bez diakritiky).
// Akce bez shody dostane typ „ostatni“. Typ jde ručně přepsat v doplnky.json.
export const TYPY = {
  vlaky: [/vlak/, /vlacek/, /zeleznic/, /lokomotiv/, /\bparni(?!k)/, /masink/, /drezin/, /nadrazi/, /motorak/, /tramvaj/, /\bmetro\b/, /\bmuzeum\s+dopravy/,
    /motorac/, /\bdrah[ay]\b/, /\bdraze\b/, /kolejist/, /\bdep(a|o|u)\b/, /\bexpres/],
  traktory: [/traktor/, /zemedel/, /kombajn/, /buldocek/, /zetor/, /\bfarm/],
  auta: [/\bauta?\b/, /\baut\b/, /\bauto[\s-]/, /automobil/, /autobus/, /veteran/, /nakladak/, /kamion/, /\btatr[ay]?\b/, /hasic/, /\btruck/, /off-?road/, /rallye?/, /motorist/, /\bjeep/],
  lode: [/\blod/, /plavb/, /parnik/, /pristav/],
  letadla: [/letadl/, /letadel/, /letist/, /leteck/, /aviati/, /vrtulnik/],
};
export const POVOLENE_TYPY = [...Object.keys(TYPY), 'ostatni'];

// ---------- Pomocné funkce ----------
export function bezDiakritiky(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…' };
export function dekodujEntity(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITY[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function prvni(hodnota) {
  return Array.isArray(hodnota) ? hodnota[0] : hodnota;
}

function absolutniUrl(url, zaklad) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url.trim(), zaklad).href;
  } catch {
    return null;
  }
}

async function stahni(url, pokusu = 3) {
  let posledniChyba;
  for (let i = 0; i < pokusu; i++) {
    try {
      const odpoved = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });
      if (!odpoved.ok) {
        const chyba = new Error(`HTTP ${odpoved.status}`);
        chyba.status = odpoved.status;
        // 404/410 = stránka neexistuje, opakování nepomůže
        throw chyba;
      }
      if (url.endsWith('.gz')) {
        const proud = odpoved.body.pipeThrough(new DecompressionStream('gzip'));
        return await new Response(proud).text();
      }
      return await odpoved.text();
    } catch (chyba) {
      posledniChyba = chyba;
      if (chyba.status === 404 || chyba.status === 410) break;
      if (i < pokusu - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw posledniChyba;
}

// ---------- Sitemapa ----------
function hodnotyLoc(xml) {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => dekodujEntity(m[1]));
}

async function nactiSitemapu(url, navstivene = new Set()) {
  if (navstivene.has(url)) return [];
  navstivene.add(url);
  const xml = await stahni(url);
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const deti = hodnotyLoc(xml);
    console.log(`Sitemap index ${url}: ${deti.length} dílčích sitemap`);
    const vysledek = [];
    for (const dite of deti) {
      try {
        vysledek.push(...(await nactiSitemapu(dite, navstivene)));
      } catch (chyba) {
        console.log(`${V_GITHUB ? '::warning::' : ''}Nepodařilo se načíst sitemapu ${dite}: ${chyba.message}`);
      }
    }
    return vysledek;
  }
  return hodnotyLoc(xml);
}

export function jeClanekKalendare(url) {
  try {
    const cesta = decodeURI(new URL(url).pathname);
    return cesta.startsWith(PREFIX);
  } catch {
    return false;
  }
}

// ---------- JSON-LD ----------
export function vytahniJsonLd(html) {
  const bloky = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let text = m[1].trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').replace(/^<!--/, '').replace(/-->$/, '');
    try {
      bloky.push(JSON.parse(text));
    } catch {
      try {
        // některé pluginy vkládají nepovolené řídicí znaky (nové řádky v textech)
        bloky.push(JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' ')));
      } catch {
        console.log('  JSON-LD blok nejde přečíst, přeskakuji ho');
      }
    }
  }
  return bloky;
}

function typy(uzel) {
  const t = uzel && uzel['@type'];
  return (Array.isArray(t) ? t : [t]).filter((x) => typeof x === 'string');
}

function jeEvent(uzel) {
  return typy(uzel).some((t) => /Event$|^Festival$/i.test(t.replace(/^.*[/#:]/, '')));
}

export function najdiEventy(data) {
  const nalezene = [];
  const navstivene = new Set();
  (function projdi(uzel) {
    if (!uzel || typeof uzel !== 'object' || navstivene.has(uzel)) return;
    navstivene.add(uzel);
    if (Array.isArray(uzel)) return uzel.forEach(projdi);
    if (jeEvent(uzel)) {
      nalezene.push(uzel);
      // podakce (subEvent) bereme jako samostatné akce jen tehdy, když hlavní akce nemá datum
      if (uzel.startDate) return;
    }
    for (const klic of Object.keys(uzel)) {
      if (typeof uzel[klic] === 'object') projdi(uzel[klic]);
    }
  })(data);
  return nalezene;
}

function textAdresy(adresa) {
  adresa = prvni(adresa);
  if (!adresa) return {};
  if (typeof adresa === 'string') return { text: dekodujEntity(adresa) };
  const ulice = dekodujEntity(adresa.streetAddress || '');
  const psc = dekodujEntity(adresa.postalCode || '');
  const obec = dekodujEntity(adresa.addressLocality || '');
  const region = dekodujEntity(adresa.addressRegion || '');
  const text = [ulice, [psc, obec].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { text, obec, region, psc };
}

function misto(location) {
  const loc = prvni(location);
  if (!loc) return { nazev: '', adresa: {} };
  if (typeof loc === 'string') return { nazev: dekodujEntity(loc), adresa: {} };
  if (typy(loc).includes('VirtualLocation')) return { nazev: 'Online', adresa: {} };
  return {
    nazev: dekodujEntity(loc.name || ''),
    adresa: textAdresy(loc.address),
    geo: loc.geo && loc.geo.latitude && loc.geo.longitude
      ? { lat: Number(loc.geo.latitude), lng: Number(loc.geo.longitude) }
      : undefined,
  };
}

function obrazek(image) {
  const img = prvni(image);
  if (!img) return null;
  if (typeof img === 'string') return img;
  return img.url || img.contentUrl || img['@id'] || null;
}

export function urciKraj(...texty) {
  // nejdřív samotný region z adresy, potom ostatní texty (obec, místo, ulice)
  for (const text of texty) {
    const t = bezDiakritiky(text);
    if (!t) continue;
    for (const [, nazev, klice] of KRAJE) {
      // klíče končící na „k“ nebo „vysocin“ jsou kmeny slov (jihomoravsk-ý), ostatní celé názvy obcí
      if (klice.some((k) => new RegExp(`(^|[^a-z])${k}${/(k|vysocin)$/.test(k) ? '' : '(?![a-z])'}`).test(t))) return nazev;
    }
  }
  return null;
}

export function urciTypy(text) {
  const t = bezDiakritiky(text).replace(/[-_/]+/g, ' ');
  const nalezene = Object.entries(TYPY)
    .filter(([, vzory]) => vzory.some((v) => v.test(t)))
    .map(([typ]) => typ);
  return nalezene.length ? nalezene : ['ostatni'];
}

// Ruční oprava z doplnky.json pro článek (klíč = adresa článku, lomítko na konci nevadí).
export function najdiDoplnek(doplnky, url) {
  if (!doplnky || typeof doplnky !== 'object') return {};
  const bez = (u) => String(u || '').replace(/\/+$/, '');
  if (doplnky[url] && typeof doplnky[url] === 'object') return doplnky[url];
  const klic = Object.keys(doplnky).find((k) => !k.startsWith('_') && bez(k) === bez(url));
  return klic && typeof doplnky[klic] === 'object' ? doplnky[klic] : {};
}

// "dny" z doplnky.json → seřazená platná data RRRR-MM-DD (neplatná se vypíšou do logu); nic → null
export function normalizujDny(x, url = '') {
  if (x == null) return null;
  const seznam = Array.isArray(x) ? x : [x];
  const platne = [], neplatne = [];
  for (const d of seznam) {
    const t = String(d ?? '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    const dt = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (dt && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3]) platne.push(t);
    else neplatne.push(t);
  }
  if (neplatne.length) {
    console.log(`${V_GITHUB ? '::warning::' : ''}Neplatné datum v "dny" v doplnky.json (${url}): ${neplatne.join(', ')} – pište ve tvaru 2026-11-07`);
  }
  return platne.length ? [...new Set(platne)].sort() : null;
}

// "dny_v_tydnu" z doplnky.json → zkratky po, ut, st, ct, pa, so, ne (i „sobota“, „Út“…); nic → null
const DNY_V_TYDNU = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];
export function normalizujDnyVTydnu(x, url = '') {
  if (x == null) return null;
  const seznam = Array.isArray(x) ? x : [x];
  const platne = [], neplatne = [];
  for (const d of seznam) {
    const k = bezDiakritiky(String(d ?? '')).trim().slice(0, 2);
    if (DNY_V_TYDNU.includes(k)) platne.push(k);
    else neplatne.push(String(d));
  }
  if (neplatne.length) {
    console.log(`${V_GITHUB ? '::warning::' : ''}Neznámý den v "dny_v_tydnu" v doplnky.json (${url}): ${neplatne.join(', ')} – povolené jsou ${DNY_V_TYDNU.join(', ')}`);
  }
  return platne.length ? DNY_V_TYDNU.filter((k) => platne.includes(k)) : null;
}

// Použije ruční opravu na akci:
//   "kraj": "Jihomoravský kraj"
//   "typy": ["lode"]  nebo  "typ": "lode"   (vlaky, traktory, auta, lode, letadla, ostatni)
//   "obrazek": "zastupny"  → skryje obrázek článku, kalendář ukáže jednotný zástupný obrázek
//   "obrazek": "https://…" → vlastní obrázek
//   "dny": ["2026-11-07", "2026-11-08"]   → akce se koná jen v tyto dny (v kalendáři v každém z nich)
//   "dny_v_tydnu": ["so", "ne"]            → jen tyto dny v týdnu mezi začátkem a koncem akce
export function pouzijDoplnek(akce, doplnek = {}) {
  const a = { ...akce };
  const dny = normalizujDny(doplnek.dny, a.url);
  if (dny) a.dny = dny;
  const tyden = normalizujDnyVTydnu(doplnek.dny_v_tydnu, a.url);
  if (tyden) a.dny_v_tydnu = tyden;
  if (typeof doplnek.kraj === 'string' && doplnek.kraj.trim()) a.kraj = doplnek.kraj.trim();
  const typy = Array.isArray(doplnek.typy) ? doplnek.typy : doplnek.typ ? [doplnek.typ] : null;
  if (typy) {
    const platne = typy.map((t) => bezDiakritiky(t).trim()).filter((t) => POVOLENE_TYPY.includes(t));
    const neplatne = typy.filter((t) => !POVOLENE_TYPY.includes(bezDiakritiky(t).trim()));
    if (neplatne.length) {
      console.log(`${V_GITHUB ? '::warning::' : ''}Neznámý typ v doplnky.json (${a.url}): ${neplatne.join(', ')} – povolené jsou ${POVOLENE_TYPY.join(', ')}`);
    }
    if (platne.length) a.typy = [...new Set(platne)];
  }
  if (typeof doplnek.obrazek === 'string' && doplnek.obrazek.trim()) {
    const o = doplnek.obrazek.trim();
    if (bezDiakritiky(o) === 'zastupny') a.obrazek = null;
    else a.obrazek = absolutniUrl(o, a.url) || a.obrazek;
  }
  return a;
}

function datum(hodnota) {
  const h = prvni(hodnota);
  if (!h || typeof h !== 'string') return null;
  const s = h.trim();
  // povolíme "2026-05-01", "2026-05-01T10:00", "2026-05-01T10:00:00+02:00"
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return s;
}

// Obrázek pro sdílení článku (og:image). Atributy mohou být v libovolném pořadí,
// místo property se občas používá name. Prázdná hodnota = žádný obrázek.
export function ogImage(html) {
  for (const tag of String(html || '').match(/<meta\b[^>]*>/gi) || []) {
    if (!/\b(?:property|name)\s*=\s*["']og:image["']/i.test(tag)) continue;
    const m = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i);
    const url = m && dekodujEntity(m[1]);
    if (url) return url;
  }
  return null;
}

// Obrázek akce: přednostně og:image článku (obrázek pro sdílení bývá aktuální a opravený),
// obrázek z JSON-LD Event jen tehdy, když og:image chybí.
export function obrazekAkce(ev, html, clanekUrl) {
  return absolutniUrl(ogImage(html), clanekUrl) || absolutniUrl(obrazek(ev.image), clanekUrl);
}

export function prevedEvent(ev, clanekUrl, html, doplnek = {}) {
  const zacatek = datum(ev.startDate);
  if (!zacatek) return null;
  const konec = datum(ev.endDate) || zacatek;
  const nazev = dekodujEntity(ev.name || ev.headline || '');
  const popis = dekodujEntity(String(ev.description || '').replace(/<[^>]+>/g, ' ')).slice(0, 400);
  const m = misto(ev.location);
  const keywords = Array.isArray(ev.keywords) ? ev.keywords.join(' ') : ev.keywords || '';
  const kraj = urciKraj(m.adresa.region, m.adresa.obec, m.nazev, m.adresa.text)
    || null;
  const typyAkce = urciTypy([nazev, popis, keywords, decodeURI(new URL(clanekUrl).pathname)].join(' '));
  const stav = String(ev.eventStatus || '');
  const id = createHash('sha1').update(`${clanekUrl}|${nazev}|${zacatek}`).digest('hex').slice(0, 12);

  return pouzijDoplnek({
    id,
    nazev,
    zacatek,
    konec,
    misto: m.nazev,
    adresa: m.adresa.text || '',
    obec: m.adresa.obec || '',
    kraj,
    typy: typyAkce,
    url: clanekUrl,
    obrazek: obrazekAkce(ev, html, clanekUrl),
    popis,
    ...(m.geo ? { geo: m.geo } : {}),
    ...(/Cancelled/i.test(stav) ? { zruseno: true } : {}),
    ...(/Postponed|Rescheduled/i.test(stav) ? { presunuto: true } : {}),
  }, doplnek);
}

async function poJednom(polozky, pocet, prace) {
  const vysledky = new Array(polozky.length);
  let dalsi = 0;
  await Promise.all(
    Array.from({ length: Math.min(pocet, polozky.length) }, async () => {
      while (dalsi < polozky.length) {
        const i = dalsi++;
        vysledky[i] = await prace(polozky[i], i);
      }
    }),
  );
  return vysledky;
}

async function nactiJson(soubor, vychozi) {
  try {
    return JSON.parse(await readFile(soubor, 'utf8'));
  } catch {
    return vychozi;
  }
}

// ---------- Hlavní běh ----------
async function main() {
  const predchozi = await nactiJson(VYSTUP, { akce: [] });
  const doplnky = await nactiJson(DOPLNKY, {});

  console.log(`Načítám sitemapu ${SITEMAP_URL}`);
  const vsechnyUrl = await nactiSitemapu(SITEMAP_URL);
  const clanky = [...new Set(vsechnyUrl.filter(jeClanekKalendare))];
  console.log(`V sitemapě je ${vsechnyUrl.length} adres, z toho ${clanky.length} článků kalendáře.\n`);

  const bezJsonLd = [];
  const chyby = [];
  const akce = [];

  await poJednom(clanky, SOUBEZNE, async (url) => {
    let html;
    try {
      html = await stahni(url);
    } catch (chyba) {
      chyby.push({ url, duvod: chyba.message });
      // Článek se nepodařilo stáhnout – necháme akce z minulého běhu, ať nezmizí kvůli výpadku.
      // Smazaný článek (404/410) ale vyřadíme.
      if (chyba.status !== 404 && chyba.status !== 410) {
        akce.push(...(predchozi.akce || []).filter((a) => a.url === url)
          .map((a) => pouzijDoplnek(a, najdiDoplnek(doplnky, url))));
      }
      return;
    }
    const eventy = vytahniJsonLd(html).flatMap(najdiEventy);
    const prevedene = eventy
      .map((ev) => prevedEvent(ev, url, html, najdiDoplnek(doplnky, url)))
      .filter(Boolean);
    if (!prevedene.length) {
      bezJsonLd.push(url);
      return;
    }
    console.log(`✓ ${url} → ${prevedene.length}× akce`);
    akce.push(...prevedene);
  });

  // odstranit duplicity (stejná akce může být ve více blocích JSON-LD)
  const unikatni = [...new Map(akce.map((a) => [a.id, a])).values()];
  unikatni.sort((a, b) => a.zacatek.localeCompare(b.zacatek) || a.nazev.localeCompare(b.nazev, 'cs'));

  const varovani = V_GITHUB ? '::warning::' : '';
  console.log('');
  if (bezJsonLd.length) {
    console.log(`Přeskočeno – článek nemá Event JSON-LD (${bezJsonLd.length}):`);
    bezJsonLd.sort().forEach((u) => console.log(`${varovani}Bez Event JSON-LD: ${u}`));
  }
  if (chyby.length) {
    console.log(`Nepodařilo se stáhnout (${chyby.length}), ponechány minulé údaje:`);
    chyby.forEach((c) => console.log(`${varovani}Chyba stahování ${c.url}: ${c.duvod}`));
  }
  const bezKraje = unikatni.filter((a) => !a.kraj);
  bezKraje.forEach((a) => console.log(`${varovani}Nezjištěn kraj: ${a.nazev} (${a.url}) – doplňte ho v doplnky.json`));
  const bezTypu = unikatni.filter((a) => !a.typy.length || a.typy.includes('ostatni'));
  bezTypu.forEach((a) => console.log(`Nezjištěn typ: ${a.nazev} (${a.url})`));

  if (!unikatni.length && (predchozi.akce || []).length) {
    console.log('::error::Nenašla se žádná akce, ale minule jich bylo ' + predchozi.akce.length + '. Soubor nepřepisuji (web je možná nedostupný).');
    process.exit(1);
  }

  const vystup = {
    aktualizovano: new Date().toISOString(),
    zdroj: SITEMAP_URL,
    pocet: unikatni.length,
    akce: unikatni,
  };
  await writeFile(VYSTUP, JSON.stringify(vystup, null, 1) + '\n');
  console.log(`\nUloženo ${unikatni.length} akcí do ${path.relative(process.cwd(), VYSTUP) || VYSTUP}.`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const radky = [
      '## Aktualizace kalendáře akcí',
      `- článků v kalendáři: **${clanky.length}**`,
      `- uložených akcí: **${unikatni.length}**`,
      `- přeskočeno bez Event JSON-LD: **${bezJsonLd.length}**`,
      `- chyby stahování: **${chyby.length}**`,
      `- akce bez kraje: **${bezKraje.length}**`,
      '',
      ...(bezJsonLd.length ? ['### Články bez Event JSON-LD', ...bezJsonLd.map((u) => `- ${u}`), ''] : []),
      ...(bezKraje.length ? ['### Akce bez kraje (doplňte v doplnky.json)', ...bezKraje.map((a) => `- ${a.nazev} – ${a.url}`), ''] : []),
    ];
    await appendFile(process.env.GITHUB_STEP_SUMMARY, radky.join('\n') + '\n');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((chyba) => {
    console.error('::error::' + (chyba && chyba.stack ? chyba.stack : chyba));
    process.exit(1);
  });
}
