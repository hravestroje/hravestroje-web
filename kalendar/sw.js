// Service worker kalendáře akcí: umožní přidat stránku na plochu (i aplikaci z Google Play)
// a zobrazit naposledy stažené akce i bez internetu. Neposílá žádné notifikace.
// Při změně index.html, app.js, logika.js, zarizeni.js nebo styles.css zvyšte číslo verze.
const VERZE = 'kalendar-v6';
const ZAKLAD = [
  './',
  'index.html',
  'styles.css',
  'logika.js',
  'zarizeni.js',
  'app.js',
  'akce.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
// Hlavička, podle které stránka pozná, že data jsou uložená (bez signálu).
const OFFLINE = 'X-Kalendar-Offline';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERZE).then((c) => c.addAll(ZAKLAD)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klice) => Promise.all(klice.filter((k) => k.startsWith('kalendar-') && k !== VERZE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Kopie uložené odpovědi s hlavičkou X-Kalendar-Offline: 1
async function oznacUlozenou(odp) {
  if (!odp) return odp;
  const hlavicky = new Headers(odp.headers);
  hlavicky.set(OFFLINE, '1');
  return new Response(await odp.blob(), { status: odp.status, statusText: odp.statusText, headers: hlavicky });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // obrázky a odkazy na hravestroje.cz necháváme na prohlížeči
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Jiné stránky ve složce (např. hs-kalendar-demo.html) nejsou aplikace – nechat na síti,
  // jinak by se uložily místo index.html a bez signálu by se ukázala špatná stránka.
  const koren = new URL(self.registration.scope).pathname;
  if (req.mode === 'navigate' && url.pathname !== koren && url.pathname !== koren + 'index.html') return;

  // Stránka a data (.json – akce, monetizace, produkty, nabídky): nejdřív síť (čerstvá data),
  // bez připojení uložená kopie (označená hlavičkou X-Kalendar-Offline).
  if (req.mode === 'navigate' || url.pathname.endsWith('.json')) {
    const klic = req.mode === 'navigate' ? 'index.html' : url.pathname;
    e.respondWith(
      fetch(req)
        .then((odp) => {
          if (odp.ok) {
            const kopie = odp.clone();
            e.waitUntil(caches.open(VERZE).then((c) => c.put(klic, kopie)));
          }
          return odp;
        })
        .catch(() => caches.match(klic, { ignoreSearch: true }).then(oznacUlozenou)
          .then((odp) => odp || Response.error())),
    );
    return;
  }

  // Ostatní soubory (styly, skripty, ikony): z mezipaměti, na pozadí aktualizovat.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((ulozena) => {
      const zeSite = fetch(req)
        .then((odp) => {
          if (odp.ok) {
            const kopie = odp.clone();
            e.waitUntil(caches.open(VERZE).then((c) => c.put(req, kopie)));
          }
          return odp;
        })
        .catch(() => ulozena || Response.error());
      return ulozena || zeSite;
    }),
  );
});
