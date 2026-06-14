"""Locale audit: parity and identical-to-English counts."""
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
    root = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path("client/public/locales")
    langs = sys.argv[2:] if len(sys.argv) > 2 else ["de", "es"]
    base = root / "en"
    files = sorted(p.name for p in base.glob("*.json"))

    problems = []
    # Intentionally shared native language labels can match English.
    allowed_identical = {
        ("de", "nav.json", "languageNames.de"),
        ("es", "nav.json", "languageNames.es"),
        # "No" in scheduling context is intentionally concise in Spanish.
        ("es", "organization.json", "schedulingNo"),
    }
    for lang in langs:
        ld = root / lang
        for fname in files:
            en_path = base / fname
            tr_path = ld / fname
            if not tr_path.exists():
                problems.append(f"{lang}/{fname}: missing file")
                continue
            en = flatten(json.loads(en_path.read_text(encoding="utf-8")))
            tr = flatten(json.loads(tr_path.read_text(encoding="utf-8")))
            miss = sorted(set(en) - set(tr))
            extra = sorted(set(tr) - set(en))
            same = []
            for k, v in en.items():
                if k not in tr:
                    continue
                tv, ev = tr[k], v
                if isinstance(ev, str) and isinstance(tv, str):
                    evs, tvs = ev.strip(), tv.strip()
                    if evs and tvs and ev == tv:
                        same.append(k)

            status = ""
            if miss:
                status += f" MISSING:{len(miss)}"
                problems.append(f"{lang}/{fname}:{status} (examples: {miss[:8]})")
            if extra:
                status += f" EXTRA:{len(extra)}"
                problems.append(f"{lang}/{fname}:{status} (examples: {extra[:8]})")
            filtered_same = [k for k in same if (lang, fname, k) not in allowed_identical]
            if filtered_same:
                problems.append(
                    f"{lang}/{fname}: IDENTICAL:{len(filtered_same)} (examples: {filtered_same[:8]})"
                )

    if problems:
        print("\n".join(problems))
        return 1
    print("parity ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
