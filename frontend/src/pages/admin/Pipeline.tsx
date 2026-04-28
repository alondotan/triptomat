import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Activity, AlertTriangle, Clock, Loader2, RefreshCw,
  ChevronDown, ChevronUp, ExternalLink, Video, Globe, MapPin, Mail, FileText,
  CheckCircle2, XCircle, Hourglass,
} from 'lucide-react';
import { usePipelineMonitor, type PipelineJob, type PipelineEvent, getJobProgressLabel } from '@/features/admin/usePipelineMonitor';

// ── Helpers ────────────────────────────────────────────────────

type TimeRange = '1h' | '6h' | '24h';

const STAGE_LABELS: Record<string, string> = {
  gateway: 'Gateway',
  downloader: 'Downloader',
  worker: 'Worker (AI)',
  mail_handler: 'Mail Handler',
  webhook: 'Webhook',
};

const STAGE_PIPELINE = ['gateway', 'downloader', 'worker'] as const;
const STAGE_EMAIL_PIPELINE = ['mail_handler'] as const;

function getSourceIcon(type: string | null) {
  switch (type) {
    case 'video': return <Video size={14} className="text-red-500" />;
    case 'web': return <Globe size={14} className="text-blue-500" />;
    case 'maps': return <MapPin size={14} className="text-green-500" />;
    case 'text': return <FileText size={14} className="text-amber-500" />;
    case 'email': return <Mail size={14} className="text-purple-500" />;
    default: return <Activity size={14} className="text-muted-foreground" />;
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle2 size={14} className="text-green-500" />;
    case 'failed': return <XCircle size={14} className="text-destructive" />;
    default: return <Hourglass size={14} className="text-amber-500 animate-pulse" />;
  }
}

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed': return 'default';
    case 'started': return 'secondary';
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

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncateUrl(url: string, maxLen = 60): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen) + '...';
}

// ── Stage Progress Bar ────────────────────────────────────────

function StageProgress({ job }: { job: PipelineJob }) {
  const isEmail = job.sourceType === 'email';
  const stages = isEmail ? [...STAGE_EMAIL_PIPELINE] : [...STAGE_PIPELINE];

  const stageStatusMap = new Map<string, string>();
  for (const ev of job.events) {
    const current = stageStatusMap.get(ev.stage);
    // completed/failed overrides started
    if (!current || ev.status === 'completed' || ev.status === 'failed') {
      stageStatusMap.set(ev.stage, ev.status);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {stages.map((stage, i) => {
        const status = stageStatusMap.get(stage);
        let dotColor = 'bg-muted';
        if (status === 'completed') dotColor = 'bg-green-500';
        else if (status === 'failed') dotColor = 'bg-destructive';
        else if (status === 'started') dotColor = 'bg-amber-500 animate-pulse';

        return (
          <div key={stage} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${dotColor}`} title={`${STAGE_LABELS[stage]}: ${status || 'pending'}`} />
              <span className="text-[10px] text-muted-foreground mt-0.5">{STAGE_LABELS[stage]?.split(' ')[0]}</span>
            </div>
            {i < stages.length - 1 && (
              <div className={`w-6 h-0.5 mb-3 ${status === 'completed' ? 'bg-green-500' : 'bg-muted'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Event Detail Row ──────────────────────────────────────────

function EventDetailRow({ event }: { event: PipelineEvent }) {
  const meta = event.metadata || {};
  const metaKeys = Object.keys(meta);

  return (
    <div className="flex items-start gap-3 py-2 px-3 bg-muted/30 rounded text-sm">
      <div className="flex items-center gap-1.5 min-w-[100px]">
        {getStatusIcon(event.status)}
        <span className="font-medium">{STAGE_LABELS[event.stage] || event.stage}</span>
      </div>
      <Badge variant={getStatusBadgeVariant(event.status)} className="text-xs">
        {event.status}
      </Badge>
      <span className="text-xs text-muted-foreground">{formatTime(event.created_at)}</span>
      {metaKeys.length > 0 && (
        <div className="flex-1 text-xs text-muted-foreground">
          {meta.sub_stage === 'analyzing' && (
            <span className="text-amber-600 font-medium">מנתח תוכן בבינה מלאכותית...</span>
          )}
          {meta.sub_stage === 'ai_done' && (
            <span className="text-blue-600 font-medium">
              AI: {meta.recommendations_count as number} recommendations
              {meta.ai_duration_ms ? ` (${Math.round(meta.ai_duration_ms as number / 1000)}s)` : ''}
            </span>
          )}
          {meta.sub_stage === 'geocoding' && (
            <span className="text-purple-600 font-medium">מחלץ מיקומים...</span>
          )}
          {meta.sub_stage === 'saving' && (
            <span className="text-green-600 font-medium">שומר המלצות...</span>
          )}
          {meta.error && (
            <span className="text-destructive">{meta.error as string}</span>
          )}
          {meta.recommendations && Array.isArray(meta.recommendations) && (
            <div className="mt-1 space-y-0.5">
              {(meta.recommendations as Array<{ name: string; category: string; site: string }>).map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{r.category}</Badge>
                  <span>{r.name}</span>
                  {r.site && <span className="text-muted-foreground">({r.site})</span>}
                </div>
              ))}
            </div>
          )}
          {meta.s3_key && (
            <span>S3: {meta.s3_key as string} ({meta.file_size_mb as number}MB)</span>
          )}
          {meta.fallback && (
            <span className="text-amber-600">Fallback: transcript {meta.has_transcript ? '✓' : '✗'}</span>
          )}
          {meta.queue && !meta.sub_stage && (
            <span>→ {meta.queue as string} queue</span>
          )}
          {meta.category && (
            <span>
              {meta.action as string}: {meta.category as string}/{meta.sub_category as string}
              {meta.order_number ? ` #${meta.order_number}` : ''}
            </span>
          )}
          {meta.result === 'no_travel_data' && (
            <span className="text-muted-foreground">No travel data found</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Job Row ───────────────────────────────────────────────────

function JobRow({ job }: { job: PipelineJob }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell>
          <div className="flex items-center gap-1.5">
            {getSourceIcon(job.sourceType)}
            <span className="text-xs capitalize">{job.sourceType || '?'}</span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            {job.title && (
              <span className="text-sm font-medium truncate max-w-xs" title={job.title}>
                {job.title.length > 50 ? job.title.substring(0, 50) + '...' : job.title}
              </span>
            )}
            {job.sourceUrl && (
              <a
                href={job.sourceUrl.startsWith('s3://') || job.sourceUrl.startsWith('text://') ? undefined : job.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {truncateUrl(job.sourceUrl)}
                {!job.sourceUrl.startsWith('s3://') && !job.sourceUrl.startsWith('text://') && <ExternalLink size={10} />}
              </a>
            )}
          </div>
        </TableCell>
        <TableCell>
          <StageProgress job={job} />
          {job.currentStatus === 'started' && (
            <span className="text-xs text-amber-600 animate-pulse">{getJobProgressLabel(job)}</span>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            {getStatusIcon(job.currentStatus)}
            <Badge variant={getStatusBadgeVariant(job.currentStatus)} className="text-xs">
              {job.currentStatus}
            </Badge>
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock size={13} />
            {formatDuration(job.startedAt)}
          </span>
        </TableCell>
        <TableCell>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Button>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/10 p-2">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground mb-2">
                Job ID: <code className="font-mono">{job.jobId}</code>
              </div>
              {job.image && (
                <div className="mb-2">
                  <img src={job.image} alt="" className="h-16 rounded object-cover" />
                </div>
              )}
              {job.events.map((ev) => (
                <EventDetailRow key={ev.id} event={ev} />
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function PipelinePage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [statusFilter, setStatusFilter] = useState<'all' | 'started' | 'completed' | 'failed'>('all');
  const { jobs, loading, refetch } = usePipelineMonitor(timeRange);

  const filteredJobs = statusFilter === 'all'
    ? jobs
    : jobs.filter(j => j.currentStatus === statusFilter);

  // Summary counts
  const processingCount = jobs.filter(j => j.currentStatus === 'started').length;
  const completedCount = jobs.filter(j => j.currentStatus === 'completed').length;
  const failedCount = jobs.filter(j => j.currentStatus === 'failed').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Pipeline Monitor</h2>
        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            {(['1h', '6h', '24h'] as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTimeRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-1">
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'started' ? 'ring-2 ring-amber-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'started' ? 'all' : 'started')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Hourglass size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{processingCount}</p>
                <p className="text-sm text-muted-foreground">Processing</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'completed' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 text-green-500">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${statusFilter === 'failed' ? 'ring-2 ring-destructive' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
        >
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold">{failedCount}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity size={18} />
            Live Jobs
            {processingCount > 0 && (
              <Badge variant="secondary" className="text-xs animate-pulse">
                {processingCount} active
              </Badge>
            )}
            <span className="text-sm font-normal text-muted-foreground mr-auto">
              ({filteredJobs.length} jobs)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              {statusFilter !== 'all' ? `No ${statusFilter} jobs.` : 'No jobs found in this time range.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Type</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-[200px]">Progress</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[100px]">Time</TableHead>
                  <TableHead className="w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <JobRow key={job.jobId} job={job} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
