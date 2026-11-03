/*! hs-darky.js – aktuální produkty z e-shopu v článcích hravestroje.cz
 * Najde <div class="hs-darky" data-tema="vlaky">…</div>, načte produkty.json
 * a místo původního obsahu vykreslí karty produktů. Když se cokoli nepovede,
 * původní (statický) obsah divu zůstane beze změny. Bez knihoven.
 */
(function () {
  'use strict';

  // ---- NASTAVENÍ ---------------------------------------------------------
  var NASTAVENI = {
    data: '',              // adresa produkty.json; prázdné = stejná složka jako tento skript
    pocet: 8,              // kolik karet vykreslit (lze změnit atributem data-pocet)
    minimum: 4,            // když se najde méně produktů, nechá se původní obsah
    tlacitko: 'Prohlédnout',
    doplnit: true,         // málo produktů k tématu → doplnit jinými (vypnete data-doplnit="ne")
    casovyLimit: 8000      // ms; pak to vzdáme a necháme původní obsah
  };
  // ------------------------------------------------------------------------

  var skript = document.currentScript;
  var parametry = location.search;

  if (/[?&]hs-darky=vypnout/.test(parametry)) return; // pro porovnání se statickým obsahem
  if (!window.JSON || !document.querySelectorAll || ![].forEach) return;

  function adresaDat() {
    if (typeof window.HS_DARKY_DATA === 'string') return window.HS_DARKY_DATA;
    if (NASTAVENI.data) return NASTAVENI.data;
    var src = skript && skript.src;
    return src ? src.replace(/[^\/?#]*([?#].*)?$/, '') + 'produkty.json' : '';
  }

  function nactiData(hotovo) {
    if (window.HS_DARKY_DATA && typeof window.HS_DARKY_DATA === 'object') {
      return hotovo(window.HS_DARKY_DATA);
    }
    var url = adresaDat();
    if (!url) return;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = NASTAVENI.casovyLimit;
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var data;
      try { data = JSON.parse(xhr.responseText); } catch (e) { return; }
      if (data && data.produkty && data.produkty.length) hotovo(data);
    };
    xhr.send();
  }

  // Náhodné pořadí, které je pro stejný den a stejnou stránku pořád stejné.
  function nahoda(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function zamichej(pole, rnd) {
    for (var i = pole.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), x = pole[i];
      pole[i] = pole[j]; pole[j] = x;
    }
    return pole;
  }

  function ma(p, temata) {
    for (var i = 0; i < temata.length; i++) if ((p.temata || []).indexOf(temata[i]) > -1) return true;
    return false;
  }

  function aktualniMesic() {
    var m = /[?&]hs-mesic=(\d{1,2})/.exec(parametry); // test: ?hs-mesic=11
    return m ? +m[1] : new Date().getMonth() + 1;
  }

  // Vybere produkty pro jeden box podle tématu a sezóny.
  function vyber(data, temata, pocet, doplnit, rnd) {
    var mesic = aktualniMesic(), vSezone = [], mimoSezonu = [];
    (data.sezony || []).forEach(function (s) {
      ((s.mesice || []).indexOf(mesic) > -1 ? vSezone : mimoSezonu).push(s.tema);
    });
    // mimo sezónu se sezónní produkty neukazují (pokud o ně box výslovně nežádá)
    var zakazane = mimoSezonu.filter(function (t) { return temata.indexOf(t) < 0; });

    var kandidati = data.produkty.filter(function (p) {
      return p.skladem && p.nazev && /^https?:\/\//.test(p.url) && !ma(p, zakazane);
    });

    var skupiny = temata.length
      ? [
          function (p) { return ma(p, temata) && ma(p, vSezone); }, // téma + sezóna
          function (p) { return ma(p, temata); },                  // téma
          function (p) { return doplnit && ma(p, vSezone); },      // doplnění: sezóna
          function () { return doplnit; }                           // doplnění: cokoli
        ]
      : [
          function (p) { return ma(p, vSezone); },                 // sezóna
          function () { return true; }                              // celoroční
        ];

    var vybrane = [], pouzite = {};
    skupiny.forEach(function (patri) {
      var skupina = zamichej(kandidati.filter(function (p) {
        return !pouzite[p.url] && patri(p);
      }), rnd);
      skupina.forEach(function (p) {
        if (vybrane.length < pocet) { vybrane.push(p); pouzite[p.url] = 1; }
      });
    });
    return vybrane;
  }

  function cena(castka, mena) {
    try {
      return new Intl.NumberFormat('cs-CZ', {
        style: 'currency', currency: mena || 'CZK',
        minimumFractionDigits: castka % 1 ? 2 : 0, maximumFractionDigits: 2
      }).format(castka);
    } catch (e) { return castka + ' Kč'; }
  }

  function prvek(znacka, trida, text) {
    var el = document.createElement(znacka);
    if (trida) el.className = trida;
    if (text != null) el.textContent = text;
    return el;
  }

  function odkaz(url, trida, text) {
    var a = prvek('a', trida, text);
    a.href = url;
    return a;
  }

  function karta(p, mena) {
    var k = prvek('div', 'hs-darky-karta');

    var obr = odkaz(p.url, 'hs-darky-obr');
    if (p.obrazek && /^https?:\/\//.test(p.obrazek)) {
      var img = prvek('img');
      img.src = p.obrazek;
      img.alt = p.nazev;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () { obr.removeChild(img); };
      obr.appendChild(img);
    }
    k.appendChild(obr);

    k.appendChild(odkaz(p.url, 'hs-darky-nazev', p.nazev));

    var c = prvek('div', 'hs-darky-cena');
    if (p.puvodni_cena > p.cena) {
      c.appendChild(prvek('del', '', cena(p.puvodni_cena, mena)));
      c.appendChild(document.createTextNode(' '));
    }
    c.appendChild(prvek('strong', '', cena(p.cena, mena)));
    k.appendChild(c);

    k.appendChild(odkaz(p.url, 'hs-darky-tlacitko btn btn-primary', NASTAVENI.tlacitko));
    return k;
  }

  var CSS =
    '.hs-darky-mrizka{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:16px 0}' +
    '@media(max-width:991px){.hs-darky-mrizka{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '@media(max-width:767px){.hs-darky-mrizka{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}}' +
    '.hs-darky-karta{display:flex;flex-direction:column;text-align:center;background:#fff;border:1px solid #e6e6e6;border-radius:8px;padding:10px}' +
    '.hs-darky-obr{display:block;aspect-ratio:1/1;margin-bottom:8px;background:#f6f6f6;border-radius:6px;overflow:hidden}' +
    '.hs-darky-obr img{width:100%;height:100%;object-fit:contain;display:block;margin:0}' +
    '.hs-darky-nazev{flex:1;font-weight:600;line-height:1.3;color:inherit;text-decoration:none;margin-bottom:6px}' +
    '.hs-darky-nazev:hover{text-decoration:underline}' +
    '.hs-darky-cena{margin-bottom:8px}.hs-darky-cena strong{font-size:1.15em}.hs-darky-cena del{opacity:.6;font-size:.9em}' +
    '.hs-darky-tlacitko{display:block;width:100%;text-decoration:none}';

  function pridejCss() {
    if (document.getElementById('hs-darky-css')) return;
    var s = prvek('style', '', CSS);
    s.id = 'hs-darky-css';
    (document.head || document.documentElement).appendChild(s);
  }

  // data-tema="vlaky", "vlaky auta", "vlaky|vanoce" nebo třída hs-darky--vlaky
  function temataBoxu(box) {
    var t = (box.getAttribute('data-tema') || '').toLowerCase();
    var m = (' ' + box.className + ' ').match(/ hs-darky--[a-z0-9_-]+(?= )/g) || [];
    m.forEach(function (x) { t += ' ' + x.slice(11); });
    return t.split(/[\s,|;]+/).filter(Boolean);
  }

  function vykresli(box, data, index) {
    if (box.getAttribute('data-hs-hotovo')) return;
    var pocet = parseInt(box.getAttribute('data-pocet'), 10) || NASTAVENI.pocet;
    var doplnit = NASTAVENI.doplnit && box.getAttribute('data-doplnit') !== 'ne';
    var temata = temataBoxu(box);
    var den = new Date().toISOString().slice(0, 10);
    var rnd = nahoda(den + location.pathname + index + temata.join());

    var produkty = vyber(data, temata, pocet, doplnit, rnd);
    if (produkty.length < Math.min(NASTAVENI.minimum, pocet)) return; // necháme statický obsah

    var mrizka = prvek('div', 'hs-darky-mrizka');
    produkty.forEach(function (p) { mrizka.appendChild(karta(p, data.mena)); });

    pridejCss();
    box.innerHTML = '';
    box.appendChild(mrizka);
    box.setAttribute('data-hs-hotovo', '1');
  }

  function start() {
    var boxy = document.querySelectorAll('div.hs-darky');
    if (!boxy.length) return;
    nactiData(function (data) {
      [].forEach.call(boxy, function (box, i) {
        try { vykresli(box, data, i); } catch (e) { /* box zůstane statický */ }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
