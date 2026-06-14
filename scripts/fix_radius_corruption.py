#!/usr/bin/env python3
"""Fix corrupted class strings from over-eager rounded-sm/md replacement."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "client" / "src"

FIXES = [
    ("[class*=', RADIUS.inlinesize-']", "[class*='size-']"),
    ("[class*=', RADIUS.controlsize-']", "[class*='size-']"),
    ("[class*=', RADIUS.pillsize-']", "[class*='size-']"),
    ("[class*=', RADIUS.chromesize-']", "[class*='size-']"),
    ("[class*=', RADIUS.panelsize-']", "[class*='size-']"),
]


def main() -> None:
    n = 0
    for fp in ROOT.rglob("*.tsx"):
        text = fp.read_text(encoding="utf-8")
        orig = text
        for old, new in FIXES:
            text = text.replace(old, new)
        if text != orig:
            fp.write_text(text, encoding="utf-8")
            print(fp.relative_to(ROOT).as_posix())
            n += 1
    for fp in ROOT.rglob("*.ts"):
        text = fp.read_text(encoding="utf-8")
        orig = text
        for old, new in FIXES:
            text = text.replace(old, new)
        if text != orig:
            fp.write_text(text, encoding="utf-8")
            print(fp.relative_to(ROOT).as_posix())
            n += 1
    print(f"Fixed {n} files")


if __name__ == "__main__":
    main()
