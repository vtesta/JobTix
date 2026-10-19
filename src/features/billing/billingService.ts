import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

type BillingStatus = 'idle' | 'loading' | 'error';

export function useBilling() {
  const [status, setStatus] = useState<BillingStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(async (planId: string, origin: string) => {
    setStatus('loading');
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ planId, origin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Could not start checkout.');
      window.location.href = json.url;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.');
      setStatus('error');
      return false;
    }
  }, []);

  const openPortal = useCallback(async (origin: string) => {
    setStatus('loading');
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ origin }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Could not open billing portal.');
      window.location.href = json.url;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal.');
      setStatus('error');
      return false;
    }
  }, []);

  return { status, error, startCheckout, openPortal };
}
