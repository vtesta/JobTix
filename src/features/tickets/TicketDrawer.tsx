import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  ListChecks,
  Package,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Ticket, TicketItemRow } from '@/config/types';
import { formatDate, formatTime12h, sanitizeText } from '@/lib/format';

interface TicketDrawerProps {
  ticket: Ticket;
  orgName: string;
  items: TicketItemRow[];
  billing?: 'billed' | 'draft';
  onClose: () => void;
  onEdit: (t: Ticket) => void;
  onSubmit: (t: Ticket) => void;
  onDelete: (t: Ticket) => void;
  onUpdate: (t: Ticket, updates: Partial<Ticket>) => Promise<void>;
  onAddItem: (t: Ticket, kind: 'task' | 'material', content: string) => Promise<void>;
  onEditItem: (t: Ticket, item: TicketItemRow, content: string) => Promise<void>;
  onDeleteItem: (t: Ticket, item: TicketItemRow) => Promise<void>;
  onToggleCompleted?: (t: Ticket) => Promise<void>;
  canEditDetails: boolean;
  canManage: boolean;
  isAdmin: boolean;
  crewOptions: string[];
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
}

function FieldShell({
  icon,
  label,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    'group flex w-full items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-left transition-colors' +
    (onClick ? ' hover:border-green-500/50 cursor-pointer' : '');
  const body = (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-500/10 text-green-400">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
        {children}
      </div>
      {onClick && (
        <Pencil size={12} className="shrink-0 text-ink-500 transition-colors group-hover:text-green-300" />
      )}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function EditableDateField({
  icon,
  label,
  value,
  editable,
  onSave,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  editable: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!editable) {
    return (
      <FieldShell icon={icon} label={label}>
        <p className="truncate text-sm font-semibold text-ink-50">{formatDate(value)}</p>
      </FieldShell>
    );
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-green-500/40 bg-ink-850 px-3 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="date"
            className="field-input flex-1 py-1 text-sm"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            aria-label="Save date"
            disabled={saving || !draft}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draft);
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-500 disabled:opacity-40"
          >
            <Check size={13} />
          </button>
          <button
            aria-label="Cancel editing"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <FieldShell
      icon={icon}
      label={label}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
    >
      <p className="truncate text-sm font-semibold text-ink-50">{formatDate(value)}</p>
    </FieldShell>
  );
}

function TimeField({
  icon,
  label,
  startTime,
  endTime,
  editable,
  onSave,
}: {
  icon: React.ReactNode;
  label: string;
  startTime: string;
  endTime: string;
  editable: boolean;
  onSave: (start: string, end: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftStart, setDraftStart] = useState(startTime);
  const [draftEnd, setDraftEnd] = useState(endTime);
  const [saving, setSaving] = useState(false);

  const value = startTime
    ? `${formatTime12h(startTime)}${endTime ? ` – ${formatTime12h(endTime)}` : ''}`
    : 'Not set';

  if (!editable) {
    return (
      <FieldShell icon={icon} label={label}>
        <p className="truncate text-sm font-semibold text-ink-50">{value}</p>
      </FieldShell>
    );
  }

  if (editing) {
    return (
      <div className="rounded-lg border border-green-500/40 bg-ink-850 px-3 py-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-400">{label}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="time"
            className="field-input flex-1 py-1 text-sm"
            value={draftStart}
            onChange={(e) => setDraftStart(e.target.value)}
            aria-label="Start time"
          />
          <span className="text-xs text-ink-400">–</span>
          <input
            type="time"
            className="field-input flex-1 py-1 text-sm"
            value={draftEnd}
            onChange={(e) => setDraftEnd(e.target.value)}
            aria-label="End time"
          />
          <button
            aria-label="Save time"
            disabled={saving || !draftStart}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(draftStart, draftEnd);
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-500 disabled:opacity-40"
          >
            <Check size={13} />
          </button>
          <button
            aria-label="Cancel editing"
            onClick={() => {
              setDraftStart(startTime);
              setDraftEnd(endTime);
              setEditing(false);
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <FieldShell
      icon={icon}
      label={label}
      onClick={() => {
        setDraftStart(startTime);
        setDraftEnd(endTime);
        setEditing(true);
      }}
    >
      <p className="truncate text-sm font-semibold text-ink-50">{value}</p>
    </FieldShell>
  );
}

function CrewField({
  icon,
  label,
  assigned,
  options,
  editable,
  onSave,
}: {
  icon: React.ReactNode;
  label: string;
  assigned: string[];
  options: string[];
  editable: boolean;
  onSave: (crew: string[]) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const isActive = (name: string) => assigned.some((n) => n.toLowerCase() === name.toLowerCase());

  // Full roster, plus any names already on the ticket so nobody disappears when removed.
  const roster = [...options];
  for (const n of assigned) {
    if (!roster.some((o) => o.toLowerCase() === n.toLowerCase())) roster.push(n);
  }
  // Only the assigned crew is shown until the admin starts editing.
  const visible = picking ? roster : assigned;

  const toggle = async (name: string) => {
    if (saving) return;
    const next = isActive(name)
      ? assigned.filter((n) => n.toLowerCase() !== name.toLowerCase())
      : [...assigned, name];
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FieldShell icon={icon} label={label}>
      {roster.length === 0 ? (
        <span className="text-sm italic text-ink-400">No employees yet — add some on the Employees page.</span>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {visible.length === 0 ? (
              <span className="text-sm italic text-ink-400">
                {picking ? 'Nobody assigned yet — tap a name below.' : 'No crew assigned'}
              </span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {visible.map((n) => {
                  const active = picking ? isActive(n) : true;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!picking || !editable || saving}
                      aria-pressed={active}
                      aria-label={
                        picking ? (active ? `Remove ${n} from crew` : `Add ${n} to crew`) : n
                      }
                      onClick={() => (picking && editable ? void toggle(n) : undefined)}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-semibold transition-colors ${
                        active
                          ? 'border-green-500/30 bg-green-500/10 text-green-200'
                          : 'border-ink-600 bg-ink-850 text-ink-400'
                      } ${
                        picking && editable
                          ? saving
                            ? 'opacity-60 cursor-default'
                            : 'hover:border-green-500/50'
                          : 'cursor-default'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={picking ? 'Done editing crew' : 'Edit crew'}
            disabled={saving}
            onClick={() => setPicking((p) => !p)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-ink-700 disabled:opacity-40 ${
              picking ? 'text-green-300' : 'text-ink-400 hover:text-green-300'
            }`}
          >
            {picking ? <Check size={12} /> : <Pencil size={12} />}
          </button>
        </div>
      )}
    </FieldShell>
  );
}

interface ListRowProps {
  item: TicketItemRow;
  index: number;
  editable: boolean;
  copyable?: boolean;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
  saving: boolean;
}

function ListRow({ item, index, editable, copyable = false, onSave, onDelete, saving }: ListRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.content);
  const [copied, setCopied] = useState(false);

  const copyItem = async () => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-4 py-2">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-green-500/40 bg-green-500/10 text-[9px] font-bold tabular-nums text-green-300">
          {index + 1}
        </span>
        <input
          className="field-input flex-1 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={200}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const clean = sanitizeText(draft, 200);
              if (clean) void onSave(clean).then(() => setEditing(false));
            } else if (e.key === 'Escape') {
              setDraft(item.content);
              setEditing(false);
            }
          }}
        />
        <button
          aria-label="Save"
          disabled={saving || !draft.trim()}
          onClick={() => {
            const clean = sanitizeText(draft, 200);
            if (clean) void onSave(clean).then(() => setEditing(false));
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-500 disabled:opacity-40"
        >
          <Check size={12} />
        </button>
        <button
          aria-label="Cancel editing"
          onClick={() => {
            setDraft(item.content);
            setEditing(false);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-ink-100"
        >
          <X size={12} />
        </button>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-2.5 px-4 py-2.5">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-green-500/40 bg-green-500/10 text-[9px] font-bold tabular-nums text-green-300">
        {index + 1}
      </span>
      <span className="flex-1 text-sm leading-relaxed text-ink-100">{item.content}</span>
      {editable && (
        <button
          aria-label={`Edit item ${index + 1}`}
          onClick={() => {
            setDraft(item.content);
            setEditing(true);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-green-300"
        >
          <Pencil size={12} />
        </button>
      )}
      {copyable && !editing && (
        <button
          aria-label={copied ? `Copied item ${index + 1}` : `Copy item ${index + 1}`}
          onClick={() => void copyItem()}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-ink-700 ${
            copied ? 'text-green-300' : 'text-ink-400 hover:text-green-300'
          }`}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      )}
      {editable && (
        <button
          aria-label={`Delete item ${index + 1}`}
          onClick={() => void onDelete()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-red-300"
        >
          <Trash2 size={12} />
        </button>
      )}
    </li>
  );
}

function AddRowInput({ onAdd }: { onAdd: (value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const clean = sanitizeText(value, 200);
    if (!clean || saving) return;
    setSaving(true);
    try {
      await onAdd(clean);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-ink-700/60 px-4 py-2.5">
      <input
        className="field-input flex-1 py-1 text-sm"
        value={value}
        maxLength={200}
        placeholder="Add an item…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void add();
        }}
      />
      <button
        aria-label="Add item"
        disabled={saving || !value.trim()}
        onClick={() => void add()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-500 disabled:opacity-40"
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function ListSection({
  icon,
  title,
  items,
  editable,
  copyable,
  onEditRow,
  onDeleteRow,
  onAddRow,
}: {
  icon: React.ReactNode;
  title: string;
  items: TicketItemRow[];
  editable: boolean;
  copyable?: boolean;
  onEditRow: (item: TicketItemRow, content: string) => Promise<void>;
  onDeleteRow: (item: TicketItemRow) => Promise<void>;
  onAddRow: (content: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-850/60">
      <div className="flex items-center gap-2 border-b border-ink-700 bg-ink-800/80 px-4 py-2.5">
        <span className="text-green-400">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-100">{title}</p>
        <span className="ml-auto rounded-full bg-green-500/15 px-2 py-0.5 text-2xs font-semibold tabular-nums text-green-300">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm italic text-ink-400">Nothing added yet.</p>
      ) : (
        <ul className="divide-y divide-ink-700/60">
          {items.map((item, i) => (
            <ListRow
              key={item.id}
              item={item}
              index={i}
              editable={editable}
              copyable={copyable}
              saving={false}
              onSave={(content) => onEditRow(item, content)}
              onDelete={() => onDeleteRow(item)}
            />
          ))}
        </ul>
      )}
      {editable && <AddRowInput onAdd={onAddRow} />}
    </div>
  );
}

export function TicketDrawer({
  ticket,
  orgName,
  items,
  billing,
  onClose,
  onEdit,
  onSubmit,
  onDelete,
  onUpdate,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onToggleCompleted,
  canEditDetails,
  canManage,
  isAdmin,
  crewOptions,
  position,
  onPrev,
  onNext,
}: TicketDrawerProps) {
  const taskItems = items.filter((i) => i.kind === 'task');
  const materialItems = items.filter((i) => i.kind === 'material');

  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    // Touch and pen only: a horizontal mouse drag is usually text selection.
    if (e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // Horizontal swipe only: clearly sideways, long enough, and not a scroll or click.
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) {
      if (dx < 0) onNext?.();
      else onPrev?.();
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Ticket"
      description={`${orgName || 'TradeDesk'} · Job ticket`}
      width="md"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {canManage && (
              <>
                <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => onDelete(ticket)}>
                  Delete
                </Button>
                <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => onEdit(ticket)}>
                  Edit
                </Button>
              </>
            )}
          </div>
          {ticket.sent_at ? (
            <div className="flex items-center gap-2">
              {onToggleCompleted && (
                <Button
                  variant={ticket.completed_at ? 'secondary' : 'primary'}
                  icon={<CheckCircle2 size={15} />}
                  onClick={() => onToggleCompleted(ticket)}
                >
                  {ticket.completed_at ? 'Completed' : 'Mark completed'}
                </Button>
              )}
              <Badge tone="green">
                <Check size={11} /> Submitted
              </Badge>
            </div>
          ) : (
            canManage && (
              <Button icon={<Check size={15} />} onClick={() => onSubmit(ticket)}>
                Submit
              </Button>
            )
          )}
        </div>
      }
    >
      {/* Swipe / arrow navigation between tickets */}
      {position && position.total > 1 && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronLeft size={14} />}
            onClick={onPrev ?? (() => {})}
            disabled={!onPrev}
            aria-label="Previous ticket"
          >
            Prev
          </Button>
          <span className="text-2xs font-semibold tabular-nums text-ink-400">
            {position.index + 1} of {position.total}
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={<ChevronRight size={14} />}
            onClick={onNext ?? (() => {})}
            disabled={!onNext}
            aria-label="Next ticket"
          >
            Next
          </Button>
        </div>
      )}

      {/* Ticket header — whole drawer surface is swipeable; touch-pan-y keeps horizontal gestures (vertical scroll still works) */}
      <div
        key={ticket.id}
        className="min-h-full animate-fade-up touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      >
      <div className="overflow-hidden rounded-xl border border-ink-700 shadow-card">
        <div className="relative bg-gradient-to-br from-green-900/40 via-ink-900 to-ink-900 px-5 py-4">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-bold uppercase tracking-[0.2em] text-green-400">Job ticket</p>
            <div className="flex items-center gap-1.5">
              {billing === 'billed' && (
                <Badge tone="info">
                  <Receipt size={10} /> Invoiced
                </Badge>
              )}
              {billing === 'draft' && (
                <Badge tone="warning">
                  <Receipt size={10} /> On draft
                </Badge>
              )}
              {ticket.completed_at ? (
                <Badge tone="green">Completed</Badge>
              ) : ticket.sent_at ? (
                <Badge tone="warning">Sent</Badge>
              ) : (
                <Badge tone="error">Draft</Badge>
              )}
            </div>
          </div>
          {isAdmin ? (
            <div className="mt-1">
              <input
                className="field-input border-transparent bg-transparent px-0 py-0 font-display text-xl font-bold text-ink-50 hover:border-ink-600 focus:border-green-500/60"
                defaultValue={ticket.job_name}
                maxLength={120}
                aria-label="Job name"
                onBlur={async (e) => {
                  const clean = sanitizeText(e.target.value, 120);
                  if (clean && clean !== ticket.job_name) await onUpdate(ticket, { job_name: clean });
                  else e.target.value = ticket.job_name;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = ticket.job_name;
                    e.currentTarget.blur();
                  }
                }}
              />
            </div>
          ) : (
            <h3 className="mt-1 font-display text-xl font-bold leading-tight text-ink-50">{ticket.job_name}</h3>
          )}
        </div>
        <div className="grid gap-2 border-t border-ink-700 bg-ink-900 px-4 py-3 sm:grid-cols-2">
          <EditableDateField
            icon={<CalendarDays size={16} />}
            label="Date"
            value={ticket.job_date}
            editable={isAdmin}
            onSave={(date) => onUpdate(ticket, { job_date: date })}
          />
          <TimeField
            icon={<Clock3 size={16} />}
            label="Time"
            startTime={ticket.start_time}
            endTime={ticket.end_time}
            editable={isAdmin}
            onSave={(start, end) => onUpdate(ticket, { start_time: start, end_time: end })}
          />
        </div>
        <div className="border-t border-ink-700 bg-ink-900 px-4 py-3">
          <CrewField
            icon={<User size={16} />}
            label="Crew"
            assigned={ticket.names}
            options={crewOptions}
            editable={isAdmin}
            onSave={(names) => onUpdate(ticket, { names })}
          />
        </div>
      </div>

      {/* Tasks (editable inline for admins) */}
      <div className="mt-3">
        <ListSection
          icon={<ListChecks size={15} />}
          title="Tasks"
          items={taskItems}
          editable={canEditDetails}
          copyable={isAdmin}
          onEditRow={(item, content) => onEditItem(ticket, item, content)}
          onDeleteRow={(item) => onDeleteItem(ticket, item)}
          onAddRow={(content) => onAddItem(ticket, 'task', content)}
        />
      </div>

      {/* Materials */}
      <div className="mt-3">
        <ListSection
          icon={<Package size={15} />}
          title="Materials"
          items={materialItems}
          editable={canEditDetails}
          onEditRow={(item, content) => onEditItem(ticket, item, content)}
          onDeleteRow={(item) => onDeleteItem(ticket, item)}
          onAddRow={(content) => onAddItem(ticket, 'material', content)}
        />
      </div>

      {isAdmin && (
        <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-400">
          <User size={12} />
          Created by {ticket.created_by || '—'}
        </p>
      )}
      </div>
    </Modal>
  );
}
