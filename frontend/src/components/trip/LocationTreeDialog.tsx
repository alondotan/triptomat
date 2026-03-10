import { useState } from 'react';
import { ChevronDown, ChevronLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SiteHierarchyNode } from '@/types/webhook';
import { TYPE_LABELS } from '@/components/shared/LocationSelector';
import { cn } from '@/lib/utils';

/** Merge duplicate nodes in a SiteHierarchyNode[] (e.g. same country from multiple sources) */
function mergeNodes(nodes: SiteHierarchyNode[]): SiteHierarchyNode[] {
  const map = new Map<string, SiteHierarchyNode>();
  for (const node of nodes) {
    const key = node.site.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      // Merge sub_sites
      if (node.sub_sites?.length) {
        existing.sub_sites = mergeNodes([...(existing.sub_sites || []), ...node.sub_sites]);
      }
    } else {
      map.set(key, {
        site: node.site,
        site_type: node.site_type,
        sub_sites: node.sub_sites ? mergeNodes(node.sub_sites) : undefined,
      });
    }
  }
  return Array.from(map.values());
}

function TreeNode({ node, depth = 0 }: { node: SiteHierarchyNode; depth?: number }) {
  const hasChildren = node.sub_sites && node.sub_sites.length > 0;
  const [expanded, setExpanded] = useState(depth < 2);

  const typeLabel = TYPE_LABELS[node.site_type] || node.site_type;

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
        <span className={cn('font-medium', depth === 0 && 'text-base')}>{node.site}</span>
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
  hierarchy: SiteHierarchyNode[];
}

export function LocationTreeDialog({ open, onOpenChange, hierarchy }: LocationTreeDialogProps) {
  const merged = mergeNodes(hierarchy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle>עץ מיקומים</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 -mx-2 px-2">
          {merged.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              אין מיקומים עדיין. מיקומים יופיעו כאן לאחר עיבוד המלצות ומיילים.
            </p>
          ) : (
            merged.map((node) => (
              <TreeNode key={node.site + node.site_type} node={node} depth={0} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
