#!/usr/bin/env node
// Doplní k akcím z kalendáře souřadnice (lat/lon) podle obce → akce-v-okoli/souradnice.json.
//
// Souřadnice se berou z offline tabulky obcí ČR uložené v repozitáři (data/obce.csv).
// Skript NIKAM nevolá – žádné geokódovací služby, žádný internet.
//
// Postup u každé akce:
//   1. ruční souřadnice z rucni-souradnice.json (klíč = adresa článku) mají přednost,
//   2. jinak se hledá obec z akce (pole "obec") v tabulce obcí – i bez diakritiky,
//      „Praha 6“ → Praha, „Brno-Husovice“ → Brno, „Lužná u Rakovníka“ → Lužná,
//   3. když obec chybí, zkusí se části adresy („Přestavlky 47“ → Přestavlky),
//   4. víc obcí stejného jména se rozliší podle kraje a PSČ z adresy;
//      když to nejde jednoznačně, akce souřadnice nedostane (bere se jen podle kraje).
// Z kalendar/doplnky.json (jen se čte) se převezme "kraj" a "obrazek" (např. "zastupny").
//
// Spuštění:  node akce-v-okoli/scripts/souradnice.mjs
// Volby (proměnné prostředí, cesty relativně ke kořeni repozitáře):
//   AKCE     – akce.json z kalendáře (výchozí kalendar/akce.json)
//   DOPLNKY  – ruční opravy kalendáře (výchozí kalendar/doplnky.json)
//   OBCE     – tabulka obcí (výchozí akce-v-okoli/data/obce.csv)
//   RUCNI    – ruční souřadnice (výchozí akce-v-okoli/rucni-souradnice.json)
//   VYSTUP   – výsledek (výchozí akce-v-okoli/souradnice.json)
//
// Nepotřebuje žádné balíčky z npm, stačí Node.js 20 nebo novější.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const KOREN_REPA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cesta = (promenna, vychozi) => path.resolve(KOREN_REPA, process.env[promenna] || vychozi);

// ---------- Pomocné funkce ----------
export function normalizuj(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Jednoduché CSV bez uvozovek (tabulka obcí žádné nemá).
export function prectiObce(csv) {
  const radky = csv.replace(/^﻿/, '').split(/\r?\n/).filter((r) => r.trim());
  const hlavicka = radky.shift().split(',');
  const i = (nazev) => {
    const idx = hlavicka.indexOf(nazev);
    if (idx < 0) throw new Error(`V tabulce obcí chybí sloupec „${nazev}“.`);
    return idx;
  };
  const [iObec, iOkres, iKraj, iPsc, iLat, iLon] = ['Obec', 'Okres', 'Kraj', 'PSČ', 'Latitude', 'Longitude'].map(i);
  const podleJmena = new Map();
  for (const r of radky) {
    const s = r.split(',');
    const lat = Number(s[iLat]);
    const lon = Number(s[iLon]);
    if (!s[iObec] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const obec = { obec: s[iObec], okres: s[iOkres], kraj: s[iKraj], psc: (s[iPsc] || '').replace(/\D/g, ''), lat, lon };
    const klic = normalizuj(obec.obec);
    if (!podleJmena.has(klic)) podleJmena.set(klic, []);
    podleJmena.get(klic).push(obec);
  }
  return podleJmena;
}

// Varianty názvu obce od nejpřesnější: „Praha 7 – Holešovice“ → praha 7-holesovice, praha 7, praha
export function variantyNazvu(nazev) {
  const n = normalizuj(nazev).replace(/,.*$/, '');
  if (!n) return [];
  const v = [n];
  const pridej = (x) => { x = x.trim(); if (x && !v.includes(x)) v.push(x); };
  pridej(n.replace(/\s*\(.*?\)\s*/g, ' '));            // „Obec (okres X)“
  pridej(n.replace(/^(mesto|obec|mestys)\s+/, ''));
  pridej(n.replace(/\s+\d+[a-z]?$/, ''));                // „Přestavlky 47“, „Praha 6“
  for (const x of [...v]) {
    const pomlcka = x.indexOf('-');
    if (pomlcka > 0) pridej(x.slice(0, pomlcka).replace(/\s+\d+$/, '')); // „Brno-Husovice“, „Praha 7-Holešovice“
  }
  for (const x of [...v]) pridej(x.replace(/\s+\d+$/, ''));
  for (const x of [...v]) {
    const m = /^(.+?)\s+(u|nad|pod|v|na)\s+.+$/.exec(x);   // „Lužná u Rakovníka“ → Lužná
    if (m) pridej(m[1]);
  }
  return v;
}

function pscZAdresy(adresa) {
  const m = /\b(\d{3})\s?(\d{2})\b/.exec(String(adresa || ''));
  return m ? m[1] + m[2] : '';
}

// Najde obec v tabulce. Vrací { obec, zpusob } nebo { chyba }.
export function najdiObec(akce, obce) {
  const kraj = akce.kraj || '';
  const psc = pscZAdresy(akce.adresa);
  const jmena = [];
  if (akce.obec) jmena.push(...variantyNazvu(akce.obec));
  // Části adresy (od konce: „Ulice 5, 273 07 Vinařice“ → „Vinařice“)
  for (const cast of String(akce.adresa || '').split(',').reverse()) {
    const bezPsc = cast.replace(/\b\d{3}\s?\d{2}\b/, '').trim();
    for (const j of variantyNazvu(bezPsc)) if (!jmena.includes(j)) jmena.push(j);
  }
  let nejednoznacne = null;
  for (const jmeno of jmena) {
    let kandidati = obce.get(jmeno);
    if (!kandidati || !kandidati.length) continue;
    if (kraj) {
      const vKraji = kandidati.filter((o) => o.kraj === kraj);
      if (!vKraji.length) continue; // stejné jméno, ale jinde – zkusíme další variantu
      kandidati = vKraji;
    }
    if (kandidati.length > 1 && psc) {
      const presne = kandidati.filter((o) => o.psc === psc);
      const okrsek = kandidati.filter((o) => o.psc.slice(0, 3) === psc.slice(0, 3));
      if (presne.length === 1) kandidati = presne;
      else if (okrsek.length === 1) kandidati = okrsek;
    }
    if (kandidati.length === 1) return { obec: kandidati[0], jmeno };
    nejednoznacne = nejednoznacne || `${kandidati.length}× obec „${kandidati[0].obec}“ (${kandidati.map((o) => o.okres).join(', ')})`;
  }
  return { chyba: nejednoznacne || 'obec není v tabulce obcí ČR' };
}

const zaokrouhli = (x) => Math.round(x * 10000) / 10000;

function platneSouradnice(z) {
  return z && Number.isFinite(Number(z.lat)) && Number.isFinite(Number(z.lon)) &&
    Math.abs(Number(z.lat)) <= 90 && Math.abs(Number(z.lon)) <= 180;
}

// Hlavní převod – čistá funkce kvůli testům.
export function sestavSouradnice(akce, obce, doplnky = {}, rucni = {}) {
  const vysledek = {};
  const statistika = { celkem: 0, souradnice: 0, rucne: 0, bez: [] };
  const hotove = new Set();
  for (const a of akce) {
    if (!a || !a.url || hotove.has(a.url)) continue; // jeden článek = jedna obec
    hotove.add(a.url);
    statistika.celkem++;
    const doplnek = doplnky[a.url] || {};
    const zaznam = {};
    const kraj = (typeof doplnek.kraj === 'string' && doplnek.kraj.trim()) || a.kraj || '';
    const r = rucni[a.url];
    if (platneSouradnice(r)) {
      zaznam.lat = zaokrouhli(Number(r.lat));
      zaznam.lon = zaokrouhli(Number(r.lon));
      statistika.rucne++;
    } else {
      const nalez = najdiObec({ ...a, kraj }, obce);
      if (nalez.obec) {
        zaznam.lat = zaokrouhli(nalez.obec.lat);
        zaznam.lon = zaokrouhli(nalez.obec.lon);
        if (!kraj) zaznam.kraj = nalez.obec.kraj; // kraj z tabulky, když ho akce nemá
      } else {
        statistika.bez.push({ nazev: a.nazev, url: a.url, obec: a.obec || '', duvod: nalez.chyba });
      }
    }
    if (zaznam.lat != null) statistika.souradnice++;
    if (typeof doplnek.kraj === 'string' && doplnek.kraj.trim() && doplnek.kraj.trim() !== a.kraj) zaznam.kraj = doplnek.kraj.trim();
    if (typeof doplnek.obrazek === 'string' && doplnek.obrazek.trim()) {
      const o = doplnek.obrazek.trim();
      zaznam.obrazek = normalizuj(o) === 'zastupny' ? 'zastupny' : o;
    }
    if (Object.keys(zaznam).length) vysledek[a.url] = zaznam;
  }
  return { akce: vysledek, statistika };
}

function bezPodtrzitek(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) if (!k.startsWith('_') && v && typeof v === 'object') o[k] = v;
  return o;
}

async function nactiJson(soubor, vychozi) {
  try {
    return JSON.parse(await readFile(soubor, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && vychozi !== undefined) return vychozi;
    throw new Error(`Soubor ${path.relative(KOREN_REPA, soubor)} nejde přečíst: ${e.message}`);
  }
}

async function main() {
  const soubory = {
    akce: cesta('AKCE', 'kalendar/akce.json'),
    doplnky: cesta('DOPLNKY', 'kalendar/doplnky.json'),
    obce: cesta('OBCE', 'akce-v-okoli/data/obce.csv'),
    rucni: cesta('RUCNI', 'akce-v-okoli/rucni-souradnice.json'),
    vystup: cesta('VYSTUP', 'akce-v-okoli/souradnice.json'),
  };
  const data = await nactiJson(soubory.akce);
  const akce = Array.isArray(data) ? data : data.akce;
  if (!Array.isArray(akce)) throw new Error('akce.json neobsahuje seznam akcí.');
  const obce = prectiObce(await readFile(soubory.obce, 'utf8'));
  const doplnky = bezPodtrzitek(await nactiJson(soubory.doplnky, {}));
  const rucni = bezPodtrzitek(await nactiJson(soubory.rucni, {}));

  const { akce: vysledek, statistika } = sestavSouradnice(akce, obce, doplnky, rucni);
  const vystup = {
    vygenerovano: new Date().toISOString(),
    zdroj: 'Tabulka obcí ČR v repozitáři (akce-v-okoli/data/obce.csv) + rucni-souradnice.json',
    pocet: Object.keys(vysledek).length,
    akce: vysledek,
  };
  await writeFile(soubory.vystup, JSON.stringify(vystup, null, 1) + '\n');

  console.log(`Souřadnice: ${statistika.souradnice} z ${statistika.celkem} článků (ručně ${statistika.rucne}) → ${path.relative(KOREN_REPA, soubory.vystup)}`);
  for (const b of statistika.bez) {
    console.log(`Bez souřadnic (jen podle kraje): ${b.nazev} – obec „${b.obec}“: ${b.duvod} (${b.url})`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`CHYBA: ${e.message}`);
    process.exit(1);
  });
}
