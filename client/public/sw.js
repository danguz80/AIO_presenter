/**
 * Service Worker — sirve archivos locales FSA desde Cache API.
 * Intercepta peticiones a /local-media/* y las responde desde la cache
 * 'aio-local-media', permitiendo que OutputPage, StagePage y VirtualPage
 * (ventanas separadas) carguen videos/imágenes del sistema de archivos local.
 *
 * IMPORTANTE: maneja Range requests (bytes=start-end) para que el browser
 * pueda hacer seek en videos y mostrar el frame estático en thumbnails.
 */
const CACHE = 'aio-local-media';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (!url.pathname.startsWith('/local-media/')) return;

  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(url.pathname);
      if (!cached) {
        return new Response('Media file not found in cache', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      const rangeHeader = e.request.headers.get('range');

      // Sin Range → devolver el archivo completo con Accept-Ranges para que el
      // browser sepa que puede pedir rangos en requests posteriores.
      if (!rangeHeader) {
        const headers = new Headers(cached.headers);
        headers.set('Accept-Ranges', 'bytes');
        return new Response(cached.body, { status: 200, headers });
      }

      // Con Range → responder solo el fragmento solicitado (206 Partial Content).
      // Esto es necesario para que el browser pueda hacer seek en videos.
      try {
        const blob = await cached.blob();
        const total = blob.size;
        const [, rangeVal] = rangeHeader.split('=');
        const [startStr, endStr] = rangeVal.split('-');
        const start = parseInt(startStr, 10) || 0;
        const end   = endStr ? Math.min(parseInt(endStr, 10), total - 1) : total - 1;
        const chunk = blob.slice(start, end + 1);
        const contentType = cached.headers.get('Content-Type') || 'application/octet-stream';

        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type':  contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
          },
        });
      } catch {
        // Si falla el slicing devolver la respuesta completa como fallback
        return cached;
      }
    })
  );
});
