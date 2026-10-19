import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { TimeclockEntry } from '@/config/types';
import { entryHours, toIsoTimestamp } from './timeclockMath';

export interface ManualPunchInput {
  employeeId: string;
  type: 'in' | 'out';
  date: string;
  time: string;
}

export interface EditEntryInput {
  clockIn: { date: string; time: string };
  clockOut: { date: string; time: string } | null;
}

export function useTimeclock(orgId: string | null) {
  const [entries, setEntries] = useState<TimeclockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('timeclock_entries')
      .select('*')
      .eq('organization_id', orgId)
      .order('clock_in', { ascending: false })
      .limit(500);
    if (!error) setEntries((data ?? []) as TimeclockEntry[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getActiveEntry = useCallback(
    (employeeId: string): TimeclockEntry | null =>
      entries.find((e) => e.employee_id === employeeId && !e.clock_out) ?? null,
    [entries],
  );

  const punchIn = useCallback(
    async (employeeId: string): Promise<boolean> => {
      if (!orgId || !employeeId) return false;
      const { data, error } = await supabase
        .from('timeclock_entries')
        .insert({ employee_id: employeeId, clock_in: new Date().toISOString(), organization_id: orgId })
        .select()
        .maybeSingle();
      if (error || !data) {
        setNotice('Could not punch in.');
        return false;
      }
      setEntries((current) => [data as TimeclockEntry, ...current]);
      setNotice('Clocked in.');
      return true;
    },
    [orgId],
  );

  const punchOut = useCallback(async (entry: TimeclockEntry): Promise<boolean> => {
    const { data, error } = await supabase
      .from('timeclock_entries')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', entry.id)
      .select()
      .maybeSingle();
    if (error || !data) {
      setNotice('Could not punch out.');
      return false;
    }
    setEntries((current) => current.map((e) => (e.id === entry.id ? (data as TimeclockEntry) : e)));
    setNotice('Clocked out.');
    return true;
  }, []);

  const saveManualPunch = useCallback(
    async (input: ManualPunchInput): Promise<boolean> => {
      if (!orgId) return false;
      if (!input.employeeId || !input.date || !input.time) {
        setNotice('Choose an employee, date, and time.');
        return false;
      }
      const ts = toIsoTimestamp(input.date, input.time);
      if (input.type === 'in') {
        if (getActiveEntry(input.employeeId)) {
          setNotice('This employee is already clocked in.');
          return false;
        }
        const { data, error } = await supabase
          .from('timeclock_entries')
          .insert({ employee_id: input.employeeId, clock_in: ts, organization_id: orgId })
          .select()
          .maybeSingle();
        if (error || !data) {
          setNotice('Could not add the manual punch.');
          return false;
        }
        setEntries((current) => [data as TimeclockEntry, ...current]);
        setNotice('Manual punch in added.');
      } else {
        const active = getActiveEntry(input.employeeId);
        if (!active) {
          setNotice('There is no open punch in for this employee.');
          return false;
        }
        if (new Date(ts).getTime() <= new Date(active.clock_in).getTime()) {
          setNotice('Punch out must be after punch in.');
          return false;
        }
        const { data, error } = await supabase
          .from('timeclock_entries')
          .update({ clock_out: ts })
          .eq('id', active.id)
          .select()
          .maybeSingle();
        if (error || !data) {
          setNotice('Could not add the manual punch.');
          return false;
        }
        setEntries((current) => current.map((e) => (e.id === active.id ? (data as TimeclockEntry) : e)));
        setNotice('Manual punch out added.');
      }
      return true;
    },
    [orgId, getActiveEntry],
  );

  const updateEntryTimes = useCallback(
    async (entry: TimeclockEntry, input: EditEntryInput): Promise<boolean> => {
      const inTs = toIsoTimestamp(input.clockIn.date, input.clockIn.time);
      const outTs = input.clockOut
        ? toIsoTimestamp(input.clockOut.date, input.clockOut.time)
        : null;
      if (outTs && new Date(outTs).getTime() <= new Date(inTs).getTime()) {
        setNotice('Punch out must be after punch in.');
        return false;
      }
      const { data, error } = await supabase
        .from('timeclock_entries')
        .update({ clock_in: inTs, clock_out: outTs })
        .eq('id', entry.id)
        .select()
        .maybeSingle();
      if (error || !data) {
        setNotice('Could not update that entry.');
        return false;
      }
      setEntries((current) => current.map((e) => (e.id === entry.id ? (data as TimeclockEntry) : e)));
      setNotice('Entry updated.');
      return true;
    },
    [],
  );

  const deleteEntry = useCallback(async (entry: TimeclockEntry): Promise<boolean> => {
    const { error } = await supabase.from('timeclock_entries').delete().eq('id', entry.id);
    if (error) {
      setNotice('Could not delete that entry.');
      return false;
    }
    setEntries((current) => current.filter((e) => e.id !== entry.id));
    setNotice('Entry deleted.');
    return true;
  }, []);

  const entriesInRange = useCallback(
    (start: string, end: string, employeeId: string | null): TimeclockEntry[] => {
      const rs = new Date(`${start}T00:00:00`).getTime();
      const re = new Date(`${end}T23:59:59.999`).getTime();
      return entries
        .filter((e) => {
          const ci = new Date(e.clock_in).getTime();
          return (!employeeId || e.employee_id === employeeId) && ci >= rs && ci <= re;
        })
        .sort((a, b) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime());
    },
    [entries],
  );

  const hoursInRange = useCallback(
    (start: string, end: string, employeeId: string | null): number =>
      entriesInRange(start, end, employeeId).reduce((s, e) => s + entryHours(e.clock_in, e.clock_out), 0),
    [entriesInRange],
  );

  const weeklyHours = useCallback(
    (employeeId: string | null, weekStartDay = 5): number => {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - ((d.getDay() - weekStartDay + 7) % 7));
      const startIso = d.toISOString().slice(0, 10);
      const endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        .toISOString()
        .slice(0, 10);
      return hoursInRange(startIso, endIso, employeeId);
    },
    [hoursInRange],
  );

  const employeeName = useCallback(
    (employeeId: string, lookup: { id: string; name: string }[]) =>
      lookup.find((e) => e.id === employeeId)?.name ?? 'Unknown',
    [],
  );

  return {
    entries,
    loading,
    notice,
    setNotice,
    refresh,
    getActiveEntry,
    punchIn,
    punchOut,
    saveManualPunch,
    updateEntryTimes,
    deleteEntry,
    entriesInRange,
    hoursInRange,
    weeklyHours,
    employeeName,
  };
}
