"""
Translate French locale strings that still match English.
Uses Spanish (es) as source when available, otherwise English.
Usage: python scripts/translate-fr-from-es.py [namespace.json ...]
"""
import json
import re
import sys
import time
from pathlib import Path

from deep_translator import GoogleTranslator

ROOT = Path("client/public/locales")
FILES = [
    "organization.json",
    "documents.json",
    "governance.json",
    "auth.json",
    "common.json",
    "admin.json",
    "errors.json",
    "nav.json",
    "activity.json",
    "onboarding.json",
]
TOKEN_RE = re.compile(r"\{\{[^}]+\}\}")


def should_skip_key(key: str, value: str) -> bool:
    if key.startswith("languageNames."):
        return True
    if len(value) <= 2:
        return True
    if re.fullmatch(r"[0-9%$]+", value):
        return True
    if re.fullmatch(r"[A-Z]{2,5}", value):
        return True
    if re.fullmatch(r"[\w.+-]+@[\w.-]+\.\w+", value):
        return True
    if value.startswith("http://") or value.startswith("https://"):
        return True
    if value == "Colabora":
        return True
    return False


def protect_tokens(text: str):
    tokens = TOKEN_RE.findall(text)
    protected = text
    for i, token in enumerate(tokens):
        protected = protected.replace(token, f"__TK{i}__", 1)
    return protected, tokens


def restore_tokens(text: str, tokens):
    out = text
    for i, token in enumerate(tokens):
        out = out.replace(f"__TK{i}__", token)
    return out


def collect_candidates(en_node, es_node, fr_node, path="", out=None, holder=None):
    if out is None:
        out = []
    if isinstance(en_node, dict) and isinstance(es_node, dict) and isinstance(fr_node, dict):
        for key, en_val in en_node.items():
            if key not in fr_node:
                continue
            child = f"{path}.{key}" if path else key
            es_val = es_node.get(key)
            collect_candidates(en_val, es_val, fr_node[key], child, out, (fr_node, key))
        return out
    if isinstance(en_node, str) and isinstance(fr_node, str):
        fr_val = fr_node if not isinstance(holder, tuple) else None
        if isinstance(holder, tuple):
            fr_val = holder[0][holder[1]]
        es_val = es_node if isinstance(es_node, str) else en_node
        if should_skip_key(path, en_node):
            return out
        if fr_val == en_node and en_node.strip():
            source = es_val if isinstance(es_val, str) and es_val.strip() and es_val != en_node else en_node
            out.append((holder[0], holder[1], source, path, en_node))
    return out


def translate_batch(translator, texts, chunk_size=15):
    results = []
    for i in range(0, len(texts), chunk_size):
        chunk = texts[i : i + chunk_size]
        batch = None
        try:
            batch = translator.translate_batch(chunk)
        except Exception as exc:
            print(f"  batch error: {exc}", flush=True)
        if not batch or len(batch) != len(chunk):
            batch = []
            for text in chunk:
                try:
                    batch.append(translator.translate(text))
                except Exception:
                    batch.append(None)
                time.sleep(0.05)
        else:
            fixed = []
            for text, translated in zip(chunk, batch):
                if translated:
                    fixed.append(translated)
                else:
                    try:
                        fixed.append(translator.translate(text))
                    except Exception:
                        fixed.append(None)
                    time.sleep(0.05)
            batch = fixed
        results.extend(batch)
        print(f"  translated {min(i + chunk_size, len(texts))}/{len(texts)}", flush=True)
        time.sleep(0.15)
    return results


def run():
    arg_files = sys.argv[1:] if len(sys.argv) > 1 else FILES
    translator = GoogleTranslator(source="auto", target="fr")
    total_changed = 0

    for fname in arg_files:
        en_path = ROOT / "en" / fname
        es_path = ROOT / "es" / fname
        fr_path = ROOT / "fr" / fname
        if not en_path.exists() or not fr_path.exists():
            continue
        en_obj = json.loads(en_path.read_text(encoding="utf-8"))
        es_obj = json.loads(es_path.read_text(encoding="utf-8")) if es_path.exists() else en_obj
        fr_obj = json.loads(fr_path.read_text(encoding="utf-8"))

        candidates = collect_candidates(en_obj, es_obj, fr_obj)
        if not candidates:
            print(f"{fname}: nothing to translate", flush=True)
            continue

        print(f"{fname}: translating {len(candidates)} strings...", flush=True)
        texts = []
        token_bank = []
        for _, _, source, _, _ in candidates:
            protected, tokens = protect_tokens(source)
            texts.append(protected)
            token_bank.append(tokens)

        translations = translate_batch(translator, texts)
        file_changes = 0
        for (container, key, _, path, en_val), raw_tr, tokens in zip(candidates, translations, token_bank):
            if not raw_tr:
                continue
            tr = restore_tokens(raw_tr, tokens)
            if tr and tr != en_val:
                container[key] = tr
                file_changes += 1

        if file_changes:
            fr_path.write_text(json.dumps(fr_obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        total_changed += file_changes
        print(f"{fname}: updated {file_changes} strings", flush=True)

    print(f"done: {total_changed} total changes", flush=True)


if __name__ == "__main__":
    run()
