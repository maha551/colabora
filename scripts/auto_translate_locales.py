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
LANGS = {"ar": "ar", "fa": "fa", "ur": "ur", "de": "de", "es": "es", "fr": "fr"}

TOKEN_RE = re.compile(r"\{\{[^}]+\}\}")


def collect_candidates(en_node, tr_node, path="", out=None, holder=None):
    if out is None:
        out = []
    if isinstance(en_node, dict) and isinstance(tr_node, dict):
        for k, ev in en_node.items():
            if k not in tr_node:
                continue
            child_path = f"{path}.{k}" if path else k
            collect_candidates(ev, tr_node[k], child_path, out, (tr_node, k))
        return out
    if isinstance(en_node, list) and isinstance(tr_node, list):
        for i, ev in enumerate(en_node):
            if i >= len(tr_node):
                continue
            collect_candidates(ev, tr_node[i], f"{path}[{i}]", out, (tr_node, i))
        return out
    if isinstance(en_node, str) and isinstance(tr_node, str):
        if should_skip_key(path):
            return out
        if en_node.strip() and tr_node.strip() and en_node == tr_node and not re.fullmatch(r"https?://.*", en_node.strip()):
            out.append((holder[0], holder[1], en_node, path))
    return out


def protect_tokens(text):
    tokens = TOKEN_RE.findall(text)
    protected = text
    for i, t in enumerate(tokens):
        protected = protected.replace(t, f"__TK{i}__", 1)
    return protected, tokens


def restore_tokens(text, tokens):
    out = text
    for i, t in enumerate(tokens):
        out = out.replace(f"__TK{i}__", t)
    return out


def should_skip_key(k):
    return k.startswith("languageNames.")


def translate_texts(translator, texts, chunk_size=20):
    """Translate a list of strings; fall back to single-string calls when batch fails."""
    translations = []
    for i in range(0, len(texts), chunk_size):
        chunk = texts[i : i + chunk_size]
        out = None
        try:
            out = translator.translate_batch(chunk)
        except Exception:
            out = None
        if out is None or len(out) != len(chunk):
            out = []
            for text in chunk:
                try:
                    out.append(translator.translate(text))
                except Exception:
                    out.append(None)
                time.sleep(0.05)
        else:
            repaired = []
            for text, tr in zip(chunk, out):
                if tr:
                    repaired.append(tr)
                else:
                    try:
                        repaired.append(translator.translate(text))
                    except Exception:
                        repaired.append(None)
                    time.sleep(0.05)
            out = repaired
        translations.extend(out)
        time.sleep(0.1)
    return translations


def run():
    en_dir = ROOT / "en"
    total = 0
    changed = 0
    arg_langs = set(sys.argv[1].split(",")) if len(sys.argv) > 1 and sys.argv[1] else set(LANGS.keys())
    arg_files = set(sys.argv[2].split(",")) if len(sys.argv) > 2 and sys.argv[2] else set(FILES)
    max_count = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else 0
    for lang, target in LANGS.items():
        if lang not in arg_langs:
            continue
        translator = GoogleTranslator(source="en", target=target)
        for fname in FILES:
            if fname not in arg_files:
                continue
            en_path = en_dir / fname
            tr_path = ROOT / lang / fname
            if not en_path.exists() or not tr_path.exists():
                continue
            en_obj = json.loads(en_path.read_text(encoding="utf-8"))
            tr_obj = json.loads(tr_path.read_text(encoding="utf-8"))
            file_changed = False
            candidates = collect_candidates(en_obj, tr_obj)
            total += len(candidates)
            if candidates:
                if max_count > 0:
                    candidates = candidates[:max_count]
                texts = []
                token_bank = []
                for _, _, src, _ in candidates:
                    protected, tokens = protect_tokens(src)
                    texts.append(protected)
                    token_bank.append(tokens)
                translations = translate_texts(translator, texts)

                file_changes = 0
                for (container, key, src, _), raw_tr, tokens in zip(candidates, translations, token_bank):
                    if not raw_tr:
                        continue
                    tr = restore_tokens(raw_tr, tokens)
                    if tr and tr != src:
                        container[key] = tr
                        file_changes += 1
                changed += file_changes
                if file_changes > 0:
                    file_changed = True
            if file_changed:
                file_changed = True
                tr_path.write_text(
                    json.dumps(tr_obj, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
    print(f"candidates={total} changed={changed}")


if __name__ == "__main__":
    run()
