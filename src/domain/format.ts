import type { BookingStatus, TimeWindow } from "../types";

export function money(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function minutesBetween(start: string, end: string): number {
  return parseMinutes(end) - parseMinutes(start);
}

export function formatClock(hhmm: string): string {
  const mins = parseMinutes(hhmm);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return m === 0 ? `${hr} ${suffix}` : `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatWindow(window: TimeWindow): string {
  return `${formatClock(window.start)} – ${formatClock(window.end)}`;
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function toISODate(date: Date): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function dateOffset(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function weekday(iso: string): number {
  return parseDate(iso).getDay();
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function atTime(date: string, hhmm: string): Date {
  const value = parseDate(date);
  const mins = parseMinutes(hhmm);
  value.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return value;
}

export function rangesOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  return parseMinutes(a.start) < parseMinutes(b.end) && parseMinutes(b.start) < parseMinutes(a.end);
}

export function windowFitsHours(open: string, close: string, window: TimeWindow): boolean {
  return parseMinutes(window.start) >= parseMinutes(open) && parseMinutes(window.end) <= parseMinutes(close);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function statusTone(status: BookingStatus): string {
  if (status === "completed") return "ok";
  if (status === "cancelled" || status === "provider_unavailable") return "danger";
  if (
    status === "in_progress" ||
    status === "awaiting_parts" ||
    status === "reschedule_requested" ||
    status === "awaiting_confirmation"
  ) {
    return "warn";
  }
  if (status === "requested" || status === "quoted") return "neutral";
  return "info";
}

export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  const rand =
    cryptoApi && "randomUUID" in cryptoApi
      ? cryptoApi.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function modeLabel(mode: "remote" | "onsite"): string {
  return mode === "remote" ? "Remote" : "On-site";
}

export function tagLabel(tag: "field" | "remote_desk" | "business"): string {
  if (tag === "field") return "On-site technician";
  if (tag === "remote_desk") return "Remote specialist";
  return "Business IT";
}
