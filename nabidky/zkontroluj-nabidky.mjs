// Kontrola nabidky/nabidky.json – spouští se v testech před každým zveřejněním.
//   node nabidky/zkontroluj-nabidky.mjs [cesta/k/nabidky.json]
// Při chybě vypíše česky, co je špatně (a u které nabídky), a skončí kódem 1 → nic se nezveřejní.
import { readFileSync } from 'node:fs';

const soubor = process.argv[2] || new URL('./nabidky.json', import.meta.url);
const KRAJE = [
  'Hlavní město Praha', 'Středočeský kraj', 'Jihočeský kraj', 'Plzeňský kraj', 'Karlovarský kraj',
  'Ústecký kraj', 'Liberecký kraj', 'Královéhradecký kraj', 'Pardubický kraj', 'Kraj Vysočina',
  'Jihomoravský kraj', 'Olomoucký kraj', 'Zlínský kraj', 'Moravskoslezský kraj'
];
const TYPY = ['vlaky', 'traktory', 'auta', 'lode', 'letadla', 'vse'];
const ZDROJE = ['slevomat', 'booking', 'zazitky', 'jine'];
const KLICE = ['id', 'ukazka', 'nazev', 'popis', 'url', 'obrazek', 'zdroj', 'kraje', 'typy', 'platnost_do'];

const chyby = [];
let data;
try {
  data = JSON.parse(readFileSync(soubor, 'utf8'));
} catch (e) {
  console.error(`CHYBA: nabidky.json není platný JSON (${e.message}).\n` +
    'Nejčastěji chybí čárka mezi nabídkami nebo je čárka navíc za poslední nabídkou či uvozovka.');
  process.exit(1);
}

if (!data || !Array.isArray(data.nabidky)) {
  chyby.push('soubor musí mít tvar { "nabidky": [ … ] }');
} else {
  const idcka = new Set();
  data.nabidky.forEach((n, i) => {
    const kde = `nabídka č. ${i + 1}${n && n.id ? ` (id "${n.id}")` : ''}`;
    if (!n || typeof n !== 'object') return chyby.push(`${kde}: není objekt { … }`);
    for (const k of Object.keys(n)) if (!KLICE.includes(k)) chyby.push(`${kde}: neznámé pole "${k}" (překlep?)`);
    if (!n.id || typeof n.id !== 'string') chyby.push(`${kde}: chybí "id"`);
    else if (idcka.has(n.id)) chyby.push(`${kde}: "id" se opakuje`);
    else idcka.add(n.id);
    if (!n.nazev || typeof n.nazev !== 'string') chyby.push(`${kde}: chybí "nazev"`);
    if (n.ukazka !== undefined && typeof n.ukazka !== 'boolean') chyby.push(`${kde}: "ukazka" musí být true nebo false (bez uvozovek)`);
    if (!n.ukazka && !/^https:\/\/[^\s]+$/.test(n.url || '')) chyby.push(`${kde}: "url" musí začínat https://`);
    if (n.obrazek && !/^https:\/\/[^\s]+$/.test(n.obrazek)) chyby.push(`${kde}: "obrazek" musí začínat https:// (nebo nechte "")`);
    if (!ZDROJE.includes(n.zdroj)) chyby.push(`${kde}: "zdroj" musí být jedno z: ${ZDROJE.join(', ')}`);
    if (!Array.isArray(n.kraje)) chyby.push(`${kde}: "kraje" musí být seznam [ … ] (prázdný [] = celá ČR)`);
    else n.kraje.forEach((k) => { if (!KRAJE.includes(k)) chyby.push(`${kde}: neznámý kraj "${k}" – použijte přesný název, např. "Královéhradecký kraj"`); });
    if (!Array.isArray(n.typy) || !n.typy.length) chyby.push(`${kde}: "typy" musí být neprázdný seznam, např. ["vlaky"] nebo ["vse"]`);
    else n.typy.forEach((t) => { if (!TYPY.includes(t)) chyby.push(`${kde}: neznámý typ "${t}" – povolené: ${TYPY.join(', ')}`); });
    if (n.platnost_do) {
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n.platnost_do);
      const ok = d && new Date(Date.UTC(+d[1], d[2] - 1, +d[3])).toISOString().slice(0, 10) === n.platnost_do;
      if (!ok) chyby.push(`${kde}: "platnost_do" musí být datum RRRR-MM-DD, např. "2026-12-31" (nebo "")`);
    }
  });
}

if (chyby.length) {
  console.error('CHYBA v nabidky.json:\n - ' + chyby.join('\n - '));
  process.exit(1);
}
const skutecne = data.nabidky.filter((n) => !n.ukazka).length;
console.log(`OK: nabidky.json je v pořádku – celkem ${data.nabidky.length}, z toho ukázky: ${data.nabidky.length - skutecne}`);
