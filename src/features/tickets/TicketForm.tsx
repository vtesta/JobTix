import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { X, Plus, Check, Pencil } from 'lucide-react';
import type { Employee, JobName, Ticket } from '@/config/types';
import { sanitizeText } from '@/lib/format';

interface TicketFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: TicketDraft, submit: boolean) => Promise<void>;
  jobs: JobName[];
  employees: Employee[];
  editing?: Ticket | null;
  allowNewJob?: boolean;
  onAddJob?: (name: string) => Promise<boolean>;
  defaultCreatedBy?: string;
  /** Admins can pick which employee the ticket is for. */
  employeeChoices?: Employee[];
  isAdmin?: boolean;
  onAddEmployee?: (name: string) => Promise<boolean>;
  /** Values to prefill a brand-new ticket with (e.g. from a dispatch job). */
  initial?: Partial<TicketDraft>;
}

export interface TicketDraft {
  job_name: string;
  job_date: string;
  names: string[];
  start_time: string;
  end_time: string;
  tasks: string[];
  materials: string[];
  created_by: string;
  sent_at?: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

function findEmployeeName(choices: Employee[], name: string): string | undefined {
  const needle = name.trim().toLowerCase();
  return choices.find((emp) => emp.name.trim().toLowerCase() === needle)?.name;
}

function ListInput({
  label,
  placeholder,
  itemPlaceholder,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  itemPlaceholder: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const add = () => {
    const clean = sanitizeText(draft, 200);
    if (!clean || items.length >= 50) return;
    onChange([...items, clean]);
    setDraft('');
  };

  const startEdit = (i: number) => {
    setEditIndex(i);
    setEditValue(items[i]);
  };

  const saveEdit = (i: number) => {
    const clean = sanitizeText(editValue, 200);
    if (clean) {
      const next = [...items];
      next[i] = clean;
      onChange(next);
    }
    setEditIndex(null);
    setEditValue('');
  };

  return (
    <div className="sm:col-span-2">
      <span className="field-label">{label}</span>
      <div className="overflow-hidden rounded-lg border border-ink-700 bg-ink-850/60">
        {items.length === 0 ? (
          <p className="px-3 py-2.5 text-sm italic text-ink-400">{placeholder}</p>
        ) : (
          <ul className="divide-y divide-ink-700/60">
            {items.map((item, i) => (
              <li key={`${i}-${item}`} className="flex items-center gap-2.5 px-3 py-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-green-500/40 bg-green-500/10 text-[9px] font-bold tabular-nums text-green-300">
                  {i + 1}
                </span>
                {editIndex === i ? (
                  <input
                    className="field-input flex-1 border-transparent bg-transparent py-1 text-sm"
                    value={editValue}
                    maxLength={200}
                    autoFocus
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => saveEdit(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit(i);
                      } else if (e.key === 'Escape') {
                        setEditIndex(null);
                        setEditValue('');
                      }
                    }}
                  />
                ) : (
                  <span className="flex-1 truncate text-sm text-ink-100">{item}</span>
                )}
                <button
                  type="button"
                  aria-label={`Edit ${item}`}
                  onClick={() => startEdit(i)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-green-300"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => {
                    if (editIndex === i) setEditIndex(null);
                    onChange(items.filter((_, idx) => idx !== i));
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-400 transition-colors hover:bg-ink-700 hover:text-red-300"
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 border-t border-ink-700/60 px-3 py-2">
          <input
            className="field-input flex-1 border-transparent bg-transparent py-1 text-sm"
            value={draft}
            maxLength={200}
            placeholder={itemPlaceholder}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={add}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <button
            type="button"
            aria-label={`Add ${label.toLowerCase().replace(/s$/, '')}`}
            disabled={!draft.trim() || items.length >= 50}
            onClick={add}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green-600 text-white transition-colors hover:bg-green-500 disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function TicketForm({
  open,
  onClose,
  onSave,
  jobs,
  employees,
  editing,
  allowNewJob = false,
  onAddJob,
  defaultCreatedBy = '',
  employeeChoices = [],
  isAdmin = false,
  initial,
}: TicketFormProps) {
  const [jobName, setJobName] = useState(editing?.job_name ?? initial?.job_name ?? '');
  const [newJobName, setNewJobName] = useState('');
  const [addingJob, setAddingJob] = useState(false);
  const [jobDate, setJobDate] = useState(editing?.job_date ?? initial?.job_date ?? today());
  const [crew, setCrew] = useState<string[]>(editing?.names ?? initial?.names ?? []);
  const [createdBy, setCreatedBy] = useState(
    editing?.created_by ?? initial?.created_by ?? findEmployeeName(employeeChoices, defaultCreatedBy) ?? defaultCreatedBy,
  );
  const [startTime, setStartTime] = useState(editing?.start_time ?? initial?.start_time ?? '');
  const [endTime, setEndTime] = useState(editing?.end_time ?? initial?.end_time ?? '');
  const [tasks, setTasks] = useState<string[]>(editing?.tasks ?? initial?.tasks ?? []);
  const [materials, setMaterials] = useState<string[]>(editing?.materials ?? initial?.materials ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const NEW_JOB = '__new_job__';

  const toggleCrew = (name: string) => {
    setCrew((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  };

  const submit = async (markSubmitted: boolean) => {
    setError(null);
    let finalJob = jobName;
    if (addingJob) {
      const clean = sanitizeText(newJobName, 120);
      if (!clean) {
        setError('Enter a new job name or pick an existing one.');
        return;
      }
      const added = onAddJob ? await onAddJob(clean) : false;
      if (!added) {
        const exists = jobs.some((j) => j.name.toLowerCase() === clean.toLowerCase());
        if (!exists) {
          setError('Could not add that job name.');
          return;
        }
      }
      finalJob = clean;
    }
    if (!finalJob) {
      setError('Pick a job from the dropdown.');
      return;
    }
    if (markSubmitted) {
      if (!createdBy) {
        setError('Select who created this ticket before submitting.');
        return;
      }
      if (!jobDate) {
        setError('Pick a job date before submitting.');
        return;
      }
      if (!startTime || !endTime) {
        setError('Add both a start time and an end time before submitting.');
        return;
      }
      if (crew.length === 0) {
        setError('Assign at least one crew member before submitting.');
        return;
      }
      if (tasks.length === 0) {
        setError('Add at least one task before submitting.');
        return;
      }
    }
    setSaving(true);
    try {
      await onSave(
        {
          job_name: finalJob,
          job_date: jobDate,
          names: crew,
          start_time: startTime,
          end_time: endTime,
          tasks,
          materials,
          created_by: createdBy,
          ...(markSubmitted ? { sent_at: new Date().toISOString() } : {}),
        },
        markSubmitted,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the ticket.');
    } finally {
      setSaving(false);
      setAddingJob(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit ticket' : 'New job ticket'}
      description="Fill in the job details, then save as a draft or submit it."
      width="lg"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => void submit(false)} loading={saving}>
            Save draft
          </Button>
          <Button icon={<Check size={15} />} onClick={() => void submit(true)} loading={saving}>
            Submit ticket
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {isAdmin && employeeChoices.length > 0 ? (
          <div className="sm:col-span-2">
            <label className="field-label">Created by</label>
            <select
              className="field-input"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              required
            >
              <option value="" disabled>
                Select creator
              </option>
              {!findEmployeeName(employeeChoices, createdBy) && createdBy && (
                <option value={createdBy}>{createdBy}</option>
              )}
              {employeeChoices.map((emp) => (
                <option key={emp.id} value={emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <span className="field-label">Created by</span>
            <input className="field-input" value={createdBy} readOnly />
          </div>
        )}        {allowNewJob ? (
          <div className="sm:col-span-2">
            <label className="field-label">Job name</label>
            <select
              className="field-input"
              value={addingJob ? NEW_JOB : jobName}
              onChange={(e) => {
                if (e.target.value === NEW_JOB) {
                  setAddingJob(true);
                  setJobName('');
                } else {
                  setAddingJob(false);
                  setNewJobName('');
                  setJobName(e.target.value);
                }
              }}
            >
              <option value="">Select a job…</option>
              {!addingJob && jobName && !jobs.some((j) => j.name === jobName) && (
                <option value={jobName}>{jobName}</option>
              )}
              {jobs.map((j) => (
                <option key={j.id} value={j.name}>
                  {j.name}
                </option>
              ))}
              <option value={NEW_JOB}>+ Add new job…</option>
            </select>
            {addingJob && (
              <div className="mt-2 flex gap-2">
                <input
                  className="field-input flex-1"
                  placeholder="e.g. Maple St. remodel"
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  maxLength={120}
                  autoFocus
                />
                <Button
                  variant="secondary"
                  icon={<Plus size={15} />}
                  disabled={!newJobName.trim()}
                  onClick={() => {
                    const clean = sanitizeText(newJobName, 120);
                    setJobName(clean);
                    setAddingJob(false);
                    if (clean) void onAddJob?.(clean);
                  }}
                >
                  Use
                </Button>
              </div>
            )}
          </div>
        ) : (
          <Select label="Job name" value={jobName} onChange={(e) => setJobName(e.target.value)}>
            <option value="">Select a job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.name}>
                {j.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          label="Job date"
          type="date"
          value={jobDate}
          onChange={(e) => setJobDate(e.target.value)}
        />
        <Input
          label="Start time"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <Input
          label="End time"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
        <div className="sm:col-span-2">
          <span className="field-label">Crew</span>
          <div className="flex flex-wrap gap-1.5">
            {employees.length === 0 && (
              <p className="text-xs text-ink-400">No employees yet — add some on the Employees page.</p>
            )}
            {employees.map((emp) => (
              <button key={emp.id} type="button" onClick={() => toggleCrew(emp.name)}>
                <Badge tone={crew.includes(emp.name) ? 'green' : 'neutral'}>
                  {crew.includes(emp.name) && <Plus size={10} />}
                  {emp.name}
                </Badge>
              </button>
            ))}
          </div>
        </div>
        <ListInput
          label="Tasks"
          placeholder="No tasks added yet."
          itemPlaceholder="Add a task…"
          items={tasks}
          onChange={setTasks}
        />
        <ListInput
          label="Materials (optional)"
          placeholder="No materials listed."
          itemPlaceholder="Add a material…"
          items={materials}
          onChange={setMaterials}
        />
      </div>
      {error && <p className="mt-2 text-xs text-error-400">{error}</p>}
    </Modal>
  );
}

export function CrewChip({ name, onRemove }: { name: string; onRemove?: () => void }) {
  return (
    <Badge tone="green" className="pr-1.5">
      {name}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${name}`} className="ml-0.5 rounded-full hover:text-white">
          <X size={11} />
        </button>
      )}
    </Badge>
  );
}
