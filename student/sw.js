// Examora Examora Student service worker: keeps the app shell on the device so it opens instantly and can be installed.
// Only GET requests of this site are cached; Examora itself (script.google.com, inside the frame) always goes to the network.
var CACHE = 'examora-student-v6';
var FILES = ['./', './index.html', '../shell.js', '../config.js', './manifest.webmanifest', './icon-v2-192.png', './icon-v2-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('examora-student-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  // network first (a new config.js / shell.js arrives at once), the cached copy when offline
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});

// P8: phone notifications. The push itself is empty: ask Examora what is new for this device, then show it (always show something).
function pushId() { return caches.open('exm-push-student').then(function (c) { return c.match('push-id'); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; }); }
self.addEventListener('push', function (e) {
  e.waitUntil(pushId().then(function (id) {
    var none = { title: 'Examora', body: id && id.lang === 'ar' ? 'عندك جديد في Examora' : 'Something new in Examora', tag: 'examora' };
    if (!id) return [none];
    return fetch(id.api, { method: 'POST', body: JSON.stringify({ action: 'pushPeek', sub: id.sub, key: id.key }) }).then(function (r) { return r.json(); })
      .then(function (j) { return j && j.ok && j.data.notes.length ? j.data.notes : [none]; }).catch(function () { return [none]; });
  }).then(function (list) {
    return Promise.all(list.slice(0, 3).map(function (n) { return self.registration.showNotification(n.title || 'Examora', { body: n.body || '', tag: n.tag || 'examora', icon: 'icon-v2-192.png', badge: 'icon-v2-192.png', data: { url: './' } }); }));
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) if ('focus' in ws[i]) return ws[i].focus();
    return self.clients.openWindow('./');
  }));
});
