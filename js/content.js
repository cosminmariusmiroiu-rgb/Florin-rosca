/* Texte modificate din panoul de administrare (doar când site-ul rulează pe serverul propriu) */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-edit]');
  if (!els.length || !window.fetch) return;
  fetch('api/content', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (c) {
      els.forEach(function (el) {
        var v = c[el.getAttribute('data-edit')];
        if (typeof v === 'string' && v) el.innerHTML = v; // already sanitised on the server (text + br/em/strong)
      });
    })
    .catch(function () {});
})();
