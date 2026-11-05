// Generátor obrázku akce – ovládání stránky. Kreslení je v kresleni.js.
// Žádné cookies ani úložiště prohlížeče, žádné knihovny.
(function () {
  'use strict';
  var K = window.ObrazkyKresleni;
  var $ = function (id) { return document.getElementById(id); };
  var platno = $('platno'), ctx = platno.getContext('2d');
  var stav = {
    format: 'web',
    volby: { web: { velikost: 80, posun: 0 }, site: { velikost: 80, posun: 0 } },
    akce: [], ilustrace: [], obrazek: null, zamceno: false, nacitam: 0
  };

  function zprava(text, chyba) {
    var z = $('zprava');
    z.textContent = text || '';
    z.className = 'zprava' + (chyba ? ' chyba' : '');
  }

  function udaje() {
    return { nazev: $('nazev').value, datum: $('datum').value, misto: $('misto').value,
      poradatel: $('poradatel').value, kraj: $('kraj').value };
  }

  function vykresli() {
    var f = K.FORMATY[stav.format];
    if (platno.width !== f.sirka) platno.width = f.sirka;
    if (platno.height !== f.vyska) platno.height = f.vyska;
    var v = stav.volby[stav.format];
    var vysledek = K.kresli(ctx, stav.format, udaje(), stav.obrazek, v);
    platno.dataset.format = stav.format;
    platno.dataset.zeme = String(f.zeme);
    platno.dataset.ilustrace = vysledek.ilustrace ? JSON.stringify(vysledek.ilustrace) : '';
    platno.dataset.vykresleno = String((+platno.dataset.vykresleno || 0) + 1);
  }

  function nastavFormat(format) {
    stav.format = format;
    var v = stav.volby[format];
    $('velikost').value = v.velikost; $('posun').value = v.posun;
    document.querySelectorAll('input[name="format"]').forEach(function (r) { r.checked = r.value === format; });
    vykresli();
  }

  // ---------- Akce z kalendáře ----------
  function dnes() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function naplnAkce(data) {
    var seznam = (data && Array.isArray(data.akce) ? data.akce : []).filter(function (a) {
      return a && a.nazev && a.zacatek && !a.zruseno;
    });
    var d = dnes();
    var konec = function (a) { return String(a.konec || a.zacatek).slice(0, 10); };
    var budouci = seznam.filter(function (a) { return konec(a) >= d; });
    var minule = seznam.filter(function (a) { return konec(a) < d; });
    budouci.sort(function (a, b) { return a.zacatek < b.zacatek ? -1 : a.zacatek > b.zacatek ? 1 : 0; });
    minule.sort(function (a, b) { return a.zacatek > b.zacatek ? -1 : a.zacatek < b.zacatek ? 1 : 0; });
    stav.akce = budouci.concat(minule);
    var vyber = $('akce');
    [['Nadcházející akce', budouci], ['Proběhlé akce', minule]].forEach(function (skupina) {
      if (!skupina[1].length) return;
      var g = document.createElement('optgroup');
      g.label = skupina[0];
      skupina[1].forEach(function (a) {
        var o = document.createElement('option');
        o.value = String(stav.akce.indexOf(a));
        var t = K.terminText(a.zacatek, a.konec);
        o.textContent = (t ? t + ' – ' : '') + a.nazev;
        g.appendChild(o);
      });
      vyber.appendChild(g);
    });
  }

  function vyberAkci() {
    var a = stav.akce[+$('akce').value];
    if (!a) return;
    $('nazev').value = a.nazev || '';
    $('datum').value = K.terminText(a.zacatek, a.konec);
    $('misto').value = a.misto || a.obec || a.adresa || '';
    $('kraj').value = a.kraj || '';
    $('poradatel').value = '';
    // ilustrace podle typu akce, pokud ještě žádná vybraná není
    if (!$('ilustrace').value && Array.isArray(a.typy)) {
      var shoda = stav.ilustrace.findIndex(function (i) {
        return i.typy.some(function (t) { return a.typy.indexOf(t) !== -1; });
      });
      if (shoda !== -1) { $('ilustrace').value = String(shoda); nactiIlustraci(stav.ilustrace[shoda].url); }
    }
    vykresli();
  }

  // ---------- Ilustrace ----------
  function naplnIlustrace(data) {
    var p = K.pripravIlustrace(data);
    stav.ilustrace = p.ilustrace;
    var vyber = $('ilustrace');
    p.ilustrace.forEach(function (il, i) {
      var o = document.createElement('option');
      o.value = String(i); o.textContent = il.nazev;
      vyber.appendChild(o);
    });
    if (!p.ilustrace.length) {
      $('ilustrace-prazdne').hidden = false;
    }
    if (p.chyby.length) zprava('V ilustrace.json jsou chyby: ' + p.chyby.join(' '), true);
  }

  function pouzijObrazek(img, zamceno) {
    var okraje = { dole: 0, nahore: 0 };
    if (!zamceno) {
      try {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        okraje = K.prazdneOkraje(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      } catch (e) { zamceno = true; }
    }
    stav.obrazek = { obrazek: img, prazdnoDole: okraje.dole, prazdnoNahore: okraje.nahore };
    stav.zamceno = zamceno;
    if (zamceno) {
      zprava('Ilustraci lze zobrazit, ale web hravestroje.cz nepovoluje její použití pro stažení PNG. ' +
        'Stáhněte si ji do počítače a nahrajte ji tlačítkem „Ilustrace ze souboru“ (návod v README).', true);
    } else zprava('');
    vykresli();
  }

  function nactiObrazek(url, sCors) {
    return new Promise(function (ok, chyba) {
      var img = new Image();
      if (sCors) img.crossOrigin = 'anonymous';
      img.onload = function () { ok(img); };
      img.onerror = function () { chyba(new Error('obrázek se nenačetl')); };
      img.src = url;
    });
  }

  function nactiIlustraci(url) {
    var poradi = ++stav.nacitam;
    if (!url) { stav.obrazek = null; stav.zamceno = false; zprava(''); vykresli(); return; }
    zprava('Načítám ilustraci…');
    nactiObrazek(url, true).then(function (img) {
      if (poradi === stav.nacitam) pouzijObrazek(img, false);
    }, function () {
      return nactiObrazek(url, false).then(function (img) {
        if (poradi === stav.nacitam) pouzijObrazek(img, true);
      });
    }).catch(function () {
      if (poradi === stav.nacitam) { stav.obrazek = null; vykresli(); zprava('Ilustraci se nepodařilo načíst: ' + url, true); }
    });
  }

  function ilustraceZeSouboru(soubor) {
    if (!soubor) return;
    if (!/^image\//.test(soubor.type)) { zprava('Vyberte obrázek (PNG, JPG, WebP, SVG).', true); return; }
    var poradi = ++stav.nacitam;
    var url = URL.createObjectURL(soubor);
    nactiObrazek(url, false).then(function (img) {
      if (poradi === stav.nacitam) { $('ilustrace').value = ''; pouzijObrazek(img, false); }
    }, function () { zprava('Soubor se nepodařilo načíst jako obrázek.', true); });
  }

  // ---------- Stažení ----------
  function stahni() {
    vykresli();
    var jmeno = K.nazevSouboru($('nazev').value, stav.format);
    try {
      platno.toBlob(function (blob) {
        if (!blob) { zprava('Obrázek se nepodařilo vytvořit.', true); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = jmeno;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        zprava('Staženo: ' + jmeno);
      }, 'image/png');
    } catch (e) {
      zprava('PNG nejde stáhnout, protože ilustrace pochází z webu, který to nepovoluje. ' +
        'Nahrajte ilustraci tlačítkem „Ilustrace ze souboru“.', true);
    }
  }

  // ---------- Události ----------
  ['nazev', 'datum', 'misto', 'poradatel', 'kraj'].forEach(function (id) { $(id).addEventListener('input', vykresli); });
  $('akce').addEventListener('change', vyberAkci);
  $('ilustrace').addEventListener('change', function () {
    var il = stav.ilustrace[+this.value];
    nactiIlustraci(this.value === '' || !il ? '' : il.url);
  });
  $('soubor').addEventListener('change', function () { ilustraceZeSouboru(this.files && this.files[0]); });
  $('velikost').addEventListener('input', function () { stav.volby[stav.format].velikost = +this.value; vykresli(); });
  $('posun').addEventListener('input', function () { stav.volby[stav.format].posun = +this.value; vykresli(); });
  $('vystredit').addEventListener('click', function () {
    stav.volby[stav.format] = { velikost: 80, posun: 0 }; nastavFormat(stav.format);
  });
  document.querySelectorAll('input[name="format"]').forEach(function (r) {
    r.addEventListener('change', function () { if (this.checked) nastavFormat(this.value); });
  });
  $('stahnout').addEventListener('click', stahni);

  function nactiJson(url) {
    return fetch(url, { cache: 'no-cache', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });
  }

  vykresli();
  Promise.all([
    nactiJson('../kalendar/akce.json').then(naplnAkce, function () {
      $('akce-chyba').hidden = false;
    }),
    nactiJson('ilustrace.json').then(naplnIlustrace, function () {
      zprava('Seznam ilustrací (ilustrace.json) se nepodařilo načíst. Ilustraci můžete nahrát ze souboru.', true);
    })
  ]).then(function () { document.body.dataset.pripraveno = '1'; vykresli(); });
})();
