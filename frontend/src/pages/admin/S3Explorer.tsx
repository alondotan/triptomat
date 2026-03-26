import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
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
import { HardDrive, Trash2, FolderOpen, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDateTime, formatFileSize } from '@/features/admin/adminUtils';
import { useS3Objects, useDeleteS3Objects } from '@/features/admin/useAdminQueries';
import { toast } from '@/shared/hooks/use-toast';
import type { S3Object, S3ListResponse, S3DeleteResponse } from '@/features/admin/adminService';

// ── Bucket Table Component ─────────────────────────────────────

interface BucketSectionProps {
  bucketName: string;
  data: S3ListResponse;
}

function BucketSection({ bucketName, data }: BucketSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const deleteMutation = useDeleteS3Objects();

  const toggleSelect = (key: string) => {
    setSelected((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === data.objects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.objects.map((o: S3Object) => o.key)));
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { bucket: bucketName, keys: [deleteTarget] },
      {
        onSuccess: (result: S3DeleteResponse) => {
          toast({ title: 'Deleted', description: `Removed ${result.deleted} object(s)` });
        },
        onError: (err: Error) => {
          toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
        },
      },
    );
    setDeleteTarget(null);
  };

  const handleBulkDelete = () => {
    const keys = Array.from(selected);
    deleteMutation.mutate(
      { bucket: bucketName, keys },
      {
        onSuccess: (result: S3DeleteResponse) => {
          toast({ title: 'Deleted', description: `Removed ${result.deleted} object(s)` });
          setSelected(new Set());
        },
        onError: (err: Error) => {
          toast({ title: 'Bulk delete failed', description: err.message, variant: 'destructive' });
        },
      },
    );
    setBulkDeleteOpen(false);
  };

  const totalSize = data.objects.reduce((sum: number, o: S3Object) => sum + o.size, 0);
  const allSelected = data.objects.length > 0 && selected.size === data.objects.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen size={18} />
            {bucketName}
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {data.count} files
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formatFileSize(totalSize)}
            </Badge>
            {data.is_truncated && (
              <Badge variant="secondary" className="text-xs">
                truncated
              </Badge>
            )}
            {selected.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={deleteMutation.isPending}
                className="gap-1"
              >
                <Trash2 size={14} />
                Delete Selected ({selected.size})
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {data.objects.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No objects in this bucket.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Filename</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.objects.map((obj: S3Object) => (
                <TableRow key={obj.key}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(obj.key)}
                      onCheckedChange={() => toggleSelect(obj.key)}
                      aria-label={`Select ${obj.key}`}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{obj.key}</TableCell>
                  <TableCell className="text-muted-foreground">{formatFileSize(obj.size)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(obj.last_modified)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteTarget(obj.key)}
                      disabled={deleteMutation.isPending}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Single delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Object?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono text-xs">{deleteTarget}</span> from {bucketName}. This action cannot be undone.
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

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} Objects?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selected.size} selected objects from {bucketName}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete All Selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Page Component ─────────────────────────────────────────────

export default function S3ExplorerPage() {
  const {
    data: mediaData,
    isLoading: mediaLoading,
    error: mediaError,
    refetch: refetchMedia,
  } = useS3Objects('triptomat-media');

  const {
    data: emailData,
    isLoading: emailLoading,
    error: emailError,
    refetch: refetchEmail,
  } = useS3Objects('triptomat-raw-emails');

  const isLoading = mediaLoading || emailLoading;
  const error = mediaError || emailError;

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
            refetchMedia();
            refetchEmail();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  const totalFiles = (mediaData?.count ?? 0) + (emailData?.count ?? 0);
  const totalSize =
    (mediaData?.objects ?? []).reduce((sum: number, o: S3Object) => sum + o.size, 0) +
    (emailData?.objects ?? []).reduce((sum: number, o: S3Object) => sum + o.size, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">S3 Explorer</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive size={16} />
            <span>{totalFiles} total files</span>
            <span className="text-border">|</span>
            <span>{formatFileSize(totalSize)} total</span>
          </div>
        </div>
      </div>

      {mediaData && <BucketSection bucketName="triptomat-media" data={mediaData} />}
      {emailData && <BucketSection bucketName="triptomat-raw-emails" data={emailData} />}
    </div>
  );
}
