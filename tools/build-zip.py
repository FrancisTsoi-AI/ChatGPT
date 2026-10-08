#!/usr/bin/env python3
"""Build the upload zip, plus one installable zip per gadget.

dist/homebase-task.francistsoi.com.zip (see DEPLOY.md):
  homebase-upload/web/               <- public/  (document root of the subdomain)
  homebase-upload/homebase-private/  <- private/ (outside the web folder), WITHOUT .env or stored data;
                                        its gadgets/ folder holds every gadget, one folder each
  homebase-upload/{DEPLOY.md,README.md,GADGET_API.md,schema.sql}
dist/gadgets/<type>-<version>.zip    one gadget each, the format the Gadgets page installs
"""
import glob
import json
import os
import shutil
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
    if rel.startswith('gadgets/') and any(p.startswith('.') for p in rel.split('/')[1:]):
        return True  # half-installed staging folders and other dot files never ship
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
    build_gadget_zips()


def build_gadget_zips():
    """dist/gadgets/<type>-<version>.zip: each gadget folder on its own, ready to drop on the Gadgets page."""
    out_dir = os.path.join(ROOT, 'dist', 'gadgets')
    shutil.rmtree(out_dir, ignore_errors=True)
    os.makedirs(out_dir)
    for mf in sorted(glob.glob(os.path.join(ROOT, 'private', 'gadgets', '*', 'manifest.json'))):
        src = os.path.dirname(mf)
        m = json.load(open(mf, encoding='utf-8'))
        name = os.path.join(out_dir, f"{m['type']}-{m.get('version', '1.0.0')}.zip")
        with zipfile.ZipFile(name, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for base, dirs, files in os.walk(src):
                dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
                for f in sorted(files):
                    if f.startswith('.'):
                        continue
                    full = os.path.join(base, f)
                    z.write(full, m['type'] + '/' + os.path.relpath(full, src).replace(os.sep, '/'))
    print(f'{out_dir}: {len(os.listdir(out_dir))} gadget zips')


if __name__ == '__main__':
    main()
