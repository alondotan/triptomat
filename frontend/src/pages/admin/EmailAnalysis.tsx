import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Mail,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  BarChart3,
} from 'lucide-react';
import { useEmails, useEmailRaw, useEmailStats } from '@/features/admin/useAdminQueries';
import type { AdminSourceEmail } from '@/features/admin/adminService';
import { formatDateTime } from '@/features/admin/adminUtils';

// ── Helpers ──────────────────────────────────────────────────────

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  linked: 'default',
  pending: 'secondary',
  cancelled: 'destructive',
};

function getStatusVariant(status: string) {
  return statusVariant[status] ?? 'outline';
}

// ── Expandable row ──────────────────────────────────────────────

function EmailExpandedRow({
  email,
  onViewRaw,
}: {
  email: AdminSourceEmail;
  onViewRaw: (emailId: string) => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="bg-muted/30 p-4">
        <div className="space-y-4">
          {/* Parsed data */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <FileText size={14} />
              Parsed Data
            </h4>
            <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-64 text-foreground/80">
              {JSON.stringify(email.parsed_data, null, 2)}
            </pre>
          </div>

          {/* Linked entities */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Link2 size={14} />
              Linked Entities ({email.linked_entities?.length ?? 0})
            </h4>
            {email.linked_entities && email.linked_entities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {email.linked_entities.map((entity, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {entity.entity_type}: {entity.description}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No linked entities.</p>
            )}
          </div>

          {/* View raw button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewRaw(email.email_id)}
            className="gap-2"
          >
            <Mail size={14} />
            View Raw Email
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ── Raw email dialog ────────────────────────────────────────────

function RawEmailDialog({
  emailId,
  open,
  onOpenChange,
}: {
  emailId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useEmailRaw(open ? emailId : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raw Email</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.s3_key} (${(data.size_bytes / 1024).toFixed(1)} KB)`
              : emailId ?? ''}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center py-8 gap-2">
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-destructive">{error.message}</p>
          </div>
        )}

        {data && (
          <pre className="text-xs bg-muted rounded-md p-4 overflow-x-auto whitespace-pre-wrap break-all text-foreground/80 max-h-[60vh]">
            {data.raw_text_preview}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ──────────────────────────────────────────────

export default function EmailAnalysisPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rawDialogEmailId, setRawDialogEmailId] = useState<string | null>(null);
  const [rawDialogOpen, setRawDialogOpen] = useState(false);

  const {
    data: emailsData,
    isLoading: emailsLoading,
    error: emailsError,
    refetch: refetchEmails,
  } = useEmails(statusFilter, 50);

  const {
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useEmailStats();

  const isLoading = emailsLoading || statsLoading;
  const error = emailsError || statsError;

  function handleViewRaw(emailId: string) {
    setRawDialogEmailId(emailId);
    setRawDialogOpen(true);
  }

  function handleToggleRow(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

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
            refetchEmails();
            refetchStats();
          }}
          className="gap-2"
        >
          <RefreshCw size={14} />
          Retry
        </Button>
      </div>
    );
  }

  const emails = emailsData?.emails ?? [];
  const totalEmails = Object.values(statsData?.by_status ?? {}).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Email Analysis</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail size={16} />
          <span>{emailsData?.count ?? 0} emails</span>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Mail size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Emails</p>
                <p className="text-2xl font-bold text-foreground">{totalEmails}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {(['pending', 'linked', 'cancelled'] as const).map((status) => {
          const count = statsData?.by_status?.[status] ?? 0;
          return (
            <Card key={status}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <BarChart3 size={20} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{status}</p>
                    <p className="text-2xl font-bold text-foreground">{count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Average entities per email */}
      {statsData && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Link2 size={20} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Linked Entities per Email</p>
                <p className="text-2xl font-bold text-foreground">
                  {statsData.avg_entities_per_email}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status filter tabs */}
      <Tabs
        value={statusFilter ?? 'all'}
        onValueChange={(val) => setStatusFilter(val === 'all' ? undefined : val)}
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="linked">Linked</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Emails table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail size={18} />
            Source Emails ({emails.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              No emails match the current filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Subject</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Date Sent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entities</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email: AdminSourceEmail) => {
                  const isExpanded = expandedId === email.id;
                  const info = email.source_email_info;

                  return (
                    <>
                      <TableRow
                        key={email.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleToggleRow(email.id)}
                      >
                        <TableCell className="w-8">
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={16} className="text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium max-w-[240px] truncate">
                          {info?.subject ?? '--'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">
                          {info?.sender ?? '--'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {info?.date_sent ? formatDateTime(info.date_sent) : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(email.status)}>
                            {email.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {email.linked_entities?.length ?? 0}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {email.created_at ? formatDateTime(email.created_at) : '--'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <EmailExpandedRow
                          key={`${email.id}-expanded`}
                          email={email}
                          onViewRaw={handleViewRaw}
                        />
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Raw email dialog */}
      <RawEmailDialog
        emailId={rawDialogEmailId}
        open={rawDialogOpen}
        onOpenChange={setRawDialogOpen}
      />
    </div>
  );
}
