import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Send, ArrowLeft, Loader2, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
}

const SUGGESTIONS = [
  "Research the latest NVIDIA NIM models and summarize with citations",
  "Write a launch headline for an agentic AI platform, then QA it",
  "Draft a 5-slide pitch deck outline about RAG pipelines",
];

function extractText(res: any): { text: string; steps: string[] } {
  const steps: string[] =
    Array.isArray(res?.nodes) ? res.nodes.map((n: any) => n?.data?.label ?? n?.id).filter(Boolean) :
    Array.isArray(res?.steps) ? res.steps : [];
  const text =
    res?.output?.text ??
    res?.finalOutput ??
    res?.output ??
    res?.text ??
    res?.value ??
    (typeof res === "string" ? res : JSON.stringify(res, null, 2));
  return { text: typeof text === "string" ? text : JSON.stringify(text, null, 2), steps };
}

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: prompt }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data?.error) {
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${data.error}` }]);
      } else {
        const { text: out, steps } = extractText(data);
        setMessages((m) => [...m, { role: "assistant", content: out, steps }]);
      }
    } catch (err: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ Request failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Canvas
            </Button>
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-primary">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Agentic Chat
            </p>
            <h1 className="text-sm font-semibold leading-tight glow-cyan-text">Cortexa Assistant</h1>
          </div>
        </div>
        <span className="hidden rounded-md border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] text-muted-foreground sm:inline">
          NL → auto-pipeline → result
        </span>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="mx-auto max-w-3xl space-y-4 px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-4 pt-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary">
                <Sparkles className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Describe a deliverable.</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cortexa builds + runs a multi-agent pipeline, then returns the result.
                </p>
              </div>
              <div className="mt-2 flex w-full max-w-xl flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="rounded-lg border border-border bg-surface-elevated px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-gradient-primary text-primary-foreground"
                    : "border border-border bg-surface-elevated text-foreground"
                )}
              >
                {m.steps && m.steps.length > 0 && (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2">
                    <Workflow className="h-3 w-3 text-primary" />
                    {m.steps.map((s, j) => (
                      <span key={j} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-elevated px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Building + running pipeline…
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            rows={1}
            placeholder="Describe what you want… (Enter to send, Shift+Enter for newline)"
            className="max-h-40 min-h-[44px] flex-1 resize-none bg-surface-elevated"
          />
          <Button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="h-11 gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
