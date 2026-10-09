#!/usr/bin/env python3
"""Make a variant of a Home Base package for the tests (a newer version, a changed file, a bumped gadget, a bad entry).

  make-package.py SRC.zip DEST [--version V] [--put NAME=TEXT] [--append NAME=TEXT] [--drop NAME]
                               [--gadget TYPE=VERSION] [--raw NAME=TEXT] [--setup STUB.php]

--raw adds an entry with any name (for refused-package tests); --setup writes DEST as a one-file installer, using the
PHP part of STUB.php (everything up to __halt_compiler();) and appending the package after it.
"""
import argparse
import io
import json
import re
import zipfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dest')
    ap.add_argument('--version')
    ap.add_argument('--put', action='append', default=[])
    ap.add_argument('--append', action='append', default=[])
    ap.add_argument('--drop', action='append', default=[])
    ap.add_argument('--gadget', action='append', default=[])
    ap.add_argument('--raw', action='append', default=[])
    ap.add_argument('--setup')
    a = ap.parse_args()

    src = zipfile.ZipFile(a.src)
    entries = {n: src.read(n) for n in src.namelist()}
    if a.version:
        info = json.loads(entries['homebase.json'])
        info['version'] = a.version
        entries['homebase.json'] = json.dumps(info, indent=2).encode()
    for kv in a.put:
        k, v = kv.split('=', 1)
        entries[k] = v.encode()
    for kv in a.append:
        k, v = kv.split('=', 1)
        entries[k] = entries[k] + v.encode()
    for k in a.drop:
        entries.pop(k, None)
    for kv in a.gadget:
        t, v = kv.split('=', 1)
        name = f'private/catalog/{t}.zip'
        inner = zipfile.ZipFile(io.BytesIO(entries[name]))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
            for n in inner.namelist():
                data = inner.read(n)
                if n.endswith('/manifest.json'):
                    data = re.sub(rb'"version": "[^"]*"', b'"version": "' + v.encode() + b'"', data)
                z.writestr(n, data)
        entries[name] = buf.getvalue()
    raw = [kv.split('=', 1) for kv in a.raw]

    if a.setup:
        stub = open(a.setup, 'rb').read()
        cut = stub.index(b'__halt_compiler();') + len(b'__halt_compiler();')
        with open(a.dest, 'wb') as f:
            f.write(stub[:cut])
        mode = 'a'
    else:
        mode = 'w'
    with zipfile.ZipFile(a.dest, mode, zipfile.ZIP_DEFLATED) as z:
        for n, data in entries.items():
            z.writestr(n, data)
        for n, v in raw:
            z.writestr(zipfile.ZipInfo(n), v.encode())


if __name__ == '__main__':
    main()
