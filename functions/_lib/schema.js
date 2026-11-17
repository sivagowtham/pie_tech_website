// Validation for the editable content documents. Anything not listed here is dropped.
export const DOCS = ['news', 'gallery', 'clubs', 'research'];

const str = (v, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const fail = (m) => { throw new Error(m); };

// Image paths we accept: files in the repo, uploaded media, or https links.
export function okImg(u) {
  return typeof u === 'string' && u.length < 400 && (/^\/media\/u\/[\w\-./]+$/.test(u) || /^images\/[\w\-./%+ ]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u));
}
// Page links: another page of this site, or https.
export function okLink(u) {
  return typeof u === 'string' && u.length < 300 && (/^[\w\-]+\.html(\?[\w=&%\-]*)?$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u));
}
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function sanitize(name, d) {
  if (!d || typeof d !== 'object') fail('Invalid data');
  if (name === 'news') {
    const news = arr(d.news, 1000).map((n) => {
      const title = str(n.title, 300);
      if (!title) fail('Every news item needs a title');
      return { date: isoDate(n.date), title, summary: str(n.summary, 3000), images: arr(n.images, 12).filter(okImg) };
    });
    return { news };
  }
  if (name === 'gallery') {
    const photos = arr(d.photos, 3000).map((p) => {
      if (!okImg(p.src)) fail('A photo has an invalid image path');
      return { src: p.src, caption: str(p.caption, 200), album: str(p.album, 80) || 'General', date: isoDate(p.date) };
    });
    return { photos };
  }
  if (name === 'clubs') {
    const categories = arr(d.categories, 20).map((c) => str(c, 80)).filter(Boolean);
    const seen = new Set();
    const clubs = arr(d.clubs, 200).map((c) => {
      const id = str(c.id, 60).toLowerCase();
      if (!/^[a-z0-9-]{2,60}$/.test(id)) fail('Club ids may contain only letters, numbers and hyphens');
      if (seen.has(id)) fail('Duplicate club id: ' + id);
      seen.add(id);
      const out = { id, name: str(c.name, 120), category: str(c.category, 80), summary: str(c.summary, 300), description: str(c.description, 4000), activities: arr(c.activities, 30).map((a) => str(a, 200)).filter(Boolean) };
      if (!out.name) fail('Every club needs a name');
      if (c.page) { if (!okLink(c.page)) fail('Invalid page link for ' + out.name); out.page = c.page; }
      if (c.coordinator) out.coordinator = str(c.coordinator, 200);
      return out;
    });
    return { categories, clubs };
  }
  if (name === 'research') {
    const members = arr(d.members, 300).map((m) => {
      const out = { name: str(m.name, 150) };
      if (!out.name) fail('Every research member needs a name');
      for (const k of ['role', 'qualification', 'area']) if (m[k]) out[k] = str(m[k], 300);
      if (m.bio) out.bio = str(m.bio, 3000);
      return out;
    });
    const areas = arr(d.areas, 60).map((a) => str(a, 120)).filter(Boolean);
    const sections = arr(d.sections, 12).map((s) => {
      const columns = arr(s.columns, 8).map((c) => str(c, 80));
      return { title: str(s.title, 120), columns, items: arr(s.items, 1000).map((r) => columns.map((_, i) => str(Array.isArray(r) ? r[i] : '', 500))) };
    });
    return { members, areas, sections };
  }
  fail('Unknown document');
}
