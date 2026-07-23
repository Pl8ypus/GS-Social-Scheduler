export const APP_TIME_ZONE = "Europe/Lisbon";
export const APP_TIME_ZONE_LABEL = "Lisbon time";

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const dateTimePartsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const dateTimeDisplayFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: APP_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getParts(date: Date): DateTimeParts {
  const entries = dateTimePartsFormatter
    .formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, Number(part.value)]);
  const parts = Object.fromEntries(entries) as Record<keyof DateTimeParts, number>;

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function timeZoneOffsetMs(date: Date): number {
  const parts = getParts(date);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return localAsUtc - date.getTime();
}

function parseDateTimeInput(value: string): DateTimeParts {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  return { year, month, day, hour, minute, second: 0 };
}

function lisbonDateTimeToDate(value: string): Date {
  const parts = parseDateTimeInput(value);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const firstPass = new Date(localAsUtc - timeZoneOffsetMs(new Date(localAsUtc)));

  return new Date(localAsUtc - timeZoneOffsetMs(firstPass));
}

export function isoToLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const parts = getParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localDateTimeInputToIso(localValue: string): string {
  return lisbonDateTimeToDate(localValue).toISOString();
}

export function isLocalDateTimeInputInFuture(localValue: string): boolean {
  return lisbonDateTimeToDate(localValue).getTime() > Date.now();
}

export function formatScheduledAt(iso: string | null): string {
  if (!iso) return "—";
  return dateTimeDisplayFormatter.format(new Date(iso));
}

export function dateKey(date: Date): string {
  const parts = getParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function plainDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function currentLisbonMonth(): Date {
  const parts = getParts(new Date());
  return new Date(parts.year, parts.month - 1, 1);
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}
