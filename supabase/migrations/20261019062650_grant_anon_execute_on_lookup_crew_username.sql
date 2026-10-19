/*
# Allow anonymous users to call the crew username lookup

Username sign-in resolves a username to an internal account address BEFORE
the user is signed in, so the call is made with the anon key. A prior
hardening migration revoked public execute on all SECURITY DEFINER
functions and only re-granted to authenticated, which broke username
sign-in entirely (the lookup fails with a permission error, shown to users
as "No account found with that username").

This lookup is safe to expose to anon: it returns only the internal-domain
email for an exact username match, no other columns, no enumeration
feedback (null for both unknown and error).
*/

GRANT EXECUTE ON FUNCTION public.lookup_crew_username(text) TO anon;
