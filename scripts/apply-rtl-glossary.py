"""Apply glossary term fixes to RTL locale JSON files after MT."""
from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path("client/public/locales")
LANGS = ("ar", "fa", "ur")
FILES = ("governance.json", "organization.json", "documents.json")

# Whole-value replacements when MT left English or used inconsistent terms
REPLACEMENTS: dict[str, dict[str, str]] = {
    "ar": {
        "Representative": "ممثل",
        "Representatives": "الممثلون",
        "Election": "انتخاب",
        "Elections": "الانتخابات",
        "Quorum": "النصاب",
        "Governance": "الحوكمة",
        "Transparency": "الشفافية",
        "Amendment": "تعديل",
        "Amendments": "التعديلات",
        "Nomination": "ترشيح",
        "Resignation": "استقالة",
        "Bootstrap mode": "وضع الإقلاع",
        "Mistrust vote": "تصويت عدم الثقة",
        "Agreed document": "المستند المتفق عليه",
    },
    "fa": {
        "Representative": "نماینده",
        "Representatives": "نمایندگان",
        "Election": "انتخابات",
        "Elections": "انتخابات",
        "Quorum": "حد نصاب",
        "Governance": "مشارکت",
        "Transparency": "شفافیت",
        "Amendment": "اصلاحیه",
        "Amendments": "اصلاحیه‌ها",
        "Nomination": "نامزدی",
        "Resignation": "استعفا",
        "Bootstrap mode": "حالت راه‌اندازی اولیه",
        "Mistrust vote": "رأی‌گیری عدم اعتماد",
        "Agreed document": "سند توافق‌شده",
    },
    "ur": {
        "Representative": "نمائندہ",
        "Representatives": "نمائندے",
        "Election": "انتخابات",
        "Elections": "انتخابات",
        "Quorum": "نصاب",
        "Governance": "نظم و نسق",
        "Transparency": "شفافیت",
        "Amendment": "ترمیم",
        "Amendments": "ترامیم",
        "Nomination": "نامزدگی",
        "Resignation": "استعفی",
        "Bootstrap mode": "ابتدائی سیٹ اپ موڈ",
        "Mistrust vote": "عدم اعتماد کی رائے",
        "Agreed document": "متفقہ دستاویز",
    },
}

TIER_A_KEY_PATTERNS = re.compile(
    r"(representative|election|quorum|mistrust|resign|nomination|bootstrap|transparency|amendment|governance)",
    re.I,
)


def walk_strings(obj, path: str = "", hits: list | None = None):
    if hits is None:
        hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            child = f"{path}.{k}" if path else k
            walk_strings(v, child, hits)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk_strings(v, f"{path}[{i}]", hits)
    elif isinstance(obj, str) and TIER_A_KEY_PATTERNS.search(path):
        hits.append((path, obj))
    return hits


def apply_replacements(text: str, lang: str) -> str:
    out = text
    for en, tr in REPLACEMENTS[lang].items():
        out = re.sub(rf"\b{re.escape(en)}\b", tr, out)
    return out


def main():
    changed = 0
    for lang in LANGS:
        for fname in FILES:
            path = ROOT / lang / fname
            if not path.exists():
                continue
            data = json.loads(path.read_text(encoding="utf-8"))
            file_changed = False
            for key_path, value in walk_strings(data):
                new_val = apply_replacements(value, lang)
                if new_val != value:
                    parts = key_path.split(".")
                    node = data
                    for p in parts[:-1]:
                        node = node[p]
                    node[parts[-1]] = new_val
                    file_changed = True
                    changed += 1
            if file_changed:
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                print(f"updated {lang}/{fname}")
    print(f"glossary_fixes={changed}")


if __name__ == "__main__":
    main()
