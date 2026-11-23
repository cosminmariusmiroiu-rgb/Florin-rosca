'use strict';
// SmartBill Cloud REST API client (https://api.smartbill.ro).
// Auth: HTTP Basic with "e-mail cont SmartBill" : "token API" (SmartBill > Contul meu > Integrari > API).
const BASE = 'https://ws.smartbill.ro/SBORO/api';

function today() {
  const d = new Date(Date.now() + 2 * 3600 * 1000); // ora României (aprox.)
  return d.toISOString().slice(0, 10);
}

class SmartBillError extends Error {}

async function call(cfg, token, method, path, { query, body, raw } = {}) {
  if (!cfg.email || !token || !cfg.cif) throw new SmartBillError('SmartBill nu este configurat (lipsesc e-mailul, token-ul sau CIF-ul).');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, v);
  let res;
  try {
    res = await doFetch(url, method, cfg, token, body, raw);
  } catch (e) {
    throw new SmartBillError('Nu mă pot conecta la SmartBill (' + (e.name === 'TimeoutError' ? 'timpul a expirat' : 'rețea indisponibilă') + '). Încearcă din nou.');
  }
  if (raw) {
    if (!res.ok) throw new SmartBillError('SmartBill a răspuns cu eroarea ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  }
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || (data && data.errorText)) {
    const msg = (data && (data.errorText || data.message)) || ('eroare ' + res.status);
    throw new SmartBillError('SmartBill: ' + msg);
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

// invoice for an order
async function invoice(cfg, token, order) {
  const c = order.customer;
  // o firmă neplătitoare de TVA nu trimite cote de TVA pe produse
  const tax = cfg.vatPayer === false ? {} : { isTaxIncluded: true, taxName: cfg.vatName || 'Normala', taxPercentage: Number(cfg.vatPercent) || 21 };
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
    isService: false,
    useStock: !!cfg.useStock,
    warehouseName: cfg.useStock ? (cfg.warehouseName || undefined) : undefined
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

module.exports = { test, stocks, invoice, invoicePdf, SmartBillError };
