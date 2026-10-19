import { useMemo, useState } from 'react';
import { Page, PageHeader } from '@/components/ui/Page';
import { Button } from '@/components/ui/Button';
import { useTimeclock } from './useTimeclock';
import { ManualPunchModal } from './ManualPunchModal';
import { EditEntryModal } from './EditEntryModal';
import { GlanceDetailModal } from './GlanceDetailModal';
import { WeeklyHoursPanel } from './WeeklyHoursPanel';
import { HoursExplorer } from './HoursExplorer';
import {
  entryHours,
  formatTimeOfDay,
  hoursForDateRange,
  monthStartIso,
  todayIso,
} from './timeclockMath';
import { formatHours } from '@/lib/format';
import { useAuth } from '@/hooks/AuthContext';
import { Check, LogIn, LogOut, Plus, Trash2, X } from 'lucide-react';
import type { Employee, TimeclockEntry } from '@/config/types';

interface TimeclockPageProps {
  orgId: string;
  employees: Employee[];
  workWeekStart: number;
}

export function TimeclockPage({ orgId, employees, workWeekStart }: TimeclockPageProps) {
  const { user, isAdmin, currentMembership } = useAuth();
  const tc = useTimeclock(orgId);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualType, setManualType] = useState<'in' | 'out'>('in');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<TimeclockEntry | null>(null);
  const [glanceDetail, setGlanceDetail] = useState<'today' | 'week' | 'month' | null>(null);
  const [weekEmployeeId, setWeekEmployeeId] = useState<string | null>(null);

  // Employee record for the signed-in user (verified account first, then name match)
  const currentEmployee = useMemo(() => {
    if (isAdmin) return null;
    const userId = user?.id;
    if (userId) {
      const byId = employees.find((e) => e.user_id === userId);
      if (byId) return byId;
    }
    const displayName = currentMembership?.name ?? '';
    return (
      employees.find(
        (e) => e.name.trim().toLowerCase() === displayName.trim().toLowerCase(),
      ) ?? null
    );
  }, [employees, user?.id, currentMembership?.name, isAdmin]);

  const myEmployeeId = isAdmin ? null : (currentEmployee?.id ?? null);

  const todayHours = tc.hoursInRange(todayIso(), todayIso(), myEmployeeId);
  const weekHours = tc.weeklyHours(myEmployeeId, workWeekStart);
  const monthHours = tc.hoursInRange(monthStartIso(), todayIso(), myEmployeeId);

  const weekStartIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() - workWeekStart + 7) % 7));
    return d.toISOString().slice(0, 10);
  }, [workWeekStart]);

  const weekEndIso = useMemo(() => {
    const d = new Date(`${weekStartIso}T00:00:00`);
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, [weekStartIso]);

  const weekEntries = useMemo(
    () => tc.entriesInRange(weekStartIso, weekEndIso, null),
    [tc, weekStartIso, weekEndIso],
  );

  const weekEmployeeEntries = useMemo(
    () => (weekEmployeeId ? tc.entriesInRange(weekStartIso, weekEndIso, weekEmployeeId) : []),
    [tc, weekStartIso, weekEndIso, weekEmployeeId],
  );

  const glanceEntries = useMemo(() => {
    if (!glanceDetail) return [];
    if (glanceDetail === 'today') return tc.entriesInRange(todayIso(), todayIso(), myEmployeeId);
    if (glanceDetail === 'week') return tc.entriesInRange(weekStartIso, todayIso(), myEmployeeId);
    return tc.entriesInRange(monthStartIso(), todayIso(), myEmployeeId);
  }, [glanceDetail, tc, myEmployeeId, weekStartIso]);

  const activeEntry = myEmployeeId ? tc.getActiveEntry(myEmployeeId) : null;

  const openManualPunch = (type: 'in' | 'out') => {
    setManualType(type);
    setManualOpen(true);
  };

  return (
    <Page>
      <PageHeader
        title={isAdmin ? 'All work records' : 'My work clock'}
        description={
          isAdmin
            ? 'Review every employee hour across the team.'
            : 'Track your hours, punches, and work history.'
        }
        actions={
          <Button
            icon={<Plus size={16} />}
            onClick={() => openManualPunch('in')}
            disabled={!isAdmin && !currentEmployee}
          >
            Add punch
          </Button>
        }
      />

      {tc.notice && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-xs text-green-300 animate-fade-up">
          <Check size={14} />
          {tc.notice}
          <button onClick={() => tc.setNotice(null)} aria-label="Dismiss" className="ml-auto text-ink-400 hover:text-ink-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Employee self-service panel */}
      {!isAdmin && currentEmployee && (
        <div className="card mb-4 p-5 animate-fade-up">
          <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Employee</p>
          <h2 className="mt-0.5 font-display text-lg font-bold text-ink-50">{currentEmployee.name}</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={() => void tc.punchIn(currentEmployee.id)}
              disabled={Boolean(activeEntry)}
              className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3.5 text-left transition-all hover:bg-green-500/20 disabled:opacity-40"
            >
              <LogIn size={22} className="text-green-400" />
              <div>
                <p className="text-sm font-bold text-ink-50">Punch in</p>
                <p className="text-2xs text-ink-400">
                  {activeEntry ? 'Already clocked in' : 'Start a live shift'}
                </p>
              </div>
            </button>
            <button
              onClick={() => activeEntry && void tc.punchOut(activeEntry)}
              disabled={!activeEntry}
              className="flex items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 px-4 py-3.5 text-left transition-all hover:border-ink-500 disabled:opacity-40"
            >
              <LogOut size={22} className="text-warning-400" />
              <div>
                <p className="text-sm font-bold text-ink-50">Punch out</p>
                <p className="text-2xs text-ink-400">
                  {activeEntry ? 'End current shift' : 'No active shift'}
                </p>
              </div>
            </button>
          </div>
          <div
            className={`mt-3 flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-semibold ${
              activeEntry
                ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/25'
                : 'bg-ink-850 text-ink-400'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                activeEntry ? 'bg-green-400 animate-pulse-soft' : 'bg-ink-500'
              }`}
            />
            {activeEntry ? `Clocked in since ${formatTimeOfDay(activeEntry.clock_in)}` : 'Punched out'}
          </div>
        </div>
      )}

      {/* Hours at a glance (employee) */}
      {!isAdmin && currentEmployee && (
        <div className="card mb-4 p-5 animate-fade-up">
          <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Total work hours</p>
          <h2 className="mt-0.5 font-display text-lg font-bold text-ink-50">Hours at a glance</h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {([
              ['Today', todayHours, 'today'],
              ['This week', weekHours, 'week'],
              ['This month', monthHours, 'month'],
            ] as const).map(([label, hours, key]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGlanceDetail(key)}
                className="rounded-xl bg-ink-850 px-3 py-3 text-center transition-colors hover:bg-ink-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500/50"
                aria-label={`View ${label.toLowerCase()} hour details`}
              >
                <p className="text-2xs text-ink-400">{label}</p>
                <p className="mt-1 text-base font-bold tabular-nums text-green-400">
                  {formatHours(hours)}
                </p>
                <p className="mt-0.5 text-2xs font-medium text-ink-500">View details</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No employee profile */}
      {!isAdmin && !currentEmployee && (
        <div className="card mb-4 p-5 animate-fade-up">
          <p className="text-sm leading-relaxed text-ink-400">
            You don't have an employee profile yet. Ask your workspace admin to add you to the
            Employees list so you can use the timeclock.
          </p>
        </div>
      )}

      {/* Admin weekly hours at a glance */}
      {isAdmin && (
        <WeeklyHoursPanel
          employees={employees}
          entries={weekEntries}
          weekStartIso={weekStartIso}
          weekEndIso={weekEndIso}
          onSelectEmployee={setWeekEmployeeId}
        />
      )}

      {/* Hours explorer: browse any week or month */}
      <HoursExplorer
        employees={employees}
        entries={tc.entries}
        myEmployeeId={myEmployeeId}
        workWeekStart={workWeekStart}
        loading={tc.loading}
        isAdmin={isAdmin}
        onEditEntry={setEditEntry}
        onDeleteEntry={setConfirmDelete}
        employeeName={tc.employeeName}
      />

      <ManualPunchModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        employees={isAdmin ? employees : currentEmployee ? [currentEmployee] : []}
        lockedEmployeeId={isAdmin ? undefined : (currentEmployee?.id ?? undefined)}
        initialType={manualType}
        onSave={tc.saveManualPunch}
      />

      <GlanceDetailModal
        open={weekEmployeeId !== null}
        onClose={() => setWeekEmployeeId(null)}
        title={`${tc.employeeName(weekEmployeeId ?? '', employees)} — this week`}
        description="Every shift behind this total, grouped by day."
        entries={weekEmployeeEntries}
        employeeName={(id) => tc.employeeName(id, employees)}
      />

      <GlanceDetailModal
        open={glanceDetail !== null}
        onClose={() => setGlanceDetail(null)}
        title={
          glanceDetail === 'today'
            ? 'Today’s hours'
            : glanceDetail === 'week'
              ? 'This week’s hours'
              : 'This month’s hours'
        }
        description="Every shift behind this total, grouped by day."
        entries={glanceEntries}
        employeeName={(id) => tc.employeeName(id, employees)}
      />

      <EditEntryModal
        open={Boolean(editEntry)}
        entry={editEntry}
        onClose={() => setEditEntry(null)}
        onSave={tc.updateEntryTimes}
      />

      {confirmDelete && (
        <DeleteEntryModal
          entryId={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const entry = tc.entries.find((e) => e.id === confirmDelete);
            if (entry) await tc.deleteEntry(entry);
            setConfirmDelete(null);
          }}
        />
      )}
    </Page>
  );
}

function DeleteEntryModal({
  entryId,
  onClose,
  onConfirm,
}: {
  entryId: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-pop animate-scale-in">
        <h3 className="font-display text-base font-bold text-ink-50">Delete entry?</h3>
        <p className="mt-1.5 text-xs text-ink-400">This time entry will be permanently removed.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => void onConfirm()}>
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
