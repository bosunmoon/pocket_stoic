# api/app.py
from pathlib import Path

from fastapi import FastAPI, Depends, Request
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from pocket_stoic.searcher import StoicSearcher
from pocket_stoic.ollama_client import OllamaClient

INDEX_PATH = Path("index/stoic.faiss")
META_PATH = Path("index/stoic_meta.jsonl")

app = FastAPI(title="Pocket Stoic API")
@app.get("/whoami")
def whoami():
    return {"app": "pocket_stoic_api", "cors": True}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---- Startup: load long-lived dependencies once ----
@app.on_event("startup")
def startup():
    app.state.searcher = StoicSearcher(index_path=INDEX_PATH, meta_path=META_PATH)
    # Because you're using an SSH tunnel, Ollama is "local" from this app's POV.
    app.state.ollama = OllamaClient(base_url="http://127.0.0.1:11434")


# ---- Dependency accessors (FastAPI DI) ----
def get_searcher(request: Request) -> StoicSearcher:
    return request.app.state.searcher


def get_ollama(request: Request) -> OllamaClient:
    return request.app.state.ollama


# ---- Request models ----
class QueryIn(BaseModel):
    query: str = Field(..., min_length=1)
    top_n: int = Field(8, ge=1, le=25)


class AnswerIn(BaseModel):
    query: str = Field(..., min_length=1)
    top_n: int = Field(6, ge=1, le=12)
    model: str = Field("phi3:latest")
    temperature: float = Field(0.2, ge=0.0, le=1.5)


# ---- Helpers ----
def build_context(hits, max_chars: int = 3500) -> str:
    parts = []
    total = 0
    for h in hits:
        r = h.record
        citation = r.get("citation", "Unknown")
        text = (r.get("text") or "").replace("\n", " ").strip()
        snippet = text[:600]
        chunk = f"[{citation}]\n{snippet}\n"
        if total + len(chunk) > max_chars:
            break
        parts.append(chunk)
        total += len(chunk)
    return "\n".join(parts)


# ---- Routes ----
@app.get("/health")
def health():
    return {"ok": True}


@app.post("/query")
def query(
    payload: QueryIn,
    searcher: StoicSearcher = Depends(get_searcher),
):
    hits = searcher.query(payload.query, top_n=payload.top_n)
    return {
        "query": payload.query,
        "hits": [
            {
                "final_score": h.final_score,
                "vector_score": h.vector_score,
                "lexical_score": h.lexical_score,
                "citation": h.record.get("citation"),
                "chapter_title": h.record.get("chapter_title"),
                "text": h.record.get("text"),
                "meta_idx": h.meta_idx,
            }
            for h in hits
        ],
    }


@app.post("/answer")
def answer(
    payload: AnswerIn,
    searcher: StoicSearcher = Depends(get_searcher),
    ollama: OllamaClient = Depends(get_ollama),
):
    hits = searcher.query(payload.query, top_n=payload.top_n)
    context = build_context(hits)

    prompt = f"""You are Pocket Stoic, a grounded Stoic assistant.
Answer the user's question using ONLY the context below.
If the context is insufficient, say so and ask a clarifying question.
Cite sources inline like [Marcus Aurelius, Meditations, 5.11].

Question: {payload.query}

Context:
{context}

Write a concise answer with 2-5 bullet points and 1 short closing paragraph.
"""

    text = ollama.generate(
        model=payload.model,
        prompt=prompt,
        temperature=payload.temperature,
        timeout_s=180,
    )

    return {
        "query": payload.query,
        "answer": text,
        "sources": [
            {
                "citation": h.record.get("citation"),
                "chapter_title": h.record.get("chapter_title"),
                "final_score": h.final_score,
                "vector_score": h.vector_score,
                "lexical_score": h.lexical_score,
                "meta_idx": h.meta_idx,
                "text": h.record.get("text"),
            }
            for h in hits
        ],
    }
