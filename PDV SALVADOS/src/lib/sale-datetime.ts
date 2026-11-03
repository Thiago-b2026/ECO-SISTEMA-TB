const pad = (value: number) => String(value).padStart(2, "0");

export const SALE_TIME_ZONE = "America/Sao_Paulo";
export const SALE_UTC_OFFSET = "-03:00";

const saleDatePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SALE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const saleDateLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SALE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const saleDateTimeLabelFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SALE_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function normalizeDateParts(date: string) {
  const trimmed = date.trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split("/").map(Number);
    return { year, month, day };
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  return { year, month, day };
}

function normalizeTimeParts(time?: string) {
  const trimmed = (time ?? "").trim();

  if (!trimmed) return { hour: 0, minute: 0, second: 0 };

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return { hour: 0, minute: 0, second: 0 };

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] ?? 0),
  };
}

function getSaleDateTimeParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  const parts = saleDatePartsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    second: Number(read("second")),
  };
}

function toSaleOffsetIso(date: string, time = "00:00:00") {
  const { year, month, day } = normalizeDateParts(date);
  const { hour, minute, second } = normalizeTimeParts(time);

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${SALE_UTC_OFFSET}`;
}

export function formatLocalDateInput(value: string | Date = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  const parts = getSaleDateTimeParts(value);

  if (!parts) {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function localDateRangeToIso(date: string) {
  const start = new Date(toSaleOffsetIso(date, "00:00:00"));
  const end = new Date(toSaleOffsetIso(date, "23:59:59"));

  return {
    start: start.toISOString(),
    end: new Date(end.getTime() + 999).toISOString(),
  };
}

export function localDateTimeToIso(dateTime: string, fallback = new Date()) {
  if (!dateTime) return fallback.toISOString();

  const [datePart, timePart = "00:00"] = dateTime.split("T");
  return saleDateTimePartsToIso(datePart, timePart, fallback);
}

export function saleDateTimePartsToIso(date: string, time?: string, fallback = new Date()) {
  if (!date?.trim()) return fallback.toISOString();

  const parsed = new Date(toSaleOffsetIso(date, time));

  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString();
}

export function formatSaleDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : saleDateLabelFormatter.format(date);
}

export function formatSaleDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : saleDateTimeLabelFormatter.format(date);
}

export function getSaleDateKey(value: string | Date) {
  return formatSaleDateOnly(value);
}

export function getSaleHour(value: string | Date) {
  const parts = getSaleDateTimeParts(value);
  return parts?.hour ?? 0;
}

export function sortBySaleDateDesc<T extends { data_venda?: string | null; numero?: number | null }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const timeDiff = new Date(b.data_venda ?? 0).getTime() - new Date(a.data_venda ?? 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return Number(b.numero ?? 0) - Number(a.numero ?? 0);
  });
}

export function sortBySaleDateAsc<T extends { data_venda?: string | null; numero?: number | null }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const timeDiff = new Date(a.data_venda ?? 0).getTime() - new Date(b.data_venda ?? 0).getTime();
    if (timeDiff !== 0) return timeDiff;
    return Number(a.numero ?? 0) - Number(b.numero ?? 0);
  });
}