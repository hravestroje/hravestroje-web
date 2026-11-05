// Generátor pinů – ovládání stránky a kreslení na canvas. Logika rozvržení je v logika.js.
// Bez cookies, bez cizích knihoven; data: ../kalendar/akce.json, ../produkty/produkty.json, ilustrace.json.
(function () {
  'use strict';
  var P = window.HSPiny;
  var $ = function (id) { return document.getElementById(id); };
  var platno = $('pin');
  var ctx = platno.getContext('2d');
  var merici = document.createElement('canvas').getContext('2d');
  function mer(text, f) { merici.font = f; return merici.measureText(text).width; }

  var VYCHOZI = {
    akce: { stitek: 'Dopravní akce', nadpis: '', datum: '', misto: '', kraj: '', podnadpis: '', odrazky: ['', '', ''], cena: '', popis: '', temata: [] },
    clanek: { stitek: 'Tip na výlet', nadpis: 'Kam s dětmi za vláčky', podnadpis: 'Výlet, který baví malé i velké',
      odrazky: ['Parní vlak a muzeum na jednom místě', 'Hřiště a občerstvení u nádraží', 'Vhodné i pro kočárky'], cena: '', popis: '', temata: [] },
    produkt: { stitek: 'Tip na dárek', nadpis: '', podnadpis: '', odrazky: ['', '', ''], cena: '', popis: '', temata: [] }
  };
  var stav = {
    sablona: 'akce',
    texty: JSON.parse(JSON.stringify(VYCHOZI)),
    akce: [], produkty: [], ilustrace: [], ukazkoveProdukty: false,
    vybranaAkce: null, vybranyProdukt: null,
    ilu: '', vlastni: null, obrazky: {}, verze: 0
  };

  // ---------- Načtení dat ----------
  function nactiJson(url) {
    return fetch(url, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
      return r.json();
    });
  }
  function nactiUkazkoveProdukty() {
    return new Promise(function (ok, chyba) {
      var s = document.createElement('script');
      s.src = '../produkty/demo-data.js';
      s.onload = function () { window.HS_DARKY_DATA ? ok(window.HS_DARKY_DATA) : chyba(new Error('prázdná ukázka')); };
      s.onerror = function () { chyba(new Error('ukázková data chybí')); };
      document.head.appendChild(s);
    });
  }

  // ---------- Formulář ----------
  var POLE = ['stitek', 'nadpis', 'datum', 'misto', 'kraj', 'podnadpis', 'cena'];
  function ulozFormular() {
    var t = stav.texty[stav.sablona];
    POLE.forEach(function (k) { t[k] = $(k).value; });
    t.odrazky = [$('odrazka1').value, $('odrazka2').value, $('odrazka3').value];
  }
  function vyplnFormular() {
    var t = stav.texty[stav.sablona];
    POLE.forEach(function (k) { $(k).value = t[k] == null ? '' : t[k]; });
    $('odrazka1').value = t.odrazky[0] || ''; $('odrazka2').value = t.odrazky[1] || ''; $('odrazka3').value = t.odrazky[2] || '';
  }
  function obsah() {
    var t = stav.texty[stav.sablona];
    return {
      sablona: stav.sablona, stitek: t.stitek, nadpis: t.nadpis, datum: t.datum, misto: t.misto, kraj: t.kraj,
      podnadpis: t.podnadpis, odrazky: t.odrazky, cena: Number(t.cena) || 0, popis: t.popis, temata: t.temata
    };
  }

  function prepniSablonu(s) {
    if (stav.formularPripraven) ulozFormular();
    stav.formularPripraven = true;
    stav.sablona = s;
    document.querySelectorAll('[data-sablona]').forEach(function (el) {
      el.hidden = el.getAttribute('data-sablona').split(' ').indexOf(s) < 0;
    });
    vyplnFormular();
    nabidniIlustrace(true);
    zmena();
  }

  function moznost(sel, hodnota, text) {
    var o = document.createElement('option'); o.value = hodnota; o.textContent = text; sel.appendChild(o); return o;
  }

  function kratkeDatum(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? (+m[3]) + '. ' + (+m[2]) + '.' : '';
  }

  function vypisAkce() {
    var sel = $('akce-seznam');
    var vyber = P.vyberAkce(stav.akce, { hledat: $('akce-hledat').value, kraj: $('akce-kraj').value });
    sel.textContent = '';
    vyber.slice(0, 300).forEach(function (a, i) {
      var o = moznost(sel, String(i), kratkeDatum(a.zacatek) + ' · ' + a.nazev + (a.obec ? ' (' + a.obec + ')' : ''));
      o._akce = a;
      if (stav.vybranaAkce && stav.vybranaAkce.id === a.id) o.selected = true;
    });
    $('akce-stav').textContent = stav.akce.length ? 'Nalezeno ' + vyber.length + ' akcí.' : $('akce-stav').textContent;
  }

  function vyberAkci(a) {
    stav.vybranaAkce = a;
    var t = stav.texty.akce;
    t.nadpis = a.nazev || '';
    t.datum = P.datumAkce(a.zacatek, a.konec);
    t.misto = a.misto || a.obec || '';
    t.kraj = a.kraj || '';
    t.popis = a.popis || '';
    t.temata = a.typy || [];
    if (stav.sablona === 'akce') vyplnFormular();
    nabidniIlustrace(true);
    zmena();
  }

  function vypisProdukty() {
    var sel = $('produkt-seznam');
    var vyber = P.vyberProdukty(stav.produkty, { hledat: $('produkt-hledat').value, jenSkladem: $('produkt-skladem').checked });
    sel.textContent = '';
    vyber.slice(0, 300).forEach(function (p, i) {
      var o = moznost(sel, String(i), p.nazev + ' – ' + P.cena(p.cena).replace(/ /g, ' '));
      o._produkt = p;
      if (stav.vybranyProdukt === p) o.selected = true;
    });
    if (stav.produkty.length) {
      $('produkt-stav').textContent = 'Nalezeno ' + vyber.length + ' produktů.' +
        (stav.ukazkoveProdukty ? ' Pozor: produkty/produkty.json tu není, zobrazují se ukázková data.' : '');
    }
  }

  function vyberProdukt(p) {
    stav.vybranyProdukt = p;
    var t = stav.texty.produkt;
    t.nadpis = p.nazev || '';
    t.cena = p.cena || '';
    t.temata = p.temata || [];
    if (stav.sablona === 'produkt') vyplnFormular();
    nabidniIlustrace(true);
    zmena();
  }

  // ---------- Ilustrace ----------
  function nabidniIlustrace(automaticky) {
    var sel = $('ilu-vyber');
    var predchozi = stav.ilu;
    sel.textContent = '';
    moznost(sel, '', 'Bez ilustrace');
    var produkt = stav.sablona === 'produkt' && stav.vybranyProdukt && stav.vybranyProdukt.obrazek;
    if (produkt) moznost(sel, 'produkt', 'Obrázek produktu');
    stav.ilustrace.forEach(function (i) { moznost(sel, 'ilu:' + i.soubor, i.nazev); });
    moznost(sel, 'soubor', 'Vlastní obrázek ze souboru…');
    var hodnota = predchozi;
    if (automaticky) {
      var t = stav.texty[stav.sablona];
      var tip = P.ilustracePro(stav.ilustrace, t.temata);
      if (produkt) hodnota = 'produkt';
      else if (tip) hodnota = 'ilu:' + tip.soubor;
      else if (predchozi === 'produkt' || /^ilu:/.test(predchozi)) hodnota = '';
    }
    if (![].some.call(sel.options, function (o) { return o.value === hodnota; })) hodnota = '';
    sel.value = hodnota;
    stav.ilu = hodnota;
    $('ilu-soubor-obal').hidden = hodnota !== 'soubor';
    $('ilu-stav').textContent = stav.ilustrace.length ? '' :
      'Seznam ilustrací (piny/ilustrace.json) je zatím prázdný – návod je přímo v souboru. Můžete vybrat obrázek ze souboru.';
  }

  // Načte obrázek; nejdřív s CORS (aby šlo stáhnout PNG), jinak aspoň pro náhled.
  function nactiObrazek(url) {
    if (stav.obrazky[url]) return stav.obrazky[url];
    stav.obrazky[url] = new Promise(function (ok, chyba) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { ok(priprav(img)); };
      img.onerror = function () {
        var img2 = new Image();
        img2.onload = function () { ok(priprav(img2, true)); };
        img2.onerror = function () { chyba(new Error('Obrázek se nepodařilo načíst: ' + url)); };
        img2.src = url;
      };
      img.src = url;
    });
    return stav.obrazky[url];
  }

  // Ořízne průhledné okraje (aby stroj stál přesně na lince) a zjistí, jestli má obrázek průhlednost.
  function priprav(img, cizi) {
    var w = img.naturalWidth || img.width || 1000, h = img.naturalHeight || img.height || 1000;
    var vysledek = { img: img, sx: 0, sy: 0, sw: w, sh: h, karta: true, cizi: !!cizi };
    if (cizi) return vysledek;
    try {
      var k = Math.min(1, 500 / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      var cx = c.getContext('2d');
      cx.drawImage(img, 0, 0, c.width, c.height);
      var o = P.orezPruhledne(cx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (o && o.pruhledny) {
        vysledek.sx = o.x / k; vysledek.sy = o.y / k;
        vysledek.sw = Math.min(w - vysledek.sx, o.w / k); vysledek.sh = Math.min(h - vysledek.sy, o.h / k);
        vysledek.karta = false;
      }
    } catch (e) { vysledek.cizi = true; }
    return vysledek;
  }

  function aktualniObrazek() {
    if (stav.ilu === 'produkt' && stav.vybranyProdukt && stav.vybranyProdukt.obrazek) return nactiObrazek(stav.vybranyProdukt.obrazek);
    if (/^ilu:/.test(stav.ilu)) return nactiObrazek(stav.ilu.slice(4));
    if (stav.ilu === 'soubor' && stav.vlastni) return nactiObrazek(stav.vlastni);
    return Promise.resolve(null);
  }

  // ---------- Kreslení ----------
  function zaoblene(c, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function kresli(r, obr) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, P.SIRKA, P.VYSKA);
    r.prvky.forEach(function (p) {
      if (p.typ === 'obdelnik') {
        ctx.fillStyle = p.barva;
        if (p.r) { zaoblene(ctx, p.x, p.y, p.w, p.h, p.r); ctx.fill(); } else ctx.fillRect(p.x, p.y, p.w, p.h);
      } else if (p.typ === 'text') {
        ctx.font = p.font; ctx.fillStyle = p.barva; ctx.textAlign = p.zarovnani || 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.typ === 'kruh') {
        ctx.fillStyle = p.barva; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      } else if (p.typ === 'obrazek' && obr) {
        if (p.karta) {
          // fotka produktu na bílé kartě, která stojí na lince
          ctx.fillStyle = '#ffffff'; zaoblene(ctx, p.x, p.y, p.w, p.h, 22); ctx.fill();
          ctx.strokeStyle = '#cfe0d4'; ctx.lineWidth = 3; zaoblene(ctx, p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3, 21); ctx.stroke();
          var o = Math.round(Math.min(p.w, p.h) * 0.06);
          ctx.save(); zaoblene(ctx, p.x + o, p.y + o, p.w - 2 * o, p.h - 2 * o, 12); ctx.clip();
          ctx.drawImage(obr.img, obr.sx, obr.sy, obr.sw, obr.sh, p.x + o, p.y + o, p.w - 2 * o, p.h - 2 * o);
          ctx.restore();
        } else {
          ctx.drawImage(obr.img, obr.sx, obr.sy, obr.sw, obr.sh, p.x, p.y, p.w, p.h);
        }
      }
    });
  }

  function lzeStahnout() {
    try { ctx.getImageData(0, 0, 1, 1); return true; } catch (e) { return false; }
  }

  function upozorni(text) { $('upozorneni').hidden = !text; $('upozorneni').textContent = text || ''; }

  function vykresli() {
    var verze = ++stav.verze;
    var d = obsah();
    return aktualniObrazek().catch(function (e) { upozorni(e.message); return null; }).then(function (obr) {
      if (verze !== stav.verze) return;
      var ilu = obr ? { sirka: obr.sw, vyska: obr.sh, karta: obr.karta, velikost: $('ilu-velikost').value / 100, posun: $('ilu-posun').value / 100 } : null;
      var r = P.rozvrh(d, mer, ilu);
      // Pokaždé nový canvas: jednou „zašpiněný“ canvas (obrázek bez CORS) už by nešlo stáhnout nikdy.
      var novy = document.createElement('canvas');
      novy.width = P.SIRKA; novy.height = P.VYSKA; novy.id = 'pin';
      novy.setAttribute('aria-label', platno.getAttribute('aria-label'));
      ctx = novy.getContext('2d');
      kresli(r, obr);
      platno.replaceWith(novy);
      platno = novy;
      stav.posledniRozvrh = r;
      var ok = lzeStahnout();
      $('stahnout').disabled = !ok;
      if (!ok) {
        upozorni('Obrázek je z jiného serveru, který nepovoluje jeho použití (CORS). Náhled vidíte, ale PNG nejde stáhnout. ' +
          'Uložte si obrázek do počítače a vyberte ho jako „Vlastní obrázek ze souboru…“.');
      } else if (obr || stav.ilu === '' || stav.ilu === 'soubor') {
        if (!(stav.ilu === 'soubor' && !stav.vlastni)) upozorni('');
      }
      document.body.setAttribute('data-vykresleno', String(verze));
    });
  }

  function aktualizujTexty() {
    var t = P.textyPinu(obsah());
    $('titulek').value = t.titulek;
    $('popis').value = t.popis;
    pocitadla();
  }
  function pocitadla() {
    [['titulek', P.MAX_TITULEK], ['popis', P.MAX_POPIS]].forEach(function (x) {
      var n = $(x[0]).value.length, el = $(x[0] + '-pocet');
      el.textContent = '(' + n + ' / ' + x[1] + ' znaků)';
      el.classList.toggle('moc', n > x[1]);
    });
  }

  var casovac;
  function zmena() {
    ulozFormular();
    aktualizujTexty();
    clearTimeout(casovac);
    casovac = setTimeout(vykresli, 60);
  }

  // ---------- Stažení a kopírování ----------
  function stahni() {
    if (!lzeStahnout()) return;
    platno.toBlob(function (blob) {
      if (!blob) return upozorni('PNG se nepodařilo vytvořit.');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = P.nazevSouboru(obsah().nadpis);
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }, 'image/png');
  }

  function kopiruj(id) {
    var el = $(id), text = el.value;
    var hotovo = function () { $('kopirovano').textContent = (id === 'popis' ? 'Popis' : 'Titulek') + ' zkopírován do schránky.'; };
    var zaloha = function () {
      el.focus(); el.select();
      try { document.execCommand('copy'); hotovo(); } catch (e) { $('kopirovano').textContent = 'Kopírování selhalo – označte text a stiskněte Ctrl+C.'; }
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(hotovo, zaloha);
    else zaloha();
  }

  // ---------- Události ----------
  document.querySelectorAll('input[name=sablona]').forEach(function (r) {
    r.addEventListener('change', function () { if (r.checked) prepniSablonu(r.value); });
  });
  POLE.concat(['odrazka1', 'odrazka2', 'odrazka3']).forEach(function (id) { $(id).addEventListener('input', zmena); });
  ['ilu-velikost', 'ilu-posun'].forEach(function (id) { $(id).addEventListener('input', function () { clearTimeout(casovac); casovac = setTimeout(vykresli, 30); }); });
  $('akce-hledat').addEventListener('input', vypisAkce);
  $('akce-kraj').addEventListener('change', vypisAkce);
  $('akce-seznam').addEventListener('change', function (e) { var o = e.target.selectedOptions[0]; if (o && o._akce) vyberAkci(o._akce); });
  $('produkt-hledat').addEventListener('input', vypisProdukty);
  $('produkt-skladem').addEventListener('change', vypisProdukty);
  $('produkt-seznam').addEventListener('change', function (e) { var o = e.target.selectedOptions[0]; if (o && o._produkt) vyberProdukt(o._produkt); });
  $('ilu-vyber').addEventListener('change', function () {
    stav.ilu = $('ilu-vyber').value;
    $('ilu-soubor-obal').hidden = stav.ilu !== 'soubor';
    vykresli();
  });
  $('ilu-soubor').addEventListener('change', function () {
    var f = $('ilu-soubor').files[0];
    if (!f) return;
    var cteni = new FileReader();
    cteni.onload = function () { stav.vlastni = cteni.result; vykresli(); };
    cteni.readAsDataURL(f);
  });
  $('titulek').addEventListener('input', pocitadla);
  $('popis').addEventListener('input', pocitadla);
  $('stahnout').addEventListener('click', stahni);
  document.querySelectorAll('[data-kopirovat]').forEach(function (b) {
    b.addEventListener('click', function () { kopiruj(b.getAttribute('data-kopirovat')); });
  });

  // ---------- Start ----------
  prepniSablonu('akce');
  var nacteni = [
    nactiJson('../kalendar/akce.json').then(function (d) {
      stav.akce = (d && d.akce) || [];
      P.krajeAkci(stav.akce).forEach(function (k) { moznost($('akce-kraj'), k, k); });
      moznost($('akce-kraj'), '-', 'Bez uvedeného kraje');
      vypisAkce();
      var prvni = P.vyberAkce(stav.akce)[0];
      if (prvni && !stav.vybranaAkce) { vyberAkci(prvni); vypisAkce(); }
    }).catch(function (e) { $('akce-stav').textContent = 'Akce se nepodařilo načíst (' + e.message + ').'; }),
    nactiJson('../produkty/produkty.json').catch(function () {
      stav.ukazkoveProdukty = true;
      return nactiUkazkoveProdukty();
    }).then(function (d) {
      stav.produkty = (d && d.produkty) || [];
      vypisProdukty();
      var prvni = P.vyberProdukty(stav.produkty, { jenSkladem: true })[0];
      if (prvni && !stav.vybranyProdukt) { stav.vybranyProdukt = null; vyberProdukt(prvni); vypisProdukty(); }
    }).catch(function (e) { $('produkt-stav').textContent = 'Produkty se nepodařilo načíst (' + e.message + ').'; }),
    nactiJson('ilustrace.json').then(function (d) {
      stav.ilustrace = P.seznamIlustraci(d);
      nabidniIlustrace(stav.sablona !== 'clanek');
    }).catch(function () { nabidniIlustrace(false); })
  ];
  Promise.all(nacteni).then(function () { return vykresli(); }).then(function () {
    document.body.setAttribute('data-hotovo', '1');
  });

  window.HSPinyApp = { stav: stav, vykresli: vykresli, obsah: obsah };
})();
