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
    pocet: 6,              // kolik karet vykreslit (lze změnit atributem data-pocet)
    minimum: 4,            // když se najde méně produktů, nechá se původní obsah
    tlacitko: 'Prohlédnout',
    stitek: 'Ukázka obsahu uvnitř', // štítek u produktů s ručním náhledem (nahledy.json)
    maxObrazku: 5,         // kolik obrázků jde na mobilu prolistovat
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

  function obrazkyProduktu(p) {
    var seznam = (p.obrazky && p.obrazky.length ? p.obrazky : [p.obrazek]).filter(function (o) {
      return typeof o === 'string' && /^https?:\/\//.test(o);
    });
    return seznam.filter(function (o, i) { return seznam.indexOf(o) === i; });
  }

  // PC s myší: 2. obrázek po najetí; dotyk: listování (tečky a šipky)
  var mys = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);

  function obrazek(src, alt, prvni) {
    var img = prvek('img');
    img.alt = alt;
    img.width = 800;  // rozměry 4:3 předem → stránka při načítání neposkakuje
    img.height = 600;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.onerror = function () { img.style.visibility = 'hidden'; };
    img.src = src;
    if (!prvni) img.setAttribute('aria-hidden', 'true');
    return img;
  }

  function listovani(foto, pas, pocet) {
    var tecky = prvek('div', 'hs-darky-tecky'), aktivni = 0;
    for (var i = 0; i < pocet; i++) tecky.appendChild(prvek('span', i ? '' : 'hs-aktivni'));
    tecky.setAttribute('aria-hidden', 'true');

    function nastav(i) {
      if (i === aktivni || i < 0 || i >= pocet) return;
      tecky.children[aktivni].className = '';
      tecky.children[i].className = 'hs-aktivni';
      aktivni = i;
    }
    var cil = null, hodiny;
    function jdiNa(i) {
      i = (i + pocet) % pocet;
      cil = i; // během plynulého posunu ignorujeme mezipolohy (rychlé klikání na šipky)
      clearTimeout(hodiny);
      hodiny = setTimeout(function () { cil = null; }, 700);
      nastav(i);
      if (pas.scrollTo) pas.scrollTo({ left: i * pas.clientWidth, behavior: 'smooth' });
      else pas.scrollLeft = i * pas.clientWidth;
    }
    function sipka(trida, popis, smer) {
      var b = prvek('button', 'hs-darky-sipka ' + trida, smer < 0 ? '‹' : '›');
      b.type = 'button';
      b.setAttribute('aria-label', popis);
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); jdiNa(aktivni + smer); };
      return b;
    }
    pas.addEventListener('scroll', function () {
      var i = Math.round(pas.scrollLeft / (pas.clientWidth || 1));
      if (cil !== null) { if (i === cil) cil = null; return; }
      nastav(i);
    }, { passive: true });

    foto.appendChild(sipka('hs-darky-sipka--zpet', 'Předchozí obrázek', -1));
    foto.appendChild(sipka('hs-darky-sipka--dal', 'Další obrázek', 1));
    foto.appendChild(tecky);
  }

  function karta(p, mena) {
    var k = prvek('div', 'hs-darky-karta');
    var obrazky = obrazkyProduktu(p).slice(0, mys ? 2 : NASTAVENI.maxObrazku);

    var foto = prvek('div', 'hs-darky-foto');
    var obr = odkaz(p.url, 'hs-darky-obr');
    obr.setAttribute('aria-label', p.nazev);
    var pas = prvek('div', 'hs-darky-pas');
    obrazky.forEach(function (src, i) { pas.appendChild(obrazek(src, i ? '' : p.nazev, !i)); });
    obr.appendChild(pas);
    foto.appendChild(obr);

    if (obrazky.length > 1) {
      k.className += ' hs-darky-karta--vice';
      if (!mys) listovani(foto, pas, obrazky.length);
    }
    if (p.nahled && obrazky.length > 1) foto.appendChild(prvek('span', 'hs-darky-stitek', NASTAVENI.stitek));
    k.appendChild(foto);

    var telo = prvek('div', 'hs-darky-telo');
    telo.appendChild(odkaz(p.url, 'hs-darky-nazev', p.nazev));

    var c = prvek('div', 'hs-darky-cena');
    if (p.puvodni_cena > p.cena) {
      c.appendChild(prvek('del', '', cena(p.puvodni_cena, mena)));
      c.appendChild(document.createTextNode(' '));
    }
    c.appendChild(prvek('strong', '', cena(p.cena, mena)));
    telo.appendChild(c);

    telo.appendChild(odkaz(p.url, 'hs-darky-tlacitko', NASTAVENI.tlacitko));
    k.appendChild(telo);
    return k;
  }

  // Kolik sloupců: nejvýš 3, poslední řada vždy plná (4 = 2×2, 6 = 3×2, 8 = 2×4).
  function sloupce(pocet) {
    if (pocet <= 3) return pocet;
    return pocet % 3 === 0 ? 3 : 2;
  }

  var ZELENA = '#1f6f3d';
  var CSS =
    '.hs-darky-mrizka{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:20px 0}' +
    '.hs-darky-mrizka--1{grid-template-columns:minmax(0,420px)}' +
    '.hs-darky-mrizka--2{grid-template-columns:repeat(2,minmax(0,1fr))}' +
    '@media(max-width:639px){.hs-darky-mrizka,.hs-darky-mrizka--1,.hs-darky-mrizka--2{grid-template-columns:minmax(0,1fr);gap:16px}}' +
    '.hs-darky-karta{display:flex;flex-direction:column;background:#fff;border:1px solid #e6e6e6;border-radius:12px;overflow:hidden;' +
      'box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .2s,transform .2s;text-align:left}' +
    '.hs-darky-foto{position:relative;aspect-ratio:4/3;background:#f3f1ed;overflow:hidden}' +
    '.hs-darky-obr,.hs-darky-pas{display:block;width:100%;height:100%}' +
    '.hs-darky-pas img{display:block;width:100%;height:100%;object-fit:cover;margin:0;max-width:none;border:0;border-radius:0}' +
    // PC s myší: obrázky přes sebe, po najetí plynule 2. obrázek
    '@media(hover:hover) and (pointer:fine){' +
      '.hs-darky-karta:hover{box-shadow:0 6px 18px rgba(0,0,0,.12);transform:translateY(-2px)}' +
      '.hs-darky-pas{position:relative}' +
      '.hs-darky-pas img{position:absolute;inset:0;transition:opacity .45s ease,transform .6s ease}' +
      '.hs-darky-pas img+img{opacity:0}' +
      '.hs-darky-karta--vice:hover .hs-darky-pas img+img{opacity:1}' +
      '.hs-darky-karta:hover .hs-darky-pas img{transform:scale(1.03)}' +
      '.hs-darky-sipka,.hs-darky-tecky{display:none}' +
    '}' +
    // dotyk: vodorovné listování prstem (scroll-snap), tečky a šipky
    '@media not all and (hover:hover) and (pointer:fine){' +
      '.hs-darky-pas{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}' +
      '.hs-darky-pas::-webkit-scrollbar{display:none}' +
      '.hs-darky-pas img{flex:0 0 100%;scroll-snap-align:start}' +
    '}' +
    '.hs-darky-sipka{position:absolute;top:50%;margin-top:-17px;width:34px;height:34px;padding:0;border:0;border-radius:50%;' +
      'background:rgba(255,255,255,.9);color:#222;font:700 24px/32px sans-serif;text-align:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}' +
    '.hs-darky-sipka--zpet{left:8px}.hs-darky-sipka--dal{right:8px}' +
    '.hs-darky-tecky{position:absolute;left:0;right:0;bottom:8px;display:flex;justify-content:center;gap:6px;pointer-events:none}' +
    '.hs-darky-tecky span{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.65);box-shadow:0 0 2px rgba(0,0,0,.5);transition:background .2s,transform .2s}' +
    '.hs-darky-tecky .hs-aktivni{background:#fff;transform:scale(1.3)}' +
    '.hs-darky-stitek{position:absolute;top:10px;left:10px;padding:4px 10px;border-radius:999px;background:' + ZELENA + ';color:#fff;' +
      'font-size:13px;font-weight:700;line-height:1.3;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.2)}' +
    '.hs-darky-telo{display:flex;flex-direction:column;flex:1;padding:14px 16px 16px}' +
    '.hs-darky-nazev{flex:1;font-size:1.05em;font-weight:700;line-height:1.3;color:inherit;text-decoration:none;margin-bottom:8px}' +
    '.hs-darky-nazev:hover{text-decoration:underline}' +
    '.hs-darky-cena{margin-bottom:12px}.hs-darky-cena strong{font-size:1.3em}.hs-darky-cena del{opacity:.6;font-size:.9em;margin-right:4px}' +
    '.hs-darky a.hs-darky-tlacitko{display:block;width:100%;box-sizing:border-box;padding:12px 16px;border-radius:8px;background:' + ZELENA + ';' +
      'color:#fff;font-weight:700;font-size:1.05em;text-align:center;text-decoration:none;transition:background .2s}' +
    '.hs-darky a.hs-darky-tlacitko:hover,.hs-darky a.hs-darky-tlacitko:focus{background:#175a2f;color:#fff}' +
    '@media (prefers-reduced-motion:reduce){.hs-darky-karta,.hs-darky-pas img{transition:none!important;transform:none!important}}';

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

    // poslední řada bez díry: 5 → 4 (2×2), 7 → 6 (3×2)
    if (produkty.length > 3 && produkty.length % 2 && produkty.length % 3) produkty = produkty.slice(0, -1);

    var mrizka = prvek('div', 'hs-darky-mrizka hs-darky-mrizka--' + sloupce(produkty.length));
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
