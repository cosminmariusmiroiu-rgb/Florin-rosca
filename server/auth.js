'use strict';
// Admin login: one password (scrypt hash), signed session cookie, simple brute-force protection.
const crypto = require('crypto');
const store = require('./store');

const COOKIE = 'fr_admin';
const SESSION_HOURS = 12;

function secretKey() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const s = store.secrets();
  if (!s.sessionKey) { s.sessionKey = crypto.randomBytes(32).toString('hex'); store.saveSecrets(s); }
  return s.sessionKey;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function checkPassword(pw, stored) {
  if (!stored || typeof pw !== 'string') return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// first start: password from ADMIN_PASSWORD, otherwise the panel asks to set one
function passwordHash() {
  const s = store.secrets();
  if (!s.adminHash && process.env.ADMIN_PASSWORD) { s.adminHash = hashPassword(process.env.ADMIN_PASSWORD); store.saveSecrets(s); }
  return s.adminHash || null;
}

function setPassword(pw) {
  const s = store.secrets();
  s.adminHash = hashPassword(pw);
  s.sessionVersion = (s.sessionVersion || 0) + 1; // logs out other sessions
  store.saveSecrets(s);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, mac] = token.split('.');
  const good = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp < Date.now()) return null;
    if ((p.v || 0) !== (store.secrets().sessionVersion || 0)) return null;
    return p;
  } catch (e) { return null; }
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(req) { return req.headers['x-forwarded-proto'] === 'https' || !!req.socket.encrypted; }

function sessionCookie(req) {
  const token = sign({ exp: Date.now() + SESSION_HOURS * 3600e3, v: store.secrets().sessionVersion || 0 });
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${isSecure(req) ? '; Secure' : ''}`;
}

function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`; }

function isAdmin(req) { return !!verify(parseCookies(req)[COOKIE]); }

// max 8 failed attempts / 15 min / IP
const attempts = new Map();
function tooMany(ip) {
  const a = attempts.get(ip);
  return a && a.count >= 8 && Date.now() - a.first < 15 * 60e3;
}
function failed(ip) {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.first > 15 * 60e3) attempts.set(ip, { count: 1, first: Date.now() });
  else a.count++;
}
function succeeded(ip) { attempts.delete(ip); }

module.exports = { passwordHash, setPassword, checkPassword, sessionCookie, clearCookie, isAdmin, tooMany, failed, succeeded };
