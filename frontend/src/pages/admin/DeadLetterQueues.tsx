import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import {
  AlertTriangle,
  RefreshCw,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useDlqMessages, useRedriveDlqMessage, useDeleteDlqMessage } from '@/features/admin/useAdminQueries';
import { toast } from '@/shared/hooks/use-toast';
import type { DlqMessage, DlqQueue, DlqRedriveResponse, DlqDeleteResponse } from '@/features/admin/adminService';

// -- Helpers ----------------------------------------------------------------

function truncateId(id: string, maxLength: number = 12): string {
  return id.length > maxLength ? id.substring(0, maxLength) + '...' : id;
}

function formatTimestamp(ts: string): string {
  if (!ts) return '--';
  // SQS SentTimestamp is epoch millis
  const ms = Number(ts);
  if (!isNaN(ms)) {
    return new Date(ms).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return ts;
}

function tryPrettyPrintJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// -- Component --------------------------------------------------------------

interface DeleteTarget {
  queue: string;
  receiptHandle: string;
  messageId: string;
}

export default function DeadLetterQueuesPage() {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const { data, isLoading, error, refetch } = useDlqMessages();
  const redriveMutation = useRedriveDlqMessage();
  const deleteMutation = useDeleteDlqMessage();

  const toggleExpanded = (messageId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleRedrive = (queue: string, messageId: string, receiptHandle: string) => {
    redriveMutation.mutate(
      { queue, messageId, receiptHandle },
      {
        onSuccess: (result: DlqRedriveResponse) => {
          toast({
            title: 'Message redriven',
            description: `Message sent back to ${result.queue} queue${result.warning ? ` (${result.warning})` : ''}`,
          });
        },
        onError: (err: Error) => {
          toast({ title: 'Redrive failed', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  const handleRedriveAll = (queue: DlqQueue) => {
    for (const msg of queue.messages) {
      redriveMutation.mutate(
        { queue: queue.queue, messageId: msg.message_id, receiptHandle: msg.receipt_handle },
        {
          onError: (err: Error) => {
            toast({ title: `Redrive failed for ${truncateId(msg.message_id)}`, description: err.message, variant: 'destructive' });
          },
        },
      );
    }
    toast({ title: 'Redrive All', description: `Submitted ${queue.messages.length} messages for redrive` });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { queue: deleteTarget.queue, receiptHandle: deleteTarget.receiptHandle },
      {
        onSuccess: (_result: DlqDeleteResponse) => {
          toast({ title: 'Deleted', description: 'Message removed from DLQ' });
        },
        onError: (err: Error) => {
          toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
        },
      },
    );
    setDeleteTarget(null);
  };

  // -- Loading state --------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // -- Error state ----------------------------------------------------------
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

  const queues = data?.queues ?? [];
  const totalMessages = queues.reduce((sum, q) => sum + q.approximate_count, 0);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">Dead Letter Queues</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <AlertTriangle size={16} />
            <span>{totalMessages} total message{totalMessages !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Queue cards */}
        {queues.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">No DLQ queues configured.</p>
            </CardContent>
          </Card>
        ) : (
          queues.map((queue: DlqQueue) => (
            <Card key={queue.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle size={18} className="text-amber-500" />
                    {queue.name}
                    <Badge variant={queue.approximate_count > 0 ? 'destructive' : 'secondary'} className="ml-2">
                      {queue.approximate_count} message{queue.approximate_count !== 1 ? 's' : ''}
                    </Badge>
                  </CardTitle>
                  {queue.messages.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleRedriveAll(queue)}
                      disabled={redriveMutation.isPending}
                    >
                      <RotateCcw size={14} />
                      Redrive All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {queue.messages.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground">No messages in this queue.</p>
                ) : (
                  <div className="space-y-3">
                    {queue.messages.map((msg: DlqMessage) => {
                      const isExpanded = expandedMessages.has(msg.message_id);
                      return (
                        <Collapsible key={msg.message_id} open={isExpanded} onOpenChange={() => toggleExpanded(msg.message_id)}>
                          <div className="border rounded-lg">
                            {/* Message header row */}
                            <div className="flex items-center justify-between p-3">
                              <CollapsibleTrigger asChild>
                                <button className="flex items-center gap-2 text-sm font-mono hover:text-foreground text-muted-foreground transition-colors">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  <span title={msg.message_id}>{truncateId(msg.message_id)}</span>
                                </button>
                              </CollapsibleTrigger>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-muted-foreground">
                                  {formatTimestamp(msg.sent_timestamp)}
                                </span>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary"
                                    onClick={() => handleRedrive(queue.queue, msg.message_id, msg.receipt_handle)}
                                    disabled={redriveMutation.isPending}
                                    title="Redrive"
                                  >
                                    <RotateCcw size={14} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => setDeleteTarget({ queue: queue.queue, receiptHandle: msg.receipt_handle, messageId: msg.message_id })}
                                    disabled={deleteMutation.isPending}
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* Collapsible body */}
                            <CollapsibleContent>
                              <div className="border-t px-3 py-3">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Message Body</p>
                                <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-64 whitespace-pre-wrap break-all">
                                  {tryPrettyPrintJson(msg.body)}
                                </pre>
                                {Object.keys(msg.attributes).length > 0 && (
                                  <>
                                    <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">Attributes</p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                      {Object.entries(msg.attributes).map(([key, value]) => (
                                        <div key={key} className="flex gap-2">
                                          <span className="font-medium text-muted-foreground">{key}:</span>
                                          <span className="text-foreground">{key.includes('Timestamp') ? formatTimestamp(value) : value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DLQ Message?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove message{' '}
              <span className="font-mono text-xs">{deleteTarget?.messageId ? truncateId(deleteTarget.messageId) : ''}</span>{' '}
              from the dead-letter queue. This action cannot be undone.
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
    </>
  );
}
