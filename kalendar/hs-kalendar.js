/*! hs-kalendar.js – celý kalendář dopravních akcí uvnitř stránky na hravestroje.cz (Shoptet)
 * Na stránce stačí:  <div id="hs-kalendar"></div>
 * a v HTML kódech:    <script src="https://hravestroje.github.io/hravestroje-web/kalendar/hs-kalendar.js" defer></script>
 *
 * Stejná logika jako stránka kalendar/ (řazení, filtry, monetizace) – načte se z logika.js
 * ze stejné složky jako tento skript. Data: akce.json, monetizace.json, ../produkty/produkty.json,
 * nabídky. Filtry jsou v adrese (?kraj=…&kdy=…), sdílené odkazy fungují. Do stránky vloží
 * JSON-LD (ItemList s Event) pro Google. Po každé 8. kartě nechá prázdné místo
 * <div class="hs-kal-reklama"></div> pro reklamu.
 * Styly jsou izolované (vše pod #hs-kalendar, třídy hs-kal-…). Bez cookies, bez cizích knihoven.
 * Na stránkách bez <div id="hs-kalendar"> nic nestahuje a nic nedělá.
 */
(function (koren, tovarna) {
  var H = tovarna();
  if (typeof module === 'object' && module.exports) module.exports = H; // testy v Node.js
  else H.spust(koren);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- NASTAVENÍ ---------------------------------------------------------
  var VYCHOZI_ZAKLAD = 'https://hravestroje.github.io/hravestroje-web/kalendar/';
  var ID_KORENE = 'hs-kalendar';
  var REKLAMA_KAZDA = 8;      // prázdné místo pro reklamu po každé N-té kartě (atribut data-reklama-kazda, 0 = vypnout)
  var MAX_JSONLD = 200;       // nejvýš tolik akcí v JSON-LD
  // ------------------------------------------------------------------------

  // Parametry adresy, které patří kalendáři (ostatní, např. utm_…, zůstanou beze změny).
  var KLICE_FILTRU = ['q', 'typ', 'kraj', 'kdy', 'mesic', 'od', 'do'];
  var PORADI_KRAJU = [
    'Hlavní město Praha', 'Středočeský kraj', 'Jihočeský kraj', 'Plzeňský kraj',
    'Karlovarský kraj', 'Ústecký kraj', 'Liberecký kraj', 'Královéhradecký kraj',
    'Pardubický kraj', 'Kraj Vysočina', 'Jihomoravský kraj', 'Olomoucký kraj',
    'Zlínský kraj', 'Moravskoslezský kraj'
  ];
  var PARTNERSKY_REL = 'sponsored nofollow noopener';

  // ---------- Čisté funkce (testují se v Node.js) ----------

  // Složka, ze které se skript načetl (…/kalendar/). Jiná adresa → výchozí GitHub Pages.
  function zakladZeSkriptu(src) {
    if (!src || !/\/hs-kalendar(\.min)?\.js(\?|#|$)/.test(src)) return VYCHOZI_ZAKLAD;
    return src.split(/[?#]/)[0].replace(/[^/]*$/, '');
  }

  // Třídy z logika.js (ikona, zastupny…) dostanou předponu hs-kal-, aby je nestylovala šablona.
  function prefixujTridy(html) {
    return String(html).replace(/class="([^"]*)"/g, function (m, tridy) {
      return 'class="' + tridy.split(/\s+/).filter(Boolean).map(function (t) {
        return t.indexOf('hs-kal-') === 0 ? t : 'hs-kal-' + t;
      }).join(' ') + '"';
    });
  }

  // Nový query string: filtry kalendáře podle stavu, ostatní parametry adresy zůstanou.
  function adresaSFiltry(search, qsFiltru) {
    var p = new URLSearchParams(search || '');
    KLICE_FILTRU.forEach(function (k) { p.delete(k); });
    new URLSearchParams(qsFiltru || '').forEach(function (v, k) { p.append(k, v); });
    var s = p.toString();
    return s ? '?' + s : '';
  }

  // Přednastavený filtr z atributů <div id="hs-kalendar" data-kraj="…" data-typ="…"> – pro stránky
  // jednotlivých krajů a typů. Kraj: plný název, nebo bez „kraj“, velikost písmen a diakritika
  // nevadí („Královéhradecký kraj“, „kralovehradecky“, „Vysočina“, „Praha“). Typ: vlaky, traktory,
  // auta, lode, letadla, ostatni (i „Lodě“, „Traktory“). Neznámá hodnota se ignoruje.
  function normalizujKraj(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\bkraj\b/g, '').replace(/\bhlavni mesto\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  }
  function predvolba(atrKraj, atrTyp, TYPY) {
    var vysledek = { kraj: '', typ: '' };
    var k = normalizujKraj(atrKraj);
    if (k) {
      for (var i = 0; i < PORADI_KRAJU.length; i++) {
        if (normalizujKraj(PORADI_KRAJU[i]) === k) { vysledek.kraj = PORADI_KRAJU[i]; break; }
      }
    }
    var t = String(atrTyp || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (t) {
      Object.keys(TYPY || {}).forEach(function (klic) {
        if (klic === t || String(TYPY[klic].nazev).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === t) vysledek.typ = klic;
      });
    }
    return vysledek;
  }

  // Stav filtrů při načtení: filtry v adrese mají přednost (sdílený odkaz), jinak předvolba stránky.
  function pocatecniStav(L, search, pred) {
    var s = L.stavZAdresy(search);
    var p = new URLSearchParams(search || '');
    if (pred && pred.kraj && !p.has('kraj')) s.kraj = pred.kraj;
    if (pred && pred.typ && !p.has('typ')) s.typ = pred.typ;
    return s;
  }

  // Rozložení skupiny do bloků: mřížky karet oddělené místy pro reklamu.
  // `polozky` = akce, nebo položky seznamu z L.sestavSeznam ({ akce, den, probiha… }).
  // `stavPocitadla` = { karet: 0 } – počítá karty přes všechny skupiny (reklama po každé N-té kartě
  // celého seznamu, nikdy za úplně poslední kartou). `produktPo(a, poradi)` vrací dlaždici produktu
  // (nebo null) za danou kartou.
  function rozlozSkupinu(polozky, moznosti, stavPocitadla) {
    var kazdaReklama = moznosti.reklamaKazda | 0;
    var bloky = [], mrizka = [];
    polozky.forEach(function (x) {
      var a = x && x.akce ? x.akce : x;
      stavPocitadla.karet++;
      var poradi = stavPocitadla.karet;
      mrizka.push({ druh: 'karta', akce: a, polozka: x && x.akce ? x : { akce: a, den: a._z } });
      var p = moznosti.produktPo ? moznosti.produktPo(a, poradi) : null;
      if (p) mrizka.push({ druh: 'produkt', produkt: p, akce: a });
      if (kazdaReklama > 0 && poradi % kazdaReklama === 0 && poradi < moznosti.celkem) {
        bloky.push({ druh: 'mrizka', polozky: mrizka });
        bloky.push({ druh: 'reklama', poradi: poradi });
        mrizka = [];
      }
    });
    if (mrizka.length) bloky.push({ druh: 'mrizka', polozky: mrizka });
    return bloky;
  }

  // Na PC 3 sloupce: zbytek 1 → poslední 4 jako 2×2 (stejně jako kalendar/), zbytek 2 → poslední
  // 2 přes celou řadu (mřížky jsou kvůli reklamě kratší, poloprázdná řada by byla častější).
  function sirokeVMrizce(n) {
    if (n >= 4 && n % 3 === 1) return 4;
    if (n % 3 === 2) return 2;
    return 0;
  }

  function vytvor(L) {
    var TYPY = L.TYPY, esc = L.esc;

    function ikona(nazev) { return prefixujTridy(L.ikona(nazev)); }
    function zastupny(typ) { return prefixujTridy(L.zastupnyObrazek(typ)); }

    // Odkaz na článek / produkt: na vlastním webu bez UTM (interní UTM by v Google Analytics
    // přepsaly zdroj návštěvy), jinde s UTM jako na stránce kalendar/.
    function odkazWebu(u, typ, obsah, hostitel) {
      var url = L.bezpecnaUrl(u);
      if (!url) return '';
      if (hostitel && new URL(url).hostname.replace(/^www\./, '') === String(hostitel).replace(/^www\./, '')) return url;
      return L.pridejUtm(url, typ, obsah);
    }

    function idKarty(a) { return 'hs-kal-akce-' + String(a.id || L.bezDiakritiky(a.nazev).replace(/[^a-z0-9]+/g, '-')); }

    // ---------- JSON-LD pro Google ----------
    function datumLd(puvodni, d, sCasem) {
      if (sCasem && puvodni && /T\d/.test(puvodni)) return String(puvodni);
      return L.isoDen(d);
    }

    function eventLd(a) {
      var url = L.bezpecnaUrl(a.url);
      var img = L.obrazekAkce(a);
      var adresa = { '@type': 'PostalAddress', addressCountry: 'CZ' };
      if (a.obec || a.adresa) adresa.addressLocality = a.obec || a.adresa;
      if (a.kraj) adresa.addressRegion = a.kraj;
      if (a.adresa && a.adresa !== adresa.addressLocality) adresa.streetAddress = a.adresa;
      var ev = {
        '@type': 'Event',
        name: String(a.nazev),
        startDate: datumLd(a.zacatek, a._z, a._sCasem),
        endDate: datumLd(a.konec || (a._sCasem ? a.zacatek : ''), a._k, a._sCasem),
        eventStatus: 'https://schema.org/' + (a.zruseno ? 'EventCancelled' : a.presunuto ? 'EventRescheduled' : 'EventScheduled'),
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: String(a.misto || a.obec || a.adresa || a.kraj || 'Česká republika'), address: adresa }
      };
      if (a.popis) ev.description = String(a.popis);
      if (img) ev.image = [img];
      if (url) ev.url = url;
      return ev;
    }

    // Všechny nadcházející akce (bez ohledu na filtry), seřazené jako v kalendáři.
    function jsonLd(akce, ted, nazev, adresaStranky) {
      var c = L.rozdelAkce(akce, ted);
      var vse = c.probiha.concat(c.nadchazejici).slice(0, MAX_JSONLD);
      var ld = {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: nazev || 'Kalendář dopravních akcí pro děti',
        numberOfItems: vse.length,
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: vse.map(function (a, i) {
          return { '@type': 'ListItem', position: i + 1, item: eventLd(a) };
        })
      };
      if (adresaStranky) ld.url = adresaStranky;
      return ld;
    }

    // JSON do <script>: „<“ jako <, aby text akce nemohl ukončit značku.
    function jsonLdText(ld) {
      return JSON.stringify(ld).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    }

    // ---------- HTML karet ----------
    // Datum na kartě: v chronologickém seznamu den, pod kterým akce je (u probíhající dnešek),
    // u dlouhodobé akce začátek, nebo „do …“, když už běží.
    function datumBadge(a, p, ted) {
      var doKonce = p.dlouhodoba && a._z < L.zacatekDne(ted);
      var d = p.dlouhodoba ? (doKonce ? a._k : a._z) : p.den;
      return '<div class="hs-kal-datum' + (doKonce ? ' hs-kal-datum-do' : '') + '" aria-hidden="true">' +
        (doKonce ? '<small>do</small>' : '') +
        '<strong>' + d.getDate() + '</strong><span>' + L.MESICE_ZKR[d.getMonth()] + '</span></div>';
    }

    function komercniPrvek(a, kontext) {
      var mon = kontext.mon, ted = kontext.ted;
      if (!L.monetizaceZapnuta(mon) || a.zruseno) return ''; // u zrušené akce nic neprodáváme
      var typ = L.hlavniTyp(a);
      if (mon.nabidky !== false && kontext.nabidky) {
        var n = L.vyberNabidku(kontext.nabidky, a, kontext.pouziteNabidky, ted);
        if (n) {
          kontext.pouziteNabidky[n.url] = true;
          return '<aside class="hs-kal-nabidka">' +
            '<p class="hs-kal-oznaceni">Tip na výlet (reklama)</p>' +
            '<a href="' + esc(L.pridejUtm(n.url, typ, 'nabidka')) + '" target="_blank" rel="' + PARTNERSKY_REL + '">' +
              esc(n.nazev) + '</a>' +
            (n.popis ? '<p>' + esc(n.popis) + '</p>' : '') +
          '</aside>';
        }
      }
      var booking = L.bookingOdkaz(a, mon, ted);
      if (booking) {
        return '<a class="hs-kal-tlacitko hs-kal-tlacitko-partner" href="' + esc(booking) + '" target="_blank" rel="' + PARTNERSKY_REL + '">' +
          ikona('postel') + '<span>Ubytování poblíž</span><small>partnerský odkaz · Booking.com</small></a>';
      }
      return '';
    }

    // p = položka seznamu { den, probiha, dalsiDen, dlouhodoba }; id jen u prvního výskytu akce
    function karta(a, p, kontext, trida, sId) {
      var ted = kontext.ted;
      var konkretniDen = L.maKonkretniDny(a) && !p.dlouhodoba;
      var typ = L.hlavniTyp(a);
      var url = odkazWebu(a.url, typ, 'clanek', kontext.hostitel);
      var img = L.obrazekAkce(a);
      var misto = [a.misto, a.obec && (a.misto || '').indexOf(a.obec) < 0 ? a.obec : ''].filter(Boolean).join(', ');

      var stitky = [];
      if (a.zruseno) stitky.push('<li class="hs-kal-pozor">Zrušeno</li>');
      if (a.presunuto) stitky.push('<li class="hs-kal-pozor">Přesunuto</li>');
      if (p.probiha) stitky.push('<li class="hs-kal-probiha">' + esc(L.stitekProbiha(a, ted)) + '</li>');
      if (p.dlouhodoba) stitky.push('<li class="hs-kal-obdobi">' + esc(L.stitekOdDo(a, ted)) + '</li>');
      if (p.dalsiDen) stitky.push('<li class="hs-kal-obdobi">další termín ' + esc(L.formatDenKonani(p.dalsiDen, ted)) + '</li>');
      a._typy.forEach(function (t) {
        stitky.push('<li>' + (t === 'ostatni' ? '' : ikona(t)) + TYPY[t].nazev + '</li>');
      });
      if (a.kraj) stitky.push('<li>' + esc(a.kraj) + '</li>');

      return '<article class="hs-kal-karta' + (a.zruseno ? ' hs-kal-zrusena' : '') + (trida ? ' ' + trida : '') + '"' + (sId ? ' id="' + esc(idKarty(a)) + '"' : '') + '>' +
        '<div class="hs-kal-karta-obrazek" data-typ="' + typ + '">' +
          (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : zastupny(typ)) +
          datumBadge(a, p, ted) +
        '</div>' +
        '<div class="hs-kal-karta-telo">' +
          '<h3>' + esc(a.nazev) + '</h3>' +
          '<p class="hs-kal-termin"><time datetime="' + esc(konkretniDen ? L.isoDen(p.den) : a.zacatek) + '">' +
            esc(konkretniDen ? L.formatDenKonani(p.den, ted) : L.formatTermin(a, ted)) + '</time></p>' +
          (misto ? '<p class="hs-kal-misto">' + ikona('misto') + '<span>' + esc(misto) + '</span></p>' : '') +
          (stitky.length ? '<ul class="hs-kal-stitky">' + stitky.join('') + '</ul>' : '') +
          '<div class="hs-kal-karta-akce">' +
            (url ? '<a class="hs-kal-tlacitko" href="' + esc(url) + '">Více o akci</a>' : '') +
            '<div class="hs-kal-male-akce">' +
              '<button type="button" class="hs-kal-male" data-hs-kal-akce="ics" data-id="' + esc(a.id) + '">' + ikona('kalendar') + '<span>Přidat do kalendáře</span></button>' +
              '<button type="button" class="hs-kal-male" data-hs-kal-akce="sdilet" data-id="' + esc(a.id) + '">' + ikona('sdilet') + '<span>Sdílet</span></button>' +
            '</div>' +
            komercniPrvek(a, kontext) +
          '</div>' +
        '</div>' +
      '</article>';
    }

    function dlazdiceProduktu(p, typ, trida, hostitel) {
      var url = odkazWebu(p.url, typ, 'eshop', hostitel);
      var img = L.bezpecnaUrl(p.obrazek);
      var cena = typeof p.cena === 'number' ? p.cena.toLocaleString('cs-CZ') + ' Kč' : '';
      return '<aside class="hs-kal-karta hs-kal-produkt' + (trida ? ' ' + trida : '') + '">' +
        '<a href="' + esc(url) + '">' +
          '<p class="hs-kal-oznaceni">Z našeho e-shopu</p>' +
          '<div class="hs-kal-produkt-obrazek">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : zastupny(typ)) + '</div>' +
          '<div class="hs-kal-karta-telo">' +
            '<h3>' + esc(p.nazev) + '</h3>' +
            (cena ? '<p class="hs-kal-cena">' + (p.puvodni_cena > p.cena ? '<s>' + p.puvodni_cena.toLocaleString('cs-CZ') + ' Kč</s> ' : '') + esc(cena) + '</p>' : '') +
            '<span class="hs-kal-tlacitko hs-kal-tlacitko-obrys">Prohlédnout v e-shopu</span>' +
          '</div>' +
        '</a>' +
      '</aside>';
    }

    function sklonujAkce(n) {
      if (n === 1) return '1 akce';
      if (n >= 2 && n <= 4) return n + ' akce';
      return n + ' akcí';
    }

    // HTML seznamu akcí pro daný výsledek filtrování: jeden souvislý seznam podle data
    // („Dnes“, pak měsíce) a pod ním sbalitelná sekce „Sezónní a dlouhodobé akce“.
    // kontext: { ted, stav, mon, produkty, nabidky, reklamaKazda, hostitel }
    // Místa pro reklamu jen v chronologickém seznamu (ve sbalené sekci by nebyla vidět).
    function seznamHtml(vysledek, kontext) {
      var ted = kontext.ted, mon = kontext.mon;
      var seznam = L.sestavSeznam(vysledek, kontext.stav || L.prazdnyStav(), ted);

      var kazda = L.monetizaceZapnuta(mon) && mon.eshop !== false && kontext.produkty ? Math.max(2, +mon.eshop_kazda_karta || 6) : 0;
      var celkem = seznam.pocetPolozek;
      var pouziteProdukty = {}, sId = {};
      kontext.pouziteNabidky = {};
      var pocitadlo = { karet: 0 };

      function produktPo(a, poradi) {
        if (!kazda || poradi % kazda !== 0 || poradi >= celkem + seznam.dlouhodobe.length) return null;
        var typ = L.hlavniTyp(a);
        var p = L.vyberProdukt(kontext.produkty, typ, a.id || a.nazev, pouziteProdukty);
        if (p) pouziteProdukty[p.url] = true;
        return p;
      }

      function blokyHtml(bloky) {
        return bloky.map(function (b) {
          if (b.druh === 'reklama') return '<div class="hs-kal-reklama"></div>';
          var siroke = sirokeVMrizce(b.polozky.length);
          return '<div class="hs-kal-mrizka">' + b.polozky.map(function (x, i) {
            var trida = i >= b.polozky.length - siroke ? 'hs-kal-siroka' : '';
            if (x.druh === 'produkt') return dlazdiceProduktu(x.produkt, L.hlavniTyp(x.akce), trida, kontext.hostitel);
            var prvni = !sId[x.akce.id];
            sId[x.akce.id] = true;
            return karta(x.akce, x.polozka, kontext, trida, prvni);
          }).join('') + '</div>';
        }).join('');
      }

      var html = seznam.skupiny.map(function (s) {
        var bloky = rozlozSkupinu(s.polozky, { reklamaKazda: kontext.reklamaKazda, celkem: celkem, produktPo: produktPo }, pocitadlo);
        return '<section class="hs-kal-skupina-akci' + (s.klic === 'dnes' ? ' hs-kal-dnes-sekce' : '') + '">' +
          '<h2 class="hs-kal-mesic">' + esc(s.nazev) + '</h2>' + blokyHtml(bloky) + '</section>';
      }).join('');
      if (seznam.dlouhodobe.length) {
        var polozky = seznam.dlouhodobe.map(function (a) { return { akce: a, den: a._z, dlouhodoba: true }; });
        var bloky = rozlozSkupinu(polozky, { reklamaKazda: 0, celkem: celkem, produktPo: produktPo }, pocitadlo);
        html += '<details class="hs-kal-skupina-akci hs-kal-dlouhodobe" id="hs-kal-dlouhodobe"' + (seznam.skupiny.length ? '' : ' open') + '>' +
          '<summary><h2 class="hs-kal-mesic">Sezónní a dlouhodobé akce <span class="hs-kal-pocet-dlouhodobych">(' +
            seznam.dlouhodobe.length + ')</span></h2></summary>' + blokyHtml(bloky) + '</details>';
      }
      return html;
    }

    function souhrnText(pocet, filtruje) {
      return filtruje ? 'Nalezeno: ' + sklonujAkce(pocet) : 'Nadcházející akce: ' + pocet;
    }

    function seradKraje(akce, vybrany) {
      var pocty = {};
      akce.forEach(function (a) { if (a.kraj) pocty[a.kraj] = (pocty[a.kraj] || 0) + 1; });
      var kraje = Object.keys(pocty).sort(function (a, b) {
        var ia = PORADI_KRAJU.indexOf(a), ib = PORADI_KRAJU.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'cs');
      });
      if (vybrany && !pocty[vybrany]) kraje.push(vybrany);
      return kraje.map(function (k) { return { nazev: k, pocet: pocty[k] || 0 }; });
    }

    return {
      ikona: ikona,
      odkazWebu: odkazWebu,
      idKarty: idKarty,
      eventLd: eventLd,
      jsonLd: jsonLd,
      jsonLdText: jsonLdText,
      karta: karta,
      seznamHtml: seznamHtml,
      souhrnText: souhrnText,
      seradKraje: seradKraje,
      sklonujAkce: sklonujAkce
    };
  }

  // ---------- Styly (vše pod #hs-kalendar) ----------
  var S = '#' + ID_KORENE;
  var CSS = [
    S + '{--hs-kal-zelena:#1f6f3d;--hs-kal-zelena-tmava:#16532d;--hs-kal-zelena-svetla:#e6f1ea;--hs-kal-cihlova:#c0392b;' +
      '--hs-kal-cihlova-svetla:#fbeae7;--hs-kal-text:#1d2420;--hs-kal-tlumeny:#59635d;--hs-kal-pozadi:#f6f5f1;--hs-kal-okraj:#dfe3dd;' +
      '--hs-kal-stin:0 1px 2px rgba(0,0,0,.06),0 4px 14px rgba(0,0,0,.06);--hs-kal-radius:14px;' +
      'display:block;container:hs-kal/inline-size;clear:both;width:auto;max-width:100%;margin:0 0 24px;padding:0;' +
      'color:var(--hs-kal-text);font-size:16px;line-height:1.45;text-align:left;letter-spacing:normal;word-break:normal;overflow-wrap:break-word}',
    S + ' *,' + S + ' *::before,' + S + ' *::after{box-sizing:border-box}',
    // reset prvků, které šablona e-shopu může stylovat
    S + ' h2,' + S + ' h3,' + S + ' p,' + S + ' ul,' + S + ' li,' + S + ' form,' + S + ' label,' + S + ' section,' + S + ' article,' +
      S + ' aside,' + S + ' time,' + S + ' small,' + S + ' strong,' + S + ' s{margin:0;padding:0;border:0;background:none;box-shadow:none;' +
      'font-family:inherit;text-transform:none;text-indent:0;letter-spacing:normal;float:none;text-align:inherit}',
    S + ' li{list-style:none}',
    S + ' li::before,' + S + ' li::after,' + S + ' h2::after,' + S + ' h3::after,' + S + ' h3::before{content:none}',
    S + ' h2,' + S + ' h3{font-weight:700;color:inherit;text-decoration:none}',
    S + ' a{color:var(--hs-kal-zelena)}',
    S + ' img{max-width:none;border:0;border-radius:0;box-shadow:none}',
    S + ' button,' + S + ' input,' + S + ' select{margin:0;font:inherit;font-size:inherit;line-height:1.3;text-transform:none;letter-spacing:normal;' +
      'box-shadow:none;height:auto;float:none;text-shadow:none}',
    S + ' [hidden]{display:none!important}',
    S + ' .hs-kal-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    S + ' .hs-kal-ikona{display:inline-block;flex:0 0 auto;width:1.15em;height:1.15em;vertical-align:-.2em;fill:none}',

    // filtry
    S + ' .hs-kal-filtry{display:block;margin:0;padding:10px 0;border-bottom:1px solid var(--hs-kal-okraj)}',
    S + ' .hs-kal-horni-radek{display:grid;grid-template-columns:1fr auto;gap:8px}',
    S + ' .hs-kal-hledani{display:block}',
    S + ' .hs-kal-hledani input,' + S + ' .hs-kal-vyber select,' + S + ' .hs-kal-vlastni input{display:block;width:100%;max-width:none;min-height:46px;' +
      'padding:10px 14px;color:var(--hs-kal-text);background:#fff;border:1px solid var(--hs-kal-okraj);border-radius:999px;-webkit-appearance:none;appearance:none;outline:0}',
    S + ' .hs-kal-vyber select{padding-right:38px;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' fill=\'none\' stroke=\'%231f6f3d\' stroke-width=\'2\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 14px center}',
    S + ' .hs-kal-vlastni input{min-height:42px;padding:6px 12px}',
    S + ' .hs-kal-hledani input:focus,' + S + ' .hs-kal-vyber select:focus,' + S + ' .hs-kal-vlastni input:focus,' + S + ' .hs-kal-cip:focus-visible,' +
      S + ' .hs-kal-male:focus-visible,' + S + ' .hs-kal-prepinac:focus-visible,' + S + ' .hs-kal-tlacitko:focus-visible{outline:3px solid rgba(31,111,61,.35);outline-offset:1px;border-color:var(--hs-kal-zelena)}',
    S + ' .hs-kal-prepinac{display:inline-flex;align-items:center;gap:6px;min-height:46px;padding:8px 16px;font-weight:700;color:#fff;' +
      'background:var(--hs-kal-zelena);border:0;border-radius:999px;cursor:pointer;width:auto}',
    S + ' .hs-kal-prepinac::after{content:"";width:8px;height:8px;margin-left:2px;border:solid currentColor;border-width:0 2px 2px 0;transform:translateY(-2px) rotate(45deg);transition:transform .15s ease}',
    S + ' .hs-kal-prepinac[aria-expanded="true"]::after{transform:translateY(2px) rotate(-135deg)}',
    S + ' .hs-kal-pocet-filtru{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;font-size:.8rem;color:var(--hs-kal-zelena);background:#fff;border-radius:999px}',
    S + ' .hs-kal-panel{display:none;gap:12px;padding:12px 2px 4px}',
    S + ' .hs-kal-panel.hs-kal-otevreno{display:grid}',
    S + ' .hs-kal-skupina{display:grid;gap:8px}',
    S + ' .hs-kal-popisek{display:block;margin:0;font-size:.8rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-skupina .hs-kal-vyber{display:grid;gap:8px}',
    S + ' .hs-kal-cipy{display:flex;flex-wrap:wrap;gap:8px}',
    S + ' .hs-kal-cip{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;width:auto;min-height:40px;padding:6px 14px;font-size:.95rem;font-weight:600;' +
      'color:var(--hs-kal-zelena);background:#fff;border:2px solid var(--hs-kal-zelena);border-radius:999px;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    S + ' .hs-kal-cip .hs-kal-ikona{width:1.3em;height:1.3em}',
    S + ' .hs-kal-cip[aria-pressed="true"]{color:#fff;background:var(--hs-kal-zelena)}',
    S + ' .hs-kal-radek-datum{display:grid;gap:8px}',
    S + ' .hs-kal-vlastni{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    S + ' .hs-kal-vlastni label{display:grid;gap:2px;font-size:.85rem;font-weight:600;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-tlacitko-hotovo{width:100%;border:0;font-weight:700;cursor:pointer}',

    // souhrn
    S + ' .hs-kal-souhrn{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 12px;margin:14px 0 4px;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-odkaz{width:auto;min-height:0;padding:6px 0;font-weight:600;color:var(--hs-kal-cihlova);background:none;border:0;border-radius:0;text-decoration:underline;cursor:pointer}',

    // seznam
    S + ' .hs-kal-skupina-akci{display:block;margin-top:18px}',
    S + ' .hs-kal-mesic{margin:0 0 10px;font-size:1.1rem;line-height:1.3;color:var(--hs-kal-zelena);text-transform:capitalize}',
    S + ' .hs-kal-dnes-sekce .hs-kal-mesic{color:var(--hs-kal-cihlova);text-transform:none}',
    S + ' .hs-kal-dnes-sekce .hs-kal-mesic::before{content:"";display:inline-block;width:10px;height:10px;margin-right:8px;background:var(--hs-kal-cihlova);' +
      'border-radius:50%;box-shadow:0 0 0 4px var(--hs-kal-cihlova-svetla);vertical-align:.05em}',
    S + ' .hs-kal-dlouhodobe{margin-top:28px;padding-top:14px;border-top:1px solid var(--hs-kal-okraj)}',
    S + ' .hs-kal-dlouhodobe summary{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 0 10px;padding:0;cursor:pointer;list-style:none}',
    S + ' .hs-kal-dlouhodobe summary::-webkit-details-marker{display:none}',
    S + ' .hs-kal-dlouhodobe summary::after{content:"";width:9px;height:9px;margin-left:2px;border:solid var(--hs-kal-zelena);border-width:0 2px 2px 0;' +
      'transform:rotate(45deg) translateY(-3px);transition:transform .15s}',
    S + ' .hs-kal-dlouhodobe[open] summary::after{transform:rotate(-135deg) translateY(-1px)}',
    S + ' .hs-kal-dlouhodobe summary .hs-kal-mesic{margin:0;text-transform:none}',
    S + ' .hs-kal-pocet-dlouhodobych{color:var(--hs-kal-tlumeny);font-weight:400}',
    S + ' .hs-kal-dlouhodobe summary:focus-visible{outline:3px solid var(--hs-kal-zelena);outline-offset:3px;border-radius:6px}',
    S + ' .hs-kal-mrizka{display:grid;gap:14px}',
    S + ' .hs-kal-mrizka + .hs-kal-reklama,' + S + ' .hs-kal-reklama + .hs-kal-mrizka{margin-top:14px}',
    S + ' .hs-kal-reklama{display:block;clear:both;width:100%;overflow:hidden;text-align:center}',
    S + ' .hs-kal-karta{display:flex;flex-direction:column;overflow:hidden;min-width:0;background:#fff;border-radius:var(--hs-kal-radius);box-shadow:var(--hs-kal-stin);scroll-margin-top:90px}',
    S + ' .hs-kal-karta.hs-kal-zvyraznena{outline:3px solid var(--hs-kal-cihlova);outline-offset:2px}',
    S + ' .hs-kal-karta-obrazek{position:relative;aspect-ratio:16/9;background:var(--hs-kal-zelena-svetla)}',
    S + ' .hs-kal-karta-obrazek img,' + S + ' .hs-kal-produkt-obrazek img{display:block;width:100%;height:100%;margin:0;object-fit:cover}',
    S + ' .hs-kal-zastupny{position:relative;display:grid;place-items:center;height:100%;overflow:hidden;color:#fff;' +
      'background:radial-gradient(circle at 85% 15%,rgba(255,255,255,.12) 0 18%,transparent 19%),radial-gradient(circle at 10% 95%,rgba(255,255,255,.08) 0 25%,transparent 26%),' +
      'linear-gradient(135deg,var(--hs-kal-zelena) 0%,var(--hs-kal-zelena-tmava) 100%)}',
    S + ' .hs-kal-zastupny-kruh{display:grid;place-items:center;width:38%;max-width:120px;aspect-ratio:1;border:2px solid rgba(255,255,255,.55);border-radius:50%}',
    S + ' .hs-kal-zastupny-kruh .hs-kal-ikona{width:56%;height:56%;stroke-width:1.5}',
    S + ' .hs-kal-zastupny-znacka{position:absolute;right:12px;bottom:8px;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}',
    S + ' .hs-kal-zastupny-znacka::before{content:"● ";color:var(--hs-kal-cihlova)}',
    S + ' .hs-kal-datum{position:absolute;left:12px;bottom:-18px;min-width:58px;padding:6px 8px;text-align:center;color:#fff;background:var(--hs-kal-cihlova);' +
      'border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.2);line-height:1.05}',
    S + ' .hs-kal-datum small{display:block;font-size:.7rem;text-transform:uppercase;opacity:.9;color:inherit}',
    S + ' .hs-kal-datum strong{display:block;font-size:1.45rem;color:inherit}',
    S + ' .hs-kal-datum span{font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}',
    S + ' .hs-kal-karta-telo{display:flex;flex:1;flex-direction:column;gap:6px;padding:26px 14px 14px}',
    S + ' .hs-kal-karta h3{margin:0;font-size:1.12rem;line-height:1.25;color:var(--hs-kal-text)}',
    S + ' .hs-kal-termin{font-weight:600}',
    S + ' .hs-kal-misto{display:flex;gap:4px;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-misto .hs-kal-ikona{color:var(--hs-kal-zelena);margin-top:.1em}',
    S + ' .hs-kal-stitky{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px;padding:0}',
    S + ' .hs-kal-stitky li{display:inline-flex;align-items:center;gap:4px;margin:0;padding:2px 10px;font-size:.82rem;font-weight:600;line-height:1.45;' +
      'color:var(--hs-kal-zelena-tmava);background:var(--hs-kal-zelena-svetla);border-radius:999px}',
    S + ' .hs-kal-stitky .hs-kal-ikona{color:var(--hs-kal-zelena)}',
    S + ' .hs-kal-stitky .hs-kal-pozor{color:#fff;background:var(--hs-kal-cihlova)}',
    S + ' .hs-kal-stitky .hs-kal-probiha{color:var(--hs-kal-cihlova);background:var(--hs-kal-cihlova-svetla)}',
    S + ' .hs-kal-stitky .hs-kal-obdobi{color:var(--hs-kal-zelena-tmava);background:var(--hs-kal-zelena-svetla)}',
    S + ' .hs-kal-karta-akce{display:grid;gap:8px;margin-top:auto}',
    S + ' .hs-kal-tlacitko{display:block;width:auto;padding:12px 16px;text-align:center;font-weight:700;line-height:1.3;color:#fff;background:var(--hs-kal-zelena);' +
      'border:0;border-radius:999px;text-decoration:none}',
    S + ' a.hs-kal-tlacitko:hover,' + S + ' a.hs-kal-tlacitko:focus{color:#fff;background:var(--hs-kal-zelena-tmava);text-decoration:none}',
    S + ' .hs-kal-tlacitko-obrys,' + S + ' .hs-kal-produkt a:hover .hs-kal-tlacitko-obrys{color:var(--hs-kal-zelena);background:#fff;border:2px solid var(--hs-kal-zelena);padding:10px 16px}',
    S + ' .hs-kal-male-akce{display:grid;grid-template-columns:1fr auto;gap:8px}',
    S + ' .hs-kal-male{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:auto;min-height:40px;padding:6px 14px;font-size:.86rem;white-space:nowrap;' +
      'font-weight:600;color:var(--hs-kal-zelena);background:var(--hs-kal-zelena-svetla);border:0;border-radius:999px;cursor:pointer}',
    S + ' .hs-kal-male:hover{color:var(--hs-kal-zelena);background:#d5e8db}',
    S + ' a.hs-kal-tlacitko-partner,' + S + ' a.hs-kal-tlacitko-partner:hover{display:grid;grid-template-columns:auto 1fr;align-items:center;column-gap:8px;padding:8px 14px;' +
      'text-align:left;font-weight:600;color:var(--hs-kal-text);background:#fff;border:1px solid var(--hs-kal-okraj)}',
    S + ' a.hs-kal-tlacitko-partner:hover{background:var(--hs-kal-pozadi)}',
    S + ' .hs-kal-tlacitko-partner .hs-kal-ikona{grid-row:span 2;color:var(--hs-kal-zelena);width:1.4em;height:1.4em}',
    S + ' .hs-kal-tlacitko-partner small{font-size:.74rem;font-weight:400;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-oznaceni{margin:0;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-nabidka{display:grid;gap:2px;padding:10px 12px;font-size:.9rem;background:var(--hs-kal-pozadi);border:1px dashed var(--hs-kal-okraj);border-radius:10px}',
    S + ' .hs-kal-nabidka a{font-weight:700}',
    S + ' .hs-kal-nabidka p:not(.hs-kal-oznaceni){color:var(--hs-kal-tlumeny)}',
    S + ' .hs-kal-produkt{background:#fffdf7;border:1px solid #efe7d2;box-shadow:none}',
    S + ' .hs-kal-produkt > a{display:flex;flex:1;flex-direction:column;color:inherit;text-decoration:none}',
    S + ' .hs-kal-produkt .hs-kal-oznaceni{padding:10px 14px 0}',
    S + ' .hs-kal-produkt-obrazek{aspect-ratio:16/9;margin:8px 14px 0;overflow:hidden;background:#fff;border-radius:10px}',
    S + ' .hs-kal-produkt-obrazek img{object-fit:contain}',
    S + ' .hs-kal-produkt .hs-kal-karta-telo{padding-top:10px}',
    S + ' .hs-kal-produkt .hs-kal-tlacitko{margin-top:auto}',
    S + ' .hs-kal-cena{font-weight:700;color:var(--hs-kal-cihlova)}',
    S + ' .hs-kal-cena s{font-weight:400;color:var(--hs-kal-tlumeny);text-decoration:line-through}',
    S + ' .hs-kal-karta.hs-kal-zrusena h3{text-decoration:line-through}',
    S + ' .hs-kal-info{margin:28px 0;padding:18px;text-align:center;color:var(--hs-kal-tlumeny);background:var(--hs-kal-pozadi);border-radius:var(--hs-kal-radius)}',
    S + ' .hs-kal-oznameni{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));z-index:2147483000;margin:0;padding:10px 18px;color:#fff;' +
      'background:var(--hs-kal-text);border-radius:999px;transform:translateX(-50%);box-shadow:var(--hs-kal-stin)}',
    S + ' .hs-kal-paticka{margin-top:32px;padding-top:16px;font-size:.92rem;color:var(--hs-kal-tlumeny);border-top:1px solid var(--hs-kal-okraj)}',
    S + ' .hs-kal-paticka p{margin:0 0 6px}',
    S + ' .hs-kal-drobne{font-size:.82rem}',

    // širší obsah stránky (podle šířky bloku, ne okna – v Shoptetu bývá vedle obsahu menu)
    '@container hs-kal (min-width: 600px){' +
      S + ' .hs-kal-mrizka{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      S + ' .hs-kal-filtry{padding:14px 0}' +
      S + ' .hs-kal-horni-radek{grid-template-columns:1fr}' +
      S + ' .hs-kal-prepinac,' + S + ' .hs-kal-tlacitko-hotovo{display:none}' +
      S + ' .hs-kal-panel{display:grid;grid-template-columns:1fr 1fr;padding:12px 0 0}' +
      S + ' .hs-kal-skupina:nth-child(2){grid-column:1/-1}' +
      S + ' .hs-kal-radek-datum{grid-template-columns:minmax(200px,260px) 1fr;align-items:end}' +
      S + ' .hs-kal-vlastni{max-width:400px}' +
    '}',
    // 3 sloupce (6 dílků); když by v poslední řadě zůstala jediná karta, poslední 4 jdou 2×2
    '@container hs-kal (min-width: 860px){' +
      S + ' .hs-kal-mrizka{grid-template-columns:repeat(6,minmax(0,1fr))}' +
      S + ' .hs-kal-mrizka > *{grid-column:span 2}' +
      S + ' .hs-kal-mrizka > .hs-kal-siroka{grid-column:span 3}' +
      S + ' .hs-kal-panel{grid-template-columns:1fr 320px}' +
      S + ' .hs-kal-skupina:nth-child(1){grid-column:1}' +
      S + ' .hs-kal-skupina:nth-child(3){grid-column:2;grid-row:1;align-self:end}' +
    '}',
    '@media (prefers-reduced-motion: no-preference){' + S + ' .hs-kal-karta{transition:transform .15s ease}' + S + ' .hs-kal-karta:hover{transform:translateY(-2px)}}'
  ].join('\n');

  function kostraHtml() {
    return '' +
      '<form class="hs-kal-filtry" role="search" onsubmit="return false">' +
        '<div class="hs-kal-horni-radek">' +
          '<label class="hs-kal-hledani"><span class="hs-kal-sr">Hledat akci</span>' +
            '<input type="search" data-hs-kal="hledat" placeholder="Hledat: název, město, místo…" autocomplete="off" enterkeyhint="search"></label>' +
          '<button type="button" class="hs-kal-prepinac" data-hs-kal="prepinac" aria-expanded="false" aria-controls="hs-kal-panel">' +
            '<span>Filtry</span> <span class="hs-kal-pocet-filtru" data-hs-kal="pocet-filtru" hidden></span></button>' +
        '</div>' +
        '<div class="hs-kal-panel" id="hs-kal-panel" data-hs-kal="panel">' +
          '<div class="hs-kal-skupina">' +
            '<p class="hs-kal-popisek" id="hs-kal-popisek-typ">Typ</p>' +
            '<div class="hs-kal-cipy" role="group" aria-labelledby="hs-kal-popisek-typ" data-hs-kal="cipy-typ"></div>' +
          '</div>' +
          '<div class="hs-kal-skupina">' +
            '<p class="hs-kal-popisek" id="hs-kal-popisek-kdy">Kdy</p>' +
            '<div class="hs-kal-cipy" role="group" aria-labelledby="hs-kal-popisek-kdy" data-hs-kal="cipy-kdy"></div>' +
            '<div class="hs-kal-radek-datum">' +
              '<label class="hs-kal-vyber"><span class="hs-kal-sr">Vybrat měsíc</span><select data-hs-kal="mesic"></select></label>' +
              '<div class="hs-kal-vlastni" data-hs-kal="vlastni" hidden>' +
                '<label><span>Od</span> <input type="date" data-hs-kal="od"></label>' +
                '<label><span>Do</span> <input type="date" data-hs-kal="do"></label>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="hs-kal-skupina">' +
            '<label class="hs-kal-vyber"><span class="hs-kal-popisek">Kraj</span>' +
              '<select data-hs-kal="kraj"><option value="">Všechny kraje</option></select></label>' +
          '</div>' +
          '<button type="button" class="hs-kal-tlacitko hs-kal-tlacitko-hotovo" data-hs-kal="hotovo">Zobrazit akce</button>' +
        '</div>' +
      '</form>' +
      '<div class="hs-kal-souhrn" aria-live="polite">' +
        '<p data-hs-kal="pocet"></p>' +
        '<button type="button" class="hs-kal-odkaz" data-hs-kal="zrusit" hidden>Zrušit filtry</button>' +
      '</div>' +
      '<div class="hs-kal-seznam" data-hs-kal="seznam"><p class="hs-kal-info">Načítám akce…</p></div>' +
      '<div class="hs-kal-paticka">' +
        '<p>Termíny se mohou změnit – před cestou si je prosím ověřte u pořadatele.</p>' +
        '<p class="hs-kal-drobne" data-hs-kal="partnerske" hidden>Některé odkazy jsou partnerské – pomáhají nám kalendář provozovat zdarma.</p>' +
        '<p class="hs-kal-drobne" data-hs-kal="aktualizace"></p>' +
      '</div>' +
      '<div class="hs-kal-oznameni" data-hs-kal="oznameni" role="status" aria-live="polite" hidden></div>';
  }

  // ---------- Spuštění v prohlížeči ----------
  function spust(okno) {
    var document = okno.document;
    var skript = document.currentScript;
    var zaklad = zakladZeSkriptu(skript && skript.src);

    function start() {
      var koren = document.getElementById(ID_KORENE);
      if (!koren || koren.getAttribute('data-hs-kal-spusteno')) return;
      koren.setAttribute('data-hs-kal-spusteno', '1');
      if (/[?&]hs-kal=vypnout\b/.test(okno.location.search)) return;
      var zakladDat = koren.getAttribute('data-zaklad') || zaklad;
      nactiLogiku(zakladDat, function (L) {
        if (!L) {
          koren.innerHTML = '<p style="padding:12px;text-align:center">Kalendář akcí se nepodařilo načíst. Zkuste stránku obnovit.</p>';
          return;
        }
        aplikace(okno, koren, L, zakladDat);
      });
    }

    function nactiLogiku(zakladDat, hotovo) {
      if (okno.KalendarLogika) return hotovo(okno.KalendarLogika);
      var s = document.createElement('script');
      s.src = zakladDat + 'logika.js';
      s.async = true;
      s.onload = function () { hotovo(okno.KalendarLogika || null); };
      s.onerror = function () { hotovo(null); };
      (document.head || document.documentElement).appendChild(s);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  function aplikace(okno, koren, L, zaklad) {
    var document = okno.document, location = okno.location, history = okno.history;
    var K = vytvor(L);
    var TYPY = L.TYPY, esc = L.esc;

    if (!document.getElementById('hs-kal-styly')) {
      var styl = document.createElement('style');
      styl.id = 'hs-kal-styly';
      styl.textContent = CSS;
      (document.head || document.documentElement).appendChild(styl);
    }
    koren.classList.add('hs-kal');
    koren.innerHTML = kostraHtml();

    function prvek(n) { return koren.querySelector('[data-hs-kal="' + n + '"]'); }
    var el = {
      hledat: prvek('hledat'), kraj: prvek('kraj'), mesic: prvek('mesic'), od: prvek('od'), do: prvek('do'),
      vlastni: prvek('vlastni'), cipyTyp: prvek('cipy-typ'), cipyKdy: prvek('cipy-kdy'), prepinac: prvek('prepinac'),
      panel: prvek('panel'), pocetFiltru: prvek('pocet-filtru'), hotovo: prvek('hotovo'), seznam: prvek('seznam'),
      pocet: prvek('pocet'), zrusit: prvek('zrusit'), aktualizace: prvek('aktualizace'), partnerske: prvek('partnerske'),
      oznameni: prvek('oznameni')
    };

    // „Dnes“ jde pro test přepsat: data-dnes="2026-12-01" nebo ?hs-kal-dnes=2026-12-01
    function dnes() {
      var p = new URLSearchParams(location.search).get('hs-kal-dnes') || koren.getAttribute('data-dnes') || '';
      var d = L.prectiDatum(p, false);
      if (!d || d.sCasem) return new Date();
      var t = new Date();
      d.datum.setHours(t.getHours(), t.getMinutes());
      return d.datum;
    }

    var atrReklama = koren.getAttribute('data-reklama-kazda');
    var reklamaKazda = atrReklama != null && atrReklama !== '' && !isNaN(+atrReklama) ? Math.max(0, +atrReklama | 0) : REKLAMA_KAZDA;
    var zdrojAkci = koren.getAttribute('data-akce') || zaklad + 'akce.json';
    var SOUBOR_MONETIZACE = zaklad + 'monetizace.json';
    var SOUBOR_PRODUKTU = zaklad + '../produkty/produkty.json';
    var SOUBORY_NABIDEK = [zaklad + 'nabidky.json', zaklad + '../nabidky/nabidky.json', zaklad + '../nabidky.json'];

    var pred = predvolba(koren.getAttribute('data-kraj'), koren.getAttribute('data-typ'), TYPY);
    // „Zrušit filtry“ vrátí stránku na její předvolbu (kraj/typ stránky)
    function vychoziStav() {
      var s = L.prazdnyStav();
      s.kraj = pred.kraj;
      s.typ = pred.typ;
      return s;
    }
    var stav = vychoziStav();
    var vlastniOtevreno = false;
    var akce = [], podleId = {};
    var mon = null, produkty = null, nabidky = null;

    // ---------- Ovládací prvky ----------
    function cip(atribut, hodnota, obsah) {
      return '<button type="button" class="hs-kal-cip" ' + atribut + '="' + esc(hodnota) + '" aria-pressed="false">' + obsah + '</button>';
    }
    el.cipyTyp.innerHTML = cip('data-typ', '', 'Vše') + L.PORADI_TYPU.map(function (t) {
      return cip('data-typ', t, (t === 'ostatni' ? '' : K.ikona(t)) + '<span>' + esc(TYPY[t].nazev) + '</span>');
    }).join('');
    el.cipyKdy.innerHTML = cip('data-kdy', '', 'Kdykoli') + L.KDY.map(function (k) {
      return cip('data-kdy', k[0], esc(k[1]));
    }).join('') + cip('data-kdy', 'vlastni', 'Vlastní termín');
    el.mesic.innerHTML = '<option value="">Vybrat měsíc…</option>' + L.mesiceDopredu(dnes(), 12).map(function (m) {
      return '<option value="' + m.hodnota + '">' + esc(m.nazev) + '</option>';
    }).join('');
    el.od.min = el.do.min = L.isoDen(dnes());

    function pocetAktivnich() {
      return (stav.typ ? 1 : 0) + (stav.kraj ? 1 : 0) + (L.filtrujeSeDatem(stav) ? 1 : 0);
    }
    // předvolba stránky se nepočítá jako filtr (tlačítko „Zrušit filtry“ se kvůli ní neukazuje)
    function nejakyFiltr() {
      return !!(stav.q || L.filtrujeSeDatem(stav) || stav.kraj !== pred.kraj || stav.typ !== pred.typ);
    }

    function ulozDoAdresy() {
      try {
        // do adresy jen to, co se liší od předvolby stránky („Všechny kraje“ na stránce kraje = kraj=)
        var s = Object.assign({}, stav);
        var qs = new URLSearchParams(L.adresaZeStavu(s));
        ['kraj', 'typ'].forEach(function (k) {
          if (pred[k] && stav[k] === pred[k]) qs.delete(k);
          else if (pred[k] && !stav[k]) qs.set(k, '');
        });
        history.replaceState(history.state, '', location.pathname + adresaSFiltry(location.search, qs.toString()) + location.hash);
      } catch (e) { /* např. v sandboxu – filtry jen nebudou v adrese */ }
    }

    function promitniStav() {
      if (el.hledat.value.trim() !== stav.q) el.hledat.value = stav.q;
      el.kraj.value = stav.kraj;
      if (stav.mesic && !el.mesic.querySelector('option[value="' + stav.mesic + '"]')) {
        var o = document.createElement('option');
        o.value = stav.mesic;
        o.textContent = stav.mesic;
        el.mesic.appendChild(o);
      }
      el.mesic.value = stav.mesic;
      el.od.value = stav.od;
      el.do.value = stav.do;
      var vlastni = vlastniOtevreno || !!(stav.od || stav.do);
      el.vlastni.hidden = !vlastni;
      el.cipyTyp.querySelectorAll('[data-typ]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-typ') === stav.typ));
      });
      el.cipyKdy.querySelectorAll('[data-kdy]').forEach(function (b) {
        var k = b.getAttribute('data-kdy');
        var aktivni = k === 'vlastni' ? vlastni : k === '' ? !L.filtrujeSeDatem(stav) && !vlastni : k === stav.kdy;
        b.setAttribute('aria-pressed', String(aktivni));
      });
      var n = pocetAktivnich();
      el.pocetFiltru.hidden = !n;
      el.pocetFiltru.textContent = n;
      el.zrusit.hidden = !nejakyFiltr();
    }

    function zmena() {
      promitniStav();
      ulozDoAdresy();
      vykresli();
    }

    function naplnKraje() {
      el.kraj.innerHTML = '<option value="">Všechny kraje</option>' + K.seradKraje(akce, stav.kraj).map(function (k) {
        return '<option value="' + esc(k.nazev) + '">' + esc(k.nazev) + (k.pocet ? ' (' + k.pocet + ')' : '') + '</option>';
      }).join('');
    }

    function vlozJsonLd() {
      var stary = document.getElementById('hs-kal-jsonld');
      if (stary) stary.remove();
      if (!akce.length) return;
      var s = document.createElement('script');
      s.type = 'application/ld+json';
      s.id = 'hs-kal-jsonld';
      var kanonicka = document.querySelector('link[rel="canonical"]');
      // na stránce kraje/typu jen akce, které stránka ukazuje
      var akceStranky = pred.kraj || pred.typ ? L.filtruj(akce, vychoziStav(), dnes()) : akce;
      if (!akceStranky.length) return;
      s.textContent = K.jsonLdText(K.jsonLd(akceStranky, dnes(), document.title ? String(document.title).split('|')[0].trim() : '',
        kanonicka ? kanonicka.href : location.origin + location.pathname));
      (document.head || document.documentElement).appendChild(s);
    }

    // ---------- Vykreslení ----------
    function vykresli() {
      var ted = dnes();
      var vysledek = L.filtruj(akce, stav, ted);
      el.pocet.textContent = K.souhrnText(vysledek.length, nejakyFiltr());
      if (!vysledek.length) {
        el.seznam.innerHTML = '<p class="hs-kal-info">' + (akce.length
          ? 'Pro zvolené filtry jsme nenašli žádnou akci. Zkuste jiný termín, kraj nebo typ.'
          : 'Zatím tu nejsou žádné nadcházející akce. Mrkněte sem brzy znovu.') + '</p>';
      } else {
        el.seznam.innerHTML = K.seznamHtml(vysledek, { ted: ted, stav: stav, mon: mon, produkty: produkty, nabidky: nabidky, reklamaKazda: reklamaKazda, hostitel: location.hostname });
      }
      // Místa pro reklamu jsou po každém vykreslení nová (prázdná) – kód reklamy se do nich vloží
      // v posluchači této události (viz README).
      var reklamy = Array.prototype.slice.call(el.seznam.querySelectorAll('.hs-kal-reklama'));
      var udalost;
      try {
        udalost = new okno.CustomEvent('hs-kalendar:vykresleno', { bubbles: true, detail: { reklamy: reklamy, pocet: vysledek.length } });
      } catch (e) {
        udalost = document.createEvent('CustomEvent');
        udalost.initCustomEvent('hs-kalendar:vykresleno', true, false, { reklamy: reklamy, pocet: vysledek.length });
      }
      koren.dispatchEvent(udalost);
    }

    // Nefunkční obrázek → jednotný zástupný obrázek s ikonou typu
    el.seznam.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      var obal = img.closest('[data-typ]');
      var typ = obal ? obal.getAttribute('data-typ') : 'ostatni';
      var div = document.createElement('div');
      div.innerHTML = prefixujTridy(L.zastupnyObrazek(typ));
      img.parentNode.replaceChild(div.firstChild, img);
    }, true);

    // ---------- Přidat do kalendáře, sdílet ----------
    var casovacOznameni;
    function oznam(text) {
      el.oznameni.textContent = text;
      el.oznameni.hidden = false;
      clearTimeout(casovacOznameni);
      casovacOznameni = setTimeout(function () { el.oznameni.hidden = true; }, 2600);
    }

    function stahniIcs(a) {
      var blob = new Blob([L.ics(a, new Date())], { type: 'text/calendar;charset=utf-8' });
      var odkaz = document.createElement('a');
      odkaz.href = URL.createObjectURL(blob);
      odkaz.download = L.nazevSouboru(a);
      odkaz.hidden = true;
      koren.appendChild(odkaz);
      odkaz.click();
      setTimeout(function () { URL.revokeObjectURL(odkaz.href); odkaz.remove(); }, 1000);
    }

    function zkopiruj(text) {
      if (okno.navigator.clipboard && okno.isSecureContext) return okno.navigator.clipboard.writeText(text);
      return new Promise(function (ok, chyba) {
        var t = document.createElement('textarea');
        t.value = text;
        t.setAttribute('readonly', '');
        t.style.position = 'fixed';
        t.style.opacity = '0';
        koren.appendChild(t);
        t.select();
        try { document.execCommand('copy') ? ok() : chyba(); } catch (e) { chyba(e); }
        t.remove();
      });
    }

    function sdilej(a) {
      var url = location.origin + location.pathname + '#' + K.idKarty(a);
      var data = { title: a.nazev, text: a.nazev + ' – ' + L.formatTermin(a, dnes()), url: url };
      if (okno.navigator.share) {
        okno.navigator.share(data).catch(function () {});
        return;
      }
      zkopiruj(url).then(function () { oznam('Odkaz zkopírován do schránky'); },
        function () { okno.prompt('Zkopírujte odkaz:', url); });
    }

    el.seznam.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-hs-kal-akce]');
      if (!b) return;
      var a = podleId[b.getAttribute('data-id')];
      if (!a) return;
      if (b.getAttribute('data-hs-kal-akce') === 'ics') stahniIcs(a);
      else sdilej(a);
    });

    // ---------- Události filtrů ----------
    var casovac;
    el.hledat.addEventListener('input', function () {
      clearTimeout(casovac);
      casovac = setTimeout(function () {
        stav.q = el.hledat.value.trim();
        el.zrusit.hidden = !nejakyFiltr();
        ulozDoAdresy();
        vykresli();
      }, 150);
    });
    el.kraj.addEventListener('change', function () { stav.kraj = el.kraj.value; zmena(); });
    el.cipyTyp.addEventListener('click', function (e) {
      var b = e.target.closest('[data-typ]');
      if (!b) return;
      stav.typ = b.getAttribute('data-typ');
      zmena();
    });
    function vymazDatum() { stav.kdy = stav.mesic = stav.od = stav.do = ''; }
    el.cipyKdy.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kdy]');
      if (!b) return;
      var k = b.getAttribute('data-kdy');
      vymazDatum();
      vlastniOtevreno = k === 'vlastni';
      if (k !== 'vlastni') stav.kdy = k;
      zmena();
      if (vlastniOtevreno) el.od.focus();
    });
    el.mesic.addEventListener('change', function () {
      vymazDatum();
      vlastniOtevreno = false;
      stav.mesic = el.mesic.value;
      zmena();
    });
    function zmenaRozsahu() {
      stav.kdy = stav.mesic = '';
      stav.od = el.od.value;
      stav.do = el.do.value;
      if (stav.od) el.do.min = stav.od;
      zmena();
    }
    el.od.addEventListener('change', zmenaRozsahu);
    el.do.addEventListener('change', zmenaRozsahu);
    el.zrusit.addEventListener('click', function () {
      stav = vychoziStav();
      vlastniOtevreno = false;
      zmena();
    });

    // Mobil: filtry v rozbalovacím panelu
    function nastavPanel(otevrit) {
      el.prepinac.setAttribute('aria-expanded', String(otevrit));
      el.panel.classList.toggle('hs-kal-otevreno', otevrit);
    }
    el.prepinac.addEventListener('click', function () {
      nastavPanel(el.prepinac.getAttribute('aria-expanded') !== 'true');
    });
    el.hotovo.addEventListener('click', function () {
      nastavPanel(false);
      el.seznam.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // ---------- Start ----------
    stav = pocatecniStav(L, location.search, pred);
    promitniStav();

    function nactiJson(adresa) {
      // bez cookies: credentials 'omit'
      return okno.fetch(adresa, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
    }
    function volitelne(adresa) { return nactiJson(adresa).catch(function () { return null; }); }
    function prvniExistujici(adresy) {
      return adresy.reduce(function (p, adresa) {
        return p.then(function (v) { return v || volitelne(adresa); });
      }, Promise.resolve(null));
    }

    var monetizaceHotova = volitelne(SOUBOR_MONETIZACE).then(function (m) {
      mon = m;
      if (!L.monetizaceZapnuta(mon)) return;
      el.partnerske.hidden = false;
      return Promise.all([
        mon.eshop !== false ? volitelne(SOUBOR_PRODUKTU).then(function (d) { produkty = d; }) : null,
        mon.nabidky !== false ? prvniExistujici(SOUBORY_NABIDEK).then(function (d) { nabidky = d; }) : null
      ]);
    });

    nactiJson(zdrojAkci)
      .then(function (data) {
        akce = L.pripravAkce(data, dnes());
        podleId = {};
        akce.forEach(function (a) { podleId[a.id] = a; });
        naplnKraje();
        promitniStav();
        vlozJsonLd();
        if (data.aktualizovano) {
          var d = new Date(data.aktualizovano);
          if (!isNaN(d)) {
            el.aktualizace.textContent = 'Seznam aktualizován ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' +
              d.getFullYear() + ' v ' + L.cas(d) + '.';
          }
        }
        // s monetizací vykreslíme jednou (žádné poskočení stránky), nejdéle ale po 1,5 s
        var monetizaceDorazila = false;
        monetizaceHotova.then(function () { monetizaceDorazila = true; });
        return Promise.race([monetizaceHotova, new Promise(function (ok) { setTimeout(ok, 1500); })]).then(function () {
          var predMonetizaci = !monetizaceDorazila;
          vykresli();
          if (predMonetizaci) {
            return monetizaceHotova.then(function () { if (L.monetizaceZapnuta(mon)) vykresli(); });
          }
        });
      })
      .then(function () {
        // sdílený odkaz na konkrétní akci (#hs-kal-akce-…, i starší #akce-…)
        var h = decodeURIComponent(location.hash.slice(1) || '');
        if (!h) return;
        var cil = koren.querySelector('[id="' + h.replace(/"/g, '') + '"]') ||
          (h.indexOf('akce-') === 0 ? koren.querySelector('[id="hs-kal-' + h.replace(/"/g, '') + '"]') : null);
        if (cil) {
          var obal = cil.closest('details');
          if (obal) obal.open = true;
          cil.classList.add('hs-kal-zvyraznena');
          cil.scrollIntoView({ block: 'center' });
        }
      })
      .catch(function () {
        el.seznam.innerHTML = '<p class="hs-kal-info">Akce se nepodařilo načíst. Zkontrolujte připojení k internetu a zkuste stránku obnovit.</p>';
      });
  }

  return {
    VYCHOZI_ZAKLAD: VYCHOZI_ZAKLAD,
    REKLAMA_KAZDA: REKLAMA_KAZDA,
    KLICE_FILTRU: KLICE_FILTRU,
    CSS: CSS,
    zakladZeSkriptu: zakladZeSkriptu,
    prefixujTridy: prefixujTridy,
    adresaSFiltry: adresaSFiltry,
    predvolba: predvolba,
    pocatecniStav: pocatecniStav,
    rozlozSkupinu: rozlozSkupinu,
    sirokeVMrizce: sirokeVMrizce,
    kostraHtml: kostraHtml,
    vytvor: vytvor,
    spust: spust
  };
});
