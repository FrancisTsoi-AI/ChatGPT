#!/usr/bin/env python3
"""Build the upload zip: dist/homebase-task.francistsoi.com.zip

Layout inside the zip (see DEPLOY.md):
  homebase-upload/web/               <- public/  (document root of the subdomain)
  homebase-upload/homebase-private/  <- private/ (outside the web folder), WITHOUT .env or stored data
  homebase-upload/{DEPLOY.md,README.md,GADGET_API.md,schema.sql}
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'homebase-task.francistsoi.com.zip')
TOP = 'homebase-upload'
EMPTY_DIRS = ['files', 'sessions', 'ratelimit', 'tmp', 'cache']


def add_tree(z, src, dst, skip=lambda rel: False):
    for base, dirs, files in os.walk(src):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(base, name)
            rel = os.path.relpath(full, src).replace(os.sep, '/')
            if skip(rel):
                continue
            z.write(full, f'{TOP}/{dst}/{rel}')


def skip_private(rel):
    if rel == '.env' or rel.endswith('.log'):
        return True
    if rel.startswith('storage/'):
        parts = rel.split('/')
        # keep only the folder skeleton (.gitkeep) and storage/.htaccess; never stored data
        return not (rel == 'storage/.htaccess' or (len(parts) == 3 and parts[2] == '.gitkeep'))
    return False


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        add_tree(z, os.path.join(ROOT, 'public'), 'web')
        add_tree(z, os.path.join(ROOT, 'private'), 'homebase-private', skip_private)
        z.write(os.path.join(ROOT, 'schema.sql'), f'{TOP}/homebase-private/schema.sql')  # lets the gateway upgrade the database itself
        for d in EMPTY_DIRS:  # make sure the writable folders exist even if .gitkeep was missing
            name = f'{TOP}/homebase-private/storage/{d}/.gitkeep'
            if name not in z.namelist():
                z.writestr(name, '')
        for f in ('DEPLOY.md', 'README.md', 'schema.sql', 'docs/GADGET_API.md'):
            z.write(os.path.join(ROOT, f), f'{TOP}/{os.path.basename(f)}')
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
    bad = [n for n in names if n.endswith('/.env') or '/storage/files/' in n and not n.endswith('.gitkeep')]
    if bad:
        sys.exit('refusing to ship: ' + ', '.join(bad))
    print(f'{OUT}\n{len(names)} files, {os.path.getsize(OUT) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
