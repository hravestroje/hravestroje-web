// Generátor obrázku akce – rozvržení a kreslení na canvas bez práce se stránkou (DOM).
// V prohlížeči je dostupný jako window.ObrazkyKresleni, v Node.js přes require() (testy).
// Kreslí se do libovolného 2D kontextu canvasu; výpočty rozvržení jsou čisté funkce.
(function (koren, tovarna) {
  if (typeof module === 'object' && module.exports) module.exports = tovarna();
  else koren.ObrazkyKresleni = tovarna();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BARVY = {
    hlavicka: '#1e6f3f',
    nazev: '#ffffff',
    datum: '#f5c518',
    plocha: '#e9f4ec',
    zeme: '#b9d9c3',
    misto: '#163d26',
    poradatel: '#3d5446',
    web: '#1e6f3f'
  };

  var PISMO = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // Rozměry a rozvržení obou formátů (vše v pixelech výsledného obrázku).
  var FORMATY = {
    web: {
      nazev: 'Web 1200 × 630', sirka: 1200, vyska: 630, okraj: 56,
      hlavicka: 196, nazevPismo: 50, nazevMin: 30, nazevRadku: 2, datumPismo: 30,
      zeme: 448, mistoPismo: 34, mistoMin: 24, mistoRadku: 1, poradatelPismo: 25, webPismo: 19
    },
    site: {
      nazev: 'Sítě 1080 × 1350', sirka: 1080, vyska: 1350, okraj: 64,
      hlavicka: 400, nazevPismo: 72, nazevMin: 40, nazevRadku: 3, datumPismo: 42,
      zeme: 1040, mistoPismo: 46, mistoMin: 32, mistoRadku: 2, poradatelPismo: 34, webPismo: 26
    }
  };

  var MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
    'srpna', 'září', 'října', 'listopadu', 'prosince'];

  function den(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    var r = +m[1], me = +m[2], d = +m[3];
    var dt = new Date(Date.UTC(r, me - 1, d));
    if (dt.getUTCMonth() !== me - 1 || dt.getUTCDate() !== d) return null;
    return { r: r, m: me, d: d };
  }

  // Termín akce česky: „7. listopadu 2026“, „7.–8. listopadu 2026“, „30. října – 1. listopadu 2026“.
  function terminText(zacatek, konec) {
    var a = den(zacatek), b = den(konec);
    if (!a) return '';
    if (!b || (b.r === a.r && b.m === a.m && b.d === a.d) ||
        Date.UTC(b.r, b.m - 1, b.d) < Date.UTC(a.r, a.m - 1, a.d)) {
      return a.d + '. ' + MESICE[a.m - 1] + ' ' + a.r;
    }
    if (a.r === b.r && a.m === b.m) return a.d + '.–' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
    if (a.r === b.r) return a.d + '. ' + MESICE[a.m - 1] + ' – ' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
    return a.d + '. ' + MESICE[a.m - 1] + ' ' + a.r + ' – ' + b.d + '. ' + MESICE[b.m - 1] + ' ' + b.r;
  }

  // Řádek „Pořádá … · kraj“ (prázdné části se vynechají).
  function poradatelText(poradatel, kraj) {
    var p = String(poradatel || '').trim(), k = String(kraj || '').trim();
    var casti = [];
    if (p) casti.push('Pořádá ' + p);
    if (k) casti.push(k);
    return casti.join(' · ');
  }

  function pismo(velikost, tucne) {
    return (tucne ? '700 ' : '400 ') + Math.round(velikost) + 'px ' + PISMO;
  }

  // Zalomí text do nejvýše `radku` řádků šířky `sirka`. `mer(text)` vrací šířku textu.
  // Co se nevejde, skončí třemi tečkami na posledním řádku.
  function zalom(text, sirka, mer, radku) {
    var slova = String(text || '').trim().split(/\s+/).filter(Boolean);
    var vysledek = [], radek = '';
    for (var i = 0; i < slova.length; i++) {
      var zkus = radek ? radek + ' ' + slova[i] : slova[i];
      if (mer(zkus) <= sirka || !radek) { radek = zkus; continue; }
      vysledek.push(radek); radek = slova[i];
    }
    if (radek) vysledek.push(radek);
    var zkraceno = vysledek.length > radku;
    if (zkraceno) {
      var zbytek = vysledek.slice(radku - 1).join(' ');
      vysledek = vysledek.slice(0, radku - 1).concat([zbytek]);
    }
    // jednotlivé příliš dlouhé řádky (nebo zbytek) zkrátit na šířku
    return vysledek.map(function (r, j) {
      var posledni = j === vysledek.length - 1;
      if (mer(r) <= sirka && !(posledni && zkraceno)) return r;
      var t = r;
      while (t.length > 1 && mer(t + '…') > sirka) t = t.slice(0, -1);
      return t.replace(/[\s,.;:–-]+$/, '') + '…';
    });
  }

  // Najde největší písmo (od `max` po `min`), při kterém se text vejde bez zkracování.
  function vejdiSe(text, sirka, radku, max, min, tucne, merPismem) {
    for (var v = max; v >= min; v -= 2) {
      var mer = function (t) { return merPismem(t, pismo(v, tucne)); };
      var r = zalom(text, sirka, mer, radku);
      if (!r.some(function (x) { return /…$/.test(x); }) || v - 2 < min) return { velikost: v, radky: r };
    }
    return { velikost: min, radky: zalom(text, sirka, function (t) { return merPismem(t, pismo(min, tucne)); }, radku) };
  }

  // Umístění ilustrace: stojí na zemi (spodní linii). `prazdnoDole` = průhledné řádky
  // na spodku obrázku (v pixelech zdroje) – ty se zapustí pod linii, aby nic nevisilo ve vzduchu.
  // velikost: 20–100 (% dostupné plochy), posun: -100 (vlevo) … 0 (střed) … 100 (vpravo).
  function umisteniIlustrace(format, sirkaObr, vyskaObr, volby) {
    var f = typeof format === 'string' ? FORMATY[format] : format;
    volby = volby || {};
    var velikost = Math.min(100, Math.max(20, +volby.velikost || 80)) / 100;
    var posun = Math.min(100, Math.max(-100, +volby.posun || 0)) / 100;
    var prazdnoDole = Math.max(0, Math.min(vyskaObr - 1, +volby.prazdnoDole || 0));
    var prazdnoNahore = Math.max(0, Math.min(vyskaObr - 1 - prazdnoDole, +volby.prazdnoNahore || 0));
    var mezera = Math.round(f.okraj * 0.4);
    var plochaV = f.zeme - f.hlavicka - mezera;     // od hlavičky po zemi
    var plochaS = f.sirka - 2 * f.okraj;
    var viditelnaV = vyskaObr - prazdnoDole - prazdnoNahore;
    var meritko = Math.min(plochaV / viditelnaV, plochaS / sirkaObr) * velikost;
    var w = sirkaObr * meritko, h = vyskaObr * meritko;
    var volno = plochaS - w;
    var x = f.okraj + volno / 2 + posun * volno / 2;
    var y = f.zeme - (vyskaObr - prazdnoDole) * meritko;
    return { x: x, y: y, w: w, h: h, meritko: meritko, zeme: f.zeme };
  }

  // Kolik spodních (a horních) řádků obrázku je zcela průhledných. `data` = RGBA pole.
  function prazdneOkraje(data, sirka, vyska) {
    function prazdny(r) {
      for (var x = 0, i = r * sirka * 4 + 3; x < sirka; x++, i += 4) if (data[i] > 16) return false;
      return true;
    }
    var dole = 0, nahore = 0;
    while (dole < vyska - 1 && prazdny(vyska - 1 - dole)) dole++;
    while (nahore < vyska - 1 - dole && prazdny(nahore)) nahore++;
    return { dole: dole, nahore: nahore };
  }

  // Rozvržení textů (bez kreslení) – použije ho kreslení i testy.
  function rozvrzeni(format, udaje, merPismem) {
    var f = typeof format === 'string' ? FORMATY[format] : format;
    var sirka = f.sirka - 2 * f.okraj;
    var datum = String(udaje.datum || '').trim();
    var radekD = Math.round(f.datumPismo * 1.25), mezeraD = Math.round(f.datumPismo * 0.5);
    var vnitrni = f.hlavicka - Math.round(f.okraj * 0.8);   // místo v hlavičce bez horního a dolního okraje
    var nazev, radekN, blok;
    // největší písmo názvu, při kterém se název (bez zkracování) i datum vejdou do hlavičky
    for (var v = f.nazevPismo; ; v -= 2) {
      nazev = vejdiSe(udaje.nazev || '', sirka, f.nazevRadku, v, Math.min(v, f.nazevMin), true, merPismem);
      radekN = Math.round(nazev.velikost * 1.15);
      blok = nazev.radky.length * radekN + (datum ? mezeraD + radekD : 0);
      if (blok <= vnitrni || v - 2 < f.nazevMin) break;
    }
    var y = Math.max(Math.round(f.okraj * 0.4), (f.hlavicka - blok) / 2);
    var texty = [];
    nazev.radky.forEach(function (r) {
      texty.push({ druh: 'nazev', text: r, x: f.sirka / 2, y: y + radekN * 0.82, pismo: pismo(nazev.velikost, true), barva: BARVY.nazev });
      y += radekN;
    });
    if (datum) {
      y += mezeraD;
      texty.push({ druh: 'datum', text: zalom(datum, sirka, function (t) { return merPismem(t, pismo(f.datumPismo, true)); }, 1)[0],
        x: f.sirka / 2, y: y + radekD * 0.8, pismo: pismo(f.datumPismo, true), barva: BARVY.datum });
    }
    var yd = f.zeme + Math.round(f.mistoPismo * 0.75);
    var misto = vejdiSe(udaje.misto || '', sirka, f.mistoRadku, f.mistoPismo, f.mistoMin, true, merPismem);
    misto.radky.forEach(function (r) {
      yd += Math.round(misto.velikost * 1.2);
      texty.push({ druh: 'misto', text: r, x: f.sirka / 2, y: yd, pismo: pismo(misto.velikost, true), barva: BARVY.misto });
    });
    var por = poradatelText(udaje.poradatel, udaje.kraj);
    if (por) {
      yd += Math.round(f.poradatelPismo * 1.5);
      texty.push({ druh: 'poradatel', text: zalom(por, sirka, function (t) { return merPismem(t, pismo(f.poradatelPismo, false)); }, 1)[0],
        x: f.sirka / 2, y: yd, pismo: pismo(f.poradatelPismo, false), barva: BARVY.poradatel });
    }
    texty.push({ druh: 'web', text: 'hravestroje.cz', x: f.sirka / 2, y: f.vyska - Math.round(f.okraj * 0.55),
      pismo: pismo(f.webPismo, true), barva: BARVY.web });
    return { format: f, texty: texty };
  }

  // Nakreslí celý obrázek. `ilustrace` = { obrazek, prazdnoDole, prazdnoNahore } nebo null.
  function kresli(ctx, format, udaje, ilustrace, volby) {
    var f = typeof format === 'string' ? FORMATY[format] : format;
    var mer = function (t, p) { ctx.font = p; return ctx.measureText(t).width; };
    var r = rozvrzeni(f, udaje, mer);
    ctx.save();
    ctx.fillStyle = BARVY.plocha; ctx.fillRect(0, 0, f.sirka, f.vyska);
    ctx.fillStyle = BARVY.hlavicka; ctx.fillRect(0, 0, f.sirka, f.hlavicka);
    var umisteni = null;
    if (ilustrace && ilustrace.obrazek) {
      var o = ilustrace.obrazek;
      var sw = o.naturalWidth || o.width, sh = o.naturalHeight || o.height;
      umisteni = umisteniIlustrace(f, sw, sh, {
        velikost: volby && volby.velikost, posun: volby && volby.posun,
        prazdnoDole: ilustrace.prazdnoDole, prazdnoNahore: ilustrace.prazdnoNahore
      });
      // jen nad zemí; průhledný spodek obrázku pod linií se ořízne
      ctx.save();
      ctx.beginPath(); ctx.rect(0, f.hlavicka, f.sirka, f.zeme - f.hlavicka); ctx.clip();
      ctx.drawImage(o, umisteni.x, umisteni.y, umisteni.w, umisteni.h);
      ctx.restore();
    }
    // spodní linie (země)
    var tl = Math.max(3, Math.round(f.sirka / 300));
    ctx.fillStyle = BARVY.zeme;
    ctx.fillRect(f.okraj, f.zeme, f.sirka - 2 * f.okraj, tl);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    r.texty.forEach(function (t) {
      ctx.font = t.pismo; ctx.fillStyle = t.barva; ctx.fillText(t.text, t.x, t.y);
    });
    ctx.restore();
    return { texty: r.texty, ilustrace: umisteni };
  }

  // Název souboru: „obrazek-mikulasska-jizda-1200x630.png“.
  function nazevSouboru(nazev, format) {
    var f = FORMATY[format];
    var s = String(nazev || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return 'obrazek-' + (s || 'akce') + '-' + f.sirka + 'x' + f.vyska + '.png';
  }

  var POVOLENA_ADRESA = 'https://www.hravestroje.cz/user/documents/upload/ilustrace/';

  // Kontrola seznamu ilustrací: vrací { ilustrace: [...platné], chyby: [...] }.
  function pripravIlustrace(data) {
    var chyby = [], seznam = [];
    var polozky = data && Array.isArray(data.ilustrace) ? data.ilustrace : null;
    if (!polozky) return { ilustrace: [], chyby: ['Soubor nemá pole "ilustrace".'] };
    polozky.forEach(function (p, i) {
      var url = p && typeof p.url === 'string' ? p.url.trim() : '';
      var ok = url.indexOf(POVOLENA_ADRESA) === 0 && url.length > POVOLENA_ADRESA.length ||
        /^ilustrace\/[A-Za-z0-9._\-\/]+$/.test(url);
      if (!ok || /\.\./.test(url)) { chyby.push('Položka ' + (i + 1) + ': adresa musí začínat ' + POVOLENA_ADRESA + ' (nebo ilustrace/…).'); return; }
      var nazev = String((p && p.nazev) || decodeURIComponent(url.split('/').pop()).replace(/\.[a-z0-9]+$/i, ''));
      seznam.push({ nazev: nazev, url: url, typy: Array.isArray(p.typy) ? p.typy.map(String) : [] });
    });
    return { ilustrace: seznam, chyby: chyby };
  }

  return {
    BARVY: BARVY, FORMATY: FORMATY, POVOLENA_ADRESA: POVOLENA_ADRESA,
    terminText: terminText, poradatelText: poradatelText, zalom: zalom, pismo: pismo,
    umisteniIlustrace: umisteniIlustrace, prazdneOkraje: prazdneOkraje, rozvrzeni: rozvrzeni,
    kresli: kresli, nazevSouboru: nazevSouboru, pripravIlustrace: pripravIlustrace
  };
});
