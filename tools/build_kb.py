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
os.makedirs(f'{ROOT}/functions', exist_ok=True)
json.dump(chunks, open(f'{ROOT}/functions/kb.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(chunks), 'chunks', os.path.getsize(f'{ROOT}/functions/kb.json') // 1024, 'KB')
