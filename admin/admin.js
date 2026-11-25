/* Panou de administrare Florin Roșca */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lei = (n) => (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
  const img = (p) => (p ? '../' + p : '../assets/img/logo-mark.webp');
  // stored/page HTML -> editable text (keeps <em>/<strong>, <br> becomes a new line)
  const toText = (h) => String(h || '').replace(/\s*<br\s*\/?>\s*/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const when = (d) => (d ? new Date(d).toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  async function api(path, opts = {}) {
    const res = await fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'X-FR-Admin': '1' },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin'
    });
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && !path.startsWith('admin/login')) { showLogin(); throw new Error('Sesiunea a expirat. Intră din nou.'); }
    if (!res.ok) throw new Error(data.error || 'A apărut o eroare.');
    return data;
  }

  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
  function note(el, msg, good) { el.textContent = msg; el.className = 'note ' + (good ? 'ok' : 'bad'); }
  // the invoice goes to the customer as a WhatsApp message with a private link to the PDF (the salon only taps "send")
  const waPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 10 && d[0] === '0') d = '4' + d; return d.length >= 10 ? d : ''; };
  const invUrl = (inv) => ((settings && settings.siteUrl) || location.origin) + '/factura/' + inv.token + '.pdf';
  function waInvoice(inv, phone, name, what) {
    const first = String(name || '').trim().split(/\s+/)[0];
    const text = `Bună ziua${first ? ', ' + first : ''}! Vă trimitem factura ${inv.series} ${inv.number}${what ? ' pentru ' + what : ''} de la Florin Roșca Luxury Hair:\n${invUrl(inv)}\nVă mulțumim!`;
    return `<a class="btn btn--sm btn--wa" href="https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">🟢 Trimite factura pe WhatsApp</a>`;
  }
  async function busy(btn, fn) { btn.disabled = true; try { return await fn(); } finally { btn.disabled = false; } }

  /* ---------- login ---------- */
  let setupMode = false;
  function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
  async function boot() {
    let st;
    try { st = await api('admin/status'); }
    catch (e) { $('#login').hidden = false; $('#loginErr').textContent = 'Serverul nu răspunde. Panoul funcționează doar pe serverul site-ului.'; return; }
    if (st.loggedIn) return start();
    setupMode = st.needsSetup;
    $('#loginRepeat').hidden = !setupMode;
    $('#loginHint').textContent = setupMode ? 'Prima intrare: alege parola panoului (minim 8 caractere).' : 'Panou de administrare';
    $('#login').hidden = false;
    $('[name=password]', $('#loginForm')).focus();
  }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = $('#loginErr'); err.textContent = '';
    if (setupMode && f.password.value !== f.repeat.value) { err.textContent = 'Parolele nu coincid.'; return; }
    try { await busy($('button', f), () => api('admin/login', { method: 'POST', body: { password: f.password.value } })); f.reset(); start(); }
    catch (x) { err.textContent = x.message; }
  });
  $('#logout').addEventListener('click', async () => { await api('admin/logout', { method: 'POST' }).catch(() => {}); location.reload(); });
  $('#logout2').addEventListener('click', () => $('#logout').click());

  /* ---------- tabs ---------- */
  const loaders = {};
  function go(tab) {
    $$('#nav button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
    $$('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== tab));
    history.replaceState(null, '', '#' + tab);
    if (loaders[tab]) loaders[tab]().catch((e) => toast(e.message));
  }
  $$('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  function start() {
    $('#login').hidden = true; $('#app').hidden = false;
    const t = location.hash.slice(1);
    go(loaders[t] ? t : 'acasa');
  }

  /* ---------- dashboard ---------- */
  loaders.acasa = async () => {
    $('#heroDate').textContent = new Date().toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.querySelectorAll('[data-go2]').forEach((b) => { b.onclick = () => go(b.dataset.go2); });
    const s = await api('admin/summary');
    $('#navNew').hidden = !s.newOrders; $('#navNew').textContent = s.newOrders;
    const chat = s.chat || { today: 0, calls: 0, unanswered: 0 };
    $('#navChat').hidden = !chat.calls; $('#navChat').textContent = chat.calls;
    $('#navColete').hidden = !s.parcels; $('#navColete').textContent = s.parcels;
    // every section, by name, with what needs attention
    $('#homeTiles').innerHTML = [
      ['colete', '🚚', 'Colete de pregătit', s.parcels, s.parcels ? s.parcels + ' de pregătit' : 'niciunul acum'],
      ['comenzi', '🧾', 'Comenzi online', s.newOrders, s.newOrders ? s.newOrders + ' noi' : 'toate comenzile'],
      ['vanzare', '💳', 'Vânzare în salon', 0, 'treci o vânzare'],
      ['stoc', '📦', 'Stoc', s.lowStock.length, s.lowStock.length ? s.lowStock.length + ' cu stoc mic' : 'intrări și ieșiri'],
      ['fise', '📋', 'Fișe cliente', s.newConsults, s.newConsults ? s.newConsults + ' noi' : 'consultații'],
      ['asistent', '💬', 'Asistent virtual', chat.calls, chat.calls ? chat.calls + ' de sunat' : chat.today + ' conversații azi'],
      ['produse', '🛍️', 'Produse', 0, 'prețuri și poze'],
      ['texte', '✏️', 'Texte site', 0, 'modifici textele'],
      ['smartbill', '🔗', 'SmartBill', 0, s.smartbill.configured ? 'conectat' : 'neconectat'],
      ['plati', '💶', 'Plăți card & e-mail', 0, s.pay && s.pay.ready ? 'card pornit' : 'card oprit'],
      ['setari', '⚙️', 'Magazin & cont', 0, 'livrare, parolă']
    ].map(([tab, ico, name, n, sub]) => `<button type="button" class="tile2${n ? ' has' : ''}" data-go4="${tab}"><i>${ico}</i><b>${name}</b><small>${esc(sub)}</small>${n ? `<em>${n}</em>` : ''}</button>`).join('');
    $$('[data-go4]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go4)));
    $('#sumCards').innerHTML = [
      ['Total azi (online + salon)', lei(s.online.today + s.salon.today)], ['Total 30 de zile', lei(s.online.month + s.salon.month)], ['Fișe noi', s.newConsults], ['Comenzi online noi', s.newOrders],
      ['SmartBill', s.smartbill.configured ? (s.smartbill.lastSyncError ? 'Eroare' : 'Configurat') : 'Neconfigurat']
    ].map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    renderSplit(s);
    const al = [];
    $('#navFise').hidden = !s.newConsults; $('#navFise').textContent = s.newConsults;
    if (s.parcels) al.push(`🚚 Ai <b>${s.parcels}</b> colete de pregătit. <a href="#colete" data-go="colete">Vezi coletele →</a>`);
    if (s.newConsults) al.push(`📋 Ai <b>${s.newConsults}</b> fișe de consultație noi. <a href="#fise" data-go="fise">Vezi fișele →</a>`);
    if (s.newOrders) al.push(`🧾 Ai <b>${s.newOrders}</b> comenzi noi. <a href="#comenzi" data-go="comenzi">Vezi comenzile →</a>`);
    if (s.withdrawals) al.push(`↩️ <b>${s.withdrawals}</b> ${s.withdrawals === 1 ? 'cerere de retragere nouă' : 'cereri de retragere noi'} (retur). <a href="#comenzi" data-go="comenzi">Vezi →</a>`);
    if (chat.calls) al.push(`📞 <b>${chat.calls}</b> ${chat.calls === 1 ? 'persoană a cerut' : 'persoane au cerut'} să fie ${chat.calls === 1 ? 'sunată' : 'sunate'}, prin asistentul virtual. <a href="#asistent" data-go="asistent">Vezi →</a>`);
    if (chat.unanswered) al.push(`❓ Asistentul virtual nu a știut să răspundă la <b>${chat.unanswered}</b> ${chat.unanswered === 1 ? 'întrebare' : 'întrebări'} în ultimele 7 zile. <a href="#asistent" data-go="asistent">Vezi ce s-a întrebat →</a>`);
    if (s.unpaidCard) al.push(`💳 <b>${s.unpaidCard}</b> ${s.unpaidCard === 1 ? 'comandă cu cardul așteaptă' : 'comenzi cu cardul așteaptă'} plata (nu se pregătesc până nu sunt plătite). <a href="#comenzi" data-go="comenzi">Vezi →</a>`);
    if (!s.smartbill.configured) al.push('🔗 SmartBill nu este conectat încă. <a href="#smartbill" data-go="smartbill">Conectează acum →</a>');
    if (s.pay && !s.pay.ready) al.push('💶 Plata cu cardul (EuPlătesc) nu este pornită încă. <a href="#plati" data-go="plati">Configurează →</a>');
    if (s.mail && !s.mail.ready) al.push('✉️ E-mailurile automate nu sunt pornite încă. <a href="#plati" data-go="plati">Configurează →</a>');
    if (s.mail && s.mail.lastError) al.push('⚠️ Ultimul e-mail nu a putut fi trimis: ' + esc(s.mail.lastError) + ' <a href="#plati" data-go="plati">Verifică →</a>');
    if (s.smartbill.lastSyncError) al.push('⚠️ Ultima sincronizare de stoc a eșuat: ' + esc(s.smartbill.lastSyncError));
    else if (s.smartbill.lastSync) al.push('✅ Stoc sincronizat cu SmartBill: ' + when(s.smartbill.lastSync));
    for (const p of s.lowStock) al.push(`📦 Stoc mic: <b>${esc(p.name)}</b> ${esc(p.size)} – ${p.stock} buc.`);
    $('#sumAlerts').innerHTML = al.length ? al.map((x) => `<div class="alert">${x}</div>`).join('') : '<div class="alert">Totul e în regulă. ✨</div>';
    $$('[data-go]', $('#sumAlerts')).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go); }));
  };

  /* ---------- categories (editable) ---------- */
  let cats = [];
  const catName = (id) => (cats.find((c) => c.id === id) || {}).name || id;
  async function loadCats() { cats = await api('admin/categories'); return cats; }

  /* ---------- online vs salon, side by side ---------- */
  function renderSplit(s) {
    const box = (title, icon, d, cls, extra) => `<div class="sbox sbox--${cls}">
      <div class="sbox__h"><span class="sbox__i">${icon}</span><h3>${title}</h3></div>
      <div class="sbox__big">${lei(d.today)}<small>azi · ${d.todayCount} ${cls === 'online' ? 'comenzi' : 'vânzări'}</small></div>
      <div class="sbox__row"><div><b>${lei(d.week)}</b><span>7 zile</span></div><div><b>${lei(d.month)}</b><span>30 de zile</span></div><div><b>${d.monthPieces}</b><span>bucăți / 30 z</span></div></div>
      ${extra}</div>`;
    const max = Math.max(1, ...s.online.days.map((d, i) => d.total + s.salon.days[i].total));
    const chart = `<div class="sbox sbox--chart"><div class="sbox__h"><span class="sbox__i">📊</span><h3>Ultimele 7 zile</h3>
        <span class="legend"><i class="lg-on"></i>Online <i class="lg-sa"></i>Salon</span></div>
      <div class="chart">${s.online.days.map((d, i) => { const sa = s.salon.days[i].total, on = d.total;
        const dn = new Date(d.day).toLocaleDateString('ro-RO', { weekday: 'short' });
        return `<div class="chart__c" title="${dn}: online ${lei(on)}, salon ${lei(sa)}"><div class="chart__s"><i class="on" style="height:${on / max * 100}%"></i><i class="sa" style="height:${sa / max * 100}%"></i></div><span>${dn}</span></div>`; }).join('')}</div></div>`;
    $('#sumSplit').innerHTML = box('Vânzări online', '🛒', s.online, 'online', '<a href="#comenzi" data-go3="comenzi" class="sbox__lnk">Vezi comenzile →</a>')
      + box('Vânzări în salon', '💳', s.salon, 'salon', '<a href="#vanzare" data-go3="vanzare" class="sbox__lnk">Vânzare nouă →</a>') + chart;
    document.querySelectorAll('[data-go3]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go3); }));
  }

  /* ---------- sales in the salon: all products as tiles, by category ---------- */
  const PAY = { cash: 'Numerar', card: 'Card', transfer: 'Transfer' };
  let saleProducts = [], picked = {}, sales = [], saleCat = 'all';
  const prodLabel = (p) => `${p.name}${p.size ? ' · ' + p.size : ''}`;
  loaders.vanzare = async () => {
    saleProducts = await api('admin/products'); await loadCats();
    const st = await api('admin/settings').catch(() => null);
    $('#saleInvWrap').hidden = !(st && st.smartbillTokenSet && st.smartbill.cif);
    settings = settings || st;
    try { if (!$('#saleInvWrap').hidden && localStorage.getItem('fr-sale-inv') === '1') $('#saleInv').checked = true; } catch (e) {}
    const used = ['all', ...cats.map((c) => c.id).filter((k) => saleProducts.some((p) => p.category === k))];
    $('#saleCats').innerHTML = used.map((k) => `<button type="button" class="chip${k === saleCat ? ' is-on' : ''}" data-cat="${k}">${esc(k === 'all' ? 'Toate' : catName(k))}</button>`).join('');
    $$('#saleCats .chip').forEach((c) => c.addEventListener('click', () => { saleCat = c.dataset.cat; $$('#saleCats .chip').forEach((x) => x.classList.toggle('is-on', x === c)); renderGrid(); }));
    renderGrid();
    sales = await api('admin/sales'); renderSales();
  };
  $('#saleSearch').addEventListener('input', renderGrid);
  function renderGrid() {
    const q = $('#saleSearch').value.trim().toLowerCase();
    const list = saleProducts.filter((p) => (saleCat === 'all' || p.category === saleCat) && (!q || prodLabel(p).toLowerCase().includes(q)));
    // group by category so it reads like a menu
    const groups = {};
    cats.forEach((c) => { const it = list.filter((p) => p.category === c.id); if (it.length) groups[c.id] = it; });
    list.filter((p) => !cats.some((c) => c.id === p.category)).forEach((p) => { (groups[p.category] = groups[p.category] || []).push(p); });
    $('#saleGrid').innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([cat, items]) => `<h3 class="sgrid__h">${esc(catName(cat))}</h3><div class="sgrid__g">${items.map((p) => {
      const sel = picked[p.id], out = p.stock != null && p.stock <= 0;
      return `<div class="tile${sel ? ' is-on' : ''}${out ? ' is-out' : ''}" data-pick="${p.id}" role="button" tabindex="0" aria-pressed="${!!sel}">
        <span class="tile__ck">✓</span>
        <img src="${esc(img(p.image))}" alt="" loading="lazy">
        <div class="tile__n">${esc(p.name)}</div>
        <div class="tile__m"><b>${lei(p.price)}</b><span>${p.stock == null ? '' : out ? 'epuizat' : 'stoc ' + p.stock}</span></div>
        ${sel ? `<div class="tile__q"><button type="button" data-q="-1" data-id="${p.id}" aria-label="Scade">−</button><b>${sel.qty}</b><button type="button" data-q="1" data-id="${p.id}" aria-label="Adaugă">+</button></div>` : ''}
      </div>`; }).join('')}</div>`).join('') : '<div class="empty">Niciun produs găsit.</div>';
    $$('#saleGrid [data-pick]').forEach((t) => {
      const toggle = (e) => {
        if (e.target.closest('[data-q]')) return;
        const p = saleProducts.find((x) => x.id === t.dataset.pick);
        if (p.stock != null && p.stock <= 0) { toast('Produsul este epuizat. Adaugă stoc din secțiunea Stoc.'); return; }
        if (picked[p.id]) delete picked[p.id]; else picked[p.id] = { qty: 1, price: p.price };
        renderGrid();
      };
      t.addEventListener('click', toggle);
      t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
    });
    $$('#saleGrid [data-q]').forEach((bt) => bt.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = saleProducts.find((x) => x.id === bt.dataset.id), it = picked[bt.dataset.id];
      it.qty = Math.max(0, it.qty + +bt.dataset.q);
      if (p.stock != null && it.qty > p.stock) { it.qty = p.stock; toast(`În stoc sunt doar ${p.stock} bucăți.`); }
      if (!it.qty) delete picked[bt.dataset.id];
      renderGrid();
    }));
    summary();
  }
  function summary() {
    const ids = Object.keys(picked), n = ids.reduce((a, id) => a + picked[id].qty, 0);
    const t = ids.reduce((a, id) => a + picked[id].qty * picked[id].price, 0);
    $('#saleCount').textContent = n ? `${n} ${n === 1 ? 'bucată' : 'bucăți'} · ${ids.length} ${ids.length === 1 ? 'produs' : 'produse'}` : 'Niciun produs bifat';
    $('#saleTotal').textContent = lei(t);
    $('#saleBar').classList.toggle('has', n > 0);
  }
  $('#saleClear').addEventListener('click', () => { picked = {}; renderGrid(); });
  $('#saleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = Object.keys(picked).map((id) => ({ id, qty: picked[id].qty, price: picked[id].price }));
    if (!items.length) { note($('#saleMsg'), 'Bifează mai întâi produsele vândute.', false); return; }
    try {
      const phone = $('#salePhone').value;
      const s = await busy($('#saleGo'), () => api('admin/sales', { method: 'POST', body: { items, payment: $('#salePay').value, client: $('#saleClient').value, phone, invoice: $('#saleInv').checked } }));
      $('#saleWa').hidden = !s.invoice;
      $('#saleWa').innerHTML = s.invoice ? waInvoice(s.invoice, phone, s.client, 'cumpărăturile de azi') + ` <a class="btn btn--sm" href="${invUrl(s.invoice)}" target="_blank" rel="noopener">📄 Vezi factura</a>` : '';
      note($('#saleMsg'), `✓ Vânzarea #${s.number} a fost salvată: ${lei(s.total)}. Stocul a fost scăzut.` + (s.invoice ? ` Factura ${s.invoice.series} ${s.invoice.number} emisă în SmartBill.` : s.invoiceError ? ` Factura SmartBill NU s-a emis: ${s.invoiceError}` : ''), !s.invoiceError);
      toast('Vânzare salvată ✓');
      picked = {}; $('#saleClient').value = ''; $('#salePhone').value = '';
      await loaders.vanzare();
    } catch (x) { note($('#saleMsg'), x.message, false); }
  });
  $('#saleRange').addEventListener('change', renderSales);
  $('#saleInv').addEventListener('change', (e) => { try { localStorage.setItem('fr-sale-inv', e.target.checked ? '1' : '0'); } catch (x) {} });
  function renderSales() {
    const canInvoice = !$('#saleInvWrap').hidden;
    const r = $('#saleRange').value, now = Date.now(), today = new Date().toISOString().slice(0, 10);
    const list = sales.filter((x) => r === 'all' ? true : r === 'today' ? x.createdAt.slice(0, 10) === today : now - Date.parse(x.createdAt) < +r * 864e5);
    const ok = list.filter((x) => !x.cancelled);
    const sum = (f) => ok.filter(f).reduce((a, x) => a + x.total, 0);
    const pieces = ok.reduce((a, x) => a + x.items.reduce((b, i) => b + i.qty, 0), 0);
    $('#saleStats').innerHTML = [['Total vândut', lei(sum(() => true))], ['Bucăți', pieces], ['Numerar', lei(sum((x) => x.payment === 'cash'))], ['Card / transfer', lei(sum((x) => x.payment !== 'cash'))]]
      .map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    $('#saleList').innerHTML = list.length ? list.map((x) => `<div class="ord${x.cancelled ? ' off' : ''}"><div class="ord__head"><h3>#${x.number} · ${lei(x.total)}</h3><span class="status">${x.cancelled ? 'Anulată' : PAY[x.payment]}</span></div>
      <div class="ord__meta">${when(x.createdAt)}${x.client ? ' · ' + esc(x.client) : ''}</div>
      <div class="muted">${x.items.map((i) => `${i.qty} × ${esc(i.name)} ${esc(i.size || '')}`).join('<br>')}</div>
      ${x.invoice ? `<div class="row">Factura <b>${esc(x.invoice.series)} ${esc(x.invoice.number)}</b> <a class="btn btn--sm" href="${invUrl(x.invoice)}" target="_blank" rel="noopener">📄 PDF</a>${x.cancelled ? '' : waInvoice(x.invoice, x.phone, x.client, 'cumpărăturile din salon')}</div>` : x.invoiceError ? `<div class="err">Factura nu s-a emis: ${esc(x.invoiceError)}</div>` : ''}
      ${x.cancelled ? '' : `<div class="row row--end">${!x.invoice && canInvoice ? `<button class="btn btn--sm btn--gold" data-sinv="${x.id}" type="button">Emite factură în SmartBill</button>` : ''}<span class="sp"></span><button class="btn btn--sm btn--danger" data-cancel="${x.id}" type="button">Anulează (pune stocul înapoi)</button></div>`}</div>`).join('')
      : '<div class="empty">Nicio vânzare în perioada aleasă.</div>';
    $$('[data-sinv]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { await api('admin/sales/' + b.dataset.sinv + '/invoice', { method: 'POST', body: {} }); toast('Factura a fost emisă în SmartBill.'); loaders.vanzare(); } catch (x) { toast(x.message); loaders.vanzare(); }
    })));
    $$('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Anulezi vânzarea? Produsele se pun înapoi în stoc.')) return;
      try { await api('admin/sales/' + b.dataset.cancel + '/cancel', { method: 'POST' }); toast('Vânzarea a fost anulată.'); loaders.vanzare(); } catch (x) { toast(x.message); }
    }));
  }

  /* ---------- parcels to prepare + courier (Sameday) ---------- */
  const PROV = { sameday: 'Sameday', fan: 'FAN Courier', cargus: 'Cargus', manual: 'fără legătură' };
  let parcels = { open: [], shippedToday: [] };
  const dayName = (d) => {
    const t = new Date().toISOString().slice(0, 10), tm = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const nice = new Date(d).toLocaleDateString('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });
    return d < t ? '⚠️ Întârziate (trebuiau să plece ' + nice + ')' : d === t ? 'Pleacă AZI' : d === tm ? 'Pleacă MÂINE' : 'Pleacă ' + nice;
  };
  loaders.colete = async () => {
    parcels = await api('admin/parcels');
    const st = await api('admin/settings'); fillCourier(st);
    $('#navColete').hidden = !parcels.open.length; $('#navColete').textContent = parcels.open.length;
    $('#courierInfo').innerHTML = parcels.provider === 'manual'
      ? '🚚 Legătura automată cu curierul e oprită: scrii AWB-ul de mână la fiecare colet.'
      : parcels.configured ? `🚚 Conectat la <b>${PROV[parcels.provider]}</b>: cu un clic generezi AWB-ul și printezi eticheta. Comenzile de după ora <b>${esc(st.courier.cutoff)}</b> pleacă a doua zi lucrătoare.`
      : `🚚 Ca să generezi AWB-uri direct din panou, completează jos <b>Setări curier</b> cu datele de API primite de la <b>${PROV[parcels.provider]}</b>.`;
    const ready = parcels.open.filter((o) => o.awb).length;
    const cod = parcels.open.reduce((a, o) => a + (o.payment === 'ramburs' ? o.total : 0), 0);
    $('#parcelCards').innerHTML = [['Colete de pregătit', parcels.open.length], ['Cu AWB generat', ready + ' / ' + parcels.open.length], ['Ramburs de încasat', lei(cod)], ['Expediate azi', parcels.shippedToday.length]]
      .map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    // pick list: how many of each product to take from stock
    const pick = {};
    parcels.open.forEach((o) => o.items.forEach((i) => { const k = i.id; pick[k] = pick[k] || { name: i.name + (i.size ? ' · ' + i.size : ''), qty: 0 }; pick[k].qty += i.qty; }));
    const pl = Object.values(pick).sort((a, b) => b.qty - a.qty);
    $('#pickPanel').hidden = !pl.length;
    $('#pickList').innerHTML = pl.map((x) => `<div class="pick"><b>${x.qty}×</b><span>${esc(x.name)}</span></div>`).join('');
    // groups by day
    const groups = {};
    parcels.open.forEach((o) => { (groups[o.shipDay] = groups[o.shipDay] || []).push(o); });
    const days = Object.keys(groups).sort();
    $('#parcelGroups').innerHTML = days.length ? days.map((d) => `<h3 class="sgrid__h">${dayName(d)} · ${groups[d].length} ${groups[d].length === 1 ? 'colet' : 'colete'}</h3>
      <div class="parcels">${groups[d].map(parcelCard).join('')}</div>`).join('')
      : '<div class="empty">🎉 Nu ai colete de pregătit. Comenzile noi de pe site apar aici automat.</div>';
    bindParcels();
  };
  function parcelCard(o) {
    const c = o.customer;
    return `<article class="parcel${o.awb ? ' has-awb' : ''}">
      <div class="parcel__h"><b>#${o.number}</b><span class="status status--${o.status}">${o.awb ? 'AWB ' + esc(o.awb) : 'fără AWB'}</span></div>
      <div class="parcel__who"><b>${esc(c.name)}</b> · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a><br>${esc(c.address)}, ${esc(c.city)}, jud. ${esc(c.county)}</div>
      <ul class="parcel__items">${o.items.map((i) => `<li><b>${i.qty}×</b> ${esc(i.name)} ${esc(i.size || '')}</li>`).join('')}</ul>
      <div class="parcel__cod">${o.payment === 'ramburs' ? `Ramburs: <b>${lei(o.total)}</b>` : 'Plătită'}</div>
      ${c.notes ? `<div class="muted">„${esc(c.notes)}”</div>` : ''}
      <div class="parcel__a">
        ${o.awb ? `<a class="btn btn--sm" href="/api/admin/orders/${o.id}/label.pdf" target="_blank" rel="noopener">🖨️ Etichetă</a><button class="btn btn--sm" type="button" data-track="${o.id}">📍 Unde e?</button>`
          : parcels.provider === 'manual' ? `<input data-awbman="${o.id}" placeholder="Scrie AWB-ul">` : `<button class="btn btn--sm btn--gold" type="button" data-awb="${o.id}">🏷️ Generează AWB</button>`}
        <button class="btn btn--sm" type="button" data-ship="${o.id}">✓ Predat curierului</button>
      </div></article>`;
  }
  function bindParcels() {
    $$('[data-awb]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { const o = await api('admin/orders/' + b.dataset.awb + '/awb', { method: 'POST' }); toast('AWB generat: ' + o.awb); loaders.colete(); } catch (x) { toast(x.message); }
    })));
    $$('[data-awbman]').forEach((i) => i.addEventListener('change', async () => {
      try { await api('admin/orders/' + i.dataset.awbman, { method: 'PUT', body: { awb: i.value } }); toast('AWB salvat.'); loaders.colete(); } catch (x) { toast(x.message); }
    }));
    $$('[data-track]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { const r = await api('admin/orders/' + b.dataset.track + '/track'); toast('📍 ' + r.status); } catch (x) { toast(x.message); }
    })));
    $$('[data-ship]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { await api('admin/orders/' + b.dataset.ship + '/shipped', { method: 'POST' }); toast('Coletul a fost marcat ca expediat.'); loaders.colete(); } catch (x) { toast(x.message); }
    })));
  }
  $('#awbAll').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const todo = parcels.open.filter((o) => !o.awb);
    if (!todo.length) return toast('Toate coletele au deja AWB.');
    let okN = 0, err = '';
    for (const o of todo) { try { await api('admin/orders/' + o.id + '/awb', { method: 'POST' }); okN++; } catch (x) { err = x.message; break; } }
    toast(err ? `Generate ${okN}. Oprit la o eroare: ${err}` : `Am generat ${okN} AWB-uri.`);
    loaders.colete();
  }));
  $('#pickPrint').addEventListener('click', () => {
    const w = window.open('', '_blank');
    if (!w) return toast('Permite ferestrele pop-up ca să printezi.');
    const rows = parcels.open.map((o) => `<tr><td>#${o.number}</td><td>${esc(o.customer.name)}<br>${esc(o.customer.city)}</td><td>${o.items.map((i) => i.qty + '× ' + esc(i.name) + ' ' + esc(i.size || '')).join('<br>')}</td><td>${o.payment === 'ramburs' ? lei(o.total) : '—'}</td><td>${esc(o.awb || '')}</td></tr>`).join('');
    w.document.write(`<html><head><meta charset="utf-8"><title>Colete de pregătit</title><style>body{font:14px Arial;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}h1{font-size:20px}</style></head><body><h1>Colete de pregătit · ${new Date().toLocaleDateString('ro-RO')}</h1>
      <h2>De scos din stoc</h2><ul>${$('#pickList').innerText.split('\n').filter(Boolean).map((l) => '<li>' + esc(l) + '</li>').join('')}</ul>
      <table><tr><th>Comandă</th><th>Client</th><th>Produse</th><th>Ramburs</th><th>AWB</th></tr>${rows}</table><script>print()<\/script></body></html>`);
    w.document.close();
  });
  function fillCourier(st) {
    const f = $('#courierForm'), c = st.courier;
    f.provider.value = c.provider; f.demo.checked = !!c.demo; f.clientId.value = c.clientId || ''; f.cutoff.value = c.cutoff || '14:00'; f.kgPerItem.value = c.kgPerItem || 0.6;
    if (c.pickupPoint && !$(`option[value="${c.pickupPoint}"]`, f.pickupPoint)) f.pickupPoint.insertAdjacentHTML('beforeend', `<option value="${esc(c.pickupPoint)}">Punct ${esc(c.pickupPoint)}</option>`);
    if (c.service && !$(`option[value="${c.service}"]`, f.service)) f.service.insertAdjacentHTML('beforeend', `<option value="${esc(c.service)}">Serviciu ${esc(c.service)}</option>`);
    f.pickupPoint.value = c.pickupPoint || ''; f.service.value = c.service || '';
    $('#courierCred').textContent = st.courierUserSet ? '🔒 Datele de API sunt salvate (parola nu se afișează).' : 'Datele de API nu sunt salvate încă. Le ceri de la Sameday (managerul de cont / „API Sameday”).';
    $('#courierSet').querySelector('summary b').textContent = `⚙️ Setări curier (${PROV[c.provider]})`;
    showOnly();
  }
  function showOnly() { const v = $('#courierForm').provider.value; $$('#courierForm [data-only]').forEach((el) => { el.hidden = el.dataset.only !== v; }); }
  $('#courierForm').provider.addEventListener('change', showOnly);
  function courierBody() {
    const f = $('#courierForm');
    return { courier: { provider: f.provider.value, demo: f.demo.checked, pickupPoint: f.pickupPoint.value, service: f.service.value, clientId: f.clientId.value, cutoff: f.cutoff.value, kgPerItem: f.kgPerItem.value },
      courierSecrets: { user: f.user.value, pass: f.pass.value, key: f.key.value } };
  }
  $('#courierForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await busy($('button[type=submit]', e.target), () => api('admin/settings', { method: 'PUT', body: courierBody() })); e.target.pass.value = ''; e.target.key.value = ''; note($('#courierMsg'), 'Setările curierului au fost salvate.', true); loaders.colete(); }
    catch (x) { note($('#courierMsg'), x.message, false); }
  });
  $('#courierTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await api('admin/settings', { method: 'PUT', body: courierBody() }); const r = await api('admin/courier/test', { method: 'POST' }); note($('#courierMsg'), '✅ ' + r.message, true); }
    catch (x) { note($('#courierMsg'), x.message, false); }
  }));
  $('#courierLoad').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      await api('admin/settings', { method: 'PUT', body: courierBody() });
      const o = await api('admin/courier/options'), f = $('#courierForm');
      const cur = { p: f.pickupPoint.value, s: f.service.value };
      f.pickupPoint.innerHTML = o.pickupPoints.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('') || '<option value="">— niciun punct —</option>';
      f.service.innerHTML = o.services.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('') || '<option value="">— niciun serviciu —</option>';
      f.pickupPoint.value = cur.p || (o.pickupPoints.find((x) => x.default) || o.pickupPoints[0] || {}).id || '';
      f.service.value = cur.s || (o.services.find((x) => x.default) || o.services[0] || {}).id || '';
      note($('#courierMsg'), `Am încărcat ${o.pickupPoints.length} puncte de ridicare și ${o.services.length} servicii. Alege-le și apasă „Salvează”.`, true);
    } catch (x) { note($('#courierMsg'), x.message, false); }
  }));

  /* ---------- AI hair simulator ---------- */
  let simCfg = null;
  loaders.simulator = async () => {
    simCfg = await api('admin/simulator');
    const f = $('#simForm');
    f.enabled.checked = !!simCfg.enabled; f.model.value = simCfg.model || ''; f.accessCode.value = simCfg.accessCode || ''; f.dailyLimit.value = simCfg.dailyLimit || 60; f.geminiKey.value = '';
    $('#simKeyState').textContent = simCfg.keySet ? '🔒 Cheia Gemini este salvată (nu se afișează).' : 'Cheia Gemini nu este pusă încă.';
    $('#simCards').innerHTML = [['Stare', simCfg.enabled && simCfg.keySet ? 'Pornit' : 'Oprit'], ['Simulări azi', simCfg.today], ['Simulări în total', simCfg.total], ['Cod de acces', simCfg.accessCode]]
      .map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    const cols = [0, 1, 2].map((i) => simCfg.colors[i] || { name: '', description: '' });
    $('#simColors').innerHTML = cols.map((c, i) => `<div class="simcolor"><b>Varianta ${i + 1}</b>
      <label>Nume (îl vede clienta)<input data-cn="${i}" value="${esc(c.name)}" placeholder="ex. Balayage bej perlat"></label>
      <label>Descriere pentru AI (nuanța exactă)<textarea data-cd="${i}" rows="2" placeholder="ex. Soft pearl beige balayage with darker natural root">${esc(c.description)}</textarea></label></div>`).join('');
  };
  const simLink = () => new URL('../simulator.html?cod=' + encodeURIComponent($('#simForm').accessCode.value.trim().toUpperCase()), location.href).href;
  $('#simCopy').addEventListener('click', async () => {
    const l = simLink();
    try { await navigator.clipboard.writeText(l); toast('Linkul a fost copiat: îl poți trimite clientei pe WhatsApp.'); } catch (e) { prompt('Copiază linkul:', l); }
  });
  function simBody() {
    const f = $('#simForm');
    return { enabled: f.enabled.checked, model: f.model.value, accessCode: f.accessCode.value, dailyLimit: f.dailyLimit.value, geminiKey: f.geminiKey.value,
      colors: [0, 1, 2].map((i) => ({ name: $(`[data-cn="${i}"]`).value, description: $(`[data-cd="${i}"]`).value })) };
  }
  $('#simForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await busy($('button[type=submit]', e.target), () => api('admin/simulator', { method: 'PUT', body: simBody() })); note($('#simMsg'), 'Simulatorul a fost salvat.', true); loaders.simulator(); }
    catch (x) { note($('#simMsg'), x.message, false); }
  });
  $('#simTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try { await api('admin/simulator', { method: 'PUT', body: simBody() }); const r = await api('admin/simulator/test', { method: 'POST' }); note($('#simMsg'), '✅ Cheia funcționează. Model: ' + r.model, true); loaders.simulator(); }
    catch (x) { note($('#simMsg'), x.message, false); }
  }));

  /* ---------- stock overview ---------- */
  let stockProducts = [];
  loaders.stoc = async () => {
    stockProducts = await api('admin/products');
    renderStock();
    const moves = await api('admin/stock-moves');
    $('#stockMoves').innerHTML = moves.length ? moves.slice(0, 40).map((m) => `<div class="move"><span>${when(m.at)}</span><b class="${m.delta > 0 ? 'up' : 'down'}">${m.delta > 0 ? '+' : ''}${m.delta}</b><span>${esc(m.name)} · ${esc(m.reason)} (${m.before} → ${m.after})</span></div>`).join('') : '<p class="muted">Nicio mișcare manuală încă.</p>';
  };
  $('#stockSearch').addEventListener('input', renderStock);
  function renderStock() {
    const q = $('#stockSearch').value.trim().toLowerCase();
    const counted = stockProducts.filter((p) => p.stock != null);
    const units = counted.reduce((a, p) => a + p.stock, 0), value = counted.reduce((a, p) => a + p.stock * p.price, 0);
    const low = counted.filter((p) => p.stock <= 3).length;
    $('#stockCards').innerHTML = [['Bucăți în stoc', units], ['Valoare stoc (preț vânzare)', lei(value)], ['Produse', stockProducts.length], ['Stoc mic (≤ 3)', low]]
      .map(([l, v], i) => `<div class="card${i === 3 && low ? ' card--warn' : ''}"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    const max = Math.max(1, ...counted.map((p) => p.stock));
    const list = stockProducts.filter((p) => !q || prodLabel(p).toLowerCase().includes(q));
    $('#stockList').innerHTML = list.map((p) => {
      const st = p.stock, pct = st == null ? 100 : Math.max(2, Math.round(st / max * 100));
      const cls = st == null ? 'inf' : st === 0 ? 'zero' : st <= 3 ? 'low' : 'ok';
      return `<div class="srow"><img src="${esc(img(p.image))}" alt="" loading="lazy">
        <div class="srow__b"><div class="srow__n">${esc(p.name)} <small>${esc(p.size)}</small> ${p.salonOnly ? '<em class="tag tag--salon">doar salon</em>' : p.active === false ? '<em class="tag">ascuns</em>' : '<em class="tag tag--on">online + salon</em>'}</div>
          <div class="bar-s"><i class="${cls}" style="width:${pct}%"></i></div>
          <div class="srow__m">${st == null ? 'Stoc necompletat' : st === 0 ? '<b class="zero">Epuizat</b>' : `<b class="${cls}">${st} buc.</b> · valoare ${lei(st * p.price)}`}</div></div>
        <div class="srow__a"><input type="number" inputmode="numeric" placeholder="buc." aria-label="Bucăți" data-sq="${p.id}">
          <button class="btn btn--sm btn--gold" data-sin="${p.id}" type="button">+ Intrare</button>
          <button class="btn btn--sm" data-sout="${p.id}" type="button">− Ieșire</button></div></div>`;
    }).join('');
    const move = async (id, sign) => {
      const inp = $(`[data-sq="${id}"]`), n = Math.round(+inp.value || 0);
      if (!n) { inp.focus(); toast('Scrie câte bucăți.'); return; }
      try { await api('admin/products/' + id + '/stock', { method: 'POST', body: { delta: sign * n, reason: sign > 0 ? 'Intrare marfă' : 'Ieșire manuală' } }); toast('Stocul a fost actualizat.'); loaders.stoc(); }
      catch (x) { toast(x.message); }
    };
    $$('[data-sin]').forEach((b) => b.addEventListener('click', () => move(b.dataset.sin, 1)));
    $$('[data-sout]').forEach((b) => b.addEventListener('click', () => move(b.dataset.sout, -1)));
  }
  $('#stockSync').addEventListener('click', (e) => !confirm('Preiei stocul din SmartBill? Cifrele din aplicație vor fi înlocuite cu cele din SmartBill (vânzările din salon care nu sunt trecute în SmartBill se pierd din calcul).') ? null : busy(e.currentTarget, async () => {
    try { const r = await api('admin/smartbill/sync', { method: 'POST' }); toast(`Stoc actualizat din SmartBill: ${r.matched} din ${r.total} produse.`); loaders.stoc(); } catch (x) { toast(x.message); }
  }));

  /* ---------- install as an app (PWA) ---------- */
  // Android/Chrome can install with one tap. iPhone has no such button for websites (Apple's rule):
  // the app is added from the browser's Share menu, so there we show the steps clearly.
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferredPrompt = null;
  const UA = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|WhatsApp|GSA\//i.test(UA);
  const iosOther = /CriOS|FxiOS|EdgiOS/i.test(UA); // Chrome / Firefox / Edge on iPhone
  const SHARE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style="vertical-align:-4px"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  function installHelp() {
    const step = (n, html) => `<div class="istep"><b>${n}</b><span>${html}</span></div>`;
    $('#installSteps').innerHTML = ios
      ? (inApp ? '<p class="alert">Ai deschis panoul din altă aplicație (Facebook, Instagram, WhatsApp…). De aici nu se poate instala.</p>' +
          step(1, 'Apasă <b>⋯</b> (sau <b>Partajare</b>) și alege <b>„Deschide în Safari”</b>.') + step(2, 'În Safari, apasă din nou <b>📲 Instalează aplicația</b> și urmează pașii.')
        : '<p class="muted">Pe iPhone, aplicația nu se descarcă dintr-un buton: se adaugă din meniul <b>Partajare</b> al browserului. Durează 10 secunde.</p>' +
          step(1, `Apasă butonul <b>Partajare</b> ${SHARE} ${iosOther ? '(sus, lângă adresă)' : '(în bara de jos a Safari)'}. Dacă nu îl vezi, apasă întâi pe <b>⋯</b>.`) +
          step(2, 'Derulează în jos și alege <b>„Adaugă pe ecranul principal”</b> (în engleză: <i>Add to Home Screen</i>).') +
          step(3, 'Apasă <b>„Adaugă”</b>, în dreapta sus. Iconița <b>Florin Admin</b> apare pe ecranul telefonului.'))
      : step(1, 'Deschide meniul browserului (<b>⋮</b>, în dreapta sus).') + step(2, 'Alege <b>„Instalează aplicația”</b> sau <b>„Adaugă pe ecranul de pornire”</b>.') + step(3, 'Confirmă cu <b>„Instalează”</b>. Iconița <b>Florin Admin</b> apare pe ecran.');
    $('#installDlg').showModal();
  }
  async function install() {
    if (!deferredPrompt) return installHelp();
    deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => {}); deferredPrompt = null;
    $('#installBtn').hidden = true; $('#installHero').hidden = true; $('#installTip').hidden = true;
  }
  $('#installBtn').addEventListener('click', install);
  $('#installHero').addEventListener('click', install);
  $('#installClose').addEventListener('click', () => $('#installDlg').close());
  $('#installCopy').addEventListener('click', async () => {
    const url = location.origin + '/admin/';
    try { await navigator.clipboard.writeText(url); toast('Adresa a fost copiată: ' + url); } catch (e) { prompt('Copiază adresa panoului:', url); }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; showInstall(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; $('#installBtn').hidden = true; $('#installHero').hidden = true; $('#installTip').hidden = true; });
  function showInstall() {
    if (standalone) return;
    const phone = ios || /android/i.test(UA);
    if (!deferredPrompt && !phone) return;
    $('#installBtn').hidden = false; $('#installHero').hidden = false;
    const t = $('#installTip');
    t.innerHTML = '📲 <b>Pune panoul pe telefon, ca aplicație</b> – se deschide dintr-o atingere, pe tot ecranul. <button class="btn btn--sm btn--gold" type="button" id="installNow">' + (deferredPrompt ? 'Instalează aplicația' : 'Arată-mi cum') + '</button>';
    t.hidden = false;
    $('#installNow').addEventListener('click', install);
  }
  showInstall();

  /* ---------- client files (consultations) ---------- */
  const FS = { noua: 'Nouă', contactata: 'Contactată', programata: 'Programată', finalizata: 'Finalizată' };
  let fise = [];
  loaders.fise = async () => { fise = await api('admin/consults'); renderFise(); };
  $('#fiseFilter').addEventListener('change', renderFise);
  $('#fiseSearch').addEventListener('input', renderFise);
  const ph = (f) => (f ? '/api/admin/consult-photo/' + encodeURIComponent(f) : '');
  function renderFise() {
    const f = $('#fiseFilter').value, q = $('#fiseSearch').value.trim().toLowerCase();
    const list = fise.filter((c) => (!f || c.status === f) && (!q || (c.name + ' ' + c.phone).toLowerCase().includes(q)));
    $('#navFise').hidden = !fise.some((c) => c.status === 'noua'); $('#navFise').textContent = fise.filter((c) => c.status === 'noua').length;
    if (!list.length) { $('#fiseList').innerHTML = '<div class="empty">Nu există fișe aici încă.</div>'; return; }
    const row = (l, v) => `<tr><td>${l}</td><td><b>${esc(v || '—')}</b></td></tr>`;
    $('#fiseList').innerHTML = list.map((c) => `<article class="ord">
      <div class="ord__head"><h3>Fișa #${c.number} · ${esc(c.name)}</h3><span class="status status--${c.status === 'noua' ? 'noua' : c.status === 'finalizata' ? 'livrata' : ''}">${FS[c.status] || c.status}</span></div>
      <div class="ord__meta">${when(c.createdAt)} · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${c.email ? ' · <a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : ''} · serviciu: <b>${esc(c.service)}</b></div>
      <div class="fise__grid">
        <table>${row('Ultima vopsire / decolorare', c.lastColor)}${row('Vopsea din comerț', c.boxDye)}${row('Decolorat acasă', c.homeBleach)}${row('Keratină', c.keratin + (c.keratinSince ? ' · ' + c.keratinSince : ''))}${row('Permanent', c.perm + (c.permSince ? ' · ' + c.permSince : ''))}${row('Alergii', c.allergy + (c.allergyDetails ? ' · ' + c.allergyDetails : ''))}${c.notes ? row('Observații', c.notes) : ''}</table>
        <div class="fise__ph">${[['photoFront', 'Față'], ['photoBack', 'Spate'], ['photoDeposit', 'Dovadă avans']].map(([k, l]) => c.photos && c.photos[k] ? `<a href="${ph(c.photos[k])}" target="_blank" rel="noopener"><img src="${ph(c.photos[k])}" alt="${l}" loading="lazy"><span>${l}</span></a>` : '').join('')}</div>
      </div>
      <div class="ord__grid">
        <label>Status<select data-fst="${c.id}">${Object.entries(FS).map(([k, v]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Programare (zi și oră)<input data-fap="${c.id}" value="${esc(c.appointment || '')}" placeholder="ex. 28.11, ora 12:00"></label>
        <label>Notițe pentru fișă<textarea data-fnote="${c.id}" rows="2" placeholder="formulă culoare, tratament folosit, observații…">${esc(c.adminNote || '')}</textarea></label>
      </div>
      <div class="row row--end"><span class="sp"></span><button class="btn btn--sm btn--danger" data-fdel="${c.id}" type="button">Șterge fișa</button></div>
    </article>`).join('');
    const save = (id, body) => api('admin/consults/' + id, { method: 'PUT', body }).then((c) => { fise = fise.map((x) => (x.id === id ? c : x)); toast('Fișa a fost salvată.'); }).catch((e) => toast(e.message));
    $$('[data-fst]').forEach((el) => el.addEventListener('change', () => save(el.dataset.fst, { status: el.value }).then(renderFise)));
    $$('[data-fap]').forEach((el) => el.addEventListener('change', () => save(el.dataset.fap, { appointment: el.value })));
    $$('[data-fnote]').forEach((el) => el.addEventListener('change', () => save(el.dataset.fnote, { adminNote: el.value })));
    $$('[data-fdel]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Ștergi definitiv fișa și pozele ei?')) return;
      await api('admin/consults/' + el.dataset.fdel, { method: 'DELETE' }).catch((e) => toast(e.message));
      loaders.fise();
    }));
  }

  /* ---------- virtual assistant ("Florin" on the site) ---------- */
  const TOPIC = { programare: 'Programare', orar: 'Program & adresă', servicii: 'Servicii', balayage: 'Balayage', tratamente: 'Tratamente', magazin: 'Magazin', preturi: 'Prețuri',
    florin: 'Despre Florin Roșca', consultatie: 'Consultație gratuită', recenzii: 'Recenzii', contact: 'Contact', salut: 'Salut', multumesc: 'Mulțumiri' };
  const CS = { nou: 'De sunat', sunat: 'Am sunat', rezolvat: 'Rezolvat' };
  loaders.asistent = async () => {
    const d = await api('admin/chats');
    $('#navChat').hidden = !d.stats.calls; $('#navChat').textContent = d.stats.calls;
    $('#chatCallback').checked = !!d.callback;
    $('#chatCards').innerHTML = [['Conversații azi', d.stats.today], ['Ultimele 7 zile', d.stats.week], ['Ultimele 30 de zile', d.stats.month], ['De sunat', d.stats.calls], ['Fără răspuns (7 zile)', d.stats.unanswered]]
      .map(([l, v], i) => `<div class="card${i === 3 && v ? ' card--warn' : ''}"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    $('#chatCalls').innerHTML = d.calls.length ? d.calls.map((c) => `<article class="ord${c.status === 'nou' ? '' : ' off'}">
      <div class="ord__head"><h3>${esc(c.name)} · <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></h3><span class="status status--${c.status === 'nou' ? 'noua' : 'livrata'}">${CS[c.status] || esc(c.status)}</span></div>
      <div class="ord__meta">${when(c.at)}${c.note ? ' · „' + esc(c.note) + '”' : ''}</div>
      <div class="row"><a class="btn btn--sm btn--gold" href="tel:${esc(c.phone)}">📞 Sună</a><select data-cst="${c.id}" aria-label="Stare">${Object.entries(CS).map(([k, v]) => `<option value="${k}"${k === c.status ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
    </article>`).join('') : '<div class="empty">Nimeni nu a cerut încă să fie sunat.</div>';
    $('#chatUnanswered').innerHTML = d.unanswered.length ? d.unanswered.map((u) => `<div class="move"><span>${when(u.at)}</span><b></b><span>„${esc(u.text)}”</span></div>`).join('') : '<p class="muted">Nicio întrebare fără răspuns. ✨</p>';
    const tp = Object.entries(d.topics).filter(([k]) => k !== 'salut' && k !== 'multumesc').sort((a, b) => b[1] - a[1]), max = Math.max(1, ...tp.map((x) => x[1]));
    $('#chatTopics').innerHTML = tp.length ? tp.map(([k, n]) => `<div class="trow"><span>${esc(TOPIC[k] || k)}</span><div class="bar-s"><i class="ok" style="width:${Math.max(3, Math.round(n / max * 100))}%"></i></div><b>${n}</b></div>`).join('') : '<p class="muted">Încă nu sunt date.</p>';
    const hm = (t) => new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    $('#chatList').innerHTML = d.chats.length ? d.chats.map((c) => {
      const miss = c.messages.filter((x) => !x.topic).length;
      return `<details class="ord chat"><summary><b>${when(c.lastAt || c.startedAt)}</b> · ${c.messages.length} ${c.messages.length === 1 ? 'mesaj' : 'mesaje'} · ${c.contact ? '📞 ' + esc(c.contact.name) : 'vizitator anonim'}${miss ? ` · <b class="low">${miss} fără răspuns</b>` : ''}</summary>
        <div class="chat__log">${c.messages.map((x) => `<div class="chat__m"><span>${hm(x.at)}</span><div><b>${esc(x.text)}</b><small>${x.topic === 'apel' ? 'și-a lăsat numărul de telefon' : x.topic ? 'asistentul a răspuns despre: ' + esc(TOPIC[x.topic] || x.topic) : '<b class="low">asistentul nu a știut să răspundă</b>'}</small></div></div>`).join('')}</div>
        <div class="row row--end"><small class="muted">pagina: ${esc(c.page || 'site')}</small><span class="sp"></span><button class="btn btn--sm btn--danger" data-cdel="${c.id}" type="button">Șterge conversația</button></div></details>`;
    }).join('') : '<div class="empty">Încă nu i-a scris nimeni asistentului. Conversațiile apar aici automat.</div>';
    $$('[data-cst]').forEach((el) => el.addEventListener('change', async () => {
      try { await api('admin/chats/' + el.dataset.cst, { method: 'PUT', body: { status: el.value } }); toast('Am notat.'); loaders.asistent(); } catch (x) { toast(x.message); }
    }));
    $$('[data-cdel]').forEach((el) => el.addEventListener('click', async () => {
      if (!confirm('Ștergi definitiv conversația?')) return;
      try { await api('admin/chats/' + el.dataset.cdel, { method: 'DELETE' }); loaders.asistent(); } catch (x) { toast(x.message); }
    }));
  };
  $('#chatCallback').addEventListener('change', async (e) => {
    try { await api('admin/settings', { method: 'PUT', body: { chat: { callback: e.target.checked } } }); toast(e.target.checked ? 'Vizitatorii își pot lăsa numărul.' : 'Opțiunea „Sună-mă înapoi” a fost oprită.'); }
    catch (x) { toast(x.message); e.target.checked = !e.target.checked; }
  });

  /* ---------- orders ---------- */
  const ST = { noua: 'Nouă', confirmata: 'Confirmată', expediata: 'Expediată', livrata: 'Livrată', anulata: 'Anulată' };
  let orders = [];
  loaders.comenzi = async () => { orders = await api('admin/orders'); renderOrders(); loadWithdrawals(); };
  // withdrawal requests sent through the online form
  async function loadWithdrawals() {
    const list = await api('admin/withdrawals').catch(() => []);
    $('#wdPanel').hidden = !list.length;
    $('#wdList').innerHTML = list.map((w) => `<article class="ord${w.status === 'noua' ? '' : ' off'}">
      <div class="ord__head"><h3>R${w.number} · comanda #${esc(w.order)}</h3><span class="status status--${w.status === 'noua' ? 'noua' : 'livrata'}">${w.status === 'noua' ? 'Nouă' : 'Rezolvată'}</span></div>
      <div class="ord__meta">${when(w.at)} · ${esc(w.name || 'fără nume')} · <a href="mailto:${esc(w.email)}">${esc(w.email)}</a>${w.matched ? '' : ' · <b class="low">comanda nu a fost găsită cu acest e-mail (poate fi din magazinul vechi)</b>'}</div>
      <p>Produse: <b>${esc(w.details || 'toată comanda')}</b></p>
      <div class="row"><button class="btn btn--sm" type="button" data-wd="${w.id}" data-to="${w.status === 'noua' ? 'rezolvata' : 'noua'}">${w.status === 'noua' ? '✓ Marchează rezolvată' : 'Redeschide'}</button></div></article>`).join('');
    $$('[data-wd]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('admin/withdrawals/' + b.dataset.wd, { method: 'PUT', body: { status: b.dataset.to } }); loadWithdrawals(); } catch (x) { toast(x.message); }
    }));
  }
  $('#ordFilter').addEventListener('change', renderOrders);
  function renderOrders() {
    const f = $('#ordFilter').value, list = orders.filter((o) => !f || o.status === f);
    if (!list.length) { $('#ordList').innerHTML = '<div class="empty">Nu există comenzi aici încă.</div>'; return; }
    $('#ordList').innerHTML = list.map((o) => {
      const c = o.customer;
      const inv = o.invoice
        ? `Factura <b>${esc(o.invoice.series)} ${esc(o.invoice.number)}</b> · <a href="/api/admin/orders/${o.id}/invoice.pdf" target="_blank" rel="noopener">PDF ↗</a> ${o.invoice.token ? waInvoice(o.invoice, c.phone, c.name, 'comanda #' + o.number) : ''}`
        : `<button class="btn btn--sm btn--gold" data-inv="${o.id}" type="button">Emite factura în SmartBill</button>${o.invoiceError ? `<div class="err">${esc(o.invoiceError)}</div>` : ''}`;
      return `<article class="ord">
        <div class="ord__head"><h3>Comanda #${o.number} · ${lei(o.total)}</h3><span class="status status--${o.status}">${ST[o.status] || o.status}</span></div>
        <div class="ord__meta">${when(o.createdAt)} · plata ${payLabel(o)}</div>
        ${o.payment === 'card' && !o.paid && o.status !== 'anulata' ? `<div class="alert">💳 Clientul nu a terminat plata cu cardul${o.pay && o.pay.message ? ' (' + esc(o.pay.message) + ')' : ''}. Comanda nu se pregătește și se anulează singură dacă rămâne neplătită. <button class="btn btn--sm" data-paid="${o.id}" type="button">Am primit banii altfel: marchează plătită</button></div>` : ''}
        <table>${o.items.map((i) => `<tr><td>${i.qty} × ${esc(i.name)} ${esc(i.size)}</td><td>${lei(i.price * i.qty)}</td></tr>`).join('')}
          <tr><td>Livrare</td><td>${o.shipping ? lei(o.shipping) : 'gratuită'}</td></tr><tr><td><b>Total</b></td><td><b>${lei(o.total)}</b></td></tr></table>
        <div class="ord__grid">
          <div><b>${esc(c.name)}</b>${c.company ? '<br>' + esc(c.company) + (c.cui ? ' · CUI ' + esc(c.cui) : '') : ''}<br><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>${c.email ? '<br><a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : ''}</div>
          <div>${esc(c.address)}<br>${esc(c.city)}, jud. ${esc(c.county)}${c.notes ? '<br><i>„' + esc(c.notes) + '”</i>' : ''}</div>
          <div><label>Status<select data-st="${o.id}">${Object.entries(ST).map(([k, v]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>AWB curier<input data-awb="${o.id}" value="${esc(o.awb || '')}" placeholder="nr. AWB"></label></div>
          <div>${inv}</div>
        </div></article>`;
    }).join('');
    $$('[data-st]').forEach((s) => s.addEventListener('change', () => saveOrder(s.dataset.st, { status: s.value })));
    $$('[data-paid]').forEach((b) => b.addEventListener('click', () => { if (confirm('Marchezi comanda ca plătită? Va apărea la colete de pregătit.')) saveOrder(b.dataset.paid, { paid: true }); }));
    $$('[data-awb]').forEach((s) => s.addEventListener('change', () => saveOrder(s.dataset.awb, { awb: s.value })));
    $$('[data-inv]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { await api('admin/orders/' + b.dataset.inv + '/invoice', { method: 'POST' }); toast('Factura a fost emisă în SmartBill.'); }
      catch (e) { toast(e.message); }
      await loaders.comenzi();
    })));
  }
  function payLabel(o) {
    if (o.payment !== 'card') return 'ramburs';
    if (!o.paid) return 'card · <b class="low">neplătită</b>';
    const ch = o.pay && o.pay.channel ? ' · ' + esc(o.pay.channel) : '';
    return 'card · <b class="okk">plătită ✓</b>' + (o.pay && o.pay.manual ? ' (marcată de mână)' : ch) + (o.paidAt ? ' · ' + when(o.paidAt) : '');
  }
  async function saveOrder(id, body) {
    try { const o = await api('admin/orders/' + id, { method: 'PUT', body }); orders = orders.map((x) => (x.id === id ? o : x)); renderOrders(); toast('Comanda a fost actualizată.'); }
    catch (e) { toast(e.message); }
  }

  /* ---------- products ---------- */
  let products = [], editing = null, newImage = null;
  let prodCat = 'all';
  loaders.produse = async () => { products = await api('admin/products'); await loadCats(); renderProdCats(); renderProducts(); };
  function renderProdCats() {
    $('#prodCats').innerHTML = [['all', 'Toate'], ...cats.map((c) => [c.id, c.name])].map(([k, n]) => `<button type="button" class="chip${k === prodCat ? ' is-on' : ''}" data-pc="${k}">${esc(n)} <small>${k === 'all' ? products.length : products.filter((p) => p.category === k).length}</small></button>`).join('');
    $$('#prodCats [data-pc]').forEach((c) => c.addEventListener('click', () => { prodCat = c.dataset.pc; renderProdCats(); renderProducts(); }));
  }
  $('#prodSearch').addEventListener('input', () => renderProducts());
  function stockLabel(p) {
    if (p.stock == null) return 'Stoc: <b>nelimitat</b>';
    return `Stoc: <b class="${p.stock <= 3 ? 'low' : 'okk'}">${p.stock} buc.</b>`;
  }
  function renderProducts() {
    const q = ($('#prodSearch').value || '').trim().toLowerCase();
    const filtered = (p) => (prodCat === 'all' || p.category === prodCat) && (!q || (p.name + ' ' + p.size).toLowerCase().includes(q));
    $('#prodList').innerHTML = products.map((p, i) => !filtered(p) ? '' : `<article class="prod${p.active ? '' : ' off'}">
      <img src="${esc(img(p.image))}" alt="" loading="lazy">
      <div class="prod__b">
        <div class="prod__n">${esc(p.name)} <small>${esc(p.size)}</small></div>
        <div class="prod__p">${p.oldPrice ? '<s>' + lei(p.oldPrice) + '</s>' : ''}${lei(p.price)}</div>
        <div class="prod__s">${stockLabel(p)} · ${esc(catName(p.category))}${p.smartbillCode ? ' · cod ' + esc(p.smartbillCode) : ' · <i>fără cod SmartBill</i>'}${p.salonOnly ? ' · <b>doar în salon</b>' : p.active ? '' : ' · <b>ascuns</b>'}</div>
        <div class="prod__a"><button class="btn btn--sm btn--gold" data-edit="${p.id}" type="button">Modifică</button>
          <button class="btn btn--sm" data-up="${i}" type="button" aria-label="Mută mai sus" ${i ? '' : 'disabled'}>↑</button>
          <button class="btn btn--sm" data-down="${i}" type="button" aria-label="Mută mai jos" ${i < products.length - 1 ? '' : 'disabled'}>↓</button></div>
      </div></article>`).join('');
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => openProduct(products.find((p) => p.id === b.dataset.edit))));
    $$('[data-up],[data-down]').forEach((b) => b.addEventListener('click', async () => {
      const i = +(b.dataset.up ?? b.dataset.down), j = b.dataset.up != null ? i - 1 : i + 1;
      [products[i], products[j]] = [products[j], products[i]];
      renderProducts();
      await api('admin/products/order', { method: 'POST', body: { ids: products.map((p) => p.id) } }).catch((e) => toast(e.message));
    }));
  }
  function openProduct(p) {
    editing = p || null; newImage = null;
    const f = $('#prodForm'); f.reset(); $('#prodErr').textContent = '';
    $('#prodTitle').textContent = p ? 'Modifică produsul' : 'Produs nou';
    $('#prodDel').hidden = !p; $('#prodDup').hidden = !p;
    f.category.innerHTML = cats.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    const v = p || { category: prodCat !== 'all' ? prodCat : (cats[0] || {}).id, active: true, stock: null };
    for (const k of ['name', 'size', 'category', 'price', 'oldPrice', 'smartbillCode', 'description']) f[k].value = v[k] == null ? '' : v[k];
    f.stock.value = v.stock == null ? '' : v.stock;
    f.active.checked = v.active !== false;
    f.salonOnly.checked = !!v.salonOnly;
    $('#prodImg').src = img(v.image);
    $('#prodDlg').showModal();
  }
  $('#addProd').addEventListener('click', () => openProduct(null));
  $('#prodCancel').addEventListener('click', () => $('#prodDlg').close());
  $('#prodFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 5e6) { $('#prodErr').textContent = 'Imaginea e prea mare (max. 5 MB).'; return; }
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    try { const up = await api('admin/upload', { method: 'POST', body: { data } }); newImage = up.path; $('#prodImg').src = img(up.path); }
    catch (x) { $('#prodErr').textContent = x.message; }
  });
  $('#prodForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value, size: f.size.value, category: f.category.value, price: f.price.value, oldPrice: f.oldPrice.value,
      smartbillCode: f.smartbillCode.value, description: f.description.value, stock: f.stock.value, active: f.active.checked && !f.salonOnly.checked, salonOnly: f.salonOnly.checked,
      image: newImage || (editing && editing.image) || ''
    };
    try {
      await busy($('#prodSave'), () => api(editing ? 'admin/products/' + editing.id : 'admin/products', { method: editing ? 'PUT' : 'POST', body }));
      $('#prodDlg').close(); toast('Produsul a fost salvat.'); loaders.produse();
    } catch (x) { $('#prodErr').textContent = x.message; }
  });
  $('#prodDel').addEventListener('click', async () => {
    if (!editing || !confirm(`Ștergi definitiv „${editing.name}”? Poți să-l și ascunzi doar, debifând „Afișat pe site”.`)) return;
    await api('admin/products/' + editing.id, { method: 'DELETE' }).catch((x) => toast(x.message));
    $('#prodDlg').close(); toast('Produsul a fost șters.'); loaders.produse();
  });
  $('#prodDup').addEventListener('click', async () => {
    if (!editing) return;
    try { const c = await api('admin/products/' + editing.id + '/duplicate', { method: 'POST' }); $('#prodDlg').close(); toast('Am făcut o copie (ascunsă de pe site). Modifică-o și bifeaz-o când e gata.'); await loaders.produse(); openProduct(c); }
    catch (x) { toast(x.message); }
  });
  let catDraft = [];
  $('#editCats').addEventListener('click', async () => { await loadCats(); catDraft = cats.map((c) => ({ ...c })); renderCatList(); $('#catErr').textContent = ''; $('#catDlg').showModal(); });
  function renderCatList() {
    $('#catList').innerHTML = catDraft.map((c, i) => `<div class="catrow"><input value="${esc(c.name)}" data-cn="${i}" aria-label="Nume categorie">
      <small>${products.filter((p) => p.category === c.id).length} produse</small>
      <button type="button" class="btn btn--sm" data-cu="${i}" ${i ? '' : 'disabled'} aria-label="Mută mai sus">↑</button>
      <button type="button" class="btn btn--sm" data-cd="${i}" ${i < catDraft.length - 1 ? '' : 'disabled'} aria-label="Mută mai jos">↓</button>
      <button type="button" class="btn btn--sm btn--danger" data-cx="${i}" aria-label="Șterge">✕</button></div>`).join('');
    $$('[data-cn]').forEach((el) => el.addEventListener('input', () => { catDraft[+el.dataset.cn].name = el.value; }));
    $$('[data-cu]').forEach((el) => el.addEventListener('click', () => { const i = +el.dataset.cu; [catDraft[i - 1], catDraft[i]] = [catDraft[i], catDraft[i - 1]]; renderCatList(); }));
    $$('[data-cd]').forEach((el) => el.addEventListener('click', () => { const i = +el.dataset.cd; [catDraft[i + 1], catDraft[i]] = [catDraft[i], catDraft[i + 1]]; renderCatList(); }));
    $$('[data-cx]').forEach((el) => el.addEventListener('click', () => {
      const c = catDraft[+el.dataset.cx], n = products.filter((p) => p.category === c.id).length;
      if (n) { $('#catErr').textContent = `„${c.name}” are ${n} produse. Mută-le întâi în altă categorie.`; return; }
      catDraft.splice(+el.dataset.cx, 1); renderCatList();
    }));
  }
  $('#catAdd').addEventListener('click', () => { const v = $('#catNew').value.trim(); if (!v) return; catDraft.push({ name: v }); $('#catNew').value = ''; renderCatList(); });
  $('#catNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#catAdd').click(); } });
  $('#catCancel').addEventListener('click', () => $('#catDlg').close());
  $('#catForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { cats = await busy($('#catSave'), () => api('admin/categories', { method: 'PUT', body: { categories: catDraft } })); $('#catDlg').close(); toast('Categoriile au fost salvate.'); loaders.produse(); }
    catch (x) { $('#catErr').textContent = x.message; }
  });
  $('#syncBtn').addEventListener('click', (e) => !confirm('Preiei stocul din SmartBill? Cifrele din aplicație vor fi înlocuite cu cele din SmartBill.') ? null : busy(e.currentTarget, async () => {
    try { const r = await api('admin/smartbill/sync', { method: 'POST' }); toast(`Stoc actualizat: ${r.matched} din ${r.total} produse găsite în SmartBill.`); loaders.produse(); }
    catch (x) { toast(x.message); }
  }));

  /* ---------- site texts ---------- */
  // the editable texts are read straight from the pages (elements with data-edit)
  let textDefaults = [];
  loaders.texte = async () => {
    if (!textDefaults.length) {
      for (const page of ['../index.html', '../magazin.html']) {
        const html = await (await fetch(page, { cache: 'no-store' })).text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const el of doc.querySelectorAll('[data-edit]')) {
          if (textDefaults.some((t) => t.key === el.dataset.edit)) continue;
          textDefaults.push({ key: el.dataset.edit, label: el.dataset.label || el.dataset.edit, group: el.dataset.group || 'Altele', value: toText(el.innerHTML.trim()) });
        }
      }
    }
    const saved = await api('admin/content');
    const groups = {};
    for (const t of textDefaults) (groups[t.group] = groups[t.group] || []).push(t);
    $('#textList').innerHTML = Object.entries(groups).map(([g, items]) => `<div class="tgroup"><h3>${esc(g)}</h3>${items.map((t) => {
      const v = saved[t.key] ? toText(saved[t.key]) : t.value;
      const long = v.length > 70 || v.includes('\n');
      return `<label>${esc(t.label)}${long ? `<textarea data-k="${esc(t.key)}" rows="3">${esc(v)}</textarea>` : `<input data-k="${esc(t.key)}" value="${esc(v)}">`}</label>`;
    }).join('')}</div>`).join('');
  };
  $('#saveTexts').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const out = {};
    for (const el of $$('[data-k]')) {
      const def = textDefaults.find((t) => t.key === el.dataset.k);
      if (def && el.value.trim() !== def.value.trim()) out[el.dataset.k] = el.value;
    }
    try { await api('admin/content', { method: 'PUT', body: out }); toast('Textele au fost salvate. Reîncarcă site-ul ca să le vezi.'); }
    catch (x) { toast(x.message); }
  }));

  /* ---------- SmartBill + shop settings ---------- */
  let settings = null;
  async function loadSettings() { settings = await api('admin/settings'); return settings; }
  loaders.smartbill = async () => {
    const s = (await loadSettings()).smartbill, f = $('#sbForm');
    for (const k of ['email', 'cif', 'seriesName', 'warehouseName', 'vatName', 'vatPercent']) f[k].value = s[k] == null ? '' : s[k];
    f.syncMinutes.value = String(s.syncMinutes || 0);
    if (!f.syncMinutes.value) f.syncMinutes.value = '0';
    for (const k of ['useStock', 'autoInvoice', 'sendEmail']) f[k].checked = !!s[k];
    f.vatPayer.checked = s.vatPayer !== false;
    f.token.value = '';
    $('#sbTokenState').textContent = settings.smartbillTokenSet ? '🔒 Token-ul API este salvat (nu se afișează, din motive de siguranță).' : 'Token-ul API nu este salvat încă.';
  };
  function settingsBody() {
    const f = $('#sbForm'), g = $('#shopForm'), s = settings;
    return {
      shopEnabled: g.shopEnabled ? g.shopEnabled.checked : s.shopEnabled, codEnabled: g.codEnabled.checked,
      shippingCost: g.shippingCost.value || s.shippingCost, freeShippingFrom: g.freeShippingFrom.value || s.freeShippingFrom, orderEmail: g.orderEmail.value,
      smartbill: {
        email: f.email.value, cif: f.cif.value, seriesName: f.seriesName.value, warehouseName: f.warehouseName.value, vatName: f.vatName.value,
        vatPercent: f.vatPercent.value, vatPayer: f.vatPayer.checked, syncMinutes: f.syncMinutes.value, useStock: f.useStock.checked, autoInvoice: f.autoInvoice.checked, sendEmail: f.sendEmail.checked
      },
      smartbillToken: f.token.value
    };
  }
  function fillShop() {
    const g = $('#shopForm'), s = settings;
    g.shopEnabled.checked = !!s.shopEnabled; g.codEnabled.checked = s.codEnabled !== false;
    g.shippingCost.value = s.shippingCost; g.freeShippingFrom.value = s.freeShippingFrom; g.orderEmail.value = s.orderEmail || '';
  }
  $('#sbForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { fillShop(); settings = await busy($('button[type=submit]', e.target), () => api('admin/settings', { method: 'PUT', body: settingsBody() })); await loaders.smartbill(); note($('#sbMsg'), 'Setările SmartBill au fost salvate.', true); }
    catch (x) { note($('#sbMsg'), x.message, false); }
  });
  $('#sbTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      fillShop(); settings = await api('admin/settings', { method: 'PUT', body: settingsBody() });
      const r = await api('admin/smartbill/test', { method: 'POST' });
      note($('#sbMsg'), '✅ Conexiune reușită. Serii de facturi găsite: ' + (r.series.map((s) => s.name).join(', ') || 'niciuna'), true);
      loaders.smartbill();
    } catch (x) { note($('#sbMsg'), x.message, false); }
  }));
  loaders.setari = async () => { await loadSettings(); await loaders.smartbill(); fillShop(); };

  /* ---------- card payments (EuPlătesc) + automatic e-mails ---------- */
  function fillPay() {
    const s = settings, f = $('#payForm'), g = $('#mailForm'), p = s.pay, m = s.mail;
    f.enabled.checked = !!p.enabled; f.mid.value = p.mid || ''; f.key.value = ''; f.wallets.checked = !!p.wallets; f.unpaidHours.value = p.unpaidHours || 3;
    $('#payIpn').textContent = (s.siteUrl || location.origin) + '/api/pay/euplatesc/ipn';
    const t = p.lastTest;
    $('#payState').innerHTML = (s.payKeySet ? '🔒 Cheia este salvată (nu se afișează, din motive de siguranță).' : 'Cheia nu este salvată încă.') +
      (s.payReady ? ' <b class="okk">Plata cu cardul este pornită pe site.</b>' : p.enabled ? ' <b class="low">Lipsește Merchant ID-ul sau cheia: plata cu cardul nu apare încă pe site.</b>' : ' Plata cu cardul este oprită.') +
      (t ? `<br>Ultima plată de test (${when(t.at)}): ${t.approved ? '<b class="okk">reușită ✓</b>' : '<b class="low">nereușită</b> – ' + esc(t.message || '')}` : '');
    g.enabled.checked = !!m.enabled; g.host.value = m.host || ''; g.port.value = String(m.port || 465); g.user.value = m.user || ''; g.pass.value = '';
    g.from.value = m.from || ''; g.fromName.value = m.fromName || ''; g.orderEmail.value = s.orderEmail || '';
    for (const k of ['customerConfirm', 'customerShipped', 'salonNotify']) g[k].checked = !!m[k];
    $('#mailState').innerHTML = (s.mailPassSet ? '🔒 Parola este salvată (nu se afișează).' : 'Parola nu este salvată încă.') +
      (s.mailReady && m.enabled ? ' <b class="okk">E-mailurile automate sunt pornite.</b>' : '') +
      (m.lastError ? `<br><b class="low">Ultima eroare:</b> ${esc(m.lastError)}` : m.lastOk ? `<br>Ultimul e-mail trimis: ${when(m.lastOk)}` : '');
  }
  loaders.plati = async () => { await loadSettings(); fillPay(); };
  const payBody = () => { const f = $('#payForm'); return { pay: { enabled: f.enabled.checked, mid: f.mid.value, wallets: f.wallets.checked, unpaidHours: f.unpaidHours.value }, payKey: f.key.value }; };
  const mailBody = () => { const g = $('#mailForm'); return { mail: { enabled: g.enabled.checked, host: g.host.value, port: g.port.value, user: g.user.value, from: g.from.value, fromName: g.fromName.value,
    orderEmail: g.orderEmail.value, customerConfirm: g.customerConfirm.checked, customerShipped: g.customerShipped.checked, salonNotify: g.salonNotify.checked }, mailPass: g.pass.value }; };
  $('#payForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { settings = await busy($('button[type=submit]', e.target), () => api('admin/settings', { method: 'PUT', body: payBody() })); fillPay();
      note($('#payMsg'), settings.payReady ? 'Salvat. Plata cu cardul este pornită pe site.' : 'Salvat. Plata cu cardul nu apare încă pe site (bifează căsuța și completează Merchant ID-ul și cheia).', settings.payReady || !settings.pay.enabled); }
    catch (x) { note($('#payMsg'), x.message, false); }
  });
  $('#payTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      settings = await api('admin/settings', { method: 'PUT', body: payBody() }); fillPay();
      const pay = await api('admin/pay/test', { method: 'POST' });
      const f = document.createElement('form'); f.method = 'POST'; f.action = pay.url; f.target = '_blank'; f.style.display = 'none';
      for (const [k, v] of Object.entries(pay.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); }
      document.body.appendChild(f); f.submit(); f.remove();
      note($('#payMsg'), 'Am deschis pagina EuPlătesc într-o filă nouă. Dacă vezi formularul de plată de 1 leu, datele sunt corecte. Dacă scrie „Incorrect signature”, cheia sau Merchant ID-ul sunt greșite.', true);
    } catch (x) { note($('#payMsg'), x.message, false); }
  }));
  $('#mailForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { settings = await busy($('button[type=submit]', e.target), () => api('admin/settings', { method: 'PUT', body: mailBody() })); fillPay(); note($('#mailMsg'), 'Setările de e-mail au fost salvate.', true); }
    catch (x) { note($('#mailMsg'), x.message, false); }
  });
  $('#mailTest').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    try {
      settings = await api('admin/settings', { method: 'PUT', body: mailBody() }); fillPay();
      const r = await api('admin/mail/test', { method: 'POST', body: {} });
      note($('#mailMsg'), '✅ E-mailul de test a fost trimis la ' + r.to + '. Verifică și dosarul Spam.', true);
    } catch (x) { note($('#mailMsg'), x.message, false); }
  }));
  $('#shopForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { settings = await busy($('button', e.target), () => api('admin/settings', { method: 'PUT', body: settingsBody() })); fillShop(); note($('#shopMsg'), 'Setările magazinului au fost salvate.', true); }
    catch (x) { note($('#shopMsg'), x.message, false); }
  });
  $('#pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await busy($('button', f), () => api('admin/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } })); f.reset(); note($('#pwMsg'), 'Parola a fost schimbată.', true); }
    catch (x) { note($('#pwMsg'), x.message, false); }
  });

  boot();
})();
