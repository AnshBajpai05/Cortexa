import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  INITIAL_EDGES, INITIAL_NODES, PALETTE_BY_KIND,
  type CortexaNodeData, type NodeKind,
} from "@/cortexa/types";
import { runScriptedSimulation } from "@/cortexa/simulation";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Activity, Brain } from "lucide-react";

const nodeTypes = { cortexa: CortexaNode };

function CortexaCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CortexaNodeData>(INITIAL_NODES as Node<CortexaNodeData>[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES as Edge[]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: false }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/cortexa-node") as NodeKind;
    if (!kind || !rfRef.current || !wrapperRef.current) return;
    const meta = PALETTE_BY_KIND[kind];
    const bounds = wrapperRef.current.getBoundingClientRect();
    const position = rfRef.current.screenToFlowPosition({
      x: e.clientX - bounds.left,
      y: e.clientY - bounds.top,
    });
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

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    // Reset to queued
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

    await runScriptedSimulation({
      setNodes: setNodes as any,
      setEdges: setEdges as any,
      addLog: () => {},
      resetEdges: () => setEdges((eds) => eds.map((e) => ({ ...e, className: undefined, animated: false }))),
    });
    setRunning(false);
  }, [running, setNodes, setEdges]);

  return (
    <div className="flex h-screen w-full min-w-0 flex-col bg-background text-foreground">
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
          <Button variant="outline" size="sm" className="gap-1.5" disabled={running}>
            <Brain className="h-3.5 w-3.5 text-accent" />
            Memory
          </Button>
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
        </div>

        <InspectorPanel node={selected} onConfigChange={handleConfigChange} />
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
