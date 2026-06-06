import { PALETTE, type PaletteEntry } from "@/cortexa/types";
import { cn } from "@/lib/utils";

const accentRing: Record<string, string> = {
  cyan: "hover:border-primary/60 hover:shadow-[0_0_18px_hsl(var(--primary)/0.25)]",
  purple: "hover:border-accent/60 hover:shadow-[0_0_18px_hsl(var(--accent)/0.25)]",
  amber: "hover:border-warning/60 hover:shadow-[0_0_18px_hsl(var(--warning)/0.25)]",
  green: "hover:border-accent/60 hover:shadow-[0_0_18px_hsl(var(--accent)/0.25)]",
  red: "hover:border-destructive/60 hover:shadow-[0_0_18px_hsl(var(--destructive)/0.25)]",
};
const accentIcon: Record<string, string> = {
  cyan: "border-primary/40 bg-primary/10 text-primary",
  purple: "border-accent/40 bg-accent/10 text-accent",
  amber: "border-warning/40 bg-warning/10 text-warning",
  green: "border-accent/40 bg-accent/10 text-accent",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
};

function PaletteCard({ entry }: { entry: PaletteEntry }) {
  const Icon = entry.icon;
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/cortexa-node", entry.kind);
    e.dataTransfer.effectAllowed = "move";
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group flex cursor-grab items-start gap-2.5 rounded-lg border border-border bg-surface-elevated p-2.5 transition-all active:cursor-grabbing",
        accentRing[entry.accent]
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md border", accentIcon[entry.accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">{entry.title}</p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{entry.subtitle}</p>
      </div>
    </div>
  );
}

export function NodePalette() {
  return (
    <aside className="hidden h-full w-[260px] shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Node Registry
        </p>
        <h2 className="text-sm font-semibold text-foreground">@cortexa/nodes</h2>
      </div>
      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        {PALETTE.map((entry) => (
          <PaletteCard key={entry.kind} entry={entry} />
        ))}
      </div>
      <div className="border-t border-border bg-surface-overlay/40 p-3">
        <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
          Drag any node onto the canvas. Connect handles left → right to define DAG edges.
        </p>
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-primary/80">
          📄 Drop a PDF on the canvas → auto-creates a Document Ingest node.
        </p>
      </div>
    </aside>
  );
}
