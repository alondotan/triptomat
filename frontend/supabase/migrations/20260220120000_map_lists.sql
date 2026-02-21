-- Google Maps saved lists linked to trips
CREATE TABLE public.map_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  url text NOT NULL,
  name text NOT NULL,
  last_synced_at timestamptz,
  item_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.map_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own map_lists" ON public.map_lists
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Individual places extracted from each list (for deduplication on refresh)
CREATE TABLE public.map_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.map_lists(id) ON DELETE CASCADE,
  place_key text NOT NULL,
  place_name text,
  synced_at timestamptz DEFAULT now(),
  UNIQUE(list_id, place_key)
);
ALTER TABLE public.map_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own list items" ON public.map_list_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.map_lists WHERE id = list_id AND user_id = auth.uid())
  );
