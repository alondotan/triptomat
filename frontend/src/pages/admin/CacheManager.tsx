import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Database, Trash2, RefreshCw, Search } from 'lucide-react';
import { formatDateTime } from '@/utils/adminUtils';

// ── Types ──────────────────────────────────────────────────────

type CacheStatus = 'processing' | 'completed' | 'failed';

interface CacheEntry {
  url: string;
  jobId: string;
  status: CacheStatus;
  sourceType: string;
  createdAt: string;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockCacheEntries: CacheEntry[] = [
  { url: 'https://www.youtube.com/watch?v=abc123def456', jobId: 'job-a1b2c3', status: 'completed', sourceType: 'video', createdAt: '2026-03-03T10:30:00Z' },
  { url: 'https://www.tripadvisor.com/Attraction_Review-g123-d456', jobId: 'job-d4e5f6', status: 'completed', sourceType: 'web', createdAt: '2026-03-03T09:15:00Z' },
  { url: 'https://maps.google.com/maps?q=place_id:ChIJ...', jobId: 'job-g7h8i9', status: 'processing', sourceType: 'maps', createdAt: '2026-03-03T08:42:00Z' },
  { url: 'https://www.youtube.com/watch?v=xyz789uvw012', jobId: 'job-j0k1l2', status: 'failed', sourceType: 'video', createdAt: '2026-03-02T22:30:00Z' },
  { url: 'https://www.lonelyplanet.com/italy/rome/attractions', jobId: 'job-m3n4o5', status: 'completed', sourceType: 'web', createdAt: '2026-03-02T18:15:00Z' },
  { url: 'mailto:trip-updates@example.com (subject: Amsterdam)', jobId: 'job-p6q7r8', status: 'completed', sourceType: 'email', createdAt: '2026-03-02T14:00:00Z' },
  { url: 'https://www.youtube.com/watch?v=qrs345tuv678', jobId: 'job-s9t0u1', status: 'completed', sourceType: 'video', createdAt: '2026-03-01T20:45:00Z' },
  { url: 'text://user-paste-2026-03-01-1930', jobId: 'job-v2w3x4', status: 'failed', sourceType: 'text', createdAt: '2026-03-01T19:30:00Z' },
];

// ── Helpers ────────────────────────────────────────────────────

function getStatusBadgeVariant(status: CacheStatus): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'completed': return 'default';
    case 'processing': return 'secondary';
    case 'failed': return 'destructive';
  }
}

function truncateUrl(url: string, maxLength: number = 60): string {
  return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
}


// ── Component ──────────────────────────────────────────────────

type StatusFilter = 'all' | CacheStatus;

export default function CacheManagerPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CacheEntry | null>(null);
  const [reprocessTarget, setReprocessTarget] = useState<CacheEntry | null>(null);

  // TODO: Replace with real API call
  const { data: entries } = useQuery<CacheEntry[]>({
    queryKey: ['admin', 'cache-entries'],
    queryFn: async () => mockCacheEntries,
  });

  const filteredEntries = (entries ?? []).filter((entry) => {
    if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
    if (searchQuery && !entry.url.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleDelete = () => {
    // TODO: Replace with real API call to delete cache entry
    console.log('Deleting cache entry:', deleteTarget?.url);
    setDeleteTarget(null);
  };

  const handleReprocess = () => {
    // TODO: Replace with real API call to delete cache + re-submit URL
    console.log('Reprocessing:', reprocessTarget?.url);
    setReprocessTarget(null);
  };

  const totalEntries = entries?.length ?? 0;
  const completedCount = (entries ?? []).filter((e) => e.status === 'completed').length;
  const failedCount = (entries ?? []).filter((e) => e.status === 'failed').length;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Cache Manager</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Database size={16} />
            <span>{totalEntries} entries</span>
            <span className="text-border">|</span>
            <span className="text-green-600">{completedCount} completed</span>
            <span className="text-border">|</span>
            <span className="text-destructive">{failedCount} failed</span>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by URL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(val) => setStatusFilter(val as StatusFilter)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Cache entries table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database size={18} />
              Cache Entries ({filteredEntries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredEntries.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No cache entries match the current filters.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source Type</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.url}>
                      <TableCell
                        className="font-mono text-xs max-w-xs"
                        title={entry.url}
                      >
                        {truncateUrl(entry.url)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.jobId}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(entry.status)} className="text-xs">
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{entry.sourceType}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDateTime(entry.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-primary"
                            onClick={() => setReprocessTarget(entry)}
                            title="Reprocess"
                          >
                            <RefreshCw size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setDeleteTarget(entry)}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cache Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the cache entry for <span className="font-mono text-xs break-all">{deleteTarget?.url}</span>. The URL will need to be reprocessed if submitted again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reprocess confirmation */}
      <AlertDialog open={reprocessTarget !== null} onOpenChange={(open) => { if (!open) setReprocessTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprocess URL?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the cache entry and re-submit <span className="font-mono text-xs break-all">{reprocessTarget?.url}</span> for processing. The existing results will be replaced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReprocess}>
              Reprocess
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
