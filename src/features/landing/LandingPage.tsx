import { useEffect } from 'react';
import { useAuth } from '@/hooks/AuthContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PricingSection } from './PricingSection';
import { Footer } from './Footer';
import { APP_NAME, APP_TAGLINE } from '@/config/app';
import { Logo } from '@/components/brand/Logo';
import {
  ArrowRight,
  Briefcase,
  FileText,
  Send,
  ShieldCheck,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

export function LandingPage() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = `${APP_NAME} | ${APP_TAGLINE}`;
    return () => {
      document.title = `${APP_NAME} | ${APP_TAGLINE}`;
    };
  }, []);

  const goApp = user ? '/' : '/?mode=signup';

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-ink-800/60 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size="base" />
          </a>
          <nav className="hidden items-center gap-6 text-xs font-medium text-ink-300 md:flex">
            <a href="#features" className="transition-colors hover:text-green-400">Features</a>
            <a href="#how-it-works" className="transition-colors hover:text-green-400">How it works</a>
            <a href="#pricing" className="transition-colors hover:text-green-400">Pricing</a>
            <a href="#faq" className="transition-colors hover:text-green-400">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={user ? '/' : '/?mode=signin'}>
              <Button variant="ghost" size="sm">{user ? 'Open app' : 'Sign in'}</Button>
            </a>
            <a href={goApp}>
              <Button size="sm">Start free trial</Button>
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-green-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 top-64 h-96 w-96 rounded-full bg-green-800/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <Badge tone="green" className="animate-fade-up">
            <Zap size={11} /> 14-day free trial · no credit card
          </Badge>
          <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-ink-50 animate-fade-up sm:text-6xl">
            Run the job. <span className="text-green-400">Not the paperwork.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-300 animate-fade-up sm:text-lg">
            You didn't start a trade business to spend your nights typing up tickets and chasing
            hours. TradeDesk puts your jobs, your crews, and your timecards on one simple system
            your whole team can run from their phone — in the truck, on the roof, wherever the
            day takes you.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-up">
            <a href={goApp}>
              <Button size="lg" icon={<ArrowRight size={16} />}>
                Start free trial
              </Button>
            </a>
            <a href="#how-it-works">
              <Button size="lg" variant="secondary">
                See how it works
              </Button>
            </a>
          </div>
          <p className="mt-4 text-2xs text-ink-500 animate-fade-up">
            Set up in under a minute · works on any phone, tablet, or computer
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-t border-ink-800/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="green">Features</Badge>
            <h2 className="mt-3 font-display text-3xl font-bold text-ink-50 sm:text-4xl">
              Run your field team from one place
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-400">
              Every tool pulls its weight — dispatch your crew, document the work as it happens,
              and walk into Monday knowing payroll is already done.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<FileText size={18} />}
            title="Job tickets"
            text="Every job gets a real ticket — job name, date, crew, the work performed, materials used. No more deciphering a photo of a torn notepad at 9pm. When a customer asks what was done and why, you have it in writing, ready to send."
          />
          <FeatureCard
            icon={<Users size={18} />}
            title="Crew assignments"
            text="Know exactly who's on what before the first truck rolls. Tap your guys onto a ticket and everybody wakes up knowing where they're headed — no group-text chaos, no 'wait, where am I going today?'"
          />
          <FeatureCard
            icon={<Timer size={18} />}
            title="Field timeclock"
            text="Your crew punches in and out right from the job site, and the hours add themselves up by day, week, and month. Nobody rounds up from memory, nobody argues over last Tuesday — the hours are just right."
          />
          <FeatureCard
            icon={<Send size={18} />}
            title="One-tap sending"
            text="Finished a ticket? One tap and it's in your inbox, clean and formatted, ready to forward to the customer or the office. No retyping, no scanning, no shuffling carbon copies at the end of the week."
          />
          <FeatureCard
            icon={<Briefcase size={18} />}
            title="Jobs library"
            text="Keep one master list of every job you've ever run. Start a ticket from the library and the details stay consistent — which means your bookkeeping exports come out clean instead of a mess of near-miss job names."
          />
          <FeatureCard
            icon={<ShieldCheck size={18} />}
            title="Roles that fit"
            text="You and your admins see the whole operation — every ticket, every hour, every hand. Your crew sees only their own work. It stays simple for them and stays under control for you."
          />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-t border-ink-800/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="green">How it works</Badge>
            <h2 className="mt-3 font-display text-3xl font-bold text-ink-50 sm:text-4xl">
              From job site to signed off in three steps
            </h2>
          </div>
          <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-3">
            <StepCard
              step="1"
              title="Build the ticket"
              text="Before the trucks roll, pick the job, set the date, tap on the crew, and list out the tasks and materials. Thirty seconds at the coffee shop beats an hour of paperwork tonight."
            />
            <StepCard
              step="2"
              title="Run the day"
              text="Your crew punches in on site and works off the ticket. Everybody knows the job, the hours tally themselves, and nothing depends on somebody remembering to write it down."
            />
            <StepCard
              step="3"
              title="Close it out"
              text="Send the finished ticket to your inbox with one tap and hand payroll a timecard that's already correct. That's the whole system — the paperwork is done before you're off the job site."
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-ink-800/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <PricingSection />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-ink-800/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="green">FAQ</Badge>
            <h2 className="mt-3 font-display text-3xl font-bold text-ink-50 sm:text-4xl">
              Questions, answered
            </h2>
          </div>
          <div className="mx-auto mt-10 max-w-2xl divide-y divide-ink-700 rounded-2xl border border-ink-700 bg-ink-900">
            <Faq q="Do I need a credit card to start?">
              No. Every workspace starts with 14 days free, no card required — set it up, load your
              jobs, and put it in front of your crew before you pay a cent. If it's not earning its
              keep by the end of the trial, you walk away.
            </Faq>
            <Faq q="How do my crew members sign in?">
              You create their accounts from the Team page — they get a simple username and
              password, no email address needed. If one of your guys has a flip phone and a
              work-issued tablet, he can still punch in and pull up his tickets.
            </Faq>
            <Faq q="Can crew members see everyone's tickets?">
              No. You and your admins see the whole operation — every ticket, every hour, every
              hand. Your crew only sees their own tickets and their own punch card, so there's no
              confusion about whose work is whose.
            </Faq>
            <Faq q="What happens when the trial ends?">
              Nothing disappears. Your jobs, tickets, and timecards stay right where you left them
              — pick a plan when you're ready and pick up exactly where the trial ended. Solo for
              one-man shows, Team for growing crews, Business for larger shops.
            </Faq>
            <Faq q="Can I change plans or cancel later?">
              Anytime, from the billing portal — upgrade before the busy season, scale back when
              things slow down. Seat limits adjust automatically, so you're never paying for guys
              who aren't on the roster.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-800/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-green-500/25 bg-gradient-to-br from-ink-900 via-ink-900 to-green-950/40 px-6 py-14 text-center">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-green-600/15 blur-3xl" />
            <h2 className="font-display text-3xl font-bold text-ink-50 sm:text-4xl">
              Ready to ditch the paper tickets?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-300">
              Set up your workspace, load your jobs, and send the first ticket before the crew
              clocks in tomorrow. Fourteen days free — it costs you nothing to find out.
            </p>
            <a href={goApp} className="mt-7 inline-block">
              <Button size="lg" icon={<ArrowRight size={16} />}>
                Start your free trial
              </Button>
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function FeatureCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-pop">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-400 ring-1 ring-green-500/25">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-bold text-ink-50">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{text}</p>
    </div>
  );
}

function StepCard({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <div className="relative rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <span className="font-display text-3xl font-bold text-green-500/40">{step}</span>
      <h3 className="mt-2 text-sm font-bold text-ink-50">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{text}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <p className="text-sm font-semibold text-ink-100">{q}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{children}</p>
    </div>
  );
}
