#!/usr/bin/env python3
"""Final pass: all cn(), template, plain className, and multi-line cn blocks."""

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
    r"rounded-(?:l|r|t|b|tl|tr|bl|br)-(?:lg|md|xl|sm|full)"
)

DESIGN_IMPORT_RE = re.compile(
    r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]*designSystem)['\"];"
)
CN_IMPORT_RE = re.compile(r"import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*['\"]([^'\"]+)['\"];")


def should_skip(rel: str) -> bool:
    return any(skip in rel for skip in SKIP_PREFIXES)


def design_import_path(file_path: Path) -> str:
    depth = len(file_path.relative_to(ROOT).parts) - 1
    return "../" * depth + "lib/designSystem"


def cn_import_path(file_path: Path) -> str:
    parts = file_path.relative_to(ROOT).parts
    if parts[0] == "pages":
        return "../components/ui/utils"
    if parts[0] == "components" and len(parts) >= 3:
        return "../ui/utils"
    if parts[0] == "components":
        return "./ui/utils"
    return "../components/ui/utils"


def ensure_imports(content: str, file_path: Path) -> str:
    needs_radius = bool(re.search(r"\bRADIUS\.(chrome|panel|control|inline|editorial|pill)\b", content))
    needs_cn = "cn(" in content and not CN_IMPORT_RE.search(content)

    if needs_radius:
        m = DESIGN_IMPORT_RE.search(content)
        if m:
            original = [n.strip() for n in m.group(1).split(",")]
            if "RADIUS" not in original:
                original.append("RADIUS")
                new_import = f"import {{ {', '.join(original)} }} from '{m.group(2)}';"
                content = content[: m.start()] + new_import + content[m.end() :]
        else:
            line = f"import {{ RADIUS }} from '{design_import_path(file_path)}';\n"
            last = 0
            for match in re.finditer(r"^import .+;$", content, re.MULTILINE):
                last = match.end()
            content = content[:last] + "\n" + line + content[last + 1 :]

    if needs_cn:
        line = f"import {{ cn }} from '{cn_import_path(file_path)}';\n"
        last = 0
        for match in re.finditer(r"^import .+;$", content, re.MULTILINE):
            last = match.end()
        content = content[:last] + "\n" + line + content[last + 1 :]

    return content


def strip_radius(body: str) -> tuple[str, list[str]]:
    if PARTIAL_RADIUS_RE.search(body):
        return body, []
    tokens: list[str] = []
    new_body = body
    for tw, tok in REPLACEMENTS:
        if tw in new_body:
            new_body = re.sub(rf"\s*{re.escape(tw)}\s*", " ", new_body)
            if tok not in tokens:
                tokens.append(tok)
    new_body = re.sub(r"  +", " ", new_body).strip()
    return new_body, tokens


def transform_quoted(match: re.Match) -> str:
    quote = match.group(1)
    body = match.group(2)
    new_body, tokens = strip_radius(body)
    if not tokens:
        return match.group(0)
    parts: list[str] = []
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


def find_cn_calls(content: str) -> list[tuple[int, int, str]]:
    """Return list of (start, end, prefix) for cn( calls."""
    results = []
    for m in re.finditer(r"(className=\{)?cn\(", content):
        prefix = m.group(1) or ""
        start = m.start()
        i = m.end() - 1
        depth = 0
        while i < len(content):
            ch = content[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    results.append((start, i + 1, prefix))
                    break
            i += 1
    return results


def transform_all_cn(content: str) -> tuple[str, bool]:
    changed = False
    calls = find_cn_calls(content)
    # process right-to-left to preserve offsets
    for start, end, prefix in reversed(calls):
        full = content[start:end]
        inner_start = full.index("(") + 1
        inner = full[inner_start:-1]
        new_inner, inner_changed = transform_cn_inner(inner)
        if inner_changed:
            changed = True
            content = content[: start + inner_start] + new_inner + content[end - 1 :]
    return content, changed


def transform_template_classname(content: str) -> tuple[str, bool]:
    changed = False

    def repl(m: re.Match) -> str:
        nonlocal changed
        inner = m.group(1)
        if PARTIAL_RADIUS_RE.search(inner):
            return m.group(0)
        _, tokens = strip_radius(inner)
        if not tokens:
            return m.group(0)
        changed = True
        parts = re.split(r"(\$\{[^}]+\})", inner)
        cn_args: list[str] = []
        static: list[str] = []
        for p in parts:
            if p.startswith("${"):
                if static:
                    s = " ".join(static).strip()
                    s, extra = strip_radius(s)
                    static = []
                    if s:
                        cn_args.append(f'"{s}"')
                    cn_args.extend(extra)
                cn_args.append(p)
            else:
                cleaned, extra = strip_radius(p)
                if extra:
                    if cleaned:
                        static.append(cleaned)
                    cn_args.extend(extra)
                elif cleaned:
                    static.append(cleaned)
        if static:
            s = " ".join(static).strip()
            if s:
                cn_args.append(f'"{s}"')
        cn_args.extend(tokens)
        # dedupe tokens at end
        seen = set()
        deduped = []
        for a in cn_args:
            if a in seen:
                continue
            seen.add(a)
            deduped.append(a)
        return f"className={{cn({', '.join(deduped)})}}"

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
        args = [f'"{new_body}"'] if new_body else []
        args.extend(tokens)
        return f"className={{cn({', '.join(args)})}}"

    content = re.sub(r'className="([^"]*rounded-[^"]*)"', repl, content)
    return content, changed


def process_file(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if should_skip(rel):
        return False
    original = path.read_text(encoding="utf-8")
    if "rounded-" not in original:
        return False
    content = original
    changed = False
    for fn in (transform_all_cn, transform_template_classname, transform_plain_classname):
        content, c = fn(content)
        changed = changed or c
    if not changed:
        return False
    content = re.sub(r",\s*,", ", ", content)
    content = re.sub(r"cn\(\s*,", "cn(", content)
    content = ensure_imports(content, path)
    path.write_text(content, encoding="utf-8")
    return True


def main() -> None:
    paths = sorted(ROOT.rglob("*.tsx")) + sorted(ROOT.rglob("*.ts"))
    updated = [p.relative_to(ROOT).as_posix() for p in paths if process_file(p)]
    print(f"Final pass updated {len(updated)} files")
    for f in updated:
        print(f"  {f}")


if __name__ == "__main__":
    main()
