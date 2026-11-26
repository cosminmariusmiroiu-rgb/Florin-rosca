'use strict';
// SmartBill Cloud REST API client (https://api.smartbill.ro).
// Auth: HTTP Basic with "e-mail cont SmartBill" : "token API" (SmartBill > Contul meu > Integrari > API).
const BASE = 'https://ws.smartbill.ro/SBORO/api';

function today() {
  const d = new Date(Date.now() + 2 * 3600 * 1000); // ora României (aprox.)
  return d.toISOString().slice(0, 10);
}

class SmartBillError extends Error {}

// The CIF has to be written exactly as in the SmartBill account: "RO48413001" for a VAT payer, "48413001" otherwise.
// When SmartBill does not find the firm under the form from the settings, the other form is tried once (nothing was issued by
// the refused request) and the one that works is remembered.
const cifOther = (cif) => { const c = String(cif || '').replace(/\s+/g, ''); return /^ro/i.test(c) ? c.replace(/^ro/i, '') : 'RO' + c; };
const noFirm = (msg) => /firma la care|nu mai este disponibil|firma\b.*\bnu (exista|a fost gasita)/i.test(String(msg || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const cifKnown = new Map();   // CIF from the settings -> the form SmartBill accepted

async function call(cfg, token, method, path, opts = {}) {
  if (!cfg.email || !token || !cfg.cif) throw new SmartBillError('SmartBill nu este configurat (lipsesc e-mailul, token-ul sau CIF-ul).');
  const set = String(cfg.cif).replace(/\s+/g, '');
  try {
    return await once(cfg, token, method, path, opts, cifKnown.get(set) || set);
  } catch (e) {
    if (!(e instanceof SmartBillError) || !e.noFirm || cifKnown.has(set)) throw e;
    const data = await once(cfg, token, method, path, opts, cifOther(set)).catch(() => { throw e; });
    cifKnown.set(set, cifOther(set));
    return data;
  }
}

async function once(cfg, token, method, path, { query, body, raw }, cif) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, k === 'cif' ? cif : v);
  if (body && 'companyVatCode' in body) body = { ...body, companyVatCode: cif };
  let res;
  try {
    res = await doFetch(url, method, cfg, token, body, raw);
  } catch (e) {
    throw new SmartBillError('Nu mă pot conecta la SmartBill (' + (e.name === 'TimeoutError' ? 'timpul a expirat' : 'rețea indisponibilă') + '). Încearcă din nou.');
  }
  if (raw && res.ok) return Buffer.from(await res.arrayBuffer());
  let data = {};
  try { data = JSON.parse(await res.text()); } catch (e) {}
  if (!res.ok || (data && data.errorText)) {
    const msg = (data && (data.errorText || data.message)) || '';
    const err = new SmartBillError(msg ? 'SmartBill: ' + msg : raw ? 'SmartBill a răspuns cu eroarea ' + res.status : 'SmartBill: eroare ' + res.status);
    err.noFirm = noFirm(msg);
    throw err;
  }
  return data;
}

function doFetch(url, method, cfg, token, body, raw) {
  return fetch(url, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(cfg.email + ':' + token).toString('base64'),
      Accept: raw ? 'application/octet-stream' : 'application/json',
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
}

// test connection: lists invoice series
async function test(cfg, token) {
  const data = await call(cfg, token, 'GET', '/series', { query: { cif: cfg.cif, type: 'f' } });
  return (data.list || []).map((s) => ({ name: s.name, nextNumber: s.nextNumber }));
}

// stocks: returns [{ code, name, quantity, warehouse }]
async function stocks(cfg, token) {
  const data = await call(cfg, token, 'GET', '/stocks', {
    query: { cif: cfg.cif, date: today(), warehouseName: cfg.warehouseName || undefined }
  });
  const out = [];
  for (const w of data.list || []) {
    for (const p of w.products || []) {
      out.push({ code: String(p.productCode || '').trim(), name: String(p.productName || '').trim(), quantity: Number(p.quantity) || 0, warehouse: w.warehouse && w.warehouse.warehouseName });
    }
  }
  return out;
}

// VAT rates configured in the SmartBill account: [{ name, percentage }]
async function taxes(cfg, token) {
  const data = await call(cfg, token, 'GET', '/tax', { query: { cif: cfg.cif } });
  return (data.taxes || []).map((t) => ({ name: String(t.name || ''), percentage: Number(t.percentage) }));
}
// the rate put on documents: the one named in the settings, otherwise any rate of the account with the configured percentage.
// If the account has no such rate nothing is issued (better no invoice than one with the wrong VAT).
async function vatRate(cfg, token) {
  const pct = Number(cfg.vatPercent) || 21, list = await taxes(cfg, token), want = String(cfg.vatName || '').toLowerCase();
  const hit = list.find((t) => t.percentage === pct && t.name.toLowerCase() === want) || list.find((t) => t.percentage === pct);
  if (!hit) throw new SmartBillError('SmartBill: în cont nu există cota de TVA de ' + pct + '%. Verifică în SmartBill, la Configurare → Date firmă, dacă firma este trecută ca plătitoare de TVA. Documentul nu a fost emis.');
  return hit;
}

// invoice for an order
async function invoice(cfg, token, order) {
  const c = order.customer;
  // o firmă neplătitoare de TVA nu trimite cote de TVA pe produse; una plătitoare trimite cota din contul SmartBill (prețurile includ TVA)
  let tax = {};
  if (cfg.vatPayer !== false) { const rate = await vatRate(cfg, token); tax = { isTaxIncluded: true, taxName: rate.name, taxPercentage: rate.percentage }; }
  const lines = order.items.map((it) => ({
    name: it.name + (it.size ? ' ' + it.size : ''),
    code: it.smartbillCode || it.id,
    isDiscount: false,
    measuringUnitName: 'buc',
    currency: 'RON',
    quantity: it.qty,
    price: it.price,
    ...tax,
    saveToDb: false,
    isService: !!it.service,                       // manopera (balayage, vopsit, tuns) nu are stoc
    useStock: !!cfg.useStock && !it.service,
    warehouseName: cfg.useStock && !it.service ? (cfg.warehouseName || undefined) : undefined
  }));
  if (order.shipping > 0) {
    lines.push({
      name: 'Transport', code: 'TRANSPORT', isDiscount: false, measuringUnitName: 'buc', currency: 'RON',
      quantity: 1, price: order.shipping, ...tax, saveToDb: false, isService: true
    });
  }
  const body = {
    companyVatCode: cfg.cif,
    client: {
      name: c.company || c.name,
      vatCode: c.cui || '',
      isTaxPayer: !!c.cui,
      address: c.address,
      city: c.city,
      county: c.county,
      country: 'Romania',
      email: c.email || '',
      phone: c.phone || '',
      saveToDb: false
    },
    issueDate: today(),
    seriesName: cfg.seriesName,
    isDraft: false,
    mentions: 'Comanda online #' + order.number + (order.payment === 'card' && order.paid ? ' · achitată online cu cardul' : ''),
    sendEmail: !!(cfg.sendEmail && c.email),
    products: lines
  };
  const data = await call(cfg, token, 'POST', '/invoice', { body });
  return { series: data.series, number: data.number, url: data.url || null };
}

async function invoicePdf(cfg, token, series, number) {
  return call(cfg, token, 'GET', '/invoice/pdf', { query: { cif: cfg.cif, seriesname: series, number }, raw: true });
}

// ---------- bon fiscal (fiscal receipt) for a sale made in the salon ----------
// POST /payment with type "Bon": SmartBill registers the receipt and, with returnFiscalPrinterText, answers with the text for the
// cash register configured in the account (Configurare > Case de marcat), Base64-encoded. That text has to be written, as it is,
// into the file the cash register driver watches (e.g. C:\FiscalNet\Bonuri\bon.txt); the panel does it on the salon's computer.
// The receipt is issued on the default cash register of the SmartBill user whose e-mail + token are used here.
const plain = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim();
async function receipt(cfg, token, sale) {
  const pct = cfg.vatPayer === false ? 0 : Number(cfg.vatPercent) || 21;   // only the percentage: SmartBill picks the rate configured on the cash register
  const stock = (it) => !!cfg.useStock && !it.service;
  const products = sale.items.map((it) => ({
    name: plain(it.name + (it.size ? ' ' + it.size : '')).slice(0, 120),
    code: it.smartbillCode || it.id,
    quantity: it.qty,
    measuringUnitName: 'buc',
    price: it.price,
    isTaxIncluded: true,
    taxPercentage: pct,
    isService: !!it.service,
    saveToDb: false,
    ...(stock(it) && cfg.warehouseName ? { warehouseName: cfg.warehouseName } : {})
  }));
  const total = Math.round(sale.items.reduce((a, it) => a + it.price * it.qty, 0) * 100) / 100;
  const body = {
    companyVatCode: cfg.cif,
    type: 'Bon',
    issueDate: today(),
    currency: 'RON',
    precision: 2,
    client: { name: plain(sale.client) || 'Persoana fizica', vatCode: '', isTaxPayer: false, country: 'Romania', saveToDb: false },
    products,
    value: total,
    useStock: sale.items.some(stock),
    returnFiscalPrinterText: true,
    [sale.payment === 'card' ? 'receivedCard' : 'receivedCash']: total,
    observation: 'Vanzare salon #' + sale.number
  };
  const data = await call(cfg, token, 'POST', '/payment', { body });
  if (data.id == null || data.id === '') throw new SmartBillError('SmartBill nu a întors identificatorul bonului fiscal.');
  if (!data.message) throw new SmartBillError('SmartBill a înregistrat bonul, dar nu a întors textul pentru casa de marcat. Tipărește-l din SmartBill.');
  return { id: String(data.id), text: String(data.message) };
}

// the text of a receipt that was already issued (for printing it later from the salon's computer)
async function receiptText(cfg, token, id) {
  const data = await call(cfg, token, 'GET', '/payment/text', { query: { cif: cfg.cif, id } });
  if (!data.message) throw new SmartBillError('SmartBill nu a întors textul bonului.');
  return String(data.message);
}

module.exports = { test, stocks, taxes, invoice, invoicePdf, receipt, receiptText, SmartBillError };
