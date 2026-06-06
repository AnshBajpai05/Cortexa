import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { PALETTE } from "./types";
import { PIPELINE_TEMPLATES } from "./templates";
import { Play, RotateCcw, Activity, MessageSquare, Plus } from "lucide-react";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  onRun: () => void;
  onReset: () => void;
  onToggleTelemetry: () => void;
  onOpenChat: () => void;
  onLoadTemplate: (id: string) => void;
  onAddNode: (kind: string) => void;
}

export function CommandPalette({
  open, setOpen, onRun, onReset, onToggleTelemetry, onOpenChat, onLoadTemplate, onAddNode,
}: Props) {
  const run = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search nodes…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={run(onRun)}>
            <Play className="mr-2 h-4 w-4" /> Run Workflow
          </CommandItem>
          <CommandItem onSelect={run(onReset)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset Workflow
          </CommandItem>
          <CommandItem onSelect={run(onToggleTelemetry)}>
            <Activity className="mr-2 h-4 w-4" /> Toggle Telemetry
          </CommandItem>
          <CommandItem onSelect={run(onOpenChat)}>
            <MessageSquare className="mr-2 h-4 w-4" /> Open Chat
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Load Template">
          {PIPELINE_TEMPLATES.map((t) => (
            <CommandItem key={t.id} onSelect={run(() => onLoadTemplate(t.id))}>
              {t.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Add Node">
          {PALETTE.map((p) => (
            <CommandItem key={p.kind} value={`add ${p.title} ${p.kind}`} onSelect={run(() => onAddNode(p.kind))}>
              <Plus className="mr-2 h-4 w-4" />
              {p.title}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{p.kind}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
