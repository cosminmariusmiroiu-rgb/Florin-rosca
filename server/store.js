'use strict';
// Simple JSON file storage (atomic writes). All data lives in DATA_DIR.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const file = (name) => path.join(DATA_DIR, name + '.json');

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); }
  catch (e) { return typeof fallback === 'function' ? fallback() : fallback; }
}

function write(name, value) {
  const tmp = file(name) + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file(name));
  return value;
}

// the products' codes in SmartBill (nomenclature + stock): the same code on the site and in SmartBill links the two
const SMARTBILL_CODES = {
  'spray-reparator-luxury-repair-200-ml': 'LR-SPRAY-200',
  'masca-reparatoare-luxury-repair-1000-ml': 'LR-MASCA-1000',
  'sampon-luxury-repair-1000-ml': 'LR-SAMPON-1000',
  'spray-mineral-luxury-repair-150-ml': 'LR-SPRAYMIN-150',
  'fiole-reparatoare-luxury-repair-12-x-10-ml': 'LR-FIOLE-12X10',
  'kit-profesional-luxury-repair-5-pasi': 'LR-KIT-5PASI',
  'spuma-neutralizanta-luxury-repair-anti-yellow-200-ml': 'AY-SPUMA-200',
  'masca-neutralizanta-luxury-repair-anti-yellow-1000-ml': 'AY-MASCA-1000',
  'sampon-neutralizant-luxury-repair-anti-yellow-1000-ml': 'AY-SAMPON-1000',
  'set-luxury-repair-anti-yellow-sampon-masca-2x1000-ml': 'AY-SET-2X1000',
  'kit-luxury-repair-anti-yellow-3-pasi-2200-ml': 'AY-KIT-3PASI',
  'kit-luxury-repair-hair-botox-argan-oil-250-ml': 'LR-KIT-BOTOX-250'
};
// products that have no SmartBill code yet receive the one above (a code set from the panel is never changed)
function defaultCodes() {
  const list = read('products', null);
  if (!Array.isArray(list)) return;
  let changed = false;
  for (const p of list) if (p && !p.smartbillCode && SMARTBILL_CODES[p.id]) { p.smartbillCode = SMARTBILL_CODES[p.id]; changed = true; }
  if (changed) write('products', list);
}

// the salon's services (labour: balayage, colour, cut), with the codes they have in SmartBill. They are sold only in the salon,
// have no stock and get a fiscal receipt like the products. Added once; afterwards they are edited from the panel like any product.
const SERVICES = [
  { code: '1', name: 'Servicii hair', price: 1200 },
  { code: '2', name: 'Balayage mediu + tratament', price: 1500 },
  { code: '3', name: 'Balayage păr lung + tratament', price: 1500 },
  { code: '4', name: 'Balayage păr lung + corecție + tratament', price: 2000 },
  { code: '5', name: 'Balayage păr lung din negru', price: 2500 },
  { code: '6', name: 'Decolorat rădăcină + vopsit lungime', price: 900 },
  { code: '7', name: 'Tratament + protecție + fiole', price: 400 },
  { code: '8', name: 'Tratament păr lung + fiole', price: 500 },
  { code: '9', name: 'Vopsit păr mediu (pachet)', price: 450 },
  { code: '10', name: 'Vopsit păr lung (pachet)', price: 550 },
  { code: '11', name: 'Vopsit păr foarte lung (pachet)', price: 700 },
  { code: '12', name: 'Pachet tuns SP + CF + TR', price: 250 },
  { code: '13', name: 'Pachet tuns SP + CF + TR, mediu', price: 200 }
];
function defaultServices() {
  const done = read('migrations', {});
  if (done.services1) return;
  const list = read('products', null);
  if (!Array.isArray(list)) return;            // fresh install: products() seeds first, the services come at the next start
  const cats = read('categories', null) || DEFAULT_CATEGORIES.slice();
  if (!cats.some((c) => c.id === 'servicii')) { cats.push({ id: 'servicii', name: 'Servicii (manoperă)', order: 90 }); write('categories', cats); }
  for (const v of SERVICES) {
    const id = 'serviciu-' + v.code;
    if (list.some((p) => p.id === id)) continue;
    list.push({ id, name: v.name, size: '', category: 'servicii', price: v.price, oldPrice: null, description: '', image: '', alt: v.name,
      active: false, salonOnly: true, service: true, stock: null, smartbillCode: v.code, order: 900 + Number(v.code) });
  }
  write('products', list);
  write('migrations', { ...done, services1: new Date().toISOString() });
}

// first run: products come from the seed extracted from the old shop
function products() {
  return read('products', () => {
    let seed = read('products.seed', null);
    if (!seed) { try { seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.seed.json'), 'utf8')); } catch (e) { seed = []; } }
    write('products', seed);
    return seed;
  });
}

const DEFAULT_SETTINGS = {
  shopEnabled: true,          // orders can be placed on the site
  shippingCost: 25,           // lei
  freeShippingFrom: 300,      // lei, 0 = never
  codEnabled: true,           // ramburs (plata la livrare)
  orderEmail: '',             // where the salon is notified about new orders and consultation forms
  pay: {                      // EuPlatesc.ro: plata cu cardul (cheia stă în secrets)
    enabled: false,           // clienții pot alege „card online” în coș
    mid: '',                  // Merchant ID
    wallets: false,           // Apple Pay / Google Pay sunt active pe contul EuPlatesc (apar în textul de la plată)
    unpaidHours: 3,           // o comandă cu cardul rămasă neplătită se anulează singură după atâtea ore (stocul se pune înapoi)
    lastTest: null            // rezultatul ultimei plăți de test
  },
  mail: {                     // e-mailuri automate prin SMTP (parola stă în secrets)
    enabled: false,
    host: '',                 // ex. mail.florinrosca.ro, smtp.gmail.com
    port: 465,                // 465 (SSL) sau 587 (STARTTLS)
    user: '',                 // de obicei adresa de e-mail
    from: '',                 // adresa expeditorului
    fromName: 'Florin Roșca Luxury Hair',
    customerConfirm: true,    // confirmare de comandă către client
    customerShipped: true,    // anunț „coletul a plecat” către client
    salonNotify: true,        // comandă nouă / fișă nouă către salon (orderEmail)
    lastOk: null,
    lastError: null
  },
  chat: {                     // asistentul virtual („Florin” pe site)
    callback: true            // vizitatorii pot lăsa numele și telefonul ca să fie sunați
  },
  courier: {
    provider: 'sameday',      // sameday | fan | cargus | manual
    demo: false,              // Sameday: mediul de test
    pickupPoint: '',          // punctul de ridicare (Sameday) / locația (Cargus)
    service: '',              // serviciul de livrare
    clientId: '',             // FAN Courier: clientId
    kgPerItem: 0.6,           // greutate estimată pe produs
    cutoff: '14:00'           // comenzile de după această oră pleacă a doua zi lucrătoare
  },
  smartbill: {
    email: '',                // e-mailul contului SmartBill
    cif: '',                  // CIF firmă (ex. RO12345678)
    seriesName: '',           // seria facturilor
    warehouseName: '',        // gestiunea (opțional)
    vatPayer: true,           // firma este plătitoare de TVA (dacă nu, facturile se emit fără cote de TVA)
    vatName: 'Normala',
    vatPercent: 21,
    useStock: true,           // descarcă din gestiune la facturare
    autoInvoice: false,       // emite factura automat la fiecare comandă
    sendEmail: false,         // SmartBill trimite factura pe e-mail clientului
    syncMinutes: 0,           // sincronizare automată stoc din SmartBill (0 = oprit: stocul se ține în aplicație)
    receipts: false,          // bon fiscal din aplicație la „Vânzare în salon” (SmartBill + casa de marcat)
    receiptFile: 'bon.txt',   // numele fișierului pe care îl citește casa de marcat (ca în SmartBill > Configurare > Case de marcat)
    lastSync: null,
    lastSyncError: null
  }
};

const DEFAULT_CATEGORIES = [
  { id: 'repair', name: 'Luxury Repair', order: 1 },
  { id: 'anti', name: 'Anti-Yellow · păr blond', order: 2 },
  { id: 'kit', name: 'Kituri & seturi', order: 3 },
  { id: 'salon', name: 'Alte produse salon', order: 4 }
];
function categories() {
  return read('categories', () => { write('categories', DEFAULT_CATEGORIES); return DEFAULT_CATEGORIES; }).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
}

function settings() {
  const s = read('settings', {});
  return { ...DEFAULT_SETTINGS, ...s, smartbill: { ...DEFAULT_SETTINGS.smartbill, ...(s.smartbill || {}) }, courier: { ...DEFAULT_SETTINGS.courier, ...(s.courier || {}) },
    pay: { ...DEFAULT_SETTINGS.pay, ...(s.pay || {}) }, mail: { ...DEFAULT_SETTINGS.mail, ...(s.mail || {}) }, chat: { ...DEFAULT_SETTINGS.chat, ...(s.chat || {}) } };
}

// secrets are kept apart so they are never sent back to the browser
function secrets() { return read('secrets', {}); }
function saveSecrets(v) { return write('secrets', v); }

// The company is registered for VAT (ANAF registry: since 31.03.2026); the shop had been set up as a non-payer by mistake.
// From now on documents carry VAT. Automatic invoicing is put on hold until the SmartBill account itself is set as a VAT payer
// (Configurare → Date firmă), so that no invoice goes out with the wrong VAT in the meantime; it is switched back on from the panel.
function vatPayerFix() {
  const done = read('migrations', {});
  if (done.vat1) return;
  const s = read('settings', null);
  if (s && s.smartbill && s.smartbill.vatPayer === false) {
    s.smartbill.vatPayer = true;
    if (!s.smartbill.vatPercent) s.smartbill.vatPercent = 21;
    if (s.smartbill.autoInvoice) { s.smartbill.autoInvoice = false; s.smartbill.autoInvoiceHeld = 'tva'; }
    write('settings', s);
  }
  write('migrations', { ...done, vat1: new Date().toISOString() });
}

defaultCodes();
defaultServices();
vatPayerFix();

module.exports = { DATA_DIR, ROOT, read, write, products, categories, settings, secrets, saveSecrets, SMARTBILL_CODES };
