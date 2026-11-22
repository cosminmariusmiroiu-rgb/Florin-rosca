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
  p.category = ['repair', 'anti', 'kit', 'salon'].includes(input.category) ? input.category : 'repair';
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

async function placeOrder(body) {
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
    status: 'noua', payment: 'ramburs', customer, items, subtotal, shipping, total: money(subtotal + shipping),
    invoice: null, invoiceError: null
  };
  // reserve stock locally until the next SmartBill sync
  store.write('products', products.map((p) => {
    const it = items.find((i) => i.id === p.id);
    return it && p.stock != null ? { ...p, stock: Math.max(0, p.stock - it.qty) } : p;
  }));
  orders.push(order);
  store.write('orders', orders);

  if (settings.smartbill.autoInvoice && store.secrets().smartbillToken) {
    try { await issueInvoice(order); } catch (e) { order.invoiceError = e.message; }
    store.write('orders', store.read('orders', []).map((o) => (o.id === order.id ? order : o)));
  }
  return { number: order.number, total: order.total };
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

async function saveConsult(body) {
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
  return { number: rec.number, evaluation: rec.evaluation };
}

/* ---------- routes ---------- */
async function api(req, res, url) {
  const p = url.pathname, m = req.method;

  // public
  if (p === '/api/products' && m === 'GET') return ok(res, publicProducts());
  if (p === '/api/content' && m === 'GET') return ok(res, store.read('content', {}));
  if (p === '/api/shop' && m === 'GET') {
    const s = store.settings();
    return ok(res, { enabled: s.shopEnabled, shippingCost: s.shippingCost, freeShippingFrom: s.freeShippingFrom, cod: s.codEnabled });
  }
  if (p === '/api/order' && m === 'POST') {
    try { return ok(res, await placeOrder(await readBody(req))); }
    catch (e) { return fail(res, 400, e.message); }
  }

  if (p === '/api/consult' && m === 'POST') {
    try { return ok(res, await saveConsult(await readBody(req, 20e6))); }
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
    const recent = orders.filter((o) => Date.parse(o.createdAt) > since && o.status !== 'anulata');
    return ok(res, {
      newOrders: orders.filter((o) => o.status === 'noua').length,
      newConsults: store.read('consultations', []).filter((c) => c.status === 'noua').length,
      orders30: recent.length,
      revenue30: money(recent.reduce((a, o) => a + o.total, 0)),
      salon: periodStats(store.read('sales', []).filter((x) => !x.cancelled)),
      online: periodStats(orders.filter((o) => o.status !== 'anulata')),
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
    if (['noua', 'confirmata', 'expediata', 'livrata', 'anulata'].includes(b.status)) o.status = b.status;
    if (b.awb !== undefined) o.awb = str(b.awb, 60);
    if (b.adminNote !== undefined) o.adminNote = str(b.adminNote, 1000);
    store.write('orders', orders); return ok(res, o);
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

  // settings + SmartBill
  if (p === '/api/admin/settings' && m === 'GET') {
    return ok(res, { ...store.settings(), smartbillTokenSet: !!store.secrets().smartbillToken });
  }
  if (p === '/api/admin/settings' && m === 'PUT') {
    const b = await readBody(req), s = store.settings(), x = b.smartbill || {};
    s.shopEnabled = !!b.shopEnabled; s.codEnabled = b.codEnabled !== false;
    s.shippingCost = Math.max(0, num(b.shippingCost) || 0); s.freeShippingFrom = Math.max(0, num(b.freeShippingFrom) || 0);
    s.orderEmail = str(b.orderEmail, 120);
    Object.assign(s.smartbill, {
      email: str(x.email, 120), cif: str(x.cif, 20).toUpperCase().replace(/\s/g, ''), seriesName: str(x.seriesName, 20),
      warehouseName: str(x.warehouseName, 80), vatName: str(x.vatName, 40) || 'Normala', vatPercent: num(x.vatPercent) ?? 21,
      useStock: !!x.useStock, autoInvoice: !!x.autoInvoice, sendEmail: !!x.sendEmail,
      syncMinutes: Math.max(0, Math.min(1440, Math.round(num(x.syncMinutes) || 0)))
    });
    store.write('settings', s);
    if (typeof b.smartbillToken === 'string' && b.smartbillToken.trim()) {
      const sec = store.secrets(); sec.smartbillToken = b.smartbillToken.trim().slice(0, 200); store.saveSecrets(sec);
    }
    return ok(res, { ...s, smartbillTokenSet: !!store.secrets().smartbillToken });
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
