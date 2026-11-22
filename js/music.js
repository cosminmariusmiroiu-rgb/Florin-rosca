/* Muzica pe paginile secundare (magazin, consultație): aceeași melodie, continuă de unde a rămas */
(function () {
  'use strict';
  var btn = document.querySelector('.sound'), theme = document.getElementById('theme');
  if (!btn || !theme) return;
  theme.volume = 0.7;
  var KEY = 'fr-music-off-v2', POS = 'fr-music-pos';
  function off() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function put(v) { try { v ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch (e) {} }
  function state(on) {
    btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-on', on);
    var l = on ? 'Oprește muzica' : 'Pornește muzica';
    btn.querySelector('.sound__label').textContent = l; btn.setAttribute('aria-label', l);
  }
  function start() { return theme.play().then(function () { state(true); return true; }).catch(function () { return false; }); }
  try { var pos = +sessionStorage.getItem(POS); if (pos > 0) theme.addEventListener('loadedmetadata', function () { theme.currentTime = pos % (theme.duration || 1e9); }, { once: true }); } catch (e) {}
  window.addEventListener('pagehide', function () { try { sessionStorage.setItem(POS, String(theme.currentTime || 0)); } catch (e) {} });
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (theme.paused) { put(false); start(); } else { theme.pause(); state(false); put(true); }
  });
  if (off()) return;
  theme.preload = 'auto';
  var evs = ['mousedown', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'wheel', 'scroll', 'touchmove'], trying = false;
  function stop() { evs.forEach(function (ev) { window.removeEventListener(ev, onAny, true); }); }
  function onAny() {
    if (off() || !theme.paused) return stop();
    if (trying) return; trying = true;
    start().then(function (ok) { trying = false; if (ok) stop(); });
  }
  start().then(function (ok) {
    if (ok) return;
    evs.forEach(function (ev) { window.addEventListener(ev, onAny, { capture: true, passive: true }); });
    setTimeout(onAny, 800);
  });
})();
