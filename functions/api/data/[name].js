// Public read of an editable content document: the edited copy in KV, else the file shipped in /data.
import { DOCS } from '../../_lib/schema.js';

export async function onRequestGet({ params, env, request }) {
  const name = params.name;
  if (!DOCS.includes(name)) return new Response('Not found', { status: 404 });
  let doc = null;
  try {
    if (env.CONTENT) doc = await env.CONTENT.get('doc:' + name, 'json');
  } catch (e) { /* fall back to the static copy */ }
  if (!doc) {
    const r = await env.ASSETS.fetch(new URL('/data/' + name + '.json', request.url));
    if (!r.ok) return new Response('Not found', { status: 404 });
    doc = await r.json();
  }
  return new Response(JSON.stringify(doc), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=30, s-maxage=30' },
  });
}
