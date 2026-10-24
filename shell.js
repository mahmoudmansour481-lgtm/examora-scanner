// Examora app shell (teacher / student PWA). Shows the Examora page full screen inside YOUR site (no Google bar),
// registers the service worker (installable app) and offers an Install button. Text only via textContent; no external scripts.
// Needs: config.js (EXAMORA_EXEC) loaded first; Config.EMBED_SITE = this site's address (https://NAME.github.io).
var I18N = {
  en: {
    noLink: 'Examora: put your /exec link in config.js (line EXAMORA_EXEC).',
    offline: 'No internet connection. Examora will reload when you are back online.',
    install: 'Install the app', installTeacher: 'Install Examora Teacher on this device', installStudent: 'Install Examora on this device',
    iosHint: 'To install: tap Share, then Add to Home Screen.', close: 'Close',
    pushAsk: 'Get a notification on this phone when a new message or announcement arrives?', pushOn: 'Turn on', pushDenied: 'Notifications are blocked for this app in the phone settings.'
  },
  ar: {
    noLink: 'Examora: حط رابط /exec بتاعك في config.js (سطر EXAMORA_EXEC).',
    offline: 'مفيش اتصال بالإنترنت. Examora هيفتح تاني أول ما النت يرجع.',
    install: 'ثبّت التطبيق', installTeacher: 'ثبّت تطبيق Examora للمدرس على الجهاز ده', installStudent: 'ثبّت تطبيق Examora على الجهاز ده',
    iosHint: 'للتثبيت: دوس على زر المشاركة وبعدين Add to Home Screen.', close: 'إغلاق',
    pushAsk: 'عايز إشعار على الموبايل ده لما توصلك رسالة أو إعلان جديد؟', pushOn: 'شغّل الإشعارات', pushDenied: 'الإشعارات مقفولة للتطبيق ده من إعدادات الموبايل.'
  }
};
var EXEC_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.\-]+|macros)\/s\/[A-Za-z0-9_\-]+\/exec$/;
var PASS_KEYS = ['portal', 'h', 'qr', 'parent', 'lang'];          // only these reach Examora; anything else is dropped
var LANG = 'en';
function t(k) { return (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k; }

/** ?a=1&b=2 -> {a:'1', b:'2'} keeping only PASS_KEYS with a safe value. */
function shellParams(search) {
  var out = {};
  String(search || '').replace(/^\?/, '').split('&').forEach(function (pair) {
    if (!pair) return; var i = pair.indexOf('='), k = i < 0 ? pair : pair.slice(0, i), v = i < 0 ? '' : pair.slice(i + 1);
    try { k = decodeURIComponent(k); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { return; }
    if (PASS_KEYS.indexOf(k) >= 0 && /^[A-Za-z0-9_\-]{0,64}$/.test(v)) out[k] = v;
  });
  return out;
}
function shellQuery(p) {
  var parts = PASS_KEYS.filter(function (k) { return p[k] !== undefined; }).map(function (k) { return k + '=' + encodeURIComponent(p[k]); });
  return parts.length ? '?' + parts.join('&') : '';
}
/** Where this visit goes: {redirect: url} or {src: url} or {error: 'NO_LINK'}. */
function shellRoute(role, exec, search) {
  exec = String(exec || '').trim();
  if (!EXEC_RE.test(exec) || /PUT-YOUR-ID/.test(exec)) return { error: 'NO_LINK' };
  var p = shellParams(search), portal = String(p.portal || '').toLowerCase();
  if (portal === 'admin') return { redirect: exec + shellQuery({ portal: 'admin', lang: p.lang }) };   // the admin page is never framed
  if (role === 'student' && portal === 'staff') { p.portal = 'staff'; return { redirect: '../teacher/' + shellQuery(p) }; }
  if (role === 'teacher') p.portal = 'staff'; else delete p.portal;
  return { src: exec + shellQuery(p) };
}

/** O: the frame link after a refresh: same Examora link + the page's one-time code (h) and language; never another site. */
function shellReloadSrc(role, src, params) {
  var p = shellParams(String(src || '').replace(/^[^?]*/, '')), q = params && typeof params === 'object' ? params : {};
  if (typeof q.h === 'string' && /^[0-9a-f]{32}$/.test(q.h)) p.h = q.h; else delete p.h;
  if (q.lang === 'ar' || q.lang === 'en') p.lang = q.lang;
  if (role === 'teacher') p.portal = 'staff'; else if (q.portal === 'staff') p.portal = 'staff'; else delete p.portal;
  return String(src || '').replace(/\?.*$/, '') + shellQuery(p);
}

/**
 * Phone fit (Delivery M). Some Android phones (seen on Honor 200) open the installed app at a desktop layout width (~980 px)
 * and shrink it: tiny login, then Chrome zooms in on the PIN box. When this page is laid out much wider than the phone screen,
 * the frame is given the real phone width and scaled up to fill the screen, so Examora inside is laid out at phone width.
 * Returns the scale used (1 = nothing to fix).
 */
function shellFitScale(layoutW, screenW, touch) {
  layoutW = Number(layoutW) || 0; screenW = Number(screenW) || 0;
  if (!touch || !screenW || screenW >= 900 || layoutW <= screenW * 1.2) return 1;
  return layoutW / screenW;
}
function shellFit(f) {
  var nav = (typeof navigator !== 'undefined' && navigator) || {}, scr = (typeof screen !== 'undefined' && screen) || {};
  var touch = ('ontouchstart' in window) || (nav.maxTouchPoints || 0) > 0;
  var z = shellFitScale(window.innerWidth, scr.width, touch), st = f.style;
  if (!st) return z;
  if (z === 1) { st.position = ''; st.width = ''; st.height = ''; st.transform = ''; st.transformOrigin = ''; return 1; }
  st.position = 'absolute'; st.left = '0'; st.top = '0';
  st.width = Math.round(window.innerWidth / z) + 'px'; st.height = Math.round(window.innerHeight / z) + 'px';
  st.transformOrigin = '0 0'; st.transform = 'scale(' + z + ')';
  return z;
}

/** P8: base64url (the server's public key) -> bytes for pushManager.subscribe. */
function pushKeyBytes(b64) {
  var s = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
}
/** P8: where the service worker finds this device's notification id (it cannot read localStorage). */
function pushStoreName(role) { return 'exm-push-' + role; }
function pushSave(role, o) { try { return caches.open(pushStoreName(role)).then(function (c) { return o ? c.put('push-id', new Response(JSON.stringify(o))) : c.delete('push-id'); }); } catch (e) { return Promise.resolve(); } }
function pushLoad(role) { try { return caches.open(pushStoreName(role)).then(function (c) { return c.match('push-id'); }).then(function (r) { return r ? r.json() : null; }).catch(function () { return null; }); } catch (e) { return Promise.resolve(null); } }
function pushPost(body) { return fetch(EXAMORA_EXEC, { method: 'POST', body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

/** Q: the message comes from Google's page inside OUR frame (Apps Script nests it one level down), not from any other frame. */
function shellKeepFrom(e, frame) {
  if (!/^https:\/\/[a-z0-9\-]+\.googleusercontent\.com$/.test(String(e.origin || ''))) return false;
  try { var src = e.source, top = frame && frame.contentWindow; return !!(src && top && (src === top || src.parent === top)); } catch (x) { return false; }
}

function bar(cls, text, buttons) {
  var b = document.createElement('div'); b.className = 'bar ' + cls;
  var s = document.createElement('span'); s.textContent = text; b.appendChild(s);
  (buttons || []).forEach(function (x) { var k = document.createElement('button'); k.type = 'button'; k.textContent = x[0]; if (x[2]) k.className = x[2]; k.addEventListener('click', x[1]); b.appendChild(k); });
  document.body.appendChild(b); return b;
}
function hide(el) { if (el) el.classList.add('hide'); }
function show(el) { if (el) el.classList.remove('hide'); }

/** R7: open the connections to Google while the page is still starting (saves a few hundred ms on a phone). */
function shellPreconnect() {
  ['https://script.google.com', 'https://script.googleusercontent.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'].forEach(function (h) {
    try { var l = document.createElement('link'); l.rel = 'preconnect'; l.href = h; if (/gstatic/.test(h)) l.crossOrigin = ''; document.head.appendChild(l); } catch (e) { }
  });
}
/** R7: splash (brand mark + three breathing bars) over the frame until Examora says it is ready. */
/** THEMES: splash colours of the look chosen inside Examora (told by the page, kept here as exm_shell_theme). [light bg, ink, accent, dark bg, dark ink, dark accent] */
var SHELL_LOOKS = { classic: ['#f6f7f9', '#2457d6', '#ffb000', '#14171c', '#6b94ff', '#f0b35b'], editorial: ['#f4f1ea', '#0f4f47', '#e3a13a', '#0e1312', '#5fc2b2', '#f0b75a'],
  navy: ['#f2f4f8', '#1b2f5c', '#b8901c', '#0a1020', '#8fb0ff', '#e0bf55'], brown: ['#f6efe5', '#6b3f22', '#c4622f', '#16100b', '#e3a779', '#ec8a55'] };
function shellLook() { var k = ''; try { k = localStorage.getItem('exm_shell_theme') || ''; } catch (e) { } return SHELL_LOOKS[k] || SHELL_LOOKS.classic; }
function shellSplash() {
  try {
    var L = shellLook(), css = document.createElement('style');
    css.textContent = '#exmSplash{position:fixed;inset:0;z-index:8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:' + L[0] + ';transition:opacity .45s ease,visibility 0s .45s}' +
      '#exmSplash.off{opacity:0;visibility:hidden}#exmSplash b{font:600 22px/1 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;color:' + L[1] + ';letter-spacing:.02em}' +
      '#exmSplash .mk{display:flex;gap:6px;align-items:flex-end;height:34px}#exmSplash .mk i{width:8px;border-radius:4px;background:' + L[1] + ';animation:exS 1s cubic-bezier(.2,.7,.2,1) infinite}' +
      '#exmSplash .mk i:nth-child(1){height:18px}#exmSplash .mk i:nth-child(2){height:30px;background:' + L[2] + ';animation-delay:.12s}#exmSplash .mk i:nth-child(3){height:22px;animation-delay:.24s}' +
      '@keyframes exS{0%,100%{transform:scaleY(.45);opacity:.6}50%{transform:scaleY(1);opacity:1}}' +
      '@media (prefers-color-scheme:dark){#exmSplash{background:' + L[3] + '}#exmSplash b{color:' + L[4] + '}#exmSplash .mk i{background:' + L[4] + '}#exmSplash .mk i:nth-child(2){background:' + L[5] + '}}';
    document.head.appendChild(css);
    var d = document.createElement('div'); d.id = 'exmSplash'; d.setAttribute('role', 'status');
    var mk = document.createElement('div'); mk.className = 'mk'; for (var i = 0; i < 3; i++) mk.appendChild(document.createElement('i'));
    var b = document.createElement('b'); b.textContent = 'Examora';
    d.appendChild(mk); d.appendChild(b); document.body.appendChild(d); return d;
  } catch (e) { return null; }
}
function shellSplashOff(d) { if (d && !d.classList.contains('off')) { d.classList.add('off'); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 600); } }

function examoraShell(role) {
  var p0 = shellParams(location.search), nav = (typeof navigator !== 'undefined' && navigator) || {};
  LANG = p0.lang === 'ar' || p0.lang === 'en' ? p0.lang : (/^ar/i.test(String(nav.language || '')) ? 'ar' : 'en');
  document.documentElement.setAttribute('lang', LANG); document.documentElement.setAttribute('dir', LANG === 'ar' ? 'rtl' : 'ltr');
  var r = shellRoute(role, typeof EXAMORA_EXEC === 'string' ? EXAMORA_EXEC : '', location.search), st = { route: r, frame: null, installEvt: null, bars: {} };
  if (r.error) { var m = document.createElement('p'); m.className = 'msg'; m.textContent = t('noLink'); document.body.appendChild(m); return st; }
  if (r.redirect) { location.replace(r.redirect); return st; }

  shellPreconnect();
  var splash = shellSplash();                                             // R7: our own splash instead of a white page while Google starts Examora
  var f = document.createElement('iframe');
  f.addEventListener('load', function () { setTimeout(function () { shellSplashOff(splash); }, 9000); });
  setTimeout(function () { shellSplashOff(splash); }, 30000);
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.examora === 'ready' && /^https:\/\/[a-z0-9\-]+\.googleusercontent\.com$/.test(String(e.origin || ''))) shellSplashOff(splash);
    if (e && e.data && e.data.examora === 'theme' && SHELL_LOOKS[e.data.theme] && /^https:\/\/[a-z0-9\-]+\.googleusercontent\.com$/.test(String(e.origin || ''))) { try { localStorage.setItem('exm_shell_theme', e.data.theme); } catch (x) { } }
  });
  f.src = r.src; f.setAttribute('title', 'Examora'); f.setAttribute('allow', 'clipboard-write; camera; microphone; fullscreen');
  document.body.appendChild(f); st.frame = f;
  st.fit = shellFit(f); window.addEventListener('resize', function () { st.fit = shellFit(f); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { st.fit = shellFit(f); }, 300); });

  // O: refresh button / "new update" bar inside Examora: reload the frame with the one-time code it sends (keeps the session)
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || d.examora !== 'reload' || !/^https:\/\/[a-z0-9\-]+\.googleusercontent\.com$/.test(String(e.origin || ''))) return;
    try { e.source.postMessage({ examora: 'reloading' }, e.origin); } catch (x) { }
    st.reloadTo = shellReloadSrc(role, r.src, d.params);
    f.src = st.reloadTo;
  });

  // Q: "Remember me" copy. Google's frame loses its storage on iPhone; this site's storage is the app's own and stays.
  // Only the Examora page inside OUR frame may save or read it (origin + frame check); only a 64-hex device token is kept.
  try { if (nav.storage && nav.storage.persist) nav.storage.persist().catch(function () {}); } catch (e) { }
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || (d.examora !== 'keep' && d.examora !== 'keep-get') || !shellKeepFrom(e, f)) return;
    if (d.kind !== 'student' && d.kind !== 'staff') return;
    var key = 'exm_keep_' + d.kind;
    if (d.examora === 'keep') { try { if (typeof d.token === 'string' && /^[0-9a-f]{64}$/.test(d.token)) localStorage.setItem(key, d.token); else localStorage.removeItem(key); } catch (x) { } return; }
    var v = null; try { v = localStorage.getItem(key); } catch (x) { }
    try { e.source.postMessage({ examora: 'kept', kind: d.kind, token: /^[0-9a-f]{64}$/.test(String(v || '')) ? v : null }, e.origin); } catch (x) { }
  });

  if (nav.serviceWorker && nav.serviceWorker.register) { try { nav.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} }

  // P8: phone notifications. Examora (inside the frame) sends a one-time offer after sign-in; the permission is asked with OUR button.
  var PKEY = 'exm_push_hide_' + role, pushOffer = null;
  st.bars.push = bar('hide', t('pushAsk'), [[t('pushOn'), function () {
    hide(st.bars.push); var o = pushOffer; if (!o) return;
    try { Notification.requestPermission().then(function (p) { if (p === 'granted') pushSubscribe(o); else if (p === 'denied') { st.bars.pushNo = st.bars.pushNo || bar('', t('pushDenied'), [[t('close'), function () { hide(st.bars.pushNo); }]]); } }); } catch (e) { }
  }, 'main'], [t('close'), function () { hide(st.bars.push); try { localStorage.setItem(PKEY, '1'); } catch (e) { } }]]);
  function pushSubscribe(o) {
    return nav.serviceWorker.ready.then(function (reg) {
      var key = pushKeyBytes(o.key), sub = function () { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); };
      return reg.pushManager.getSubscription().then(function (old) { return old ? sub().catch(function () { return old.unsubscribe().then(sub); }) : sub(); });
    }).then(function (s) { return pushPost({ action: 'pushSubscribe', code: o.code, endpoint: s.endpoint, lang: o.lang === 'ar' ? 'ar' : LANG }); })
      .then(function (j) { if (j && j.ok) { st.push = 'on'; return pushSave(role, { sub: j.data.sub, key: j.data.key, api: EXAMORA_EXEC, lang: o.lang === 'ar' ? 'ar' : LANG }); } })
      .catch(function () { st.push = 'failed'; });
  }
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || (d.examora !== 'push' && d.examora !== 'push-off') || !/^https:\/\/[a-z0-9\-]+\.googleusercontent\.com$/.test(String(e.origin || ''))) return;
    if (d.examora === 'push-off') { pushLoad(role).then(function (id) { if (id) { pushPost({ action: 'pushOff', sub: id.sub, key: id.key }).catch(function () {}); pushSave(role, null); } }); return; }
    if (typeof d.key !== 'string' || !/^[0-9a-f]{32}$/.test(String(d.code || ''))) return;
    if (!nav.serviceWorker || typeof window.PushManager === 'undefined' || typeof Notification === 'undefined') { st.push = 'unsupported'; return; }
    var ios = /iphone|ipad|ipod/i.test(String(nav.userAgent || '')), alone = false; try { alone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true; } catch (x) { }
    if (ios && !alone) { st.push = 'install-first'; return; }            // iPhone: notifications only in the installed app
    pushOffer = { key: d.key, code: d.code, lang: d.lang };
    if (Notification.permission === 'granted') { pushSubscribe(pushOffer); return; }   // the device follows whoever signed in
    if (Notification.permission === 'denied') { st.push = 'denied'; return; }
    var hidden = false; try { hidden = localStorage.getItem(PKEY) === '1'; } catch (x) { }
    if (!hidden) show(st.bars.push);
  });

  // offline notice; the frame reloads once the connection is back
  st.bars.offline = bar('warn hide', t('offline')); var wasOff = false;
  function net(on) { if (on) { hide(st.bars.offline); if (wasOff) f.src = r.src; wasOff = false; } else { show(st.bars.offline); wasOff = true; } }
  if (nav.onLine === false) net(false);
  window.addEventListener('offline', function () { net(false); });
  window.addEventListener('online', function () { net(true); });

  // install offer (Android / desktop Chrome / Edge); iPhone gets a one-line hint. "Close" is remembered on this device.
  var KEY = 'exm_pwa_hide_' + role, standalone = false;
  try { standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true; } catch (e) {}
  var dismissed = false; try { dismissed = localStorage.getItem(KEY) === '1'; } catch (e) {}
  function dismiss() { hide(st.bars.install); hide(st.bars.ios); try { localStorage.setItem(KEY, '1'); } catch (e) {} }
  st.bars.install = bar('hide', t(role === 'teacher' ? 'installTeacher' : 'installStudent'), [[t('install'), function () {
    var e = st.installEvt; if (!e) return; st.installEvt = null; hide(st.bars.install);
    try { e.prompt(); } catch (x) {}
  }, 'main'], [t('close'), dismiss]]);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); st.installEvt = e; if (!dismissed && !standalone) show(st.bars.install); });
  window.addEventListener('appinstalled', function () { st.installEvt = null; hide(st.bars.install); });
  if (!standalone && !dismissed && /iphone|ipad|ipod/i.test(String(nav.userAgent || ''))) st.bars.ios = bar('', t('iosHint'), [[t('close'), dismiss]]);
  return st;
}
