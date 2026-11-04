// Service worker kalendáře akcí: umožní přidat stránku na plochu a zobrazit
// naposledy stažené akce i bez internetu. Neposílá žádné notifikace.
// Při změně index.html, app.js nebo styles.css zvyšte číslo verze.
const VERZE = 'kalendar-v3';
const ZAKLAD = [
  './',
  'index.html',
  'styles.css',
  'logika.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERZE).then((c) => c.addAll(ZAKLAD)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klice) => Promise.all(klice.filter((k) => k !== VERZE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // obrázky a odkazy na hravestroje.cz necháváme na prohlížeči
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Stránka a data (.json – akce, monetizace, produkty, nabídky): nejdřív síť (čerstvá data),
  // bez připojení uložená kopie.
  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(req)
        .then((odp) => {
          if (odp.ok) {
            const kopie = odp.clone();
            caches.open(VERZE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, kopie));
          }
          return odp;
        })
        .catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })),
    );
    return;
  }

  // Ostatní soubory (styly, skript, ikony): z mezipaměti, na pozadí aktualizovat.
  e.respondWith(
    caches.match(req).then((ulozena) => {
      const zeSite = fetch(req)
        .then((odp) => {
          if (odp.ok) caches.open(VERZE).then((c) => c.put(req, odp.clone()));
          return odp;
        })
        .catch(() => ulozena);
      return ulozena || zeSite;
    }),
  );
});
