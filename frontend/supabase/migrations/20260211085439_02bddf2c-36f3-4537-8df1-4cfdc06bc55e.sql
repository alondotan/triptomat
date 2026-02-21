-- Add linked_entities column to source_recommendations for tracking entity cross-references
ALTER TABLE public.source_recommendations 
ADD COLUMN linked_entities jsonb DEFAULT '[]'::jsonb;