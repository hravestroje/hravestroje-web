// Testy kostry víkendového newsletteru pro Ecomail.
//   node --test newsletter/testy/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  newsletter, vyberProdukty, sUtm, stranaSeznamu, spust, cenaKc, OVERIT, ODHLASENI, BARVY,
} from '../scripts/kostra.mjs';
import { vikendPro } from '../../vikend/scripts/kostra.mjs';

const V = vikendPro('2026-11-04'); // středa → víkend 6.–8. 11. 2026

const akce = (nazev, zacatek, konec, kraj, navic = {}) => ({
  id: nazev, nazev, zacatek, konec, kraj, misto: `Místo ${nazev}`, obec: '', typy: [],
  url: `https://www.hravestroje.cz/kalendar-dopravnich-akci/${encodeURIComponent(nazev)}/`, popis: '', ...navic,
});

const produkt = (id, navic = {}) => ({
  nazev: `Produkt ${id}`, cena: 100 + id, url: `https://www.hravestroje.cz/produkt-${id}/`,
  obrazek: `https://cdn.example.cz/${id}.png`, kategorie: [], skladem: true, temata: [], ...navic,
});

const PRODUKTY = {
  sezony: [{ tema: 'vanoce', mesice: [10, 11, 12] }, { tema: 'leto', mesice: [6, 7, 8] }],
  produkty: [
    produkt(1), produkt(2), produkt(3), produkt(4),
    produkt(5, { skladem: false, temata: ['vanoce'] }),
    produkt(6, { temata: ['leto'] }),
    produkt(7, { temata: ['vanoce'] }),
    produkt(8, { puvodni_cena: 999 }),
  ],
};

const AKCE = [
  akce('Mikulášský vlak <speciál>', '2026-11-07T10:00:00+01:00', '2026-11-07T16:00:00+01:00', 'Pardubický kraj',
    { popis: 'Jízda s Mikulášem. '.repeat(30) }),
  akce('Hradecká jízda', '2026-11-08', '2026-11-08', 'Královéhradecký kraj', { presunuto: true }),
  akce('Dlouhá výstava', '2026-10-01', '2026-12-31', 'Jihomoravský kraj'),
  akce('Bez kraje', '2026-11-07', null, null),
  akce('Mimo víkend', '2026-11-20', '2026-11-20', 'Královéhradecký kraj'),
  akce('Zrušená', '2026-11-07', '2026-11-07', 'Královéhradecký kraj', { zruseno: true }),
];

test('UTM se přidá jen k odkazům na hravestroje.cz', () => {
  assert.equal(sUtm('https://www.hravestroje.cz/a/', 'vikend-2026-11-06'),
    'https://www.hravestroje.cz/a/?utm_source=newsletter&utm_medium=email&utm_campaign=vikend-2026-11-06');
  assert.equal(sUtm('https://hravestroje.cz/a/?x=1#kotva', 'k'),
    'https://hravestroje.cz/a/?x=1&utm_source=newsletter&utm_medium=email&utm_campaign=k#kotva');
  assert.equal(sUtm('https://www.hravestroje.cz/a/?utm_source=fb', 'k').match(/utm_source/g).length, 1, 'bez duplicit');
  assert.equal(sUtm('https://www.example.com/', 'k'), 'https://www.example.com/');
  assert.equal(sUtm('javascript:alert(1)', 'k'), '');
});

test('výběr produktů: skladem, sezóna a sleva přednostně, mimo sezónu ne', () => {
  const vyber = vyberProdukty(PRODUKTY, V);
  assert.equal(vyber.length, 3);
  const nazvy = vyber.map((p) => p.nazev);
  assert.equal(nazvy[0], 'Produkt 7', 'vánoční v listopadu první');
  assert.equal(nazvy[1], 'Produkt 8', 'pak sleva');
  assert.ok(!nazvy.includes('Produkt 5'), 'není skladem');
  assert.ok(!nazvy.includes('Produkt 6'), 'letní téma v listopadu ne');
  assert.deepEqual(vyberProdukty(PRODUKTY, V), vyber, 'stejný víkend = stejný výběr');

  const cervenec = vyberProdukty(PRODUKTY, vikendPro('2026-07-08')).map((p) => p.nazev);
  assert.equal(cervenec[0], 'Produkt 6');
  assert.ok(!cervenec.includes('Produkt 7'));

  const bezObrazku = { produkty: [produkt(1, { obrazek: '' }), produkt(2)] };
  assert.deepEqual(vyberProdukty(bezObrazku, V).map((p) => p.nazev), ['Produkt 2', 'Produkt 1'], 's obrázkem první');
  assert.deepEqual(vyberProdukty({}, V), []);
  assert.equal(cenaKc(1290), '1 290 Kč');
});

test('newsletter: akce po krajích, značky OVĚŘIT, odkazy s UTM', () => {
  const { html, pocet, produkty, predmet } = newsletter(AKCE, PRODUKTY, V);
  assert.equal(pocet, 4);
  assert.equal(produkty, 3);
  assert.equal(predmet, 'Co se děje o víkendu 6.–8. listopadu 2026');
  assert.ok(html.includes(`<title>${predmet}</title>`));
  assert.ok(html.includes('DOPSAT ÚVOD'));
  assert.equal(html.split(OVERIT).length - 1, 4, 'každá akce má OVĚŘIT U POŘADATELE');
  assert.ok(html.includes('POZOR: AKCE BYLA PŘESUNUTA'));
  assert.ok(!html.includes('Mimo víkend') && !html.includes('Zrušená'));
  assert.ok(html.includes('Mikulášský vlak &lt;speciál&gt;'), 'escapování');
  assert.ok(html.includes('…'), 'dlouhý popis se zkrátí');

  const poradi = ['Královéhradecký kraj', 'Pardubický kraj', 'Jihomoravský kraj', 'Kraj neuveden']
    .map((k) => html.indexOf(`>${k}</h3>`));
  assert.ok(poradi.every((i) => i > 0), 'nadpisy krajů');
  assert.deepEqual([...poradi].sort((a, b) => a - b), poradi, 'Královéhradecký první, bez kraje nakonec');
  assert.ok(html.indexOf('Hradecká jízda') < html.indexOf('Z našeho e-shopu'), 'akce před produkty');

  assert.ok(html.includes('href="https://www.hravestroje.cz/kalendar-dopravnich-akci/Hradeck%C3%A1%20j%C3%ADzda/'
    + '?utm_source=newsletter&amp;utm_medium=email&amp;utm_campaign=vikend-2026-11-06"'), 'odkaz na článek s UTM');
  assert.ok(html.includes('href="https://www.hravestroje.cz/produkt-7/?utm_source=newsletter'));
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href === ODHLASENI) continue;
    assert.ok(href.includes('utm_source=newsletter'), `odkaz bez UTM: ${href}`);
  }
});

test('newsletter: e-mailový layout, inline styly, barvy, patička, bez emoji', () => {
  const { html } = newsletter(AKCE, PRODUKTY, V);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(!/<style/i.test(html), 'žádný blok <style>, jen inline styly');
  assert.ok(!/<script/i.test(html), 'žádné skripty');
  assert.ok(!/class=/i.test(html), 'žádné třídy');
  assert.ok(!/<(div|p|h[1-6])\b(?![^>]*style=)/i.test(html.replace(/<div style="display:none[^>]*>/, '')), 'bloky mají inline styl');
  assert.ok(/<table role="presentation" width="600"[^>]*max-width:600px/.test(html), 'hlavní tabulka 600 px');
  assert.ok(html.includes(BARVY.zelena) && html.includes(BARVY.cihlova));
  assert.ok(!/\p{Extended_Pictographic}/u.test(html), 'žádné emoji');
  for (const img of html.match(/<img [^>]+>/g)) {
    assert.ok(/ alt="[^"]+"/.test(img) && / width="120"/.test(img), `obrázek bez alt/width: ${img}`);
  }
  assert.equal(html.split(`href="${ODHLASENI}"`).length - 1, 1, 'odkaz na odhlášení přes {unsubscribe}');
  assert.ok(html.lastIndexOf(ODHLASENI) > html.indexOf('Z našeho e-shopu'), 'odhlášení v patičce');
});

test('víkend bez akcí a bez produktů', () => {
  const { html, pocet, produkty } = newsletter([], { produkty: [] }, V);
  assert.equal(pocet, 0);
  assert.equal(produkty, 0);
  assert.ok(html.includes('žádné akce'));
  assert.ok(!html.includes('Z našeho e-shopu'));
  assert.ok(html.includes(ODHLASENI));
});

test('seznam koster má tlačítko Zkopírovat HTML', () => {
  const html = stranaSeznamu([{ patek: '2026-11-06', pocet: 8 }]);
  assert.ok(html.includes('Zkopírovat HTML'));
  assert.ok(html.includes('data-soubor="kostry/2026-11-06.html"'));
  assert.ok(html.includes('Předmět: Co se děje o víkendu 6.–8. listopadu 2026'));
  assert.ok(stranaSeznamu([]).includes('Zatím tu nejsou žádné kostry.'));
});

test('spuštění zapíše kostru a seznam, chybějící produkty = česká chyba', async () => {
  const slozka = await mkdtemp(path.join(tmpdir(), 'hs-newsletter-'));
  try {
    const zdrojAkci = path.join(slozka, 'akce.json');
    const zdrojProduktu = path.join(slozka, 'produkty.json');
    await writeFile(zdrojAkci, JSON.stringify({ akce: [akce('Vlak', '2027-01-02', '2027-01-02', 'Liberecký kraj')] }));
    await writeFile(zdrojProduktu, JSON.stringify(PRODUKTY));
    const vysledek = await spust(['--vikend', '2026-12-30', '--akce', zdrojAkci, '--produkty', zdrojProduktu, '--vystup', slozka]);
    assert.equal(vysledek.pocet, 1);
    assert.equal(vysledek.produkty, 3);
    const kostra = await readFile(path.join(slozka, 'kostry', '2027-01-01.html'), 'utf8');
    assert.ok(kostra.includes('Vlak') && kostra.includes(ODHLASENI));
    assert.ok(kostra.includes('<meta name="hs-pocet-akci" content="1">'));
    const index = await readFile(path.join(slozka, 'index.html'), 'utf8');
    assert.ok(index.includes('kostry/2027-01-01.html') && index.includes('(akcí: 1)'));

    await spust(['--dnes', '2027-01-06', '--akce', zdrojAkci, '--produkty', zdrojProduktu, '--vystup', slozka]);
    const index2 = await readFile(path.join(slozka, 'index.html'), 'utf8');
    assert.ok(index2.indexOf('2027-01-08') < index2.indexOf('2027-01-01'), 'nejnovější kostra nahoře');

    await assert.rejects(spust(['--akce', zdrojAkci, '--produkty', path.join(slozka, 'neni.json'), '--vystup', slozka]),
      /neexistuje/);
    await assert.rejects(spust(['--neco']), /Neznámá volba/);
  } finally {
    await rm(slozka, { recursive: true, force: true });
  }
});
