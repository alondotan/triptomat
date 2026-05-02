import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Clock,
  Database,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime } from '@/features/admin/adminUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricRow {
  id: string;
  created_at: string;
  user_id: string | null;
  trip_id: string | null;
  mode: string;
  prompt_tokens: number | null;
  cached_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  ttft_ms: number | null;
  total_ms: number | null;
  tool_names: string[] | null;
  source: string | null;
}

// ---------------------------------------------------------------------------
// Cost formula: Gemini 2.5 Flash (per 1M tokens)
// Input (non-cached): $0.075 | Cached input: $0.01875 | Output: $0.30
// ---------------------------------------------------------------------------
function estimateCost(row: MetricRow): number {
  const prompt = row.prompt_tokens ?? 0;
  const cached = row.cached_tokens ?? 0;
  const output = row.output_tokens ?? 0;
  const nonCached = Math.max(0, prompt - cached);
  return (nonCached * 0.075 + cached * 0.01875 + output * 0.30) / 1_000_000;
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function cacheRatio(row: MetricRow): number {
  if (!row.prompt_tokens || !row.cached_tokens) return 0;
  return Math.round((row.cached_tokens / row.prompt_tokens) * 100);
}

// ---------------------------------------------------------------------------
// Period selector
// ---------------------------------------------------------------------------

const PERIODS = ['24h', '7d', '30d'] as const;
type Period = (typeof PERIODS)[number];

function periodToISO(period: Period): string {
  const ms = { '24h': 86_400_000, '7d': 604_800_000, '30d': 2_592_000_000 }[period];
  return new Date(Date.now() - ms).toISOString();
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

function useMetrics(period: Period) {
  return useQuery({
    queryKey: ['admin', 'ai-metrics', period],
    queryFn: async () => {
      const since = periodToISO(period);
      const { data, error } = await supabase
        .from('ai_chat_metrics')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as MetricRow[];
    },
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Zap;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon size={20} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AIMetricsPage() {
  const [period, setPeriod] = useState<Period>('24h');
  const { data, isLoading, error, refetch } = useMetrics(period);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">{(error as Error).message}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  const rows = data ?? [];
  const totalCalls = rows.length;
  const totalCost = rows.reduce((s, r) => s + estimateCost(r), 0);
  const avgCacheRatio =
    totalCalls > 0
      ? Math.round(rows.reduce((s, r) => s + cacheRatio(r), 0) / totalCalls)
      : 0;
  const latencies = rows.map(r => r.total_ms).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const medianMs = latencies.length > 0 ? latencies[Math.floor(latencies.length / 2)] : null;
  const p95Ms = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Chat Metrics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Token usage, latency, and cost per call
          </p>
        </div>
        <div className="flex items-center gap-2">
          {PERIODS.map(p => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Calls" value={totalCalls} icon={Zap} />
        <StatCard
          label="Avg Cache Ratio"
          value={`${avgCacheRatio}%`}
          sub="cached / prompt tokens"
          icon={Database}
        />
        <StatCard
          label="Median Latency"
          value={formatMs(medianMs)}
          sub={`p95: ${formatMs(p95Ms)}`}
          icon={Clock}
        />
        <StatCard
          label="Estimated Cost"
          value={formatCost(totalCost)}
          sub="Gemini 2.5 Flash pricing"
          icon={Sparkles}
        />
      </div>

      {/* Call-by-call table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Calls ({totalCalls})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No calls recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">Time</th>
                    <th className="text-right px-4 py-2.5 font-medium">Prompt</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cached</th>
                    <th className="text-right px-4 py-2.5 font-medium">Output</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cache%</th>
                    <th className="text-right px-4 py-2.5 font-medium">TTFT</th>
                    <th className="text-right px-4 py-2.5 font-medium">Total</th>
                    <th className="text-right px-4 py-2.5 font-medium">Cost</th>
                    <th className="text-left px-4 py-2.5 font-medium">Tools</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const ratio = cacheRatio(row);
                    return (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {formatDateTime(row.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.prompt_tokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-600">
                          {row.cached_tokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.output_tokens?.toLocaleString() ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={
                              ratio >= 70
                                ? 'text-green-600 font-medium'
                                : ratio >= 40
                                ? 'text-amber-600'
                                : 'text-muted-foreground'
                            }
                          >
                            {ratio > 0 ? `${ratio}%` : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatMs(row.ttft_ms)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMs(row.total_ms)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatCost(estimateCost(row))}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {row.tool_names?.map(t => (
                              <Badge key={t} variant="secondary" className="text-xs px-1.5 py-0">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
