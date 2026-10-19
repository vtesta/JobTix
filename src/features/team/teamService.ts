import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Organization, TeamMembership } from '@/config/types';

export async function invokeTeamFunction<T>(slug: string, body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Request failed.');
  return json as T;
}

export function useTeam(orgId: string | null) {
  const [members, setMembers] = useState<TeamMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orgId) return;
      if (!opts?.silent) setLoading(true);
      const { data, error: err } = await supabase
        .from('team_members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at');
      if (err) setError('Could not load team members.');
      else setMembers((data ?? []) as TeamMembership[]);
      setLoading(false);
    },
    [orgId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createMember = useCallback(
    async (name: string, role: 'admin' | 'employee') => {
      if (!orgId) return null;
      try {
        const result = await invokeTeamFunction<{ username: string; password: string }>(
          'create-team-member',
          { name: name.trim().slice(0, 60), role, orgId },
        );
        await refresh();
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the team member.');
        return null;
      }
    },
    [orgId, refresh],
  );

  const changeRole = useCallback(
    async (memberId: string, role: TeamMembership['role']) => {
      const { error: err } = await supabase
        .from('team_members')
        .update({ role })
        .eq('id', memberId);
      if (err) setError('Could not change the role.');
      await refresh();
    },
    [refresh],
  );

  const resetPassword = useCallback(
    async (userId: string, password?: string) => {
      if (!orgId) return null;
      try {
        const result = await invokeTeamFunction<{ password: string }>('reset-team-member-password', {
          orgId,
          userId,
          ...(password ? { password } : {}),
        });
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reset the password.');
        return null;
      }
    },
    [orgId],
  );

  const removeMember = useCallback(
    async (member: TeamMembership) => {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      const { error: err } = await supabase
        .from('team_members')
        .delete()
        .eq('id', member.id);
      if (err) {
        setError('Could not remove the team member.');
      } else if (member.user_id) {
        await supabase.from('employees').delete().eq('user_id', member.user_id).eq('organization_id', orgId ?? '');
      }
      await refresh({ silent: true });
    },
    [orgId, refresh],
  );

  const renameMember = useCallback(
    async (member: TeamMembership, name: string) => {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      const { error: err } = await supabase.from('team_members').update({ name: clean }).eq('id', member.id);
      if (err) {
        setError('Could not rename the member.');
      } else if (member.user_id) {
        await supabase
          .from('employees')
          .update({ name: clean })
          .eq('user_id', member.user_id)
          .eq('organization_id', orgId ?? '');
      }
      await refresh({ silent: true });
    },
    [orgId, refresh],
  );

  return { members, loading, error, createMember, changeRole, resetPassword, removeMember, renameMember, refresh, clearError: () => setError(null) };
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<boolean> {
  const { error } = await supabase.from('organizations').update(updates).eq('id', orgId);
  return !error;
}
