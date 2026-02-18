import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

INPUT = Path("enchiridion.xhtml")
OUTPUT = Path("enchiridion_chunks.jsonl")

TRANSLATOR = "George Long"
TRANSLATOR_SHORT = "Long"
SOURCE = "Standard Ebooks"

def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()

def main():
    soup = BeautifulSoup(INPUT.read_text(encoding="utf-8"), "lxml-xml")

    # Remove Standard Ebooks footnote references like <a epub:type="noteref">1</a>
    for a in soup.select('a[epub\\:type="noteref"]'):
        a.decompose()

    # Heuristic: sections are usually <section> elements with paragraphs
    sections = [s for s in soup.find_all("section") if s.find("p")]

    # If Standard Ebooks has wrappers, the first section might be front matter.
    # We'll keep only sections that "look like" Enchiridion entries:
    # - contain at least one paragraph of text
    # - not obviously a title/intro (very short)
    candidates = []
    for s in sections:
        paras = [clean_text(p.get_text(" ", strip=True)) for p in s.find_all("p")]
        paras = [t for t in paras if t]
        if not paras:
            continue
        text = clean_text(" ".join(paras))
        if len(text) < 40:
            continue
        candidates.append(text)

    # Enchiridion should have ~53 entries. We'll just enumerate in order.
    chunks = []
    for i, text in enumerate(candidates, start=1):
        section = f"§{i}"
        chunk_id = f"enchiridion_{i}"
        chunks.append({
            "id": chunk_id,
            "author": "Epictetus",
            "work": "Enchiridion",
            "section": section,
            "translator": TRANSLATOR,
            "translator_short": TRANSLATOR_SHORT,
            "source": SOURCE,
            "citation": f"Epictetus, Enchiridion, {section} ({TRANSLATOR_SHORT})",
            "text": text,
        })

    with OUTPUT.open("w", encoding="utf-8") as f:
        for rec in chunks:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Wrote {len(chunks)} chunks to {OUTPUT}")

if __name__ == "__main__":
    main()
