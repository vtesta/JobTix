# CrewClock — Rebuild Guide

The original single-file app is preserved in `legacy/` (src + supabase reference).
The rebuild is a modular React + TypeScript app. Every database table, edge function,
and security policy from the legacy app is reused as-is — nothing needs re-provisioning.

## Where things live

```
src/
  config/        App-wide constants (plans, trial length) + shared TypeScript types
  lib/           Supabase client + pure helper functions (dates, hours, validation)
  hooks/         Authentication (useAuth + AuthContext provider)
  components/
    ui/          Reusable atoms: Button, Input, Modal, Badge, States, Page, Protected
    layout/      AppShell (sidebar, top bar, mobile tabs, workspace switcher)
    auth/        Sign in / sign up screen, account setup, trial paywall
  features/
    tickets/     Job tickets (form + list + send/email logic)
    timeclock/   Punch in/out, hours, manual punch
    jobs/        Job name list + CSV export
    employees/   Employee roster + rename
    team/        Team member accounts, roles, password resets
    settings/    Workspace name + default recipient email
    billing/     Stripe plan cards + billing portal
  pages/         (empty — drop future standalone pages here)
```

## How to change things

- **Add a page**: create a folder under `src/features/<name>/`, add a `PageDef` entry
  to `PAGE_REGISTRY` in `src/components/layout/AppShell.tsx`, and render it in
  `src/App.tsx`. Navigation, role-gating, and mobile tabs pick it up automatically.
- **Restrict by role**: wrap any element in `<Protected minRole="admin">…</Protected>`
  or pass `roles={['owner']}` — no manual checks needed.
- **Colors/fonts/spacing**: everything pulls from `tailwind.config.js` design tokens
  (`ink` neutral ramp + `green` primary ramp). Avoid hard-coded hex values.
- **Business logic** lives in `*Service.ts` files next to each feature — screens stay
  presentational, so logic is easy to test and reuse.

## Design language

Black/graphite surfaces with green accents (no terminal-style effects). Inter for
body text, Sora for headings, subtle motion via the shared `animate-*` utility classes.

## Legacy reference

- `legacy/src/` — original UI code (kept for feature parity reference)
- `legacy/supabase/` — original migrations, config, and edge functions
- Live database + edge functions are unchanged and shared with the new build.
