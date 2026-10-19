import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, SkeletonList } from '@/components/ui/States';
import { entryHours, formatDayLabel, formatTimeOfDay } from './timeclockMath';
import { formatHours } from '@/lib/format';
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Timer, Trash2 } from 'lucide-react';
import type { Employee, TimeclockEntry } from '@/config/types';

type Mode = 'week' | 'month';

interface HoursExplorerProps {
  employees: Employee[];
  entries: TimeclockEntry[];
  myEmployeeId: string | null;
  workWeekStart: number;
  loading: boolean;
  isAdmin: boolean;
  onEditEntry: (entry: TimeclockEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  employeeName: (id: string, lookup: { id: string; name: string }[]) => string;
}

interface DayGroup {
  key: string;
  label: string;
  entries: TimeclockEntry[];
  subtotal: number;
}

export function HoursExplorer({
  employees,
  entries,
  myEmployeeId,
  workWeekStart,
  loading,
  isAdmin,
  onEditEntry,
  onDeleteEntry,
  employeeName,
}: HoursExplorerProps) {
  const [mode, setMode] = useState<Mode>('week');
  const [anchor, setAnchor] = useState(() => new Date());

  const range = useMemo(() => {
    if (mode === 'week') {
      const d = new Date(anchor);
      d.setDate(d.getDate() - ((d.getDay() - workWeekStart + 7) % 7));
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end };
    }
    return {
      start: new Date(anchor.getFullYear(), anchor.getMonth(), 1),
      end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0),
    };
  }, [mode, anchor, workWeekStart]);

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startIso = iso(range.start);
  const endIso = iso(range.end);

  const periodEntries = useMemo(() => {
    const rs = new Date(`${startIso}T00:00:00`).getTime();
    const re = new Date(`${endIso}T23:59:59.999`).getTime();
    return entries
      .filter((e) => {
        const ci = new Date(e.clock_in).getTime();
        return (!myEmployeeId || e.employee_id === myEmployeeId) && ci >= rs && ci <= re;
      })
      .sort((a, b) => new Date(b.clock_in).getTime() - new Date(a.clock_in).getTime());
  }, [entries, myEmployeeId, startIso, endIso]);

  const totalHours = periodEntries.reduce((s, e) => s + entryHours(e.clock_in, e.clock_out), 0);
  const daysWorked = new Set(
    periodEntries.map((e) => new Date(e.clock_in).toLocaleDateString('en-CA')),
  ).size;

  const perEmployee = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of periodEntries) {
      totals.set(e.employee_id, (totals.get(e.employee_id) ?? 0) + entryHours(e.clock_in, e.clock_out));
    }
    return [...totals.entries()]
      .map(([id, hours]) => ({ id, name: employeeName(id, employees), hours }))
      .sort((a, b) => b.hours - a.hours);
  }, [periodEntries, employeeName, employees]);

  const days: DayGroup[] = useMemo(() => {
    const map = new Map<string, TimeclockEntry[]>();
    for (const entry of periodEntries) {
      const key = new Date(entry.clock_in).toLocaleDateString('en-CA');
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, list]) => ({
        key,
        label: formatDayLabel(list[0].clock_in),
        entries: [...list].sort(
          (a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime(),
        ),
        subtotal: list.reduce((s, e) => s + entryHours(e.clock_in, e.clock_out), 0),
      }));
  }, [periodEntries]);

  const shift = (delta: number) => {
    const d = new Date(anchor);
    if (mode === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta, 1);
    setAnchor(d);
  };

  const now = new Date();
  const currentPeriodStart =
    mode === 'week'
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() - workWeekStart + 7) % 7))
      : new Date(now.getFullYear(), now.getMonth(), 1);
  const atCurrentPeriod = iso(range.start) === iso(currentPeriodStart);

  const rangeLabel =
    mode === 'week'
      ? `${formatDayLabel(iso(range.start))} – ${formatDayLabel(iso(range.end))}`
      : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(range.start);

  const periodLabel = mode === 'week' ? 'week' : 'month';

  return (
    <div className="card overflow-hidden animate-fade-up">
      {/* Header: mode toggle + period navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-1 rounded-xl bg-ink-850 p-1">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setAnchor(new Date());
              }}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold capitalize transition-colors ${
                mode === m
                  ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/25'
                  : 'text-ink-400 hover:text-ink-100'
              }`}
            >
              By {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label={`Previous ${periodLabel}`}>
            <ChevronLeft size={16} />
          </Button>
          <span className="min-w-[150px] text-center text-xs font-bold text-ink-100">{rangeLabel}</span>
          <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label={`Next ${periodLabel}`}>
            <ChevronRight size={16} />
          </Button>
          {!atCurrentPeriod && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAnchor(new Date())}
              className="text-green-400 hover:text-green-300"
            >
              Today
            </Button>
          )}
        </div>
      </div>

      {/* Period summary */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-900/50 px-4 py-3 sm:px-5">
        <Badge tone="green">{formatHours(totalHours)}</Badge>
        <Badge tone="neutral">
          {periodEntries.length} shift{periodEntries.length === 1 ? '' : 's'}
        </Badge>
        <Badge tone="neutral">
          {daysWorked} day{daysWorked === 1 ? '' : 's'} worked
        </Badge>
        {isAdmin &&
          perEmployee.map((p) => (
            <span
              key={p.id}
              className="rounded-full bg-ink-850 px-3 py-1 text-2xs font-semibold text-ink-300 ring-1 ring-ink-700"
            >
              {p.name}: <span className="tabular-nums text-green-400">{formatHours(p.hours)}</span>
            </span>
          ))}
      </div>

      {/* Day-grouped shifts */}
      {loading ? (
        <div className="p-5">
          <SkeletonList rows={4} />
        </div>
      ) : days.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<Timer size={20} />}
            title={`No hours in this ${periodLabel}`}
            description="Use the arrows to browse other weeks or months."
          />
        </div>
      ) : (
        <div className="divide-y divide-ink-700">
          {days.map((day) => (
            <div key={day.key}>
              <div className="flex items-center justify-between bg-ink-900/60 px-4 py-2 sm:px-5">
                <p className="flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-ink-400">
                  <CalendarDays size={12} />
                  {day.label}
                </p>
                <p className="text-2xs font-semibold tabular-nums text-ink-300">
                  {formatHours(day.subtotal)}
                </p>
              </div>
              {day.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-ink-800/40 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-100">
                      {employeeName(entry.employee_id, employees)}
                    </p>
                    <p className="text-2xs tabular-nums text-ink-400">
                      {formatTimeOfDay(entry.clock_in)} –{' '}
                      {entry.clock_out ? formatTimeOfDay(entry.clock_out) : 'Still clocked in'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <p className="text-sm font-semibold tabular-nums text-ink-100">
                      {formatHours(entryHours(entry.clock_in, entry.clock_out))}
                    </p>
                    {entry.clock_out ? <Badge>Complete</Badge> : <Badge tone="green">On clock</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onEditEntry(entry)}
                      aria-label={`Edit entry for ${employeeName(entry.employee_id, employees)}`}
                    >
                      <Pencil size={14} className="text-ink-400" />
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteEntry(entry.id)}
                        aria-label="Delete entry"
                      >
                        <Trash2 size={14} className="text-ink-400" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
