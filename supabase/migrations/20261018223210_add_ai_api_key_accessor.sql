/*
# Add secure accessor for the AI API key

## 1. Why
The invoice-drafting AI feature needs a Google AI API key at runtime. The key
is stored in the database's encrypted secret vault (supabase_vault) rather
than in plaintext code or environment files. This migration adds the only
function allowed to read it.

## 2. New Functions
- `get_ai_api_key()` (security definer) — returns the secret named
  `ai_api_key` from the vault, or NULL if it hasn't been added yet.
  Search path is pinned. Execution is restricted to the service role
  (used by the invoice-ai edge function); anon and authenticated roles are
  explicitly revoked.

## 3. Security
- The vault table itself is not readable by client roles.
- Only backend code holding the service role key can call this function.
- No table or policy changes.
*/

CREATE OR REPLACE FUNCTION public.get_ai_api_key()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ai_api_key'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_ai_api_key() FROM public;
REVOKE ALL ON FUNCTION public.get_ai_api_key() FROM anon;
REVOKE ALL ON FUNCTION public.get_ai_api_key() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_api_key() TO service_role;
