import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap,
  addEdge, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type ReactFlowInstance,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import { NodePalette } from "@/cortexa/NodePalette";
import { CortexaNode } from "@/cortexa/CortexaNode";
import { InspectorPanel } from "@/cortexa/InspectorPanel";
import { MemoryPanel } from "@/cortexa/MemoryPanel";
import { LogTimeline } from "@/cortexa/LogTimeline";
import { 
  INITIAL_EDGES, INITIAL_NODES, PALETTE_BY_KIND 
} from "./types";
import type { CortexaNodeData, NodeKind } from "./types";
const AnalyticsPanel = lazy(() => import("./AnalyticsPanel").then((m) => ({ default: m.AnalyticsPanel })));
import { api } from "./api";
import { toast } from "sonner";
import { PIPELINE_TEMPLATES } from "./templates";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, RotateCcw, Activity, MessageSquare, Command as CommandIcon } from "lucide-react";
import { CommandPalette } from "./CommandPalette";
import { Confetti } from "./Confetti";
import { OnboardingTour } from "./OnboardingTour";

const nodeTypes = { cortexa: CortexaNode };

function CortexaCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CortexaNodeData>(INITIAL_NODES as Node<CortexaNodeData>[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES as Edge[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [view, setView] = useState<"canvas" | "analytics">("canvas");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const navigate = useNavigate();

  // ⌘K / Ctrl+K → command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const addNodeByKind = useCallback((kind: string) => {
    const meta = PALETTE_BY_KIND[kind as NodeKind];
    if (!meta) return;
    const position = rfRef.current
      ? rfRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 240 + Math.random() * 120, y: 160 + Math.random() * 120 };
    const id = `n-${kind.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36)}`;
    setNodes((nds) => [
      ...nds,
      {
        id, type: "cortexa", position,
        data: {
          kind: kind as NodeKind, label: meta.title, status: "queued",
          currentAttempt: 1, attempts: [{ attempt: 1, status: "queued" }],
          config: { role: "", goal: "" },
        },
      },
    ]);
  }, [setNodes]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: false }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const posAt = (cx: number, cy: number) =>
      rfRef.current && bounds
        ? rfRef.current.screenToFlowPosition({ x: cx - bounds.left, y: cy - bounds.top })
        : { x: 300, y: 200 };

    // 1. PDF file drop → convert → prefilled Document Ingest node
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        toast.error("Drop a .pdf file");
        return;
      }
      const position = posAt(e.clientX, e.clientY);
      const tId = toast.loading(`Converting ${file.name}…`);
      try {
        const r = await api.convertPdf(file);
        const id = `n-ingest-${Date.now().toString(36)}`;
        setNodes((nds) => [
          ...nds,
          {
            id, type: "cortexa", position,
            data: {
              kind: "memory.ingest" as NodeKind,
              label: r.title || file.name,
              status: "queued",
              currentAttempt: 1,
              attempts: [{ attempt: 1, status: "queued" }],
              config: { mode: "text", source: r.markdown },
              liveOutput: `${r.pages} pages · ${r.chars} chars${r.scanned ? " · ⚠ scanned" : ""}`,
            },
          },
        ]);
        toast.success(`Ingested ${file.name} · ${r.pages}p`, {
          id: tId,
          description: r.scanned ? "Scanned PDF — little/no embedded text" : undefined,
        });
      } catch (err: any) {
        toast.error("PDF convert failed", { id: tId, description: String(err?.message ?? err) });
      }
      return;
    }

    // 2. Palette node drag
    const kind = e.dataTransfer.getData("application/cortexa-node") as NodeKind;
    if (!kind || !rfRef.current || !wrapperRef.current) return;
    const meta = PALETTE_BY_KIND[kind];
    const position = posAt(e.clientX, e.clientY);
    const id = `n-${kind.replace(/[^a-z0-9]/gi, "")}-${Date.now().toString(36)}`;
    const newNode: Node<CortexaNodeData> = {
      id, type: "cortexa", position,
      data: {
        kind,
        label: meta.title,
        status: "queued",
        currentAttempt: 1,
        attempts: [{ attempt: 1, status: "queued" }],
        config: { role: "", goal: "" },
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const handleConfigChange = useCallback(
    (id: string, patch: Partial<CortexaNodeData["config"]>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n
        )
      );
    },
    [setNodes]
  );

  const resetWorkflow = useCallback(() => {
    setNodes(INITIAL_NODES as Node<CortexaNodeData>[]);
    setEdges(INITIAL_EDGES as Edge[]);
  }, [setNodes, setEdges]);

  const loadTemplate = useCallback((templateId: string) => {
    const template = PIPELINE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    setNodes(template.nodes);
    setEdges(template.edges);
  }, [setNodes, setEdges]);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);

    // Reset UI state to queued
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: {
        ...n.data,
        status: "queued",
        currentAttempt: 1,
        attempts: [{ attempt: 1, status: "queued" }],
      },
    })));
    setEdges((eds) => eds.map((e) => ({ ...e, className: undefined, animated: false })));

    try {
      // 1. Save workflow
      const id = await api.saveWorkflow(nodes, edges, workflowId || undefined);
      setWorkflowId(id);

      // 2. Trigger
      await api.triggerWorkflow(id);

      // 2.5. Live SSE layer — flips node status the instant the worker reports,
      //      instead of waiting for the next 2s poll. Poll below still runs as
      //      the source of truth + fallback if the stream drops.
      let es: EventSource | null = null;
      try {
        es = api.streamEvents(id);
        es.onmessage = (ev) => {
          try {
            const evt = JSON.parse(ev.data);
            if (!evt?.nodeId) return;
            const status =
              evt.status === "started" ? "running" :
              evt.status === "completed" ? "completed" :
              evt.status === "failed" ? "failed" : evt.status;
            const o = evt.outputJson;
            const live =
              typeof o?.text === "string" ? o.text :
              typeof o?.label === "string" ? o.label :
              typeof o?.value === "string" ? o.value : undefined;
            setNodes((prev) =>
              prev.map((n) =>
                n.id === evt.nodeId
                  ? { ...n, data: { ...n.data, status, ...(live ? { liveOutput: live } : {}) } }
                  : n
              )
            );
            // light up edges leaving the active node
            setEdges((eds) =>
              eds.map((e) =>
                e.source === evt.nodeId ? { ...e, animated: true } : e
              )
            );
          } catch { /* ignore malformed event */ }
        };
        es.onerror = () => { /* keep open; recursive poll is the fallback */ };
      } catch { /* EventSource unsupported — poll still works */ }

      // 3. Recursive polling
      const poll = async () => {
        try {
          const data = await api.pollStatus(id);

          setNodes((prevNodes) =>
            prevNodes.map((n) => {
              // Find the run corresponding to this node
              const run = data.runs.find((r) => r.nodeId === n.id);
              if (!run) return n;

              return {
                ...n,
                data: {
                  ...n.data,
                  status: run.status,
                  currentAttempt: run.attempt,
                  output: run.outputs,
                  error: run.error,
                  confidence: run.outputs?.confidence,
                  explanation: run.outputs?.explanation,
                  // Keep attempts history tracking locally
                  attempts: [
                    ...n.data.attempts.filter((a) => a.attempt !== run.attempt),
                    {
                      attempt: run.attempt,
                      status: run.status,
                      qa_feedback: run.inputs?.qa_feedback,
                    },
                  ].sort((a, b) => a.attempt - b.attempt),
                },
              };
            })
          );

          if (!data.isFinished) {
            setTimeout(poll, 2000);
          } else {
            es?.close();
            setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
            if (data.failed > 0) {
              toast.error(`Run finished · ${data.failed} node(s) failed`, {
                description: `${data.completed}/${data.total} completed`,
              });
            } else {
              toast.success(`Run complete · ${data.completed}/${data.total} nodes ✓`);
              setCelebrate((c) => c + 1);
            }
            setRunning(false);
          }
        } catch (err) {
          console.error("Polling error", err);
          es?.close();
          toast.error("Run failed", { description: String((err as Error)?.message ?? err) });
          setRunning(false);
        }
      };

      // Start polling
      setTimeout(poll, 1000);

    } catch (err) {
      console.error("Run failed", err);
      setRunning(false);
    }
  }, [running, nodes, edges, workflowId, setNodes, setEdges]);

  return (
    <div className="flex h-screen w-full min-w-0 flex-col bg-background text-foreground">
      <Confetti trigger={celebrate} />
      <OnboardingTour />
      <CommandPalette
        open={cmdOpen}
        setOpen={setCmdOpen}
        onRun={handleRun}
        onReset={resetWorkflow}
        onToggleTelemetry={() => setView(view === "canvas" ? "analytics" : "canvas")}
        onOpenChat={() => navigate("/chat")}
        onLoadTemplate={loadTemplate}
        onAddNode={addNodeByKind}
      />
      {/* Top bar */}
      <header className="flex min-h-14 shrink-0 flex-col gap-2 border-b border-border bg-surface px-4 py-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:py-0">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-primary">
            <Activity className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Versioned DAG Engine
            </p>
            <h1 className="text-sm font-semibold leading-tight glow-cyan-text">Cortexa</h1>
          </div>
          <span className="ml-3 hidden rounded-md border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] text-muted-foreground md:inline">
            workflow / launch-campaign-v3
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Select onValueChange={loadTemplate} disabled={running}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-surface-elevated">
              <SelectValue placeholder="Load Template..." />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_TEMPLATES.map(t => (
                <SelectItem key={t.id} value={t.id} className="text-xs">
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/chat")}>
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 font-mono text-[11px]"
            onClick={() => setCmdOpen(true)}
            title="Command palette (Ctrl/⌘ + K)"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            K
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`gap-1.5 ${view === "analytics" ? "text-primary bg-primary/10" : ""}`}
            onClick={() => setView(view === "canvas" ? "analytics" : "canvas")}
          >
            <Activity className="h-3.5 w-3.5" />
            Telemetry
          </Button>

          <MemoryPanel workflowId={workflowId} />
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={resetWorkflow} disabled={running}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running}
            className="gap-1.5 bg-gradient-primary text-primary-foreground hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? "Running…" : "Run Workflow"}
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {view === "canvas" ? (
          <>
            <NodePalette />
            <div ref={wrapperRef} className="canvas-grid relative min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={(inst) => (rfRef.current = inst)}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="hsl(var(--border-bright))" />
                <Controls position="bottom-right" showInteractive={false} />
                <MiniMap
                  pannable zoomable
                  maskColor="hsl(var(--background) / 0.7)"
                  style={{ background: "hsl(var(--surface-elevated))", border: "1px solid hsl(var(--border))" }}
                  nodeColor={(n) => {
                    const status = (n.data as CortexaNodeData)?.status;
                    if (status === "completed") return "hsl(var(--accent))";
                    if (status === "running") return "hsl(var(--primary))";
                    if (status === "failed") return "hsl(var(--destructive))";
                    return "hsl(var(--queued))";
                  }}
                />
              </ReactFlow>

              {running && (
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 animate-fade-in rounded-full border border-primary/40 bg-surface-elevated/90 px-3 py-1.5 font-mono text-[11px] text-primary backdrop-blur">
                  <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Run in progress · self-correction loop armed
                </div>
              )}

              <LogTimeline workflowId={workflowId} isRunning={running} />
            </div>
            <InspectorPanel node={selected} onConfigChange={handleConfigChange} />
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading telemetry…</div>}>
              <AnalyticsPanel workflowId={workflowId} />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}

export function CortexaCanvas() {
  return (
    <ReactFlowProvider>
      <CortexaCanvasInner />
    </ReactFlowProvider>
  );
}
