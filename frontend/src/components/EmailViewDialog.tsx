import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

interface EmailViewDialogProps {
  emailId: string;
  subject?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailViewDialog({ emailId, subject, open, onOpenChange }: EmailViewDialogProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<{ sender?: string; date?: string; body?: string; permalink?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setContent(null);
    supabase
      .from('source_emails')
      .select('source_email_info')
      .eq('id', emailId)
      .single()
      .then(({ data }) => {
        const info = data?.source_email_info as { subject?: string; sender?: string; date_sent?: string; raw_content_cleaned?: string; email_permalink?: string } | null;
        // Use stored permalink, or build a Gmail search fallback from subject+sender
        let permalink = info?.email_permalink;
        if (!permalink && info?.sender) {
          const q = [`from:(${info.sender})`];
          if (info.subject) q.push(`subject:(${info.subject})`);
          permalink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q.join(' '))}`;
        }
        setContent({
          sender: info?.sender,
          date: info?.date_sent,
          body: info?.raw_content_cleaned,
          permalink,
        });
        setLoading(false);
      });
  }, [open, emailId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-3">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base">{subject || t('emailView.title')}</DialogTitle>
            {content?.permalink && (
              <a
                href={content.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0 pe-4"
              >
                <ExternalLink size={13} />
                {t('emailView.openInApp')}
              </a>
            )}
          </div>
        </DialogHeader>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8" aria-live="polite">{t('common.loading')}</div>
        ) : content ? (
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {(content.sender || content.date) && (
              <div className="text-xs text-muted-foreground space-y-0.5 pb-2 border-b">
                {content.sender && <p>{t('emailView.from', { sender: content.sender })}</p>}
                {content.date && <p>{t('emailView.date', { date: content.date })}</p>}
              </div>
            )}
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed break-words" style={{ overflowWrap: 'break-word' }}>
              {content.body || t('emailView.noContent')}
            </pre>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm py-8">{t('emailView.contentNotFound')}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
