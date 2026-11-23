'use strict';
// E-mailuri automate (confirmare comandă, comandă nouă pentru salon, colet expediat, fișă nouă).
// Trimitere prin SMTP (contul de e-mail al salonului), fără biblioteci externe.
// Datele (server, port, utilizator) vin din panou; parola se păstrează în secrets.
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');

class MailError extends Error {}

const isEmail = (s) => typeof s === 'string' && /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[^@\s<>"',;]+$/.test(s) && s.length <= 200;
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const isAscii = (s) => /^[\x20-\x7e]*$/.test(s);
// RFC 2047: non-ASCII header text goes in "encoded words" of at most 75 characters each
function encoded(s) {
  const out = []; let cur = '';
  for (const ch of String(s).replace(/[\r\n]+/g, ' ')) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 45) { out.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((p) => '=?UTF-8?B?' + b64(p) + '?=').join('\r\n ');
}
const text = (s) => (isAscii(s) ? String(s).replace(/[\r\n]/g, ' ') : encoded(s));        // Subject
const phrase = (s) => (isAscii(s) ? '"' + String(s).replace(/["\\\r\n]/g, '') + '"' : encoded(s)); // display name
const wrap = (s) => s.replace(/(.{76})/g, '$1\r\n');

function buildMessage({ from, fromName, to, subject, html, text: body, replyTo }) {
  const boundary = 'fr-' + crypto.randomBytes(12).toString('hex');
  const domain = from.split('@')[1] || os.hostname();
  const head = [
    'From: ' + (fromName ? phrase(String(fromName).slice(0, 80)) + ' ' : '') + '<' + from + '>',
    'To: <' + to + '>',
    'Subject: ' + text(String(subject).slice(0, 200)),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomBytes(16).toString('hex') + '@' + domain + '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"'
  ];
  if (replyTo && isEmail(replyTo)) head.push('Reply-To: <' + replyTo + '>');
  const part = (type, body) => '--' + boundary + '\r\nContent-Type: ' + type + '; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + wrap(b64(body)) + '\r\n';
  return head.join('\r\n') + '\r\n\r\n' + part('text/plain', body || '') + part('text/html', html || '') + '--' + boundary + '--\r\n';
}

// one SMTP conversation: connect, (STARTTLS), login, send, quit
function smtp(cfg, pass, envelope, data) {
  const port = Number(cfg.port) || 465;
  const host = String(cfg.host || '').trim();
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiting = null, done = false;
    const finish = (err) => {
      if (done) return; done = true; clearTimeout(timer);
      try { sock && sock.destroy(); } catch (e) {}
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new MailError('Serverul de e-mail nu răspunde (timp expirat). Verifică serverul și portul.')), 25000);
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        // a reply ends with a line "NNN text" (a space after the code); "NNN-text" lines continue
        const m = /^(?:\d{3}-[^\r\n]*\r?\n)*(\d{3})(?: [^\r\n]*)?\r?\n/.exec(buf);
        if (!m) return;
        const reply = buf.slice(0, m[0].length); buf = buf.slice(m[0].length);
        const w = waiting; waiting = null;
        if (w) w({ code: Number(m[1]), text: reply.trim() });
      }
    };
    const attach = (s) => { sock = s; s.on('data', onData); s.on('error', (e) => finish(new MailError('Nu mă pot conecta la serverul de e-mail: ' + e.message))); s.on('close', () => finish(new MailError('Serverul de e-mail a închis conexiunea.'))); };
    const read = () => new Promise((r) => { waiting = r; });
    const cmd = async (line, expect, what) => {
      if (line != null) sock.write(line + '\r\n');
      const r = await read();
      if (!expect.includes(r.code)) throw new MailError((what || 'Serverul de e-mail a refuzat') + ': ' + r.text.split(/\r?\n/).pop().slice(0, 200));
      return r;
    };
    const run = async () => {
      await cmd(null, [220], 'Serverul de e-mail nu a răspuns corect');
      const name = 'florinrosca.local';
      let ehlo = await cmd('EHLO ' + name, [250]);
      if (port !== 465) {
        if (!/STARTTLS/i.test(ehlo.text)) throw new MailError('Serverul de e-mail nu oferă conexiune securizată pe acest port. Încearcă portul 465.');
        await cmd('STARTTLS', [220]);
        const plain = sock; plain.removeAllListeners('data'); plain.removeAllListeners('close');
        await new Promise((ok, bad) => { const s = tls.connect({ socket: plain, servername: host }, ok); s.once('error', bad); attach(s); });
        ehlo = await cmd('EHLO ' + name, [250]);
      }
      if (cfg.user) {
        if (/AUTH[ =][^\r\n]*PLAIN/i.test(ehlo.text)) {
          await cmd('AUTH PLAIN ' + b64('\u0000' + cfg.user + '\u0000' + pass), [235], 'Autentificare eșuată (verifică utilizatorul și parola de e-mail)');
        } else {
          await cmd('AUTH LOGIN', [334], 'Autentificare eșuată');
          await cmd(b64(cfg.user), [334], 'Autentificare eșuată');
          await cmd(b64(pass), [235], 'Autentificare eșuată (verifică utilizatorul și parola de e-mail)');
        }
      }
      await cmd('MAIL FROM:<' + envelope.from + '>', [250], 'Adresa expeditorului a fost refuzată');
      await cmd('RCPT TO:<' + envelope.to + '>', [250, 251], 'Adresa destinatarului a fost refuzată');
      await cmd('DATA', [354]);
      await cmd(data.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..') + '\r\n.', [250], 'Mesajul a fost refuzat');
      sock.removeAllListeners('close');
      try { sock.write('QUIT\r\n'); } catch (e) {}
    };
    try {
      if (port === 465) attach(tls.connect({ host, port, servername: host }));
      else attach(net.connect({ host, port }));
    } catch (e) { return finish(new MailError('Nu mă pot conecta la serverul de e-mail.')); }
    run().then(() => finish(), finish);
  });
}

function configured(cfg, pass) {
  return !!(cfg && cfg.host && isEmail(cfg.from) && (!cfg.user || pass));
}

async function send(cfg, pass, msg) {
  if (!configured(cfg, pass)) throw new MailError('E-mailul nu este configurat (lipsesc serverul, adresa expeditorului sau parola).');
  if (!isEmail(msg.to)) throw new MailError('Adresa destinatarului nu este corectă.');
  const data = buildMessage({ from: cfg.from, fromName: cfg.fromName, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, replyTo: msg.replyTo });
  await smtp(cfg, pass || '', { from: cfg.from, to: msg.to }, data);
}

/* ---------- templates ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lei = (n) => (Number(n) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' lei';
const PHONE = '0732 937 622';

function layout(title, inner) {
  return '<!doctype html><html lang="ro"><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1d1a14">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px 12px"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:#0f0e0c;padding:22px 28px;color:#e7c873;font-size:20px;letter-spacing:2px;text-align:center">FLORIN ROȘCA<br><span style="font-size:11px;letter-spacing:3px;color:#b9a777">LUXURY HAIR</span></td></tr>' +
    '<tr><td style="padding:26px 28px;font-size:15px;line-height:1.55"><h1 style="margin:0 0 14px;font-size:20px;color:#1d1a14">' + esc(title) + '</h1>' + inner + '</td></tr>' +
    '<tr><td style="padding:16px 28px 24px;font-size:12px;color:#7a7364;border-top:1px solid #ece6d8">Florin Roșca Luxury Hair · telefon ' + PHONE + '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function itemsTable(o) {
  const row = (a, b, bold) => '<tr><td style="padding:7px 0;border-bottom:1px solid #f0ebdf' + (bold ? ';font-weight:bold' : '') + '">' + a + '</td><td align="right" style="padding:7px 0;border-bottom:1px solid #f0ebdf;white-space:nowrap' + (bold ? ';font-weight:bold' : '') + '">' + b + '</td></tr>';
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;font-size:14px">' +
    o.items.map((i) => row(i.qty + ' × ' + esc(i.name) + (i.size ? ' ' + esc(i.size) : ''), lei(i.price * i.qty))).join('') +
    row('Livrare', o.shipping ? lei(o.shipping) : 'gratuită') + row('Total', lei(o.total), true) + '</table>';
}
const itemsText = (o) => o.items.map((i) => '  ' + i.qty + ' x ' + i.name + (i.size ? ' ' + i.size : '') + ' – ' + lei(i.price * i.qty)).join('\n') +
  '\n  Livrare: ' + (o.shipping ? lei(o.shipping) : 'gratuită') + '\n  TOTAL: ' + lei(o.total);
const payLine = (o) => (o.payment === 'card'
  ? (o.paid ? 'Plata: cu cardul, online – <b>achitată</b>.' : 'Plata: cu cardul, online.')
  : 'Plata: <b>ramburs</b> – plătești ' + lei(o.total) + ' la primirea coletului.');
const addr = (c) => esc(c.address) + ', ' + esc(c.city) + ', jud. ' + esc(c.county);
const plain = (h) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const templates = {
  // to the customer, when the order is placed (ramburs) or paid (card)
  orderCustomer(o) {
    const c = o.customer;
    return {
      to: c.email, subject: 'Comanda ta #' + o.number + ' – Florin Roșca Luxury Hair',
      html: layout('Mulțumim, ' + c.name.split(' ')[0] + '! Am primit comanda #' + o.number, '<p>Îți pregătim coletul și te anunțăm când pleacă spre tine.</p>' + itemsTable(o) +
        '<p>' + payLine(o) + '</p><p><b>Livrare la:</b><br>' + esc(c.name) + ', ' + esc(c.phone) + '<br>' + addr(c) + '</p>' +
        '<p>Pentru orice întrebare ne poți suna la <b>' + PHONE + '</b>.</p>'),
      text: 'Mulțumim! Am primit comanda #' + o.number + '.\n\n' + itemsText(o) + '\n\n' + plain(payLine(o)) + '\n\nLivrare la: ' + c.name + ', ' + c.phone + ', ' + c.address + ', ' + c.city + ', jud. ' + c.county + '\n\nÎntrebări: ' + PHONE
    };
  },
  // to the salon, for every new order that has to be prepared
  orderSalon(o, to, site) {
    const c = o.customer, how = o.payment === 'card' ? 'card, plătită' : 'ramburs';
    return {
      to, replyTo: c.email, subject: 'Comandă nouă #' + o.number + ' · ' + lei(o.total) + ' · ' + how,
      html: layout('Comandă nouă #' + o.number, itemsTable(o) + '<p>' + payLine(o) + '</p>' +
        '<p><b>' + esc(c.name) + '</b>' + (c.company ? ' · ' + esc(c.company) + (c.cui ? ' (CUI ' + esc(c.cui) + ')' : '') : '') + '<br>' + esc(c.phone) + (c.email ? ' · ' + esc(c.email) : '') + '<br>' + addr(c) + '</p>' +
        (c.notes ? '<p><i>„' + esc(c.notes) + '”</i></p>' : '') +
        (site ? '<p><a href="' + esc(site) + '/admin/#colete" style="display:inline-block;background:#c9a24a;color:#14100a;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:bold">Deschide panoul</a></p>' : '')),
      text: 'Comandă nouă #' + o.number + ' (' + how + ')\n\n' + itemsText(o) + '\n\n' + c.name + ', ' + c.phone + (c.email ? ', ' + c.email : '') + '\n' + c.address + ', ' + c.city + ', jud. ' + c.county + (c.notes ? '\nObservații: ' + c.notes : '') + (site ? '\n\nPanou: ' + site + '/admin/#colete' : '')
    };
  },
  // to the customer, when the parcel is handed to the courier
  orderShipped(o, courierName) {
    const c = o.customer;
    const awb = o.awb ? '<p>Număr de urmărire (AWB): <b>' + esc(o.awb) + '</b>' + (courierName ? ' · ' + esc(courierName) : '') + '</p>' : '';
    return {
      to: c.email, subject: 'Comanda ta #' + o.number + ' a plecat spre tine',
      html: layout('Coletul tău este pe drum', '<p>Comanda #' + o.number + ' a fost predată curierului.</p>' + awb +
        '<p>' + (o.payment === 'ramburs' ? 'Pregătește <b>' + lei(o.total) + '</b> pentru plata la livrare.' : 'Comanda este deja achitată, nu mai ai nimic de plătit la livrare.') + '</p>' +
        '<p>Curierul te sună înainte de livrare. Pentru orice întrebare: <b>' + PHONE + '</b>.</p>'),
      text: 'Comanda #' + o.number + ' a fost predată curierului.' + (o.awb ? '\nAWB: ' + o.awb + (courierName ? ' (' + courierName + ')' : '') : '') +
        '\n' + (o.payment === 'ramburs' ? 'De plată la livrare: ' + lei(o.total) : 'Comanda este deja achitată.') + '\n\nÎntrebări: ' + PHONE
    };
  },
  // to the salon, for a new consultation form (no private details in the e-mail)
  consultSalon(rec, to, site) {
    return {
      to, subject: 'Fișă nouă de consultație #' + rec.number + ' · ' + rec.name,
      html: layout('Fișă nouă de consultație #' + rec.number, '<p><b>' + esc(rec.name) + '</b> · ' + esc(rec.phone) + '<br>Serviciu dorit: <b>' + esc(rec.service) + '</b></p>' +
        '<p>Răspunsurile și pozele sunt în panou, la „Fișe cliente”.</p>' +
        (site ? '<p><a href="' + esc(site) + '/admin/#fise" style="display:inline-block;background:#c9a24a;color:#14100a;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:bold">Deschide fișa</a></p>' : '')),
      text: 'Fișă nouă de consultație #' + rec.number + '\n' + rec.name + ', ' + rec.phone + '\nServiciu: ' + rec.service + (site ? '\n\nPanou: ' + site + '/admin/#fise' : '')
    };
  },
  test(to) {
    return { to, subject: 'E-mail de test – Florin Roșca', html: layout('Legătura de e-mail funcționează ✓', '<p>Acesta este un mesaj de test trimis din panoul de administrare. De acum, site-ul poate trimite confirmări de comandă.</p>'), text: 'Legătura de e-mail funcționează. Mesaj de test trimis din panoul de administrare.' };
  }
};

module.exports = { send, configured, isEmail, templates, buildMessage, MailError };
