/**
 * Service Worker — sirve archivos locales FSA desde Cache API.
 * Intercepta peticiones a /local-media/* y las responde desde la cache
 * 'aio-local-media', permitiendo que OutputPage, StagePage y VirtualPage
 * (ventanas separadas) carguen videos/imágenes del sistema de archivos local.
 */
const CACHE = 'aio-local-media';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith('/local-media/')) return;

  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(url.pathname).then(response => {
        if (response) return response;
        return new Response('Media file not found in cache', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    )
  );
});
