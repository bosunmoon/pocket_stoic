import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

function scoreFmt(x) {
  if (x === null || x === undefined) return "";
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(4) : String(x);
}

function safeString(x) {
  if (typeof x === "string") return x;
  if (x === null || x === undefined) return "";
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

function Pill({ children }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid #e8e8e8",
        background: "#fafafa",
        color: "#333",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      {children}
    </span>
  );
}

function Sources({ items }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          border: "1px solid #ddd",
          background: "#111",
          color: "white",
          padding: "8px 10px",
          borderRadius: 10,
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        {open ? "Hide" : "Show"} sources <span style={{ opacity: 0.85 }}>({items.length})</span>
      </button>

      {open && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {items.map((h, idx) => {
            const title = h.chapter_title || h.citation || `Source ${idx + 1}`;
            const excerpt = h.text ?? "";
            return (
              <details
                key={idx}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fafafa",
                }}
              >
                <summary style={{ cursor: "pointer", fontWeight: 800 }}>
                  #{idx + 1} — {title}
                </summary>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {"final_score" in h && <Pill>final: <code>{scoreFmt(h.final_score)}</code></Pill>}
                  {"vector_score" in h && <Pill>vec: <code>{scoreFmt(h.vector_score)}</code></Pill>}
                  {"lexical_score" in h && <Pill>lex: <code>{scoreFmt(h.lexical_score)}</code></Pill>}
                </div>

                {h.citation && (
                  <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
                    <b>Citation:</b> {h.citation}{" "}
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(String(h.citation)).catch(() => {})}
                      style={{
                        marginLeft: 8,
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                        color: "#111",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}

                <p style={{ marginTop: 10, marginBottom: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {excerpt}
                </p>

                {excerpt && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(String(excerpt)).catch(() => {})}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "white",
                        color: "#111",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      Copy excerpt
                    </button>
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const initial = [
    { role: "assistant", content: "Ask a Stoic question and I’ll answer using the local corpus." },
  ];

  const [messages, setMessages] = useState(initial);

  const [input, setInput] = useState("what is in my control?");
  const [topN, setTopN] = useState(6);
  const [model, setModel] = useState("phi3:latest");
  const [temperature, setTemperature] = useState(0.2);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ps_history") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("ps_history", JSON.stringify(history));
    } catch {}
  }, [history]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  function addToHistory(q) {
    const next = [q, ...history.filter((x) => x !== q)].slice(0, 10);
    setHistory(next);
  }

  async function send(e) {
    e?.preventDefault();
    if (!canSend) return;

    const userText = input.trim();
    setInput("");
    setError("");

    setMessages((m) => [...m, { role: "user", content: userText }]);
    addToHistory(userText);
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
        throw new Error(typeof raw === "string" ? raw : safeString(raw));
      }

      if (typeof raw !== "object" || !raw) {
        throw new Error("Expected JSON object from /answer");
    }

      const answerText = typeof raw.answer === "string" ? raw.answer : "";
      const sources = Array.isArray(raw.sources) ? raw.sources : [];

      if (!answerText) {
        throw new Error("Missing 'answer' field in /answer response");
      } 
        (typeof raw === "string" ? raw : "");

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: safeString(answerText) || "(No answer field returned from /answer)",
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

  function clearChat() {
    setMessages(initial);
    setError("");
  }

  function copyLastAnswer() {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant" && messages[i].content) {
        navigator.clipboard.writeText(String(messages[i].content)).catch(() => {});
        break;
      }
    }
  }

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "32px auto",
        padding: "0 16px",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#111",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, letterSpacing: -0.2 }}>Pocket Stoic</h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7 }}>
            Local RAG chat backed by your Stoic corpus. <span style={{ fontFamily: "monospace" }}>{API_BASE}</span>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={`${API_BASE}/docs`}
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              color: "#111",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            API Docs
          </a>

          <button
            type="button"
            onClick={copyLastAnswer}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Copy answer
          </button>

          <button
            type="button"
            onClick={clearChat}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>
        {/* Chat */}
        <div style={{ border: "1px solid #e6e6e6", borderRadius: 16, padding: 14, minHeight: 420, background: "white" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                {m.role === "user" ? "You" : "Pocket Stoic"}
              </div>

              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {m.content}
              </div>

              {m.sources && <Sources items={m.sources} />}

              {m.error && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #f3b3b3",
                    background: "#ffecec",
                  }}
                >
                  <b>Error:</b> {m.error}
                </div>
              )}
            </div>
          ))}

          {loading && <div style={{ opacity: 0.7 }}>Thinking…</div>}
        </div>

        {/* Settings + History */}
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ border: "1px solid #e6e6e6", borderRadius: 16, padding: 14, background: "white" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Settings</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800 }}>top_n</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800 }}>model</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 800 }}>temperature</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={1.5}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd" }}
                />
              </label>
            </div>

            <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
              Tip: Ctrl+Enter (or Cmd+Enter) sends.
            </div>
          </div>

          <div style={{ border: "1px solid #e6e6e6", borderRadius: 16, padding: 14, background: "white" }}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Recent prompts</div>

            {history.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>No history yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setInput(h)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #eee",
                      background: "#fafafa",
                      cursor: "pointer",
                      lineHeight: 1.25,
                      fontWeight: 700,
                    }}
                    title={h}
                  >
                    {h.length > 90 ? h.slice(0, 90) + "…" : h}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={send} style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something…"
          style={{
            flex: 1,
            padding: "12px 12px",
            borderRadius: 14,
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
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid #111",
            background: canSend ? "#111" : "#eee",
            color: canSend ? "white" : "#111",
            cursor: canSend ? "pointer" : "not-allowed",
            fontWeight: 900,
          }}
        >
          Send
        </button>
      </form>

      {error && !loading && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f3b3b3", background: "#ffecec", borderRadius: 12 }}>
          <b>Last error:</b> {error}
        </div>
      )}
    </div>
  );
}