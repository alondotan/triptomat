/**
 * Admin API service for communicating with the triptomat-admin Lambda.
 *
 * Required environment variables:
 *   VITE_ADMIN_API_URL   — API Gateway base URL (e.g. https://9hhwxodv7a.execute-api.eu-central-1.amazonaws.com)
 *   VITE_ADMIN_API_TOKEN — Bearer token for admin authentication
 */

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL || '';
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

/** GET /admin/cloudwatch/metrics — response */
export interface CloudWatchMetricsResponse {
  period: string;
  start_time: string;
  end_time: string;
  granularity_seconds: number;
  lambda: Record<string, LambdaFunctionMetrics>;
  sqs: Record<string, SqsQueueMetrics>;
}

/** Source email info sub-object */
export interface SourceEmailInfo {
  subject: string;
  sender: string;
  date_sent: string;
}

/** GET /admin/emails — individual email */
export interface AdminSourceEmail {
  id: string;
  trip_id: string;
  email_id: string;
  source_email_info: SourceEmailInfo;
  parsed_data: Record<string, unknown>;
  linked_entities: Array<{ entity_type: string; entity_id: string; description: string }>;
  status: string;
  created_at: string;
}

/** GET /admin/emails — response */
export interface EmailsResponse {
  emails: AdminSourceEmail[];
  count: number;
}

/** GET /admin/emails/{email_id}/raw — response */
export interface EmailRawResponse {
  email_id: string;
  s3_key: string;
  size_bytes: number;
  raw_text_preview: string;
}

/** GET /admin/emails/stats — response */
export interface EmailStats {
  by_status: Record<string, number>;
  by_trip: Array<{ trip_id: string; count: number }>;
  by_day: Array<{ date: string; count: number }>;
  avg_entities_per_email: number;
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

/** List source emails, optionally filtered by status. */
export function getEmails(
  status?: string,
  limit?: number,
): Promise<EmailsResponse> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (limit !== undefined) params.set('limit', String(limit));
  const qs = params.toString();
  return adminFetch<EmailsResponse>(`/admin/emails${qs ? `?${qs}` : ''}`);
}

/** Fetch raw email text from S3 for a given email_id. */
export function getEmailRaw(
  emailId: string,
): Promise<EmailRawResponse> {
  return adminFetch<EmailRawResponse>(`/admin/emails/${encodeURIComponent(emailId)}/raw`);
}

/** Fetch aggregate email statistics. */
export function getEmailStats(): Promise<EmailStats> {
  return adminFetch<EmailStats>('/admin/emails/stats');
}
