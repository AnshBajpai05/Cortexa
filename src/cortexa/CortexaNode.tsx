import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Loader2, Check, AlertTriangle, Brain } from "lucide-react";
import { PALETTE_BY_KIND, type CortexaNodeData } from "@/cortexa/types";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<CortexaNodeData["status"], string> = {
  queued: "node-queued",
  running: "node-running",
  completed: "node-completed",
  failed: "node-failed",
};

function StatusIcon({ status }: { status: CortexaNodeData["status"] }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
  if (status === "completed") return <Check className="h-3.5 w-3.5 text-accent" />;
  if (status === "failed") return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  return <span className="h-2 w-2 rounded-full bg-queued" />;
}

function CortexaNodeComponent({ data, selected }: NodeProps<CortexaNodeData>) {
  const meta = PALETTE_BY_KIND[data.kind];
  const Icon = meta.icon;
  const current = data.attempts[data.attempts.length - 1];
  const usedMemory = current?.usedMemory && data.status === "completed";

  return (
    <div
      className={cn(
        "node-base w-[220px] px-3 py-2.5",
        STATUS_CLASS[data.status],
        selected && "ring-2 ring-primary/60"
      )}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
            meta.accent === "cyan"   && "border-primary/40 bg-primary/10 text-primary",
            meta.accent === "purple" && "border-accent/40 bg-accent/10 text-accent",
            meta.accent === "amber"  && "border-warning/40 bg-warning/10 text-warning"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
              {data.label}
            </p>
            <StatusIcon status={data.status} />
          </div>
          <p className="truncate font-mono text-[10px] text-muted-foreground mt-0.5">
            {meta.subtitle}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {data.status} · att {data.currentAttempt}
        </span>
        {usedMemory && (
          <span title="Workspace memory injected" className="flex items-center gap-1 text-[10px] text-accent">
            <Brain className="h-3 w-3" />
            mem
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const CortexaNode = memo(CortexaNodeComponent);
