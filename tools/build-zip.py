#!/usr/bin/env python3
"""Build the Home Base release files into dist/ (see DEPLOY.md):

  homebase-setup.php       THE file. Upload it once into the web folder and open it: it installs Home Base
                           (or updates the one already there). Later, drop it on ⋯ → Gadgets & updates to
                           update. It is tools/installer.php + private/src/package.php with the package below
                           appended after __halt_compiler(), so PHP's ZipArchive reads the package from the .php.
  homebase.zip             the same package as a plain zip (for updates if a host refuses .php uploads)
  gadgets/<type>-<v>.zip   each built-in gadget on its own (what the Gadgets page installs)

The package:
  homebase.json                 name, version, built-in gadget versions
  web/…                         public/
  private/src/ bin/ schema.sql .env.example .htaccess storage/ (empty skeleton)
  private/catalog/<type>.zip    the built-in gadgets (installed on a new site, offered on the Gadgets page)
It never contains .env, stored data or installed gadget folders.
"""
import glob
import io
import json
import os
import re
import shutil
import sys
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
STORAGE_DIRS = ['files', 'sessions', 'ratelimit', 'tmp', 'cache']
DOT_OK = {'.htaccess', '.gitkeep', '.env.example'}


def version():
    src = open(os.path.join(ROOT, 'private', 'src', 'gadgets.php'), encoding='utf-8').read()
    return re.search(r"const HB_VERSION = '([0-9.]+)'", src).group(1)


def files_under(src):
    """Relative paths of the files in a folder (sorted; dot files only if a site needs them)."""
    out = []
    for base, dirs, files in os.walk(src):
        dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
        for f in sorted(files):
            if f.startswith('.') and f not in DOT_OK:
                continue
            out.append(os.path.relpath(os.path.join(base, f), src).replace(os.sep, '/'))
    return out


def gadget_zip(folder):
    """One gadget folder as zip bytes, entries under <type>/."""
    m = json.load(open(os.path.join(folder, 'manifest.json'), encoding='utf-8'))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files_under(folder):
            if rel.split('/')[-1].startswith('.'):
                continue
            z.write(os.path.join(folder, rel), m['type'] + '/' + rel)
    return m, buf.getvalue()


def package_entries():
    """(name, bytes) for every entry of the package."""
    gadgets = []
    for mf in sorted(glob.glob(os.path.join(ROOT, 'private', 'gadgets', '*', 'manifest.json'))):
        gadgets.append(gadget_zip(os.path.dirname(mf)))
    info = {'name': 'Home Base', 'version': version(), 'built': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'gadgets': {m['type']: m.get('version', '1.0.0') for m, _ in gadgets}}
    out = [('homebase.json', json.dumps(info, indent=2).encode())]
    pub = os.path.join(ROOT, 'public')
    for rel in files_under(pub):
        out.append(('web/' + rel, open(os.path.join(pub, rel), 'rb').read()))
    priv = os.path.join(ROOT, 'private')
    for part in ('src', 'bin'):
        for rel in files_under(os.path.join(priv, part)):
            out.append((f'private/{part}/{rel}', open(os.path.join(priv, part, rel), 'rb').read()))
    out.append(('private/schema.sql', open(os.path.join(ROOT, 'schema.sql'), 'rb').read()))
    for f in ('.env.example', '.htaccess'):
        out.append(('private/' + f, open(os.path.join(priv, f), 'rb').read()))
    out.append(('private/storage/.htaccess', open(os.path.join(priv, 'storage', '.htaccess'), 'rb').read()))
    for d in STORAGE_DIRS:
        out.append((f'private/storage/{d}/.gitkeep', b''))
    for m, data in gadgets:
        out.append((f"private/catalog/{m['type']}.zip", data))
    return info, gadgets, out


def write_entries(z, entries):
    for name, data in entries:
        zi = zipfile.ZipInfo(name, date_time=time.gmtime()[:6])
        zi.compress_type = zipfile.ZIP_STORED if name.endswith('.zip') else zipfile.ZIP_DEFLATED
        zi.external_attr = 0o100644 << 16
        z.writestr(zi, data)


def installer_stub():
    stub = open(os.path.join(ROOT, 'tools', 'installer.php'), encoding='utf-8').read()
    pkg = open(os.path.join(ROOT, 'private', 'src', 'package.php'), encoding='utf-8').read()
    pkg = pkg.replace('<?php', '', 1).replace('declare(strict_types=1);', '', 1).strip()
    assert '/*@@PACKAGE@@*/' in stub and stub.rstrip().endswith('__halt_compiler();')
    return stub.replace('/*@@PACKAGE@@*/', pkg, 1).rstrip()


def main():
    os.makedirs(DIST, exist_ok=True)
    info, gadgets, entries = package_entries()
    bad = [n for n, _ in entries if n.endswith('/.env') or n.startswith('private/gadgets/') or
           (n.startswith('private/storage/') and not n.endswith(('.gitkeep', '.htaccess')))]
    if bad:
        sys.exit('refusing to ship: ' + ', '.join(bad))

    old = os.path.join(DIST, 'homebase-task.francistsoi.com.zip')  # the two-folder upload zip of versions before 5
    if os.path.exists(old):
        os.remove(old)

    pkg = os.path.join(DIST, 'homebase.zip')
    with zipfile.ZipFile(pkg, 'w', compresslevel=9) as z:
        write_entries(z, entries)

    setup = os.path.join(DIST, 'homebase-setup.php')
    with open(setup, 'w', encoding='utf-8', newline='\n') as f:
        f.write(installer_stub())
    with zipfile.ZipFile(setup, 'a', compresslevel=9) as z:  # appended: offsets count from the start of the .php
        write_entries(z, entries)

    gdir = os.path.join(DIST, 'gadgets')
    shutil.rmtree(gdir, ignore_errors=True)
    os.makedirs(gdir)
    for m, data in gadgets:
        with open(os.path.join(gdir, f"{m['type']}-{m.get('version', '1.0.0')}.zip"), 'wb') as f:
            f.write(data)

    print(f"Home Base {info['version']}: {len(entries)} files, {len(gadgets)} built-in gadgets")
    for p in (setup, pkg):
        print(f'  {os.path.relpath(p, ROOT)}  {os.path.getsize(p) / 1024:.0f} KB')
    print(f'  dist/gadgets/  {len(gadgets)} gadget zips')


if __name__ == '__main__':
    main()
