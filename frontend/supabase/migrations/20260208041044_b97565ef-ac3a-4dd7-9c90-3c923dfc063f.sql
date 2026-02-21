-- Add countries array to trips table
ALTER TABLE public.trips ADD COLUMN countries TEXT[] DEFAULT '{}';

-- Create webhook_items table for pending/processed webhook payloads
CREATE TABLE public.webhook_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Metadata
  category TEXT NOT NULL, -- 'transportation', 'accommodation', 'activity'
  sub_category TEXT, -- 'Flight', 'Hotel', etc.
  action TEXT NOT NULL DEFAULT 'create', -- 'create', 'update', 'cancel'
  order_number TEXT NOT NULL,
  
  -- Cost
  total_cost_amount NUMERIC DEFAULT 0,
  total_cost_currency TEXT DEFAULT 'USD',
  
  -- Raw payload for reference
  raw_payload JSONB NOT NULL,
  
  -- Source email info
  source_email_subject TEXT,
  source_email_link TEXT,
  
  -- Matching
  matched_trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  matched_day_id UUID REFERENCES public.trip_days(id) ON DELETE SET NULL,
  linked_entity_id UUID, -- ID of created transport/accommodation/activity
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'linked', 'cancelled'
  
  -- Unique constraint for idempotency
  UNIQUE(order_number, category)
);

-- Add webhook-related fields to transportations
ALTER TABLE public.transportations 
  ADD COLUMN order_number TEXT,
  ADD COLUMN source_email_subject TEXT,
  ADD COLUMN source_email_link TEXT,
  ADD COLUMN is_cancelled BOOLEAN DEFAULT false,
  ADD COLUMN carrier TEXT,
  ADD COLUMN flight_number TEXT,
  ADD COLUMN baggage_allowance JSONB;

-- Add webhook-related fields to accommodations
ALTER TABLE public.accommodations
  ADD COLUMN order_number TEXT,
  ADD COLUMN source_email_subject TEXT,
  ADD COLUMN source_email_link TEXT,
  ADD COLUMN is_cancelled BOOLEAN DEFAULT false,
  ADD COLUMN check_in_date DATE,
  ADD COLUMN check_out_date DATE,
  ADD COLUMN rooms JSONB;

-- Add webhook-related fields to activities
ALTER TABLE public.activities
  ADD COLUMN order_number TEXT,
  ADD COLUMN source_email_subject TEXT,
  ADD COLUMN source_email_link TEXT,
  ADD COLUMN is_cancelled BOOLEAN DEFAULT false;

-- Enable RLS on webhook_items
ALTER TABLE public.webhook_items ENABLE ROW LEVEL SECURITY;

-- Public access policies for webhook_items (MVP phase)
CREATE POLICY "Allow public read access on webhook_items"
ON public.webhook_items FOR SELECT USING (true);

CREATE POLICY "Allow public insert access on webhook_items"
ON public.webhook_items FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access on webhook_items"
ON public.webhook_items FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access on webhook_items"
ON public.webhook_items FOR DELETE USING (true);

-- Add trigger for updated_at on webhook_items
CREATE TRIGGER update_webhook_items_updated_at
BEFORE UPDATE ON public.webhook_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_webhook_items_status ON public.webhook_items(status);
CREATE INDEX idx_webhook_items_order_number ON public.webhook_items(order_number);
CREATE INDEX idx_webhook_items_matched_trip ON public.webhook_items(matched_trip_id);
CREATE INDEX idx_transportations_order_number ON public.transportations(order_number);
CREATE INDEX idx_accommodations_order_number ON public.accommodations(order_number);
CREATE INDEX idx_activities_order_number ON public.activities(order_number);