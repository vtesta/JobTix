import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Check } from 'lucide-react';
import type { TimeclockEntry } from '@/config/types';
import { todayIso } from './timeclockMath';
import type { EditEntryInput } from './useTimeclock';

interface EditEntryModalProps {
  open: boolean;
  entry: TimeclockEntry | null;
  onClose: () => void;
  onSave: (entry: TimeclockEntry, input: EditEntryInput) => Promise<boolean>;
}

function splitTimestamp(value: string | null): { date: string; time: string } {
  if (!value) return { date: todayIso(), time: '' };
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function EditEntryModal({ open, entry, onClose, onSave }: EditEntryModalProps) {
  const [inDate, setInDate] = useState('');
  const [inTime, setInTime] = useState('');
  const [outDate, setOutDate] = useState('');
  const [outTime, setOutTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      const inTs = splitTimestamp(entry.clock_in);
      setInDate(inTs.date);
      setInTime(inTs.time);
      if (entry.clock_out) {
        const outTs = splitTimestamp(entry.clock_out);
        setOutDate(outTs.date);
        setOutTime(outTs.time);
      } else {
        setOutDate('');
        setOutTime('');
      }
      setError(null);
    }
  }, [entry]);

  const submit = async () => {
    if (!entry) return;
    if (!inDate || !inTime) {
      setError('Enter a punch-in date and time.');
      return;
    }
    const hasOut = Boolean(outDate && outTime);
    if (outDate && !outTime) {
      setError('Enter a punch-out time, or clear it to leave the shift open.');
      return;
    }
    setSaving(true);
    const ok = await onSave(entry, {
      clockIn: { date: inDate, time: inTime },
      clockOut: hasOut ? { date: outDate, time: outTime } : null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit time entry"
      description="Correct the punch times for this work record."
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button icon={<Check size={15} />} loading={saving} onClick={() => void submit()}>
            Save changes
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Punch in — date" type="date" value={inDate} onChange={(e) => setInDate(e.target.value)} />
          <Input label="Punch in — time" type="time" value={inTime} onChange={(e) => setInTime(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Punch out — date" type="date" value={outDate} onChange={(e) => setOutDate(e.target.value)} />
          <Input label="Punch out — time" type="time" value={outTime} onChange={(e) => setOutTime(e.target.value)} />
        </div>
        <p className="text-2xs text-ink-500">
          Leave the punch-out fields empty to keep the shift open (still on the clock).
        </p>
        {error && <p className="text-xs text-error-400">{error}</p>}
      </div>
    </Modal>
  );
}
