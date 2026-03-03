/**
 * TanStack Query hooks for the admin API.
 *
 * Each hook wraps a function from adminService.ts with caching, refetching, and
 * optimistic invalidation where appropriate.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as adminService from '@/services/adminService';

// ---------------------------------------------------------------------------
// Query keys — centralised so invalidation is consistent
// ---------------------------------------------------------------------------

export const adminKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  s3Objects: (bucket: string, prefix?: string) =>
    ['admin', 's3', bucket, prefix ?? ''] as const,
  cache: (status?: string) => ['admin', 'cache', status ?? 'all'] as const,
  users: (search?: string) => ['admin', 'users', search ?? ''] as const,
  metrics: (period: string) => ['admin', 'metrics', period] as const,
  costs: (period: string) => ['admin', 'costs', period] as const,
};

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/** Overview statistics (DynamoDB, S3, Supabase). Auto-refreshes every 30 s. */
export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats,
    queryFn: adminService.getStats,
    refetchInterval: 30_000,
  });
}

/** List S3 objects in a given bucket + prefix. */
export function useS3Objects(
  bucket: string,
  prefix?: string,
  limit?: number,
  continuationToken?: string,
) {
  return useQuery({
    queryKey: adminKeys.s3Objects(bucket, prefix),
    queryFn: () =>
      adminService.listS3Objects(bucket, prefix, limit, continuationToken),
    enabled: !!bucket,
  });
}

/** DynamoDB cache entries, optionally filtered by status. */
export function useCacheEntries(
  status?: string,
  limit?: number,
  lastKey?: string,
) {
  return useQuery({
    queryKey: adminKeys.cache(status),
    queryFn: () => adminService.listCacheEntries(status, limit, lastKey),
  });
}

/** User listing from Supabase. */
export function useUsers(
  limit?: number,
  offset?: number,
  search?: string,
) {
  return useQuery({
    queryKey: adminKeys.users(search),
    queryFn: () => adminService.listUsers(limit, offset, search),
  });
}

/** CloudWatch Lambda + SQS metrics. */
export function useCloudWatchMetrics(period: string = '24h') {
  return useQuery({
    queryKey: adminKeys.metrics(period),
    queryFn: () => adminService.getCloudWatchMetrics(period),
    refetchInterval: 60_000, // refresh every 60 s
  });
}

/** Cost estimation data for a given period. Refreshes every 5 min. */
export function useCosts(period: string = '30d') {
  return useQuery({
    queryKey: adminKeys.costs(period),
    queryFn: () => adminService.getCosts(period),
    refetchInterval: 300_000, // refresh every 5 min
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/** Delete S3 objects, then invalidate S3 + stats queries. */
export function useDeleteS3Objects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bucket, keys }: { bucket: string; keys: string[] }) =>
      adminService.deleteS3Objects(bucket, keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 's3'] });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
}

/** Delete cache entries, then invalidate cache + stats queries. */
export function useDeleteCacheEntries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (urls: string[]) => adminService.deleteCacheEntries(urls),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cache'] });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
}

/** Reprocess a URL (delete cache + re-submit), then invalidate cache + stats. */
export function useReprocessUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => adminService.reprocessUrl(url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cache'] });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
}
