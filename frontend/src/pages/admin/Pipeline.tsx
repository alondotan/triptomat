import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Inbox, Activity, Cpu, AlertTriangle, Clock } from 'lucide-react';
import { formatDateTime } from '@/utils/adminUtils';

// ── Types ──────────────────────────────────────────────────────

interface QueueStatus {
  name: string;
  depth: number;
  dlqDepth: number;
}

type JobStatus = 'completed' | 'processing' | 'failed' | 'queued';

interface PipelineJob {
  jobId: string;
  sourceType: string;
  status: JobStatus;
  duration: string;
  createdAt: string;
}

interface LambdaStats {
  functionName: string;
  invocations: number;
  errors: number;
  avgDuration: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockQueues: QueueStatus[] = [
  { name: 'triptomat-download-queue', depth: 3, dlqDepth: 0 },
  { name: 'triptomat-analysis-queue', depth: 7, dlqDepth: 1 },
];

const mockJobs: PipelineJob[] = [
  { jobId: 'job-a1b2c3', sourceType: 'video', status: 'completed', duration: '45s', createdAt: '2026-03-03T10:30:00Z' },
  { jobId: 'job-d4e5f6', sourceType: 'web', status: 'processing', duration: '12s', createdAt: '2026-03-03T10:28:00Z' },
  { jobId: 'job-g7h8i9', sourceType: 'video', status: 'completed', duration: '1m 23s', createdAt: '2026-03-03T10:15:00Z' },
  { jobId: 'job-j0k1l2', sourceType: 'email', status: 'failed', duration: '5s', createdAt: '2026-03-03T10:12:00Z' },
  { jobId: 'job-m3n4o5', sourceType: 'maps', status: 'completed', duration: '8s', createdAt: '2026-03-03T10:05:00Z' },
  { jobId: 'job-p6q7r8', sourceType: 'text', status: 'queued', duration: '-', createdAt: '2026-03-03T10:02:00Z' },
  { jobId: 'job-s9t0u1', sourceType: 'video', status: 'completed', duration: '52s', createdAt: '2026-03-03T09:55:00Z' },
  { jobId: 'job-v2w3x4', sourceType: 'web', status: 'completed', duration: '15s', createdAt: '2026-03-03T09:48:00Z' },
];

const mockLambdaStats: LambdaStats[] = [
  { functionName: 'triptomat-gateway', invocations: 1_245, errors: 2, avgDuration: '120ms' },
  { functionName: 'triptomat-downloader', invocations: 312, errors: 5, avgDuration: '28s' },
  { functionName: 'triptomat-worker', invocations: 467, errors: 8, avgDuration: '14s' },
  { functionName: 'triptomat-mail-handler', invocations: 89, errors: 1, avgDuration: '3.2s' },
];

// ── Helpers ────────────────────────────────────────────────────

function getStatusBadgeVariant(status: JobStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default';
    case 'processing': return 'secondary';
    case 'failed': return 'destructive';
    case 'queued': return 'outline';
  }
}


// ── Component ──────────────────────────────────────────────────

export default function PipelinePage() {
  // TODO: Replace with real API call
  const { data: queues } = useQuery<QueueStatus[]>({
    queryKey: ['admin', 'queue-status'],
    queryFn: async () => mockQueues,
  });

  // TODO: Replace with real API call
  const { data: jobs } = useQuery<PipelineJob[]>({
    queryKey: ['admin', 'pipeline-jobs'],
    queryFn: async () => mockJobs,
  });

  // TODO: Replace with real API call
  const { data: lambdaStats } = useQuery<LambdaStats[]>({
    queryKey: ['admin', 'lambda-stats'],
    queryFn: async () => mockLambdaStats,
  });

  return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-foreground">Pipeline</h2>

        {/* SQS Queue Status Cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {(queues ?? []).map((queue) => (
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
                        <p className="text-2xl font-bold text-foreground">{queue.depth}</p>
                        <p className="text-xs text-muted-foreground">Messages</p>
                      </div>
                      <div>
                        <p className={`text-2xl font-bold ${queue.dlqDepth > 0 ? 'text-destructive' : 'text-foreground'}`}>
                          {queue.dlqDepth}
                        </p>
                        <p className="text-xs text-muted-foreground">DLQ</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Jobs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity size={18} />
              Recent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Source Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(jobs ?? []).map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell className="font-mono text-xs">{job.jobId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{job.sourceType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(job.status)} className="text-xs">
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock size={13} />
                        {job.duration}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDateTime(job.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>Invocations</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Error Rate</TableHead>
                  <TableHead>Avg Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lambdaStats ?? []).map((fn) => {
                  const errorRate = fn.invocations > 0 ? ((fn.errors / fn.invocations) * 100).toFixed(2) : '0.00';
                  const hasErrors = fn.errors > 0;

                  return (
                    <TableRow key={fn.functionName}>
                      <TableCell className="font-mono text-xs">{fn.functionName}</TableCell>
                      <TableCell className="font-medium">{fn.invocations.toLocaleString()}</TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 ${hasErrors ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {hasErrors && <AlertTriangle size={13} />}
                          {fn.errors}
                        </span>
                      </TableCell>
                      <TableCell className={hasErrors ? 'text-destructive' : 'text-muted-foreground'}>
                        {errorRate}%
                      </TableCell>
                      <TableCell className="text-muted-foreground">{fn.avgDuration}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
  );
}
