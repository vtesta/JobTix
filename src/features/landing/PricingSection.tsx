import { PLANS } from '@/config/app';
import { Badge } from '@/components/ui/Badge';
import { Check, ArrowRight } from 'lucide-react';

export function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-20">
      <div className="mx-auto max-w-2xl text-center">
        <Badge tone="green">Pricing</Badge>
        <h2 className="mt-3 font-display text-3xl font-bold text-ink-50 sm:text-4xl">
          Simple plans that scale with your crew
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-400">
          Start with a 14-day free trial — no credit card required. Upgrade, downgrade,
          or cancel anytime.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
        {PLANS.map((plan, i) => (
          <div
            key={plan.id}
            className={`card flex flex-col p-6 transition-transform duration-200 hover:-translate-y-1 ${
              i === 1 ? 'ring-2 ring-green-500/40' : ''
            }`}
          >
            {i === 1 && (
              <span className="mb-3 self-start">
                <Badge tone="green">Most popular</Badge>
              </span>
            )}
            <h3 className="font-display text-lg font-bold text-ink-50">{plan.name}</h3>
            <p className="mt-1 text-xs text-ink-400">{plan.blurb}</p>
            <p className="mt-4">
              <span className="font-display text-3xl font-bold text-ink-50">${plan.price}</span>
              <span className="text-xs text-ink-400"> /month</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-ink-200">
                  <Check size={14} className="mt-0.5 shrink-0 text-green-400" />
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={`/?mode=signup&plan=${plan.id}`}
              className={`mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
                i === 1
                  ? 'bg-green-600 text-white hover:bg-green-500'
                  : 'border border-ink-600 bg-ink-800 text-ink-100 hover:border-green-500/40 hover:bg-ink-700'
              }`}
            >
              Start free trial
              <ArrowRight size={14} />
            </a>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-2xs text-ink-500">
        All plans include the full timeclock, job tickets, and email delivery. Prices in USD.
      </p>
    </section>
  );
}
