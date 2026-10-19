import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/AuthContext';
import { APP_NAME, APP_TAGLINE } from '@/config/app';
import { Logo } from '@/components/brand/Logo';
import { FileText, Timer, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export function AuthScreen({ mode }: { mode: 'signin' | 'signup' }) {
  const { signIn, signUp, error, setError } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const switchMode = () => {
    const next = mode === 'signin' ? 'signup' : 'signin';
    window.location.href = `/?mode=${next}`;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    const ok =
      mode === 'signin'
        ? await signIn(identifier, password)
        : await signUp(email, password, name);
    setBusy(false);
    if (!ok) setFormError(error ?? 'Something went wrong. Try again.');
  };

  return (
    <div className="flex min-h-screen">
      <AuthAside />
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <a href="/" className="flex items-center gap-2.5" aria-label="Back to home">
              <Logo size="lg" />
            </a>
          </div>
          <h1 className="text-2xl font-bold text-ink-50">
            {mode === 'signin' ? 'Welcome back' : 'Start your free trial'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-400">
            {mode === 'signin'
              ? 'Sign in with your email or crew username.'
              : 'Create your workspace — 14 days free, no card needed.'}
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            {mode === 'signin' ? (
              <Input
                label="Email or username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setError(null);
                }}
                placeholder="you@company.com or danr"
                autoComplete="username"
                required
              />
            ) : (
              <>
                <Input
                  label="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  maxLength={60}
                  autoComplete="name"
                  required
                />
                <Input
                  label="Work email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </>
            )}
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
            {(formError || error) && (
              <p className="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-400">
                {formError || error}
              </p>
            )}
            <Button type="submit" size="lg" fullWidth loading={busy} icon={<ArrowRight size={16} />}>
              {mode === 'signin' ? 'Sign in' : 'Create workspace'}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-400">
            {mode === 'signin' ? (
              <>
                New here?{' '}
                <button onClick={switchMode} className="font-semibold text-green-400 hover:text-green-300">
                  Start your free trial
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={switchMode} className="font-semibold text-green-400 hover:text-green-300">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthAside() {
  return (
    <aside className="relative hidden w-[46%] max-w-xl flex-col justify-between overflow-hidden border-r border-ink-700 bg-ink-900 p-10 lg:flex">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-green-600/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-green-800/10 blur-3xl" />
      <a href="/" className="w-fit transition-opacity hover:opacity-80" aria-label="Back to home">
        <Logo size="lg" />
      </a>
      <div className="relative">
        <h2 className="font-display text-3xl font-bold leading-tight text-ink-50">
          Run the job. <span className="text-green-400">Not the paperwork.</span>
        </h2>
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-300">{APP_TAGLINE} — built for crews that move fast.</p>
        <ul className="mt-8 space-y-4">
          <Feature icon={<FileText size={17} />} title="Job tickets" text="Clear, consistent tickets with crew, tasks, and materials." />
          <Feature icon={<Timer size={17} />} title="Built-in timeclock" text="Punch in and out from any phone. Hours tally themselves." />
          <Feature icon={<Zap size={17} />} title="Send in one tap" text="Tickets go straight to your inbox, ready to forward." />
          <Feature icon={<ShieldCheck size={17} />} title="Roles that fit" text="Admins run the workspace; crew punch in and see their jobs." />
        </ul>
      </div>
      <p className="text-2xs text-ink-500">© {new Date().getFullYear()} {APP_NAME}</p>
    </aside>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-400 ring-1 ring-green-500/25">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-100">{title}</p>
        <p className="text-xs text-ink-400">{text}</p>
      </div>
    </li>
  );
}
