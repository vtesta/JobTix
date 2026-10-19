import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Organization, TeamMembership } from '@/config/types';

const ORG_STORAGE_KEY = 'currentOrgId';

export interface AuthContextValue {
  user: import('@supabase/supabase-js').User | null;
  session: import('@supabase/supabase-js').Session | null;
  organization: Organization | null;
  memberships: TeamMembership[];
  currentMembership: TeamMembership | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  signIn: (emailOrUsername: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string, name: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  switchOrganization: (orgId: string) => Promise<boolean>;
  refreshOrganization: () => Promise<void>;
  setError: (message: string | null) => void;
}

export function useAuthProvider(): AuthContextValue {
  const [session, setSession] = useState<import('@supabase/supabase-js').Session | null>(null);
  const [user, setUser] = useState<import('@supabase/supabase-js').User | null>(null);
  const [memberships, setMemberships] = useState<TeamMembership[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMemberships = useCallback(async (userId: string): Promise<TeamMembership[]> => {
    const { data, error: err } = await supabase
      .from('team_members')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (err) return [];
    return (data ?? []) as TeamMembership[];
  }, []);

  const loadOrganization = useCallback(async (orgId: string): Promise<Organization | null> => {
    const { data, error: err } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    if (err || !data) return null;
    return data as Organization;
  }, []);

  const refreshOrganization = useCallback(async () => {
    const stored = localStorage.getItem(ORG_STORAGE_KEY) ?? memberships[0]?.organization_id;
    if (!stored) return;
    const org = await loadOrganization(stored);
    if (org) setOrganization(org);
  }, [loadOrganization, memberships]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const activeSession = data.session;
      if (cancelled) return;
      setSession(activeSession);
      setUser(activeSession?.user ?? null);

      if (activeSession?.user) {
        await supabase.rpc('claim_pending_invites');
        const ms = await loadMemberships(activeSession.user.id);
        if (cancelled) return;
        setMemberships(ms);
        const stored = localStorage.getItem(ORG_STORAGE_KEY);
        const target = ms.find((m) => m.organization_id === stored) ?? ms[0];
        if (target) {
          const org = await loadOrganization(target.organization_id);
          if (!cancelled && org) setOrganization(org);
        }
      }
      if (!cancelled) setLoading(false);
    };

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem(ORG_STORAGE_KEY);
        setSession(null);
        setUser(null);
        setMemberships([]);
        setOrganization(null);
        return;
      }
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadMemberships, loadOrganization]);

  const signIn = useCallback(
    async (emailOrUsername: string, password: string): Promise<boolean> => {
      setError(null);
      let email = emailOrUsername.trim().toLowerCase();
      if (!email.includes('@')) {
        const username = email.replace(/[^a-z0-9]/g, '');
        const { data: resolved, error: lookupErr } = await supabase.rpc('lookup_crew_username', {
          target_username: username,
        });
        if (lookupErr || !resolved) {
          setError('No account found with that username.');
          return false;
        }
        email = resolved;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setError(signInErr.message === 'Invalid login credentials'
          ? 'Incorrect email/username or password.'
          : signInErr.message);
        return false;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const activeUser = sessionData.session?.user;
      if (activeUser) {
        await supabase.rpc('claim_pending_invites');
        const ms = await loadMemberships(activeUser.id);
        setMemberships(ms);
        if (ms[0]) {
          const org = await loadOrganization(ms[0].organization_id);
          setOrganization(org);
        }
      }
      return true;
    },
    [loadMemberships, loadOrganization],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string): Promise<boolean> => {
      setError(null);
      const { error: signUpErr, data } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name } },
      });
      if (signUpErr) {
        setError(signUpErr.message);
        return false;
      }
      if (data.session?.user) {
        const ms = await loadMemberships(data.session.user.id);
        setMemberships(ms);
        if (ms[0]) {
          const org = await loadOrganization(ms[0].organization_id);
          setOrganization(org);
        }
      }
      return true;
    },
    [loadMemberships, loadOrganization],
  );

  const signOut = useCallback(async () => {
    localStorage.removeItem(ORG_STORAGE_KEY);
    setMemberships([]);
    setOrganization(null);
    setSession(null);
    setUser(null);
    try {
      await supabase.auth.signOut();
    } catch {
      // session already invalid; local state is cleared
    }
  }, []);

  const switchOrganization = useCallback(
    async (orgId: string): Promise<boolean> => {
      const membership = memberships.find((m) => m.organization_id === orgId);
      if (!membership) return false;
      const org = await loadOrganization(orgId);
      if (!org) return false;
      localStorage.setItem(ORG_STORAGE_KEY, orgId);
      setOrganization(org);
      return true;
    },
    [memberships, loadOrganization],
  );

  const currentMembership = useMemo(
    () =>
      organization
        ? memberships.find((m) => m.organization_id === organization.id) ?? null
        : memberships[0] ?? null,
    [organization, memberships],
  );

  const isAdmin = currentMembership?.role === 'owner' || currentMembership?.role === 'admin';
  const isOwner = currentMembership?.role === 'owner';

  return {
    user,
    session,
    organization,
    memberships,
    currentMembership,
    loading,
    error,
    isAdmin,
    isOwner,
    signIn,
    signUp,
    signOut,
    switchOrganization,
    refreshOrganization,
    setError,
  };
}
