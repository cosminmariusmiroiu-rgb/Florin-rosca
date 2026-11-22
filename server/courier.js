'use strict';
// Legătura cu firmele de curierat: generare AWB, etichetă PDF, urmărire colet.
// Fiecare firmă are API-ul ei; datele de cont (utilizator, parolă, cheie) vin din panou și se păstrează în secrets.
// IMPORTANT: câmpurile exacte se verifică la prima conectare cu contul real (fiecare firmă își poate schimba API-ul).

const sameDayDate = () => new Date().toISOString().slice(0, 10);

class CourierError extends Error {}

async function http(url, opts = {}) {
  let res;
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new CourierError('Nu mă pot conecta la firma de curierat (' + (e.name === 'TimeoutError' ? 'timpul a expirat' : 'rețea indisponibilă') + ').');
  }
  return res;
}
async function json(res, who) {
  let d = {};
  try { d = await res.json(); } catch (e) {}
  if (!res.ok) throw new CourierError(who + ': ' + (d.message || d.error || d.Message || ('eroare ' + res.status)));
  return d;
}

/* weight & content of a parcel from the order */
function parcel(order, cfg) {
  const pieces = order.items.reduce((a, i) => a + i.qty, 0);
  return {
    weight: Math.max(1, Math.round((cfg.kgPerItem || 0.6) * pieces * 10) / 10),
    content: order.items.map((i) => `${i.qty}x ${i.name}`).join(', ').slice(0, 120),
    cod: order.payment === 'ramburs' ? order.total : 0,
    pieces
  };
}

/* ---------------- FAN Courier (API v2, api.fancourier.ro) ---------------- */
const fan = {
  name: 'FAN Courier',
  async token(cfg, sec) {
    const r = await http('https://api.fancourier.ro/login?username=' + encodeURIComponent(sec.user || '') + '&password=' + encodeURIComponent(sec.pass || ''), { method: 'POST' });
    const d = await json(r, 'FAN Courier');
    const t = d.data && (d.data.token || d.data.access_token);
    if (!t) throw new CourierError('FAN Courier: autentificare eșuată (verifică utilizatorul și parola).');
    return t;
  },
  async test(cfg, sec) { await this.token(cfg, sec); return 'Autentificare reușită la FAN Courier.'; },
  async createAwb(cfg, sec, order) {
    const t = await this.token(cfg, sec), p = parcel(order, cfg), c = order.customer;
    const body = {
      clientId: Number(cfg.clientId) || cfg.clientId,
      shipments: [{
        info: {
          service: cfg.service || 'Standard', packages: { parcel: 1, envelope: 0 }, weight: p.weight,
          cod: p.cod, declaredValue: 0, payment: 'sender', returnPayment: null, observation: 'Comanda #' + order.number,
          content: p.content, dimensions: { length: 30, height: 15, width: 25 }, costCenter: '', options: []
        },
        recipient: {
          name: c.company || c.name, phone: c.phone, email: c.email || '',
          address: { county: c.county, locality: c.city, street: c.address, streetNo: '', zipCode: '' }
        }
      }]
    };
    const r = await http('https://api.fancourier.ro/intern-awb', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await json(r, 'FAN Courier');
    const resp = (d.response || [])[0] || {};
    if (!resp.awbNumber) throw new CourierError('FAN Courier: ' + JSON.stringify(resp.errors || d).slice(0, 200));
    return { awb: String(resp.awbNumber), cost: resp.costs && resp.costs.total };
  },
  async label(cfg, sec, awb) {
    const t = await this.token(cfg, sec);
    const r = await http(`https://api.fancourier.ro/awb/label?clientId=${encodeURIComponent(cfg.clientId)}&awbs[]=${encodeURIComponent(awb)}&pdf=1`, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new CourierError('FAN Courier: eticheta nu a putut fi descărcată.');
    return Buffer.from(await r.arrayBuffer());
  },
  async track(cfg, sec, awb) {
    const t = await this.token(cfg, sec);
    const r = await http(`https://api.fancourier.ro/reports/awb/tracking?clientId=${encodeURIComponent(cfg.clientId)}&awb[]=${encodeURIComponent(awb)}`, { headers: { Authorization: 'Bearer ' + t } });
    const d = await json(r, 'FAN Courier');
    const ev = ((d.data || [])[0] || {}).events || [];
    const last = ev[ev.length - 1];
    return last ? `${last.name || last.status || ''} · ${last.date || ''}` : 'Fără evenimente încă';
  }
};

/* ---------------- Sameday (api.sameday.ro; test: sameday-api.demo.zitec.com) ---------------- */
const sameday = {
  name: 'Sameday',
  base(cfg) { return cfg.demo ? 'https://sameday-api.demo.zitec.com' : 'https://api.sameday.ro'; },
  async token(cfg, sec) {
    const r = await http(this.base(cfg) + '/api/authenticate?remember_me=1', { method: 'POST', headers: { 'X-Auth-Username': sec.user || '', 'X-Auth-Password': sec.pass || '' } });
    const d = await json(r, 'Sameday');
    if (!d.token) throw new CourierError('Sameday: autentificare eșuată (verifică utilizatorul și parola de API primite de la Sameday).');
    return d.token;
  },
  async get(cfg, sec, path) {
    const t = await this.token(cfg, sec);
    const r = await http(this.base(cfg) + path, { headers: { 'X-AUTH-TOKEN': t } });
    return json(r, 'Sameday');
  },
  // pickup points + services of the account, to choose them in the panel
  async options(cfg, sec) {
    const [pp, sv] = await Promise.all([this.get(cfg, sec, '/api/client/pickup-points?countPerPage=50'), this.get(cfg, sec, '/api/client/services?countPerPage=50')]);
    return {
      pickupPoints: (pp.data || []).map((x) => ({ id: x.id, name: x.alias || x.address || ('Punct ' + x.id), default: !!x.defaultPickupPoint })),
      services: (sv.data || []).map((x) => ({ id: x.id, name: x.name, code: x.serviceCode, default: !!x.defaultServiceId }))
    };
  },
  async test(cfg, sec) {
    const o = await this.options(cfg, sec);
    return `Conectat la Sameday${cfg.demo ? ' (mod test)' : ''}: ${o.pickupPoints.length} puncte de ridicare, ${o.services.length} servicii.`;
  },
  async createAwb(cfg, sec, order) {
    if (!cfg.pickupPoint) throw new CourierError('Sameday: alege punctul de ridicare în Setări → Curier.');
    const t = await this.token(cfg, sec), p = parcel(order, cfg), c = order.customer;
    const body = {
      pickupPoint: Number(cfg.pickupPoint), packageType: 0, packageNumber: 1, packageWeight: p.weight, service: Number(cfg.service) || 7,
      awbPayment: 1, cashOnDelivery: p.cod, cashOnDeliveryReturns: 0, insuredValue: 0, thirdPartyPickup: 0,
      observation: 'Comanda #' + order.number + (c.notes ? ' · ' + c.notes : ''), clientInternalReference: String(order.number),
      awbRecipient: { name: c.company || c.name, phoneNumber: c.phone, personType: c.cui ? 1 : 0, companyName: c.company || undefined, cui: c.cui || undefined, email: c.email || '', countyString: c.county, cityString: c.city, address: c.address },
      parcels: [{ weight: p.weight, width: 25, length: 30, height: 15 }]
    };
    const r = await http(this.base(cfg) + '/api/awb', { method: 'POST', headers: { 'X-AUTH-TOKEN': t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await json(r, 'Sameday');
    if (!d.awbNumber) throw new CourierError('Sameday: AWB-ul nu a fost creat. ' + JSON.stringify(d.errors || d).slice(0, 200));
    return { awb: String(d.awbNumber), cost: d.awbCost };
  },
  async label(cfg, sec, awb) {
    const t = await this.token(cfg, sec);
    const r = await http(this.base(cfg) + '/api/awb/download/' + encodeURIComponent(awb) + '/A6', { headers: { 'X-AUTH-TOKEN': t } });
    if (!r.ok) throw new CourierError('Sameday: eticheta nu a putut fi descărcată.');
    return Buffer.from(await r.arrayBuffer());
  },
  async track(cfg, sec, awb) {
    const d = await this.get(cfg, sec, '/api/client/awb/' + encodeURIComponent(awb) + '/status');
    const h = d.expeditionHistory || [];
    const last = h[0];
    return last ? `${last.statusLabel || last.status || ''} · ${last.statusDate || ''}` : 'Predat curierului / fără evenimente încă';
  }
};

/* ---------------- Cargus (urgentcargus.azure-api.net) ---------------- */
const cargus = {
  name: 'Cargus',
  base: 'https://urgentcargus.azure-api.net/api',
  async token(cfg, sec) {
    const r = await http(this.base + '/LoginUser', { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': sec.key || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ UserName: sec.user || '', Password: sec.pass || '' }) });
    const d = await json(r, 'Cargus');
    if (!d || typeof d !== 'string') throw new CourierError('Cargus: autentificare eșuată (verifică datele și cheia de abonament).');
    return d;
  },
  headers(sec, t) { return { 'Ocp-Apim-Subscription-Key': sec.key || '', Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }; },
  async test(cfg, sec) { await this.token(cfg, sec); return 'Autentificare reușită la Cargus.'; },
  async createAwb(cfg, sec, order) {
    const t = await this.token(cfg, sec), p = parcel(order, cfg), c = order.customer;
    const body = {
      Sender: { LocationId: Number(cfg.pickupPoint) || cfg.pickupPoint },
      Recipient: { Name: c.company || c.name, CountyName: c.county, LocalityName: c.city, AddressText: c.address, ContactPerson: c.name, PhoneNumber: c.phone, Email: c.email || '' },
      Parcels: 1, Envelopes: 0, TotalWeight: p.weight, ServiceId: Number(cfg.service) || 34, DeclaredValue: 0,
      CashRepayment: p.cod, BankRepayment: 0, OtherRepayment: '', OpenPackage: false, ShipmentPayer: 1,
      Observations: 'Comanda #' + order.number, PackageContent: p.content, CustomString: String(order.number),
      ParcelCodes: [{ Code: '0', Type: 1, Weight: p.weight, Length: 30, Width: 25, Height: 15 }]
    };
    const r = await http(this.base + '/Awbs', { method: 'POST', headers: this.headers(sec, t), body: JSON.stringify(body) });
    const d = await json(r, 'Cargus');
    const awb = typeof d === 'object' ? (d.BarCode || d.barCode) : d;
    if (!awb) throw new CourierError('Cargus: AWB-ul nu a fost creat.');
    return { awb: String(awb) };
  },
  async label(cfg, sec, awb) {
    const t = await this.token(cfg, sec);
    const r = await http(`${this.base}/AwbDocuments?barCodes=${encodeURIComponent(awb)}&type=PDF&format=0&printMainOnce=1`, { headers: this.headers(sec, t) });
    if (!r.ok) throw new CourierError('Cargus: eticheta nu a putut fi descărcată.');
    const txt = await r.text();
    return Buffer.from(txt.replace(/^"|"$/g, ''), 'base64');
  },
  async track(cfg, sec, awb) {
    const t = await this.token(cfg, sec);
    const r = await http(`${this.base}/AwbTrace?barCode=${encodeURIComponent(awb)}`, { headers: this.headers(sec, t) });
    const d = await json(r, 'Cargus');
    const ev = ((d || [])[0] || {}).Event || [];
    const last = ev[ev.length - 1];
    return last ? `${last.Description || ''} · ${last.Date || ''}` : 'Fără evenimente încă';
  }
};

const COURIERS = { fan, sameday, cargus };
function get(id) {
  const c = COURIERS[id];
  if (!c) throw new CourierError('Alege mai întâi firma de curierat în Setări → Curier.');
  return c;
}

module.exports = { get, COURIERS, CourierError, sameDayDate };
