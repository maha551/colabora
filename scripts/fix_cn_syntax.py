#!/usr/bin/env python3
"""Fix broken cn(..., ${expr}) from radius migration."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "client" / "src"


def fix_content(text: str) -> str:
    # cn(..., ${expr}) -> cn(..., expr) — repeat until stable
    for _ in range(20):
        new = re.sub(
            r"(cn\([^)]*?),\s*\$\{([^}]+)\}",
            r"\1, \2",
            text,
            flags=re.DOTALL,
        )
        if new == text:
            break
        text = new
    # cn(..., ${ at end of paren with multiline — greedy fix for common case
    text = re.sub(
        r"cn\(([^,]+),\s*\"([^\"]*)\"\s*,\s*\$\{\s*",
        r"cn(\1, \"\2\", ",
        text,
    )
    return text


def main() -> None:
    n = 0
    for fp in sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts")):
        orig = fp.read_text(encoding="utf-8")
        if "${" not in orig or "cn(" not in orig:
            continue
        new = fix_content(orig)
        if new != orig:
            fp.write_text(new, encoding="utf-8")
            print(fp.relative_to(ROOT).as_posix())
            n += 1
    print(f"Fixed {n} files")


if __name__ == "__main__":
    main()
