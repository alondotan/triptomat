import { TripDocument, DocumentCategory } from '@/types/trip';
import { supabase } from './helpers';

export async function fetchTripDocuments(tripId: string): Promise<TripDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDocument);
}

export async function fetchGeneralDocuments(): Promise<TripDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .is('trip_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDocument);
}

async function invokeDocumentUrls(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('document-urls', { body });
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function createDocument(
  doc: { tripId: string | null; category: DocumentCategory; name: string; notes?: string },
  file: File,
): Promise<TripDocument> {
  // 1. Get presigned upload URL from edge function
  const { uploadUrl, storagePath } = await invokeDocumentUrls({
    action: 'upload-url',
    tripId: doc.tripId,
    fileName: file.name,
    contentType: file.type,
  }) as { uploadUrl: string; storagePath: string };

  // 2. Upload file directly to S3
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Upload failed');

  // 3. Insert metadata into documents table
  const { data, error } = await supabase
    .from('documents')
    .insert([{
      trip_id: doc.tripId,
      category: doc.category,
      name: doc.name,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      storage_path: storagePath,
      notes: doc.notes || null,
    }])
    .select()
    .single();
  if (error) {
    // Clean up uploaded file if DB insert fails
    await invokeDocumentUrls({ action: 'delete', storagePath }).catch(() => {});
    throw error;
  }
  return mapDocument(data);
}

export async function updateDocument(id: string, updates: Partial<Pick<TripDocument, 'name' | 'category' | 'notes'>>): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;
  const { error } = await supabase.from('documents').update(updateData).eq('id', id);
  if (error) throw error;
}

export async function deleteDocument(id: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) throw error;
  await invokeDocumentUrls({ action: 'delete', storagePath }).catch(() => {});
}

export async function getDocumentUrl(storagePath: string): Promise<string | null> {
  try {
    const { downloadUrl } = await invokeDocumentUrls({
      action: 'download-url',
      storagePath,
    }) as { downloadUrl: string };
    return downloadUrl;
  } catch {
    return null;
  }
}

function mapDocument(row: Record<string, unknown>): TripDocument {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    tripId: (row.trip_id as string) || null,
    category: (row.category as DocumentCategory) || 'other',
    name: row.name as string,
    fileName: row.file_name as string,
    fileSize: (row.file_size as number) || undefined,
    mimeType: (row.mime_type as string) || undefined,
    storagePath: row.storage_path as string,
    notes: (row.notes as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
