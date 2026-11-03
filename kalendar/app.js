'use strict';

(function () {
  var TYPY = {
    vlaky: { nazev: 'Vlaky', ikona: '🚂' },
    traktory: { nazev: 'Traktory', ikona: '🚜' },
    auta: { nazev: 'Auta', ikona: '🚗' }
  };
  var PORADI_KRAJU = [
    'Hlavní město Praha', 'Středočeský kraj', 'Jihočeský kraj', 'Plzeňský kraj',
    'Karlovarský kraj', 'Ústecký kraj', 'Liberecký kraj', 'Královéhradecký kraj',
    'Pardubický kraj', 'Kraj Vysočina', 'Jihomoravský kraj', 'Olomoucký kraj',
    'Zlínský kraj', 'Moravskoslezský kraj'
  ];
  var MESICE_2P = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
    'srpna', 'září', 'října', 'listopadu', 'prosince'];
  var MESICE_1P = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec',
    'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  var MESICE_ZKR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  var DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

  var el = {
    hledat: document.getElementById('hledat'),
    kraj: document.getElementById('kraj'),
    vikend: document.getElementById('vikend'),
    typy: document.querySelectorAll('[data-typ]'),
    seznam: document.getElementById('seznam'),
    pocet: document.getElementById('pocet'),
    zrusit: document.getElementById('zrusit'),
    aktualizace: document.getElementById('aktualizace')
  };

  var stav = { q: '', typ: '', kraj: '', vikend: false };
  var akce = [];

  // ---------- Pomocné funkce ----------
  function bezDiakritiky(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bezpecnaUrl(u) {
    if (!u || typeof u !== 'string') return '';
    try {
      var url = new URL(u, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  // "2026-05-01" = celý den v místním čase, "2026-05-01T10:00+02:00" = konkrétní čas
  function prectiDatum(s, jeKonec) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (m) {
      var d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (jeKonec) d.setHours(23, 59, 59, 999);
      return { datum: d, sCasem: false };
    }
    var dt = new Date(s);
    return isNaN(dt) ? null : { datum: dt, sCasem: true };
  }

  function zacatekDne(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function stejnyDen(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function cas(d) {
    return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatTermin(a) {
    var z = a._z, k = a._k;
    var rok = new Date().getFullYear();
    function den(d, sRokem) {
      return d.getDate() + '. ' + MESICE_2P[d.getMonth()] + (sRokem || d.getFullYear() !== rok ? ' ' + d.getFullYear() : '');
    }
    if (stejnyDen(z, k)) {
      var t = DNY[z.getDay()] + ' ' + den(z);
      if (a._sCasem) {
        t += ', ' + cas(z) + (k > z ? '–' + cas(k) : '');
      }
      return t;
    }
    if (z.getFullYear() === k.getFullYear() && z.getMonth() === k.getMonth()) {
      return z.getDate() + '.–' + den(k);
    }
    if (z.getFullYear() === k.getFullYear()) {
      return z.getDate() + '. ' + MESICE_2P[z.getMonth()] + ' – ' + den(k);
    }
    return den(z, true) + ' – ' + den(k, true);
  }

  // Nejbližší víkend: v pracovní den nadcházející sobota+neděle, o víkendu ten aktuální.
  function tentoVikend() {
    var dnes = zacatekDne(new Date());
    var d = dnes.getDay(); // 0 = neděle
    var sobota = new Date(dnes);
    if (d === 0) sobota.setDate(dnes.getDate() - 1);
    else sobota.setDate(dnes.getDate() + (6 - d));
    var od = d === 0 ? dnes : sobota;
    var doKonce = new Date(sobota);
    doKonce.setDate(sobota.getDate() + 1);
    doKonce.setHours(23, 59, 59, 999);
    return { od: od, do: doKonce };
  }

  // ---------- Stav v adrese (lze sdílet odkaz s filtrem) ----------
  function nactiZAdresy() {
    var p = new URLSearchParams(location.search);
    stav.q = p.get('q') || '';
    stav.typ = TYPY[p.get('typ')] ? p.get('typ') : '';
    stav.kraj = p.get('kraj') || '';
    stav.vikend = p.get('vikend') === '1';
  }

  function ulozDoAdresy() {
    var p = new URLSearchParams();
    if (stav.q) p.set('q', stav.q);
    if (stav.typ) p.set('typ', stav.typ);
    if (stav.kraj) p.set('kraj', stav.kraj);
    if (stav.vikend) p.set('vikend', '1');
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  }

  function promitniStav() {
    el.hledat.value = stav.q;
    el.kraj.value = stav.kraj;
    el.vikend.setAttribute('aria-pressed', String(stav.vikend));
    el.typy.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-typ') === stav.typ));
    });
    el.zrusit.hidden = !(stav.q || stav.typ || stav.kraj || stav.vikend);
  }

  // ---------- Data ----------
  function pripravAkce(data) {
    var dnes = zacatekDne(new Date());
    return (data.akce || [])
      .map(function (a) {
        var z = prectiDatum(a.zacatek, false);
        var k = prectiDatum(a.konec || a.zacatek, true);
        if (!z) return null;
        if (!k || k.datum < z.datum) k = { datum: z.sCasem ? z.datum : new Date(z.datum.getTime() + 86399999) };
        a._z = z.datum;
        a._k = k.datum;
        a._sCasem = z.sCasem;
        a._typy = (a.typy || []).filter(function (t) { return TYPY[t]; });
        a._hledat = bezDiakritiky([a.nazev, a.misto, a.adresa, a.obec, a.kraj, a.popis,
          a._typy.map(function (t) { return TYPY[t].nazev; }).join(' ')].join(' '));
        return a;
      })
      .filter(function (a) { return a && a._k >= dnes; })
      .sort(function (a, b) { return a._z - b._z || String(a.nazev).localeCompare(b.nazev, 'cs'); });
  }

  function naplnKraje() {
    var pocty = {};
    akce.forEach(function (a) { if (a.kraj) pocty[a.kraj] = (pocty[a.kraj] || 0) + 1; });
    var kraje = Object.keys(pocty).sort(function (a, b) {
      var ia = PORADI_KRAJU.indexOf(a), ib = PORADI_KRAJU.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'cs');
    });
    if (stav.kraj && !pocty[stav.kraj]) kraje.push(stav.kraj);
    el.kraj.innerHTML = '<option value="">Všechny kraje</option>' + kraje.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + (pocty[k] ? ' (' + pocty[k] + ')' : '') + '</option>';
    }).join('');
  }

  function filtruj() {
    var slova = bezDiakritiky(stav.q).split(/\s+/).filter(Boolean);
    var vikend = stav.vikend ? tentoVikend() : null;
    return akce.filter(function (a) {
      if (stav.typ && a._typy.indexOf(stav.typ) < 0) return false;
      if (stav.kraj && a.kraj !== stav.kraj) return false;
      if (vikend && (a._z > vikend.do || a._k < vikend.od)) return false;
      for (var i = 0; i < slova.length; i++) {
        if (a._hledat.indexOf(slova[i]) < 0) return false;
      }
      return true;
    });
  }

  // ---------- Vykreslení ----------
  function karta(a) {
    var url = bezpecnaUrl(a.url);
    var img = bezpecnaUrl(a.obrazek);
    var ikona = a._typy.length ? TYPY[a._typy[0]].ikona : '🚦';
    var probiha = a._z < new Date() && a._k >= new Date();
    var misto = [a.misto, a.obec && (a.misto || '').indexOf(a.obec) < 0 ? a.obec : ''].filter(Boolean).join(', ');

    var stitky = [];
    if (a.zruseno) stitky.push('<li class="pozor">Zrušeno</li>');
    if (a.presunuto) stitky.push('<li class="pozor">Přesunuto</li>');
    if (probiha) stitky.push('<li class="probiha">Právě probíhá</li>');
    a._typy.forEach(function (t) {
      stitky.push('<li><span aria-hidden="true">' + TYPY[t].ikona + '</span> ' + TYPY[t].nazev + '</li>');
    });
    if (a.kraj) stitky.push('<li>' + esc(a.kraj) + '</li>');

    return '<article class="karta' + (a.zruseno ? ' zrusena' : '') + '">' +
      '<div class="karta-obrazek">' +
        (img
          ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async" data-ikona="' + ikona + '">'
          : '<div class="nahradni" aria-hidden="true">' + ikona + '</div>') +
        '<div class="datum" aria-hidden="true"><strong>' + a._z.getDate() + '</strong><span>' +
          MESICE_ZKR[a._z.getMonth()] + '</span></div>' +
      '</div>' +
      '<div class="karta-telo">' +
        '<h3>' + esc(a.nazev) + '</h3>' +
        '<p class="termin"><time datetime="' + esc(a.zacatek) + '">' + esc(formatTermin(a)) + '</time></p>' +
        (misto ? '<p class="misto">📍 ' + esc(misto) + '</p>' : '') +
        (stitky.length ? '<ul class="stitky">' + stitky.join('') + '</ul>' : '') +
        (url ? '<a class="tlacitko" href="' + esc(url) + '" target="_blank" rel="noopener">Více na Hravestroje.cz</a>' : '') +
      '</div>' +
    '</article>';
  }

  function sklonujAkce(n) {
    if (n === 1) return '1 akce';
    if (n >= 2 && n <= 4) return n + ' akce';
    return n + ' akcí';
  }

  function vykresli() {
    var vysledek = filtruj();
    var filtrovano = stav.q || stav.typ || stav.kraj || stav.vikend;
    el.pocet.textContent = filtrovano
      ? 'Nalezeno: ' + sklonujAkce(vysledek.length)
      : 'Nadcházející akce: ' + vysledek.length;

    if (!vysledek.length) {
      el.seznam.innerHTML = '<p class="info">' + (akce.length
        ? 'Pro zvolené filtry jsme nenašli žádnou akci. Zkuste jiný kraj nebo typ.'
        : 'Zatím tu nejsou žádné nadcházející akce. Mrkněte sem brzy znovu.') + '</p>';
      return;
    }

    var dnes = zacatekDne(new Date());
    var skupiny = [];
    var posledni = null;
    vysledek.forEach(function (a) {
      var d = a._z < dnes ? dnes : a._z; // probíhající akce patří do aktuálního měsíce
      var klic = d.getFullYear() + '-' + d.getMonth();
      if (!posledni || posledni.klic !== klic) {
        posledni = { klic: klic, nazev: MESICE_1P[d.getMonth()] + ' ' + d.getFullYear(), akce: [] };
        skupiny.push(posledni);
      }
      posledni.akce.push(a);
    });

    // jedna mřížka pro všechny měsíce, nadpis měsíce přes celou šířku
    el.seznam.innerHTML = '<div class="mrizka">' + skupiny.map(function (s) {
      return '<h2 class="mesic">' + esc(s.nazev) + '</h2>' + s.akce.map(karta).join('');
    }).join('') + '</div>';

    el.seznam.querySelectorAll('img[data-ikona]').forEach(function (img) {
      img.addEventListener('error', function () {
        var n = document.createElement('div');
        n.className = 'nahradni';
        n.setAttribute('aria-hidden', 'true');
        n.textContent = img.getAttribute('data-ikona');
        img.replaceWith(n);
      }, { once: true });
    });
  }

  function zmena() {
    promitniStav();
    ulozDoAdresy();
    vykresli();
  }

  // ---------- Události ----------
  var casovac;
  el.hledat.addEventListener('input', function () {
    clearTimeout(casovac);
    casovac = setTimeout(function () {
      stav.q = el.hledat.value.trim();
      el.zrusit.hidden = !(stav.q || stav.typ || stav.kraj || stav.vikend);
      ulozDoAdresy();
      vykresli();
    }, 150);
  });
  el.kraj.addEventListener('change', function () { stav.kraj = el.kraj.value; zmena(); });
  el.vikend.addEventListener('click', function () { stav.vikend = !stav.vikend; zmena(); });
  el.typy.forEach(function (b) {
    b.addEventListener('click', function () { stav.typ = b.getAttribute('data-typ'); zmena(); });
  });
  el.zrusit.addEventListener('click', function () {
    stav = { q: '', typ: '', kraj: '', vikend: false };
    zmena();
  });

  // ---------- Start ----------
  nactiZAdresy();
  promitniStav();

  fetch('akce.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      akce = pripravAkce(data);
      naplnKraje();
      promitniStav();
      vykresli();
      if (data.aktualizovano) {
        var d = new Date(data.aktualizovano);
        if (!isNaN(d)) {
          el.aktualizace.textContent = 'Seznam aktualizován ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' +
            d.getFullYear() + ' v ' + cas(d) + '.';
        }
      }
    })
    .catch(function () {
      el.seznam.innerHTML = '<p class="info">Akce se nepodařilo načíst. Zkontrolujte připojení k internetu a zkuste stránku obnovit.</p>';
    });

  // PWA: offline režim a přidání na plochu. Žádné notifikace.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
