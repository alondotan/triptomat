import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SiteNode } from '@/features/geodata/useCountrySites';
import { TYPE_LABEL_KEYS } from '@/shared/components/LocationSelector';
import { cn } from '@/shared/lib/utils';

function TreeNode({ node, depth = 0 }: { node: SiteNode; depth?: number }) {
  const { t, i18n } = useTranslation();
  const hasChildren = node.sub_sites && node.sub_sites.length > 0;
  const [expanded, setExpanded] = useState(depth < 2);
  const displayName = i18n.language === 'he' && node.site_he ? node.site_he : node.site;
  const typeLabel = TYPE_LABEL_KEYS[node.site_type] ? t(TYPE_LABEL_KEYS[node.site_type]) : node.site_type;

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 w-full text-right py-1 px-2 rounded-md transition-colors text-sm',
          hasChildren ? 'hover:bg-muted cursor-pointer' : 'cursor-default',
        )}
        style={{ paddingRight: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
            : <ChevronLeft size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className={cn('font-medium', depth === 0 && 'text-base')}>{displayName}</span>
        <span className="text-[10px] text-muted-foreground mr-auto">{typeLabel}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.sub_sites!.map((child) => (
            <TreeNode key={child.site + child.site_type} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

interface LocationTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hierarchy: SiteNode[];
  isLoading?: boolean;
}

export function LocationTreeDialog({ open, onOpenChange, hierarchy, isLoading }: LocationTreeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle>Location tree</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading locations...</span>
            </div>
          ) : hierarchy.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No locations yet. Locations will appear here after processing recommendations and emails.
            </p>
          ) : (
            hierarchy.map((node) => (
              <TreeNode key={node.site + node.site_type} node={node} depth={0} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
