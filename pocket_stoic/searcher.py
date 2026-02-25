# pocket_stoic/searcher.py
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

import faiss
from sentence_transformers import SentenceTransformer

MODEL_NAME_DEFAULT = "BAAI/bge-small-en-v1.5"

@dataclass
class Hit:
    meta_idx: int
    vector_score: float
    lexical_score: float
    final_score: float
    record: Dict[str, Any]

STOPWORDS = {
    "a","an","the","and","or","but","if","then","than",
    "what","which","who","whom","whose","when","where","why","how",
    "is","are","was","were","be","been","being",
    "do","does","did","have","has","had",
    "in","on","at","to","from","for","of","with","by","as",
    "my","your","our","their","his","her","its","me","you","we","they"
}

SYNONYM_CANONICAL = {
    "control": "agency",
    "power": "agency",
    "powers": "agency",
}

def normalize_token(token: str) -> str:
    t = token.lower()
    if len(t) > 5 and t.endswith("ing"):
        t = t[:-3]
    elif len(t) > 4 and t.endswith("ed"):
        t = t[:-2]
    elif len(t) > 4 and t.endswith("es"):
        t = t[:-2]
    elif len(t) > 3 and t.endswith("s"):
        t = t[:-1]
    return SYNONYM_CANONICAL.get(t, t)

def tokenize_for_lexical(s: str) -> List[str]:
    tokens = re.findall(r"\b\w+\b", s.lower())
    return [normalize_token(t) for t in tokens if t not in STOPWORDS]

def lexical_score(query_tokens: List[str], passage_text: str, title: str) -> float:
    if not query_tokens:
        return 0.0
    text_tokens = set(tokenize_for_lexical((title or "") + " " + (passage_text or "")))
    if not text_tokens:
        return 0.0

    query_set = set(query_tokens)
    cnt = sum(1 for t in query_set if t in text_tokens)
    return cnt / len(query_set)

def load_meta(meta_path: Path) -> List[Dict[str, Any]]:
    meta: List[Dict[str, Any]] = []
    with meta_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                meta.append(json.loads(line))
    return meta

class StoicSearcher:
    """
    Loads index + meta + embedding model once, and serves queries many times.
    """

    def __init__(
        self,
        index_path: Path,
        meta_path: Path,
        model_name: str = MODEL_NAME_DEFAULT,
        k: int = 40,
        vector_weight: float = 0.85,
        prompt_prefix: str = "Represent this sentence for searching relevant Stoic passages: ",
    ):
        self.index_path = Path(index_path)
        self.meta_path = Path(meta_path)
        self.model_name = model_name
        self.k = k
        self.vector_weight = vector_weight
        self.lexical_weight = 1.0 - vector_weight
        self.prompt_prefix = prompt_prefix

        self.index = faiss.read_index(str(self.index_path))
        self.meta = load_meta(self.meta_path)
        self.model = SentenceTransformer(self.model_name)

    def query(self, query: str, top_n: int = 8) -> List[Hit]:
        query = (query or "").strip()
        if not query:
            return []

        prefixed = f"{self.prompt_prefix}{query}"
        qvec = self.model.encode(
            [prefixed],
            normalize_embeddings=True,
            convert_to_numpy=True,
        ).astype("float32")

        scores, idxs = self.index.search(qvec, self.k)

        q_tokens = tokenize_for_lexical(query)

        candidates: List[Hit] = []
        for score, i in zip(scores[0], idxs[0]):
            if i < 0:
                continue
            i = int(i)
            r = self.meta[i]
            title = r.get("chapter_title") or ""
            lex = lexical_score(q_tokens, r.get("text", ""), title)
            final = self.vector_weight * float(score) + self.lexical_weight * float(lex)
            candidates.append(
                Hit(
                    meta_idx=i,
                    vector_score=float(score),
                    lexical_score=float(lex),
                    final_score=float(final),
                    record=r,
                )
            )

        candidates.sort(key=lambda x: x.final_score, reverse=True)
        return candidates[:top_n]
