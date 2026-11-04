/*! hs-akce-v-okoli.js – nadcházející dopravní akce v okolí místa z článku (hravestroje.cz)
 * V článku: <div class="hs-akce-v-okoli" data-lat="50.21" data-lon="16.07"
 *                data-kraj="Královéhradecký kraj" data-pocet="4"></div>
 * Načte akce z kalendáře (kalendar/akce.json) a souřadnice akcí (souradnice.json),
 * vybere nejbližší nadcházející akce do 50 km seřazené podle data; když jich je málo,
 * doplní akce ze stejného kraje. Akce z právě otevřeného článku se vynechá.
 * Když nic nenajde, blok zůstane skrytý. Bez cookies, bez knihoven.
 */
(function (koren, tovarna) {
  var L = tovarna();
  if (typeof module === 'object' && module.exports) module.exports = L; // testy v Node.js
  else L.spust(koren);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- NASTAVENÍ ---------------------------------------------------------
  var NASTAVENI = {
    akce: '',            // adresa akce.json; prázdné = ../kalendar/akce.json vedle tohoto skriptu
    souradnice: '',      // adresa souradnice.json; prázdné = stejná složka jako tento skript
    kalendar: '',        // odkaz „Všechny akce v kalendáři“; prázdné = ../kalendar/
    pocet: 4,            // kolik karet (atribut data-pocet)
    okruh: 50,           // km (atribut data-okruh)
    nadpis: 'Akce v okolí',
    casovyLimit: 8000    // ms
  };
  // ------------------------------------------------------------------------

  var ZAKLAD_WEBU = 'https://www.hravestroje.cz/';
  var TYPY = { vlaky: 'Vlaky', traktory: 'Traktory', auta: 'Auta', lode: 'Lodě', letadla: 'Letadla', ostatni: 'Ostatní' };

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
    sipka: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  function ikona(nazev, trida) {
    return '<svg class="hsa-ikona' + (trida ? ' ' + trida : '') + '" viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
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

  function normalizujKraj(k) {
    return String(k || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\bkraj\b/g, '').replace(/\s+/g, ' ').trim();
  }

  // Adresa článku bez domény, parametrů a koncového lomítka – pro porovnání „je to tenhle článek?“
  function cestaClanku(u) {
    try {
      var url = new URL(String(u || ''), ZAKLAD_WEBU);
      return decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase() || '/';
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

  function cislo(x) {
    if (x == null || x === '') return null;
    var n = Number(String(x).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function hlavniTyp(a) {
    var typy = (a && a.typy) || [];
    for (var i = 0; i < typy.length; i++) if (TYPY[typy[i]]) return typy[i];
    return 'ostatni';
  }

  // Obrázek karty: "zastupny" (z kalendar/doplnky.json) nebo chybějící obrázek → '' = zástupný obrázek
  function obrazekAkce(a, s) {
    var o = s && typeof s.obrazek === 'string' && s.obrazek ? s.obrazek : a.obrazek;
    if (!o || o === 'zastupny') return '';
    return bezpecnaUrl(o, a.url);
  }

  // ---------- Výběr akcí ----------
  // akce: pole z akce.json, souradnice: objekt "akce" ze souradnice.json (klíč = adresa článku)
  // misto: { lat, lon, kraj, pocet, okruh, dnes (Date), aktualni (adresa právě otevřené stránky) }
  function vyberAkce(akce, souradnice, misto) {
    souradnice = souradnice || {};
    var dnes = dnesniDen(misto.dnes);
    var pocet = Math.max(1, Math.min(12, Math.round(cislo(misto.pocet) || NASTAVENI.pocet)));
    var okruh = cislo(misto.okruh) || NASTAVENI.okruh;
    var lat = cislo(misto.lat);
    var lon = cislo(misto.lon);
    var maPolohu = lat != null && lon != null;
    var kraj = normalizujKraj(misto.kraj);
    var aktualni = misto.aktualni ? cestaClanku(misto.aktualni) : '';

    // Jeden článek = jedna karta (nejbližší termín)
    var podleClanku = {};
    var seznam = [];
    (akce || []).forEach(function (a) {
      if (!a || !a.nazev || !a.url || a.zruseno) return;
      var url = bezpecnaUrl(a.url);
      if (!url) return;
      var cesta = cestaClanku(url);
      if (aktualni && cesta === aktualni) return;
      var zacatek = den(a.zacatek);
      if (!zacatek) return;
      var konec = den(a.konec) || zacatek;
      if (konec < zacatek) konec = zacatek;
      if (konec < dnes) return; // už skončila
      var s = souradnice[a.url] || souradnice[url] || {};
      var km = null;
      if (maPolohu && cislo(s.lat) != null && cislo(s.lon) != null) km = vzdalenost(lat, lon, cislo(s.lat), cislo(s.lon));
      var polozka = {
        akce: a,
        url: url,
        zacatek: zacatek,
        konec: konec,
        razeni: zacatek < dnes ? dnes : zacatek, // probíhající akce se řadí jako „dnes“
        km: km,
        kraj: s.kraj || a.kraj || '',
        obrazek: obrazekAkce(a, s),
        typ: hlavniTyp(a)
      };
      var dosavadni = podleClanku[cesta];
      if (dosavadni) {
        if (polozka.razeni < dosavadni.razeni) seznam[seznam.indexOf(dosavadni)] = podleClanku[cesta] = polozka;
        return;
      }
      podleClanku[cesta] = polozka;
      seznam.push(polozka);
    });

    function podleData(x, y) {
      return (x.razeni - y.razeni) || ((x.km == null ? 1e9 : x.km) - (y.km == null ? 1e9 : y.km)) ||
        (x.zacatek - y.zacatek) || String(x.akce.nazev).localeCompare(String(y.akce.nazev), 'cs');
    }

    var blizke = seznam.filter(function (p) { return p.km != null && p.km <= okruh; });
    blizke.sort(podleData);
    var vybrane = blizke.slice(0, pocet);
    vybrane.forEach(function (p) { p.duvod = 'okruh'; });

    if (vybrane.length < pocet && kraj) {
      var zKraje = seznam.filter(function (p) {
        return vybrane.indexOf(p) < 0 && normalizujKraj(p.kraj) === kraj;
      });
      zKraje.sort(podleData);
      zKraje.slice(0, pocet - vybrane.length).forEach(function (p) { p.duvod = 'kraj'; vybrane.push(p); });
    }
    return vybrane.sort(podleData);
  }

  // Počet karet a sloupců tak, aby na PC nezůstala poloprázdná řada (4 = 2×2, 5 → 4, 7 → 6)
  function mrizka(n) {
    if (n <= 0) return { karet: 0, sloupcu: 0 };
    if (n <= 3) return { karet: n, sloupcu: n };
    if (n % 3 === 0 && n !== 4) return { karet: n, sloupcu: 3 };
    if (n % 2 === 0) return { karet: n, sloupcu: 2 };
    return mrizka(n - 1);
  }

  // ---------- Texty ----------
  function textData(p, dnes) {
    dnes = dnesniDen(dnes);
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

  function zastupnyObrazek(typ) {
    return '<span class="hsa-zastupny" role="img" aria-label="' + esc(TYPY[typ] || TYPY.ostatni) + '">' +
      '<span class="hsa-zastupny-kruh">' + ikona(typ) + '</span>' +
      '<span class="hsa-zastupny-znacka">Hravé stroje</span></span>';
  }

  function karta(p, dnes) {
    var a = p.akce;
    var obec = a.obec || '';
    var vzd = textVzdalenosti(p.km);
    var misto = [obec, vzd].filter(Boolean).join(' · ');
    return '<li class="hsa-polozka"><a class="hsa-karta" href="' + esc(p.url) + '">' +
      '<span class="hsa-obrazek" data-typ="' + esc(p.typ) + '">' +
        (p.obrazek ? '<img src="' + esc(p.obrazek) + '" alt="" loading="lazy" decoding="async">' : zastupnyObrazek(p.typ)) +
      '</span>' +
      '<span class="hsa-telo">' +
        '<span class="hsa-datum">' + ikona('kalendar') + '<span>' + esc(textData(p, dnes)) + '</span></span>' +
        '<span class="hsa-nazev">' + esc(a.nazev) + '</span>' +
        (misto ? '<span class="hsa-misto">' + ikona('misto') + '<span>' + esc(misto) + '</span></span>' : '') +
        '<span class="hsa-vice">Detail akce' + ikona('sipka') + '</span>' +
      '</span></a></li>';
  }

  function sestavHtml(vybrane, moznosti) {
    var m = mrizka(vybrane.length);
    if (!m.karet) return '';
    return '<div class="hsa-obal">' +
      '<p class="hsa-nadpis">' + ikona('misto') + '<span>' + esc(moznosti.nadpis || NASTAVENI.nadpis) + '</span></p>' +
      '<ul class="hsa-mrizka hsa-mrizka--' + m.sloupcu + '">' +
        vybrane.slice(0, m.karet).map(function (p) { return karta(p, moznosti.dnes); }).join('') +
      '</ul>' +
      '<p class="hsa-paticka"><a class="hsa-odkaz" href="' + esc(moznosti.kalendar) + '">Všechny akce v kalendáři' + ikona('sipka') + '</a></p>' +
      '</div>';
  }

  // ---------- Styly (jen uvnitř bloku, aby se nepraly se šablonou Shoptetu) ----------
  var CSS =
    '.hs-akce-v-okoli{--hsa-zelena:#1f6f3d;--hsa-zelena-tmava:#16532d;--hsa-zelena-svetla:#e6f1ea;--hsa-cihlova:#c0392b;' +
      '--hsa-text:#1d2420;--hsa-tlumeny:#59635d;--hsa-okraj:#dfe3dd;container-type:inline-size;margin:28px 0;clear:both}' +
    '.hs-akce-v-okoli[hidden]{display:none!important}' +
    '.hs-akce-v-okoli .hsa-obal{font-family:inherit;color:var(--hsa-text);line-height:1.4}' +
    '.hs-akce-v-okoli .hsa-ikona{width:1.1em;height:1.1em;flex:none;vertical-align:-.15em}' +
    '.hs-akce-v-okoli .hsa-nadpis{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:1.35em;font-weight:700;color:var(--hsa-zelena-tmava)}' +
    '.hs-akce-v-okoli .hsa-nadpis .hsa-ikona{color:var(--hsa-cihlova)}' +
    '.hs-akce-v-okoli .hsa-mrizka{list-style:none;margin:0;padding:0;display:grid;gap:16px;grid-template-columns:1fr}' +
    '.hs-akce-v-okoli .hsa-polozka{margin:0;padding:0;list-style:none;display:flex}' +
    '.hs-akce-v-okoli .hsa-polozka::before,.hs-akce-v-okoli .hsa-polozka::marker{content:none;display:none}' +
    '.hs-akce-v-okoli .hsa-karta{display:flex;flex-direction:column;width:100%;background:#fff;border:1px solid var(--hsa-okraj);' +
      'border-radius:14px;overflow:hidden;text-decoration:none;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 14px rgba(0,0,0,.06);' +
      'transition:transform .15s ease,box-shadow .15s ease}' +
    '.hs-akce-v-okoli .hsa-karta:hover{transform:translateY(-2px);box-shadow:0 2px 4px rgba(0,0,0,.08),0 10px 24px rgba(0,0,0,.1)}' +
    '.hs-akce-v-okoli .hsa-karta:focus-visible{outline:3px solid var(--hsa-cihlova);outline-offset:2px}' +
    '.hs-akce-v-okoli .hsa-obrazek{display:block;position:relative;aspect-ratio:16/9;background:var(--hsa-zelena-svetla);overflow:hidden}' +
    '.hs-akce-v-okoli .hsa-obrazek img{display:block;width:100%;height:100%;max-width:none;object-fit:cover;margin:0;border:0}' +
    '.hs-akce-v-okoli .hsa-zastupny{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;' +
      'background:linear-gradient(135deg,var(--hsa-zelena) 0%,var(--hsa-zelena-tmava) 100%);color:#fff}' +
    '.hs-akce-v-okoli .hsa-zastupny-kruh{display:flex;align-items:center;justify-content:center;width:34%;max-width:96px;aspect-ratio:1;' +
      'border-radius:50%;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.35)}' +
    '.hs-akce-v-okoli .hsa-zastupny-kruh .hsa-ikona{width:56%;height:56%;stroke-width:1.5}' +
    '.hs-akce-v-okoli .hsa-zastupny-znacka{font-size:.75em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.9}' +
    '.hs-akce-v-okoli .hsa-telo{display:flex;flex-direction:column;gap:6px;padding:12px 14px 14px;flex:1}' +
    '.hs-akce-v-okoli .hsa-datum{display:flex;align-items:center;gap:6px;font-size:.85em;font-weight:700;color:var(--hsa-cihlova);text-transform:none}' +
    '.hs-akce-v-okoli .hsa-nazev{font-size:1.05em;font-weight:700;color:var(--hsa-text);line-height:1.3}' +
    '.hs-akce-v-okoli .hsa-misto{display:flex;align-items:center;gap:6px;font-size:.9em;color:var(--hsa-tlumeny)}' +
    '.hs-akce-v-okoli .hsa-misto .hsa-ikona{color:var(--hsa-zelena)}' +
    '.hs-akce-v-okoli .hsa-vice{display:flex;align-items:center;gap:4px;margin-top:auto;padding-top:4px;font-size:.9em;font-weight:700;color:var(--hsa-zelena)}' +
    '.hs-akce-v-okoli .hsa-karta:hover .hsa-vice{text-decoration:underline}' +
    '.hs-akce-v-okoli .hsa-paticka{margin:16px 0 0;text-align:center}' +
    '.hs-akce-v-okoli .hsa-odkaz{display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:999px;' +
      'background:var(--hsa-zelena);color:#fff;font-weight:700;text-decoration:none}' +
    '.hs-akce-v-okoli .hsa-odkaz:hover{background:var(--hsa-zelena-tmava);color:#fff}' +
    '@media (min-width:600px){' +
      '.hs-akce-v-okoli .hsa-mrizka--2{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      '.hs-akce-v-okoli .hsa-mrizka--3{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '@container (max-width:559px){.hs-akce-v-okoli .hsa-mrizka.hsa-mrizka--2,.hs-akce-v-okoli .hsa-mrizka.hsa-mrizka--3{grid-template-columns:1fr}}' +
    '@container (min-width:560px) and (max-width:759px){.hs-akce-v-okoli .hsa-mrizka.hsa-mrizka--3{grid-template-columns:1fr}}' +
    '@media (prefers-reduced-motion:reduce){.hs-akce-v-okoli .hsa-karta{transition:none}.hs-akce-v-okoli .hsa-karta:hover{transform:none}}';

  // ---------- Prohlížeč ----------
  function spust(okno) {
    var doc = okno.document;
    if (!doc || !doc.querySelectorAll) return;
    var skript = doc.currentScript;
    var adresaSkriptu = skript && skript.src ? skript.src : '';
    var hledani = okno.location ? okno.location.search : '';
    if (/[?&]hs-akce=vypnout/.test(hledani)) return;

    // Pro test na živém webu: ?hs-akce-dnes=2026-12-01 (chová se, jako by byl ten den)
    var testDnes = /[?&]hs-akce-dnes=(\d{4}-\d{2}-\d{2})/.exec(hledani);
    var dnes = (testDnes && den(testDnes[1])) || new Date();

    function vedleSkriptu(relativni) {
      return adresaSkriptu ? new URL(relativni, adresaSkriptu).href : '';
    }

    function nacti(url) {
      var predano = okno.HS_AKCE_V_OKOLI_DATA; // ukázková data pro demo stránku
      if (predano && typeof predano === 'object') {
        return Promise.resolve(url === 'akce' ? predano.akce : predano.souradnice);
      }
      var adresa = url === 'akce'
        ? NASTAVENI.akce || vedleSkriptu('../kalendar/akce.json')
        : NASTAVENI.souradnice || vedleSkriptu('souradnice.json');
      if (!adresa || !okno.fetch) return Promise.resolve(null);
      var ovladac = okno.AbortController ? new okno.AbortController() : null;
      var casovac = ovladac ? setTimeout(function () { ovladac.abort(); }, NASTAVENI.casovyLimit) : null;
      return okno.fetch(adresa, { credentials: 'omit', mode: 'cors', signal: ovladac ? ovladac.signal : undefined })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (d) { if (casovac) clearTimeout(casovac); return d; });
    }

    function vykresli(bloky) {
      Promise.all([nacti('akce'), nacti('souradnice')]).then(function (data) {
        var akce = data[0] && (Array.isArray(data[0]) ? data[0] : data[0].akce);
        var souradnice = (data[1] && data[1].akce) || {};
        var kalendar = NASTAVENI.kalendar || vedleSkriptu('../kalendar/') || 'https://hravestroje.github.io/hravestroje-web/kalendar/';
        if (!doc.getElementById('hs-akce-v-okoli-css')) {
          var styl = doc.createElement('style');
          styl.id = 'hs-akce-v-okoli-css';
          styl.textContent = CSS;
          (doc.head || doc.documentElement).appendChild(styl);
        }
        for (var i = 0; i < bloky.length; i++) {
          var el = bloky[i];
          var vybrane = Array.isArray(akce) ? vyberAkce(akce, souradnice, {
            lat: el.getAttribute('data-lat'),
            lon: el.getAttribute('data-lon'),
            kraj: el.getAttribute('data-kraj'),
            pocet: el.getAttribute('data-pocet'),
            okruh: el.getAttribute('data-okruh'),
            dnes: dnes,
            aktualni: el.getAttribute('data-vynechat') || okno.location.href
          }) : [];
          var html = sestavHtml(vybrane, {
            nadpis: el.getAttribute('data-nadpis'),
            kalendar: el.getAttribute('data-kalendar') || kalendar,
            dnes: dnes
          });
          if (!html) { el.hidden = true; el.innerHTML = ''; continue; }
          el.innerHTML = html;
          el.hidden = false;
          // Obrázek, který se nenačte, nahradí zástupný obrázek s ikonou typu
          var obrazky = el.querySelectorAll('.hsa-obrazek img');
          for (var j = 0; j < obrazky.length; j++) {
            obrazky[j].addEventListener('error', function () {
              var obal = this.parentNode;
              if (obal) obal.innerHTML = zastupnyObrazek(obal.getAttribute('data-typ'));
            });
          }
          el.setAttribute('data-hs-hotovo', '1');
        }
      });
    }

    function start() {
      var bloky = doc.querySelectorAll('.hs-akce-v-okoli:not([data-hs-hotovo])');
      if (!bloky.length) return;
      // Dokud se nenačte, blok nic neukazuje (žádné poskakování prázdného rámečku).
      for (var i = 0; i < bloky.length; i++) bloky[i].hidden = true;
      vykresli(bloky);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return {
    NASTAVENI: NASTAVENI,
    vzdalenost: vzdalenost,
    textVzdalenosti: textVzdalenosti,
    cestaClanku: cestaClanku,
    obrazekAkce: obrazekAkce,
    vyberAkce: vyberAkce,
    mrizka: mrizka,
    textData: textData,
    sestavHtml: sestavHtml,
    zastupnyObrazek: zastupnyObrazek,
    spust: spust
  };
});
