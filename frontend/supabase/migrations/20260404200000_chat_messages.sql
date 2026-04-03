-- Chat messages: unified history for web and WhatsApp
CREATE TABLE public.chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT        NOT NULL DEFAULT '',
  tool_calls  JSONB       NULL,   -- assistant tool call args (null for user messages)
  source      TEXT        NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'whatsapp')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_trip_user_idx ON public.chat_messages (trip_id, user_id, created_at);
CREATE INDEX chat_messages_trip_created_idx ON public.chat_messages (trip_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read chat messages for their trips"
  ON public.chat_messages FOR SELECT
  USING (
    trip_id IN (
      SELECT id FROM public.trips WHERE user_id = auth.uid()
      UNION
      SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND trip_id IN (
      SELECT id FROM public.trips WHERE user_id = auth.uid()
      UNION
      SELECT trip_id FROM public.trip_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to chat_messages"
  ON public.chat_messages FOR ALL
  USING (auth.role() = 'service_role');

-- RPC used by WhatsApp Lambda (service key, no user JWT)
CREATE OR REPLACE FUNCTION save_chat_message(
  p_trip_id    UUID,
  p_user_id    UUID,
  p_role       TEXT,
  p_content    TEXT,
  p_tool_calls JSONB DEFAULT NULL,
  p_source     TEXT DEFAULT 'web'
) RETURNS UUID
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO chat_messages (trip_id, user_id, role, content, tool_calls, source)
  VALUES (p_trip_id, p_user_id, p_role, p_content, p_tool_calls, p_source)
  RETURNING id;
$$;

GRANT EXECUTE ON FUNCTION save_chat_message(UUID, UUID, TEXT, TEXT, JSONB, TEXT)
  TO service_role;
