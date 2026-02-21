
-- Drop all existing tables (order matters due to foreign keys)
DROP TABLE IF EXISTS alternative_hotels CASCADE;
DROP TABLE IF EXISTS accommodations CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS transportations CASCADE;
DROP TABLE IF EXISTS webhook_items CASCADE;
DROP TABLE IF EXISTS trip_days CASCADE;
DROP TABLE IF EXISTS trips CASCADE;

-- ============================================================
-- TRIPS
-- ============================================================
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  countries TEXT[] DEFAULT '{}',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'research',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Allow public insert on trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on trips" ON public.trips FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on trips" ON public.trips FOR DELETE USING (true);

-- ============================================================
-- POINTS OF INTEREST (POI) - unified: accommodation, eatery, attraction, service
-- ============================================================
CREATE TABLE public.points_of_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- accommodation | eatery | attraction | service
  sub_category TEXT, -- hotel | restaurant | museum | atm | etc (from config master_list)
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate | in_plan | booked | visited
  location JSONB DEFAULT '{}', -- { country, city, address, coordinates: { lat, lng } }
  source_refs JSONB DEFAULT '{"email_ids":[],"recommendation_ids":[]}',
  details JSONB DEFAULT '{}', -- cost, order_number, booking, accommodation_details, activity_details, notes
  is_cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_poi_trip_id ON public.points_of_interest(trip_id);
CREATE INDEX idx_poi_category ON public.points_of_interest(category);

ALTER TABLE public.points_of_interest ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on poi" ON public.points_of_interest FOR SELECT USING (true);
CREATE POLICY "Allow public insert on poi" ON public.points_of_interest FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on poi" ON public.points_of_interest FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on poi" ON public.points_of_interest FOR DELETE USING (true);

-- ============================================================
-- TRANSPORTATION
-- ============================================================
CREATE TABLE public.transportation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- flight | ferry | train | taxi | bus | car_rental | etc
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate | in_plan | booked | completed
  source_refs JSONB DEFAULT '{"email_ids":[],"recommendation_ids":[]}',
  cost JSONB DEFAULT '{"total_amount":0,"currency":"USD"}',
  booking JSONB DEFAULT '{}', -- order_number, carrier_name, baggage_allowance
  segments JSONB DEFAULT '[]', -- array of segment objects
  additional_info JSONB DEFAULT '{}', -- notes, layover_details
  is_cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transport_trip_id ON public.transportation(trip_id);

ALTER TABLE public.transportation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on transportation" ON public.transportation FOR SELECT USING (true);
CREATE POLICY "Allow public insert on transportation" ON public.transportation FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on transportation" ON public.transportation FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on transportation" ON public.transportation FOR DELETE USING (true);

-- ============================================================
-- COLLECTIONS - ordered groups of POIs and transportation
-- ============================================================
CREATE TABLE public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  collection_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate | in_plan | booked
  time_window JSONB DEFAULT '{}', -- { start_time, end_time }
  items JSONB DEFAULT '[]', -- array of { cronical_order, entity_type, entity_id, start_time, end_time, notes }
  source_refs JSONB DEFAULT '{"recommendation_ids":[]}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collections_trip_id ON public.collections(trip_id);

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on collections" ON public.collections FOR SELECT USING (true);
CREATE POLICY "Allow public insert on collections" ON public.collections FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on collections" ON public.collections FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on collections" ON public.collections FOR DELETE USING (true);

-- ============================================================
-- SOURCE EMAILS - parsed webhook email data
-- ============================================================
CREATE TABLE public.source_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  email_id TEXT, -- external email uuid
  source_email_info JSONB DEFAULT '{}', -- subject, sender, date_sent, email_permalink, raw_content_cleaned
  parsed_data JSONB DEFAULT '{}', -- metadata, accommodation_details, eatery_details, etc.
  linked_entities JSONB DEFAULT '[]', -- array of { entity_type, entity_id, description }
  status TEXT NOT NULL DEFAULT 'pending', -- pending | linked | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_emails_trip_id ON public.source_emails(trip_id);
CREATE INDEX idx_source_emails_status ON public.source_emails(status);

ALTER TABLE public.source_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on source_emails" ON public.source_emails FOR SELECT USING (true);
CREATE POLICY "Allow public insert on source_emails" ON public.source_emails FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on source_emails" ON public.source_emails FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on source_emails" ON public.source_emails FOR DELETE USING (true);

-- ============================================================
-- SOURCE RECOMMENDATIONS
-- ============================================================
CREATE TABLE public.source_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  recommendation_id TEXT, -- external uuid
  timestamp TIMESTAMPTZ,
  source_url TEXT,
  analysis JSONB DEFAULT '{}', -- main_site, sites_list, extracted_items (with linked_entity)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | linked
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_recs_trip_id ON public.source_recommendations(trip_id);

ALTER TABLE public.source_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on source_recommendations" ON public.source_recommendations FOR SELECT USING (true);
CREATE POLICY "Allow public insert on source_recommendations" ON public.source_recommendations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on source_recommendations" ON public.source_recommendations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on source_recommendations" ON public.source_recommendations FOR DELETE USING (true);

-- ============================================================
-- MISSIONS (tasks)
-- ============================================================
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | completed | cancelled
  due_date TIMESTAMPTZ,
  context_links TEXT[] DEFAULT '{}',
  reminders JSONB DEFAULT '[]', -- array of { reminder_id, remind_at, is_sent }
  object_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_missions_trip_id ON public.missions(trip_id);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on missions" ON public.missions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on missions" ON public.missions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on missions" ON public.missions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on missions" ON public.missions FOR DELETE USING (true);

-- ============================================================
-- ITINERARY DAYS - daily plan referencing POIs, collections, transportation
-- ============================================================
CREATE TABLE public.itinerary_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  date DATE,
  location_context TEXT,
  accommodation_options JSONB DEFAULT '[]', -- array of { is_selected, poi_id, notes }
  activities JSONB DEFAULT '[]', -- array of { order, type: poi|collection, id, time_window }
  transportation_segments JSONB DEFAULT '[]', -- array of { is_selected, transportation_id, segment_id, notes }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_itinerary_trip_id ON public.itinerary_days(trip_id);
CREATE UNIQUE INDEX idx_itinerary_unique_day ON public.itinerary_days(trip_id, day_number);

ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read on itinerary_days" ON public.itinerary_days FOR SELECT USING (true);
CREATE POLICY "Allow public insert on itinerary_days" ON public.itinerary_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on itinerary_days" ON public.itinerary_days FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on itinerary_days" ON public.itinerary_days FOR DELETE USING (true);

-- ============================================================
-- Triggers for updated_at
-- ============================================================
CREATE TRIGGER update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_poi_updated_at BEFORE UPDATE ON public.points_of_interest FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transportation_updated_at BEFORE UPDATE ON public.transportation FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON public.collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_source_emails_updated_at BEFORE UPDATE ON public.source_emails FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_source_recs_updated_at BEFORE UPDATE ON public.source_recommendations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_missions_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_itinerary_updated_at BEFORE UPDATE ON public.itinerary_days FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
