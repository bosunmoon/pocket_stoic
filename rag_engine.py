# pocket_stoic/rag_engine.py
from dataclasses import dataclass
from typing import Any, List, Dict, Optional

@dataclass
class Hit:
    doc_id: str
    score: float
    text: str
    meta: Dict[str, Any]

class RagEngine:
    def __init__(self, index, docstore, embedder, reranker=None):
        self.index = index
        self.docstore = docstore
        self.embedder = embedder
        self.reranker = reranker

    def query(self, question: str, top_k: int = 8) -> List[Hit]:
        qvec = self.embedder.embed(question)  # shape: (d,)
        # faiss_search should return [(doc_id, score), ...]
        candidates = self.index.search(qvec, top_k=top_k)

        hits: List[Hit] = []
        for doc_id, score in candidates:
            item = self.docstore.get(doc_id)
            hits.append(Hit(doc_id=doc_id, score=float(score), text=item["text"], meta=item.get("meta", {})))

        if self.reranker:
            hits = self.reranker.rerank(question, hits)

        return hits
