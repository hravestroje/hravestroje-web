/*! hs-nabidky.js – tipy na výlet (reklamní nabídky partnerů) v článcích hravestroje.cz
 * Najde <div class="hs-nabidky" data-kraj="Královéhradecký kraj" data-typ="vlaky" data-pocet="4"></div>,
 * načte nabidky.json a vykreslí karty nabídek. Když nic nesedí nebo se data nenačtou,
 * blok zůstane skrytý (žádné prázdné místo). Bez cookies a bez cizích knihoven.
 */
(function () {
  'use strict';

  // ---- NASTAVENÍ ---------------------------------------------------------
  var NASTAVENI = {
    data: 'https://hravestroje.github.io/hravestroje-web/nabidky/nabidky.json',
    pocet: 4,              // výchozí počet karet (lze změnit atributem data-pocet)
    maxPocet: 9,
    nadpis: 'Tip na výlet (reklama)',
    tlacitko: 'Zobrazit nabídku',
    utm: { utm_source: 'hravestroje', utm_medium: 'clanek' },
    casovyLimit: 8000      // ms; pak to vzdáme a blok zůstane skrytý
  };

  var ZDROJE = { slevomat: 'Slevomat', booking: 'Booking.com', zazitky: 'Zážitky', jine: '' };
  // ------------------------------------------------------------------------

  function text(x) { return typeof x === 'string' ? x.trim() : ''; }
  function male(x) { return text(x).toLowerCase(); }

  function dnesniDatum(d) {
    d = d || new Date();
    function dve(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + dve(d.getMonth() + 1) + '-' + dve(d.getDate());
  }

  // Nabídka se smí ukázat: není ukázka, má název a https odkaz a neprošla (platnost_do včetně).
  function platna(n, dnes) {
    if (!n || n.ukazka) return false;
    if (!text(n.nazev) || !/^https:\/\//i.test(text(n.url))) return false;
    var konec = text(n.platnost_do);
    if (konec && /^\d{4}-\d{2}-\d{2}$/.test(konec) && konec < dnes) return false;
    return true;
  }

  function seznam(x) {
    if (typeof x === 'string') x = [x];
    return (x || []).map(male).filter(Boolean);
  }

  function celostatni(n) {
    var k = seznam(n.kraje);
    return !k.length || k.indexOf('vse') > -1 || k.indexOf('celá čr') > -1;
  }

  /* Vybere nabídky pro jeden blok v tomto pořadí:
   *  1) kraj + typ   2) kraj + „vse“   3) celostátní + typ   4) celostátní + „vse“
   * Uvnitř skupiny zachová pořadí ze souboru nabidky.json. */
  function vyber(nabidky, kraj, typ, pocet, dnes) {
    kraj = male(kraj);
    typ = male(typ) || 'vse';
    var kandidati = (nabidky || []).filter(function (n) { return platna(n, dnes); });
    function vKraji(n) { return !!kraj && seznam(n.kraje).indexOf(kraj) > -1; }
    function maTyp(t) { return function (n) { return seznam(n.typy).indexOf(t) > -1; }; }
    var skupiny = [
      function (n) { return vKraji(n) && maTyp(typ)(n); },
      function (n) { return vKraji(n) && maTyp('vse')(n); },
      function (n) { return celostatni(n) && maTyp(typ)(n); },
      function (n) { return celostatni(n) && maTyp('vse')(n); }
    ];
    var vybrane = [], pouzite = [];
    skupiny.forEach(function (patri) {
      kandidati.forEach(function (n) {
        if (vybrane.length < pocet && pouzite.indexOf(n) < 0 && patri(n)) {
          vybrane.push(n); pouzite.push(n);
        }
      });
    });
    return vybrane;
  }

  /* Kolik karet a sloupců na PC, aby poslední řada nebyla poloprázdná:
   * 1–3 vedle sebe, 4 = 2×2, 5 → 4 (2×2), 6 = 3×2, 7 → 6, 8 = 2×4, 9 = 3×3. */
  function rozlozeni(pocet) {
    while (pocet > 0) {
      if (pocet <= 3) return { pocet: pocet, sloupce: pocet };
      if (pocet % 3 === 0) return { pocet: pocet, sloupce: 3 };
      if (pocet % 2 === 0) return { pocet: pocet, sloupce: 2 };
      pocet--;
    }
    return { pocet: 0, sloupce: 0 };
  }

  function sUtm(url) {
    var hash = '', i = url.indexOf('#');
    if (i > -1) { hash = url.slice(i); url = url.slice(0, i); }
    var klice = Object.keys(NASTAVENI.utm);
    klice.forEach(function (k) {
      url = url.replace(new RegExp('([?&])' + k + '=[^&]*(&|$)'), function (_, a, b) { return b ? a : ''; });
    });
    url = url.replace(/[?&]$/, '');
    var dotaz = klice.map(function (k) { return k + '=' + encodeURIComponent(NASTAVENI.utm[k]); }).join('&');
    return url + (url.indexOf('?') > -1 ? '&' : '?') + dotaz + hash;
  }

  var api = { vyber: vyber, rozlozeni: rozlozeni, platna: platna, sUtm: sUtm, dnesniDatum: dnesniDatum };
  if (typeof module === 'object' && module.exports) module.exports = api; // testy v Node.js
  if (typeof document === 'undefined') return;
  if (!window.JSON || !document.querySelectorAll || ![].forEach) return;
  var parametry = location.search;
  if (/[?&]hs-nabidky=vypnout/.test(parametry)) return;

  function prvek(znacka, trida, obsah) {
    var el = document.createElement(znacka);
    if (trida) el.className = trida;
    if (obsah != null) el.textContent = obsah;
    return el;
  }

  function odkaz(url, trida, obsah) {
    var a = prvek('a', trida, obsah);
    a.href = url;
    a.target = '_blank';
    a.rel = 'sponsored nofollow noopener';
    return a;
  }

  function karta(n) {
    var url = sUtm(text(n.url));
    var k = prvek('div', 'hs-nabidky-karta');
    var obrazek = text(n.obrazek);
    if (/^(https:\/\/|data:image\/)/i.test(obrazek)) {
      var obr = odkaz(url, 'hs-nabidky-obr');
      obr.setAttribute('tabindex', '-1');
      obr.setAttribute('aria-hidden', 'true');
      var img = prvek('img');
      img.src = obrazek;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = function () { if (obr.parentNode) obr.parentNode.removeChild(obr); };
      obr.appendChild(img);
      k.appendChild(obr);
    }
    var telo = prvek('div', 'hs-nabidky-telo');
    var zdroj = ZDROJE[male(n.zdroj)];
    if (zdroj) telo.appendChild(prvek('div', 'hs-nabidky-zdroj', zdroj));
    telo.appendChild(odkaz(url, 'hs-nabidky-nazev', text(n.nazev)));
    if (text(n.popis)) telo.appendChild(prvek('p', 'hs-nabidky-popis', text(n.popis)));
    telo.appendChild(odkaz(url, 'hs-nabidky-tlacitko', NASTAVENI.tlacitko));
    k.appendChild(telo);
    return k;
  }

  var ZELENA = '#1f6f3d', CIHLOVA = '#c0392b';
  var CSS =
    'div.hs-nabidky:not([data-hs-hotovo]){display:none!important}' +
    '.hs-nabidky{margin:24px 0;padding:16px;background:#f4f8f5;border:1px solid #d5e4da;border-top:4px solid ' + ZELENA + ';border-radius:10px}' +
    '.hs-nabidky-stitek{margin:0 0 12px;font-size:.8em;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + ZELENA + '}' +
    '.hs-nabidky-mrizka{display:grid;gap:16px;grid-template-columns:repeat(var(--hs-sloupce,2),minmax(0,1fr))}' +
        '.hs-nabidky-karta{display:flex;flex-direction:column;background:#fff;border:1px solid #e3e3e3;border-radius:8px;overflow:hidden}' +
    '.hs-nabidky-obr{display:block;aspect-ratio:16/9;background:#e9efe9}' +
    '.hs-nabidky-obr img{width:100%;height:100%;object-fit:cover;display:block;margin:0}' +
    '.hs-nabidky-telo{display:flex;flex-direction:column;flex:1;padding:12px 14px 14px}' +
    '.hs-nabidky-zdroj{font-size:.75em;color:#6b6b6b;margin-bottom:4px}' +
    '.hs-nabidky-nazev{font-weight:700;line-height:1.3;color:' + ZELENA + ';text-decoration:none}' +
    '.hs-nabidky-nazev:hover{text-decoration:underline}' +
    '.hs-nabidky-popis{flex:1;margin:6px 0 12px;font-size:.92em;line-height:1.45;color:#3a3a3a}' +
    '.hs-nabidky-tlacitko{display:block;margin-top:auto;padding:9px 12px;border-radius:6px;background:' + CIHLOVA + ';color:#fff!important;font-weight:700;text-align:center;text-decoration:none}' +
    '.hs-nabidky-tlacitko:hover,.hs-nabidky-tlacitko:focus{background:#a33025}' +
    '@media(max-width:640px){.hs-nabidky{padding:12px}.hs-nabidky-mrizka{grid-template-columns:minmax(0,1fr);gap:12px}.hs-nabidky-obr{aspect-ratio:2/1}}';

  function pridejCss() {
    if (document.getElementById('hs-nabidky-css')) return;
    var s = prvek('style', '', CSS);
    s.id = 'hs-nabidky-css';
    (document.head || document.documentElement).appendChild(s);
  }

  function nactiData(hotovo) {
    var vlastni = window.HS_NABIDKY_DATA; // pro testy a ukázkovou stránku
    if (vlastni && typeof vlastni === 'object') return hotovo(vlastni);
    var url = typeof vlastni === 'string' ? vlastni : NASTAVENI.data;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = NASTAVENI.casovyLimit;
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var data;
      try { data = JSON.parse(xhr.responseText); } catch (e) { return; }
      if (data && data.nabidky) hotovo(data);
    };
    xhr.send();
  }

  function vykresli(box, data) {
    if (box.getAttribute('data-hs-hotovo')) return;
    var pocet = parseInt(box.getAttribute('data-pocet'), 10) || NASTAVENI.pocet;
    pocet = Math.max(1, Math.min(NASTAVENI.maxPocet, pocet));
    var dnes = dnesniDatum();
    var m = /[?&]hs-datum=(\d{4}-\d{2}-\d{2})/.exec(parametry); // test: ?hs-datum=2027-01-01
    if (m) dnes = m[1];
    var nabidky = vyber(data.nabidky, box.getAttribute('data-kraj'), box.getAttribute('data-typ'), pocet, dnes);
    var r = rozlozeni(nabidky.length);
    if (!r.pocet) return; // nic nesedí → blok zůstane skrytý

    var mrizka = prvek('div', 'hs-nabidky-mrizka');
    mrizka.style.setProperty('--hs-sloupce', r.sloupce);
    nabidky.slice(0, r.pocet).forEach(function (n) { mrizka.appendChild(karta(n)); });

    box.innerHTML = '';
    box.appendChild(prvek('p', 'hs-nabidky-stitek', NASTAVENI.nadpis));
    box.appendChild(mrizka);
    box.setAttribute('aria-label', NASTAVENI.nadpis);
    box.setAttribute('data-hs-hotovo', '1');
  }

  function start() {
    var boxy = document.querySelectorAll('div.hs-nabidky');
    if (!boxy.length) return;
    pridejCss(); // skryje bloky, dokud nejsou vykreslené
    nactiData(function (data) {
      [].forEach.call(boxy, function (box) {
        try { vykresli(box, data); } catch (e) { /* blok zůstane skrytý */ }
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
