import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { exchangeCodeForTokens } from '@/lib/cognito';

export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (!code) {
          setError('No authorization code received');
          return;
        }

        // 1. Exchange code for Cognito tokens
        const { id_token } = await exchangeCodeForTokens(code);

        // 2. Call the bridge edge function
        const { data, error: fnError } = await supabase.functions.invoke(
          'cognito-auth-bridge',
          { body: { id_token } },
        );

        if (fnError || !data?.token_hash) {
          throw new Error(fnError?.message || data?.error || 'Bridge function failed');
        }

        // 3. Establish Supabase session via OTP verification
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink',
        });

        if (otpError) {
          throw new Error(otpError.message);
        }

        // 4. Success — navigate to home
        navigate('/', { replace: true });
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-sm w-full mx-4 text-center space-y-4">
          <p className="text-destructive font-medium">{error}</p>
          <button
            onClick={() => navigate('/auth', { replace: true })}
            className="text-primary underline"
          >
            {t('auth.tryAgain', 'Try again')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
    </div>
  );
}
