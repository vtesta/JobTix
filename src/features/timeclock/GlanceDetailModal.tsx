import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { entryHours, formatDayLabel, formatTimeOfDay } from './timeclockMath';
import { formatHours } from '@/lib/format';
import { Timer } from 'lucide-react';
import type { TimeclockEntry } from '@/config/types';

interface GlanceDetailModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  entries: TimeclockEntry[];
  employeeName: (id: string) => string;
}

interface DayGroup {
  key: string;
  label: string;
  entries: TimeclockEntry[];
  subtotal: number;
}

export function GlanceDetailModal({
  open,
  onClose,
  title,
  description,
  entries,
  employeeName,
}: GlanceDetailModalProps) {
  const total = entries.reduce((s, e) => s + entryHours(e.clock_in, e.clock_out), 0);

  const days: DayGroup[] = useMemo(() => {
    const map = new Map<string, TimeclockEntry[]>();
    for (const entry of entries) {
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
  }, [entries]);

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} width="md">
      <div className="mb-4 flex items-center justify-between rounded-xl bg-ink-850 px-4 py-3.5">
        <div>
          <p className="text-2xs font-bold uppercase tracking-widest text-ink-500">Total</p>
          <p className="mt-0.5 font-display text-2xl font-bold tabular-nums text-green-400">
            {formatHours(total)}
          </p>
        </div>
        <Badge tone="neutral">
          {entries.length} shift{entries.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {days.length === 0 ? (
        <EmptyState
          icon={<Timer size={20} />}
          title="No shifts in this period"
          description="Completed punches will appear here."
        />
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <div key={day.key} className="overflow-hidden rounded-xl border border-ink-700">
              <div className="flex items-center justify-between bg-ink-850 px-3.5 py-2.5">
                <p className="text-xs font-bold text-ink-100">{day.label}</p>
                <p className="text-xs font-semibold tabular-nums text-ink-300">
                  {formatHours(day.subtotal)}
                </p>
              </div>
              <div className="divide-y divide-ink-800">
                {day.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-ink-100">
                        {employeeName(entry.employee_id)}
                      </p>
                      <p className="text-2xs tabular-nums text-ink-400">
                        {formatTimeOfDay(entry.clock_in)} –{' '}
                        {entry.clock_out ? formatTimeOfDay(entry.clock_out) : 'Still clocked in'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p className="text-xs font-semibold tabular-nums text-ink-100">
                        {formatHours(entryHours(entry.clock_in, entry.clock_out))}
                      </p>
                      {entry.clock_out ? (
                        <Badge>Complete</Badge>
                      ) : (
                        <Badge tone="green">On clock</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
