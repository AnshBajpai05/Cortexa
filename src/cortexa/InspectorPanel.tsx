import { useMemo, useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PALETTE_BY_KIND, type CortexaNodeData } from "@/cortexa/types";
import { Brain, Sparkles, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  node: { id: string; data: CortexaNodeData } | null;
  onConfigChange: (id: string, patch: Partial<CortexaNodeData["config"]>) => void;
}

function ConfidenceRadial({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const tone = value >= 0.8 ? "hsl(var(--accent))" : value >= 0.6 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  return (
    <div className="relative h-16 w-16">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} stroke="hsl(var(--border))" strokeWidth="6" fill="none" />
        <circle
          cx="32" cy="32" r={r} stroke={tone} strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-sm font-semibold text-foreground">{pct}</span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">conf</span>
      </div>
    </div>
  );
}

export function InspectorPanel({ node, onConfigChange }: Props) {
  const [selectedAttempt, setSelectedAttempt] = useState<number | null>(null);

  // Reset selection when switching nodes
  useEffect(() => { setSelectedAttempt(null); }, [node?.id]);

  if (!node) {
    return (
      <aside className="hidden h-full w-[360px] shrink-0 flex-col items-center justify-center border-l border-border bg-surface px-6 text-center lg:flex">
        <div className="rounded-full border border-border bg-surface-elevated p-3">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-4 text-sm font-medium text-foreground">No node selected</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click a node on the canvas to inspect config, outputs, reasoning, and QA history.
        </p>
      </aside>
    );
  }

  const meta = PALETTE_BY_KIND[node.data.kind];
  const Icon = meta.icon;
  const attempts = node.data.attempts;
  const activeAttemptNum = selectedAttempt ?? attempts[attempts.length - 1].attempt;
  const attempt = attempts.find((a) => a.attempt === activeAttemptNum) ?? attempts[attempts.length - 1];

  return (
    <aside className="hidden h-full w-[360px] shrink-0 flex-col border-l border-border bg-surface lg:flex">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border",
            meta.accent === "cyan" && "border-primary/40 bg-primary/10 text-primary",
            meta.accent === "purple" && "border-accent/40 bg-accent/10 text-accent",
            meta.accent === "amber" && "border-warning/40 bg-warning/10 text-warning"
          )}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{node.data.label}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="config" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="m-3 grid grid-cols-2 bg-surface-overlay">
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="trace">Execution Trace</TabsTrigger>
        </TabsList>

        {/* CONFIG TAB */}
        <TabsContent value="config" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 pb-6">
              <div>
                <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Agent Persona
                </Label>
                <div className="mt-2 space-y-2">
                  <div>
                    <Label htmlFor="role" className="text-xs text-muted-foreground">Role</Label>
                    <Input
                      id="role" value={node.data.config.role ?? ""}
                      onChange={(e) => onConfigChange(node.id, { role: e.target.value })}
                      className="mt-1 bg-surface-elevated"
                    />
                  </div>
                  <div>
                    <Label htmlFor="goal" className="text-xs text-muted-foreground">Goal</Label>
                    <Textarea
                      id="goal" value={node.data.config.goal ?? ""} rows={3}
                      onChange={(e) => onConfigChange(node.id, { goal: e.target.value })}
                      className="mt-1 bg-surface-elevated"
                    />
                  </div>
                </div>
              </div>

              {node.data.config.model !== undefined && (
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  <Select
                    value={node.data.config.model}
                    onValueChange={(v) => onConfigChange(node.id, { model: v })}
                  >
                    <SelectTrigger className="mt-1 bg-surface-elevated"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                      <SelectItem value="claude-3.7">claude-3.7</SelectItem>
                      <SelectItem value="image-v3">image-v3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {node.data.config.threshold !== undefined && (
                <div>
                  <Label className="text-xs text-muted-foreground">QA Threshold ({node.data.config.threshold})</Label>
                  <Input
                    type="number" min={0} max={1} step={0.05}
                    value={node.data.config.threshold}
                    onChange={(e) => onConfigChange(node.id, { threshold: Number(e.target.value) })}
                    className="mt-1 bg-surface-elevated"
                  />
                </div>
              )}

              {node.data.config.prompt !== undefined && (
                <div>
                  <Label className="text-xs text-muted-foreground">Prompt</Label>
                  <Textarea
                    rows={4} value={node.data.config.prompt}
                    onChange={(e) => onConfigChange(node.id, { prompt: e.target.value })}
                    className="mt-1 font-mono text-xs bg-surface-elevated"
                  />
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* TRACE TAB */}
        <TabsContent value="trace" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 pb-6">
              {/* Attempt selector */}
              {attempts.length > 1 && (
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Attempt History
                  </Label>
                  <Select
                    value={String(activeAttemptNum)}
                    onValueChange={(v) => setSelectedAttempt(Number(v))}
                  >
                    <SelectTrigger className="mt-2 bg-surface-elevated"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {attempts.map((a) => (
                        <SelectItem key={a.attempt} value={String(a.attempt)}>
                          Attempt {a.attempt} ({a.status}
                          {a.attempt === attempts[attempts.length - 1].attempt ? " · latest" : ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Status + Confidence */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-elevated p-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
                  <div className="mt-1 flex items-center gap-2">
                    {attempt.status === "completed" && <Check className="h-3.5 w-3.5 text-accent" />}
                    {attempt.status === "failed" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                    <span className={cn(
                      "text-sm font-semibold capitalize",
                      attempt.status === "completed" && "text-accent",
                      attempt.status === "failed" && "text-destructive",
                      attempt.status === "running" && "text-primary",
                      attempt.status === "queued" && "text-muted-foreground"
                    )}>{attempt.status}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Attempt {attempt.attempt}
                    </Badge>
                  </div>
                </div>
                {attempt.confidence !== undefined && <ConfidenceRadial value={attempt.confidence} />}
              </div>

              {/* QA Feedback (if retry) */}
              {attempt.qa_feedback && attempt.qa_feedback.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                    <p className="font-mono text-[10px] uppercase tracking-wider text-warning">
                      QA Feedback applied
                    </p>
                  </div>
                  <ul className="mt-2 space-y-1.5 pl-4 text-xs text-foreground">
                    {attempt.qa_feedback.map((f, i) => (
                      <li key={i} className="list-disc marker:text-warning">{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Output */}
              {attempt.output && (
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Output
                  </Label>
                  <div className="mt-2 rounded-lg border border-border bg-surface-elevated p-3">
                    {attempt.output.type === "text" ? (
                      <p className="text-sm leading-relaxed text-foreground">{attempt.output.value}</p>
                    ) : (
                      <div className="flex aspect-video items-center justify-center rounded-md bg-gradient-accent text-xs text-accent-foreground/80">
                        🎨 {attempt.output.value}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reasoning */}
              {attempt.explanation && (
                <div>
                  <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Reasoning
                  </Label>
                  <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 p-3">
                    <p className="text-xs leading-relaxed text-foreground">{attempt.explanation}</p>
                  </div>
                </div>
              )}

              {/* Memory used */}
              {attempt.usedMemory && (
                <div className="flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                  <Brain className="h-3.5 w-3.5 text-accent" />
                  <p className="text-xs text-foreground">Workspace context injected from memory.</p>
                </div>
              )}

              {!attempt.output && !attempt.explanation && (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No output yet. Run the workflow to populate this trace.
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
