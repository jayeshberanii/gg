/** `YYYY-MM-DD` to the desktop's `dd-MM-yyyy` (or another separator, e.g. '/' for CONVERT 103). */
export function formatDate(iso: string, sep = '-'): string {
  const [y, m, d] = iso.split('-');
  return [d, m, y].join(sep);
}

/** Today on this computer as `YYYY-MM-DD` (a DateTimePicker's starting value, Now.Date). */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
