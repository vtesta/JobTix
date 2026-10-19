import { Badge } from '@/components/ui/Badge';
import { formatDateShort } from '@/lib/format';
import type { Ticket } from '@/config/types';
import { CheckSquare, Square, Users } from 'lucide-react';

interface TicketSelectorProps {
  tickets: Ticket[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onClear: () => void;
}

/**
 * Batch ticket picker: lists completed, not-yet-billed tickets only.
 * Check every ticket whose work should flow into the invoice.
 */
export function TicketSelector({ tickets, selectedIds, onToggle, onToggleAll, onClear }: TicketSelectorProps) {
  const allSelected = tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));

  return (
    <div className="card flex max-h-[70vh] flex-col p-0">
      <div className="flex items-center justify-between border-b border-ink-700 px-3 py-2.5">
        <div>
          <p className="text-2xs font-bold uppercase tracking-wider text-ink-400">Completed tickets</p>
          <p className="text-2xs text-ink-500">{selectedIds.size} selected</p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggleAll}
            className="rounded-md px-2 py-1 text-2xs font-semibold text-green-400 transition-colors hover:bg-green-500/10"
          >
            {allSelected ? 'None' : 'All'}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-2xs font-semibold text-ink-400 transition-colors hover:bg-ink-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tickets.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">
            No completed tickets waiting to be billed.
          </p>
        ) : (
          tickets.map((t) => {
            const selected = selectedIds.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggle(t.id)}
                className={`flex w-full items-center gap-2.5 border-b border-ink-700/60 px-3 py-2.5 text-left transition-colors last:border-0 ${
                  selected ? 'bg-green-500/5 hover:bg-green-500/10' : 'hover:bg-ink-850'
                }`}
              >
                {selected ? (
                  <span className="shrink-0 text-green-400"><CheckSquare size={15} /></span>
                ) : (
                  <span className="shrink-0 text-ink-500"><Square size={15} /></span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-ink-100">
                    {formatDateShort(t.job_date)} · {t.job_name}
                  </p>
                  <p className="flex items-center gap-1 truncate text-2xs text-ink-400">
                    <Users size={10} className="shrink-0" />
                    {t.names.join(', ') || 'No crew'}
                  </p>
                </div>
                <Badge tone="green">Ready</Badge>
              </button>
            );
          })
        )}
      </div>
      {selectedIds.size > 0 && (
        <div className="border-t border-ink-700 px-3 py-2.5">
          <p className="text-2xs text-ink-400">
            Press "Add selected tickets" to pull their work in as priced lines.
          </p>
        </div>
      )}
    </div>
  );
}
