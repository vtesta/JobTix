import { APP_NAME } from '@/config/app';
import { Logo } from '@/components/brand/Logo';

const productLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

const appLinks = [
  { label: 'Sign in', href: '/?mode=signin' },
  { label: 'Start free trial', href: '/?mode=signup' },
];

export function Footer() {
  return (
    <footer className="border-t border-ink-800 bg-ink-950">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Logo size="base" />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-ink-400">
              Job tickets & timeclock for the trades. Create clear tickets, send them to your
              crew, and track every hour — from any phone.
            </p>
          </div>

          <nav aria-label="Product">
            <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Product</p>
            <ul className="mt-3 space-y-2">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-xs text-ink-300 transition-colors hover:text-green-400">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Get started">
            <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Get started</p>
            <ul className="mt-3 space-y-2">
              {appLinks.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-xs text-ink-300 transition-colors hover:text-green-400">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-ink-800 pt-6 sm:flex-row">
          <p className="text-2xs text-ink-500">
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <p className="text-2xs text-ink-500">
            Built for the trades — electricians, plumbers, HVAC, and crews that move.
          </p>
        </div>
      </div>
    </footer>
  );
}
