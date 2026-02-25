-- Change source_emails.trip_id FK from ON DELETE SET NULL to ON DELETE CASCADE
-- so that emails are deleted when their parent trip is deleted
ALTER TABLE public.source_emails DROP CONSTRAINT source_emails_trip_id_fkey;
ALTER TABLE public.source_emails ADD CONSTRAINT source_emails_trip_id_fkey
  FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

-- Change source_recommendations.trip_id FK from ON DELETE SET NULL to ON DELETE CASCADE
-- so that recommendations are deleted when their parent trip is deleted
ALTER TABLE public.source_recommendations DROP CONSTRAINT source_recommendations_trip_id_fkey;
ALTER TABLE public.source_recommendations ADD CONSTRAINT source_recommendations_trip_id_fkey
  FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

-- Clean up any already-orphaned records (trip_id = NULL) from previous SET NULL deletes
DELETE FROM public.source_emails WHERE trip_id IS NULL;
DELETE FROM public.source_recommendations WHERE trip_id IS NULL;
