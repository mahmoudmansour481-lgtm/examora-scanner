// Examora app shell (teacher / student PWA). Shows the Examora page full screen inside YOUR site (no Google bar),
// registers the service worker (installable app) and offers an Install button. Text only via textContent; no external scripts.
// Needs: config.js (EXAMORA_EXEC) loaded first; Config.EMBED_SITE = this site's address (https://NAME.github.io).
var I18N = {
  en: {
    noLink: 'Examora: put your /exec link in config.js (line EXAMORA_EXEC).',
    offline: 'No internet connection. Examora will reload when you are back online.',
    install: 'Install the app', installTeacher: 'Install Examora Teacher on this device', installStudent: 'Install Examora on this device',
    iosHint: 'To install: tap Share, then Add to Home Screen.', close: 'Close'
  },
  ar: {
    noLink: 'Examora: حط رابط /exec بتاعك في config.js (سطر EXAMORA_EXEC).',
    offline: 'مفيش اتصال بالإنترنت. Examora هيفتح تاني أول ما النت يرجع.',
    install: 'ثبّت التطبيق', installTeacher: 'ثبّت تطبيق Examora للمدرس على الجهاز ده', installStudent: 'ثبّت تطبيق Examora على الجهاز ده',
    iosHint: 'للتثبيت: دوس على زر المشاركة وبعدين Add to Home Screen.', close: 'إغلاق'
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

function bar(cls, text, buttons) {
  var b = document.createElement('div'); b.className = 'bar ' + cls;
  var s = document.createElement('span'); s.textContent = text; b.appendChild(s);
  (buttons || []).forEach(function (x) { var k = document.createElement('button'); k.type = 'button'; k.textContent = x[0]; if (x[2]) k.className = x[2]; k.addEventListener('click', x[1]); b.appendChild(k); });
  document.body.appendChild(b); return b;
}
function hide(el) { if (el) el.classList.add('hide'); }
function show(el) { if (el) el.classList.remove('hide'); }

function examoraShell(role) {
  var p0 = shellParams(location.search), nav = (typeof navigator !== 'undefined' && navigator) || {};
  LANG = p0.lang === 'ar' || p0.lang === 'en' ? p0.lang : (/^ar/i.test(String(nav.language || '')) ? 'ar' : 'en');
  document.documentElement.setAttribute('lang', LANG); document.documentElement.setAttribute('dir', LANG === 'ar' ? 'rtl' : 'ltr');
  var r = shellRoute(role, typeof EXAMORA_EXEC === 'string' ? EXAMORA_EXEC : '', location.search), st = { route: r, frame: null, installEvt: null, bars: {} };
  if (r.error) { var m = document.createElement('p'); m.className = 'msg'; m.textContent = t('noLink'); document.body.appendChild(m); return st; }
  if (r.redirect) { location.replace(r.redirect); return st; }

  var f = document.createElement('iframe');
  f.src = r.src; f.setAttribute('title', 'Examora'); f.setAttribute('allow', 'clipboard-write; camera; microphone; fullscreen');
  document.body.appendChild(f); st.frame = f;

  if (nav.serviceWorker && nav.serviceWorker.register) { try { nav.serviceWorker.register('sw.js').catch(function () {}); } catch (e) {} }

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
