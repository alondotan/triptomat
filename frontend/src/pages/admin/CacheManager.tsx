import React, { useState } from 'react';
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
import { Database, Trash2, RefreshCw, Search, Loader2, AlertTriangle } from 'lucide-react';
import { formatDateTime } from '@/features/admin/adminUtils';
import { useCacheEntries, useDeleteCacheEntries, useReprocessUrl } from '@/features/admin/useAdminQueries';
import { toast } from '@/shared/hooks/use-toast';
import type { CacheEntry, CacheDeleteResponse, ReprocessResponse } from '@/features/admin/adminService';

// ── Helpers ────────────────────────────────────────────────────

type CacheStatus = 'processing' | 'completed' | 'failed';

function getStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'completed': return 'default';
    case 'processing': return 'secondary';
    case 'failed': return 'destructive';
    default: return 'secondary';
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

  const apiStatus = statusFilter === 'all' ? undefined : statusFilter;
  const {
    data: cacheData,
    isLoading,
    error,
    refetch,
  } = useCacheEntries(apiStatus, 100);

  const deleteMutation = useDeleteCacheEntries();
  const reprocessMutation = useReprocessUrl();

  // Client-side URL search within the fetched results
  const filteredEntries = (cacheData?.items ?? []).filter((entry: CacheEntry) => {
    if (searchQuery && !entry.url.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate([deleteTarget.url], {
      onSuccess: (result: CacheDeleteResponse) => {
        toast({ title: 'Deleted', description: `Removed ${result.deleted} cache entry` });
      },
      onError: (err: Error) => {
        toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
      },
    });
    setDeleteTarget(null);
  };

  const handleReprocess = () => {
    if (!reprocessTarget) return;
    reprocessMutation.mutate(reprocessTarget.url, {
      onSuccess: (result: ReprocessResponse) => {
        toast({
          title: 'Reprocessing',
          description: `URL submitted to ${result.queue} queue (job: ${result.job_id.substring(0, 8)})`,
        });
      },
      onError: (err: Error) => {
        toast({ title: 'Reprocess failed', description: err.message, variant: 'destructive' });
      },
    });
    setReprocessTarget(null);
  };

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
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  const totalEntries = cacheData?.count ?? 0;
  const completedCount = (cacheData?.items ?? []).filter((e: CacheEntry) => e.status === 'completed').length;
  const failedCount = (cacheData?.items ?? []).filter((e: CacheEntry) => e.status === 'failed').length;

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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(val: string) => setStatusFilter(val as StatusFilter)}>
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
                    <TableHead>Created At</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry: CacheEntry) => (
                    <React.Fragment key={entry.url}>
                      <TableRow>
                        <TableCell
                          className="font-mono text-xs max-w-xs"
                          title={entry.url}
                        >
                          <a href={entry.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                            {truncateUrl(entry.url)}
                          </a>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {entry.job_id ? entry.job_id.substring(0, 12) : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(entry.status)} className="text-xs">
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.created_at ? formatDateTime(entry.created_at) : '--'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={() => setReprocessTarget(entry)}
                              disabled={reprocessMutation.isPending}
                              title="Reprocess"
                            >
                              <RefreshCw size={14} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteTarget(entry)}
                              disabled={deleteMutation.isPending}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {entry.status === 'failed' && entry.error && (
                        <TableRow>
                          <TableCell colSpan={5} className="pt-0 pb-3">
                            <div className="flex items-start gap-2 bg-destructive/5 border border-destructive/20 rounded-md px-3 py-2 text-xs">
                              <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
                              <span className="text-destructive/90 break-all">{entry.error}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
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
      <AlertDialog open={reprocessTarget !== null} onOpenChange={(open: boolean) => { if (!open) setReprocessTarget(null); }}>
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
