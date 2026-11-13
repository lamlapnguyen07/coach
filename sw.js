/* Service Worker：離線快取＋收到推播時依手機上的紀錄決定要罵什麼 */
importScripts('core.js');
const CACHE = 'coach-v4';
const ASSETS = ['./', 'index.html', 'style.css', 'core.js', 'app.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* 有網路用最新版，沒網路用快取 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let top = { title: '教練點名', body: '打開 App，交代你今天吃了什麼。' };
    try {
      const state = await self.Core.dbGet('state');
      if (state) top = self.Core.evaluate(state, new Date(), Math.floor(Math.random() * 1000)).top;
    } catch (err) { /* 讀不到資料就用預設訊息 */ }
    await self.registration.showNotification(top.title, { body: top.body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'nag' });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./');
  }));
});
