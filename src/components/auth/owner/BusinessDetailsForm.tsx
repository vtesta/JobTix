import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CheckCircle2 } from 'lucide-react';

const INDUSTRIES = [
  'Concrete',
  'Framing',
  'Drywall',
  'Painting',
  'Roofing',
  'Landscaping',
  'Electrical',
  'Plumbing',
  'HVAC',
  'Masonry',
  'Remodeling',
  'Other trade',
];

const COMPANY_SIZES = ['Just me', '2-3', '4-7', '8-15', '15+'];

/**
 * Shown once after an owner's first sign-in (Google accounts skip the usual
 * signup wizard, so business details are collected here instead).
 */
export function BusinessDetailsForm({ onDone }: { onDone: () => void }) {
  const { organization, refreshOrganization } = useAuth();
  const [form, setForm] = useState({
    businessName: organization?.name ?? '',
    businessPhone: organization?.business_phone ?? '',
    industry: organization?.industry ?? '',
    companySize: organization?.company_size ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    if (!form.businessName.trim()) {
      setError('Enter your business name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('organizations')
      .update({
        name: form.businessName.trim(),
        business_phone: form.businessPhone.trim(),
        industry: form.industry,
        company_size: form.companySize,
      })
      .eq('id', organization.id);
    setBusy(false);
    if (err) {
      setError('Could not save your business details.');
      return;
    }
    await refreshOrganization();
    onDone();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5 py-12">
      <div className="w-full max-w-md animate-fade-up">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600/15 text-green-400 ring-1 ring-green-500/30">
            <CheckCircle2 size={22} />
          </div>
          <h1 className="text-2xl font-bold text-ink-50">You're in</h1>
          <p className="mt-1.5 text-sm text-ink-400">
            Tell us about your business and we'll set up your workspace.
          </p>
        </div>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <Input
            label="Business name"
            value={form.businessName}
            onChange={(e) => set({ businessName: e.target.value })}
            placeholder="Rivera Concrete LLC"
            maxLength={80}
            autoComplete="organization"
            required
          />
          <Input
            label="Business phone (optional)"
            type="tel"
            value={form.businessPhone}
            onChange={(e) => set({ businessPhone: e.target.value })}
            placeholder="(555) 123-4567"
            autoComplete="tel"
          />
          <div>
            <span className="field-label">Your trade</span>
            <div className="flex flex-wrap gap-1.5">
              {INDUSTRIES.map((ind) => (
                <button
                  key={ind}
                  type="button"
                  onClick={() => set({ industry: form.industry === ind ? '' : ind })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.industry === ind
                      ? 'border-green-500 bg-green-500/15 text-green-300'
                      : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-green-500/40 hover:text-green-300'
                  }`}
                >
                  {ind}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="field-label">Crew size</span>
            <div className="flex flex-wrap gap-1.5">
              {COMPANY_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => set({ companySize: form.companySize === size ? '' : size })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.companySize === size
                      ? 'border-green-500 bg-green-500/15 text-green-300'
                      : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-green-500/40 hover:text-green-300'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <p className="rounded-lg border border-error-500/30 bg-error-500/10 px-3 py-2 text-xs text-error-400">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" fullWidth loading={busy}>
            Set up my workspace
          </Button>
          <button
            type="button"
            onClick={onDone}
            className="w-full text-center text-xs font-semibold text-ink-400 hover:text-ink-200"
          >
            Skip for now
          </button>
        </form>
      </div>
    </div>
  );
}
