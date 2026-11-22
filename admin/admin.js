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
    if (!s.smartbill.configured) al.push('🔗 SmartBill nu este conectat încă. <a href="#smartbill" data-go="smartbill">Conectează acum →</a>');
    if (s.smartbill.lastSyncError) al.push('⚠️ Ultima sincronizare de stoc a eșuat: ' + esc(s.smartbill.lastSyncError));
    else if (s.smartbill.lastSync) al.push('✅ Stoc sincronizat cu SmartBill: ' + when(s.smartbill.lastSync));
    for (const p of s.lowStock) al.push(`📦 Stoc mic: <b>${esc(p.name)}</b> ${esc(p.size)} – ${p.stock} buc.`);
    $('#sumAlerts').innerHTML = al.length ? al.map((x) => `<div class="alert">${x}</div>`).join('') : '<div class="alert">Totul e în regulă. ✨</div>';
    $$('[data-go]', $('#sumAlerts')).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go); }));
  };

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
  const CATS = { all: 'Toate', repair: 'Luxury Repair', anti: 'Anti-Yellow', kit: 'Kituri & seturi', salon: 'Alte produse salon' };
  let saleProducts = [], picked = {}, sales = [], saleCat = 'all';
  const prodLabel = (p) => `${p.name}${p.size ? ' · ' + p.size : ''}`;
  loaders.vanzare = async () => {
    saleProducts = await api('admin/products');
    const st = await api('admin/settings').catch(() => null);
    $('#saleInvWrap').hidden = !(st && st.smartbillTokenSet && st.smartbill.cif);
    const used = ['all', ...Object.keys(CATS).filter((k) => k !== 'all' && saleProducts.some((p) => p.category === k))];
    $('#saleCats').innerHTML = used.map((k) => `<button type="button" class="chip${k === saleCat ? ' is-on' : ''}" data-cat="${k}">${CATS[k]}</button>`).join('');
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
    list.forEach((p) => { (groups[p.category] = groups[p.category] || []).push(p); });
    $('#saleGrid').innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([cat, items]) => `<h3 class="sgrid__h">${esc(CATS[cat] || cat)}</h3><div class="sgrid__g">${items.map((p) => {
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
      const s = await busy($('#saleGo'), () => api('admin/sales', { method: 'POST', body: { items, payment: $('#salePay').value, client: $('#saleClient').value, invoice: $('#saleInv').checked } }));
      note($('#saleMsg'), `✓ Vânzarea #${s.number} a fost salvată: ${lei(s.total)}. Stocul a fost scăzut.` + (s.invoice ? ` Factura ${s.invoice.series} ${s.invoice.number} emisă în SmartBill.` : s.invoiceError ? ` Factura SmartBill NU s-a emis: ${s.invoiceError}` : ''), !s.invoiceError);
      toast('Vânzare salvată ✓');
      picked = {}; $('#saleClient').value = '';
      await loaders.vanzare();
    } catch (x) { note($('#saleMsg'), x.message, false); }
  });
  $('#saleRange').addEventListener('change', renderSales);
  function renderSales() {
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
      ${x.cancelled ? '' : `<div class="row row--end"><span class="sp"></span><button class="btn btn--sm btn--danger" data-cancel="${x.id}" type="button">Anulează (pune stocul înapoi)</button></div>`}</div>`).join('')
      : '<div class="empty">Nicio vânzare în perioada aleasă.</div>';
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferredPrompt = null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; showInstallTip(); });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return showInstallTip(true);
    deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => {}); deferredPrompt = null; $('#installBtn').hidden = true;
  });
  function showInstallTip(force) {
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const t = $('#installTip');
    t.innerHTML = ios
      ? '📲 <b>Instalează panoul ca aplicație pe iPhone:</b> apasă butonul <b>Partajare</b> (pătratul cu săgeată) din Safari, apoi <b>„Adaugă pe ecranul principal”</b>.'
      : deferredPrompt ? '📲 <b>Poți instala panoul ca aplicație:</b> <button class="btn btn--sm btn--gold" type="button" id="installNow">Instalează aplicația</button>'
      : (force ? '📲 Deschide meniul browserului (⋮) și alege <b>„Instalează aplicația”</b> sau <b>„Adaugă pe ecranul de pornire”</b>.' : '');
    t.hidden = !t.innerHTML;
    const b = $('#installNow'); if (b) b.addEventListener('click', () => $('#installBtn').click());
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { $('#installBtn').hidden = standalone; showInstallTip(); }

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

  /* ---------- orders ---------- */
  const ST = { noua: 'Nouă', confirmata: 'Confirmată', expediata: 'Expediată', livrata: 'Livrată', anulata: 'Anulată' };
  let orders = [];
  loaders.comenzi = async () => { orders = await api('admin/orders'); renderOrders(); };
  $('#ordFilter').addEventListener('change', renderOrders);
  function renderOrders() {
    const f = $('#ordFilter').value, list = orders.filter((o) => !f || o.status === f);
    if (!list.length) { $('#ordList').innerHTML = '<div class="empty">Nu există comenzi aici încă.</div>'; return; }
    $('#ordList').innerHTML = list.map((o) => {
      const c = o.customer;
      const inv = o.invoice
        ? `Factura <b>${esc(o.invoice.series)} ${esc(o.invoice.number)}</b> · <a href="/api/admin/orders/${o.id}/invoice.pdf" target="_blank" rel="noopener">PDF ↗</a>`
        : `<button class="btn btn--sm btn--gold" data-inv="${o.id}" type="button">Emite factura în SmartBill</button>${o.invoiceError ? `<div class="err">${esc(o.invoiceError)}</div>` : ''}`;
      return `<article class="ord">
        <div class="ord__head"><h3>Comanda #${o.number} · ${lei(o.total)}</h3><span class="status status--${o.status}">${ST[o.status] || o.status}</span></div>
        <div class="ord__meta">${when(o.createdAt)} · plata ${o.payment === 'ramburs' ? 'ramburs' : esc(o.payment)}</div>
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
    $$('[data-awb]').forEach((s) => s.addEventListener('change', () => saveOrder(s.dataset.awb, { awb: s.value })));
    $$('[data-inv]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      try { await api('admin/orders/' + b.dataset.inv + '/invoice', { method: 'POST' }); toast('Factura a fost emisă în SmartBill.'); }
      catch (e) { toast(e.message); }
      await loaders.comenzi();
    })));
  }
  async function saveOrder(id, body) {
    try { const o = await api('admin/orders/' + id, { method: 'PUT', body }); orders = orders.map((x) => (x.id === id ? o : x)); renderOrders(); toast('Comanda a fost actualizată.'); }
    catch (e) { toast(e.message); }
  }

  /* ---------- products ---------- */
  let products = [], editing = null, newImage = null;
  const CAT = { repair: 'Luxury Repair', anti: 'Anti-Yellow', kit: 'Kituri & seturi', salon: 'Alte produse salon' };
  loaders.produse = async () => { products = await api('admin/products'); renderProducts(); };
  function stockLabel(p) {
    if (p.stock == null) return 'Stoc: <b>nelimitat</b>';
    return `Stoc: <b class="${p.stock <= 3 ? 'low' : 'okk'}">${p.stock} buc.</b>`;
  }
  function renderProducts() {
    $('#prodList').innerHTML = products.map((p, i) => `<article class="prod${p.active ? '' : ' off'}">
      <img src="${esc(img(p.image))}" alt="" loading="lazy">
      <div class="prod__b">
        <div class="prod__n">${esc(p.name)} <small>${esc(p.size)}</small></div>
        <div class="prod__p">${p.oldPrice ? '<s>' + lei(p.oldPrice) + '</s>' : ''}${lei(p.price)}</div>
        <div class="prod__s">${stockLabel(p)} · ${esc(CAT[p.category] || '')}${p.smartbillCode ? ' · cod ' + esc(p.smartbillCode) : ' · <i>fără cod SmartBill</i>'}${p.salonOnly ? ' · <b>doar în salon</b>' : p.active ? '' : ' · <b>ascuns</b>'}</div>
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
    $('#prodDel').hidden = !p;
    const v = p || { category: 'repair', active: true, stock: null };
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
        vatPercent: f.vatPercent.value, syncMinutes: f.syncMinutes.value, useStock: f.useStock.checked, autoInvoice: f.autoInvoice.checked, sendEmail: f.sendEmail.checked
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
