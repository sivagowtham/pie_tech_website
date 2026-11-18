#!/usr/bin/env python3
"""Builds deploy/pietech-site-directadmin.zip: the website laid out exactly as it goes into public_html on an
ordinary PHP host (DirectAdmin, cPanel...). Cloudflare-only files (functions/, _headers) and the 220 MB of original
photos are left out. Run from the repository root:  python3 tools/make_directadmin_zip.py"""
import os, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'deploy', 'pietech-site-directadmin.zip')
SKIP_DIRS = {'.git', 'functions', 'photos', 'tools', 'server-php', 'deploy', 'node_modules', '__pycache__'}
SKIP_FILES = {'README.md', '_headers', '.gitignore'}
SP = os.path.join(ROOT, 'server-php')

extra = {  # file in the zip -> source file
    'server/api.php': 'api.php',
    'server/.htaccess': 'htaccess-server.txt',
    'media/.htaccess': 'htaccess-media.txt',
    'admin/.htaccess': 'htaccess-admin.txt',
    '.htaccess': 'htaccess-root.txt',
    '_setup/make-config.html': 'make-config.html',
    '_setup/config.sample.php': 'config.sample.php',
    '_setup/README-DirectAdmin.md': 'README-DirectAdmin.md',
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
n = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            if f in SKIP_FILES or d == ROOT and f.startswith('.'):
                continue
            full = os.path.join(d, f)
            z.write(full, os.path.relpath(full, ROOT).replace(os.sep, '/')); n += 1
    for dest, src in extra.items():
        z.write(os.path.join(SP, src), dest); n += 1
    z.writestr('media/u/.keep', '')
print(n, 'files,', round(os.path.getsize(OUT) / 1048576, 1), 'MB ->', OUT)
