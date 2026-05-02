/**
 * Shared utility helpers for Admin dashboard pages.
 */

/** Format an ISO date string as "Mar 3, 10:30 AM" (short date + time). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Format an ISO date string as "Mar 3, 2026" (date only, with year). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export { formatFileSize } from '@/shared/utils/formatUtils';
