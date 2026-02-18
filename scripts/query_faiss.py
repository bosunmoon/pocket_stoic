# python3 scripts/query_faiss.py
from pathlib import Path

from pocket_stoic.searcher import StoicSearcher

INDEX_PATH = Path("index/stoic.faiss")
META_PATH = Path("index/stoic_meta.jsonl")

def main():
    searcher = StoicSearcher(index_path=INDEX_PATH, meta_path=META_PATH)

    query = input("Query: ").strip()
    if not query:
        return

    hits = searcher.query(query, top_n=8)

    print("\nTop hits:\n")
    for h in hits:
        r = h.record
        title = f" — {r['chapter_title']}" if r.get("chapter_title") else ""
        print(f"{h.final_score:0.4f} (vec={h.vector_score:0.4f}, lex={h.lexical_score:0.2f})  {r['citation']}{title}")
        print(f"    {r['text'][:260].replace('\\n',' ')}")
        print()

if __name__ == "__main__":
    main()
