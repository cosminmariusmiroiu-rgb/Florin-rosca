'use strict';
// EuPlatesc.ro: plata cu cardul pe pagina securizată EuPlatesc.
// Pe aceeași pagină apar și Apple Pay / Google Pay, dacă sunt activate pe contul de comerciant.
// Datele de cont (Merchant ID + cheie) vin din panou; cheia se păstrează în secrets.
// Documentație: manager.euplatesc.ro → Integrare. Semnătura: HMAC-MD5 peste câmpuri cu prefix de lungime.
const crypto = require('crypto');

const ENDPOINT = 'https://secure.euplatesc.ro/tdsprocess/tranzactd.php';
// fields signed in the answer (IPN / întoarcerea clientului), in this exact order
const RESPONSE_BASE = ['amount', 'curr', 'invoice_id', 'ep_id', 'merch_id', 'action', 'message', 'approval', 'timestamp', 'nonce'];
// optional answer fields (only present when they are switched on in the EuPlatesc account), signed after the base ones
const RESPONSE_EXTRA = ['sec_status', 'rrn', 'mcard', 'card_exp', 'recuring_max_amount', 'recuring_exp', 'discount_amount',
  'payment_channel', 'card_type', 'bin', 'rate', 'acq_bank', 'card_holder', 'card_issuer', 'email', 'rtype', 'cce'];

class PayError extends Error {}

const validKey = (k) => typeof k === 'string' && /^([0-9a-f]{2}){8,64}$/i.test(k);
const ascii = (s, max) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').trim().slice(0, max);

// "length + value" for each field, "-" for an empty one
function mac(values, keyHex, byBytes = true) {
  let base = '';
  for (const raw of values) {
    const v = String(raw == null ? '' : raw);
    base += v.length === 0 ? '-' : (byBytes ? Buffer.byteLength(v, 'utf8') : v.length) + v;
  }
  return crypto.createHmac('md5', Buffer.from(keyHex, 'hex')).update(base, 'utf8').digest('hex').toUpperCase();
}

function timestamp(d = new Date()) {
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14); // GMT, YYYYMMDDHHmmss
}

// the form the customer's browser sends to EuPlatesc
function request(cfg, key, p) {
  if (!cfg || !cfg.mid || !validKey(key)) throw new PayError('Plata cu cardul nu este configurată (lipsesc Merchant ID-ul sau cheia EuPlătesc).');
  const signed = {
    amount: (Math.round(p.amount * 100) / 100).toFixed(2),
    curr: 'RON',
    invoice_id: String(p.invoiceId),
    order_desc: ascii(p.description, 100) || 'Comanda',
    merch_id: String(cfg.mid).trim(),
    timestamp: timestamp(),
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const c = p.customer || {};
  const names = ascii(c.name, 80).split(/\s+/);
  const fields = {
    ...signed,
    fp_hash: mac(Object.values(signed), key),
    fname: names[0] || '', lname: names.slice(1).join(' ') || names[0] || '',
    company: ascii(c.company, 100), add: ascii(c.address, 200), city: ascii(c.city, 60), state: ascii(c.county, 40),
    country: 'Romania', phone: ascii(c.phone, 30), email: ascii(c.email, 120),
    lang: 'ro'
  };
  if (p.urls) {
    fields['ExtraData[silenturl]'] = p.urls.silent;
    fields['ExtraData[successurl]'] = p.urls.back;
    fields['ExtraData[failedurl]'] = p.urls.back;
    fields['ExtraData[backtosite]'] = p.urls.site;
    fields['ExtraData[ep_method]'] = 'post';
    fields['ExtraData[backtosite_method]'] = 'get';
  }
  for (const k of Object.keys(fields)) if (fields[k] === '') delete fields[k];
  return { url: ENDPOINT, fields };
}

// checks the signature of an answer from EuPlatesc; returns the trusted fields or throws
function verify(post, cfg, key) {
  if (!cfg || !cfg.mid || !validKey(key)) throw new PayError('Plata cu cardul nu este configurată.');
  const val = (k) => String(post[k] == null ? '' : post[k]).trim();
  const names = RESPONSE_BASE.concat(RESPONSE_EXTRA.filter((k) => Object.prototype.hasOwnProperty.call(post, k)));
  const values = names.map(val);
  const got = val('fp_hash').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(got)) throw new PayError('Răspuns fără semnătură.');
  const same = (a) => crypto.timingSafeEqual(Buffer.from(a), Buffer.from(got));
  // base fields only, in case extra ones are sent but not signed
  const base = RESPONSE_BASE.map(val);
  if (!(same(mac(values, key, true)) || same(mac(values, key, false)) || same(mac(base, key, true)) || same(mac(base, key, false)))) throw new PayError('Semnătură greșită.');
  if (val('merch_id') !== String(cfg.mid).trim()) throw new PayError('Răspunsul este pentru alt comerciant.');
  return {
    approved: val('action') === '0',
    invoiceId: val('invoice_id'), amount: Number(val('amount')), curr: val('curr').toUpperCase(),
    epId: val('ep_id'), message: val('message').slice(0, 200), approval: val('approval'),
    channel: val('payment_channel').slice(0, 30), cardType: val('card_type').slice(0, 30)
  };
}

module.exports = { ENDPOINT, request, verify, mac, timestamp, validKey, PayError };
