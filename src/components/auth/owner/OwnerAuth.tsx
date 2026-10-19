import { useEffect, useState } from 'react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { Auth } from '@supabase/auth-ui-react';
import { supabase } from '@/lib/supabase';
import { AuthAside } from '../AuthScreen';

/**
 * Owner sign-in / sign-up screen built on the official pre-built Supabase
 * auth component. Provides Google sign-in, magic-link email sign-in, and
 * password sign-up out of the box.
 *
 * The Google provider must be enabled in the Supabase dashboard with a
 * client ID + secret; otherwise the button is hidden and a notice shows.
 */
export function OwnerAuth() {
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(() => {
        return fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        });
      })
      .then((res) => (res ? res.json() : null))
      .then((settings) => {
        setGoogleEnabled(Boolean(settings?.external?.google));
      })
      .catch(() => setGoogleEnabled(null));
  }, []);

  return (
    <div className="flex min-h-screen">
      <AuthAside />
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <h1 className="text-2xl font-bold text-ink-50">Owner sign in</h1>
          <p className="mt-1.5 text-sm text-ink-400">
            Use Google, or an emailed one-time code — no password needed.
          </p>

          {googleEnabled === false && (
            <p className="mt-5 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-400">
              Google sign-in isn't switched on for this app yet. Use the emailed
              code below, or enable Google in the Supabase dashboard under
              Authentication → Providers.
            </p>
          )}

          <div
            className="auth-supabase mt-7 rounded-2xl border border-ink-700 bg-ink-900 p-5"
            style={{ colorScheme: 'dark' }}
          >
            <Auth
              supabaseClient={supabase}
              providers={googleEnabled === false ? [] : ['google']}
              magicLink
              view="sign_in"
              appearance={{ theme: ThemeSupa, variables: { default: { colors: { brand: '#22c55e' } } } }}
              theme="dark"
            />
          </div>

          <p className="mt-5 text-center text-xs text-ink-400">
            Crew member?{' '}
            <a href="/?mode=signin" className="font-semibold text-green-400 hover:text-green-300">
              Use the crew sign-in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
