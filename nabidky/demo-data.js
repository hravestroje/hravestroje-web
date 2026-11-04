// Ukázková data jen pro demo.html a testy. Odkazy vedou na example.com – nejsou to skutečné nabídky.
(function () {
  function obr(text, barva) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">' +
      '<rect width="640" height="360" fill="' + barva + '"/>' +
      '<text x="320" y="190" font-family="Arial,sans-serif" font-size="34" fill="#fff" text-anchor="middle">' + text + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.HS_NABIDKY_DATA = {
    nabidky: [
      { id: 'demo-1', nazev: 'Ukázka: jízda parním vlakem Podkrkonoším', popis: 'Celodenní výlet s dětmi, zastávka u muzea a oběd v jídelním voze.',
        url: 'https://example.com/vlak', obrazek: obr('Parní vlak', '#1f6f3d'), zdroj: 'slevomat',
        kraje: ['Královéhradecký kraj'], typy: ['vlaky'], platnost_do: '2099-12-31' },
      { id: 'demo-2', nazev: 'Ukázka: rodinný pobyt u úzkokolejky', popis: 'Dvě noci s polopenzí, děti do 6 let zdarma.',
        url: 'https://example.com/pobyt?ref=abc', obrazek: obr('Pobyt', '#2f855a'), zdroj: 'booking',
        kraje: ['Královéhradecký kraj'], typy: ['vlaky'], platnost_do: '' },
      { id: 'demo-3', nazev: 'Ukázka: zábavní park pro celou rodinu', popis: 'Vstupenky se slevou na celou sezónu.',
        url: 'https://example.com/park', obrazek: obr('Zábavní park', '#c0392b'), zdroj: 'slevomat',
        kraje: ['Královéhradecký kraj'], typy: ['vse'], platnost_do: '' },
      { id: 'demo-4', nazev: 'Ukázka: jízda v kabině strojvedoucího', popis: 'Zážitek pro malé i velké fanoušky železnice, platí po celé ČR.',
        url: 'https://example.com/zazitek', obrazek: obr('Zážitek', '#8a5a2b'), zdroj: 'zazitky',
        kraje: [], typy: ['vlaky'], platnost_do: '' },
      { id: 'demo-5', nazev: 'Ukázka: prošlá nabídka', popis: 'Tahle se nezobrazí – platnost skončila.',
        url: 'https://example.com/prosla', obrazek: '', zdroj: 'jine',
        kraje: ['Královéhradecký kraj'], typy: ['vlaky'], platnost_do: '2020-01-01' },
      { id: 'demo-6', nazev: 'Ukázka: traktoriáda na statku', popis: 'Projížďka na traktoru a krmení zvířat.',
        url: 'https://example.com/traktor', obrazek: obr('Traktory', '#6b8e23'), zdroj: 'jine',
        kraje: ['Zlínský kraj'], typy: ['traktory'], platnost_do: '' },
      { id: 'demo-7', nazev: 'Ukázka: vyhlídkový let nad Zlínem', popis: 'Krátký let pro dva, vhodné od 8 let.',
        url: 'https://example.com/let', obrazek: obr('Let', '#2b6cb0'), zdroj: 'zazitky',
        kraje: ['Zlínský kraj'], typy: ['letadla'], platnost_do: '' },
      { id: 'demo-9', nazev: 'Ukázka: skanzen a muzeum ve Zlínském kraji', popis: 'Rodinné vstupné, hodí se ke každému článku z kraje.',
        url: 'https://example.com/skanzen', obrazek: obr('Skanzen', '#1f6f3d'), zdroj: 'slevomat',
        kraje: ['Zlínský kraj'], typy: ['vse'], platnost_do: '' },
      { id: 'demo-10', nazev: 'Ukázka: muzeum zemědělské techniky', popis: 'Sbírka historických traktorů, v létě svezení po statku.',
        url: 'https://example.com/muzeum#detail', obrazek: obr('Muzeum', '#c0392b'), zdroj: 'booking',
        kraje: ['Zlínský kraj', 'Olomoucký kraj'], typy: ['traktory'], platnost_do: '' },
      { id: 'demo-8', nazev: 'Ukázka: skrytá vzorová položka', popis: 'Má "ukazka": true, nikdy se nezobrazí.',
        url: '#', obrazek: '', zdroj: 'jine', ukazka: true,
        kraje: ['Královéhradecký kraj'], typy: ['vlaky'], platnost_do: '' }
    ]
  };
})();
