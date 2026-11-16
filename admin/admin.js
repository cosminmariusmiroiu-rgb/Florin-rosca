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
    const s = await api('admin/summary');
    $('#navNew').hidden = !s.newOrders; $('#navNew').textContent = s.newOrders;
    $('#sumCards').innerHTML = [
      ['Comenzi noi', s.newOrders], ['Comenzi în ultimele 30 de zile', s.orders30], ['Vânzări 30 de zile', lei(s.revenue30)],
      ['SmartBill', s.smartbill.configured ? (s.smartbill.lastSyncError ? 'Eroare' : 'Configurat') : 'Neconfigurat']
    ].map(([l, v]) => `<div class="card"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    const al = [];
    if (s.newOrders) al.push(`🧾 Ai <b>${s.newOrders}</b> comenzi noi. <a href="#comenzi" data-go="comenzi">Vezi comenzile →</a>`);
    if (!s.smartbill.configured) al.push('🔗 SmartBill nu este conectat încă. <a href="#smartbill" data-go="smartbill">Conectează acum →</a>');
    if (s.smartbill.lastSyncError) al.push('⚠️ Ultima sincronizare de stoc a eșuat: ' + esc(s.smartbill.lastSyncError));
    else if (s.smartbill.lastSync) al.push('✅ Stoc sincronizat cu SmartBill: ' + when(s.smartbill.lastSync));
    for (const p of s.lowStock) al.push(`📦 Stoc mic: <b>${esc(p.name)}</b> ${esc(p.size)} – ${p.stock} buc.`);
    $('#sumAlerts').innerHTML = al.length ? al.map((x) => `<div class="alert">${x}</div>`).join('') : '<div class="alert">Totul e în regulă. ✨</div>';
    $$('[data-go]', $('#sumAlerts')).forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); go(a.dataset.go); }));
  };

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
  const CAT = { repair: 'Luxury Repair', anti: 'Anti-Yellow', kit: 'Kituri & seturi' };
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
        <div class="prod__s">${stockLabel(p)} · ${esc(CAT[p.category] || '')}${p.smartbillCode ? ' · cod ' + esc(p.smartbillCode) : ' · <i>fără cod SmartBill</i>'}${p.active ? '' : ' · <b>ascuns</b>'}</div>
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
      smartbillCode: f.smartbillCode.value, description: f.description.value, stock: f.stock.value, active: f.active.checked,
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
  $('#syncBtn').addEventListener('click', (e) => busy(e.currentTarget, async () => {
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
    if (!f.syncMinutes.value) f.syncMinutes.value = '30';
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
