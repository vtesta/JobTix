import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Check, LogIn, LogOut } from 'lucide-react';
import type { Employee } from '@/config/types';
import { nowTimeInput, todayIso } from './timeclockMath';
import type { ManualPunchInput } from './useTimeclock';

interface ManualPunchModalProps {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  /** Employees cannot pick a different person. */
  lockedEmployeeId?: string;
  initialType: 'in' | 'out';
  onSave: (input: ManualPunchInput) => Promise<boolean>;
}

export function ManualPunchModal({
  open,
  onClose,
  employees,
  lockedEmployeeId,
  initialType,
  onSave,
}: ManualPunchModalProps) {
  const [type, setType] = useState<'in' | 'out'>(initialType);
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId ?? employees[0]?.id ?? '');
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowTimeInput());
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    const ok = await onSave({ employeeId: lockedEmployeeId ?? employeeId, type, date, time });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add manual punch"
      description="Record a punch with a specific date and time."
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={<Check size={15} />} loading={saving} onClick={() => void submit()}>
            Save punch
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('in')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
              type === 'in'
                ? 'border-green-500 bg-green-500/15 text-green-400'
                : 'border-ink-600 bg-ink-850 text-ink-300 hover:border-ink-500'
            }`}
          >
            <LogIn size={16} /> Punch in
          </button>
          <button
            type="button"
            onClick={() => setType('out')}
            className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
              type === 'out'
                ? 'border-warning-500 bg-warning-500/15 text-warning-400'
                : 'border-ink-600 bg-ink-850 text-ink-300 hover:border-ink-500'
            }`}
          >
            <LogOut size={16} /> Punch out
          </button>
        </div>

        {!lockedEmployeeId && (
          <div>
            <label className="field-label">Employee</label>
            <select
              className="field-input"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="" disabled>
                Select an employee
              </option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
