-- AI Usage Management: daily limits per user per feature with free/pro tiers

-- 1. Add user_tier to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_tier TEXT NOT NULL DEFAULT 'free'
  CHECK (user_tier IN ('free', 'pro'));

-- 2. Create ai_usage table
CREATE TABLE ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, feature, usage_date)
);

-- Index for cleanup queries
CREATE INDEX idx_ai_usage_date ON ai_usage (usage_date);

-- 3. RLS policies
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS by default, no explicit policy needed

-- 4. RPC: check_and_increment_usage (atomic check + increment)
CREATE OR REPLACE FUNCTION check_and_increment_usage(
  p_user_id UUID,
  p_feature TEXT
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_limit INTEGER;
  v_current INTEGER;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Get user tier
  SELECT COALESCE(user_tier, 'free') INTO v_tier
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    -- Unknown user — allow (fail open)
    RETURN json_build_object('allowed', true, 'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'unknown');
  END IF;

  -- Determine limit based on feature + tier
  v_limit := CASE
    WHEN p_feature = 'url_analysis'   AND v_tier = 'free' THEN 5
    WHEN p_feature = 'url_analysis'   AND v_tier = 'pro'  THEN 50
    WHEN p_feature = 'ai_chat'        AND v_tier = 'free' THEN 20
    WHEN p_feature = 'ai_chat'        AND v_tier = 'pro'  THEN 200
    WHEN p_feature = 'whatsapp_chat'  AND v_tier = 'free' THEN 15
    WHEN p_feature = 'whatsapp_chat'  AND v_tier = 'pro'  THEN 150
    WHEN p_feature = 'email_parsing'  AND v_tier = 'free' THEN 10
    WHEN p_feature = 'email_parsing'  AND v_tier = 'pro'  THEN 100
    ELSE 0
  END;

  -- Unknown feature — block
  IF v_limit = 0 THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'limit', 0, 'used', 0, 'tier', v_tier, 'error', 'unknown_feature');
  END IF;

  -- Upsert row for today
  INSERT INTO ai_usage (user_id, feature, usage_date, count)
  VALUES (p_user_id, p_feature, v_today, 0)
  ON CONFLICT (user_id, feature, usage_date) DO NOTHING;

  -- Lock and read current count
  SELECT count INTO v_current
  FROM ai_usage
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = v_today
  FOR UPDATE;

  -- Check limit
  IF v_current >= v_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'remaining', 0,
      'limit', v_limit,
      'used', v_current,
      'tier', v_tier
    );
  END IF;

  -- Increment
  UPDATE ai_usage SET count = count + 1
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = v_today;

  RETURN json_build_object(
    'allowed', true,
    'remaining', v_limit - v_current - 1,
    'limit', v_limit,
    'used', v_current + 1,
    'tier', v_tier
  );
END;
$$;

-- 5. RPC: get_usage_summary (read-only, for frontend display)
CREATE OR REPLACE FUNCTION get_usage_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier TEXT;
  v_today DATE := CURRENT_DATE;
  v_result JSON;
BEGIN
  SELECT COALESCE(user_tier, 'free') INTO v_tier
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    v_tier := 'free';
  END IF;

  SELECT json_build_object(
    'tier', v_tier,
    'date', v_today,
    'features', json_build_object(
      'url_analysis', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'url_analysis' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'pro' THEN 50 ELSE 5 END
      ),
      'ai_chat', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'ai_chat' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'pro' THEN 200 ELSE 20 END
      ),
      'whatsapp_chat', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'whatsapp_chat' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'pro' THEN 150 ELSE 15 END
      ),
      'email_parsing', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'email_parsing' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'pro' THEN 100 ELSE 10 END
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 6. Grant execute to authenticated users and service_role
GRANT EXECUTE ON FUNCTION check_and_increment_usage(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_usage_summary(UUID) TO authenticated, service_role;
