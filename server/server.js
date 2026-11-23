'use strict';
// Florin Roșca – site + panou de administrare + magazin + SmartBill.
// Pornire: node server/server.js   (variabile: PORT, ADMIN_PASSWORD, DATA_DIR, SESSION_SECRET)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');
const auth = require('./auth');
const sb = require('./smartbill');
const courier = require('./courier');
const ep = require('./euplatesc');
const mailer = require('./mailer');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = store.ROOT;
const UPLOADS = path.join(store.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};
// never served as static files
const BLOCKED = /^\/(server|data|\.git|node_modules)(\/|$)|\/\.[^/]/;

/* ---------- helpers ---------- */
function send(res, code, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const ok = (res, data) => send(res, 200, data);
const fail = (res, code, msg) => send(res, code, { error: msg });

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

// answers from the payment processor arrive as a classic form post
function readForm(req, limit = 1e5) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
    req.on('error', reject);
  });
}
const text = (res, code, body) => send(res, code, body, { 'Content-Type': 'text/plain; charset=utf-8' });
const redirect = (res, to) => { res.writeHead(303, { Location: to, 'Cache-Control': 'no-store' }); res.end(); };

// public address of the site, as the visitor sees it (used for payment return addresses and links in e-mails)
function siteOrigin(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  return (proto === 'https' ? 'https' : 'http') + '://' + host;
}

const ip = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
const str = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const money = (n) => Math.round(n * 100) / 100;

// texts edited in the panel: plain text + <br>, <em>, <strong>
function cleanText(v) {
  const esc = String(v || '').slice(0, 2000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return esc.replace(/&lt;(\/?)(br|em|strong)\s*\/?&gt;/gi, '<$1$2>').replace(/\n/g, '<br>');
}

/* ---------- products ---------- */
function publicProducts() {
  return store.products()
    .filter((p) => p.active)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(({ smartbillCode, ...p }) => ({ ...p, inStock: p.stock == null ? true : p.stock > 0 }));
}

function cleanProduct(input, existing) {
  const p = { ...(existing || {}) };
  p.name = str(input.name, 160);
  if (!p.name) throw new Error('Numele produsului este obligatoriu.');
  p.size = str(input.size, 40);
  const cats = store.categories();
  p.category = cats.some((c) => c.id === input.category) ? input.category : (cats[0] || { id: 'repair' }).id;
  p.price = num(input.price);
  if (p.price == null || p.price <= 0) throw new Error('Prețul trebuie să fie un număr mai mare ca 0.');
  p.oldPrice = input.oldPrice === '' || input.oldPrice == null ? null : num(input.oldPrice);
  p.description = str(input.description, 2000);
  p.smartbillCode = str(input.smartbillCode, 60);
  p.image = /^(assets\/img\/|uploads\/)[\w\-./]+$/.test(input.image || '') ? input.image : (p.image || '');
  p.alt = p.name + (p.size ? ', ' + p.size : '');
  p.active = input.active !== false;
  p.salonOnly = !!input.salonOnly;
  if (p.salonOnly) p.active = false; // not on the website
  if (input.stock !== undefined) p.stock = input.stock === '' || input.stock == null ? null : Math.max(0, Math.round(num(input.stock) || 0));
  if (!p.id) p.id = (p.name + '-' + p.size).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) + '-' + crypto.randomBytes(2).toString('hex');
  return p;
}

/* ---------- SmartBill stock sync ---------- */
async function syncStock() {
  const settings = store.settings();
  const token = store.secrets().smartbillToken;
  try {
    const list = await sb.stocks(settings.smartbill, token);
    const byCode = new Map(), byName = new Map();
    for (const s of list) {
      if (s.code) byCode.set(s.code.toLowerCase(), (byCode.get(s.code.toLowerCase()) || 0) + s.quantity);
      byName.set(s.name.toLowerCase(), (byName.get(s.name.toLowerCase()) || 0) + s.quantity);
    }
    let matched = 0;
    const products = store.products().map((p) => {
      const q = p.smartbillCode ? byCode.get(p.smartbillCode.toLowerCase()) : byName.get((p.name + (p.size ? ' ' + p.size : '')).toLowerCase());
      if (q === undefined) return p;
      matched++;
      return { ...p, stock: Math.max(0, Math.floor(q)) };
    });
    store.write('products', products);
    settings.smartbill.lastSync = new Date().toISOString();
    settings.smartbill.lastSyncError = null;
    store.write('settings', settings);
    return { matched, total: products.length, smartbillProducts: list.length };
  } catch (e) {
    settings.smartbill.lastSyncError = e.message;
    store.write('settings', settings);
    throw e;
  }
}
setInterval(() => {
  const s = store.settings().smartbill;
  if (!s.syncMinutes || !store.secrets().smartbillToken) return;
  if (s.lastSync && Date.now() - Date.parse(s.lastSync) < s.syncMinutes * 60e3) return;
  syncStock().catch(() => {});
}, 60e3).unref();

/* ---------- e-mails (never block or break an order) ---------- */
const COURIER_NAMES = { sameday: 'Sameday', fan: 'FAN Courier', cargus: 'Cargus' };
const salonTo = (s) => s.orderEmail || s.mail.from;
function mail(build) {
  const s = store.settings(), pass = store.secrets().mailPass;
  if (!s.mail.enabled || !mailer.configured(s.mail, pass)) return;
  let msg;
  try { msg = build(s); } catch (e) { return; }
  if (!msg || !mailer.isEmail(msg.to)) return;
  mailer.send(s.mail, pass, msg).then(
    () => { const x = store.settings(); x.mail.lastOk = new Date().toISOString(); x.mail.lastError = null; store.write('settings', x); },
    (e) => { const x = store.settings(); x.mail.lastError = new Date().toISOString() + ' · ' + e.message; store.write('settings', x); console.error('e-mail:', e.message); }
  );
}
// order received (ramburs) or paid (card): confirmation for the customer + notice for the salon
function mailNewOrder(order) {
  mail((s) => (s.mail.customerConfirm && order.customer.email ? mailer.templates.orderCustomer(order) : null));
  mail((s) => (s.mail.salonNotify ? mailer.templates.orderSalon(order, salonTo(s), order.origin) : null));
}
// parcel handed to the courier (sent once)
function mailShipped(order) {
  if (order.shippedMailAt || !order.customer.email) return;
  const s = store.settings();
  if (!s.mail.enabled || !s.mail.customerShipped || !mailer.configured(s.mail, store.secrets().mailPass)) return;
  order.shippedMailAt = new Date().toISOString();
  mail(() => mailer.templates.orderShipped(order, COURIER_NAMES[order.awbCourier || s.courier.provider] || ''));
}

/* ---------- card payments (EuPlatesc) ---------- */
const payReady = (s) => !!(s.pay.enabled && s.pay.mid && ep.validKey(store.secrets().payKey));
const awaitingPay = (o) => o.payment === 'card' && !o.paid;
const moveStock = (order, sign) => store.write('products', store.products().map((p) => {
  const it = order.items.find((i) => i.id === p.id);
  return it && p.stock != null ? { ...p, stock: Math.max(0, p.stock + sign * it.qty) } : p;
}));

function payRequest(order) {
  const base = order.origin;
  return ep.request(store.settings().pay, store.secrets().payKey, {
    amount: order.total, invoiceId: order.number, description: 'Comanda ' + order.number + ' Florin Rosca Luxury Hair', customer: order.customer,
    urls: base ? { silent: base + '/api/pay/euplatesc/ipn', back: base + '/api/pay/euplatesc/return', site: base + '/magazin.html' } : null
  });
}

// a signed answer from EuPlatesc (it can come twice: server-to-server and with the customer's browser)
async function applyPayment(r) {
  const now = new Date().toISOString();
  if (/^T\d+$/.test(r.invoiceId)) { // test payment started from the panel
    const s = store.settings();
    s.pay.lastTest = { at: now, approved: r.approved, message: r.message, channel: r.channel };
    store.write('settings', s);
    return { test: true };
  }
  const orders = store.read('orders', []), o = orders.find((x) => String(x.number) === r.invoiceId);
  if (!o) return { missing: true };
  if (o.paid) return { order: o };
  if (!r.approved) {
    o.pay = { status: 'esuata', message: r.message, epId: r.epId, at: now };
    store.write('orders', orders);
    return { order: o };
  }
  if (r.curr !== 'RON' || Math.abs(r.amount - o.total) > 0.009) {
    o.pay = { status: 'suma-diferita', message: `S-au plătit ${r.amount} ${r.curr}, iar comanda are ${o.total} RON.`, epId: r.epId, at: now };
    store.write('orders', orders);
    return { order: o };
  }
  o.paid = true; o.paidAt = now; o.payment = 'card';
  o.pay = { status: 'platita', epId: r.epId, approval: r.approval, channel: r.channel, cardType: r.cardType, at: now };
  if (o.status === 'anulata' && o.autoCancelled) { // paid after the automatic cancellation: bring it back
    o.status = 'noua'; o.autoCancelled = false; o.stockRestored = false;
    moveStock(o, -1);
  }
  store.write('orders', orders);
  const settings = store.settings();
  if (settings.smartbill.autoInvoice && store.secrets().smartbillToken && !o.invoice) {
    try { await issueInvoice(o); } catch (e) { o.invoiceError = e.message; }
    store.write('orders', store.read('orders', []).map((x) => (x.id === o.id ? o : x)));
  }
  mailNewOrder(o);
  return { order: o };
}

// card orders that were never paid are cancelled after a few hours, so the stock is free again
function cancelUnpaid() {
  const hours = Number(store.settings().pay.unpaidHours) || 3;
  const orders = store.read('orders', []); let changed = false;
  for (const o of orders) {
    if (!awaitingPay(o) || o.status !== 'noua' || Date.now() - Date.parse(o.createdAt) < hours * 3600e3) continue;
    if (!o.stockRestored) { moveStock(o, 1); o.stockRestored = true; }
    o.status = 'anulata'; o.autoCancelled = true;
    o.adminNote = (o.adminNote ? o.adminNote + '\n' : '') + 'Anulată automat: plata cu cardul nu a fost finalizată.';
    changed = true;
  }
  if (changed) store.write('orders', orders);
}
setInterval(cancelUnpaid, 10 * 60e3).unref();
setTimeout(cancelUnpaid, 5000).unref(); // also shortly after a restart

function publicOrder(number, token) {
  const o = store.read('orders', []).find((x) => String(x.number) === String(number));
  return o && o.payToken && token && o.payToken === token ? o : null;
}

/* ---------- orders ---------- */
function nextOrderNumber(orders) {
  return orders.reduce((m, o) => Math.max(m, o.number || 0), 1000) + 1;
}

async function issueInvoice(order) {
  const settings = store.settings();
  const inv = await sb.invoice(settings.smartbill, store.secrets().smartbillToken, order);
  order.invoice = { ...inv, issuedAt: new Date().toISOString() };
  order.invoiceError = null;
  return order;
}

async function placeOrder(body, origin) {
  const settings = store.settings();
  if (!settings.shopEnabled) throw new Error('Comenzile online sunt momentan oprite. Te rugăm să suni la 0732 937 622.');
  const c = body.customer || {};
  const customer = {
    name: str(c.name, 120), phone: str(c.phone, 30), email: str(c.email, 120),
    address: str(c.address, 250), city: str(c.city, 80), county: str(c.county, 60),
    company: str(c.company, 160), cui: str(c.cui, 30), notes: str(c.notes, 600)
  };
  if (!customer.name || !customer.phone || !customer.address || !customer.city || !customer.county) throw new Error('Completează numele, telefonul și adresa de livrare.');
  if (!/^[+0-9 ()-]{9,20}$/.test(customer.phone)) throw new Error('Numărul de telefon nu pare corect.');
  if (customer.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customer.email)) throw new Error('Adresa de e-mail nu pare corectă.');
  if (!body.acceptTerms) throw new Error('Trebuie să accepți termenii și condițiile.');
  const card = body.payment === 'card' || (!settings.codEnabled && payReady(settings));
  if (card && !payReady(settings)) throw new Error('Plata cu cardul nu este disponibilă momentan. Alege plata ramburs.');
  if (!card && !settings.codEnabled) throw new Error('Plata ramburs nu este disponibilă momentan. Te rugăm să suni la 0732 937 622.');

  const products = store.products();
  const items = [];
  for (const line of Array.isArray(body.items) ? body.items.slice(0, 50) : []) {
    const p = products.find((x) => x.id === line.id && x.active);
    const qty = Math.min(50, Math.max(1, Math.round(num(line.qty) || 0)));
    if (!p) throw new Error('Un produs din coș nu mai este disponibil.');
    if (p.stock != null && p.stock < qty) throw new Error(`Stoc insuficient pentru „${p.name}” (disponibil: ${p.stock}).`);
    items.push({ id: p.id, name: p.name, size: p.size, price: p.price, qty, smartbillCode: p.smartbillCode || '' });
  }
  if (!items.length) throw new Error('Coșul este gol.');

  const subtotal = money(items.reduce((s, i) => s + i.price * i.qty, 0));
  const shipping = settings.freeShippingFrom && subtotal >= settings.freeShippingFrom ? 0 : money(settings.shippingCost || 0);
  const orders = store.read('orders', []);
  const order = {
    id: crypto.randomUUID(), number: nextOrderNumber(orders), createdAt: new Date().toISOString(),
    status: 'noua', payment: card ? 'card' : 'ramburs', paid: false, customer, items, subtotal, shipping, total: money(subtotal + shipping),
    invoice: null, invoiceError: null, payToken: crypto.randomBytes(16).toString('hex'), origin
  };
  // reserve stock locally until the next SmartBill sync
  store.write('products', products.map((p) => {
    const it = items.find((i) => i.id === p.id);
    return it && p.stock != null ? { ...p, stock: Math.max(0, p.stock - it.qty) } : p;
  }));
  orders.push(order);
  store.write('orders', orders);

  // card: the customer goes to the EuPlatesc page; invoice and e-mails follow after the payment
  if (card) return { number: order.number, total: order.total, token: order.payToken, pay: payRequest(order) };
  await confirmOrder(order);
  return { number: order.number, total: order.total, token: order.payToken };
}

// an order that will be prepared (ramburs): invoice (if automatic) + e-mails
async function confirmOrder(order) {
  if (store.settings().smartbill.autoInvoice && store.secrets().smartbillToken && !order.invoice) {
    try { await issueInvoice(order); } catch (e) { order.invoiceError = e.message; }
    store.write('orders', store.read('orders', []).map((o) => (o.id === order.id ? order : o)));
  }
  mailNewOrder(order);
}

/* ---------- sales statistics (online orders vs salon sales) ---------- */
function periodStats(list) {
  const day = (d) => new Date(d).toISOString().slice(0, 10);
  const today = day(Date.now());
  const sum = (arr) => money(arr.reduce((a, x) => a + (x.total || 0), 0));
  const pieces = (arr) => arr.reduce((a, x) => a + (x.items || []).reduce((b, i) => b + (i.qty || 0), 0), 0);
  const within = (n) => list.filter((x) => Date.now() - Date.parse(x.createdAt) < n * 864e5);
  const t = list.filter((x) => day(x.createdAt) === today), w = within(7), m = within(30);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = day(Date.now() - i * 864e5);
    days.push({ day: d, total: sum(list.filter((x) => day(x.createdAt) === d)) });
  }
  return { today: sum(t), todayCount: t.length, week: sum(w), month: sum(m), monthCount: m.length, monthPieces: pieces(m), days,
    // kept for older panel code
    todayTotal: sum(t), monthTotal: sum(m) };
}

/* ---------- consultation form (fișa clientei) ---------- */
const PRIVATE = path.join(store.DATA_DIR, 'private', 'consult');
fs.mkdirSync(PRIVATE, { recursive: true });
const YN = (v) => (v === 'Da' ? 'Da' : v === 'Nu' ? 'Nu' : '');

// first, rule-based observations shown to the client (the final one is made in the salon)
function evaluate(c) {
  const out = [];
  if (c.homeBleach === 'Da') out.push('Decolorarea făcută acasă sensibilizează fibra: vom începe cu un tratament de reconstrucție, ca părul să rămână sănătos.');
  if (c.boxDye === 'Da') out.push('Vopseaua din comerț lasă pigmenți greu de scos: transformarea poate avea nevoie de mai mult timp sau de o ședință în plus.');
  if (c.keratin === 'Da') out.push('Keratina din păr influențează felul în care culoarea se prinde: Florin va verifica de cât timp este și cum procedăm în siguranță.');
  if (c.perm === 'Da') out.push('Permanentul face părul mai fragil la decolorare: vom lucra cu produse de protecție și reconstrucție.');
  if (c.lastColor === 'Sub o lună') out.push('Ultima colorare este recentă: ideal ar fi să lăsăm părul să se odihnească puțin; discutăm la consultație.');
  if (c.allergy === 'Da') out.push('Ai menționat o alergie: facem un test de sensibilitate înainte de orice tehnică chimică.');
  if (!out.length) out.push('Părul tău pare un punct de plecare foarte bun pentru ' + (c.service ? c.service.toLowerCase() : 'transformarea dorită') + '.');
  out.push('Toate serviciile de vopsit, decolorat și balayage includ tratamente de reconstrucție și hidratare Florin Roșca Luxury Hair.');
  return out;
}

async function saveConsult(body, origin) {
  const c = {
    name: str(body.name, 120), phone: str(body.phone, 30), email: str(body.email, 120), service: str(body.service, 40),
    lastColor: str(body.lastColor, 40), boxDye: YN(body.boxDye), homeBleach: YN(body.homeBleach),
    keratin: YN(body.keratin), keratinSince: str(body.keratinSince, 80), perm: YN(body.perm), permSince: str(body.permSince, 80),
    allergy: YN(body.allergy), allergyDetails: str(body.allergyDetails, 200), notes: str(body.notes, 1000)
  };
  if (!c.name || !/^[+0-9 ()-]{9,20}$/.test(c.phone)) throw new Error('Completează numele și un număr de telefon corect.');
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) throw new Error('Adresa de e-mail nu pare corectă.');
  if (!c.service || !c.lastColor || !c.boxDye || !c.homeBleach || !c.keratin || !c.perm || !c.allergy) throw new Error('Răspunde la toate întrebările marcate cu *.');
  if (!body.depositAck || !body.gdpr) throw new Error('Bifează acordurile de la final.');
  const id = crypto.randomUUID(), files = {};
  for (const k of ['photoFront', 'photoBack', 'photoDeposit']) {
    const mt = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec((body.photos || {})[k] || '');
    if (!mt) throw new Error('Adaugă toate cele 3 poze (față, spate și dovada avansului).');
    const buf = Buffer.from(mt[2], 'base64');
    if (buf.length > 6e6) throw new Error('O poză este prea mare.');
    const name = id + '-' + k + '.' + mt[1].replace('jpeg', 'jpg');
    fs.writeFileSync(path.join(PRIVATE, name), buf);
    files[k] = name;
  }
  const list = store.read('consultations', []);
  const rec = { id, number: list.reduce((m, x) => Math.max(m, x.number || 0), 0) + 1, createdAt: new Date().toISOString(), status: 'noua', ...c, photos: files, evaluation: evaluate(c), consent: { gdpr: true, depositNonRefundable: true, at: new Date().toISOString() } };
  list.push(rec);
  store.write('consultations', list);
  mail((s) => (s.mail.salonNotify ? mailer.templates.consultSalon(rec, salonTo(s), origin) : null));
  return { number: rec.number, evaluation: rec.evaluation };
}

/* ---------- routes ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  // public
  if (p === '/api/products' && m === 'GET') return ok(res, publicProducts());
  if (p === '/api/categories' && m === 'GET') return ok(res, store.categories());
  if (p === '/api/content' && m === 'GET') return ok(res, store.read('content', {}));
  if (p === '/api/shop' && m === 'GET') {
    const s = store.settings();
    return ok(res, { enabled: s.shopEnabled, shippingCost: s.shippingCost, freeShippingFrom: s.freeShippingFrom, cod: s.codEnabled, card: payReady(s), wallets: !!s.pay.wallets });
  }
  if (p === '/api/order' && m === 'POST') {
    try { return ok(res, await placeOrder(await readBody(req), siteOrigin(req))); }
    catch (e) { return fail(res, 400, e.message); }
  }
  // the customer comes back from the payment page: what happened with the order?
  if (p === '/api/order/status' && m === 'GET') {
    const o = publicOrder(url.searchParams.get('n'), url.searchParams.get('t')), s = store.settings();
    if (!o) return fail(res, 404, 'Comanda nu a fost găsită.');
    return ok(res, { number: o.number, total: o.total, payment: o.payment, paid: !!o.paid, cancelled: o.status === 'anulata',
      canPay: !o.paid && o.status !== 'anulata' && payReady(s), cod: !!s.codEnabled, message: (o.pay && o.pay.status === 'esuata' && o.pay.message) || '' });
  }
  // try the card payment again / switch an unpaid card order to ramburs
  if ((p === '/api/order/pay' || p === '/api/order/cod') && m === 'POST') {
    try {
      const b = await readBody(req), s = store.settings();
      const orders = store.read('orders', []), o = orders.find((x) => String(x.number) === String(b.number) && x.payToken && x.payToken === b.token);
      if (!o) return fail(res, 404, 'Comanda nu a fost găsită.');
      if (o.paid) return fail(res, 400, 'Comanda este deja plătită.');
      if (o.status === 'anulata') return fail(res, 400, 'Comanda a fost anulată. Te rugăm să o plasezi din nou.');
      if (p === '/api/order/pay') {
        if (!payReady(s)) return fail(res, 400, 'Plata cu cardul nu este disponibilă momentan.');
        o.payment = 'card'; o.origin = siteOrigin(req) || o.origin;
        store.write('orders', orders);
        return ok(res, { number: o.number, total: o.total, pay: payRequest(o) });
      }
      if (!s.codEnabled) return fail(res, 400, 'Plata ramburs nu este disponibilă.');
      if (o.payment === 'ramburs') return ok(res, { number: o.number, total: o.total });
      o.payment = 'ramburs';
      store.write('orders', orders);
      await confirmOrder(o);
      return ok(res, { number: o.number, total: o.total });
    } catch (e) { return fail(res, 400, e.message); }
  }
  // EuPlatesc → server (Silent URL): the trusted confirmation of a payment. The answer must be the plain text OK.
  if (p === '/api/pay/euplatesc/ipn' && m === 'POST') {
    let r;
    try { r = ep.verify(await readForm(req), store.settings().pay, store.secrets().payKey); }
    catch (e) { console.error('EuPlatesc IPN respins:', e.message); return text(res, 400, 'INVALID'); }
    await applyPayment(r);
    return text(res, 200, 'OK');
  }
  // EuPlatesc → the customer's browser, after the payment page
  if (p === '/api/pay/euplatesc/return' && (m === 'POST' || m === 'GET')) {
    let r;
    try { r = ep.verify(m === 'POST' ? await readForm(req) : Object.fromEntries(url.searchParams), store.settings().pay, store.secrets().payKey); }
    catch (e) { return redirect(res, '/magazin.html?plata=necunoscut'); }
    const out = await applyPayment(r);
    if (out.test) return redirect(res, '/admin/#plati');
    if (!out.order) return redirect(res, '/magazin.html?plata=necunoscut');
    return redirect(res, '/magazin.html?plata=' + (out.order.paid ? 'ok' : 'esuata') + '&comanda=' + out.order.number + '&t=' + out.order.payToken);
  }

  if (p === '/api/consult' && m === 'POST') {
    try { return ok(res, await saveConsult(await readBody(req, 20e6), siteOrigin(req))); }
    catch (e) { return fail(res, 400, e.message === 'too_large' ? 'Pozele sunt prea mari.' : e.message); }
  }

  // login
  if (p === '/api/admin/status' && m === 'GET') return ok(res, { loggedIn: auth.isAdmin(req), needsSetup: !auth.passwordHash() });
  if (p === '/api/admin/login' && m === 'POST') {
    if (auth.tooMany(ip(req))) return fail(res, 429, 'Prea multe încercări. Încearcă din nou peste 15 minute.');
    const b = await readBody(req);
    let hash = auth.passwordHash();
    if (!hash) {
      if (typeof b.password !== 'string' || b.password.length < 8) return fail(res, 400, 'Alege o parolă de minim 8 caractere.');
      auth.setPassword(b.password); hash = auth.passwordHash();
    }
    if (!auth.checkPassword(b.password, hash)) { auth.failed(ip(req)); return fail(res, 401, 'Parolă greșită.'); }
    auth.succeeded(ip(req));
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(req) });
  }
  if (p === '/api/admin/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });

  // everything below needs the admin session
  if (!p.startsWith('/api/admin/')) return fail(res, 404, 'Nu există.');
  if (!auth.isAdmin(req)) return fail(res, 401, 'Trebuie să te autentifici.');
  if (m !== 'GET' && req.headers['x-fr-admin'] !== '1') return fail(res, 403, 'Cerere respinsă.');

  if (p === '/api/admin/password' && m === 'POST') {
    const b = await readBody(req);
    if (!auth.checkPassword(b.current, auth.passwordHash())) return fail(res, 400, 'Parola actuală este greșită.');
    if (typeof b.next !== 'string' || b.next.length < 8) return fail(res, 400, 'Parola nouă trebuie să aibă minim 8 caractere.');
    auth.setPassword(b.next);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(req) });
  }

  // dashboard
  if (p === '/api/admin/summary' && m === 'GET') {
    const orders = store.read('orders', []), products = store.products(), s = store.settings();
    const since = Date.now() - 30 * 864e5;
    const recent = orders.filter((o) => Date.parse(o.createdAt) > since && o.status !== 'anulata' && !awaitingPay(o));
    return ok(res, {
      newOrders: orders.filter((o) => o.status === 'noua' && !awaitingPay(o)).length,
      unpaidCard: orders.filter((o) => o.status === 'noua' && awaitingPay(o)).length,
      pay: { enabled: !!s.pay.enabled, ready: payReady(s) },
      mail: { enabled: !!s.mail.enabled, ready: mailer.configured(s.mail, store.secrets().mailPass), lastError: s.mail.lastError },
      newConsults: store.read('consultations', []).filter((c) => c.status === 'noua').length,
      parcels: orders.filter((o) => (o.status === 'noua' || o.status === 'confirmata') && !awaitingPay(o)).length,
      orders30: recent.length,
      revenue30: money(recent.reduce((a, o) => a + o.total, 0)),
      salon: periodStats(store.read('sales', []).filter((x) => !x.cancelled)),
      online: periodStats(orders.filter((o) => o.status !== 'anulata' && !awaitingPay(o))),
      lowStock: products.filter((x) => x.active && x.stock != null && x.stock <= 3).map((x) => ({ name: x.name, size: x.size, stock: x.stock })),
      smartbill: { configured: !!(s.smartbill.email && s.smartbill.cif && store.secrets().smartbillToken), lastSync: s.smartbill.lastSync, lastSyncError: s.smartbill.lastSyncError }
    });
  }

  // products
  if (p === '/api/admin/products' && m === 'GET') return ok(res, store.products().sort((a, b) => (a.order || 0) - (b.order || 0)));
  if (p === '/api/admin/products' && m === 'POST') {
    try {
      const b = await readBody(req), list = store.products();
      const prod = cleanProduct(b, null); prod.order = list.reduce((mx, x) => Math.max(mx, x.order || 0), 0) + 1;
      if (prod.stock === undefined) prod.stock = null;
      list.push(prod); store.write('products', list); return ok(res, prod);
    } catch (e) { return fail(res, 400, e.message); }
  }
  const pm = p.match(/^\/api\/admin\/products\/([\w-]+)$/);
  if (pm && m === 'PUT') {
    try {
      const list = store.products(), i = list.findIndex((x) => x.id === pm[1]);
      if (i < 0) return fail(res, 404, 'Produsul nu există.');
      list[i] = cleanProduct(await readBody(req), list[i]); store.write('products', list); return ok(res, list[i]);
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (pm && m === 'DELETE') {
    store.write('products', store.products().filter((x) => x.id !== pm[1])); return ok(res, { ok: true });
  }
  if (p === '/api/admin/products/order' && m === 'POST') {
    const ids = (await readBody(req)).ids || [];
    store.write('products', store.products().map((x) => ({ ...x, order: ids.indexOf(x.id) < 0 ? 999 : ids.indexOf(x.id) + 1 })));
    return ok(res, { ok: true });
  }

  // categories: add / rename / reorder / delete
  if (p === '/api/admin/categories' && m === 'GET') return ok(res, store.categories());
  if (p === '/api/admin/categories' && m === 'PUT') {
    const b = await readBody(req), list = Array.isArray(b.categories) ? b.categories.slice(0, 50) : [];
    const used = new Set(store.products().map((x) => x.category));
    const out = [], seen = new Set();
    list.forEach((c, i) => {
      const name = str(c.name, 60); if (!name) return;
      let id = /^[a-z0-9-]{1,40}$/.test(c.id || '') ? c.id : name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'cat';
      while (seen.has(id)) id += '-2';
      seen.add(id); out.push({ id, name, order: i + 1 });
    });
    if (!out.length) return fail(res, 400, 'Trebuie să existe cel puțin o categorie.');
    const missing = [...used].filter((id) => !seen.has(id));
    if (missing.length) {
      const old = store.categories().filter((c) => missing.includes(c.id)).map((c) => c.name).join(', ');
      return fail(res, 400, `Nu poți șterge o categorie care are produse (${old}). Mută întâi produsele în altă categorie.`);
    }
    store.write('categories', out); return ok(res, out);
  }
  const dup = p.match(/^\/api\/admin\/products\/([\w-]+)\/duplicate$/);
  if (dup && m === 'POST') {
    const list = store.products(), src = list.find((x) => x.id === dup[1]);
    if (!src) return fail(res, 404, 'Produsul nu există.');
    const copy = { ...src, id: src.id.replace(/-[0-9a-f]{4}$/, '') + '-' + crypto.randomBytes(2).toString('hex'), name: src.name + ' (copie)', stock: src.stock == null ? null : 0, active: false, order: list.reduce((mx, x) => Math.max(mx, x.order || 0), 0) + 1 };
    list.push(copy); store.write('products', list); return ok(res, copy);
  }

  // image upload (base64 from the browser)
  if (p === '/api/admin/upload' && m === 'POST') {
    try {
      const b = await readBody(req, 8e6);
      const mt = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.data || '');
      if (!mt) return fail(res, 400, 'Sunt acceptate doar imagini JPG, PNG sau WEBP.');
      const buf = Buffer.from(mt[2], 'base64');
      if (buf.length > 5e6) return fail(res, 400, 'Imaginea este prea mare (max. 5 MB).');
      const name = Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + '.' + mt[1].replace('jpeg', 'jpg');
      fs.writeFileSync(path.join(UPLOADS, name), buf);
      return ok(res, { path: 'uploads/' + name });
    } catch (e) { return fail(res, 400, 'Încărcarea a eșuat.'); }
  }

  // stock movements (manual in / out)
  const sm = p.match(/^\/api\/admin\/products\/([\w-]+)\/stock$/);
  if (sm && m === 'POST') {
    const b = await readBody(req), list = store.products(), prod = list.find((x) => x.id === sm[1]);
    if (!prod) return fail(res, 404, 'Produsul nu există.');
    const delta = Math.round(num(b.delta) || 0);
    if (!delta) return fail(res, 400, 'Scrie câte bucăți adaugi sau scazi.');
    const before = prod.stock == null ? 0 : prod.stock;
    prod.stock = Math.max(0, before + delta);
    store.write('products', list);
    const moves = store.read('stock-moves', []);
    moves.push({ at: new Date().toISOString(), productId: prod.id, name: prod.name + (prod.size ? ' ' + prod.size : ''), delta, before, after: prod.stock, reason: str(b.reason, 120) || (delta > 0 ? 'Intrare marfă' : 'Ieșire') });
    store.write('stock-moves', moves.slice(-2000));
    return ok(res, prod);
  }
  if (p === '/api/admin/stock-moves' && m === 'GET') return ok(res, store.read('stock-moves', []).slice(-200).reverse());

  // sales in the salon
  if (p === '/api/admin/sales' && m === 'GET') return ok(res, store.read('sales', []).slice().reverse().slice(0, 500));
  if (p === '/api/admin/sales' && m === 'POST') {
    const b = await readBody(req), list = store.products(), items = [];
    for (const line of Array.isArray(b.items) ? b.items.slice(0, 50) : []) {
      const prod = list.find((x) => x.id === line.id);
      const qty = Math.max(1, Math.min(500, Math.round(num(line.qty) || 0)));
      if (!prod) return fail(res, 400, 'Un produs nu mai există.');
      if (prod.stock != null && prod.stock < qty) return fail(res, 400, `Stoc insuficient pentru „${prod.name}” (în stoc: ${prod.stock}).`);
      const price = num(line.price); 
      items.push({ id: prod.id, name: prod.name, size: prod.size, qty, price: price != null && price >= 0 ? money(price) : prod.price });
    }
    if (!items.length) return fail(res, 400, 'Alege cel puțin un produs.');
    for (const it of items) { const prod = list.find((x) => x.id === it.id); if (prod.stock != null) prod.stock = Math.max(0, prod.stock - it.qty); }
    store.write('products', list);
    const sales = store.read('sales', []);
    const sale = { id: crypto.randomUUID(), number: sales.reduce((mx, x) => Math.max(mx, x.number || 0), 0) + 1, createdAt: new Date().toISOString(),
      items, total: money(items.reduce((a, i) => a + i.price * i.qty, 0)), payment: ['cash', 'card', 'transfer'].includes(b.payment) ? b.payment : 'cash',
      client: str(b.client, 120), note: str(b.note, 300), cancelled: false };
    sales.push(sale); store.write('sales', sales);
    if (b.invoice && store.secrets().smartbillToken) {
      try {
        const inv = await sb.invoice(store.settings().smartbill, store.secrets().smartbillToken, {
          number: 'S' + sale.number, shipping: 0,
          customer: { name: sale.client || 'Client salon', address: '-', city: 'București', county: 'București', email: '', phone: '' },
          items: items.map((it) => ({ ...it, smartbillCode: (list.find((x) => x.id === it.id) || {}).smartbillCode || '' }))
        });
        sale.invoice = { ...inv, issuedAt: new Date().toISOString() };
      } catch (e) { sale.invoiceError = e.message; }
      store.write('sales', sales.map((x) => (x.id === sale.id ? sale : x)));
    }
    return ok(res, sale);
  }
  const sl = p.match(/^\/api\/admin\/sales\/([\w-]+)\/cancel$/);
  if (sl && m === 'POST') {
    const sales = store.read('sales', []), sale = sales.find((x) => x.id === sl[1]);
    if (!sale || sale.cancelled) return fail(res, 400, 'Vânzarea nu există sau e deja anulată.');
    const list = store.products();
    for (const it of sale.items) { const prod = list.find((x) => x.id === it.id); if (prod && prod.stock != null) prod.stock += it.qty; }
    store.write('products', list);
    sale.cancelled = true; sale.cancelledAt = new Date().toISOString();
    store.write('sales', sales); return ok(res, sale);
  }

  // site texts
  if (p === '/api/admin/content' && m === 'GET') return ok(res, store.read('content', {}));
  if (p === '/api/admin/content' && m === 'PUT') {
    const b = await readBody(req), out = {};
    for (const [k, v] of Object.entries(b || {})) if (/^[\w.-]{1,60}$/.test(k) && String(v).trim() !== '') out[k] = cleanText(v);
    store.write('content', out); return ok(res, out);
  }

  // orders
  if (p === '/api/admin/orders' && m === 'GET') return ok(res, store.read('orders', []).slice().reverse());
  const om = p.match(/^\/api\/admin\/orders\/([\w-]+)(\/invoice|\/invoice\.pdf)?$/);
  if (om && !om[2] && m === 'PUT') {
    const b = await readBody(req), orders = store.read('orders', []), o = orders.find((x) => x.id === om[1]);
    if (!o) return fail(res, 404, 'Comanda nu există.');
    if (['noua', 'confirmata', 'expediata', 'livrata', 'anulata'].includes(b.status)) {
      if (b.status === 'anulata' && o.status !== 'anulata' && !o.stockRestored) {
        moveStock(o, 1);
        o.stockRestored = true;
      }
      if (b.status === 'expediata' && o.status !== 'expediata') { o.shippedAt = o.shippedAt || new Date().toISOString(); if (b.awb !== undefined) o.awb = str(b.awb, 60); mailShipped(o); }
      o.status = b.status;
    }
    // "plătită" set by hand (e.g. the money came by bank transfer)
    let paidNow = false;
    if (b.paid === true && !o.paid && o.payment === 'card' && o.status !== 'anulata') { o.paid = true; o.paidAt = new Date().toISOString(); o.pay = { ...(o.pay || {}), status: 'platita', manual: true, at: o.paidAt }; paidNow = true; }
    if (b.awb !== undefined) o.awb = str(b.awb, 60);
    if (b.adminNote !== undefined) o.adminNote = str(b.adminNote, 1000);
    store.write('orders', orders);
    if (paidNow) await confirmOrder(o);
    return ok(res, o);
  }
  if (om && om[2] === '/invoice' && m === 'POST') {
    const orders = store.read('orders', []), o = orders.find((x) => x.id === om[1]);
    if (!o) return fail(res, 404, 'Comanda nu există.');
    if (o.invoice) return fail(res, 400, 'Comanda are deja factură.');
    try { await issueInvoice(o); store.write('orders', orders); return ok(res, o); }
    catch (e) { o.invoiceError = e.message; store.write('orders', orders); return fail(res, 400, e.message); }
  }
  if (om && om[2] === '/invoice.pdf' && m === 'GET') {
    const o = store.read('orders', []).find((x) => x.id === om[1]);
    if (!o || !o.invoice) return fail(res, 404, 'Comanda nu are factură.');
    try {
      const pdf = await sb.invoicePdf(store.settings().smartbill, store.secrets().smartbillToken, o.invoice.series, o.invoice.number);
      return send(res, 200, pdf, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="factura-${o.invoice.series}${o.invoice.number}.pdf"` });
    } catch (e) { return fail(res, 400, e.message); }
  }

  // client files (consultations)
  if (p === '/api/admin/consults' && m === 'GET') return ok(res, store.read('consultations', []).slice().reverse());
  const cm = p.match(/^\/api\/admin\/consults\/([\w-]+)$/);
  if (cm && m === 'PUT') {
    const b = await readBody(req), list = store.read('consultations', []), c = list.find((x) => x.id === cm[1]);
    if (!c) return fail(res, 404, 'Fișa nu există.');
    if (['noua', 'contactata', 'programata', 'finalizata'].includes(b.status)) c.status = b.status;
    if (b.adminNote !== undefined) c.adminNote = str(b.adminNote, 3000);
    if (b.appointment !== undefined) c.appointment = str(b.appointment, 60);
    store.write('consultations', list); return ok(res, c);
  }
  if (cm && m === 'DELETE') {
    const list = store.read('consultations', []), c = list.find((x) => x.id === cm[1]);
    if (c) for (const f of Object.values(c.photos || {})) { try { fs.unlinkSync(path.join(PRIVATE, f)); } catch (e) {} }
    store.write('consultations', list.filter((x) => x.id !== cm[1])); return ok(res, { ok: true });
  }
  const ph = p.match(/^\/api\/admin\/consult-photo\/([\w-]+\.(jpg|png|webp))$/);
  if (ph && m === 'GET') {
    const full = path.join(PRIVATE, ph[1]);
    if (!fs.existsSync(full)) return fail(res, 404, 'Poza nu există.');
    return send(res, 200, fs.readFileSync(full), { 'Content-Type': TYPES['.' + ph[2]], 'Cache-Control': 'private, max-age=3600' });
  }

  // parcels to prepare (courier)
  if (p === '/api/admin/parcels' && m === 'GET') {
    const s = store.settings(), orders = store.read('orders', []);
    const [ch, cm] = String(s.courier.cutoff || '14:00').split(':').map(Number);
    const nextWork = (d) => { const x = new Date(d); do { x.setDate(x.getDate() + 1); } while (x.getDay() === 0); return x; };
    const shipDay = (o) => {
      const d = new Date(o.createdAt), cut = new Date(d); cut.setHours(ch || 14, cm || 0, 0, 0);
      const day = d <= cut && d.getDay() !== 0 ? d : nextWork(d);
      return day.toISOString().slice(0, 10);
    };
    const open = orders.filter((o) => (o.status === 'noua' || o.status === 'confirmata') && !awaitingPay(o)).map((o) => ({ ...o, shipDay: shipDay(o) }));
    const today = new Date().toISOString().slice(0, 10);
    const shippedToday = orders.filter((o) => o.status === 'expediata' && (o.shippedAt || '').slice(0, 10) === today);
    return ok(res, { open, shippedToday, provider: s.courier.provider, configured: !!(store.secrets().courier || {}).user || s.courier.provider === 'manual' });
  }
  const aw = p.match(/^\/api\/admin\/orders\/([\w-]+)\/(awb|label\.pdf|shipped|track)$/);
  if (aw) {
    const orders = store.read('orders', []), o = orders.find((x) => x.id === aw[1]);
    if (!o) return fail(res, 404, 'Comanda nu există.');
    const s = store.settings(), sec = store.secrets().courier || {};
    try {
      if (aw[2] === 'awb' && m === 'POST') {
        if (o.awb) return fail(res, 400, 'Comanda are deja AWB: ' + o.awb);
        const r = await courier.get(s.courier.provider).createAwb(s.courier, sec, o);
        o.awb = r.awb; o.awbCourier = s.courier.provider; o.awbAt = new Date().toISOString(); o.awbCost = r.cost || null;
        if (o.status === 'noua') o.status = 'confirmata';
        store.write('orders', orders); return ok(res, o);
      }
      if (aw[2] === 'label.pdf' && m === 'GET') {
        if (!o.awb) return fail(res, 400, 'Comanda nu are AWB.');
        const pdf = await courier.get(o.awbCourier || s.courier.provider).label(s.courier, sec, o.awb);
        return send(res, 200, pdf, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="AWB-${o.awb}.pdf"` });
      }
      if (aw[2] === 'track' && m === 'GET') {
        if (!o.awb) return fail(res, 400, 'Comanda nu are AWB.');
        return ok(res, { status: await courier.get(o.awbCourier || s.courier.provider).track(s.courier, sec, o.awb) });
      }
      if (aw[2] === 'shipped' && m === 'POST') {
        o.status = 'expediata'; o.shippedAt = new Date().toISOString();
        mailShipped(o);
        store.write('orders', orders); return ok(res, o);
      }
    } catch (e) { return fail(res, 400, e.message); }
    return fail(res, 405, 'Metodă nepermisă.');
  }
  if (p === '/api/admin/courier/test' && m === 'POST') {
    try { const s = store.settings(); return ok(res, { message: await courier.get(s.courier.provider).test(s.courier, store.secrets().courier || {}) }); }
    catch (e) { return fail(res, 400, e.message); }
  }
  if (p === '/api/admin/courier/options' && m === 'GET') {
    try {
      const s = store.settings(), c = courier.get(s.courier.provider);
      if (!c.options) return ok(res, { pickupPoints: [], services: [] });
      return ok(res, await c.options(s.courier, store.secrets().courier || {}));
    } catch (e) { return fail(res, 400, e.message); }
  }

  // settings + SmartBill
  const settingsOut = (s) => {
    const sec = store.secrets();
    return { ...s, smartbillTokenSet: !!sec.smartbillToken, courierUserSet: !!(sec.courier || {}).user, payKeySet: ep.validKey(sec.payKey), payReady: payReady(s),
      mailPassSet: !!sec.mailPass, mailReady: mailer.configured(s.mail, sec.mailPass), siteUrl: siteOrigin(req) };
  };
  if (p === '/api/admin/settings' && m === 'GET') return ok(res, settingsOut(store.settings()));
  if (p === '/api/admin/settings' && m === 'PUT') {
    const b = await readBody(req), s = store.settings(), x = b.smartbill || {};
    // each form saves only its own part
    if ('shopEnabled' in b) {
      s.shopEnabled = !!b.shopEnabled; s.codEnabled = b.codEnabled !== false;
      s.shippingCost = Math.max(0, num(b.shippingCost) || 0); s.freeShippingFrom = Math.max(0, num(b.freeShippingFrom) || 0);
      s.orderEmail = str(b.orderEmail, 120);
    }
    if (b.smartbill) Object.assign(s.smartbill, {
      email: str(x.email, 120), cif: str(x.cif, 20).toUpperCase().replace(/\s/g, ''), seriesName: str(x.seriesName, 20),
      warehouseName: str(x.warehouseName, 80), vatName: str(x.vatName, 40) || 'Normala', vatPercent: num(x.vatPercent) ?? 21,
      useStock: !!x.useStock, autoInvoice: !!x.autoInvoice, sendEmail: !!x.sendEmail,
      syncMinutes: Math.max(0, Math.min(1440, Math.round(num(x.syncMinutes) || 0)))
    });
    if (b.courier) {
      const c = b.courier;
      s.courier = { ...s.courier,
        provider: ['sameday', 'fan', 'cargus', 'manual'].includes(c.provider) ? c.provider : s.courier.provider,
        demo: !!c.demo, pickupPoint: str(c.pickupPoint, 40), service: str(c.service, 40), clientId: str(c.clientId, 40),
        kgPerItem: Math.max(0.1, Math.min(30, num(c.kgPerItem) || 0.6)), cutoff: /^\d{1,2}:\d{2}$/.test(c.cutoff || '') ? c.cutoff : s.courier.cutoff };
    }
    if (b.courierSecrets && (b.courierSecrets.user || b.courierSecrets.pass || b.courierSecrets.key)) {
      const sec = store.secrets(), old = sec.courier || {};
      sec.courier = { user: str(b.courierSecrets.user, 120) || old.user, pass: b.courierSecrets.pass ? String(b.courierSecrets.pass).slice(0, 200) : old.pass, key: b.courierSecrets.key ? String(b.courierSecrets.key).slice(0, 200) : old.key };
      store.saveSecrets(sec);
    }
    if (b.pay) {
      const y = b.pay;
      if (typeof b.payKey === 'string' && b.payKey.trim()) {
        const key = b.payKey.trim().replace(/\s+/g, '');
        if (!ep.validKey(key)) return fail(res, 400, 'Cheia EuPlătesc nu pare corectă: trebuie să conțină doar cifre și literele A–F (de obicei 32 de caractere).');
        const sec = store.secrets(); sec.payKey = key; store.saveSecrets(sec);
      }
      Object.assign(s.pay, { enabled: !!y.enabled, mid: str(y.mid, 60).replace(/\s+/g, ''), wallets: !!y.wallets,
        unpaidHours: Math.max(1, Math.min(72, Math.round(num(y.unpaidHours) || 3))) });
    }
    if (b.mail) {
      const y = b.mail, from = str(y.from, 120), port = Math.round(num(y.port) || 465);
      if (from && !mailer.isEmail(from)) return fail(res, 400, 'Adresa expeditorului nu pare corectă.');
      if (![465, 587, 2525].includes(port)) return fail(res, 400, 'Portul trebuie să fie 465 sau 587.');
      Object.assign(s.mail, { enabled: !!y.enabled, host: str(y.host, 120).replace(/^\w+:\/\//, '').replace(/[^a-z0-9.-]/gi, ''), port, user: str(y.user, 120), from,
        fromName: str(y.fromName, 80) || 'Florin Roșca Luxury Hair', customerConfirm: !!y.customerConfirm, customerShipped: !!y.customerShipped, salonNotify: !!y.salonNotify });
      if (typeof b.mailPass === 'string' && b.mailPass) { const sec = store.secrets(); sec.mailPass = b.mailPass.slice(0, 200); store.saveSecrets(sec); }
      if ('orderEmail' in y) { const to = str(y.orderEmail, 120); if (to && !mailer.isEmail(to)) return fail(res, 400, 'Adresa pentru comenzi nu pare corectă.'); s.orderEmail = to; }
    }
    store.write('settings', s);
    if (typeof b.smartbillToken === 'string' && b.smartbillToken.trim()) {
      const sec = store.secrets(); sec.smartbillToken = b.smartbillToken.trim().slice(0, 200); store.saveSecrets(sec);
    }
    return ok(res, settingsOut(s));
  }
  // a 1 leu payment on the EuPlatesc page, to check the Merchant ID and the key
  if (p === '/api/admin/pay/test' && m === 'POST') {
    try {
      const base = siteOrigin(req);
      return ok(res, ep.request(store.settings().pay, store.secrets().payKey, {
        amount: 1, invoiceId: 'T' + Date.now(), description: 'Plata de test Florin Rosca', customer: { name: 'Test Panou' },
        urls: base ? { silent: base + '/api/pay/euplatesc/ipn', back: base + '/api/pay/euplatesc/return', site: base + '/admin/#plati' } : null
      }));
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (p === '/api/admin/mail/test' && m === 'POST') {
    const s = store.settings(), to = str((await readBody(req)).to, 120) || salonTo(s);
    try {
      await mailer.send(s.mail, store.secrets().mailPass, mailer.templates.test(to));
      const x = store.settings(); x.mail.lastOk = new Date().toISOString(); x.mail.lastError = null; store.write('settings', x);
      return ok(res, { to });
    } catch (e) { return fail(res, 400, e.message); }
  }
  if (p === '/api/admin/smartbill/test' && m === 'POST') {
    try { return ok(res, { series: await sb.test(store.settings().smartbill, store.secrets().smartbillToken) }); }
    catch (e) { return fail(res, 400, e.message); }
  }
  if (p === '/api/admin/smartbill/sync' && m === 'POST') {
    try { return ok(res, await syncStock()); } catch (e) { return fail(res, 400, e.message); }
  }

  return fail(res, 404, 'Nu există.');
}

/* ---------- static files ---------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  if (BLOCKED.test(rel)) return send(res, 404, 'Nu există.', { 'Content-Type': 'text/plain; charset=utf-8' });
  const base = rel.startsWith('/uploads/') ? store.DATA_DIR : ROOT;
  const full = path.normalize(path.join(base, rel));
  if (!full.startsWith(base + path.sep)) return send(res, 400, 'Cerere invalidă', { 'Content-Type': 'text/plain' });
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Pagina nu există.', { 'Content-Type': 'text/plain; charset=utf-8' });
    const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': /\.(html)$/.test(full) || rel.startsWith('/admin/') ? 'no-cache' : 'public, max-age=86400'
    };
    if (rel.startsWith('/admin/')) { headers['X-Frame-Options'] = 'DENY'; headers['X-Robots-Tag'] = 'noindex'; }
    // video/audio need byte ranges for seeking on iOS
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range && /^(video|audio)\//.test(type)) {
      const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Metodă nepermisă.');
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(res, e.message === 'too_large' ? 413 : 500, e.message === 'bad_json' ? 'Date invalide.' : 'Eroare internă.');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Florin Roșca: http://localhost:${PORT}  ·  admin: http://localhost:${PORT}/admin/`));
}
module.exports = { server };
