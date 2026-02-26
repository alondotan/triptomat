import { useState } from 'react';
import { Mail, Copy, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  const [copied, setCopied] = useState(false);

  const validEmails = emailLinks.filter(e => e.permalink);
  if (!orderNumber && validEmails.length === 0) return null;

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
      {validEmails.map(email => (
        <Tooltip key={email.id}>
          <TooltipTrigger asChild>
            <a
              href={email.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <Mail size={13} />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top">
            {email.subject ? `פתח מייל: ${email.subject}` : 'פתח מייל'}
          </TooltipContent>
        </Tooltip>
      ))}
      {orderNumber && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded px-1.5 py-0.5 hover:bg-muted"
            >
              {copied
                ? <Check size={11} className="text-green-500 shrink-0" />
                : <Copy size={11} className="shrink-0" />
              }
              <span className="font-mono">{orderNumber}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">העתק מספר הזמנה</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
