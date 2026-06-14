"""List keys where target locale string equals English (likely untranslated)."""
from __future__ import annotations

import json
import pathlib
import sys


def flatten(obj, prefix=""):
    out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            key = f"{prefix}.{k}" if prefix else k
            out.update(flatten(v, key))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out.update(flatten(v, f"{prefix}[{i}]"))
    else:
        out[prefix] = obj
    return out


def main():
    locale_root = pathlib.Path("client/public/locales")
    lang = sys.argv[1] if len(sys.argv) > 1 else "de"
    fname = sys.argv[2] if len(sys.argv) > 2 else "organization.json"
    en = flatten(json.loads((locale_root / "en" / fname).read_text(encoding="utf-8")))
    tr = flatten(json.loads((locale_root / lang / fname).read_text(encoding="utf-8")))
    for k in sorted(en):
        if k not in tr:
            continue
        ev, tv = en[k], tr[k]
        if isinstance(ev, str) and isinstance(tv, str) and ev.strip() and tv.strip() and ev == tv:
            print(f"{k}={repr(ev)[:120]}")


if __name__ == "__main__":
    main()
