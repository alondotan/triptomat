-- Create trips table
CREATE TABLE public.trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trip_days table
CREATE TABLE public.trip_days (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(trip_id, date)
);

-- Create accommodations table
CREATE TABLE public.accommodations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  booking_link TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('booked', 'pending')),
  estimated_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create alternative_hotels table
CREATE TABLE public.alternative_hotels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  link TEXT
);

-- Create transportations table
CREATE TABLE public.transportations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight', 'train', 'ferry', 'car', 'bus', 'other')),
  route TEXT[] NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  details TEXT,
  link TEXT,
  is_booked BOOLEAN NOT NULL DEFAULT false,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create activities table
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_id UUID NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  link TEXT,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  time TIME,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables (public access for now, can add auth later)
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alternative_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Create public access policies (for MVP without auth)
CREATE POLICY "Allow public read access on trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on trips" ON public.trips FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on trips" ON public.trips FOR DELETE USING (true);

CREATE POLICY "Allow public read access on trip_days" ON public.trip_days FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on trip_days" ON public.trip_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on trip_days" ON public.trip_days FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on trip_days" ON public.trip_days FOR DELETE USING (true);

CREATE POLICY "Allow public read access on accommodations" ON public.accommodations FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on accommodations" ON public.accommodations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on accommodations" ON public.accommodations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on accommodations" ON public.accommodations FOR DELETE USING (true);

CREATE POLICY "Allow public read access on alternative_hotels" ON public.alternative_hotels FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on alternative_hotels" ON public.alternative_hotels FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on alternative_hotels" ON public.alternative_hotels FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on alternative_hotels" ON public.alternative_hotels FOR DELETE USING (true);

CREATE POLICY "Allow public read access on transportations" ON public.transportations FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on transportations" ON public.transportations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on transportations" ON public.transportations FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on transportations" ON public.transportations FOR DELETE USING (true);

CREATE POLICY "Allow public read access on activities" ON public.activities FOR SELECT USING (true);
CREATE POLICY "Allow public insert access on activities" ON public.activities FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access on activities" ON public.activities FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access on activities" ON public.activities FOR DELETE USING (true);

-- Create indexes for better performance
CREATE INDEX idx_trip_days_trip_id ON public.trip_days(trip_id);
CREATE INDEX idx_trip_days_date ON public.trip_days(date);
CREATE INDEX idx_accommodations_day_id ON public.accommodations(day_id);
CREATE INDEX idx_transportations_day_id ON public.transportations(day_id);
CREATE INDEX idx_activities_day_id ON public.activities(day_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates on trips
CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();