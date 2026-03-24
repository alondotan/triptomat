-- WhatsApp bot integration tables and functions

-- ── whatsapp_users ─────────────────────────────────────────────────────────
-- Maps WhatsApp phone numbers to Supabase users
CREATE TABLE IF NOT EXISTS whatsapp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_token TEXT,
  active_trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  display_name TEXT,
  last_message_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_users_phone ON whatsapp_users(phone_number);
CREATE INDEX idx_whatsapp_users_user_id ON whatsapp_users(user_id);

-- RLS: users can read/manage their own WhatsApp link
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own WhatsApp link"
  ON whatsapp_users FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WhatsApp link"
  ON whatsapp_users FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything (used by Lambda)
CREATE POLICY "Service role full access to whatsapp_users"
  ON whatsapp_users FOR ALL
  USING (auth.role() = 'service_role');

-- ── whatsapp_link_codes ────────────────────────────────────────────────────
-- Temporary linking codes (10 minute TTL)
CREATE TABLE IF NOT EXISTS whatsapp_link_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  webhook_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

ALTER TABLE whatsapp_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own link codes"
  ON whatsapp_link_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to whatsapp_link_codes"
  ON whatsapp_link_codes FOR ALL
  USING (auth.role() = 'service_role');

-- ── RPC: generate_whatsapp_code ────────────────────────────────────────────
-- Called from the frontend to generate a 6-digit linking code
CREATE OR REPLACE FUNCTION generate_whatsapp_code()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
  v_user_id UUID;
  v_token TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get the user's webhook token
  SELECT token INTO v_token FROM webhook_tokens WHERE user_id = v_user_id LIMIT 1;
  IF v_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No webhook token found');
  END IF;

  -- Generate a unique 6-digit code
  LOOP
    v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM whatsapp_link_codes
      WHERE code = v_code AND NOT used AND expires_at > NOW()
    );
  END LOOP;

  -- Invalidate any previous unused codes for this user
  UPDATE whatsapp_link_codes SET used = TRUE
  WHERE user_id = v_user_id AND NOT used;

  -- Insert new code with 10-minute expiry
  INSERT INTO whatsapp_link_codes (code, user_id, webhook_token, expires_at)
  VALUES (v_code, v_user_id, v_token, NOW() + INTERVAL '10 minutes');

  RETURN json_build_object('success', true, 'code', v_code);
END;
$$;

-- ── RPC: link_whatsapp ─────────────────────────────────────────────────────
-- Called from the WhatsApp Lambda to validate a code and link a phone number
CREATE OR REPLACE FUNCTION link_whatsapp(p_code TEXT, p_phone TEXT, p_display_name TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row whatsapp_link_codes%ROWTYPE;
BEGIN
  -- Find valid, unused, non-expired code
  SELECT * INTO v_row FROM whatsapp_link_codes
  WHERE code = p_code AND NOT used AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired code');
  END IF;

  -- Mark code as used
  UPDATE whatsapp_link_codes SET used = TRUE WHERE code = p_code;

  -- Create or update WhatsApp user link
  INSERT INTO whatsapp_users (phone_number, user_id, webhook_token, display_name, linked_at, last_message_at)
  VALUES (p_phone, v_row.user_id, v_row.webhook_token, p_display_name, NOW(), NOW())
  ON CONFLICT (phone_number)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    webhook_token = EXCLUDED.webhook_token,
    display_name = EXCLUDED.display_name,
    linked_at = NOW(),
    last_message_at = NOW();

  -- Auto-select active trip if user has exactly one
  UPDATE whatsapp_users
  SET active_trip_id = (
    SELECT t.id FROM trip_members tm
    JOIN trips t ON t.id = tm.trip_id
    WHERE tm.user_id = v_row.user_id AND t.status != 'completed'
    LIMIT 1
  )
  WHERE phone_number = p_phone AND active_trip_id IS NULL;

  RETURN json_build_object('success', true, 'user_id', v_row.user_id::text);
END;
$$;

-- ── Cleanup: auto-delete expired codes ─────────────────────────────────────
-- Can be called periodically or triggered by a cron
CREATE OR REPLACE FUNCTION cleanup_expired_whatsapp_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM whatsapp_link_codes WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$;
