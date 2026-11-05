// Údaje uložené jen v tomto zařízení (oblíbené akce, můj kraj, tlačítko „Přidat do mobilu“)
// a rozpoznání telefonu. Nic se neposílá na server, nepoužívají se cookies.
// Úložiště (localStorage) může být zakázané (soukromé okno, Safari, vypnuté ukládání) –
// každé čtení i zápis je proto v try/catch a kalendář funguje i bez něj (do zavření stránky),
// jen si nic nepamatuje.
// V prohlížeči je dostupné jako window.KalendarZarizeni, v Node.js přes require().
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.KalendarZarizeni = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KLIC_OBLIBENE = 'hs-kalendar-oblibene';
  var KLIC_KRAJ = 'hs-kalendar-muj-kraj';
  var KLIC_INSTALACE = 'hs-kalendar-instalace';
  var MAX_OBLIBENYCH = 300;

  function vychoziUloziste() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (e) {
      return null; // přístup k localStorage může sám vyhodit výjimku (zakázané ukládání)
    }
  }

  function vytvor(uloziste) {
    var u = uloziste === undefined ? vychoziUloziste() : uloziste;

    // Záloha v paměti: bez úložiště vše funguje do zavření stránky, jen se to nezapamatuje.
    var pamet = {};

    function cti(klic) {
      try {
        if (u) return u.getItem(klic);
      } catch (e) { /* zakázané úložiště → záloha v paměti */ }
      return Object.prototype.hasOwnProperty.call(pamet, klic) ? pamet[klic] : null;
    }
    function zapis(klic, hodnota) {
      pamet[klic] = hodnota === null || hodnota === '' ? null : String(hodnota);
      try {
        if (!u) return false;
        if (hodnota === null || hodnota === '') u.removeItem(klic);
        else u.setItem(klic, hodnota);
        return true;
      } catch (e) {
        return false;
      }
    }

    // ---------- Oblíbené akce (seznam id) ----------
    function oblibene() {
      try {
        var v = JSON.parse(cti(KLIC_OBLIBENE) || '[]');
        return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : [];
      } catch (e) {
        return [];
      }
    }
    function jeOblibena(id) {
      return oblibene().indexOf(String(id)) >= 0;
    }
    // Přepne oblíbenost; vrací nový stav (true = oblíbená).
    function prepniOblibenou(id) {
      id = String(id);
      var seznam = oblibene();
      var i = seznam.indexOf(id);
      if (i >= 0) seznam.splice(i, 1);
      else seznam.push(id);
      // nejstarší oblíbené (dávno proběhlé akce) zahodit, ať úložiště neroste donekonečna
      if (seznam.length > MAX_OBLIBENYCH) seznam = seznam.slice(-MAX_OBLIBENYCH);
      zapis(KLIC_OBLIBENE, seznam.length ? JSON.stringify(seznam) : null);
      return i < 0;
    }

    // ---------- Můj kraj ----------
    function mujKraj() {
      return cti(KLIC_KRAJ) || '';
    }
    function nastavMujKraj(kraj) {
      return zapis(KLIC_KRAJ, kraj ? String(kraj) : null);
    }

    // ---------- Tlačítko „Přidat do mobilu“ ----------
    // 'nainstalovano' nebo 'zavreno' = už nikdy neukazovat
    function instalaceVyrizena() {
      var v = cti(KLIC_INSTALACE);
      return v === 'nainstalovano' || v === 'zavreno';
    }
    function oznacInstalaci(stav) {
      return zapis(KLIC_INSTALACE, stav);
    }

    return {
      oblibene: oblibene,
      jeOblibena: jeOblibena,
      prepniOblibenou: prepniOblibenou,
      mujKraj: mujKraj,
      nastavMujKraj: nastavMujKraj,
      instalaceVyrizena: instalaceVyrizena,
      oznacInstalaci: oznacInstalaci
    };
  }

  // Jen akce, které jsou v oblíbených (pořadí zůstává).
  function filtrujOblibene(akce, ids) {
    var mnozina = {};
    (ids || []).forEach(function (id) { mnozina[id] = true; });
    return (akce || []).filter(function (a) { return a && mnozina[a.id]; });
  }

  // iPhone / iPad (i iPad, který se hlásí jako Mac s dotykem). Safari na iOS nemá
  // beforeinstallprompt – aplikaci jde přidat jen ručně přes Sdílet → Přidat na plochu.
  function jeIos(userAgent, platforma, dotykoveBody) {
    var ua = String(userAgent || '');
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    return /Macintosh/i.test(ua) && (platforma === 'MacIntel' || !platforma) && (dotykoveBody || 0) > 1;
  }

  // Běží jako nainstalovaná aplikace (z plochy / z Google Play)?
  function jeNainstalovana(okno) {
    try {
      if (okno.navigator && okno.navigator.standalone === true) return true;
      if (okno.matchMedia) {
        return ['standalone', 'fullscreen', 'minimal-ui'].some(function (m) {
          return okno.matchMedia('(display-mode: ' + m + ')').matches;
        });
      }
    } catch (e) { /* nic */ }
    return false;
  }

  return {
    vytvor: vytvor,
    filtrujOblibene: filtrujOblibene,
    jeIos: jeIos,
    jeNainstalovana: jeNainstalovana,
    KLICE: { oblibene: KLIC_OBLIBENE, kraj: KLIC_KRAJ, instalace: KLIC_INSTALACE }
  };
});
