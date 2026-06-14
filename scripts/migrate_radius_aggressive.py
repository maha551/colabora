#!/usr/bin/env python3
"""Aggressive pass: any className= with rounded- not partial."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "client" / "src"
SKIP = ("lib/designSystem.ts", "lib/documentStyles.ts", "protocolUi.ts", "__tests__")

REPLACEMENTS = [
    ("rounded-xl", "RADIUS.chrome"),
    ("rounded-lg", "RADIUS.panel"),
    ("rounded-md", "RADIUS.control"),
    ("rounded-sm", "RADIUS.inline"),
    ("rounded-none", "RADIUS.editorial"),
    ("rounded-full", "RADIUS.pill"),
]
# Directional corners only (rounded-l-md), not size tokens like rounded-lg
PARTIAL = re.compile(r"rounded-(?:l|r|t|b|tl|tr|bl|br)-(?:lg|md|xl|sm|full)")
DESIGN_IMPORT_RE = re.compile(
    r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]*designSystem)['\"];"
)
CN_IMPORT_RE = re.compile(r"import\s*\{[^}]*\bcn\b")


def skip_path(rel: str) -> bool:
    return any(s in rel for s in SKIP)


def design_path(fp: Path) -> str:
    return "../" * (len(fp.relative_to(ROOT).parts) - 1) + "lib/designSystem"


def cn_path(fp: Path) -> str:
    p = fp.relative_to(ROOT).parts
    if p[0] == "pages":
        return "../components/ui/utils"
    if p[0] == "components" and len(p) >= 3:
        return "../ui/utils"
    if p[0] == "components":
        return "./ui/utils"
    return "../components/ui/utils"


def ensure_imports(text: str, fp: Path) -> str:
    if re.search(r"\bRADIUS\.", text):
        m = DESIGN_IMPORT_RE.search(text)
        if m and "RADIUS" not in m.group(1):
            names = [n.strip() for n in m.group(1).split(",")] + ["RADIUS"]
            text = text[: m.start()] + f"import {{ {', '.join(names)} }} from '{m.group(2)}';" + text[m.end() :]
        elif not m:
            line = f"import {{ RADIUS }} from '{design_path(fp)}';\n"
            i = max((x.end() for x in re.finditer(r"^import .+;$", text, re.M)), default=0)
            text = text[:i] + "\n" + line + text[i + 1 :]
    if "cn(" in text and not CN_IMPORT_RE.search(text):
        line = f"import {{ cn }} from '{cn_path(fp)}';\n"
        i = max((x.end() for x in re.finditer(r"^import .+;$", text, re.M)), default=0)
        text = text[:i] + "\n" + line + text[i + 1 :]
    return text


def convert_body(body: str) -> tuple[str, list[str]]:
    if PARTIAL.search(body):
        return body, []
    tokens = []
    nb = body
    for tw, tok in REPLACEMENTS:
        if tw in nb:
            nb = re.sub(rf"\s*{re.escape(tw)}\s*", " ", nb)
            tokens.append(tok)
    nb = re.sub(r"  +", " ", nb).strip()
    return nb, tokens


def process(text: str) -> tuple[str, bool]:
    changed = False

    def fix_attr(m: re.Match) -> str:
        nonlocal changed
        quote, body = m.group(1), m.group(2)
        if PARTIAL.search(body):
            return m.group(0)
        nb, tokens = convert_body(body)
        if not tokens:
            return m.group(0)
        changed = True
        args = [f"{quote}{nb}{quote}"] if nb else []
        args.extend(tokens)
        return f"className={{cn({', '.join(args)})}}"

    text = re.sub(
        r"className=([\"'])([^\"']*rounded-[^\"']*)\1",
        fix_attr,
        text,
    )

    # className={`...`}
    def fix_tpl(m: re.Match) -> str:
        nonlocal changed
        body = m.group(1)
        if PARTIAL.search(body):
            return m.group(0)
        nb, tokens = convert_body(body)
        if not tokens:
            return m.group(0)
        changed = True
        parts = re.split(r"(\$\{[^}]+\})", body)
        args = []
        buf = []
        for p in parts:
            if p.startswith("${"):
                if buf:
                    s = " ".join(buf).strip()
                    s, ex = convert_body(s)
                    buf = []
                    if s:
                        args.append(f'"{s}"')
                    args.extend(ex)
                args.append(p)
            else:
                c, ex = convert_body(p)
                if ex:
                    if c:
                        buf.append(c)
                    args.extend(ex)
                elif c:
                    buf.append(c)
        if buf:
            s = " ".join(buf).strip()
            if s:
                args.append(f'"{s}"')
        for t in tokens:
            if t not in args:
                args.append(t)
        return f"className={{cn({', '.join(args)})}}"

    text = re.sub(r"className=\{`([^`]+)`\}", fix_tpl, text)

    return text, changed


def main() -> None:
    n = 0
    for fp in sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts")):
        rel = fp.relative_to(ROOT).as_posix()
        if skip_path(rel):
            continue
        orig = fp.read_text(encoding="utf-8")
        if "rounded-" not in orig:
            continue
        new, ch = process(orig)
        if not ch:
            continue
        new = ensure_imports(new, fp)
        fp.write_text(new, encoding="utf-8")
        print(rel)
        n += 1
    print(f"Updated {n} files")


if __name__ == "__main__":
    main()
