import { useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';

export function AdminGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        navigate('/auth', { replace: true });
        setLoading(false);
        return;
      }
      const role = session.user.app_metadata?.role;
      if (role !== 'admin') {
        navigate('/auth', { replace: true });
        setLoading(false);
        return;
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (!session) {
        navigate('/auth', { replace: true });
        setLoading(false);
        return;
      }
      const role = session.user.app_metadata?.role;
      if (role !== 'admin') {
        navigate('/auth', { replace: true });
        setLoading(false);
        return;
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" role="status">
        <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}
