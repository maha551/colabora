#!/usr/bin/env python3
"""Codemod: replace raw rounded-* inside cn()/className={cn(...)} with RADIUS tokens."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "client" / "src"

SKIP_PREFIXES = (
    "lib/designSystem.ts",
    "lib/documentStyles.ts",
    "components/OrganizationManagement/blocks/protocolUi.ts",
    "components/OrganizationManagement/blocks/__tests__/",
)

REPLACEMENTS = [
    ("rounded-xl", "RADIUS.chrome"),
    ("rounded-lg", "RADIUS.panel"),
    ("rounded-md", "RADIUS.control"),
    ("rounded-sm", "RADIUS.inline"),
    ("rounded-none", "RADIUS.editorial"),
    ("rounded-full", "RADIUS.pill"),
]

PARTIAL_RADIUS_RE = re.compile(
    r"rounded-(l|r|t|b|tl|tr|bl|br)(?:-lg|-md|-xl|-sm|-full)?"
)

DESIGN_IMPORT_RE = re.compile(
    r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]*designSystem)['\"];"
)


def should_skip(rel: str) -> bool:
    return any(skip in rel for skip in SKIP_PREFIXES)


def design_import_path(file_path: Path) -> str:
    depth = len(file_path.relative_to(ROOT).parts) - 1
    return "../" * depth + "lib/designSystem"


def ensure_radius_import(content: str, file_path: Path) -> str:
    if not re.search(r"\bRADIUS\.(chrome|panel|control|inline|editorial|pill)\b", content):
        return content

    m = DESIGN_IMPORT_RE.search(content)
    if m:
        original = [n.strip() for n in m.group(1).split(",")]
        if "RADIUS" not in original:
            original.append("RADIUS")
            new_import = f"import {{ {', '.join(original)} }} from '{m.group(2)}';"
            content = content[: m.start()] + new_import + content[m.end() :]
        return content

    import_path = design_import_path(file_path)
    new_line = f"import {{ RADIUS }} from '{import_path}';\n"
    last_import = 0
    for match in re.finditer(r"^import .+;$", content, re.MULTILINE):
        last_import = match.end()
    if last_import:
        return content[:last_import] + "\n" + new_line + content[last_import + 1 :]
    return new_line + content


def clean_class_string(body: str) -> tuple[str, list[str]]:
    if PARTIAL_RADIUS_RE.search(body):
        return body, []
    tokens: list[str] = []
    new_body = body
    for tw_class, token in REPLACEMENTS:
        if tw_class in new_body:
            new_body = re.sub(rf"\s*{re.escape(tw_class)}\s*", " ", new_body)
            tokens.append(token)
    new_body = re.sub(r"  +", " ", new_body).strip()
    return new_body, tokens


def transform_quoted(match: re.Match) -> str:
    quote = match.group(1)
    body = match.group(2)
    new_body, tokens = clean_class_string(body)
    if not tokens:
        return match.group(0)
    parts = []
    if new_body:
        parts.append(f"{quote}{new_body}{quote}")
    parts.extend(tokens)
    return ", ".join(parts)


def transform_cn_inner(inner: str) -> tuple[str, bool]:
    changed = False

    def sub_fn(m: re.Match) -> str:
        nonlocal changed
        result = transform_quoted(m)
        if result != m.group(0):
            changed = True
        return result

    new_inner = re.sub(r'(["\'])([^"\']*rounded-[^"\']*)\1', sub_fn, inner)
    return new_inner, changed


def transform_content(content: str) -> tuple[str, bool]:
    changed = False

    # className={cn(...)} and bare cn(...)
    def cn_replacer(match: re.Match) -> str:
        nonlocal changed
        prefix = match.group(1) or ""
        inner = match.group(2)
        new_inner, inner_changed = transform_cn_inner(inner)
        if inner_changed:
            changed = True
            return f"{prefix}cn({new_inner})"
        return match.group(0)

    content = re.sub(
        r"(className=\{)?cn\(([^()]*(?:\([^()]*\)[^()]*)*)\)",
        cn_replacer,
        content,
    )

    # Simple cn() without nesting — second pass for multiline cn
    while True:
        m = re.search(r"(className=\{)?cn\(", content)
        if not m:
            break
        start = m.end() - 3 if m.group(1) else m.end() - 2
        # find matching paren
        depth = 0
        i = m.end() - 1
        while i < len(content):
            if content[i] == "(":
                depth += 1
            elif content[i] == ")":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        if depth != 0:
            break
        prefix = m.group(1) or ""
        inner = content[m.end() : i]
        new_inner, inner_changed = transform_cn_inner(inner)
        if inner_changed:
            changed = True
            content = content[: m.start()] + f"{prefix}cn({new_inner})" + content[i + 1 :]
        else:
            break

    # className="..." with rounded — convert to className={cn(...)}
    def class_attr_repl(m: re.Match) -> str:
        nonlocal changed
        body = m.group(1)
        new_body, tokens = clean_class_string(body)
        if not tokens:
            return m.group(0)
        changed = True
        parts = []
        if new_body:
            parts.append(f'"{new_body}"')
        parts.extend(tokens)
        return f"className={{cn({', '.join(parts)})}}"

    content = re.sub(
        r'className="([^"]*rounded-[^"]*)"',
        class_attr_repl,
        content,
    )

    content = re.sub(r",\s*,", ", ", content)
    content = re.sub(r"cn\(\s*,", "cn(", content)
    return content, changed


def process_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if should_skip(rel):
        return False
    original = path.read_text(encoding="utf-8")
    if "rounded-" not in original:
        return False
    content, changed = transform_content(original)
    if not changed:
        return False
    content = ensure_radius_import(content, path)
    path.write_text(content, encoding="utf-8")
    return True


def main() -> None:
    paths = sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts"))
    updated = [p.relative_to(ROOT).as_posix() for p in paths if process_file(p)]
    print(f"Updated {len(updated)} files")
    for f in updated:
        print(f"  {f}")


if __name__ == "__main__":
    main()
