import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  Plane,
  MapPin,
  Mail,
  Zap,
  AlertTriangle,
  BarChart3,
  PieChart,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

interface OverviewStats {
  totalUsers: number;
  activeTrips: number;
  poisCreated: number;
  emailsProcessed: number;
  cacheHitRate: number;
  pipelineErrors24h: number;
}

interface DailyThroughput {
  date: string;
  count: number;
}

interface SourceDistribution {
  source: string;
  count: number;
  color: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockStats: OverviewStats = {
  totalUsers: 142,
  activeTrips: 87,
  poisCreated: 2_341,
  emailsProcessed: 518,
  cacheHitRate: 73.2,
  pipelineErrors24h: 3,
};

const mockDailyThroughput: DailyThroughput[] = [
  { date: '2026-02-25', count: 45 },
  { date: '2026-02-26', count: 62 },
  { date: '2026-02-27', count: 38 },
  { date: '2026-02-28', count: 71 },
  { date: '2026-03-01', count: 55 },
  { date: '2026-03-02', count: 48 },
  { date: '2026-03-03', count: 33 },
];

const mockSourceDistribution: SourceDistribution[] = [
  { source: 'Video', count: 124, color: 'bg-blue-500' },
  { source: 'Web', count: 89, color: 'bg-green-500' },
  { source: 'Maps', count: 67, color: 'bg-yellow-500' },
  { source: 'Email', count: 45, color: 'bg-purple-500' },
  { source: 'Text', count: 31, color: 'bg-orange-500' },
];

// ── Component ──────────────────────────────────────────────────

const statCards = [
  { label: 'Total Users', icon: Users, key: 'totalUsers' as const, format: (v: number) => v.toLocaleString() },
  { label: 'Active Trips', icon: Plane, key: 'activeTrips' as const, format: (v: number) => v.toLocaleString() },
  { label: 'POIs Created', icon: MapPin, key: 'poisCreated' as const, format: (v: number) => v.toLocaleString() },
  { label: 'Emails Processed', icon: Mail, key: 'emailsProcessed' as const, format: (v: number) => v.toLocaleString() },
  { label: 'Cache Hit Rate', icon: Zap, key: 'cacheHitRate' as const, format: (v: number) => `${v}%` },
  { label: 'Pipeline Errors (24h)', icon: AlertTriangle, key: 'pipelineErrors24h' as const, format: (v: number) => v.toString() },
];

export default function OverviewPage() {
  // TODO: Replace with real API call
  const { data: stats } = useQuery<OverviewStats>({
    queryKey: ['admin', 'overview-stats'],
    queryFn: async () => mockStats,
  });

  // TODO: Replace with real API call
  const { data: throughput } = useQuery<DailyThroughput[]>({
    queryKey: ['admin', 'daily-throughput'],
    queryFn: async () => mockDailyThroughput,
  });

  // TODO: Replace with real API call
  const { data: sources } = useQuery<SourceDistribution[]>({
    queryKey: ['admin', 'source-distribution'],
    queryFn: async () => mockSourceDistribution,
  });

  const maxThroughput = Math.max(...(throughput ?? []).map(d => d.count), 1);
  const totalSources = (sources ?? []).reduce((sum, s) => sum + s.count, 0);

  return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Overview</h2>

        {/* Stat cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((card) => {
            const Icon = card.icon;
            const value = stats?.[card.key] ?? 0;
            const isError = card.key === 'pipelineErrors24h' && value > 0;

            return (
              <Card key={card.key}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p className={`text-2xl font-bold ${isError ? 'text-destructive' : 'text-foreground'}`}>
                        {card.format(value)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart: Daily pipeline throughput */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 size={18} />
                Daily Pipeline Throughput (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-48">
                {(throughput ?? []).map((day) => {
                  const heightPercent = (day.count / maxThroughput) * 100;
                  const dateLabel = new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' });

                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-muted-foreground font-medium">{day.count}</span>
                      <div className="w-full bg-muted rounded-t-md overflow-hidden flex flex-col justify-end" style={{ height: '100%' }}>
                        <div
                          className="w-full bg-primary rounded-t-md transition-all"
                          style={{ height: `${heightPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{dateLabel}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Donut chart placeholder: Source type distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart size={18} />
                Source Type Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-8">
                {/* Donut placeholder */}
                <div className="relative w-36 h-36 shrink-0">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    {(() => {
                      let offset = 0;
                      const strokeColors = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
                      return (sources ?? []).map((source, i) => {
                        const pct = totalSources > 0 ? (source.count / totalSources) * 100 : 0;
                        const el = (
                          <circle
                            key={source.source}
                            cx="18"
                            cy="18"
                            r="15.915"
                            fill="none"
                            stroke={strokeColors[i % strokeColors.length]}
                            strokeWidth="3"
                            strokeDasharray={`${pct} ${100 - pct}`}
                            strokeDashoffset={`${-offset}`}
                          />
                        );
                        offset += pct;
                        return el;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-bold text-foreground">{totalSources}</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="space-y-2 flex-1">
                  {(sources ?? []).map((source) => (
                    <div key={source.source} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${source.color}`} />
                        <span className="text-sm text-foreground">{source.source}</span>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground">
                        {source.count} ({totalSources > 0 ? ((source.count / totalSources) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
