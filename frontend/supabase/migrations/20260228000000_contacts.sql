-- Trip contacts table (local contacts at destination: guides, hosts, rentals, etc.)
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'other',
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts" ON public.contacts FOR SELECT USING (owns_trip(trip_id));
CREATE POLICY "Users can create contacts" ON public.contacts FOR INSERT WITH CHECK (owns_trip(trip_id));
CREATE POLICY "Users can update own contacts" ON public.contacts FOR UPDATE USING (owns_trip(trip_id));
CREATE POLICY "Users can delete own contacts" ON public.contacts FOR DELETE USING (owns_trip(trip_id));

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_contacts_trip_id ON public.contacts(trip_id);
