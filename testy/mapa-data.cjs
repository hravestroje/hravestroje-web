// Ukázková data pro testy mapy (testy/mapa.test.cjs a testy/mapa-prohlizec.js).
// „Dnes“ = středa 4. 11. 2026, víkend = 7.–8. 11. 2026.
'use strict';
const W = 'https://www.hravestroje.cz/kalendar-dopravnich-akci/';
const DNES = '2026-11-04';
const akce = [
  { nazev: 'Mikulášský vlak Praha', zacatek: '2026-11-07', obec: 'Praha', kraj: 'Hlavní město Praha', typy: ['vlaky'], url: W + 'praha-vlak/' },
  { nazev: 'Sraz veteránů Praha', zacatek: '2026-11-21T10:00:00+01:00', obec: 'Praha', kraj: 'Hlavní město Praha', typy: ['auta'], url: W + 'praha-auta/' },
  { nazev: 'Plavba po Svratce', zacatek: '2026-12-06', obec: 'Brno', kraj: 'Jihomoravský kraj', typy: ['lode'], url: W + 'brno-lode/' },
  { nazev: 'Letecký den Ostrava', zacatek: '2026-11-08', obec: 'Ostrava', kraj: 'Moravskoslezský kraj', typy: ['letadla'], url: W + 'ostrava-letadla/' },
  { nazev: 'Traktoriáda Plzeň', zacatek: '2026-11-28', konec: '2026-11-29', obec: 'Plzeň', kraj: 'Plzeňský kraj', typy: ['traktory', 'auta'], url: W + 'plzen-traktory/' },
  { nazev: 'Výstava v depu Liberec', zacatek: '2026-10-01', konec: '2026-11-30', obec: 'Liberec', kraj: null, typy: [], url: W + 'liberec-vystava/' },
  { nazev: 'Skončená akce', zacatek: '2026-10-10', obec: 'Praha', kraj: 'Hlavní město Praha', typy: ['vlaky'], url: W + 'skoncena/' },
  { nazev: 'Zrušená akce', zacatek: '2026-11-14', obec: 'Brno', kraj: 'Jihomoravský kraj', typy: ['vlaky'], url: W + 'zrusena/', zruseno: true },
  { nazev: 'Akce bez souřadnic', zacatek: '2026-11-15', obec: 'Neznámá ves', kraj: 'Zlínský kraj', typy: ['vlaky'], url: W + 'bez-souradnic/' },
  { nazev: 'Zimní <b>vlak</b> "Olomouc"', zacatek: '2027-01-10', obec: 'Olomouc', kraj: 'Olomoucký kraj', typy: ['vlaky'], url: W + 'olomouc-vlak/' },
  { nazev: 'Podvodný odkaz', zacatek: '2026-11-20', obec: 'Praha', kraj: 'Hlavní město Praha', typy: ['vlaky'], url: 'javascript:alert(1)' },
];
const PRAHA = { lat: 50.0756, lon: 14.4379 };
const souradnice = {
  [W + 'praha-vlak/']: PRAHA,
  [W + 'praha-auta/']: PRAHA,
  [W + 'brno-lode/']: { lat: 49.1952, lon: 16.6069 },
  [W + 'ostrava-letadla/']: { lat: 49.8347, lon: 18.282 },
  [W + 'plzen-traktory/']: { lat: 49.7475, lon: 13.3776 },
  [W + 'liberec-vystava/']: { lat: 50.7671, lon: 15.0562, kraj: 'Liberecký kraj' },
  [W + 'skoncena/']: PRAHA,
  [W + 'zrusena/']: { lat: 49.1952, lon: 16.6069 },
  [W + 'olomouc-vlak/']: { lat: 49.5938, lon: 17.2509 },
};
module.exports = { W, DNES, akce, souradnice };
