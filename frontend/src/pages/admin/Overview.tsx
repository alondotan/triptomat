import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users,
  Plane,
  MapPin,
  Database,
  HardDrive,
  BarChart3,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAdminStats, useCloudWatchMetrics } from '@/hooks/useAdminQueries';
import type {
  AdminStats,
  CloudWatchMetricsResponse,
  S3BucketStats,
  LambdaFunctionMetrics,
} from '@/services/adminService';
import { formatFileSize } from '@/utils/adminUtils';

// ── Helpers ──────────────────────────────────────────────────────

function hasDynamoData(
  stats: AdminStats,
): stats is AdminStats & { dynamodb: { total_items: number; by_status: Record<string, number> } } {
  return !('error' in stats.dynamodb);
}

function hasSupabaseData(
  stats: AdminStats,
): stats is AdminStats & { supabase: { users: number; trips: number; pois: number } } {
  return !('error' in stats.supabase);
}

// ── Stat card definitions ────────────────────────────────────────

interface StatCardDef {
  label: string;
  icon: typeof Users;
  getValue: (stats: AdminStats, metrics: CloudWatchMetricsResponse | undefined) => string;
  isError?: (stats: AdminStats, metrics: CloudWatchMetricsResponse | undefined) => boolean;
}

const statCards: StatCardDef[] = [
  {
    label: 'Total Users',
    icon: Users,
    getValue: (s) => (hasSupabaseData(s) ? s.supabase.users.toLocaleString() : '--'),
  },
  {
    label: 'Active Trips',
    icon: Plane,
    getValue: (s) => (hasSupabaseData(s) ? s.supabase.trips.toLocaleString() : '--'),
  },
  {
    label: 'POIs Created',
    icon: MapPin,
    getValue: (s) => (hasSupabaseData(s) ? s.supabase.pois.toLocaleString() : '--'),
  },
  {
    label: 'Cache Items',
    icon: Database,
    getValue: (s) => (hasDynamoData(s) ? s.dynamodb.total_items.toLocaleString() : '--'),
  },
  {
    label: 'Pipeline Errors (24h)',
    icon: AlertTriangle,
    getValue: (_s, m) => {
      if (!m) return '--';
      const totalErrors = Object.values(m.lambda).reduce(
        (sum, fn) => sum + (fn.errors?.total ?? 0),
        0,
      );
      return totalErrors.toString();
    },
    isError: (_s, m) => {
      if (!m) return false;
      return Object.values(m.lambda).some((fn) => (fn.errors?.total ?? 0) > 0);
    },
  },
];

// ── Component ──────────────────────────────────────────────────

export default function OverviewPage() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useAdminStats();

  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useCloudWatchMetrics('24h');

  const isLoading = statsLoading || metricsLoading;
  const error = statsError || metricsError;

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
        <p className="text-destructive">{error.message}</p>
        <Button
          variant="outline"
          onClick={() => {
            refetchStats();
            refetchMetrics();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  // Derive S3 storage totals
  const s3Buckets = stats
    ? (Object.entries(stats.s3) as [string, S3BucketStats | { error: string }][])
        .filter((entry): entry is [string, S3BucketStats] => !('error' in entry[1]))
        .map(([bucket, data]) => ({ bucket, ...data }))
    : [];
  const totalS3Objects = s3Buckets.reduce((sum, b) => sum + b.total_objects, 0);
  const totalS3Size = s3Buckets.reduce((sum, b) => sum + b.total_size_bytes, 0);

  // Derive cache status distribution for donut chart
  const cacheByStatus = stats && hasDynamoData(stats) ? stats.dynamodb.by_status : {};
  const statusColors: Record<string, string> = {
    completed: '#22c55e',
    processing: '#3b82f6',
    failed: '#ef4444',
    unknown: '#a855f7',
  };
  const statusBgColors: Record<string, string> = {
    completed: 'bg-green-500',
    processing: 'bg-blue-500',
    failed: 'bg-red-500',
    unknown: 'bg-purple-500',
  };
  const totalCacheItems = Object.values(cacheByStatus).reduce((sum, n) => sum + n, 0);

  // Lambda invocation chart data
  const lambdaEntries = metrics
    ? (Object.entries(metrics.lambda) as [string, LambdaFunctionMetrics][]).map(([name, m]) => ({
        name,
        invocations: m.invocations?.total ?? 0,
        errors: m.errors?.total ?? 0,
      }))
    : [];
  const maxInvocations = Math.max(...lambdaEntries.map((e) => e.invocations), 1);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Overview</h2>

      {/* Stat cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats &&
          statCards.map((card) => {
            const Icon = card.icon;
            const value = card.getValue(stats, metrics);
            const isErr = card.isError?.(stats, metrics) ?? false;

            return (
              <Card key={card.label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${isErr ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}
                    >
                      <Icon size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{card.label}</p>
                      <p
                        className={`text-2xl font-bold ${isErr ? 'text-destructive' : 'text-foreground'}`}
                      >
                        {value}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

        {/* S3 Storage card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <HardDrive size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">S3 Storage</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatFileSize(totalS3Size)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totalS3Objects.toLocaleString()} objects
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bar chart: Lambda invocations (24h) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={18} />
              Lambda Invocations (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-48">
              {lambdaEntries.map((entry) => {
                const heightPercent = (entry.invocations / maxInvocations) * 100;
                const shortName = entry.name.replace('triptomat-', '');

                return (
                  <div key={entry.name} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground font-medium">
                      {entry.invocations}
                    </span>
                    <div
                      className="w-full bg-muted rounded-t-md overflow-hidden flex flex-col justify-end"
                      style={{ height: '100%' }}
                    >
                      <div
                        className="w-full bg-primary rounded-t-md transition-all"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground truncate w-full text-center">
                      {shortName}
                    </span>
                    {entry.errors > 0 && (
                      <span className="text-xs text-destructive">{entry.errors} err</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Donut chart: Cache status distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database size={18} />
              Cache Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8">
              {/* Donut */}
              <div className="relative w-36 h-36 shrink-0">
                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                  {(() => {
                    let offset = 0;
                    return Object.entries(cacheByStatus).map(([status, count]) => {
                      const pct = totalCacheItems > 0 ? (count / totalCacheItems) * 100 : 0;
                      const color = statusColors[status] ?? statusColors.unknown;
                      const el = (
                        <circle
                          key={status}
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke={color}
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
                  <span className="text-lg font-bold text-foreground">{totalCacheItems}</span>
                </div>
              </div>

              {/* Legend */}
              <div className="space-y-2 flex-1">
                {Object.entries(cacheByStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${statusBgColors[status] ?? statusBgColors.unknown}`}
                      />
                      <span className="text-sm text-foreground capitalize">{status}</span>
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">
                      {count} (
                      {totalCacheItems > 0 ? ((count / totalCacheItems) * 100).toFixed(1) : 0}%)
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
