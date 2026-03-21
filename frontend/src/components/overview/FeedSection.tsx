import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FeedSectionProps {
  title: string;
  icon: LucideIcon;
  count: number;
  linkTo: string;
  /** Tailwind color class for the icon, e.g. "text-green-600" */
  iconColor?: string;
  children: ReactNode;
}

export function FeedSection({
  title,
  icon: Icon,
  count,
  linkTo,
  iconColor = 'text-primary',
  children,
}: FeedSectionProps) {
  return (
    <div className="space-y-2">
      {/* Header — matches POIs page group header style */}
      <Link
        to={linkTo}
        className="flex items-center gap-2 hover:text-primary transition-colors group/header"
      >
        <Icon size={18} className={`shrink-0 ${iconColor}`} />
        <span className="text-lg font-semibold flex-1">{title}</span>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
        <ChevronLeft size={16} className="text-muted-foreground group-hover/header:text-primary transition-colors" />
      </Link>

      {/* Content */}
      {children}
    </div>
  );
}
