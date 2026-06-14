#!/usr/bin/env python3
"""Pass 2: template literals, plain className, and cva() strings."""

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


def ensure_cn_import(content: str, file_path: Path) -> str:
    if "cn(" not in content or re.search(r"import.*\bcn\b", content):
        return content
    depth = len(file_path.relative_to(ROOT).parts) - 1
    # guess ui/utils path
    parts = file_path.relative_to(ROOT).parts
    if parts[0] == "components":
        cn_path = "./ui/utils" if len(parts) > 2 else "../ui/utils"
    elif parts[0] == "pages":
        cn_path = "../components/ui/utils"
    else:
        cn_path = "../components/ui/utils"
    line = f"import {{ cn }} from '{cn_path}';\n"
    last_import = 0
    for match in re.finditer(r"^import .+;$", content, re.MULTILINE):
        last_import = match.end()
    return content[:last_import] + "\n" + line + content[last_import + 1 :]


def strip_radius(body: str) -> tuple[str, list[str]]:
    if PARTIAL_RADIUS_RE.search(body):
        return body, []
    tokens: list[str] = []
    new_body = body
    for tw, tok in REPLACEMENTS:
        if tw in new_body:
            new_body = re.sub(rf"\s*{re.escape(tw)}\s*", " ", new_body)
            tokens.append(tok)
    new_body = re.sub(r"  +", " ", new_body).strip()
    return new_body, tokens


def transform_template_classname(content: str) -> tuple[str, bool]:
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        inner = m.group(1)
        if PARTIAL_RADIUS_RE.search(inner):
            return m.group(0)
        new_inner, tokens = strip_radius(inner)
        if not tokens:
            return m.group(0)
        changed = True
        # Split template into static + expressions
        parts = re.split(r"(\$\{[^}]+\})", inner)
        cn_args: list[str] = []
        static_buf = []
        for p in parts:
            if p.startswith("${"):
                if static_buf:
                    s = " ".join(static_buf).strip()
                    s, extra = strip_radius(s)
                    static_buf = []
                    if s:
                        cn_args.append(f'"{s}"')
                    cn_args.extend(extra)
                cn_args.append(p)
            else:
                p_clean, extra = strip_radius(p)
                if extra:
                    if p_clean:
                        static_buf.append(p_clean)
                    cn_args.extend(extra)
                else:
                    static_buf.append(p)
        if static_buf:
            s = " ".join(static_buf).strip()
            if s:
                cn_args.append(f'"{s}"')
        return f"className={{cn({', '.join(cn_args)})}}"

    content = re.sub(r"className=\{`([^`]+)`\}", repl, content)
    return content, changed


def transform_plain_classname(content: str) -> tuple[str, bool]:
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        body = m.group(1)
        new_body, tokens = strip_radius(body)
        if not tokens:
            return m.group(0)
        changed = True
        args = []
        if new_body:
            args.append(f'"{new_body}"')
        args.extend(tokens)
        return f"className={{cn({', '.join(args)})}}"

    content = re.sub(r'className="([^"]*rounded-[^"]*)"', repl, content)
    return content, changed


def transform_cva_strings(content: str) -> tuple[str, bool]:
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        quote = m.group(1)
        body = m.group(2)
        new_body, tokens = strip_radius(body)
        if not tokens:
            return m.group(0)
        changed = True
        args = [f"{quote}{new_body}{quote}"] if new_body else []
        args.extend(tokens)
        return f"cn({', '.join(args)})"

    # cva first arg string containing rounded
    content = re.sub(
        r'cva\(\s*(["\'])([^"\']*rounded-[^"\']*)\1',
        lambda m: f"cva(\n  {repl(m)}",
        content,
    )
    return content, changed


def process_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if should_skip(rel):
        return False
    original = path.read_text(encoding="utf-8")
    if "rounded-" not in original:
        return False
    content = original
    any_changed = False
    for fn in (transform_template_classname, transform_plain_classname, transform_cva_strings):
        content, c = fn(content)
        any_changed = any_changed or c
    if not any_changed:
        return False
    content = ensure_radius_import(content, path)
    content = ensure_cn_import(content, path)
    path.write_text(content, encoding="utf-8")
    return True


def main() -> None:
    paths = sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts"))
    updated = [p.relative_to(ROOT).as_posix() for p in paths if process_file(p)]
    print(f"Pass 2 updated {len(updated)} files")
    for f in updated:
        print(f"  {f}")


if __name__ == "__main__":
    main()
