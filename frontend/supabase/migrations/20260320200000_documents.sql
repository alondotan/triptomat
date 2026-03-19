-- Documents table for travel document management
-- Supports both trip-specific documents (trip_id set) and general/personal documents (trip_id NULL)
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- RLS: general docs (trip_id IS NULL) → user owns directly; trip docs → has_trip_access
CREATE POLICY "Users can view documents" ON public.documents
  FOR SELECT USING (
    (trip_id IS NULL AND user_id = auth.uid())
    OR (trip_id IS NOT NULL AND public.has_trip_access(trip_id))
  );

CREATE POLICY "Users can create documents" ON public.documents
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      trip_id IS NULL
      OR public.has_trip_access(trip_id)
    )
  );

CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE USING (
    (trip_id IS NULL AND user_id = auth.uid())
    OR (trip_id IS NOT NULL AND public.has_trip_access(trip_id))
  );

CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE USING (
    (trip_id IS NULL AND user_id = auth.uid())
    OR (trip_id IS NOT NULL AND public.has_trip_access(trip_id))
  );

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_trip_id ON public.documents(trip_id);

-- Storage bucket for document files
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access files under their own user_id folder
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
