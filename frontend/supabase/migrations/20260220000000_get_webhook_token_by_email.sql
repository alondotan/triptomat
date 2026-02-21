-- Function for backend to resolve a user's webhook token by their email address.
-- Used by triptomat-mail-handler Lambda: it knows the forwarder's email and
-- needs the corresponding webhook token to route the payload to the right user.
-- SECURITY DEFINER so it can access auth.users without exposing it via RLS.
CREATE OR REPLACE FUNCTION public.get_webhook_token_by_email(p_email text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT wt.token
  FROM public.webhook_tokens wt
  JOIN auth.users u ON u.id = wt.user_id
  WHERE lower(u.email) = lower(p_email)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_webhook_token_by_email(text) TO service_role;
