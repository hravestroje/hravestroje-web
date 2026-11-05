// Generátor pinů – logika bez prohlížeče (rozvržení, zalamování, výběr dat, texty pinu).
// Funguje v prohlížeči (window.HSPiny) i v Node (require) – testy: piny/testy/.
// Měření šířky textu se předává zvenku: v prohlížeči canvas.measureText, v testech odhad.
(function (koren, tovarna) {
  var api = tovarna();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else koren.HSPiny = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIRKA = 1000;
  var VYSKA = 1500;
  var OKRAJ = 70;
  var ZEM = 1340;                 // spodní linie, na které stojí ilustrace
  var MAX_POPIS = 500;
  var MAX_TITULEK = 100;
  var BARVY = {
    zelena: '#1e6f3f',
    svetla: '#e9f4ec',
    cihlova: '#c0392b',
    bila: '#ffffff',
    text: '#1d2420',
    tlumeny: '#4f5a53'
  };
  var PISMO = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  function font(vaha, px) { return vaha + ' ' + Math.round(px) + 'px ' + PISMO; }

  function cisty(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); }

  // ---------- Zalamování textu ----------

  // Rozdělí slovo, které se nevejde na řádek ani samo, na kousky.
  function rozdelSlovo(slovo, maxSirka, mer) {
    var kusy = [], kus = '';
    for (var i = 0; i < slovo.length; i++) {
      var zkus = kus + slovo[i];
      if (kus && mer(zkus) > maxSirka) { kusy.push(kus); kus = slovo[i]; } else kus = zkus;
    }
    if (kus) kusy.push(kus);
    return kusy;
  }

  // Zalomí text na řádky do maxSirka. mer(text) vrací šířku v px.
  // Jednopísmenné předložky a spojky (v, k, s, z, o, u, a, i) nenechá na konci řádku.
  function zalom(text, maxSirka, mer) {
    var slova = cisty(text).split(' ').filter(Boolean);
    var spojena = [];
    for (var i = slova.length - 1; i >= 0; i--) {
      if (/^[vkszouaiVKSZOUAI]$/.test(slova[i]) && spojena.length) spojena[0] = slova[i] + '\u00a0' + spojena[0];
      else spojena.unshift(slova[i]);
    }
    var radky = [], radek = '';
    spojena.forEach(function (slovo) {
      var zkus = radek ? radek + ' ' + slovo : slovo;
      if (mer(zkus) <= maxSirka) { radek = zkus; return; }
      if (radek) radky.push(radek);
      if (mer(slovo) <= maxSirka) { radek = slovo; return; }
      var kusy = rozdelSlovo(slovo, maxSirka, mer);
      radek = kusy.pop();
      radky.push.apply(radky, kusy);
    });
    if (radek) radky.push(radek);
    return radky.map(function (r) { return r.replace(/ /g, ' '); });
  }

  // Zkrátí poslední řádek tak, aby se vešel i s „…“.
  function sTrojteckou(radek, maxSirka, mer) {
    var konec = /[\s,.;:–-]+$|\s[vkszouai]$/i;
    var r = radek.replace(konec, '').replace(konec, '');
    while (r && mer(r + '…') > maxSirka) {
      var mezera = r.lastIndexOf(' ');
      r = (mezera > r.length * 0.6 ? r.slice(0, mezera) : r.slice(0, -1)).replace(konec, '').replace(konec, '');
    }
    return r + '…';
  }

  // Najde největší velikost písma, při které se text vejde na maxRadku řádků.
  // Když se nevejde ani při nejmenší, zkrátí ho trojtečkou.
  // mer(text, font) → px. Vrací { radky, px, font, vyskaRadku, vyska, zkraceno }.
  function prizpusob(text, o) {
    var vaha = o.vaha || '700';
    var proklad = o.proklad || 1.15;
    var krok = o.krok || 2;
    var px = o.max;
    for (; px >= o.min; px -= krok) {
      var f = font(vaha, px);
      var radky = zalom(text, o.sirka, function (t) { return o.mer(t, f); });
      if (radky.length <= o.maxRadku) return vysledek(radky, px, f, false);
    }
    px = o.min;
    var fm = font(vaha, px);
    var merM = function (t) { return o.mer(t, fm); };
    var vse = zalom(text, o.sirka, merM);
    var radkyM = vse.slice(0, o.maxRadku);
    if (vse.length > o.maxRadku) radkyM[radkyM.length - 1] = sTrojteckou(radkyM[radkyM.length - 1] + ' ' + vse[o.maxRadku], o.sirka, merM);
    return vysledek(radkyM, px, fm, vse.length > o.maxRadku);

    function vysledek(r, p, f, zkraceno) {
      var vr = Math.round(p * proklad);
      return { radky: r, px: p, font: f, vyskaRadku: vr, vyska: r.length ? r.length * vr : 0, zkraceno: zkraceno };
    }
  }

  // ---------- Data a formáty ----------

  var MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  var DNY = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

  function den(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    return { r: +m[1], m: +m[2], d: +m[3], klic: m[1] + '-' + m[2] + '-' + m[3] };
  }
  function denVTydnu(d) { return DNY[new Date(Date.UTC(d.r, d.m - 1, d.d)).getUTCDay()]; }

  // „sobota 7. listopadu 2026“, „3.–5. července 2027“, „21. března – 1. listopadu 2026“
  function datumAkce(zacatek, konec) {
    var a = den(zacatek), b = den(konec);
    if (!a) return '';
    if (!b || b.klic <= a.klic) return denVTydnu(a) + ' ' + a.d + '. ' + MESICE[a.m - 1] + ' ' + a.r;
    if (a.r === b.r && a.m === b.m) return a.d + '.–' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
    if (a.r === b.r) return a.d + '. ' + MESICE[a.m - 1] + ' – ' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
    return a.d + '. ' + MESICE[a.m - 1] + ' ' + a.r + ' – ' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
  }

  function cena(kc) {
    var n = Math.round(Number(kc));
    if (!isFinite(n) || n <= 0) return '';
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč';
  }

  function bezDiakritiky(t) {
    return cisty(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function dnesIso(datum) {
    var d = datum || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Akce pro výběr: probíhající a budoucí (konec ≥ dnes), bez zrušených, seřazené podle začátku.
  // o: { dnes: 'YYYY-MM-DD', kraj, hledat, vcetneZrusenych }
  function vyberAkce(data, o) {
    o = o || {};
    var seznam = Array.isArray(data) ? data : (data && Array.isArray(data.akce) ? data.akce : []);
    var dnes = o.dnes || dnesIso();
    var hledat = bezDiakritiky(o.hledat || '');
    return seznam.filter(function (a) {
      if (!a || !cisty(a.nazev)) return false;
      var z = den(a.zacatek);
      if (!z) return false;
      var k = den(a.konec) || z;
      if (k.klic < dnes) return false;
      if (a.zruseno && !o.vcetneZrusenych) return false;
      if (o.kraj === '-' ? a.kraj : (o.kraj && a.kraj !== o.kraj)) return false;
      if (hledat && bezDiakritiky([a.nazev, a.misto, a.obec, a.kraj].join(' ')).indexOf(hledat) < 0) return false;
      return true;
    }).sort(function (x, y) {
      var a = den(x.zacatek).klic, b = den(y.zacatek).klic;
      return a < b ? -1 : a > b ? 1 : cisty(x.nazev).localeCompare(cisty(y.nazev), 'cs');
    });
  }

  function krajeAkci(data) {
    var seznam = Array.isArray(data) ? data : (data && data.akce) || [];
    var k = {};
    seznam.forEach(function (a) { if (a && a.kraj) k[a.kraj] = 1; });
    return Object.keys(k).sort(function (a, b) { return a.localeCompare(b, 'cs'); });
  }

  // Produkty pro výběr. o: { hledat, jenSkladem }
  function vyberProdukty(data, o) {
    o = o || {};
    var seznam = Array.isArray(data) ? data : (data && Array.isArray(data.produkty) ? data.produkty : []);
    var hledat = bezDiakritiky(o.hledat || '');
    return seznam.filter(function (p) {
      if (!p || !cisty(p.nazev) || !(Number(p.cena) > 0)) return false;
      if (o.jenSkladem && p.skladem === false) return false;
      if (hledat && bezDiakritiky(p.nazev + ' ' + (p.kategorie || []).join(' ')).indexOf(hledat) < 0) return false;
      return true;
    });
  }

  // Ilustrace z piny/ilustrace.json → [{ soubor, nazev, temata }] (jen platné položky).
  function seznamIlustraci(data) {
    var seznam = data && Array.isArray(data.ilustrace) ? data.ilustrace : [];
    return seznam.filter(function (i) {
      return i && typeof i.soubor === 'string' && /^[\w./-]+\.(png|webp|svg)$/i.test(i.soubor) &&
        i.soubor.indexOf('..') < 0 && !/^\//.test(i.soubor);
    }).map(function (i) {
      return { soubor: i.soubor, nazev: cisty(i.nazev) || i.soubor, temata: Array.isArray(i.temata) ? i.temata : [] };
    });
  }

  // První ilustrace, jejíž témata se potkají s typy akce / tématy produktu.
  function ilustracePro(ilustrace, temata) {
    temata = temata || [];
    for (var i = 0; i < ilustrace.length; i++) {
      for (var j = 0; j < temata.length; j++) if (ilustrace[i].temata.indexOf(temata[j]) >= 0) return ilustrace[i];
    }
    return null;
  }

  // ---------- Popis a titulek pinu ----------

  // Zkrátí text na max znaků – nejraději na konci věty, jinak na konci slova s „…“.
  function zkrat(text, max) {
    var t = cisty(text);
    if (t.length <= max) return t;
    var kus = t.slice(0, max);
    var veta = Math.max(kus.lastIndexOf('. '), kus.lastIndexOf('! '), kus.lastIndexOf('? '));
    if (veta >= max * 0.6) return kus.slice(0, veta + 1);
    kus = t.slice(0, max - 1);
    var mezera = kus.lastIndexOf(' ');
    if (mezera > max * 0.5) kus = kus.slice(0, mezera);
    return kus.replace(/[\s,.;:–-]+$/, '') + '…';
  }

  function veta(t) {
    t = cisty(t);
    if (!t) return '';
    return /[.!?…]$/.test(t) ? t : t + '.';
  }

  // Sestaví věty, dokud se vejdou do max; povinný konec (výzva) se vejde vždy.
  function slozPopis(vety, konec, max) {
    var konecT = cisty(konec);
    var zbyva = max - (konecT ? konecT.length + 1 : 0);
    var out = '';
    vety.map(veta).filter(Boolean).forEach(function (v) {
      var zkus = out ? out + ' ' + v : v;
      if (zkus.length <= zbyva) out = zkus;
      else if (!out) out = zkrat(v, zbyva);
    });
    return zkrat(out ? (konecT ? out + ' ' + konecT : out) : konecT, max);
  }

  function slozTitulek(casti, max) {
    var out = '';
    casti.map(cisty).filter(Boolean).forEach(function (c, i) {
      var zkus = i === 0 ? c : out + ' – ' + c;
      if (!out) out = zkrat(c, max);
      else if (zkus.length <= max) out = zkus;
    });
    return out;
  }

  // d = obsah pinu (stejný objekt jako pro rozvrh): { sablona, nadpis, datum, misto, kraj, popis,
  //   podnadpis, odrazky, cena, temata }
  function textyPinu(d) {
    var s = d.sablona;
    var titulek, popis;
    if (s === 'akce') {
      titulek = slozTitulek([d.nadpis, d.datum, d.kraj], MAX_TITULEK);
      popis = slozPopis([
        d.nadpis,
        [d.datum, [d.misto, d.kraj].filter(cisty).join(', ')].filter(cisty).join(' – '),
        d.popis,
        'Akce pro děti, které baví vlaky, traktory a další stroje'
      ], 'Další akce v kalendáři na hravestroje.cz.', MAX_POPIS);
    } else if (s === 'produkt') {
      titulek = slozTitulek([d.nadpis, d.cena ? cena(d.cena) : '', 'Hravé stroje'], MAX_TITULEK);
      popis = slozPopis([
        d.nadpis + (d.cena ? ' za ' + cena(d.cena) : ''),
        d.podnadpis,
        'Tip na dárek pro malé milovníky strojů, vláčků a aut'
      ], 'Najdete na hravestroje.cz.', MAX_POPIS);
    } else {
      titulek = slozTitulek([d.nadpis, d.podnadpis], MAX_TITULEK);
      popis = slozPopis([d.nadpis, d.podnadpis].concat(d.odrazky || []),
        'Celý článek na hravestroje.cz.', MAX_POPIS);
    }
    return { titulek: titulek.replace(/ /g, ' '), popis: popis.replace(/ /g, ' ') };
  }

  // ---------- Rozvržení pinu ----------

  var STITKY = { akce: 'Dopravní akce', clanek: 'Tip na výlet', produkt: 'Tip na dárek' };

  // Rozvrh pinu 1000×1500. Vrací { prvky: [...], ilustrace: {x,y,w,h}|null, zem, merito }.
  // Prvky: { typ:'obdelnik', x,y,w,h, barva, r? } | { typ:'text', text, x, y, font, barva, zarovnani, sirka }
  //        | { typ:'kruh', x,y,r,barva } | { typ:'obrazek', x,y,w,h, karta }
  // ilu: { sirka, vyska, karta } – přirozený rozměr ilustrace (po oříznutí průhledných okrajů),
  //      velikost: 0.3–1 (podíl největší možné), posun: -1..1 (vodorovně).
  function rozvrh(d, mer, ilu) {
    var merita = [1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.6];
    var minIlu = ilu ? 300 : 0;
    var r;
    for (var i = 0; i < merita.length; i++) {
      r = rozvrhS(d, mer, ilu, merita[i]);
      if (r.dolniTextu <= ZEM - 40 - minIlu) break;
    }
    return r;
  }

  function rozvrhS(d, mer, ilu, m) {
    var prvky = [];
    var sirka = SIRKA - 2 * OKRAJ;
    var s = d.sablona;
    prvky.push({ typ: 'obdelnik', x: 0, y: 0, w: SIRKA, h: VYSKA, barva: BARVY.svetla });

    // Zelená plocha se štítkem a bílým nadpisem
    var y = 76;
    var stitekText = (d.stitek != null ? cisty(d.stitek) : STITKY[s] || '').toUpperCase();
    var obsahZelene = [];
    if (stitekText) {
      var fs = font('700', 30);
      var ws = Math.min(sirka, mer(stitekText, fs) + 48);
      obsahZelene.push({ typ: 'obdelnik', x: OKRAJ, y: y, w: ws, h: 54, barva: BARVY.cihlova, r: 27 });
      obsahZelene.push({ typ: 'text', text: stitekText, x: OKRAJ + 24, y: y + 38, font: fs, barva: BARVY.bila, sirka: ws - 48 });
      y += 54 + 34;
    }
    var nadpis = prizpusob(d.nadpis || 'Nadpis pinu', {
      sirka: sirka, maxRadku: 4, max: Math.round(96 * m), min: Math.round(58 * m), vaha: '800', proklad: 1.1, mer: mer
    });
    nadpis.radky.forEach(function (t, i) {
      obsahZelene.push({ typ: 'text', text: t, x: OKRAJ, y: y + Math.round(nadpis.px * 0.9) + i * nadpis.vyskaRadku,
        font: nadpis.font, barva: BARVY.bila, sirka: sirka, role: 'nadpis' });
    });
    y += nadpis.vyska + 64;
    prvky.push({ typ: 'obdelnik', x: 0, y: 0, w: SIRKA, h: y, barva: BARVY.zelena, role: 'zelena' });
    prvky.push.apply(prvky, obsahZelene);
    var dolniZelene = y;

    // Informace pod zelenou plochou
    var info = [];
    var yi = 0;
    function blok(text, o) {
      if (!cisty(text)) return;
      var p = prizpusob(text, { sirka: o.sirka || sirka, maxRadku: o.radku, max: Math.round(o.max * m), min: Math.round(o.min * m),
        vaha: o.vaha, proklad: 1.2, mer: mer });
      p.radky.forEach(function (t, i) {
        info.push({ typ: 'text', text: t, x: (o.x || OKRAJ), y: yi + Math.round(p.px * 0.95) + i * p.vyskaRadku,
          font: p.font, barva: o.barva, sirka: o.sirka || sirka, role: o.role });
      });
      yi += p.vyska + Math.round((o.mezera || 22) * m);
      return p;
    }
    if (s === 'akce') {
      blok(d.datum, { radku: 2, max: 58, min: 40, vaha: '800', barva: BARVY.cihlova, role: 'datum' });
      blok(d.misto, { radku: 2, max: 42, min: 32, vaha: '600', barva: BARVY.text, role: 'misto', mezera: 12 });
      blok(d.kraj, { radku: 1, max: 34, min: 28, vaha: '500', barva: BARVY.tlumeny, role: 'kraj' });
    } else if (s === 'produkt') {
      var c = cena(d.cena);
      if (c) {
        var fc = font('800', Math.round(60 * m));
        var wc = mer(c, fc) + 64 * m;
        info.push({ typ: 'obdelnik', x: OKRAJ, y: yi, w: wc, h: Math.round(92 * m), barva: BARVY.cihlova, r: Math.round(46 * m), role: 'cena' });
        info.push({ typ: 'text', text: c, x: OKRAJ + 32 * m, y: yi + Math.round(68 * m), font: fc, barva: BARVY.bila, sirka: wc, role: 'cena' });
        yi += Math.round((92 + 26) * m);
      }
      blok(d.podnadpis, { radku: 3, max: 42, min: 32, vaha: '600', barva: BARVY.text, role: 'podnadpis' });
    } else {
      blok(d.podnadpis, { radku: 3, max: 46, min: 34, vaha: '600', barva: BARVY.text, role: 'podnadpis', mezera: 28 });
      (d.odrazky || []).slice(0, 3).forEach(function (t) {
        if (!cisty(t)) return;
        var zacatek = yi;
        var p = blok(t, { radku: 2, max: 40, min: 30, vaha: '500', barva: BARVY.text, role: 'odrazka',
          x: OKRAJ + Math.round(44 * m), sirka: sirka - Math.round(44 * m), mezera: 18 });
        info.push({ typ: 'kruh', x: OKRAJ + Math.round(12 * m), y: zacatek + Math.round(p.px * 0.62), r: Math.round(11 * m), barva: BARVY.cihlova, role: 'odrazka' });
      });
    }
    var vyskaInfo = Math.max(0, yi - Math.round(16 * m));

    // Bez ilustrace: informace doprostřed volného místa; s ilustrací: hned pod zelenou plochu.
    var horniInfo = dolniZelene + Math.round(56 * m);
    if (!ilu) horniInfo = Math.max(horniInfo, Math.round((dolniZelene + ZEM - vyskaInfo) / 2) - 20);
    info.forEach(function (p) { p.y += horniInfo; prvky.push(p); });
    var dolniTextu = horniInfo + vyskaInfo;

    // Ilustrace stojí na spodní linii
    var oblast = null;
    if (ilu && ilu.sirka > 0 && ilu.vyska > 0) {
      var maxH = Math.max(120, ZEM - dolniTextu - 40);
      var maxW = sirka;
      var vel = Math.min(1, Math.max(0.3, ilu.velikost == null ? 1 : ilu.velikost));
      var k = Math.min(maxW / ilu.sirka, maxH / ilu.vyska) * vel;
      var w = Math.round(ilu.sirka * k), h = Math.round(ilu.vyska * k);
      var volno = (sirka - w) / 2;
      var posun = Math.min(1, Math.max(-1, ilu.posun || 0));
      var x = Math.round(OKRAJ + volno + posun * volno);
      oblast = { x: x, y: ZEM - h, w: w, h: h };
      prvky.push({ typ: 'obrazek', x: x, y: ZEM - h, w: w, h: h, karta: !!ilu.karta });
    }

    // Spodní linie a malé „hravestroje.cz“
    prvky.push({ typ: 'obdelnik', x: 0, y: ZEM, w: SIRKA, h: 8, barva: BARVY.zelena, role: 'zem' });
    prvky.push({ typ: 'text', text: 'hravestroje.cz', x: SIRKA / 2, y: ZEM + 92, font: font('700', 34), barva: BARVY.zelena,
      zarovnani: 'center', sirka: sirka, role: 'web' });

    return { prvky: prvky, ilustrace: oblast, zem: ZEM, merito: m, dolniZelene: dolniZelene, dolniTextu: dolniTextu };
  }

  // Ořez průhledných okrajů: data = RGBA pole (ImageData.data), vrací {x,y,w,h,pruhledny} nebo null (vše průhledné).
  function orezPruhledne(data, w, h) {
    var minX = w, minY = h, maxX = -1, maxY = -1, pruhledny = false;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var a = data[(y * w + x) * 4 + 3];
        if (a < 250) pruhledny = true;
        if (a > 12) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, pruhledny: pruhledny };
  }

  function nazevSouboru(text) {
    var t = bezDiakritiky(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return 'pin-' + (t || 'hravestroje') + '.png';
  }

  return {
    SIRKA: SIRKA, VYSKA: VYSKA, OKRAJ: OKRAJ, ZEM: ZEM, BARVY: BARVY, MAX_POPIS: MAX_POPIS, MAX_TITULEK: MAX_TITULEK,
    font: font, zalom: zalom, prizpusob: prizpusob, datumAkce: datumAkce, cena: cena, dnesIso: dnesIso,
    vyberAkce: vyberAkce, krajeAkci: krajeAkci, vyberProdukty: vyberProdukty, seznamIlustraci: seznamIlustraci,
    ilustracePro: ilustracePro, zkrat: zkrat, textyPinu: textyPinu, rozvrh: rozvrh, orezPruhledne: orezPruhledne,
    nazevSouboru: nazevSouboru
  };
});
