/*! hs-mapa.js – mapa nadcházejících dopravních akcí v ČR (hravestroje.cz)
 * Do stránky: <div id="hs-mapa"></div> + <script src="…/mapa/hs-mapa.js" defer></script>
 * Načte akce z kalendáře (../kalendar/akce.json) a souřadnice akcí (../akce-v-okoli/souradnice.json),
 * nakreslí je na mapu (Leaflet z cdnjs, dlaždice OpenStreetMap), akce na stejném místě sloučí
 * do jednoho bodu. Filtry typ, kraj a „kdy“; tlačítko „Moje poloha“ seřadí akce podle vzdálenosti
 * (poloha zůstává jen v prohlížeči, nikam se neposílá). Bez cookies.
 */
(function (koren, tovarna) {
  var M = tovarna();
  if (typeof module === 'object' && module.exports) module.exports = M; // testy v Node.js
  else M.spust(koren);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- NASTAVENÍ ---------------------------------------------------------
  var NASTAVENI = {
    akce: '',            // adresa akce.json; prázdné = ../kalendar/akce.json vedle tohoto skriptu
    souradnice: '',      // adresa souradnice.json; prázdné = ../akce-v-okoli/souradnice.json vedle skriptu
    kalendar: '',        // odkaz „Všechny akce v kalendáři“; prázdné = ../kalendar/
    // Leaflet z cdnjs – pevná verze a kontrolní součet (integrity). Při změně verze změňte i součty.
    leafletJs: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
    leafletJsIntegrity: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH',
    leafletCss: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
    leafletCssIntegrity: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
    dlazdice: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribuce: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">přispěvatelé OpenStreetMap</a>',
    stred: [49.8, 15.5], // střed ČR
    priblizeni: 7,
    seznam: 12,          // kolik akcí ukázat v seznamu pod mapou (další tlačítkem)
    casovyLimit: 10000   // ms
  };
  // ------------------------------------------------------------------------

  var ZAKLAD_WEBU = 'https://www.hravestroje.cz/';
  var TYPY = { vlaky: 'Vlaky', traktory: 'Traktory', auta: 'Auta', lode: 'Lodě', letadla: 'Letadla', ostatni: 'Ostatní' };
  var KDY = { vikend: 'Tento víkend', mesic: 'Tento měsíc', vse: 'Vše' };

  // Čárové ikony 24×24 (stejné jako v kalendáři), barva přes currentColor.
  var IKONY = {
    vlaky: '<rect x="5" y="3" width="14" height="13" rx="3"/><rect x="7.5" y="5.5" width="9" height="4.5" rx="1"/>' +
      '<circle cx="8.5" cy="13" r=".9"/><circle cx="15.5" cy="13" r=".9"/><path d="M8.5 16 6.5 20M15.5 16l2 4M4 20h16"/>',
    traktory: '<circle cx="7.5" cy="15.5" r="4"/><circle cx="7.5" cy="15.5" r="1.2"/><circle cx="18" cy="17" r="2.5"/>' +
      '<path d="M4 11.5V4.5h6.5l1.5 7"/><path d="M11.5 15.5h4M12 11.5h8.5V15"/><path d="M16.5 11.5V7.5"/>',
    auta: '<path d="M3 16.5v-3.2l2.2-4.8h10.2l3.8 4.8H21v3.2h-1.5"/><path d="M9.2 16.5h5.6M4.5 16.5H3"/>' +
      '<circle cx="7" cy="16.8" r="2.1"/><circle cx="17" cy="16.8" r="2.1"/><path d="M6.4 12.8h11.4M11 8.5v4.3"/>',
    lode: '<path d="M3 14h18l-2.6 4.5H5.6z"/><path d="M7 14V9.5h9V14"/><path d="M10 9.5V6h3v3.5"/>' +
      '<path d="M2 21.5c1.7 0 1.7-1 3.3-1s1.7 1 3.4 1 1.7-1 3.3-1 1.7 1 3.3 1 1.7-1 3.4-1 1.6 1 3.3 1"/>',
    letadla: '<path d="M21 15.5 13.5 11V5a1.5 1.5 0 0 0-3 0v6L3 15.5v2l7.5-2.3v3.6l-2 1.7V22l3.5-1 3.5 1v-1.5l-2-1.7v-3.6l7.5 2.3z"/>',
    ostatni: '<path d="M5 21V4"/><path d="M5 4.5h11.5l-2.2 4 2.2 4H5"/>',
    misto: '<path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    kalendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    sipka: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    poloha: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
    vse: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/>' +
      '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'
  };

  function ikona(nazev, trida) {
    return '<svg class="hsm-ikona' + (trida ? ' ' + trida : '') + '" viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (IKONY[nazev] || IKONY.ostatni) + '</svg>';
  }

  var MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
    'srpna', 'září', 'října', 'listopadu', 'prosince'];
  var DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

  // ---------- Pomocné funkce ----------
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bezpecnaUrl(u, zaklad) {
    if (!u || typeof u !== 'string') return '';
    try {
      var url = new URL(u.trim(), zaklad || ZAKLAD_WEBU);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  // "2026-12-05" i "2026-12-05T10:00+01:00" → půlnoc daného dne v místním čase
  function den(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;
  }

  function dnesniDen(ted) {
    var t = ted || new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function pridejDny(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function cislo(x) {
    if (x == null || x === '') return null;
    var n = Number(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // Vzdálenost dvou bodů v km (vzdušnou čarou)
  function vzdalenost(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var dLat = (lat2 - lat1) * r;
    var dLon = (lon2 - lon1) * r;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // 3,4 km → „cca 3 km“, 23 km → „cca 25 km“ (nad 10 km na pětikilometry)
  function textVzdalenosti(km) {
    if (km == null || !isFinite(km)) return '';
    if (km < 1.5) return 'do 2 km';
    var z = km < 10 ? Math.round(km) : Math.round(km / 5) * 5;
    return 'cca ' + z + ' km';
  }

  function typyAkce(a) {
    var vystup = [];
    ((a && a.typy) || []).forEach(function (t) { if (TYPY[t] && vystup.indexOf(t) < 0) vystup.push(t); });
    return vystup.length ? vystup : ['ostatni'];
  }

  // ---------- Příprava dat ----------
  // akce: pole z akce.json, souradnice: objekt "akce" ze souradnice.json (klíč = adresa článku)
  // Vrátí nadcházející (i právě probíhající) akce, které mají souřadnice, seřazené podle data.
  // Druhá hodnota `bezMista` = počet nadcházejících akcí, které na mapě nejsou (chybí souřadnice).
  function pripravAkce(akce, souradnice, ted) {
    souradnice = souradnice || {};
    var dnes = dnesniDen(ted);
    var polozky = [];
    var bezMista = 0;
    (akce || []).forEach(function (a) {
      if (!a || !a.nazev || !a.url || a.zruseno) return;
      var url = bezpecnaUrl(a.url);
      if (!url) return;
      var zacatek = den(a.zacatek);
      if (!zacatek) return;
      var konec = den(a.konec) || zacatek;
      if (konec < zacatek) konec = zacatek;
      if (konec < dnes) return; // už skončila
      var s = souradnice[a.url] || souradnice[url] || {};
      var lat = cislo(s.lat), lon = cislo(s.lon);
      if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) { bezMista++; return; }
      var typy = typyAkce(a);
      polozky.push({
        akce: a,
        url: url,
        nazev: String(a.nazev),
        obec: String(a.obec || ''),
        zacatek: zacatek,
        konec: konec,
        razeni: zacatek < dnes ? dnes : zacatek, // probíhající akce se řadí jako „dnes“
        lat: lat,
        lon: lon,
        kraj: String(s.kraj || a.kraj || ''),
        typy: typy,
        typ: typy[0]
      });
    });
    polozky.sort(podleData);
    return { polozky: polozky, bezMista: bezMista };
  }

  function podleData(x, y) {
    return (x.razeni - y.razeni) || (x.zacatek - y.zacatek) || (x.konec - y.konec) ||
      x.nazev.localeCompare(y.nazev, 'cs');
  }

  // Období pro filtr „kdy“: { od, do } (oba dny včetně), nebo null = bez omezení.
  // Víkend jako v kalendáři: v pracovní den nadcházející sobota+neděle, o víkendu ten aktuální.
  function rozsahKdy(kdy, ted) {
    var dnes = dnesniDen(ted);
    var d = dnes.getDay(); // 0 = neděle
    if (kdy === 'vikend') {
      var sobota = d === 0 ? pridejDny(dnes, -1) : pridejDny(dnes, 6 - d);
      return { od: d === 0 ? dnes : sobota, do: pridejDny(sobota, 1) };
    }
    if (kdy === 'mesic') return { od: dnes, do: new Date(dnes.getFullYear(), dnes.getMonth() + 1, 0) };
    return null;
  }

  // filtr: { typ: 'vlaky'|'' , kraj: 'Zlínský kraj'|'', kdy: 'vikend'|'mesic'|'vse' }
  function filtruj(polozky, filtr, ted) {
    filtr = filtr || {};
    var rozsah = rozsahKdy(filtr.kdy, ted);
    return (polozky || []).filter(function (p) {
      if (filtr.typ && p.typy.indexOf(filtr.typ) < 0) return false;
      if (filtr.kraj && p.kraj !== filtr.kraj) return false;
      if (rozsah && (p.zacatek > rozsah.do || p.konec < rozsah.od)) return false;
      return true;
    });
  }

  function klicMista(lat, lon) {
    return lat.toFixed(4) + ',' + lon.toFixed(4);
  }

  // Akce na stejném místě (stejné souřadnice) sloučí do jednoho bodu.
  // Body jsou seřazené podle nejbližší akce, akce v bodu podle data.
  function seskup(polozky) {
    var podleKlice = {};
    var body = [];
    (polozky || []).forEach(function (p) {
      var k = klicMista(p.lat, p.lon);
      var b = podleKlice[k];
      if (!b) {
        b = podleKlice[k] = { klic: k, lat: p.lat, lon: p.lon, polozky: [], obce: [] };
        body.push(b);
      }
      b.polozky.push(p);
      if (p.obec && b.obce.indexOf(p.obec) < 0) b.obce.push(p.obec);
    });
    body.forEach(function (b) {
      b.polozky.sort(podleData);
      b.typ = b.polozky[0].typ;
      b.obec = b.obce[0] || '';
    });
    body.sort(function (x, y) { return podleData(x.polozky[0], y.polozky[0]); });
    return body;
  }

  // Doplní vzdálenost od polohy uživatele (km) a seřadí od nejbližšího; při stejné vzdálenosti podle data.
  function seradPodleVzdalenosti(seznam, poloha) {
    var lat = poloha && cislo(poloha.lat), lon = poloha && cislo(poloha.lon);
    if (lat == null || lon == null) return seznam.slice();
    seznam.forEach(function (x) { x.km = vzdalenost(lat, lon, x.lat, x.lon); });
    return seznam.slice().sort(function (x, y) {
      return (x.km - y.km) || podleData(x.polozky ? x.polozky[0] : x, y.polozky ? y.polozky[0] : y);
    });
  }

  // Seznam krajů pro výběr (abecedně, česky)
  function seznamKraju(polozky) {
    var kraje = [];
    (polozky || []).forEach(function (p) { if (p.kraj && kraje.indexOf(p.kraj) < 0) kraje.push(p.kraj); });
    return kraje.sort(function (a, b) { return a.localeCompare(b, 'cs'); });
  }

  // ---------- Texty ----------
  function textData(p, ted) {
    var dnes = dnesniDen(ted);
    var z = p.zacatek;
    var k = p.konec;
    var rok = function (d) { return d.getFullYear() !== dnes.getFullYear() ? ' ' + d.getFullYear() : ''; };
    var dm = function (d) { return d.getDate() + '. ' + MESICE[d.getMonth()]; };
    if (z < dnes) return 'probíhá do ' + dm(k) + rok(k);
    if (+z === +k) return DNY[z.getDay()] + ' ' + dm(z) + rok(z);
    if (z.getFullYear() === k.getFullYear() && z.getMonth() === k.getMonth()) {
      return z.getDate() + '.–' + dm(k) + rok(k);
    }
    if (z.getFullYear() !== k.getFullYear()) return dm(z) + ' ' + z.getFullYear() + ' – ' + dm(k) + ' ' + k.getFullYear();
    return dm(z) + ' – ' + dm(k) + rok(k);
  }

  function pocetAkci(n) {
    return n + ' ' + (n === 1 ? 'akce' : n >= 2 && n <= 4 ? 'akce' : 'akcí');
  }

  function pocetMist(n) {
    return n + ' ' + (n === 1 ? 'místo' : n >= 2 && n <= 4 ? 'místa' : 'míst');
  }

  // Karta po kliknutí na bod: místo, (vzdálenost) a akce s datem, názvem a odkazem na článek
  function htmlKarty(bod, ted) {
    var hlavicka = [bod.obce.join(', '), textVzdalenosti(bod.km)].filter(Boolean).join(' · ');
    return '<div class="hsm-karta">' +
      (hlavicka ? '<p class="hsm-karta-misto">' + ikona('misto') + '<span>' + esc(hlavicka) + '</span></p>' : '') +
      '<ul class="hsm-karta-akce">' + bod.polozky.map(function (p) {
        return '<li class="hsm-karta-polozka">' +
          '<span class="hsm-karta-typ" title="' + esc(TYPY[p.typ]) + '">' + ikona(p.typ) + '</span>' +
          '<span class="hsm-karta-text">' +
            '<span class="hsm-datum">' + esc(textData(p, ted)) + '</span>' +
            '<a class="hsm-karta-nazev" href="' + esc(p.url) + '">' + esc(p.nazev) + '</a>' +
            '<a class="hsm-karta-odkaz" href="' + esc(p.url) + '" aria-hidden="true" tabindex="-1">Detail akce' + ikona('sipka') + '</a>' +
          '</span></li>';
      }).join('') + '</ul></div>';
  }

  // Značka na mapě: zelený špendlík s bílou ikonou typu, u sloučeného místa počet akcí
  function htmlZnacky(bod) {
    var n = bod.polozky.length;
    return '<span class="hsm-znacka" data-typ="' + esc(bod.typ) + '">' +
      '<svg class="hsm-spendlik" viewBox="0 0 36 46" width="36" height="46" aria-hidden="true" focusable="false">' +
        '<path d="M18 44.5C18 44.5 2 28.6 2 17.6A16 16 0 0 1 34 17.6C34 28.6 18 44.5 18 44.5Z" fill="#1f6f3d" stroke="#fff" stroke-width="2.5"/>' +
      '</svg>' +
      '<span class="hsm-znacka-ikona">' + ikona(bod.typ) + '</span>' +
      (n > 1 ? '<span class="hsm-znacka-pocet">' + (n > 99 ? '99+' : n) + '</span>' : '') +
      '</span>';
  }

  function popisZnacky(bod) {
    return [bod.obec || 'Místo akce', pocetAkci(bod.polozky.length) + ', nejbližší ' + bod.polozky[0].nazev].join(': ');
  }

  // ---------- Styly (jen uvnitř #hs-mapa, aby se nepraly se šablonou Shoptetu) ----------
  var S = '#hs-mapa';
  var CSS =
    S + '{--hsm-zelena:#1f6f3d;--hsm-zelena-tmava:#16532d;--hsm-zelena-svetla:#e6f1ea;--hsm-cihlova:#c0392b;--hsm-cihlova-svetla:#fbeae7;' +
      '--hsm-text:#1d2420;--hsm-tlumeny:#59635d;--hsm-okraj:#dfe3dd;display:block;margin:24px 0;clear:both;color:var(--hsm-text);line-height:1.4;font-family:inherit}' +
    S + ' *,' + S + ' *::before,' + S + ' *::after{box-sizing:border-box}' +
    S + ' .hsm-ikona{width:1.15em;height:1.15em;flex:none;vertical-align:-.18em}' +
    S + ' .hsm-filtry{display:flex;flex-direction:column;gap:12px;margin:0 0 14px}' +
    S + ' .hsm-skupina{display:flex;flex-direction:column;min-width:0}' +
    S + ' .hsm-radek{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0;padding:0;min-width:0}' +
    S + ' .hsm-popisek{display:block;font-size:.8em;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hsm-tlumeny);padding:0;margin:0 0 6px}' +
    S + ' button.hsm-cip{display:inline-flex;align-items:center;gap:6px;margin:0;padding:7px 13px;min-height:38px;border:1px solid var(--hsm-okraj);' +
      'border-radius:999px;background:#fff;color:var(--hsm-zelena-tmava);font:inherit;font-size:.92em;font-weight:600;line-height:1.2;cursor:pointer;' +
      'box-shadow:none;text-transform:none;letter-spacing:normal;width:auto;height:auto;text-shadow:none}' +
    S + ' button.hsm-cip:hover{border-color:var(--hsm-zelena);background:var(--hsm-zelena-svetla)}' +
    S + ' button.hsm-cip[aria-pressed="true"]{background:var(--hsm-zelena);border-color:var(--hsm-zelena);color:#fff}' +
    S + ' button.hsm-cip:focus-visible,' + S + ' select.hsm-vyber:focus-visible,' + S + ' button.hsm-poloha:focus-visible,' + S + ' a:focus-visible{outline:3px solid var(--hsm-cihlova);outline-offset:2px}' +
    S + ' .hsm-dvojice{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end}' +
    S + ' .hsm-kraj{display:flex;flex-direction:column;flex:1 1 220px;max-width:340px}' +
    S + ' select.hsm-vyber{width:100%;min-height:40px;margin:0;padding:7px 34px 7px 12px;border:1px solid var(--hsm-okraj);border-radius:10px;background:#fff;color:var(--hsm-text);' +
      'font:inherit;font-size:.95em;-webkit-appearance:none;appearance:none;' +
      'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%231f6f3d\' stroke-width=\'2.2\' stroke-linecap=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 10px center;background-size:16px}' +
    S + ' .hsm-kdy{flex:1 1 280px}' +
    S + ' .hsm-lista{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;margin:0 0 10px}' +
    S + ' .hsm-pocet{margin:0;font-size:.95em;color:var(--hsm-tlumeny)}' +
    S + ' .hsm-pocet strong{color:var(--hsm-text)}' +
    S + ' button.hsm-poloha{display:inline-flex;align-items:center;gap:8px;margin:0;padding:9px 16px;min-height:40px;border:0;border-radius:999px;' +
      'background:var(--hsm-cihlova);color:#fff;font:inherit;font-size:.95em;font-weight:700;cursor:pointer;box-shadow:none;text-transform:none;width:auto;height:auto}' +
    S + ' button.hsm-poloha:hover{background:#a5311f}' +
    S + ' button.hsm-poloha[disabled]{opacity:.7;cursor:progress}' +
    S + ' .hsm-zprava{margin:0 0 10px;padding:9px 12px;border-radius:10px;background:var(--hsm-zelena-svetla);font-size:.9em}' +
    S + ' .hsm-zprava[data-druh="chyba"]{background:var(--hsm-cihlova-svetla)}' +
    S + ' .hsm-zprava:empty{display:none}' +
    S + ' .hsm-mapa{position:relative;height:540px;border:1px solid var(--hsm-okraj);border-radius:14px;overflow:hidden;background:#e9efe9;z-index:0}' +
    S + ' .hsm-mapa-stav{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;color:var(--hsm-tlumeny);font-size:.95em}' +
    S + ' .leaflet-container{font:inherit;font-size:15px;background:#e9efe9}' +
    S + ' .leaflet-container img,' + S + ' .leaflet-container svg{max-width:none!important;max-height:none!important}' +
    S + ' .leaflet-container img.leaflet-tile{height:auto;margin:0;border:0;box-shadow:none}' +
    S + ' .leaflet-control-attribution{font-size:11px;line-height:1.4}' +
    S + ' .leaflet-control-attribution a{color:var(--hsm-zelena-tmava)}' +
    S + ' .hsm-znacka-obal{background:none;border:0}' +
    S + ' .hsm-znacka{position:relative;display:block;width:36px;height:46px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}' +
    S + ' .hsm-spendlik{display:block;width:36px;height:46px}' +
    S + ' .hsm-znacka-ikona{position:absolute;left:7px;top:6.5px;width:22px;height:22px;color:#fff}' +
    S + ' .hsm-znacka-ikona .hsm-ikona{width:22px;height:22px;stroke-width:2;vertical-align:top}' +
    S + ' .hsm-znacka-pocet{position:absolute;right:-8px;top:-6px;min-width:21px;height:21px;padding:0 5px;border-radius:999px;background:var(--hsm-cihlova);' +
      'color:#fff;border:2px solid #fff;font-size:11px;font-weight:800;line-height:17px;text-align:center}' +
    S + ' .leaflet-marker-icon:focus-visible{outline:3px solid var(--hsm-cihlova);outline-offset:2px;border-radius:50%}' +
    S + ' .hsm-ja{background:none;border:0}' +
    S + ' .hsm-ja span{display:block;width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25),0 1px 4px rgba(0,0,0,.35)}' +
    S + ' .leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 4px 18px rgba(0,0,0,.18)}' +
    S + ' .leaflet-popup-content{margin:14px 16px 12px;line-height:1.35;min-width:220px}' +
    S + ' .hsm-karta-misto{display:flex;align-items:center;gap:6px;margin:0 22px 8px 0;font-size:.85em;font-weight:700;color:var(--hsm-tlumeny)}' +
    S + ' .hsm-karta-misto .hsm-ikona{color:var(--hsm-cihlova)}' +
    S + ' .hsm-karta-akce{list-style:none;margin:0;padding:0;max-height:270px;overflow-y:auto;overscroll-behavior:contain}' +
    S + ' .hsm-karta-polozka{display:flex;gap:10px;margin:0;padding:9px 0;border-top:1px solid var(--hsm-okraj);list-style:none}' +
    S + ' .hsm-karta-polozka:first-child{border-top:0;padding-top:2px}' +
    S + ' .hsm-karta-polozka::before,' + S + ' .hsm-karta-polozka::marker{content:none;display:none}' +
    S + ' .hsm-karta-typ{flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:var(--hsm-zelena-svetla);color:var(--hsm-zelena)}' +
    S + ' .hsm-karta-text{display:flex;flex-direction:column;gap:3px;min-width:0}' +
    S + ' .hsm-datum{font-size:.85em;font-weight:700;color:var(--hsm-cihlova)}' +
    S + ' a.hsm-karta-nazev{font-size:1em;font-weight:700;color:var(--hsm-text);text-decoration:none}' +
    S + ' a.hsm-karta-nazev:hover{color:var(--hsm-zelena);text-decoration:underline}' +
    S + ' a.hsm-karta-odkaz{display:inline-flex;align-items:center;gap:4px;font-size:.88em;font-weight:700;color:var(--hsm-zelena);text-decoration:none}' +
    S + ' a.hsm-karta-odkaz:hover{text-decoration:underline}' +
    S + ' .hsm-seznam-nadpis{display:flex;align-items:center;gap:8px;margin:20px 0 10px;font-size:1.2em;font-weight:700;color:var(--hsm-zelena-tmava)}' +
    S + ' .hsm-seznam-nadpis .hsm-ikona{color:var(--hsm-cihlova)}' +
    S + ' .hsm-seznam{list-style:none;margin:0;padding:0;display:grid;gap:10px;grid-template-columns:1fr}' +
    S + ' .hsm-polozka{display:flex;gap:12px;align-items:flex-start;margin:0;padding:12px 14px;background:#fff;border:1px solid var(--hsm-okraj);border-radius:12px;list-style:none}' +
    S + ' .hsm-polozka::before,' + S + ' .hsm-polozka::marker{content:none;display:none}' +
    S + ' .hsm-polozka .hsm-karta-typ{width:38px;height:38px}' +
    S + ' .hsm-polozka-text{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}' +
    S + ' a.hsm-polozka-nazev{font-weight:700;color:var(--hsm-text);text-decoration:none}' +
    S + ' a.hsm-polozka-nazev:hover{color:var(--hsm-zelena);text-decoration:underline}' +
    S + ' .hsm-polozka-misto{font-size:.88em;color:var(--hsm-tlumeny)}' +
    S + ' button.hsm-ukazat{flex:none;align-self:center;display:inline-flex;align-items:center;gap:5px;margin:0;padding:7px 11px;border:1px solid var(--hsm-okraj);border-radius:999px;' +
      'background:#fff;color:var(--hsm-zelena-tmava);font:inherit;font-size:.85em;font-weight:600;cursor:pointer;box-shadow:none;width:auto;height:auto;text-transform:none}' +
    S + ' button.hsm-ukazat:hover{background:var(--hsm-zelena-svetla);border-color:var(--hsm-zelena)}' +
    S + ' .hsm-dalsi-obal{margin:14px 0 0;text-align:center;display:flex;flex-wrap:wrap;gap:10px;justify-content:center}' +
    S + ' a.hsm-kalendar{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;background:var(--hsm-zelena);color:#fff;font-weight:700;text-decoration:none}' +
    S + ' a.hsm-kalendar:hover{background:var(--hsm-zelena-tmava);color:#fff}' +
    S + ' .hsm-poznamka{margin:12px 0 0;font-size:.82em;color:var(--hsm-tlumeny);text-align:center}' +
    S + ' .hsm-prazdno{padding:14px;border-radius:12px;background:#fff;border:1px dashed var(--hsm-okraj);color:var(--hsm-tlumeny);text-align:center}' +
    '@media (min-width:760px){' + S + ' .hsm-seznam{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '@media (max-width:639px){' + S + ' .hsm-mapa{height:68vh;min-height:360px;max-height:560px;border-radius:0;border-left:0;border-right:0}' +
      S + ' .hsm-filtry .hsm-radek{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;scrollbar-width:none}' +
      S + ' .hsm-kraj{max-width:none}' +
      S + ' button.hsm-cip{flex:none}' +
      S + ' button.hsm-ukazat .hsm-ukazat-text{display:none}}';

  // ---------- Prohlížeč ----------
  function spust(okno) {
    var doc = okno.document;
    if (!doc || !doc.getElementById) return;
    var skript = doc.currentScript;
    var adresaSkriptu = skript && skript.src ? skript.src : '';
    var hledani = okno.location ? okno.location.search : '';
    if (/[?&]hs-mapa=vypnout/.test(hledani)) return;

    // Pro test: ?hs-mapa-dnes=2026-12-01 (chová se, jako by byl ten den)
    var testDnes = /[?&]hs-mapa-dnes=(\d{4}-\d{2}-\d{2})/.exec(hledani);
    var dnes = (testDnes && den(testDnes[1])) || new Date();

    function vedleSkriptu(relativni) {
      return adresaSkriptu ? new URL(relativni, adresaSkriptu).href : '';
    }

    function nactiJson(adresa) {
      if (!adresa || !okno.fetch) return Promise.resolve(null);
      var ovladac = okno.AbortController ? new okno.AbortController() : null;
      var casovac = ovladac ? setTimeout(function () { ovladac.abort(); }, NASTAVENI.casovyLimit) : null;
      return okno.fetch(adresa, { credentials: 'omit', mode: 'cors', signal: ovladac ? ovladac.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (d) { if (casovac) clearTimeout(casovac); return d; });
    }

    var leafletSlib = null;
    function nactiLeaflet() {
      if (okno.L && okno.L.map) return Promise.resolve(okno.L);
      if (leafletSlib) return leafletSlib;
      leafletSlib = new Promise(function (hotovo) {
        if (!doc.querySelector('link[data-hs-leaflet]')) {
          var css = doc.createElement('link');
          css.rel = 'stylesheet';
          css.href = NASTAVENI.leafletCss;
          css.integrity = NASTAVENI.leafletCssIntegrity;
          css.crossOrigin = 'anonymous';
          css.referrerPolicy = 'no-referrer';
          css.setAttribute('data-hs-leaflet', '1');
          (doc.head || doc.documentElement).appendChild(css);
        }
        var js = doc.createElement('script');
        js.src = NASTAVENI.leafletJs;
        js.integrity = NASTAVENI.leafletJsIntegrity;
        js.crossOrigin = 'anonymous';
        js.referrerPolicy = 'no-referrer';
        js.async = true;
        var casovac = setTimeout(function () { hotovo(null); }, NASTAVENI.casovyLimit);
        js.onload = function () { clearTimeout(casovac); hotovo(okno.L && okno.L.map ? okno.L : null); };
        js.onerror = function () { clearTimeout(casovac); hotovo(null); };
        (doc.head || doc.documentElement).appendChild(js);
      });
      return leafletSlib;
    }

    function start() {
      var el = doc.getElementById('hs-mapa');
      if (!el || el.getAttribute('data-hs-hotovo')) return;
      el.setAttribute('data-hs-hotovo', '1');
      if (!doc.getElementById('hs-mapa-css')) {
        var styl = doc.createElement('style');
        styl.id = 'hs-mapa-css';
        styl.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(styl);
      }
      var kalendar = el.getAttribute('data-kalendar') || NASTAVENI.kalendar || vedleSkriptu('../kalendar/') ||
        'https://hravestroje.github.io/hravestroje-web/kalendar/';
      var leaflet = nactiLeaflet();
      Promise.all([
        nactiJson(el.getAttribute('data-akce') || NASTAVENI.akce || vedleSkriptu('../kalendar/akce.json')),
        nactiJson(el.getAttribute('data-souradnice') || NASTAVENI.souradnice || vedleSkriptu('../akce-v-okoli/souradnice.json'))
      ]).then(function (data) {
        var akce = data[0] && (Array.isArray(data[0]) ? data[0] : data[0].akce);
        if (!Array.isArray(akce)) {
          el.innerHTML = '<p class="hsm-prazdno">Mapu akcí se teď nepodařilo načíst. Všechny akce najdete v ' +
            '<a href="' + esc(kalendar) + '">kalendáři</a>.</p>';
          return;
        }
        var pripraveno = pripravAkce(akce, (data[1] && data[1].akce) || {}, dnes);
        vytvor(el, pripraveno, kalendar, leaflet);
      });
    }

    function vytvor(el, pripraveno, kalendar, leafletSlib) {
      var vsechny = pripraveno.polozky;
      var adresa = el.getAttribute('data-adresa') === 'ano'; // filtry do adresy (jen samostatná stránka)
      var p = new URLSearchParams(hledani);
      var stav = {
        typ: p.get('typ') || el.getAttribute('data-typ') || '',
        kraj: p.get('kraj') || el.getAttribute('data-kraj') || '',
        kdy: p.get('kdy') || el.getAttribute('data-kdy') || 'vse',
        poloha: null,
        zobrazeno: NASTAVENI.seznam
      };
      if (!TYPY[stav.typ]) stav.typ = '';
      if (!KDY[stav.kdy]) stav.kdy = 'vse';
      var kraje = seznamKraju(vsechny);
      if (kraje.indexOf(stav.kraj) < 0) stav.kraj = '';

      var cipTyp = function (hodnota, text, ik) {
        return '<button type="button" class="hsm-cip" data-typ="' + esc(hodnota) + '" aria-pressed="' + (stav.typ === hodnota) + '">' +
          ikona(ik) + '<span>' + esc(text) + '</span></button>';
      };
      el.innerHTML =
        '<div class="hsm-filtry">' +
          '<div class="hsm-skupina"><span class="hsm-popisek" id="hsm-p-typ">Typ</span>' +
            '<div class="hsm-radek hsm-typy" role="group" aria-labelledby="hsm-p-typ">' +
              cipTyp('', 'Vše', 'vse') +
              Object.keys(TYPY).map(function (t) { return cipTyp(t, TYPY[t], t); }).join('') +
          '</div></div>' +
          '<div class="hsm-dvojice">' +
            '<label class="hsm-kraj"><span class="hsm-popisek">Kraj</span>' +
              '<select class="hsm-vyber"><option value="">Celá ČR</option>' +
                kraje.map(function (k) {
                  return '<option value="' + esc(k) + '"' + (k === stav.kraj ? ' selected' : '') + '>' + esc(k) + '</option>';
                }).join('') +
              '</select></label>' +
            '<div class="hsm-skupina hsm-kdy"><span class="hsm-popisek" id="hsm-p-kdy">Kdy</span>' +
              '<div class="hsm-radek" role="group" aria-labelledby="hsm-p-kdy">' +
                Object.keys(KDY).map(function (k) {
                  return '<button type="button" class="hsm-cip" data-kdy="' + k + '" aria-pressed="' + (stav.kdy === k) + '">' + esc(KDY[k]) + '</button>';
                }).join('') +
            '</div></div>' +
          '</div>' +
        '</div>' +
        '<div class="hsm-lista">' +
          '<p class="hsm-pocet" aria-live="polite"></p>' +
          '<button type="button" class="hsm-poloha">' + ikona('poloha') + '<span>Moje poloha</span></button>' +
        '</div>' +
        '<p class="hsm-zprava" role="status"></p>' +
        '<div class="hsm-mapa"><div class="hsm-mapa-stav">Načítám mapu…</div></div>' +
        '<p class="hsm-seznam-nadpis">' + ikona('kalendar') + '<span>Nadcházející akce</span></p>' +
        '<ol class="hsm-seznam"></ol>' +
        '<div class="hsm-dalsi-obal"></div>' +
        '<p class="hsm-poznamka">Poloha se zjišťuje jen ve vašem prohlížeči a nikam se neposílá. Mapa nepoužívá cookies.' +
          (pripraveno.bezMista ? ' ' + pocetAkci(pripraveno.bezMista) + ' bez přesného místa najdete jen v kalendáři.' : '') + '</p>';

      var q = function (s) { return el.querySelector(s); };
      var mapaEl = q('.hsm-mapa');
      var mapa = null, vrstva = null, ja = null, znacky = {};
      var body = [];

      // Na mobilu mapa přes celou šířku obrazovky (i když je v článku s okraji)
      function roztahni() {
        mapaEl.style.marginLeft = mapaEl.style.width = '';
        var sirka = doc.documentElement.clientWidth || okno.innerWidth;
        if (sirka < 640) {
          var r = mapaEl.getBoundingClientRect();
          if (r.left > 0 || r.right < sirka) {
            mapaEl.style.marginLeft = (-r.left) + 'px';
            mapaEl.style.width = sirka + 'px';
          }
        }
        if (mapa) mapa.invalidateSize();
      }
      roztahni();
      var cekani;
      okno.addEventListener('resize', function () { clearTimeout(cekani); cekani = setTimeout(roztahni, 120); });

      function zprava(text, druh) {
        var z = q('.hsm-zprava');
        z.textContent = text || '';
        if (druh) z.setAttribute('data-druh', druh); else z.removeAttribute('data-druh');
      }

      function ulozDoAdresy() {
        if (!adresa || !okno.history || !okno.history.replaceState) return;
        var u = new URL(okno.location.href);
        ['typ', 'kraj', 'kdy'].forEach(function (k) {
          if (stav[k] && !(k === 'kdy' && stav[k] === 'vse')) u.searchParams.set(k, stav[k]); else u.searchParams.delete(k);
        });
        okno.history.replaceState(null, '', u.pathname + u.search + u.hash);
      }

      function ukazBod(klic) {
        var z = znacky[klic];
        if (!mapa || !z) return;
        mapaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mapa.setView(z.getLatLng(), Math.max(mapa.getZoom(), 11));
        z.openPopup();
      }

      function vykresliSeznam() {
        var polozky = [];
        body.forEach(function (b) { b.polozky.forEach(function (p) { polozky.push({ p: p, b: b }); }); });
        if (stav.poloha) {
          polozky.sort(function (x, y) { return (x.b.km - y.b.km) || podleData(x.p, y.p); });
        } else {
          polozky.sort(function (x, y) { return podleData(x.p, y.p); });
        }
        q('.hsm-seznam-nadpis span').textContent = stav.poloha ? 'Nejbližší akce' : 'Nadcházející akce';
        var seznam = q('.hsm-seznam');
        if (!polozky.length) {
          seznam.innerHTML = '<li class="hsm-prazdno">Pro tento výběr žádné akce nemáme. Zkuste jiný typ, kraj nebo „Vše“.</li>';
        } else {
          seznam.innerHTML = polozky.slice(0, stav.zobrazeno).map(function (x) {
            var misto = [x.p.obec, x.p.kraj, textVzdalenosti(x.b.km)].filter(Boolean).join(' · ');
            return '<li class="hsm-polozka">' +
              '<span class="hsm-karta-typ" title="' + esc(TYPY[x.p.typ]) + '">' + ikona(x.p.typ) + '</span>' +
              '<span class="hsm-polozka-text">' +
                '<span class="hsm-datum">' + esc(textData(x.p, dnes)) + '</span>' +
                '<a class="hsm-polozka-nazev" href="' + esc(x.p.url) + '">' + esc(x.p.nazev) + '</a>' +
                (misto ? '<span class="hsm-polozka-misto">' + esc(misto) + '</span>' : '') +
              '</span>' +
              (mapa ? '<button type="button" class="hsm-ukazat" data-bod="' + esc(x.b.klic) + '" aria-label="Ukázat na mapě: ' + esc(x.p.nazev) + '">' +
                ikona('misto') + '<span class="hsm-ukazat-text">Na mapě</span></button>' : '') +
              '</li>';
          }).join('');
        }
        q('.hsm-dalsi-obal').innerHTML =
          (polozky.length > stav.zobrazeno
            ? '<button type="button" class="hsm-cip hsm-dalsi">Další akce (' + (polozky.length - stav.zobrazeno) + ')</button>' : '') +
          '<a class="hsm-kalendar" href="' + esc(kalendar) + '">Všechny akce v kalendáři' + ikona('sipka') + '</a>';
      }

      function vykresliMapu(prizpusobit) {
        if (!mapa) return;
        var L = okno.L;
        vrstva.clearLayers();
        znacky = {};
        body.forEach(function (b) {
          var z = L.marker([b.lat, b.lon], {
            icon: L.divIcon({ className: 'hsm-znacka-obal', html: htmlZnacky(b), iconSize: [36, 46], iconAnchor: [18, 45], popupAnchor: [0, -40] }),
            title: popisZnacky(b),
            alt: popisZnacky(b),
            keyboard: true,
            riseOnHover: true,
            zIndexOffset: b.polozky.length > 1 ? 100 : 0
          });
          z.bindPopup(function () { return htmlKarty(b, dnes); }, { maxWidth: 320, minWidth: 220, autoPanPadding: [20, 20], className: 'hsm-popup' });
          z.addTo(vrstva);
          znacky[b.klic] = z;
        });
        if (!prizpusobit) return;
        var mezi = [];
        if (stav.poloha) {
          mezi.push([stav.poloha.lat, stav.poloha.lon]);
          body.slice(0, 4).forEach(function (b) { mezi.push([b.lat, b.lon]); });
        } else {
          body.forEach(function (b) { mezi.push([b.lat, b.lon]); });
        }
        if (mezi.length > 1) mapa.fitBounds(mezi, { padding: [36, 36], maxZoom: 11 });
        else if (mezi.length === 1) mapa.setView(mezi[0], 10);
        else mapa.setView(NASTAVENI.stred, NASTAVENI.priblizeni);
      }

      function obnov(prizpusobit) {
        var vybrane = filtruj(vsechny, stav, dnes);
        body = seskup(vybrane);
        if (stav.poloha) body = seradPodleVzdalenosti(body, stav.poloha);
        q('.hsm-pocet').innerHTML = vybrane.length
          ? 'Na mapě <strong>' + esc(pocetAkci(vybrane.length)) + '</strong> na ' + esc(pocetMist(body.length))
          : 'Pro tento výběr žádné akce nemáme.';
        vykresliMapu(prizpusobit);
        vykresliSeznam();
      }

      // Ovládání
      el.addEventListener('click', function (e) {
        var t = e.target.closest ? e.target.closest('button') : null;
        if (!t || !el.contains(t)) return;
        if (t.hasAttribute('data-typ')) {
          stav.typ = t.getAttribute('data-typ');
          var cipy = el.querySelectorAll('.hsm-typy .hsm-cip');
          for (var i = 0; i < cipy.length; i++) cipy[i].setAttribute('aria-pressed', String(cipy[i] === t));
        } else if (t.hasAttribute('data-kdy')) {
          stav.kdy = t.getAttribute('data-kdy');
          var kdy = el.querySelectorAll('.hsm-kdy .hsm-cip');
          for (var j = 0; j < kdy.length; j++) kdy[j].setAttribute('aria-pressed', String(kdy[j] === t));
        } else if (t.hasAttribute('data-bod')) {
          ukazBod(t.getAttribute('data-bod'));
          return;
        } else if (t.classList.contains('hsm-dalsi')) {
          stav.zobrazeno += NASTAVENI.seznam;
          vykresliSeznam();
          return;
        } else if (t.classList.contains('hsm-poloha')) {
          zjistiPolohu(t);
          return;
        } else {
          return;
        }
        stav.zobrazeno = NASTAVENI.seznam;
        ulozDoAdresy();
        obnov(true);
      });
      q('.hsm-vyber').addEventListener('change', function () {
        stav.kraj = this.value;
        stav.zobrazeno = NASTAVENI.seznam;
        ulozDoAdresy();
        obnov(true);
      });

      function zjistiPolohu(tlacitko) {
        var geo = okno.navigator && okno.navigator.geolocation;
        if (!geo) { zprava('Tento prohlížeč neumí zjistit polohu.', 'chyba'); return; }
        tlacitko.disabled = true;
        zprava('Zjišťuji polohu…');
        geo.getCurrentPosition(function (pos) {
          tlacitko.disabled = false;
          // Poloha zůstává jen v paměti této stránky – nikam se neposílá ani neukládá.
          stav.poloha = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          stav.zobrazeno = NASTAVENI.seznam;
          zprava('Akce jsou seřazené podle vzdálenosti od vás (vzdušnou čarou).');
          if (mapa) {
            var L = okno.L;
            if (ja) ja.setLatLng([stav.poloha.lat, stav.poloha.lon]);
            else {
              ja = L.marker([stav.poloha.lat, stav.poloha.lon], {
                icon: L.divIcon({ className: 'hsm-ja', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                title: 'Vaše poloha', alt: 'Vaše poloha', keyboard: false, zIndexOffset: 1000, interactive: false
              }).addTo(mapa);
            }
          }
          obnov(true);
        }, function (chyba) {
          tlacitko.disabled = false;
          zprava(chyba && chyba.code === 1
            ? 'Polohu jste nepovolili. Povolit ji můžete v nastavení prohlížeče u této stránky.'
            : 'Polohu se nepodařilo zjistit. Zkuste to prosím znovu.', 'chyba');
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
      }

      obnov(false);

      leafletSlib.then(function (L) {
        if (!L) {
          mapaEl.innerHTML = '<div class="hsm-mapa-stav">Mapu se nepodařilo načíst. Seznam akcí je níže.</div>';
          return;
        }
        mapaEl.innerHTML = '';
        mapa = L.map(mapaEl, {
          center: NASTAVENI.stred,
          zoom: NASTAVENI.priblizeni,
          minZoom: 6,
          maxZoom: 18,
          scrollWheelZoom: false, // kolečko myši posouvá stránku; přiblížení až po kliknutí do mapy
          tapTolerance: 20
        });
        mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
        L.tileLayer(NASTAVENI.dlazdice, {
          maxZoom: 19,
          attribution: NASTAVENI.atribuce,
          referrerPolicy: 'strict-origin-when-cross-origin'
        }).addTo(mapa);
        mapa.on('click focus', function () { mapa.scrollWheelZoom.enable(); });
        mapa.on('mouseout blur', function () { mapa.scrollWheelZoom.disable(); });
        vrstva = L.layerGroup().addTo(mapa);
        roztahni();
        obnov(true);
        el.setAttribute('data-hs-mapa', 'hotovo');
      });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return {
    NASTAVENI: NASTAVENI,
    TYPY: TYPY,
    esc: esc,
    bezpecnaUrl: bezpecnaUrl,
    vzdalenost: vzdalenost,
    textVzdalenosti: textVzdalenosti,
    pripravAkce: pripravAkce,
    rozsahKdy: rozsahKdy,
    filtruj: filtruj,
    seskup: seskup,
    seradPodleVzdalenosti: seradPodleVzdalenosti,
    seznamKraju: seznamKraju,
    textData: textData,
    pocetAkci: pocetAkci,
    htmlKarty: htmlKarty,
    htmlZnacky: htmlZnacky,
    spust: spust
  };
});
