#!/usr/bin/env python3
"""Builds functions/kb.json (chat knowledge base) from the generated site pages.
Text is taken verbatim from the pages; navigation/footers are excluded."""
import glob, json, os, re, sys
from bs4 import BeautifulSoup

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
chunks = []
for f in sorted(glob.glob(f'{ROOT}/*.html')):
    name = os.path.basename(f)
    soup = BeautifulSoup(open(f, encoding='utf-8').read(), 'html.parser')
    main = soup.find('main')
    if not main:
        continue
    for t in main.find_all(['script', 'style']):
        t.decompose()
    h1 = main.find('h1')
    title = h1.get_text(' ', strip=True) if h1 else (soup.title.get_text(strip=True).split('|')[0].strip() if soup.title else name)
    if name == 'index.html':
        title = 'PIE Tech home (about, news, courses, contact)'
    for tr in main.find_all('tr'):
        tr.replace_with(' | '.join(c.get_text(' ', strip=True) for c in tr.find_all(['td', 'th'])) + '\n')
    for a in main.find_all('a'):
        pass
    text = main.get_text('\n')
    lines = [re.sub(r'\s+', ' ', l).strip() for l in text.split('\n')]
    lines = [l for l in lines if l and l != title]
    buf, size = [], 0
    def flush():
        global buf, size
        if buf:
            chunks.append({'t': title, 'u': name, 'x': ' '.join(buf)})
        buf, size = [], 0
    for l in lines:
        if size + len(l) > 750 and buf:
            flush()
        buf.append(l); size += len(l) + 1
    flush()

# Data-driven pages (clubs, research): index their JSON so the chat assistant can answer from it.
def add_json(name, title, url, text):
    for i in range(0, len(text), 750):
        chunks.append({'t': title, 'u': url, 'x': text[i:i+750]})
try:
    d = json.load(open(f'{ROOT}/data/clubs.json', encoding='utf-8'))
    for c in d['clubs']:
        t = c['name'] + ' (' + c['category'] + '): ' + c['summary'] + ' ' + c.get('description', '') + ' Activities: ' + '; '.join(c.get('activities', []))
        add_json('clubs', 'Clubs: ' + c['name'], c.get('page') or 'clubs.html', t)
    d = json.load(open(f'{ROOT}/data/research.json', encoding='utf-8'))
    for m in d['members']:
        add_json('research', 'Research member: ' + m['name'], 'research-members.html', ' '.join(str(m.get(k, '')) for k in ('name', 'role', 'qualification', 'area', 'bio')))
    add_json('research', 'Research areas', 'research.html', 'Research areas: ' + '; '.join(d['areas']))
except FileNotFoundError:
    pass
os.makedirs(f'{ROOT}/functions', exist_ok=True)
json.dump(chunks, open(f'{ROOT}/functions/kb.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(chunks), 'chunks', os.path.getsize(f'{ROOT}/functions/kb.json') // 1024, 'KB')
# the site search page reads the same text
os.makedirs(f'{ROOT}/data', exist_ok=True)
json.dump(chunks, open(f'{ROOT}/data/search-index.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
