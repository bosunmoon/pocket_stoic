import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

INPUT = Path("/home/michael-edwards/Desktop/pocket_Stoic/meditations.xhtml")
OUTPUT = Path("/home/michael-edwards/Desktop/pocket_Stoic/meditations_chunks.jsonl")

TRANSLATOR = "George Long"
TRANSLATOR_SHORT = TRANSLATOR.split()[-1]
SOURCE = "Standard Ebooks"

BOOK_RE = re.compile(r"\bbook\s+([ivxlcdm]+)\b", re.IGNORECASE)

ROMAN_MAP = {"i":1,"v":5,"x":10,"l":50,"c":100,"d":500,"m":1000}
def roman_to_int(s: str) -> int:
    s = s.lower().strip()
    total, prev = 0, 0
    for ch in reversed(s):
        val = ROMAN_MAP[ch]
        if val < prev:
            total -= val
        else:
            total += val
            prev = val
    return total

def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()

def main():
    html = INPUT.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, features="xml")
    # Remove footnote reference markers like <a epub:type="noteref">1</a>
    for a in soup.select('a[epub\\:type="noteref"]'):
        a.decompose()
    for sup in soup.find_all("sup"):
        sup.decompose()

    # Standard Ebooks usually uses <section> blocks; but we’ll be robust:
    # Find headings that contain “Book I”, “Book II”, etc.
    headings = []
    for h in soup.find_all(["h1", "h2", "h3"]):
        txt = clean_text(h.get_text(" ", strip=True))
        m = BOOK_RE.search(txt)
        if m:
            headings.append((h, roman_to_int(m.group(1))))

    if not headings:
        raise RuntimeError("Could not find Book headings (e.g., 'Book I') in the XHTML.")

    chunks = []
    for idx, (h, book_num) in enumerate(headings):
        # Collect everything until the next heading (next book)
        next_h = headings[idx + 1][0] if idx + 1 < len(headings) else None

        # walk forward sibling-by-sibling
        section_texts = []
        node = h
        while True:
            node = node.find_next_sibling()
            if node is None or node == next_h:
                break

            # grab paragraphs; skip empty ones
            if node.name == "p":
                t = clean_text(node.get_text(" ", strip=True))
                if t:
                    section_texts.append(t)

            # if the content is nested (e.g., inside <section>), also grab its <p> children
            for p in node.find_all("p", recursive=True) if hasattr(node, "find_all") else []:
                t = clean_text(p.get_text(" ", strip=True))
                if t:
                    section_texts.append(t)

        # De-dup (nested parsing may double-count)
        deduped = []
        seen = set()
        for t in section_texts:
            if t not in seen:
                seen.add(t)
                deduped.append(t)

        # Each paragraph becomes a section (book.section_index)
        for sec_idx, text in enumerate(deduped, start=1):
            section = f"{book_num}.{sec_idx}"
            chunk_id = f"meditations_{book_num}_{sec_idx}"
            record = {
                "id": chunk_id,
                "author": "Marcus Aurelius",
                "work": "Meditations",
                "section": section,
		"chapter-title": "",
                "translator": TRANSLATOR,
                "translator_short": TRANSLATOR_SHORT,
                "source": SOURCE,
                "citation": f"Marcus Aurelius, Meditations, {section} ({TRANSLATOR_SHORT})",
                "text": text,
                # tokens will be filled later once we pick a tokenizer; leave out for now
            }
            chunks.append(record)

    with OUTPUT.open("w", encoding="utf-8") as f:
        for rec in chunks:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Wrote {len(chunks)} chunks to {OUTPUT}")

if __name__ == "__main__":
    main()
