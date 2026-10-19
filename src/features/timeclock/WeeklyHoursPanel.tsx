import { useMemo } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { entryHours, formatDayLabel } from './timeclockMath';
import { formatHours } from '@/lib/format';
import { Timer, Users } from 'lucide-react';
import type { Employee, TimeclockEntry } from '@/config/types';

interface WeeklyHoursPanelProps {
  employees: Employee[];
  entries: TimeclockEntry[];
  weekStartIso: string;
  weekEndIso: string;
  onSelectEmployee: (employeeId: string) => void;
}

const WEEKLY_TARGET_HOURS = 40;

export function WeeklyHoursPanel({
  employees,
  entries,
  weekStartIso,
  weekEndIso,
  onSelectEmployee,
}: WeeklyHoursPanelProps) {
  const tiles = useMemo(
    () =>
      employees.map((employee) => {
        const shifts = entries.filter((e) => e.employee_id === employee.id);
        const hours = shifts.reduce((s, e) => s + entryHours(e.clock_in, e.clock_out), 0);
        const daysWorked = new Set(
          shifts.map((e) => new Date(e.clock_in).toLocaleDateString('en-CA')),
        ).size;
        const onClock = shifts.some((e) => !e.clock_out);
        return { employee, shifts, hours, daysWorked, onClock };
      }),
    [employees, entries],
  );

  const teamTotal = tiles.reduce((s, t) => s + t.hours, 0);
  const rangeLabel = `${formatDayLabel(weekStartIso)} – ${formatDayLabel(weekEndIso)}`;

  return (
    <div className="card mb-4 p-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Weekly hours</p>
          <h2 className="mt-0.5 font-display text-lg font-bold text-ink-50">Who worked what</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{rangeLabel}</Badge>
          <Badge tone="green">Team: {formatHours(teamTotal)}</Badge>
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<Users size={20} />}
            title="No employees yet"
            description="Add employees to see their weekly hours here."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map(({ employee, shifts, hours, daysWorked, onClock }) => {
            const pct = Math.min(100, (hours / WEEKLY_TARGET_HOURS) * 100);
            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => onSelectEmployee(employee.id)}
                className="group rounded-xl border border-ink-700 bg-ink-850 px-4 py-3.5 text-left transition-all hover:border-green-500/40 hover:bg-ink-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-green-500/50"
                aria-label={`View ${employee.name}'s shifts this week`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-bold text-ink-100 ring-1 ring-ink-600 transition-colors group-hover:ring-green-500/50">
                    {employee.name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink-50">{employee.name}</p>
                    <p className="text-2xs text-ink-400">
                      {shifts.length} shift{shifts.length === 1 ? '' : 's'} · {daysWorked} day
                      {daysWorked === 1 ? '' : 's'}
                    </p>
                  </div>
                  {onClock ? (
                    <Badge tone="green">
                      <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse-soft" />
                      On clock
                    </Badge>
                  ) : (
                    <span className="text-2xs font-medium text-ink-500">Off</span>
                  )}
                </div>

                <div className="mt-3 flex items-baseline justify-between">
                  <p className="font-display text-xl font-bold tabular-nums text-green-400">
                    {formatHours(hours)}
                  </p>
                  <p className="text-2xs text-ink-500">of {WEEKLY_TARGET_HOURS}h target</p>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {tiles.length > 0 && teamTotal === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-ink-850 px-3.5 py-2.5 text-xs text-ink-400">
          <Timer size={14} />
          No punches recorded this week yet.
        </div>
      )}
    </div>
  );
}
