import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Boxes, Command, FileText, Play, BarChart3, MessageSquare, X } from "lucide-react";

const KEY = "cortexa_onboarded_v1";

const STEPS = [
  { icon: Boxes, title: "Drag nodes to build", desc: "Pull any node from the left palette onto the canvas. Connect handles left → right to define the DAG." },
  { icon: FileText, title: "Drop a PDF", desc: "Drop a PDF straight onto the canvas — it auto-converts to markdown and creates a Document Ingest node." },
  { icon: Command, title: "Command palette", desc: "Press ⌘K / Ctrl+K to run, add nodes, load templates, or jump to Chat — without leaving the keyboard." },
  { icon: Play, title: "Run + self-correct", desc: "Hit Run. Nodes light up live (SSE). QA failures feed guided feedback back upstream and retry automatically." },
  { icon: BarChart3, title: "Telemetry", desc: "Open Telemetry for live latency, tokens, cost, success + retry rate, and per-model breakdown." },
  { icon: MessageSquare, title: "Or just chat", desc: "Prefer words? Open Chat — describe a deliverable and Cortexa builds + runs the pipeline for you." },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(KEY); } catch { return false; }
  });
  const [step, setStep] = useState(0);

  if (!open) return null;

  const close = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-[92vw] max-w-md rounded-2xl border border-border bg-surface-elevated p-6 shadow-2xl">
        <button onClick={close} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-overlay" aria-label="Skip">
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>

        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Welcome to Cortexa · {step + 1}/{STEPS.length}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{s.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>

        {/* progress dots */}
        <div className="mt-5 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((x) => x - 1)}>Back</Button>
            )}
            <Button
              size="sm"
              className="bg-gradient-primary text-primary-foreground hover:opacity-90"
              onClick={() => (last ? close() : setStep((x) => x + 1))}
            >
              {last ? "Start building" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
