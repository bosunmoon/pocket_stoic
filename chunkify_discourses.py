import json
import re
import string
from pathlib import Path
from bs4 import BeautifulSoup

INPUT = Path("discourses.xhtml")
OUTPUT = Path("discourses_chunks.jsonl")

TRANSLATOR = "George Long"
TRANSLATOR_SHORT = "Long"
SOURCE = "Standard Ebooks"

CHAPTER_ID_RE = re.compile(r"^chapter-(\d+)-(\d+)$")

def clean_text(t: str) -> str:
    return re.sub(r"\s+", " ", t).strip()

def split_by_paragraphs(paras: list[str], max_chars: int = 5500) -> list[str]:
    """Greedy grouping of paragraphs to keep chunks roughly under max_chars."""
    out, buf, size = [], [], 0
    for p in paras:
        if not p:
            continue
        if buf and size + len(p) + 1 > max_chars:
            out.append(clean_text(" ".join(buf)))
            buf, size = [], 0
        buf.append(p)
        size += len(p) + 1
    if buf:
        out.append(clean_text(" ".join(buf)))
    return out

def main():
    soup = BeautifulSoup(INPUT.read_text(encoding="utf-8"), "lxml-xml")

    # Remove Standard Ebooks footnote references like <a epub:type="noteref">1</a>
    for a in soup.select('a[epub\\:type="noteref"]'):
        a.decompose()

    # Find all chapter sections by id="chapter-X-Y"
    chapters = []
    chapter_title = ""
    for sec in soup.find_all("section", id=True):
        m = CHAPTER_ID_RE.match(sec["id"])
        if m:
            book = int(m.group(1))
            chap = int(m.group(2))
            hg = sec.find("hgroup")
            if hg:
                #print(hg.contents)[3].get_text(" ", strip=True))
                chapter_title = hg.contents[3].get_text(" ", strip=True)# if len(hg.contents) > 0 else ""
                print(f'Chapter title: {chapter_title}')
                chapters.append((book, chap, sec, chapter_title))
                hg.decompose()
    if not chapters:
        raise RuntimeError('No <section id="chapter-X-Y"> elements found.')

    # Sort by book then chapter
    chapters.sort(key=lambda x: (x[0], x[1]))

    records = []
    for book, chap, sec, chapter_title in chapters:
        paras = [clean_text(p.get_text(" ", strip=True)) for p in sec.find_all("p")]
        paras = [p for p in paras if p]
        if not paras:
            continue

        base_section = f"{book}.{chap}"
        full_text = clean_text(" ".join(paras))

        # Split only if very long (we'll do token-based later)
        parts = split_by_paragraphs(paras, max_chars=5500) if len(full_text) > 6500 else [full_text]

        if len(parts) == 1:
            chunk_id = f"discourses_{book}_{chap}"
            records.append({
                "id": chunk_id,
                "author": "Epictetus",
                "work": "Discourses",
                "section": base_section,
                "chapter_title": chapter_title,
                "translator": TRANSLATOR,
                "translator_short": TRANSLATOR_SHORT,
                "source": SOURCE,
                "citation": f"Epictetus, Discourses, {base_section} ({TRANSLATOR_SHORT})",
                "text": parts[0],
            })
        else:
            for i, part in enumerate(parts):
                suffix = string.ascii_lowercase[i]  # a, b, c...
                section = f"{base_section}{suffix}"
                chunk_id = f"discourses_{book}_{chap}{suffix}"
                records.append({
                    "id": chunk_id,
                    "author": "Epictetus",
                    "work": "Discourses",
                    "section": section,
                    "chapter_title": chapter_title,
                    "translator": TRANSLATOR,
                    "translator_short": TRANSLATOR_SHORT,
                    "source": SOURCE,
                    "citation": f"Epictetus, Discourses, {section} ({TRANSLATOR_SHORT})",
                    "text": part,
                })

    with OUTPUT.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    print(f"Wrote {len(records)} chunks to {OUTPUT}")
    print(f"First chapter: {records[0]['section']}, last: {records[-1]['section']}")

if __name__ == "__main__":
    main()
