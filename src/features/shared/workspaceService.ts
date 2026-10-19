import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { JobName, Employee } from '@/config/types';

/* ---------- Job names ---------- */

export function useJobNames(orgId: string | null) {
  const [jobs, setJobs] = useState<JobName[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('job_names')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');
    if (err) setError('Could not load job names.');
    else setJobs((data ?? []) as JobName[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addJob = useCallback(
    async (name: string, extras?: Partial<JobName>) => {
      const clean = name.trim().slice(0, 120);
      if (!clean || !orgId) return false;
      const { data, error: err } = await supabase
        .from('job_names')
        .insert({
          name: clean,
          organization_id: orgId,
          client_name: extras?.client_name ?? '',
          client_email: extras?.client_email ?? '',
          client_phone: extras?.client_phone ?? '',
          default_rate: extras?.default_rate ?? 0,
          notes: extras?.notes ?? '',
        })
        .select('id')
        .maybeSingle();
      if (err) {
        setError('That job name already exists.');
        return false;
      }
      await refresh();
      return Boolean(data);
    },
    [orgId, refresh],
  );

  const deleteJob = useCallback(
    async (id: string) => {
      const { error: err } = await supabase.from('job_names').delete().eq('id', id);
      if (err) setError('Could not delete the job.');
      await refresh();
    },
    [refresh],
  );

  const updateJob = useCallback(
    async (id: string, updates: Partial<JobName>) => {
      const { error: err } = await supabase.from('job_names').update(updates).eq('id', id);
      if (err) setError('Could not update the job.');
      await refresh();
    },
    [refresh],
  );

  return { jobs, loading, error, addJob, deleteJob, updateJob, refresh, clearError: () => setError(null) };
}

/* ---------- Employees ---------- */

export function useEmployees(orgId: string | null) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from('employees')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');
    if (err) setError('Could not load employees.');
    else setEmployees((data ?? []) as Employee[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const renameEmployee = useCallback(
    async (id: string, name: string) => {
      const clean = name.trim().slice(0, 60);
      if (!clean) return;
      const { error: err } = await supabase.from('employees').update({ name: clean }).eq('id', id);
      if (err) setError('Could not rename the employee.');
      await refresh();
    },
    [refresh],
  );

  const addEmployee = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 60);
      if (!clean || !orgId) return false;
      const { error: err } = await supabase
        .from('employees')
        .insert({ name: clean, organization_id: orgId });
      if (err) {
        setError('Could not add that employee.');
        return false;
      }
      await refresh();
      return true;
    },
    [orgId, refresh],
  );

  return { employees, loading, error, addEmployee, renameEmployee, refresh, clearError: () => setError(null) };
}
