-- Enable pg_cron and pg_net extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Store the service role key in Vault (must be set manually once via Supabase Dashboard > Vault)
-- INSERT INTO vault.secrets (name, secret) VALUES ('service_role_key', 'your-service-role-key-here');

-- Schedule mission-reminders edge function to run every 15 minutes
SELECT cron.schedule(
  'check-mission-reminders',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://aqpzhflzsqkjceeeufyf.supabase.co/functions/v1/mission-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
