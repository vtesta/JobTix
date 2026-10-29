export const APP_LOCALE = 'en-US';

export function formatTime12h(value: string): string {
  if (!value) return '';
  const [hStr, mStr] = value.split(':');
  const h = Number(hStr);
  const m = mStr ?? '00';
  if (Number.isNaN(h)) return value;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m} ${period}`;
}

export function formatHours12h(value: string): string {
  if (!value) return '';
  return formatTime12h(value);
}

export function timeTo24h(display: string): string {
  const trimmed = display.trim().toUpperCase();
  const match = trimmed.match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/);
  if (!match) return '';
  let h = Number(match[1]);
  const m = match[2] ?? '00';
  const period = match[3];
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(APP_LOCALE, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(APP_LOCALE, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(APP_LOCALE, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function startOfWeek(ref = new Date(), weekStartDay = 0): string {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - weekStartDay + 7) % 7));
  return d.toISOString().slice(0, 10);
}

export function hoursBetween(clockIn: string, clockOut: string | null): number {
  const start = new Date(clockIn).getTime();
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return (end - start) / 3_600_000;
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0 && m === 0) return '0h';
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
