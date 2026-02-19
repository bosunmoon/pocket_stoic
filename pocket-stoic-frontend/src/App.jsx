import { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function scoreFmt(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(4) : String(x);
}

function Sources({ items }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "1px solid #ddd",
          background: "white",
          padding: "8px 10px",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {open ? "Hide" : "Show"} sources ({items.length})
      </button>

      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {items.map((h, idx) => (
            <div key={idx} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontWeight: 700 }}>#{idx + 1}</span>
                {h.chapter_title && <span style={{ fontWeight: 600 }}>{h.chapter_title}</span>}
                {h.citation && <span style={{ opacity: 0.75 }}>{h.citation}</span>}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, opacity: 0.85, fontSize: 13 }}>
                {"final_score" in h && <span>final: <code>{scoreFmt(h.final_score)}</code></span>}
                {"vector_score" in h && <span>vec: <code>{scoreFmt(h.vector_score)}</code></span>}
                {"lexical_score" in h && <span>lex: <code>{scoreFmt(h.lexical_score)}</code></span>}
              </div>

              <p style={{ marginTop: 8, marginBottom: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                {h.text ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ask a Stoic question and I’ll answer using the local corpus." },
  ]);

  const [input, setInput] = useState("what is in my control?");
  const [topN, setTopN] = useState(6);
  const [model, setModel] = useState("phi3:latest");
  const [temperature, setTemperature] = useState(0.2);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  async function send(e) {
    e?.preventDefault();
    if (!canSend) return;

    const userText = input.trim();
    setInput("");
    setError("");

    // append user message
    setMessages((m) => [...m, { role: "user", content: userText }]);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userText,
          top_n: topN,
          model,
          temperature,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const raw = contentType.includes("application/json") ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(typeof raw === "string" ? raw : JSON.stringify(raw));
      }

      // Flexible parsing: support different backend shapes
      const answerText =
        (typeof raw === "object" && raw && (raw.answer || raw.response || raw.text)) ||
        (typeof raw === "string" ? raw : "");

      const sources = (typeof raw === "object" && raw && (raw.hits || raw.sources || raw.context)) || [];

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: answerText || "(No answer field returned from /answer)",
          sources: Array.isArray(sources) ? sources : [],
        },
      ]);
    } catch (err) {
      const msg = err?.message ?? String(err);
      setError(msg);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong calling /answer.", error: msg },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 6 }}>Pocket Stoic</h1>
      <p style={{ marginTop: 0, opacity: 0.75 }}>Chat backed by your local RAG pipeline (/answer).</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "12px 0 18px" }}>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          top_n
          <input
            type="number"
            min={1}
            max={12}
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{ width: 80, padding: "8px 8px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center", flex: "1 1 260px" }}>
          model
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          temp
          <input
            type="number"
            step="0.1"
            min={0}
            max={1.5}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            style={{ width: 80, padding: "8px 8px", borderRadius: 10, border: "1px solid #ddd" }}
          />
        </label>
      </div>

      <div style={{ border: "1px solid #e6e6e6", borderRadius: 16, padding: 14, minHeight: 380 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              {m.role === "user" ? "You" : "Pocket Stoic"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{m.content}</div>

            {m.sources && <Sources items={m.sources} />}

            {m.error && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 12, border: "1px solid #f3b3b3", background: "#ffecec" }}>
                <strong>Error:</strong> {m.error}
              </div>
            )}
          </div>
        ))}

        {loading && <div style={{ opacity: 0.7 }}>Thinking…</div>}
      </div>

      {error && !loading && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f3b3b3", background: "#ffecec", borderRadius: 12 }}>
          <strong>Last error:</strong> {error}
        </div>
      )}

      <form onSubmit={send} style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            fontSize: 16,
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(e);
          }}
        />
        <button
          type="submit"
          disabled={!canSend}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: canSend ? "#111" : "#eee",
            color: canSend ? "white" : "#111",
            cursor: canSend ? "pointer" : "not-allowed",
            fontWeight: 700,
          }}
        >
          Send
        </button>
      </form>

      <div style={{ marginTop: 10, opacity: 0.65, fontSize: 13 }}>
        Tip: Ctrl+Enter (or Cmd+Enter) sends.
      </div>
    </div>
  );
}
