/* Timekeeping helpers for the TradeDesk timeclock:
   Monday-start work week, live-shift detection, and range totals. */

export function getWorkWeekStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 5);
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
}

export function isThisWorkWeek(dateStr: string): boolean {
  return new Date(dateStr) >= getWorkWeekStart();
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowTimeInput(): string {
  return new Date().toTimeString().slice(0, 5);
}

export function entryHours(clockIn: string, clockOut: string | null): number {
  const end = clockOut ? new Date(clockOut).getTime() : Date.now();
  return (end - new Date(clockIn).getTime()) / 3_600_000;
}

export function formatTimeOfDay(value: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function formatDayLabel(value: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
}

export function monthStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function toIsoTimestamp(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}`).toISOString();
}

export function hoursForDateRange(
  entries: { clock_in: string; clock_out: string | null }[],
  startIso: string,
  endIso: string,
): number {
  const rs = new Date(`${startIso}T00:00:00`).getTime();
  const re = new Date(`${endIso}T23:59:59.999`).getTime();
  return entries
    .filter((e) => {
      const ci = new Date(e.clock_in).getTime();
      return ci >= rs && ci <= re;
    })
    .reduce((sum, e) => sum + entryHours(e.clock_in, e.clock_out), 0);
}
