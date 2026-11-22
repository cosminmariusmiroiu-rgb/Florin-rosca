/* Fișa de consultație: pași simpli, poze micșorate în telefon înainte de trimitere */
(function () {
  'use strict';
  var form = document.getElementById('consultForm');
  if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll('.cs__step'));
  var dots = document.querySelectorAll('.cs__steps i');
  var err = form.querySelector('.cs__err');
  var back = document.getElementById('csBack'), next = document.getElementById('csNext'), send = document.getElementById('csSend');
  var cur = 0, photos = {};
  var DRAFT = 'fr-consult';

  // keep answers if she leaves the page and comes back (photos excluded)
  try {
    var d = JSON.parse(localStorage.getItem(DRAFT) || '{}');
    Object.keys(d).forEach(function (k) {
      var els = form.elements[k]; if (!els) return;
      if (els.length && els[0] && els[0].type === 'radio') Array.prototype.forEach.call(els, function (r) { r.checked = r.value === d[k]; });
      else if (els.type === 'checkbox') els.checked = !!d[k];
      else if (els.type !== 'file') els.value = d[k];
    });
  } catch (e) {}
  form.addEventListener('input', function () {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file') return;
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.type === 'checkbox') o[el.name] = el.checked;
      else o[el.name] = el.value;
    });
    try { localStorage.setItem(DRAFT, JSON.stringify(o)); } catch (e) {}
    toggleMore();
  });

  function toggleMore() {
    form.querySelectorAll('[data-if]').forEach(function (el) {
      var r = form.querySelector('input[name="' + el.getAttribute('data-if') + '"]:checked');
      el.hidden = !(r && r.value === 'Da');
    });
  }
  toggleMore();

  function show(i) {
    cur = i;
    steps.forEach(function (s, k) { s.hidden = k !== i; });
    dots.forEach(function (d, k) { d.classList.toggle('on', k <= i); });
    back.hidden = i === 0;
    next.hidden = i === steps.length - 1;
    send.hidden = i !== steps.length - 1;
    err.textContent = '';
    var top = document.querySelector('.cs__steps');
    if (top) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
  }

  function valid(i) {
    var s = steps[i], bad = null;
    s.querySelectorAll('input[required], select[required]').forEach(function (el) {
      if (bad) return;
      if (el.closest('[hidden]') && el.closest('[hidden]') !== s) return;
      if (el.type === 'radio') { if (!s.querySelector('input[name="' + el.name + '"]:checked')) bad = el; }
      else if (el.type === 'checkbox') { if (!el.checked) bad = el; }
      else if (el.type === 'file') { if (!photos[el.name]) bad = el; }
      else if (!el.value.trim()) bad = el;
    });
    if (bad) {
      var q = bad.closest('.cs__q, .cs__photo, label');
      var txt = bad.type === 'checkbox' ? 'Bifează căsuța ca să continui.' : bad.type === 'file' ? 'Adaugă toate cele 3 poze.' : 'Răspunde la toate întrebările marcate cu *.';
      err.textContent = txt;
      if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (i === 0 && !/^[+0-9 ()-]{9,20}$/.test(form.phone.value.trim())) { err.textContent = 'Numărul de telefon nu pare corect.'; return false; }
    return true;
  }

  next.addEventListener('click', function () { if (valid(cur)) show(cur + 1); });
  back.addEventListener('click', function () { show(cur - 1); });

  document.getElementById('copyIban').addEventListener('click', function () {
    var t = document.getElementById('iban').textContent.trim(), b = this;
    var done = function () { b.querySelector('span').textContent = 'Copiat ✓'; setTimeout(function () { b.querySelector('span').textContent = 'Copiază IBAN-ul'; }, 2000); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
  });

  // shrink photos to max 1600px JPEG before upload
  function shrink(file) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { rej(new Error('Poza nu a putut fi citită. Încearcă altă poză.')); };
      img.src = url;
    });
  }
  form.querySelectorAll('.cs__photo input').forEach(function (inp) {
    inp.addEventListener('change', function () {
      var f = inp.files[0], box = inp.closest('.cs__photo');
      if (!f) return;
      box.classList.add('is-loading');
      shrink(f).then(function (data) {
        photos[inp.name] = data;
        box.querySelector('img').src = data;
        box.classList.add('has'); err.textContent = '';
      }).catch(function (x) { err.textContent = x.message; }).then(function () { box.classList.remove('is-loading'); });
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!valid(cur)) return;
    var body = { photos: photos };
    ['name', 'phone', 'email', 'service', 'lastColor', 'boxDye', 'homeBleach', 'keratin', 'keratinSince', 'perm', 'permSince', 'allergy', 'allergyDetails', 'notes'].forEach(function (k) {
      var el = form.elements[k]; if (!el) return;
      body[k] = el.length && el[0] && el[0].type === 'radio' ? ((form.querySelector('input[name="' + k + '"]:checked') || {}).value || '') : el.value;
    });
    body.depositAck = form.depositAck.checked; body.gdpr = form.gdpr.checked;
    send.disabled = true; send.querySelector('span').textContent = 'Se trimite…';
    fetch('api/consult', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        if (r.status === 404 || r.status === 405) throw new Error('offline');
        return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Fișa nu a putut fi trimisă.'); return d; });
      })
      .then(function (d) {
        try { localStorage.removeItem(DRAFT); } catch (x) {}
        form.hidden = true; document.querySelector('.cs__steps').hidden = true;
        var done = document.getElementById('csDone'); done.hidden = false;
        if (d.evaluation && d.evaluation.length) document.getElementById('csEval').innerHTML = '<h3>Primele observații pentru părul tău</h3><ul>' + d.evaluation.map(function (x) { return '<li>' + x.replace(/</g, '&lt;') + '</li>'; }).join('') + '</ul><p class="cs__small">Evaluarea finală o face Florin la consultația din salon.</p>';
        done.scrollIntoView({ behavior: 'smooth' });
      })
      .catch(function (x) {
        err.innerHTML = x.message === 'offline' || x.message === 'Failed to fetch'
          ? 'Momentan fișa nu poate fi trimisă online. Te rugăm să suni la <a href="tel:+40732937622">0732 937 622</a>.'
          : x.message.replace(/</g, '&lt;');
      })
      .then(function () { send.disabled = false; send.querySelector('span').textContent = 'Trimite fișa'; });
  });

  show(0);
})();
