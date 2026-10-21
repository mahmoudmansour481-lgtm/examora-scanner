// Examora Scanner service worker: keeps the app files on the phone so it opens instantly (and without signal).
// Only GET requests of this site are cached; the Examora API (a POST to script.google.com) always goes to the network.
var CACHE = 'examora-scanner-v4';
var FILES = ['./', './index.html', './jsQR.js', './manifest.webmanifest', './icon-v2-192.png', './icon-v2-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('examora-scanner-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  // network first (new versions arrive at once), the cached copy when offline
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
