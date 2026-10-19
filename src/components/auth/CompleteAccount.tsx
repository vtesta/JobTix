import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { APP_NAME } from '@/config/app';
import { ShieldCheck } from 'lucide-react';

export function CompleteAccount() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setNeedsSetup(Boolean(data.user?.user_metadata?.needs_setup));
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: err, data } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    const user = data.user;
    if (user) {
      await supabase.auth.updateUser({ data: { needs_setup: false } });
      window.location.reload();
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600/15 text-green-400 ring-1 ring-green-500/30">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-xl font-bold text-ink-50">Finish setting up</h1>
          <p className="mt-1.5 text-sm text-ink-400">
            Create a password for your {APP_NAME} account to keep it secure.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input
            label={needsSetup ? 'New password' : 'Password'}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            required
            minLength={6}
          />
          <Input
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat it"
            autoComplete="new-password"
            required
          />
          {error && (
            <p className="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-400">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Save and continue
          </Button>
        </form>
      </div>
    </div>
  );
}
