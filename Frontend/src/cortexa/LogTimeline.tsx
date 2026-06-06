import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, X, Minimize2, Maximize2 } from "lucide-react";
import { api } from "./api";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  nodeId: string;
  status: string;
  message?: string;
  startedAt: string;
}

export function LogTimeline({ workflowId, isRunning }: { workflowId: string | null; isRunning: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!workflowId) return;

    let interval: ReturnType<typeof setInterval>;
    
    const fetchLogs = async () => {
      try {
        const data = await api.pollStatus(workflowId);
        // Extract flat logs from runs
        let extractedLogs: LogEntry[] = [];
        data.runs.forEach((r: any) => {
           if (r.logs && Array.isArray(r.logs)) {
             extractedLogs.push(...r.logs);
           }
        });
        
        extractedLogs = extractedLogs.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
        setLogs(extractedLogs);
      } catch (e) {
        console.error(e);
      }
    };

    if (isRunning) {
      interval = setInterval(fetchLogs, 2000);
    } else {
      // Fetch one last time when done
      fetchLogs();
    }

    return () => clearInterval(interval);
  }, [workflowId, isRunning]);

  if (!workflowId) return null;

  return (
    <div className={cn(
      "absolute bottom-4 left-4 z-10 w-[400px] border border-border bg-surface-overlay backdrop-blur rounded-lg shadow-xl overflow-hidden flex flex-col transition-all duration-300",
      minimized ? "h-[42px]" : "h-[250px]"
    )}>
      <div className="flex h-[42px] shrink-0 items-center justify-between px-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold text-foreground tracking-wide uppercase">Execution Timeline</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimized(!minimized)} className="p-1 hover:bg-surface rounded text-muted-foreground">
            {minimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
          </button>
        </div>
      </div>
      
      {!minimized && (
        <ScrollArea className="flex-1 p-3">
          {logs.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-4">Waiting for logs...</p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 text-[11px] font-mono">
                  <span className="text-muted-foreground shrink-0">
                    [{new Date(log.startedAt).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span className={cn(
                      "font-semibold",
                      log.status === "success" || log.status === "completed" ? "text-accent" : 
                      log.status === "failed" || log.status === "QA_FAILED" ? "text-destructive" :
                      log.status === "retry" ? "text-warning" : "text-primary"
                    )}>
                      {log.nodeId} · {log.status}
                    </span>
                    {log.message && <span className="text-foreground/80 truncate">{log.message}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
