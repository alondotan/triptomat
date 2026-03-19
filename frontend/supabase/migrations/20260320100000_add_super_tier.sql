-- Add 'super' tier (unlimited AI usage)

-- 1. Update check constraint to allow 'super'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_tier_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_user_tier_check
  CHECK (user_tier IN ('free', 'pro', 'super'));

-- 2. Update check_and_increment_usage to handle 'super' tier (unlimited)
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
  SELECT COALESCE(user_tier, 'free') INTO v_tier
  FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('allowed', true, 'remaining', 0, 'limit', 0, 'used', 0, 'tier', 'unknown');
  END IF;

  -- Super tier: always allow, no tracking
  IF v_tier = 'super' THEN
    RETURN json_build_object('allowed', true, 'remaining', 999999, 'limit', 999999, 'used', 0, 'tier', 'super');
  END IF;

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

  IF v_limit = 0 THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'limit', 0, 'used', 0, 'tier', v_tier, 'error', 'unknown_feature');
  END IF;

  INSERT INTO ai_usage (user_id, feature, usage_date, count)
  VALUES (p_user_id, p_feature, v_today, 0)
  ON CONFLICT (user_id, feature, usage_date) DO NOTHING;

  SELECT count INTO v_current
  FROM ai_usage
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = v_today
  FOR UPDATE;

  IF v_current >= v_limit THEN
    RETURN json_build_object('allowed', false, 'remaining', 0, 'limit', v_limit, 'used', v_current, 'tier', v_tier);
  END IF;

  UPDATE ai_usage SET count = count + 1
  WHERE user_id = p_user_id AND feature = p_feature AND usage_date = v_today;

  RETURN json_build_object('allowed', true, 'remaining', v_limit - v_current - 1, 'limit', v_limit, 'used', v_current + 1, 'tier', v_tier);
END;
$$;

-- 3. Update get_usage_summary to handle 'super' tier
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
        'limit', CASE WHEN v_tier = 'super' THEN 999999 WHEN v_tier = 'pro' THEN 50 ELSE 5 END
      ),
      'ai_chat', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'ai_chat' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'super' THEN 999999 WHEN v_tier = 'pro' THEN 200 ELSE 20 END
      ),
      'whatsapp_chat', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'whatsapp_chat' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'super' THEN 999999 WHEN v_tier = 'pro' THEN 150 ELSE 15 END
      ),
      'email_parsing', json_build_object(
        'used', COALESCE((SELECT count FROM ai_usage WHERE user_id = p_user_id AND feature = 'email_parsing' AND usage_date = v_today), 0),
        'limit', CASE WHEN v_tier = 'super' THEN 999999 WHEN v_tier = 'pro' THEN 100 ELSE 10 END
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 4. RPC to update user tier (admin only, service_role)
CREATE OR REPLACE FUNCTION update_user_tier(p_user_id UUID, p_tier TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tier NOT IN ('free', 'pro', 'super') THEN
    RETURN json_build_object('success', false, 'error', 'Invalid tier');
  END IF;

  UPDATE profiles SET user_tier = p_tier WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  RETURN json_build_object('success', true, 'tier', p_tier);
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_tier(UUID, TEXT) TO service_role;
