// Serves photos uploaded through the admin page (stored in R2). Only the uploads folder is public.
export async function onRequestGet({ params, env }) {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!env.MEDIA || !/^u\/[\w\-./]+$/.test(key) || key.includes('..')) return new Response('Not found', { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
