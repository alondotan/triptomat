/**
 * Admin API service for communicating with the triptomat-admin Lambda.
 *
 * Required environment variables:
 *   VITE_ADMIN_API_URL   — API Gateway base URL (e.g. https://9hhwxodv7a.execute-api.eu-central-1.amazonaws.com)
 *   VITE_ADMIN_API_TOKEN — Bearer token for admin authentication
 */

// In dev mode, the Vite proxy handles /admin/* → API Gateway, so use relative paths.
// In production, use the full API Gateway URL from env.
const ADMIN_API_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_ADMIN_API_URL || '');
const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN || '';

// ---------------------------------------------------------------------------
// Types — aligned with lambda_admin/handler.py response shapes
// ---------------------------------------------------------------------------

/** GET /admin/stats — DynamoDB sub-section */
export interface DynamoStats {
  total_items: number;
  by_status: Record<string, number>;
}

/** GET /admin/stats — S3 sub-section (per bucket) */
export interface S3BucketStats {
  total_objects: number;
  total_size_bytes: number;
}

/** GET /admin/stats — Supabase sub-section */
export interface SupabaseStats {
  users: number;
  trips: number;
  pois: number;
}

/** GET /admin/stats — top-level */
export interface AdminStats {
  dynamodb: DynamoStats | { error: string };
  s3: Record<string, S3BucketStats | { error: string }>;
  supabase: SupabaseStats | { error: string };
}

/** GET /admin/s3/objects — individual object */
export interface S3Object {
  key: string;
  size: number;
  last_modified: string;
  etag: string;
}

/** GET /admin/s3/objects — response */
export interface S3ListResponse {
  bucket: string;
  prefix: string;
  objects: S3Object[];
  count: number;
  is_truncated: boolean;
  next_continuation_token?: string;
}

/** DELETE /admin/s3/objects — response */
export interface S3DeleteResponse {
  deleted: number;
  errors?: Array<{ key: string; message: string }>;
}

/** GET /admin/cache — individual entry */
export interface CacheEntry {
  url: string;
  job_id: string;
  status: string;
  created_at: string;
  source_metadata?: { title?: string; image?: string };
  error?: string;
}

/** GET /admin/cache — response */
export interface CacheListResponse {
  items: CacheEntry[];
  count: number;
  last_key?: string;
}

/** DELETE /admin/cache — response */
export interface CacheDeleteResponse {
  deleted: number;
  errors?: Array<{ url: string; message: string }>;
}

/** POST /admin/cache/reprocess — response */
export interface ReprocessResponse {
  reprocessing: boolean;
  queue: string;
  job_id: string;
}

/** GET /admin/users — individual user */
export interface UserInfo {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string;
  trips_count: number;
  pois_count: number;
}

/** GET /admin/users — response */
export interface UsersListResponse {
  users: UserInfo[];
  count: number;
  limit: number;
  offset: number;
}

/** GET /admin/cloudwatch/metrics — Lambda metrics for a single function */
export interface LambdaMetricDetail {
  total: number;
  datapoints: number;
}

/** GET /admin/cloudwatch/metrics — per-function metrics */
export interface LambdaFunctionMetrics {
  invocations?: LambdaMetricDetail;
  errors?: LambdaMetricDetail;
}

/** GET /admin/cloudwatch/metrics — per-queue metrics */
export interface SqsQueueMetrics {
  messages_sent?: number;
  messages_received?: number;
  approximate_queue_depth?: number;
}

/** GET /admin/dlq — individual message */
export interface DlqMessage {
  message_id: string;
  receipt_handle: string;
  body: string;
  attributes: Record<string, string>;
  sent_timestamp: string;
}

/** GET /admin/dlq — per-queue info */
export interface DlqQueue {
  name: string;
  url: string;
  queue: string;
  approximate_count: number;
  messages: DlqMessage[];
}

/** GET /admin/dlq — response */
export interface DlqResponse {
  queues: DlqQueue[];
}

/** POST /admin/dlq/redrive — response */
export interface DlqRedriveResponse {
  success: boolean;
  queue: string;
  warning?: string;
}

/** DELETE /admin/dlq — response */
export interface DlqDeleteResponse {
  deleted: boolean;
}

/** GET /admin/cloudwatch/metrics — response */
export interface CloudWatchMetricsResponse {
  period: string;
  start_time: string;
  end_time: string;
  granularity_seconds: number;
  lambda: Record<string, LambdaFunctionMetrics>;
  sqs: Record<string, SqsQueueMetrics>;
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${ADMIN_API_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ADMIN_API_TOKEN}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Fetch overview stats (DynamoDB, S3, Supabase). */
export function getStats(): Promise<AdminStats> {
  return adminFetch<AdminStats>('/admin/stats');
}

/** List S3 objects in a bucket. */
export function listS3Objects(
  bucket: string,
  prefix?: string,
  limit?: number,
  continuationToken?: string,
): Promise<S3ListResponse> {
  const params = new URLSearchParams({ bucket });
  if (prefix) params.set('prefix', prefix);
  if (limit !== undefined) params.set('limit', String(limit));
  if (continuationToken) params.set('continuation_token', continuationToken);
  return adminFetch<S3ListResponse>(`/admin/s3/objects?${params}`);
}

/** Delete one or more S3 objects. */
export function deleteS3Objects(bucket: string, keys: string[]): Promise<S3DeleteResponse> {
  return adminFetch<S3DeleteResponse>('/admin/s3/objects', {
    method: 'DELETE',
    body: JSON.stringify({ bucket, keys }),
  });
}

/** List DynamoDB cache entries, optionally filtered by status. */
export function listCacheEntries(
  status?: string,
  limit?: number,
  lastKey?: string,
): Promise<CacheListResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit !== undefined) params.set('limit', String(limit));
  if (lastKey) params.set('last_key', lastKey);
  const qs = params.toString();
  return adminFetch<CacheListResponse>(`/admin/cache${qs ? `?${qs}` : ''}`);
}

/** Delete one or more cache entries by URL. */
export function deleteCacheEntries(urls: string[]): Promise<CacheDeleteResponse> {
  return adminFetch<CacheDeleteResponse>('/admin/cache', {
    method: 'DELETE',
    body: JSON.stringify({ urls }),
  });
}

/** Reprocess a URL (delete cache + re-submit to SQS). */
export function reprocessUrl(url: string): Promise<ReprocessResponse> {
  return adminFetch<ReprocessResponse>('/admin/cache/reprocess', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

/** List users from Supabase with trip/POI counts. */
export function listUsers(
  limit?: number,
  offset?: number,
  search?: string,
): Promise<UsersListResponse> {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  if (search) params.set('search', search);
  const qs = params.toString();
  return adminFetch<UsersListResponse>(`/admin/users${qs ? `?${qs}` : ''}`);
}

/** Fetch CloudWatch metrics for Lambda functions and SQS queues. */
export function getCloudWatchMetrics(
  period?: string,
): Promise<CloudWatchMetricsResponse> {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  const qs = params.toString();
  return adminFetch<CloudWatchMetricsResponse>(
    `/admin/cloudwatch/metrics${qs ? `?${qs}` : ''}`,
  );
}

/** Fetch messages from all dead-letter queues. */
export function getDlqMessages(): Promise<DlqResponse> {
  return adminFetch<DlqResponse>('/admin/dlq');
}

/** Redrive a message from a DLQ back to its main queue. */
export function redriveDlqMessage(
  queue: string,
  messageId: string,
  receiptHandle: string,
): Promise<DlqRedriveResponse> {
  return adminFetch<DlqRedriveResponse>('/admin/dlq/redrive', {
    method: 'POST',
    body: JSON.stringify({ queue, message_id: messageId, receipt_handle: receiptHandle }),
  });
}

/** Delete a specific message from a DLQ. */
export function deleteDlqMessage(
  queue: string,
  receiptHandle: string,
): Promise<DlqDeleteResponse> {
  return adminFetch<DlqDeleteResponse>('/admin/dlq', {
    method: 'DELETE',
    body: JSON.stringify({ queue, receipt_handle: receiptHandle }),
  });
}
