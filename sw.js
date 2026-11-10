/* Criptorquidia Neo · service worker
   - Red primero para la página (siempre la versión más nueva si hay internet),
     con caída a la copia guardada si no hay conexión o tarda más de 3,5 s.
   - Fuentes de Google: se guardan la primera vez y luego se sirven desde caché.
   Para publicar una actualización basta con subir el nuevo index.html;
   cambie VERSION solo si modifica este archivo. */
const VERSION = 'cripto-neo-v1.0';
const CORE = ['./', './index.html'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(CORE.map(u =>
      cache.add(new Request(u, { cache: 'reload' })).catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('cripto-neo-') && k !== VERSION && k !== VERSION + '-fonts').map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
  })());
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function pageFromNetwork(event) {
  const preload = event.preloadResponse ? await event.preloadResponse : null;
  const res = preload || await fetch(event.request);
  if (res && res.ok) {
    const cache = await caches.open(VERSION);
    cache.put('./index.html', res.clone());
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Navegación: red con límite de tiempo → caché
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await Promise.race([pageFromNetwork(event), timeout(3500)]);
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) ||
               (await cache.match('./')) ||
               new Response('<h1 style="font-family:sans-serif">Sin conexión</h1><p>Abra la app una vez con internet para guardarla.</p>',
                            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // 2) Google Fonts: caché primero, actualización en segundo plano
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION + '-fonts');
      const hit = await cache.match(req);
      const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response('', { status: 504 });
    })());
    return;
  }

  // 3) Resto del mismo origen: caché primero
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) cache.put(req, r.clone());
        return r;
      } catch (e) {
        return new Response('', { status: 504 });
      }
    })());
  }
});
