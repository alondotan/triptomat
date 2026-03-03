import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Inbox, Activity, Cpu, AlertTriangle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useCloudWatchMetrics, useCacheEntries } from '@/hooks/useAdminQueries';
import type { LambdaFunctionMetrics, SqsQueueMetrics, CacheEntry } from '@/services/adminService';

// ── Helpers ────────────────────────────────────────────────────

type CacheStatus = 'processing' | 'completed' | 'failed';

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default';
    case 'processing': return 'secondary';
    case 'failed': return 'destructive';
    default: return 'outline';
  }
}

function formatDuration(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
  return `${Math.round(diffMs / 3_600_000)}h ago`;
}

// ── Component ──────────────────────────────────────────────────

export default function PipelinePage() {
  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useCloudWatchMetrics('24h');

  const {
    data: cacheData,
    isLoading: cacheLoading,
    error: cacheError,
    refetch: refetchCache,
  } = useCacheEntries(undefined, 20);

  const isLoading = metricsLoading || cacheLoading;
  const error = metricsError || cacheError;

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
            refetchMetrics();
            refetchCache();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  // SQS queue data
  const sqsEntries = metrics
    ? (Object.entries(metrics.sqs) as [string, SqsQueueMetrics][]).map(([name, q]) => ({
        name,
        depth: q.approximate_queue_depth ?? 0,
        sent: q.messages_sent ?? 0,
        received: q.messages_received ?? 0,
      }))
    : [];

  // Lambda stats
  const lambdaStats = metrics
    ? (Object.entries(metrics.lambda) as [string, LambdaFunctionMetrics][]).map(([name, m]) => ({
        functionName: name,
        invocations: m.invocations?.total ?? 0,
        errors: m.errors?.total ?? 0,
      }))
    : [];

  // Recent jobs from cache entries
  const recentJobs: (CacheEntry & { displayStatus: CacheStatus })[] = (cacheData?.items ?? []).map((item: CacheEntry) => ({
    ...item,
    displayStatus: (['completed', 'processing', 'failed'].includes(item.status)
      ? item.status
      : 'processing') as CacheStatus,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Pipeline</h2>

      {/* SQS Queue Status Cards */}
      {sqsEntries.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sqsEntries.map((queue) => (
            <Card key={queue.name}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Inbox size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground truncate">{queue.name}</p>
                    <div className="flex items-center gap-4 mt-1">
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {Math.round(queue.depth)}
                        </p>
                        <p className="text-xs text-muted-foreground">Queue Depth</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {Math.round(queue.sent)}
                        </p>
                        <p className="text-xs text-muted-foreground">Sent (24h)</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {Math.round(queue.received)}
                        </p>
                        <p className="text-xs text-muted-foreground">Received (24h)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity size={18} />
            Recent Jobs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentJobs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No recent jobs found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map((job) => (
                  <TableRow key={job.url}>
                    <TableCell className="font-mono text-xs">
                      {job.job_id ? job.job_id.substring(0, 12) : '--'}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs max-w-xs truncate"
                      title={job.url}
                    >
                      {job.url.length > 50 ? job.url.substring(0, 50) + '...' : job.url}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(job.displayStatus)} className="text-xs">
                        {job.displayStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <span className="flex items-center gap-1">
                        <Clock size={13} />
                        {job.created_at ? formatDuration(job.created_at) : '--'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Lambda Invocation Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu size={18} />
            Lambda Invocation Stats (24h)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lambdaStats.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No Lambda metrics available.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>Invocations</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Error Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lambdaStats.map((fn) => {
                  const errorRate = fn.invocations > 0
                    ? ((fn.errors / fn.invocations) * 100).toFixed(2)
                    : '0.00';
                  const hasErrors = fn.errors > 0;

                  return (
                    <TableRow key={fn.functionName}>
                      <TableCell className="font-mono text-xs">{fn.functionName}</TableCell>
                      <TableCell className="font-medium">
                        {fn.invocations.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`flex items-center gap-1 ${hasErrors ? 'text-destructive' : 'text-muted-foreground'}`}
                        >
                          {hasErrors && <AlertTriangle size={13} />}
                          {fn.errors}
                        </span>
                      </TableCell>
                      <TableCell
                        className={hasErrors ? 'text-destructive' : 'text-muted-foreground'}
                      >
                        {errorRate}%
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
