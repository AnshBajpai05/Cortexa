import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Plus } from "lucide-react";
import { api } from "./api";

export function MemoryPanel({ workflowId }: { workflowId: string | null }) {
  const [open, setOpen] = useState(false);
  const [memory, setMemory] = useState<{ id: string; key: string; value: string }[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch memory when opened
  useEffect(() => {
    if (open && workflowId) {
      api.fetchMemory(workflowId).then((data) => setMemory(data)).catch(console.error);
    }
  }, [open, workflowId]);

  const handleAdd = async () => {
    if (!workflowId || !newKey || !newValue) return;
    setLoading(true);
    try {
      const added = await api.addMemory(workflowId, newKey, newValue);
      setMemory((prev) => [...prev, added]);
      setNewKey("");
      setNewValue("");
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={!workflowId}>
          <Brain className="h-3.5 w-3.5 text-accent" />
          Memory
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-surface border-l border-border sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" />
            Workspace Memory
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Stored Context</h4>
            {memory.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                No memory items stored. Add key-value pairs below.
              </p>
            ) : (
              <ul className="space-y-3">
                {memory.map((item) => (
                  <li key={item.id} className="bg-surface-elevated border border-border rounded-md p-3">
                    <p className="text-xs font-mono text-accent">{item.key}</p>
                    <p className="mt-1 text-sm">{item.value}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Add Context</h4>
            <div className="space-y-3">
              <Input 
                placeholder="Key (e.g. workspace_context)" 
                value={newKey} onChange={(e) => setNewKey(e.target.value)} 
                className="bg-surface-elevated"
              />
              <Textarea 
                placeholder="Value..." 
                value={newValue} onChange={(e) => setNewValue(e.target.value)}
                className="bg-surface-elevated h-24"
              />
              <Button onClick={handleAdd} disabled={loading || !newKey || !newValue} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Add to Memory
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
