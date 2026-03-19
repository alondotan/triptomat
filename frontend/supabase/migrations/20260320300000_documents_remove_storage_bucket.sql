-- Remove Supabase Storage policies for documents — files are stored in S3 instead
-- The empty bucket can be deleted from the Supabase dashboard
DROP POLICY IF EXISTS "Users can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents" ON storage.objects;
