// Sessions and password hashing for the content admin (Web Crypto only, runs on Cloudflare Pages Functions).
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
export const safeEqStr = (a, b) => safeEq(enc.encode(String(a)), enc.encode(String(b)));

async function hmac(secret, data) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

export async function hashPassword(pw, salt) {
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  const k = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, k, 256);
  return { salt: b64u(salt), hash: b64u(bits) };
}
export async function verifyPassword(pw, rec) {
  const { hash } = await hashPassword(pw, unb64u(rec.salt));
  return safeEq(unb64u(hash), unb64u(rec.hash));
}

const COOKIE = 'pt_session';
const TTL_MS = 8 * 3600 * 1000;

export async function sessionCookie(env, user) {
  const payload = b64u(enc.encode(JSON.stringify({ u: user.name, r: user.role, exp: Date.now() + TTL_MS })));
  const sig = b64u(await hmac(env.SESSION_KEY, payload));
  return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL_MS / 1000}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function readSession(env, request) {
  if (!env.SESSION_KEY) return null;
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [payload, sig] = m[1].split('.');
  if (!payload || !sig) return null;
  const want = b64u(await hmac(env.SESSION_KEY, payload));
  if (!safeEqStr(want, sig)) return null;
  try {
    const d = JSON.parse(new TextDecoder().decode(unb64u(payload)));
    if (!d.exp || d.exp < Date.now()) return null;
    return { name: d.u, role: d.r };
  } catch (e) {
    return null;
  }
}

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
