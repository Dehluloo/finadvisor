// FinRAD service worker: офлайн-кеш (назва залежить від версії) і push-сповіщення, коли програма закрита.
const V = new URL(self.location.href).searchParams.get('v') || '0';
const C = 'fa-v' + V;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch: true})));
});

// ---------- push ----------
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {body: e.data ? e.data.text() : ''}; }
  const title = d.title || 'FinRAD';
  const opt = {body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || undefined, renotify: !!d.tag, data: {url: d.url || './'}, timestamp: Date.now()};
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, opt),
    // відкрита програма одразу показує новину в стрічці
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => cs.forEach(c => c.postMessage({type: 'push', data: d})))
  ]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.postMessage({type: 'open', url}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
// підписка змінилась (браузер оновив ключі) — повідомити програму при наступному запуску
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => cs.forEach(c => c.postMessage({type: 'resubscribe'}))));
});
