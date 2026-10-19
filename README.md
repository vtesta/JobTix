# TradeDesk

Field-service management for trade businesses: job tickets, dispatch, timeclock, invoicing, and a team directory.

Built with React + Vite + Tailwind CSS on Supabase (database, auth, storage, edge functions).

## Owner authentication

- Google sign-in and emailed one-time codes (Supabase Auth UI)
- Crew members sign in with username + password
- Business details (name, phone, trade, crew size) are collected once after first sign-in

## Local development

```bash
npm install
npm run dev
```

Environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are expected in `.env`.

## Supabase

- Migrations: `supabase/migrations/`
- Edge functions: `supabase/functions/` (team invites, invoice AI, Stripe billing, QuickBooks exports)
