import React, { useEffect, useState } from "react";
import { api } from "./api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from "recharts";
import { Activity, Clock, Zap, Target, DollarSign, RefreshCw, Cpu } from "lucide-react";

interface AnalyticsPanelProps {
  workflowId: string | null;
}

const PIE_COLORS = [
  "hsl(180 90% 55%)", "hsl(265 85% 65%)", "hsl(150 80% 55%)",
  "hsl(40 95% 60%)", "hsl(330 85% 65%)", "hsl(210 90% 60%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--surface-elevated))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ workflowId }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadMetrics = async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      setMetrics(await api.fetchMetrics(workflowId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 10000);
    return () => clearInterval(interval);
  }, [workflowId]);

  if (!workflowId)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Target size={48} className="opacity-20" />
        <p className="text-sm">Run a workflow to see telemetry</p>
      </div>
    );

  if (loading && !metrics)
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="animate-spin text-primary" />
      </div>
    );

  const stats = metrics?.summary || {
    avgLatency: 0, totalTokens: 0, successRate: 0, totalCost: 0, retryRate: 0,
  };
  const nodeData = metrics?.nodeBreakdown || [];
  const modelData = (metrics?.modelBreakdown || []).map((m: any) => ({
    name: m.model?.split("/").pop() || m.model,
    value: m.totalTokens || m.count,
  }));
  const hasData = nodeData.length > 0;

  return (
    <div className="flex h-full flex-col gap-8 overflow-y-auto bg-background p-6 text-foreground">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="bg-gradient-primary bg-clip-text text-xl font-bold text-transparent">
            Workflow Telemetry
          </h2>
          <p className="text-xs text-muted-foreground">Real-time performance & cost audit</p>
        </div>
        <button onClick={loadMetrics} className="rounded-full p-2 transition-colors hover:bg-surface-elevated">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {!hasData && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No metrics yet. Run the workflow with live NVIDIA keys to populate telemetry.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard icon={<Clock className="text-primary" />} label="Avg Latency" value={`${(stats.avgLatency ?? 0).toFixed(0)}ms`} sub="per node" />
        <StatCard icon={<Zap className="text-warning" />} label="Total Tokens" value={(stats.totalTokens ?? 0).toLocaleString()} sub="cumulative" />
        <StatCard icon={<Target className="text-accent" />} label="Success Rate" value={`${((stats.successRate ?? 0) * 100).toFixed(1)}%`} sub="execution" />
        <StatCard icon={<DollarSign className="text-accent" />} label="Est. Cost" value={`$${(stats.totalCost ?? 0).toFixed(4)}`} sub="NVIDIA NIM" />
        <StatCard icon={<Activity className="text-destructive" />} label="Retry Rate" value={`${((stats.retryRate ?? 0) * 100).toFixed(1)}%`} sub="self-correction" />
        <StatCard icon={<Cpu className="text-primary" />} label="Avg Attempts" value={`${stats.avgAttempts ?? 1}`} sub="per node" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-8">
        <ChartCard icon={<Clock size={14} className="text-primary" />} title="Latency Breakdown (ms)">
          <BarChart data={nodeData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="nodeId" fontSize={10} axisLine={false} tickLine={false} stroke="hsl(var(--muted-foreground))" />
            <YAxis fontSize={10} axisLine={false} tickLine={false} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--surface-elevated))" }} />
            <Bar dataKey="avgLatency" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={32} />
          </BarChart>
        </ChartCard>

        <ChartCard icon={<Zap size={14} className="text-warning" />} title="Token Consumption per Node">
          <AreaChart data={nodeData}>
            <defs>
              <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="nodeId" fontSize={10} axisLine={false} tickLine={false} stroke="hsl(var(--muted-foreground))" />
            <YAxis fontSize={10} axisLine={false} tickLine={false} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="avgTokens" stroke="hsl(var(--warning))" fillOpacity={1} fill="url(#colorTokens)" />
          </AreaChart>
        </ChartCard>

        {modelData.length > 0 && (
          <ChartCard icon={<Cpu size={14} className="text-accent" />} title="Tokens by Model">
            <PieChart>
              <Pie data={modelData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                {modelData.map((_: any, i: number) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ChartCard>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value, sub }: any) => (
  <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-elevated p-4 transition-all hover:border-primary/30">
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className="font-mono text-2xl font-bold tracking-tight">{value}</div>
    <div className="text-[10px] font-bold uppercase text-muted-foreground/70">{sub}</div>
  </div>
);

const ChartCard = ({ icon, title, children }: any) => (
  <div className="rounded-xl border border-border bg-surface-elevated p-5">
    <h3 className="mb-6 flex items-center gap-2 text-sm font-medium">
      {icon}
      {title}
    </h3>
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);
