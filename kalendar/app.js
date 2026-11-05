'use strict';

(function () {
  var L = window.KalendarLogika;
  var Z = window.KalendarZarizeni;
  var zarizeni = Z.vytvor(); // oblíbené a můj kraj – jen v tomto zařízení (viz zarizeni.js)
  var TYPY = L.TYPY, esc = L.esc;
  var PORADI_KRAJU = [
    'Hlavní město Praha', 'Středočeský kraj', 'Jihočeský kraj', 'Plzeňský kraj',
    'Karlovarský kraj', 'Ústecký kraj', 'Liberecký kraj', 'Královéhradecký kraj',
    'Pardubický kraj', 'Kraj Vysočina', 'Jihomoravský kraj', 'Olomoucký kraj',
    'Zlínský kraj', 'Moravskoslezský kraj'
  ];
  // Kde hledat volitelné soubory. Chybějící soubor nevadí – část se prostě nezobrazí.
  var SOUBOR_MONETIZACE = 'monetizace.json';
  var SOUBOR_PRODUKTU = '../produkty/produkty.json';
  var SOUBORY_NABIDEK = ['nabidky.json', '../nabidky/nabidky.json', '../nabidky.json'];

  var el = {
    hledat: document.getElementById('hledat'),
    kraj: document.getElementById('kraj'),
    mesic: document.getElementById('mesic'),
    od: document.getElementById('od'),
    do: document.getElementById('do'),
    vlastni: document.getElementById('vlastni'),
    cipyTyp: document.getElementById('cipy-typ'),
    cipyKdy: document.getElementById('cipy-kdy'),
    prepinac: document.getElementById('prepinac-filtru'),
    panel: document.getElementById('panel-filtru'),
    pocetFiltru: document.getElementById('pocet-filtru'),
    hotovo: document.getElementById('hotovo'),
    seznam: document.getElementById('seznam'),
    pocet: document.getElementById('pocet'),
    zrusit: document.getElementById('zrusit'),
    aktualizace: document.getElementById('aktualizace'),
    partnerske: document.getElementById('partnerske'),
    oznameni: document.getElementById('oznameni'),
    jenOblibene: document.getElementById('jen-oblibene'),
    pocetOblibenych: document.getElementById('pocet-oblibenych'),
    mujKraj: document.getElementById('muj-kraj'),
    mujKrajObal: document.getElementById('muj-kraj-obal'),
    offline: document.getElementById('offline'),
    offlineText: document.getElementById('offline-text'),
    instalace: document.getElementById('instalace'),
    instalovat: document.getElementById('instalovat'),
    instalovatText: document.getElementById('instalovat-text'),
    zavritInstalaci: document.getElementById('zavrit-instalaci'),
    navodIos: document.getElementById('navod-ios'),
    navodHotovo: document.getElementById('navod-hotovo')
  };

  // SVG ikony do statické části stránky (<span data-ikona="…">)
  document.querySelectorAll('[data-ikona]').forEach(function (e) {
    e.insertAdjacentHTML('afterbegin', L.ikona(e.getAttribute('data-ikona')));
  });

  var stav = L.prazdnyStav();
  var vlastniOtevreno = false;
  var jenOblibene = false; // filtr „Moje oblíbené“ (do adresy se neukládá – oblíbené jsou v zařízení)
  var aktualizovano = null; // čas vytvoření akce.json
  var akce = [];
  var podleId = {};
  var mon = null;       // monetizace.json
  var produkty = null;  // ../produkty/produkty.json
  var nabidky = null;   // nabidky.json (až vznikne)

  // ---------- Ovládací prvky ----------
  function cip(atribut, hodnota, obsah) {
    return '<button type="button" class="cip" ' + atribut + '="' + esc(hodnota) + '" aria-pressed="false">' + obsah + '</button>';
  }

  el.cipyTyp.innerHTML = cip('data-typ', '', 'Vše') + L.PORADI_TYPU.map(function (t) {
    return cip('data-typ', t, (t === 'ostatni' ? '' : L.ikona(t)) + '<span>' + esc(TYPY[t].nazev) + '</span>');
  }).join('');
  el.cipyKdy.innerHTML = cip('data-kdy', '', 'Kdykoli') + L.KDY.map(function (k) {
    return cip('data-kdy', k[0], esc(k[1]));
  }).join('') + cip('data-kdy', 'vlastni', 'Vlastní termín');
  el.mesic.innerHTML = '<option value="">Vybrat měsíc…</option>' + L.mesiceDopredu(new Date(), 12).map(function (m) {
    return '<option value="' + m.hodnota + '">' + esc(m.nazev) + '</option>';
  }).join('');
  el.od.min = el.do.min = L.isoDen(new Date());

  function pocetAktivnich() {
    return (stav.typ ? 1 : 0) + (stav.kraj ? 1 : 0) + (L.filtrujeSeDatem(stav) ? 1 : 0);
  }

  function nejakyFiltr() {
    return !!(stav.q || jenOblibene || pocetAktivnich());
  }

  function ulozDoAdresy() {
    var qs = L.adresaZeStavu(stav);
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
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
    el.jenOblibene.setAttribute('aria-pressed', String(jenOblibene));
    var muj = zarizeni.mujKraj();
    el.mujKrajObal.hidden = !stav.kraj;
    el.mujKraj.checked = !!stav.kraj && stav.kraj === muj;
    promitniOblibene();
  }

  function promitniOblibene() {
    var ids = zarizeni.oblibene();
    var n = akce.length ? Z.filtrujOblibene(akce, ids).length : ids.length;
    el.pocetOblibenych.hidden = !n;
    el.pocetOblibenych.textContent = n;
  }

  function zmena() {
    promitniStav();
    ulozDoAdresy();
    vykresli();
  }

  // ---------- Data ----------
  function naplnKraje() {
    var pocty = {};
    akce.forEach(function (a) { if (a.kraj) pocty[a.kraj] = (pocty[a.kraj] || 0) + 1; });
    var kraje = Object.keys(pocty).sort(function (a, b) {
      var ia = PORADI_KRAJU.indexOf(a), ib = PORADI_KRAJU.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'cs');
    });
    if (stav.kraj && !pocty[stav.kraj]) kraje.push(stav.kraj);
    var muj = zarizeni.mujKraj();
    el.kraj.innerHTML = '<option value="">Všechny kraje</option>' + kraje.map(function (k) {
      return '<option value="' + esc(k) + '">' + esc(k) + (pocty[k] ? ' (' + pocty[k] + ')' : '') +
        (k === muj ? ' – můj kraj' : '') + '</option>';
    }).join('');
  }

  // ---------- Vykreslení ----------
  var PARTNERSKY_REL = 'sponsored nofollow noopener';

  function datumBadge(a, probiha) {
    var d = probiha ? a._k : a._z;
    return '<div class="datum' + (probiha ? ' datum-do' : '') + '" aria-hidden="true">' +
      (probiha ? '<small>do</small>' : '') +
      '<strong>' + d.getDate() + '</strong><span>' + L.MESICE_ZKR[d.getMonth()] + '</span></div>';
  }

  function komercniPrvek(a, pouziteNabidky, ted) {
    if (!L.monetizaceZapnuta(mon) || a.zruseno) return ''; // u zrušené akce nic neprodáváme
    var typ = L.hlavniTyp(a);
    if (mon.nabidky !== false && nabidky) {
      var n = L.vyberNabidku(nabidky, a, pouziteNabidky, ted);
      if (n) {
        pouziteNabidky[n.url] = true;
        return '<aside class="nabidka">' +
          '<p class="oznaceni">Tip na výlet (reklama)</p>' +
          '<a href="' + esc(L.pridejUtm(n.url, typ, 'nabidka')) + '" target="_blank" rel="' + PARTNERSKY_REL + '">' +
            esc(n.nazev) + '</a>' +
          (n.popis ? '<p>' + esc(n.popis) + '</p>' : '') +
        '</aside>';
      }
    }
    var booking = L.bookingOdkaz(a, mon, ted);
    if (booking) {
      return '<a class="tlacitko tlacitko-partner" href="' + esc(booking) + '" target="_blank" rel="' + PARTNERSKY_REL + '">' +
        L.ikona('postel') + '<span>Ubytování poblíž</span><small>partnerský odkaz · Booking.com</small></a>';
    }
    return '';
  }

  function karta(a, probiha, pouziteNabidky, ted, trida) {
    var typ = L.hlavniTyp(a);
    var url = L.pridejUtm(a.url, typ, 'clanek');
    var img = L.obrazekAkce(a);
    var misto = [a.misto, a.obec && (a.misto || '').indexOf(a.obec) < 0 ? a.obec : ''].filter(Boolean).join(', ');

    var stitky = [];
    if (a.zruseno) stitky.push('<li class="pozor">Zrušeno</li>');
    if (a.presunuto) stitky.push('<li class="pozor">Přesunuto</li>');
    if (probiha) stitky.push('<li class="probiha">Právě probíhá</li>');
    a._typy.forEach(function (t) {
      stitky.push('<li>' + (t === 'ostatni' ? '' : L.ikona(t)) + TYPY[t].nazev + '</li>');
    });
    if (a.kraj) stitky.push('<li>' + esc(a.kraj) + '</li>');

    var oblibena = zarizeni.jeOblibena(a.id);

    return '<article class="karta' + (a.zruseno ? ' zrusena' : '') + (trida ? ' ' + trida : '') + '" id="akce-' + esc(a.id) + '">' +
      '<div class="karta-obrazek" data-typ="' + typ + '">' +
        (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : L.zastupnyObrazek(typ)) +
        datumBadge(a, probiha) +
        '<button type="button" class="srdce" data-akce="oblibena" data-id="' + esc(a.id) + '" aria-pressed="' + oblibena + '" ' +
          'aria-label="Oblíbená akce: ' + esc(a.nazev) + '" title="Oblíbená akce">' + L.ikona('srdce') + '</button>' +
      '</div>' +
      '<div class="karta-telo">' +
        '<h3>' + esc(a.nazev) + '</h3>' +
        '<p class="termin"><time datetime="' + esc(a.zacatek) + '">' + esc(L.formatTermin(a, ted)) + '</time></p>' +
        (misto ? '<p class="misto">' + L.ikona('misto') + '<span>' + esc(misto) + '</span></p>' : '') +
        (stitky.length ? '<ul class="stitky">' + stitky.join('') + '</ul>' : '') +
        '<div class="karta-akce">' +
          (url ? '<a class="tlacitko" href="' + esc(url) + '" target="_blank" rel="noopener">Více na Hravestroje.cz</a>' : '') +
          '<div class="male-akce">' +
            '<button type="button" class="male" data-akce="ics" data-id="' + esc(a.id) + '">' + L.ikona('kalendar') + '<span>Přidat do kalendáře</span></button>' +
            '<button type="button" class="male" data-akce="sdilet" data-id="' + esc(a.id) + '">' + L.ikona('sdilet') + '<span>Sdílet</span></button>' +
          '</div>' +
          komercniPrvek(a, pouziteNabidky, ted) +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function dlazdiceProduktu(p, typ, trida) {
    var url = L.pridejUtm(p.url, typ, 'eshop');
    var img = L.bezpecnaUrl(p.obrazek);
    var cena = typeof p.cena === 'number' ? p.cena.toLocaleString('cs-CZ') + ' Kč' : '';
    return '<aside class="karta produkt' + (trida ? ' ' + trida : '') + '">' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener">' +
        '<p class="oznaceni">Z našeho e-shopu</p>' +
        '<div class="produkt-obrazek">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" decoding="async">' : L.zastupnyObrazek(typ)) + '</div>' +
        '<div class="karta-telo">' +
          '<h3>' + esc(p.nazev) + '</h3>' +
          (cena ? '<p class="cena">' + (p.puvodni_cena > p.cena ? '<s>' + p.puvodni_cena.toLocaleString('cs-CZ') + ' Kč</s> ' : '') + esc(cena) + '</p>' : '') +
          '<span class="tlacitko tlacitko-obrys">Prohlédnout v e-shopu</span>' +
        '</div>' +
      '</a>' +
    '</aside>';
  }

  function sklonujAkce(n) {
    if (n === 1) return '1 akce';
    if (n >= 2 && n <= 4) return n + ' akce';
    return n + ' akcí';
  }

  function vykresli() {
    var ted = new Date();
    var vysledek = L.filtruj(akce, stav, ted);
    if (jenOblibene) vysledek = Z.filtrujOblibene(vysledek, zarizeni.oblibene());
    el.pocet.textContent = jenOblibene
      ? 'Moje oblíbené: ' + sklonujAkce(vysledek.length)
      : nejakyFiltr()
        ? 'Nalezeno: ' + sklonujAkce(vysledek.length)
        : 'Nadcházející akce: ' + vysledek.length;

    if (!vysledek.length) {
      var zprava = 'Zatím tu nejsou žádné nadcházející akce. Mrkněte sem brzy znovu.';
      if (jenOblibene && !Z.filtrujOblibene(akce, zarizeni.oblibene()).length) {
        zprava = 'Zatím nemáte žádné oblíbené akce. Klepněte na srdíčko u akce a najdete ji tady – ' +
          'oblíbené se ukládají jen v tomto zařízení.';
      } else if (akce.length) {
        zprava = 'Pro zvolené filtry jsme nenašli žádnou akci. Zkuste jiný termín, kraj nebo typ.';
      }
      el.seznam.innerHTML = '<p class="info">' + zprava + '</p>';
      return;
    }

    var casti = L.rozdelAkce(vysledek, ted);
    var skupiny = [];
    if (casti.probiha.length) skupiny.push({ nazev: 'Právě probíhá', akce: casti.probiha, probiha: true });
    skupiny = skupiny.concat(L.seskupPodleMesicu(casti.nadchazejici));

    var kazda = L.monetizaceZapnuta(mon) && mon.eshop !== false && produkty ? Math.max(2, +mon.eshop_kazda_karta || 6) : 0;
    var celkem = vysledek.length, poradi = 0;
    var pouziteNabidky = {}, pouziteProdukty = {};

    el.seznam.innerHTML = skupiny.map(function (s) {
      var polozky = [];
      s.akce.forEach(function (a) {
        polozky.push(function (trida) { return karta(a, !!s.probiha, pouziteNabidky, ted, trida); });
        poradi++;
        if (kazda && poradi % kazda === 0 && poradi < celkem) {
          var typ = L.hlavniTyp(a);
          var p = L.vyberProdukt(produkty, typ, a.id || a.nazev, pouziteProdukty);
          if (p) {
            pouziteProdukty[p.url] = true;
            polozky.push(function (trida) { return dlazdiceProduktu(p, typ, trida); });
          }
        }
      });
      var siroke = L.sirokeNaKonci(polozky.length, 3);
      return '<section class="skupina-akci' + (s.probiha ? ' probiha-sekce' : '') + '">' +
        '<h2 class="mesic">' + esc(s.nazev) + '</h2>' +
        '<div class="mrizka">' + polozky.map(function (f, i) {
          return f(i >= polozky.length - siroke ? 'siroka' : '');
        }).join('') + '</div></section>';
    }).join('');
  }

  // Nefunkční obrázek → jednotný zástupný obrázek s ikonou typu
  el.seznam.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    var obal = img.closest('[data-typ]');
    var typ = obal ? obal.getAttribute('data-typ') : 'ostatni';
    var div = document.createElement('div');
    div.innerHTML = L.zastupnyObrazek(typ);
    img.replaceWith(div.firstChild);
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
    document.body.appendChild(odkaz);
    odkaz.click();
    setTimeout(function () { URL.revokeObjectURL(odkaz.href); odkaz.remove(); }, 1000);
  }

  function zkopiruj(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (ok, chyba) {
      var t = document.createElement('textarea');
      t.value = text;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy') ? ok() : chyba(); } catch (e) { chyba(e); }
      t.remove();
    });
  }

  function sdilej(a) {
    var url = location.origin + location.pathname + '#akce-' + a.id;
    var data = { title: a.nazev, text: a.nazev + ' – ' + L.formatTermin(a, new Date()), url: url };
    if (navigator.share) {
      navigator.share(data).catch(function () {});
      return;
    }
    zkopiruj(url).then(function () { oznam('Odkaz zkopírován do schránky'); },
      function () { window.prompt('Zkopírujte odkaz:', url); });
  }

  el.seznam.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-akce]');
    if (!b) return;
    var a = podleId[b.getAttribute('data-id')];
    if (!a) return;
    var co = b.getAttribute('data-akce');
    if (co === 'oblibena') prepniOblibenou(a);
    else if (co === 'ics') stahniIcs(a);
    else sdilej(a);
  });

  function prepniOblibenou(a) {
    var ted = zarizeni.prepniOblibenou(a.id);
    oznam(ted ? 'Přidáno do oblíbených' : 'Odebráno z oblíbených');
    if (jenOblibene && !ted) {
      vykresli();
    } else {
      el.seznam.querySelectorAll('button[data-akce="oblibena"]').forEach(function (b) {
        if (b.getAttribute('data-id') === a.id) b.setAttribute('aria-pressed', String(ted));
      });
    }
    promitniOblibene();
  }

  el.jenOblibene.addEventListener('click', function () {
    jenOblibene = !jenOblibene;
    promitniStav();
    vykresli();
  });

  el.mujKraj.addEventListener('change', function () {
    zarizeni.nastavMujKraj(el.mujKraj.checked ? stav.kraj : '');
    if (akce.length) naplnKraje();
    promitniStav();
    oznam(el.mujKraj.checked ? 'Uloženo: ' + stav.kraj + ' se ukáže při každém otevření' : 'Můj kraj zrušen');
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
  function vymazDatum() {
    stav.kdy = stav.mesic = stav.od = stav.do = '';
  }
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
    stav = L.prazdnyStav();
    vlastniOtevreno = false;
    jenOblibene = false;
    zmena();
  });

  // Mobil: filtry v rozbalovacím panelu
  function nastavPanel(otevrit) {
    el.prepinac.setAttribute('aria-expanded', String(otevrit));
    el.panel.classList.toggle('otevreno', otevrit);
  }
  el.prepinac.addEventListener('click', function () {
    nastavPanel(el.prepinac.getAttribute('aria-expanded') !== 'true');
  });
  el.hotovo.addEventListener('click', function () {
    nastavPanel(false);
    el.seznam.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- Start ----------
  stav = L.stavZAdresy(location.search);
  // Bez filtrů v adrese (např. otevření z plochy) začít „mým krajem“, pokud je uložený.
  if (!L.adresaZeStavu(stav) && zarizeni.mujKraj()) stav.kraj = zarizeni.mujKraj();
  promitniStav();

  function nactiJson(adresa) {
    return fetch(adresa, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function volitelne(adresa) {
    return nactiJson(adresa).catch(function () { return null; });
  }
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

  function popisAktualizace(d) {
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear() + ' v ' + L.cas(d);
  }

  // Poznámka „Jste offline“ s časem posledních uložených dat.
  function ukazOffline(zobrazit) {
    el.offline.hidden = !zobrazit;
    if (!zobrazit) return;
    el.offlineText.textContent = 'Jste offline. Zobrazuji uložený seznam' +
      (aktualizovano ? ' – naposledy aktualizováno ' + popisAktualizace(aktualizovano) : '') +
      '. Termíny si po připojení ověřte.';
  }

  // Service worker u odpovědi z mezipaměti (bez signálu) přidá hlavičku X-Kalendar-Offline.
  function nactiAkce() {
    return fetch('akce.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var zUlozenych = r.headers.get('X-Kalendar-Offline') === '1';
      return r.json().then(function (data) {
        akce = L.pripravAkce(data, new Date());
        podleId = {};
        akce.forEach(function (a) { podleId[a.id] = a; });
        var d = data.aktualizovano ? new Date(data.aktualizovano) : null;
        aktualizovano = d && !isNaN(d) ? d : null;
        if (aktualizovano) el.aktualizace.textContent = 'Seznam aktualizován ' + popisAktualizace(aktualizovano) + '.';
        naplnKraje();
        promitniStav();
        vykresli();
        ukazOffline(zUlozenych || navigator.onLine === false);
      });
    });
  }

  window.addEventListener('offline', function () { if (akce.length) ukazOffline(true); });
  window.addEventListener('online', function () {
    // signál je zpět → stáhnout čerstvý seznam (při chybě zůstane uložený)
    nactiAkce().catch(function () {});
  });

  nactiAkce()
    .then(function () {
      return monetizaceHotova.then(function () {
        if (L.monetizaceZapnuta(mon)) vykresli();
      });
    })
    .then(function () {
      // sdílený odkaz na konkrétní akci (#akce-…)
      var cil = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (cil) {
        cil.classList.add('zvyraznena');
        cil.scrollIntoView({ block: 'center' });
      }
    })
    .catch(function () {
      if (akce.length) return; // seznam už je zobrazený, selhalo jen něco navíc
      el.seznam.innerHTML = '<p class="info">Akce se nepodařilo načíst. Zkontrolujte připojení k internetu a zkuste stránku obnovit.</p>';
    });

  // ---------- Přidat do mobilu ----------
  // Android/Chrome: vlastní tlačítko spustí systémovou nabídku instalace (beforeinstallprompt).
  // iPhone/iPad: Safari instalaci nenabízí → krátký návod Sdílet → Přidat na plochu.
  // Po instalaci nebo zavření se tlačítko už neukazuje (pamatuje si to jen toto zařízení).
  var odlozenaInstalace = null;
  var ios = Z.jeIos(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);

  function muzeNabidnout() {
    return !Z.jeNainstalovana(window) && !zarizeni.instalaceVyrizena();
  }
  function skryjInstalaci(stavInstalace) {
    if (stavInstalace) zarizeni.oznacInstalaci(stavInstalace);
    el.instalace.hidden = true;
    el.navodIos.hidden = true;
    odlozenaInstalace = null;
  }
  function ukazInstalaci() {
    var dotyk = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    el.instalovatText.textContent = ios || dotyk ? 'Přidat do mobilu' : 'Nainstalovat aplikaci';
    el.instalace.hidden = false;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // místo automatické lišty prohlížeče naše tlačítko
    if (!muzeNabidnout()) return;
    odlozenaInstalace = e;
    ukazInstalaci();
  });
  window.addEventListener('appinstalled', function () {
    skryjInstalaci('nainstalovano');
  });
  if (ios && muzeNabidnout()) ukazInstalaci();

  el.instalovat.addEventListener('click', function () {
    if (odlozenaInstalace) {
      var udalost = odlozenaInstalace;
      udalost.prompt();
      Promise.resolve(udalost.userChoice).then(function (volba) {
        skryjInstalaci(volba && volba.outcome === 'accepted' ? 'nainstalovano' : 'zavreno');
      }, function () { skryjInstalaci(); });
      return;
    }
    var otevrit = el.navodIos.hidden;
    el.navodIos.hidden = !otevrit;
    el.instalovat.setAttribute('aria-expanded', String(otevrit));
  });
  el.navodHotovo.addEventListener('click', function () { skryjInstalaci('zavreno'); });
  el.zavritInstalaci.addEventListener('click', function () { skryjInstalaci('zavreno'); });

  // PWA: offline režim a přidání na plochu. Žádné notifikace.
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
