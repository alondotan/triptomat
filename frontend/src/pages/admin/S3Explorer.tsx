import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { HardDrive, Trash2, FolderOpen } from 'lucide-react';
import { formatDateTime, formatFileSize } from '@/utils/adminUtils';

// ── Types ──────────────────────────────────────────────────────

interface S3Object {
  key: string;
  size: number;
  lastModified: string;
  contentType: string;
}

interface BucketData {
  bucketName: string;
  objects: S3Object[];
  totalFiles: number;
  totalSize: number;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockMediaBucket: BucketData = {
  bucketName: 'triptomat-media',
  totalFiles: 156,
  totalSize: 2_415_919_104,
  objects: [
    { key: 'uploads/vid-a1b2c3.mp4', size: 45_678_912, lastModified: '2026-03-03T09:15:00Z', contentType: 'video/mp4' },
    { key: 'uploads/vid-d4e5f6.mp4', size: 89_234_567, lastModified: '2026-03-03T08:42:00Z', contentType: 'video/mp4' },
    { key: 'uploads/img-g7h8i9.jpg', size: 2_345_678, lastModified: '2026-03-02T18:30:00Z', contentType: 'image/jpeg' },
    { key: 'uploads/vid-j0k1l2.webm', size: 34_567_890, lastModified: '2026-03-02T14:22:00Z', contentType: 'video/webm' },
    { key: 'uploads/thumb-m3n4o5.png', size: 456_789, lastModified: '2026-03-01T22:10:00Z', contentType: 'image/png' },
  ],
};

const mockEmailBucket: BucketData = {
  bucketName: 'triptomat-raw-emails',
  totalFiles: 518,
  totalSize: 312_456_789,
  objects: [
    { key: 'incoming/email-001.eml', size: 145_678, lastModified: '2026-03-03T10:30:00Z', contentType: 'message/rfc822' },
    { key: 'incoming/email-002.eml', size: 234_567, lastModified: '2026-03-03T09:15:00Z', contentType: 'message/rfc822' },
    { key: 'incoming/email-003.eml', size: 567_890, lastModified: '2026-03-02T20:45:00Z', contentType: 'message/rfc822' },
    { key: 'incoming/email-004.eml', size: 89_012, lastModified: '2026-03-02T16:30:00Z', contentType: 'message/rfc822' },
    { key: 'incoming/email-005.eml', size: 345_678, lastModified: '2026-03-01T11:20:00Z', contentType: 'message/rfc822' },
  ],
};


// ── Bucket Table Component ─────────────────────────────────────

interface BucketSectionProps {
  bucket: BucketData;
}

function BucketSection({ bucket }: BucketSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
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
    if (selected.size === bucket.objects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(bucket.objects.map((o) => o.key)));
    }
  };

  const handleDelete = () => {
    // TODO: Replace with real API call to delete the object
    console.log('Deleting:', deleteTarget);
    setDeleteTarget(null);
  };

  const handleBulkDelete = () => {
    // TODO: Replace with real API call to bulk delete
    console.log('Bulk deleting:', Array.from(selected));
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };

  const allSelected = bucket.objects.length > 0 && selected.size === bucket.objects.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen size={18} />
            {bucket.bucketName}
          </CardTitle>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              {bucket.totalFiles} files
            </Badge>
            <Badge variant="outline" className="text-xs">
              {formatFileSize(bucket.totalSize)}
            </Badge>
            {selected.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
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
              <TableHead>Content Type</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bucket.objects.map((obj) => (
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
                <TableCell className="text-muted-foreground text-sm">{formatDateTime(obj.lastModified)}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs">{obj.contentType}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => setDeleteTarget(obj.key)}
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Single delete confirmation */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Object?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-mono text-xs">{deleteTarget}</span> from {bucket.bucketName}. This action cannot be undone.
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
              This will permanently delete {selected.size} selected objects from {bucket.bucketName}. This action cannot be undone.
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
  // TODO: Replace with real API call
  const { data: mediaBucket } = useQuery<BucketData>({
    queryKey: ['admin', 's3-media'],
    queryFn: async () => mockMediaBucket,
  });

  // TODO: Replace with real API call
  const { data: emailBucket } = useQuery<BucketData>({
    queryKey: ['admin', 's3-emails'],
    queryFn: async () => mockEmailBucket,
  });

  const totalFiles = (mediaBucket?.totalFiles ?? 0) + (emailBucket?.totalFiles ?? 0);
  const totalSize = (mediaBucket?.totalSize ?? 0) + (emailBucket?.totalSize ?? 0);

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

        {mediaBucket && <BucketSection bucket={mediaBucket} />}
        {emailBucket && <BucketSection bucket={emailBucket} />}
      </div>
  );
}
