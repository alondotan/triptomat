import type { POIStatus } from '@/types/trip';

export const STATUS_COLORS: Record<POIStatus, string> = {
  suggested:  'bg-v2-surface-container-high text-v2-on-surface-variant',
  interested: 'bg-blue-900/40 text-blue-300',
  planned:    'bg-indigo-900/40 text-indigo-300',
  scheduled:  'bg-v2-primary/20 text-v2-primary',
  booked:     'bg-v2-secondary/20 text-v2-secondary',
  visited:    'bg-emerald-900/40 text-emerald-300',
  skipped:    'bg-v2-surface-container text-v2-on-surface-variant',
};

export const CATEGORY_GRADIENTS: Record<string, string> = {
  attraction:    'from-slate-900 via-blue-950 to-indigo-900',
  service:       'from-slate-900 via-zinc-900 to-slate-800',
  eatery:        'from-amber-950 via-orange-950 to-red-950',
  accommodation: 'from-emerald-950 via-teal-950 to-cyan-950',
  event:         'from-purple-950 via-violet-950 to-indigo-950',
};
