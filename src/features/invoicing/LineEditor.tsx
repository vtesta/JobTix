import { Badge } from '@/components/ui/Badge';
import { formatMoney } from '@/features/jobs/invoicesService';
import type { GroupLine } from './groupLines';
import { History, Plus, Trash2, Hammer, Package } from 'lucide-react';

interface LineEditorProps {
  groups: GroupLine[];
  onPatch: (id: string, patch: Partial<GroupLine>) => void;
  onRemove: (id: string) => void;
  onRemoveTicket: (id: string, refIndex: number) => void;
  onAddBlank: (kind: GroupLine['kind']) => void;
}

const sectionMeta = {
  labor: { label: 'Labor', icon: Hammer, hint: 'Tasks and hours' },
  material: { label: 'Materials', icon: Package, hint: 'Parts and supplies' },
} as const;

/** The grouped line-item editor: labor and materials kept in separate sections. */
export function LineEditor({ groups, onPatch, onRemove, onRemoveTicket, onAddBlank }: LineEditorProps) {
  if (groups.length === 0) {
    return (
      <div className="card p-6 text-center">
        <Hammer size={20} className="mx-auto mb-2 text-ink-500" />
        <p className="text-sm font-semibold text-ink-200">No line items yet</p>
        <p className="mt-1 text-xs text-ink-400">
          Select tickets on the left and press "Add selected tickets" — similar work
          groups into a single priced line automatically, sorted into Labor and
          Materials sections.
        </p>
      </div>
    );
  }

  const labor = groups.filter((g) => g.kind === 'labor');
  const materials = groups.filter((g) => g.kind === 'material');

  return (
    <div className="space-y-4">
      <LineSection kind="labor" lines={labor} onPatch={onPatch} onRemove={onRemove} onRemoveTicket={onRemoveTicket} onAddBlank={onAddBlank} />
      <LineSection kind="material" lines={materials} onPatch={onPatch} onRemove={onRemove} onRemoveTicket={onRemoveTicket} onAddBlank={onAddBlank} />
    </div>
  );
}

function LineSection({
  kind,
  lines,
  onPatch,
  onRemove,
  onRemoveTicket,
  onAddBlank,
}: {
  kind: GroupLine['kind'];
  lines: GroupLine[];
  onPatch: (id: string, patch: Partial<GroupLine>) => void;
  onRemove: (id: string) => void;
  onRemoveTicket: (id: string, refIndex: number) => void;
  onAddBlank: (kind: GroupLine['kind']) => void;
}) {
  const meta = sectionMeta[kind];
  const Icon = meta.icon;
  const subtotal = lines.reduce((s, g) => s + (Number(g.quantity) || 0) * (Number(g.unit_price) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <p className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-ink-400">
          <Icon size={12} className="text-ink-300" />
          {meta.label}
          <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-2xs font-semibold text-ink-300">
            {lines.length}
          </span>
          <span className="hidden font-medium normal-case tracking-normal text-ink-500 sm:inline">· {meta.hint}</span>
        </p>
        <p className="text-2xs font-semibold tabular-nums text-ink-300">
          {formatMoney(subtotal)}
        </p>
      </div>
      {lines.map((g) => (
        <LineCard key={g.id} group={g} onPatch={onPatch} onRemove={onRemove} onRemoveTicket={onRemoveTicket} />
      ))}
      <button
        type="button"
        onClick={() => onAddBlank(kind)}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold transition-colors ${
          lines.length === 0
            ? 'border-ink-600 py-3 text-ink-300 hover:border-green-700/60 hover:text-green-400'
            : 'border-ink-700 py-2 text-ink-500 hover:border-green-700/50 hover:text-green-400'
        }`}
      >
        <Plus size={12} /> Add {meta.label === 'Labor' ? 'labor line' : 'material line'}
      </button>
    </div>
  );
}

function LineCard({
  group: g,
  onPatch,
  onRemove,
  onRemoveTicket,
}: {
  group: GroupLine;
  onPatch: (id: string, patch: Partial<GroupLine>) => void;
  onRemove: (id: string) => void;
  onRemoveTicket: (id: string, refIndex: number) => void;
}) {
  const amount = (Number(g.quantity) || 0) * (Number(g.unit_price) || 0);
  return (
    <div className={`card p-3 transition-colors ${g.learnedPrice ? 'border-green-700/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="field-input min-w-[140px] flex-1 text-xs font-medium"
          value={g.description}
          placeholder="Description"
          maxLength={300}
          onChange={(e) => onPatch(g.id, { description: e.target.value })}
        />
        <input
          className="field-input w-16 shrink-0 text-right text-xs tabular-nums"
          type="number"
          min={0}
          step="0.25"
          value={g.quantity}
          aria-label="Quantity"
          onChange={(e) => onPatch(g.id, { quantity: Number(e.target.value) })}
        />
        <input
          className="field-input w-20 shrink-0 text-right text-xs tabular-nums"
          type="number"
          min={0}
          step="0.5"
          value={g.unit_price}
          aria-label="Unit price"
          title={g.learnedPrice ? 'Price from your price book' : 'Unit price'}
          onChange={(e) => onPatch(g.id, { unit_price: Number(e.target.value), learnedPrice: false })}
        />
        <span className="w-20 shrink-0 text-right font-display text-sm font-bold tabular-nums text-ink-50">
          {formatMoney(amount)}
        </span>
        <button
          type="button"
          onClick={() => onRemove(g.id)}
          aria-label="Remove line"
          className="shrink-0 text-ink-400 transition-colors hover:text-error-400"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {g.ticketRefs.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {g.learnedPrice && (
            <Badge tone="green"><History size={10} /> Price book</Badge>
          )}
          {g.ticketRefs.length > 1 && (
            <Badge tone="neutral">{g.ticketRefs.length} tickets grouped</Badge>
          )}
          {g.ticketRefs.map((ref, i) => (
            <span
              key={`${ref}-${i}`}
              className="group/ref inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-2xs text-ink-300"
            >
              {ref}
              <button
                type="button"
                aria-label="Remove this ticket from the line"
                onClick={() => onRemoveTicket(g.id, i)}
                className="text-ink-500 transition-colors hover:text-error-400"
              >
                <Trash2 size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
