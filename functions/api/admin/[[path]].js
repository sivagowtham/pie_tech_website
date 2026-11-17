// Content admin API: login, save documents, upload photos, manage editor accounts.
// Everything except login requires a valid signed session cookie.
import { hashPassword, verifyPassword, sessionCookie, clearCookie, readSession, safeEqStr, json } from '../../_lib/auth.js';
import { DOCS, sanitize } from '../../_lib/schema.js';

const MAX_JSON = 600 * 1024;
const MAX_IMG = 2.5 * 1024 * 1024;

async function logAudit(env, who, action, doc) {
  try {
    const t = Date.now();
    await env.CONTENT.put('audit:' + String(9e15 - t).padStart(16, '0'), JSON.stringify({ t, who, action, doc }), { expirationTtl: 60 * 60 * 24 * 365 });
  } catch (e) { /* the audit log must never block an edit */ }
}

function imgType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ['image/png', 'png'];
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ['image/webp', 'webp'];
  return null;
}

async function login(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const rlKey = 'rl:' + ip;
  const tries = parseInt((await env.CONTENT.get(rlKey)) || '0', 10);
  if (tries >= 10) return json({ error: 'Too many attempts. Please wait 15 minutes.' }, 429);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
  const name = String(body.user || '').trim().toLowerCase().slice(0, 40);
  const pw = String(body.password || '').slice(0, 200);
  let user = null;
  if (name === 'admin') {
    if (env.ADMIN_PASSWORD && safeEqStr(pw, env.ADMIN_PASSWORD)) user = { name: 'admin', role: 'admin' };
  } else if (/^[a-z0-9._-]{3,32}$/.test(name)) {
    const rec = await env.CONTENT.get('user:' + name, 'json');
    if (rec && (await verifyPassword(pw, rec))) user = { name, role: rec.role === 'admin' ? 'admin' : 'editor' };
  }
  if (!user) {
    await env.CONTENT.put(rlKey, String(tries + 1), { expirationTtl: 900 });
    return json({ error: 'Wrong username or password' }, 401);
  }
  await env.CONTENT.delete(rlKey);
  await logAudit(env, user.name, 'login', '');
  return json({ ok: true, user }, 200, { 'Set-Cookie': await sessionCookie(env, user) });
}

export async function onRequest({ request, env, params }) {
  if (!env.CONTENT || !env.SESSION_KEY) return json({ error: 'Admin is not configured yet' }, 503);
  const path = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  const method = request.method;
  const url = new URL(request.url);

  // Same-site requests only for anything that changes data.
  if (method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'Forbidden' }, 403);
  }

  if (path === 'login' && method === 'POST') return login(request, env);
  if (path === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });

  const me = await readSession(env, request);
  if (!me) return json({ error: 'Please sign in' }, 401);

  if (path === 'me' && method === 'GET') return json({ user: me });

  // ---- save a document (editors and admins)
  if (path === 'save' && method === 'PUT') {
    const len = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (len > MAX_JSON) return json({ error: 'Too much data' }, 413);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const name = body.name;
    if (!DOCS.includes(name)) return json({ error: 'Unknown document' }, 400);
    let clean;
    try { clean = sanitize(name, body.data); } catch (e) { return json({ error: e.message }, 400); }
    const cur = await env.CONTENT.get('doc:' + name, 'json');
    const curRev = cur ? cur._rev || 0 : 0;
    if ((body.rev || 0) !== curRev) return json({ error: 'Someone else saved changes first. Reload the page and apply your change again.', rev: curRev }, 409);
    const doc = { ...clean, _rev: Date.now(), _by: me.name };
    await env.CONTENT.put('doc:' + name, JSON.stringify(doc));
    await logAudit(env, me.name, 'saved', name);
    return json({ ok: true, rev: doc._rev });
  }

  // ---- photo upload (already resized in the browser) / delete
  if (path === 'upload' && method === 'POST') {
    const buf = new Uint8Array(await request.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMG) return json({ error: 'Photo must be under 2.5 MB' }, 413);
    const t = imgType(buf);
    if (!t) return json({ error: 'Only JPEG, PNG or WebP photos are allowed' }, 415);
    const d = new Date();
    const key = `u/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}.${t[1]}`;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: t[0] }, customMetadata: { by: me.name } });
    await logAudit(env, me.name, 'uploaded photo', key);
    return json({ ok: true, src: '/media/' + key });
  }
  if (path === 'upload' && method === 'DELETE') {
    const key = url.searchParams.get('key') || '';
    if (!/^u\/[\w\-./]+$/.test(key) || key.includes('..')) return json({ error: 'Bad key' }, 400);
    await env.MEDIA.delete(key);
    await logAudit(env, me.name, 'deleted photo', key);
    return json({ ok: true });
  }

  if (path === 'audit' && method === 'GET') {
    const l = await env.CONTENT.list({ prefix: 'audit:', limit: 60 });
    const rows = await Promise.all(l.keys.map((k) => env.CONTENT.get(k.name, 'json')));
    return json({ rows: rows.filter(Boolean) });
  }

  // ---- editor accounts (admin only)
  if (path === 'users') {
    if (me.role !== 'admin') return json({ error: 'Admins only' }, 403);
    if (method === 'GET') {
      const l = await env.CONTENT.list({ prefix: 'user:' });
      const rows = await Promise.all(l.keys.map(async (k) => { const r = await env.CONTENT.get(k.name, 'json'); return r && { name: k.name.slice(5), role: r.role, created: r.created }; }));
      return json({ users: rows.filter(Boolean) });
    }
    if (method === 'POST') {
      let b;
      try { b = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const name = String(b.name || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(name) || name === 'admin') return json({ error: 'Username: 3-32 letters, numbers, dots or hyphens' }, 400);
      if (String(b.password || '').length < 10) return json({ error: 'Password must be at least 10 characters' }, 400);
      const h = await hashPassword(String(b.password));
      await env.CONTENT.put('user:' + name, JSON.stringify({ role: b.role === 'admin' ? 'admin' : 'editor', ...h, created: Date.now(), by: me.name }));
      await logAudit(env, me.name, 'saved account', name);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      const name = String(url.searchParams.get('name') || '').toLowerCase();
      if (!/^[a-z0-9._-]{3,32}$/.test(name)) return json({ error: 'Bad name' }, 400);
      await env.CONTENT.delete('user:' + name);
      await logAudit(env, me.name, 'removed account', name);
      return json({ ok: true });
    }
  }
  return json({ error: 'Not found' }, 404);
}
