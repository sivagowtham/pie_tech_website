// The chat assistant stays on Cloudflare even when the website itself is hosted on the college server.
// Allow browsers on the college domain to call it (CORS). Everything else under /api is same-origin only.
const ALLOWED = ['https://pietech.edu.in', 'https://www.pietech.edu.in', 'https://new.pietech.edu.in'];

export async function onRequest({ request, next }) {
  if (new URL(request.url).pathname !== '/api/chat') return next();
  const origin = request.headers.get('Origin');
  const ok = !!origin && ALLOWED.includes(origin);
  const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const r = await next();
  if (!ok) return r;
  const h = new Headers(r.headers);
  Object.entries(cors).forEach(([k, v]) => h.set(k, v));
  return new Response(r.body, { status: r.status, headers: h });
}
