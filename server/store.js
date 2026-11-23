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
    pay: { ...DEFAULT_SETTINGS.pay, ...(s.pay || {}) }, mail: { ...DEFAULT_SETTINGS.mail, ...(s.mail || {}) } };
}

// secrets are kept apart so they are never sent back to the browser
function secrets() { return read('secrets', {}); }
function saveSecrets(v) { return write('secrets', v); }

module.exports = { DATA_DIR, ROOT, read, write, products, categories, settings, secrets, saveSecrets };
