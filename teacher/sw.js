// Examora Examora Teacher service worker: keeps the app shell on the device so it opens instantly and can be installed.
// Only GET requests of this site are cached; Examora itself (script.google.com, inside the frame) always goes to the network.
var CACHE = 'examora-teacher-v4';
var FILES = ['./', './index.html', '../shell.js', '../config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('examora-teacher-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin) return;
  // network first (a new config.js / shell.js arrives at once), the cached copy when offline
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
});
