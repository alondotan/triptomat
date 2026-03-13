import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, Copy, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmailViewDialog } from './EmailViewDialog';

interface EmailLink {
  id: string;
  permalink?: string;
  subject?: string;
}

interface BookingActionsProps {
  orderNumber?: string;
  emailLinks: EmailLink[];
}

export function BookingActions({ orderNumber, emailLinks }: BookingActionsProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [viewingEmail, setViewingEmail] = useState<EmailLink | null>(null);

  if (!orderNumber && emailLinks.length === 0) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!orderNumber) return;
    navigator.clipboard.writeText(orderNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {emailLinks.map(email => (
        <Tooltip key={email.id}>
          <TooltipTrigger asChild>
            {email.permalink ? (
              <a
                href={email.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                onClick={e => e.stopPropagation()}
                aria-label={t('bookingActions.emailLink')}
              >
                <Mail size={13} />
              </a>
            ) : (
              <button
                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                onClick={e => { e.stopPropagation(); setViewingEmail(email); }}
                aria-label={t('bookingActions.viewEmail')}
              >
                <Mail size={13} />
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="top">
            {email.subject ? t('bookingActions.openEmailSubject', { subject: email.subject }) : t('bookingActions.openEmail')}
          </TooltipContent>
        </Tooltip>
      ))}
      {orderNumber && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted"
              aria-label={t('bookingActions.copyOrderNumber')}
            >
              {copied
                ? <Check size={11} className="text-green-500 shrink-0" />
                : <Copy size={11} className="shrink-0" />
              }
              <span className="font-mono">{orderNumber}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('bookingActions.copyOrderNumber')}</TooltipContent>
        </Tooltip>
      )}

      {viewingEmail && (
        <EmailViewDialog
          emailId={viewingEmail.id}
          subject={viewingEmail.subject}
          open={!!viewingEmail}
          onOpenChange={(open) => { if (!open) setViewingEmail(null); }}
        />
      )}
    </div>
  );
}
