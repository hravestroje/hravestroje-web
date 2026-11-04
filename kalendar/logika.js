// Logika kalendáře akcí bez práce se stránkou (DOM) – aby šla otestovat v Node.js.
// V prohlížeči je dostupná jako window.KalendarLogika, v Node.js přes require().
// Všechny funkce, které závisí na dnešku, berou parametr `ted` (Date) – testy si tak
// mohou nastavit libovolné „dnes“ (přelom měsíce, roku…).
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.KalendarLogika = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Typy akcí ----------
  var TYPY = {
    vlaky: { nazev: 'Vlaky' },
    traktory: { nazev: 'Traktory' },
    auta: { nazev: 'Auta' },
    lode: { nazev: 'Lodě' },
    letadla: { nazev: 'Letadla' },
    ostatni: { nazev: 'Ostatní' }
  };
  var PORADI_TYPU = ['vlaky', 'traktory', 'auta', 'lode', 'letadla', 'ostatni'];

  // Čárové ikony 24×24, barva přes currentColor (zelená, v aktivním stavu bílá).
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
    kalendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    sdilet: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
    postel: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="2"/>',
    filtr: '<path d="M4 5h16M7 12h10M10 19h4"/>'
  };

  function ikona(nazev, trida) {
    return '<svg class="ikona' + (trida ? ' ' + trida : '') + '" viewBox="0 0 24 24" width="24" height="24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (IKONY[nazev] || IKONY.ostatni) + '</svg>';
  }

  var MESICE_2P = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
    'srpna', 'září', 'října', 'listopadu', 'prosince'];
  var MESICE_1P = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec',
    'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  var MESICE_ZKR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  var DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

  // Rychlé filtry podle data (hodnota parametru ?kdy=…)
  var KDY = [
    ['dnes', 'Dnes'],
    ['zitra', 'Zítra'],
    ['tyden', 'Tento týden'],
    ['vikend', 'Tento víkend'],
    ['pristi-vikend', 'Příští víkend'],
    ['mesic', 'Tento měsíc'],
    ['pristi-mesic', 'Příští měsíc']
  ];

  // ---------- Pomocné funkce ----------
  function bezDiakritiky(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function bezpecnaUrl(u, zaklad) {
    if (!u || typeof u !== 'string') return '';
    try {
      var url = new URL(u.trim(), zaklad || (typeof location !== 'undefined' ? location.href : 'https://www.hravestroje.cz/'));
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function zacatekDne(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function konecDne(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  function pridejDny(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function stejnyDen(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function dvoumistne(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // Date → "2026-12-05" (místní čas)
  function isoDen(d) {
    return d.getFullYear() + '-' + dvoumistne(d.getMonth() + 1) + '-' + dvoumistne(d.getDate());
  }

  function cas(d) {
    return d.getHours() + ':' + dvoumistne(d.getMinutes());
  }

  // "2026-05-01" = celý den v místním čase, "2026-05-01T10:00+02:00" = konkrétní čas
  function prectiDatum(s, jeKonec) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (m) {
      var d = new Date(+m[1], +m[2] - 1, +m[3]);
      if (d.getMonth() !== +m[2] - 1) return null;
      if (jeKonec) d.setHours(23, 59, 59, 999);
      return { datum: d, sCasem: false };
    }
    if (!s) return null;
    var dt = new Date(s);
    return isNaN(dt) ? null : { datum: dt, sCasem: true };
  }

  // Jednoduchý stabilní hash textu (výběr „náhodného“ produktu se nemění při každém překreslení)
  function hash(t) {
    var h = 2166136261;
    t = String(t);
    for (var i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ---------- Příprava akcí ----------
  function pripravAkce(data, ted) {
    var dnes = zacatekDne(ted || new Date());
    return ((data && data.akce) || [])
      .map(function (puvodni) {
        var a = Object.assign({}, puvodni);
        var z = prectiDatum(a.zacatek, false);
        if (!z) return null;
        var k = prectiDatum(a.konec || a.zacatek, true);
        if (!k || k.datum < z.datum) k = { datum: z.sCasem ? z.datum : konecDne(z.datum) };
        a._z = z.datum;
        a._k = k.datum;
        a._sCasem = z.sCasem;
        a._typy = (a.typy || []).filter(function (t) { return TYPY[t]; });
        if (!a._typy.length) a._typy = ['ostatni'];
        a._hledat = bezDiakritiky([a.nazev, a.misto, a.adresa, a.obec, a.kraj, a.popis,
          a._typy.map(function (t) { return TYPY[t].nazev; }).join(' ')].join(' '));
        return a;
      })
      .filter(function (a) { return a && a._k >= dnes; });
  }

  function hlavniTyp(a) {
    return (a._typy && a._typy[0]) || 'ostatni';
  }

  function porovnej(a, b) {
    return a._z - b._z || a._k - b._k || String(a.nazev).localeCompare(String(b.nazev), 'cs');
  }

  // Probíhající = začaly před dneškem a ještě trvají (vícedenní). Ostatní jsou nadcházející,
  // seřazené podle začátku (a času); akce bez času mají začátek o půlnoci, takže jsou v rámci
  // dne první.
  function rozdelAkce(akce, ted) {
    var dnes = zacatekDne(ted || new Date());
    var probiha = [], nadchazejici = [];
    akce.forEach(function (a) {
      if (a._k < dnes) return;
      (a._z < dnes ? probiha : nadchazejici).push(a);
    });
    probiha.sort(porovnej);
    nadchazejici.sort(porovnej);
    return { probiha: probiha, nadchazejici: nadchazejici };
  }

  function seskupPodleMesicu(akce) {
    var skupiny = [], posledni = null;
    akce.forEach(function (a) {
      var klic = a._z.getFullYear() + '-' + dvoumistne(a._z.getMonth() + 1);
      if (!posledni || posledni.klic !== klic) {
        posledni = { klic: klic, nazev: MESICE_1P[a._z.getMonth()] + ' ' + a._z.getFullYear(), akce: [] };
        skupiny.push(posledni);
      }
      posledni.akce.push(a);
    });
    return skupiny;
  }

  // ---------- Filtry podle data ----------
  function prectiDen(s) {
    var d = prectiDatum(s, false);
    return d && !d.sCasem ? d.datum : null;
  }

  // Vrátí { od, do } (včetně), nebo null, když se podle data nefiltruje.
  function rozsahData(f, ted) {
    var dnes = zacatekDne(ted || new Date());
    var den = dnes.getDay(); // 0 = neděle
    var sobota = den === 0 ? pridejDny(dnes, -1) : pridejDny(dnes, 6 - den);
    switch (f && f.kdy) {
      case 'dnes': return { od: dnes, do: konecDne(dnes) };
      case 'zitra': return { od: pridejDny(dnes, 1), do: konecDne(pridejDny(dnes, 1)) };
      // týden = pondělí až neděle; bereme zbytek aktuálního týdne
      case 'tyden': return { od: dnes, do: konecDne(pridejDny(dnes, (7 - den) % 7)) };
      // v pracovní den nadcházející sobota+neděle, o víkendu ten aktuální
      case 'vikend': return { od: den === 0 ? dnes : sobota, do: konecDne(pridejDny(sobota, 1)) };
      case 'pristi-vikend': return { od: pridejDny(sobota, 7), do: konecDne(pridejDny(sobota, 8)) };
      case 'mesic': return { od: dnes, do: konecDne(new Date(dnes.getFullYear(), dnes.getMonth() + 1, 0)) };
      case 'pristi-mesic': return {
        od: new Date(dnes.getFullYear(), dnes.getMonth() + 1, 1),
        do: konecDne(new Date(dnes.getFullYear(), dnes.getMonth() + 2, 0))
      };
    }
    var m = /^(\d{4})-(\d{2})$/.exec((f && f.mesic) || '');
    if (m) return { od: new Date(+m[1], +m[2] - 1, 1), do: konecDne(new Date(+m[1], +m[2], 0)) };
    var od = prectiDen(f && f.od), dok = prectiDen(f && f.do);
    if (od || dok) {
      if (od && dok && od > dok) { var x = od; od = dok; dok = x; }
      return { od: od || new Date(-8.64e15), do: dok ? konecDne(dok) : new Date(8.64e15) };
    }
    return null;
  }

  function filtruj(akce, stav, ted) {
    var slova = bezDiakritiky(stav.q).split(/\s+/).filter(Boolean);
    var rozsah = rozsahData(stav, ted);
    return akce.filter(function (a) {
      if (stav.typ && a._typy.indexOf(stav.typ) < 0) return false;
      if (stav.kraj && a.kraj !== stav.kraj) return false;
      if (rozsah && (a._z > rozsah.do || a._k < rozsah.od)) return false;
      for (var i = 0; i < slova.length; i++) {
        if (a._hledat.indexOf(slova[i]) < 0) return false;
      }
      return true;
    });
  }

  function mesiceDopredu(ted, pocet) {
    var d = ted || new Date();
    var vysledek = [];
    for (var i = 0; i < (pocet || 12); i++) {
      var m = new Date(d.getFullYear(), d.getMonth() + i, 1);
      vysledek.push({
        hodnota: m.getFullYear() + '-' + dvoumistne(m.getMonth() + 1),
        nazev: MESICE_1P[m.getMonth()] + ' ' + m.getFullYear()
      });
    }
    return vysledek;
  }

  // ---------- Stav v adrese ----------
  function prazdnyStav() {
    return { q: '', typ: '', kraj: '', kdy: '', mesic: '', od: '', do: '' };
  }

  function stavZAdresy(search) {
    var p = new URLSearchParams(search || '');
    var s = prazdnyStav();
    s.q = (p.get('q') || '').trim();
    s.typ = TYPY[p.get('typ')] ? p.get('typ') : '';
    s.kraj = p.get('kraj') || '';
    var kdy = p.get('kdy') || (p.get('vikend') === '1' ? 'vikend' : '');
    if (KDY.some(function (k) { return k[0] === kdy; })) {
      s.kdy = kdy;
    } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(p.get('mesic') || '')) {
      s.mesic = p.get('mesic');
    } else {
      if (prectiDen(p.get('od'))) s.od = p.get('od');
      if (prectiDen(p.get('do'))) s.do = p.get('do');
    }
    return s;
  }

  function adresaZeStavu(s) {
    var p = new URLSearchParams();
    ['q', 'typ', 'kraj', 'kdy', 'mesic', 'od', 'do'].forEach(function (k) {
      if (s[k]) p.set(k, s[k]);
    });
    return p.toString();
  }

  function filtrujeSeDatem(s) {
    return !!(s.kdy || s.mesic || s.od || s.do);
  }

  // ---------- Termín ----------
  function formatTermin(a, ted) {
    var z = a._z, k = a._k;
    var rok = (ted || new Date()).getFullYear();
    function den(d, sRokem) {
      return d.getDate() + '. ' + MESICE_2P[d.getMonth()] + (sRokem || d.getFullYear() !== rok ? ' ' + d.getFullYear() : '');
    }
    if (stejnyDen(z, k)) {
      var t = DNY[z.getDay()] + ' ' + den(z);
      if (a._sCasem) t += ', ' + cas(z) + (k > z ? '–' + cas(k) : '');
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

  // ---------- Mřížka ----------
  // Na PC jsou 3 sloupce. Když by v poslední řadě zůstala jediná karta (4, 7, 10…),
  // dají se poslední 4 dlaždice na 2 řady po dvou (4 = 2×2, 7 = 3 + 2×2).
  // Vrací počet dlaždic na konci skupiny, které mají být široké (přes 1,5 sloupce).
  function sirokeNaKonci(n, sloupcu) {
    sloupcu = sloupcu || 3;
    if (sloupcu === 3 && n >= 4 && n % 3 === 1) return 4;
    return 0;
  }

  // ---------- Obrázky ----------
  function obrazekAkce(a) {
    if (!a || !a.obrazek || a.obrazek === 'zastupny') return '';
    return bezpecnaUrl(a.obrazek);
  }

  function zastupnyObrazek(typ) {
    var t = TYPY[typ] ? typ : 'ostatni';
    return '<div class="zastupny zastupny--' + t + '" role="img" aria-label="' + esc(TYPY[t].nazev) + '">' +
      '<span class="zastupny-kruh">' + ikona(t) + '</span>' +
      '<span class="zastupny-znacka">Hravé stroje</span></div>';
  }

  // ---------- Monetizace ----------
  function pridejUtm(u, typ, obsah) {
    var url = bezpecnaUrl(u);
    if (!url) return '';
    var x = new URL(url);
    x.searchParams.set('utm_source', 'kalendar');
    x.searchParams.set('utm_medium', 'karta');
    x.searchParams.set('utm_campaign', typ || 'ostatni');
    if (obsah) x.searchParams.set('utm_content', obsah);
    return x.href;
  }

  function monetizaceZapnuta(mon) {
    return !!mon && mon.zapnuto !== false;
  }

  // Odkaz na Booking.com s místem akce a daty. Bez partnerského ID (booking_aid) vrací ''
  // – tlačítko se pak nezobrazí. Příjezd = den začátku akce (u probíhající dnešek), odjezd o den později.
  function bookingOdkaz(a, mon, ted) {
    if (!monetizaceZapnuta(mon) || mon.booking === false) return '';
    var aid = String(mon.booking_aid == null ? '' : mon.booking_aid).trim();
    if (!aid || !/^[A-Za-z0-9_-]+$/.test(aid)) return '';
    var zaklad = bezpecnaUrl(mon.booking_odkaz || 'https://www.booking.com/searchresults.cs.html');
    var misto = a.obec || a.misto || a.adresa;
    if (!zaklad || !misto) return '';
    var dnes = zacatekDne(ted || new Date());
    var prijezd = a._z < dnes ? dnes : zacatekDne(a._z);
    var url = new URL(zaklad);
    url.searchParams.set('ss', misto);
    url.searchParams.set('checkin', isoDen(prijezd));
    url.searchParams.set('checkout', isoDen(pridejDny(prijezd, 1)));
    url.searchParams.set('group_adults', '2');
    url.searchParams.set('no_rooms', '1');
    url.searchParams.set('aid', aid);
    if (mon.booking_label) url.searchParams.set('label', String(mon.booking_label));
    return pridejUtm(url.href, hlavniTyp(a), 'booking');
  }

  // Slova pro výběr produktu z e-shopu podle typu akce (malá písmena bez diakritiky,
  // hledají se na začátku slov v názvu a kategoriích produktu).
  var SLOVA_PRODUKTU = {
    vlaky: ['vlak', 'vlac', 'lokomotiv', 'masink', 'zeleznic', 'kolejnic', 'vagon', 'tramvaj'],
    traktory: ['traktor', 'kombajn', 'zemedel', 'farm'],
    auta: ['auto', 'auta', 'autic', 'nakladak', 'hasic', 'bagr', 'kamion', 'autobus', 'jerab'],
    lode: ['lod', 'parnik', 'plachetnic', 'ponork', 'jacht', 'pristav'],
    letadla: ['letad', 'letis', 'vrtulnik', 'pilot', 'aviati']
  };
  var VYJIMKY_PRODUKTU = ['autor', 'automat'];

  function produktOdpovidaTypu(p, typ) {
    if ((p.temata || []).indexOf(typ) >= 0) return true;
    var slova = SLOVA_PRODUKTU[typ];
    if (!slova) return false;
    var slovaTextu = bezDiakritiky([p.nazev].concat(p.kategorie || []).join(' ')).split(/[^a-z0-9]+/);
    return slovaTextu.some(function (w) {
      if (VYJIMKY_PRODUKTU.some(function (v) { return w.indexOf(v) === 0; })) return false;
      return slova.some(function (s) { return w.indexOf(s) === 0; });
    });
  }

  // Vybere produkt skladem odpovídající typu akce (vlak → produkty se slovem vlak…),
  // jinak „náhodný“ (stabilně podle `seed`, aby se neměnil při každém překreslení).
  // `pouzite` = množina adres už zobrazených produktů (neopakovat).
  function vyberProdukt(produkty, typ, seed, pouzite) {
    pouzite = pouzite || {};
    var vsechny = (Array.isArray(produkty) ? produkty : (produkty && produkty.produkty) || [])
      .filter(function (p) { return p && p.nazev && p.skladem !== false && bezpecnaUrl(p.url); });
    if (!vsechny.length) return null;
    var nove = function (p) { return !pouzite[p.url]; };
    var shoda = vsechny.filter(function (p) { return produktOdpovidaTypu(p, typ); });
    var vyber = shoda.filter(nove);
    if (!vyber.length) vyber = vsechny.filter(nove);
    if (!vyber.length) vyber = shoda.length ? shoda : vsechny;
    return vyber[hash(seed + '|' + typ) % vyber.length];
  }

  function seznam(x) {
    if (Array.isArray(x)) return x.filter(Boolean).map(String);
    return x ? [String(x)] : [];
  }

  // Nabídky (nabidky.json): { "nabidky": [ { nazev, url, popis?, obrazek?, partner?,
  //   kraje?: [...] (nebo kraj), typy?: [...] (nebo typ), od?: "YYYY-MM-DD", do?: "YYYY-MM-DD" } ] }
  // Prázdné kraje/typy = platí pro všechny. Vybere nejpřesnější shodu, každou nabídku jen jednou.
  function vyberNabidku(nabidky, a, pouzite, ted) {
    pouzite = pouzite || {};
    var dnes = zacatekDne(ted || new Date());
    var list = Array.isArray(nabidky) ? nabidky : (nabidky && nabidky.nabidky) || [];
    var nejlepsi = null, skore = -1;
    list.forEach(function (n) {
      if (!n || typeof n !== 'object' || n.aktivni === false) return;
      var url = bezpecnaUrl(n.url || n.odkaz);
      if (!url || !n.nazev || pouzite[url]) return;
      var od = prectiDen(n.od), dok = prectiDen(n.do);
      if ((od && od > dnes) || (dok && dok < dnes)) return;
      var kraje = seznam(n.kraje || n.kraj), typy = seznam(n.typy || n.typ);
      if (kraje.length && kraje.indexOf(a.kraj) < 0) return;
      if (typy.length && !typy.some(function (t) { return a._typy.indexOf(t) >= 0; })) return;
      var s = (kraje.length ? 2 : 0) + (typy.length ? 1 : 0);
      if (s > skore) { skore = s; nejlepsi = Object.assign({}, n, { url: url }); }
    });
    return nejlepsi;
  }

  // ---------- Soubor .ics ----------
  function utcIcs(d) {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function denIcs(d) {
    return isoDen(d).replace(/-/g, '');
  }

  function escIcs(t) {
    return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // Řádky delší než 75 bajtů se zalamují (RFC 5545), pokračování začíná mezerou.
  function zalom(radek) {
    var vysledek = [], aktualni = '', bajtu = 0;
    for (var i = 0; i < radek.length; i++) {
      var znak = radek[i];
      var kod = radek.charCodeAt(i);
      if (kod >= 0xd800 && kod <= 0xdbff) { znak += radek[++i]; }
      var b = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(znak).length : unescape(encodeURIComponent(znak)).length;
      if (bajtu + b > (vysledek.length ? 74 : 75)) {
        vysledek.push(aktualni);
        aktualni = '';
        bajtu = 0;
      }
      aktualni += znak;
      bajtu += b;
    }
    vysledek.push(aktualni);
    return vysledek.join('\r\n ');
  }

  function ics(a, ted) {
    var misto = [a.misto, a.obec && String(a.misto || '').indexOf(a.obec) < 0 ? a.obec : ''].filter(Boolean).join(', ');
    var radky = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hrave stroje//Kalendar akci//CS',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + (a.id || hash(a.nazev + a.zacatek).toString(16)) + '@hravestroje.cz',
      'DTSTAMP:' + utcIcs(ted || new Date())
    ];
    if (a._sCasem) {
      radky.push('DTSTART:' + utcIcs(a._z));
      if (a._k > a._z) radky.push('DTEND:' + utcIcs(a._k));
    } else {
      radky.push('DTSTART;VALUE=DATE:' + denIcs(a._z));
      radky.push('DTEND;VALUE=DATE:' + denIcs(pridejDny(a._k, 1))); // konec je v .ics „do“, ne „včetně“
    }
    radky.push('SUMMARY:' + escIcs(a.nazev));
    if (misto) radky.push('LOCATION:' + escIcs(misto));
    var url = bezpecnaUrl(a.url);
    var popis = [a.popis, url ? 'Více: ' + url : '', 'Termíny se mohou změnit – před cestou si je ověřte u pořadatele.']
      .filter(Boolean).join('\n\n');
    radky.push('DESCRIPTION:' + escIcs(popis));
    if (url) radky.push('URL:' + url);
    if (a.zruseno) radky.push('STATUS:CANCELLED');
    radky.push('END:VEVENT', 'END:VCALENDAR');
    return radky.map(zalom).join('\r\n') + '\r\n';
  }

  function nazevSouboru(a) {
    var s = bezDiakritiky(a.nazev).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return (s || 'akce') + '.ics';
  }

  return {
    TYPY: TYPY,
    PORADI_TYPU: PORADI_TYPU,
    KDY: KDY,
    MESICE_ZKR: MESICE_ZKR,
    MESICE_2P: MESICE_2P,
    ikona: ikona,
    bezDiakritiky: bezDiakritiky,
    esc: esc,
    bezpecnaUrl: bezpecnaUrl,
    zacatekDne: zacatekDne,
    isoDen: isoDen,
    cas: cas,
    prectiDatum: prectiDatum,
    pripravAkce: pripravAkce,
    hlavniTyp: hlavniTyp,
    rozdelAkce: rozdelAkce,
    seskupPodleMesicu: seskupPodleMesicu,
    rozsahData: rozsahData,
    filtruj: filtruj,
    mesiceDopredu: mesiceDopredu,
    prazdnyStav: prazdnyStav,
    stavZAdresy: stavZAdresy,
    adresaZeStavu: adresaZeStavu,
    filtrujeSeDatem: filtrujeSeDatem,
    formatTermin: formatTermin,
    sirokeNaKonci: sirokeNaKonci,
    obrazekAkce: obrazekAkce,
    zastupnyObrazek: zastupnyObrazek,
    pridejUtm: pridejUtm,
    monetizaceZapnuta: monetizaceZapnuta,
    bookingOdkaz: bookingOdkaz,
    produktOdpovidaTypu: produktOdpovidaTypu,
    vyberProdukt: vyberProdukt,
    vyberNabidku: vyberNabidku,
    ics: ics,
    nazevSouboru: nazevSouboru
  };
});
