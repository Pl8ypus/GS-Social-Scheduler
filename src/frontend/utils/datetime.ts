export function isoToLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeInputToIso(localValue: string): string {
  return new Date(localValue).toISOString();
}

export function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}
