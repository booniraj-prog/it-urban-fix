import type { Booking, BookingStatus, PlatformSettings } from "../types";
import { atTime } from "./format";

export const STATUS_LABEL: Record<BookingStatus, string> = {
  requested: "Requested",
  quoted: "Quoted",
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  assigned: "Assigned",
  en_route: "Provider en route",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  reschedule_requested: "Reschedule requested",
  provider_unavailable: "Provider unavailable",
  awaiting_parts: "Awaiting parts",
};

export const STATUS_ORDER: BookingStatus[] = [
  "requested",
  "quoted",
  "awaiting_confirmation",
  "confirmed",
  "assigned",
  "en_route",
  "in_progress",
  "completed",
];

export const ADMIN_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["quoted", "cancelled"],
  quoted: ["awaiting_confirmation", "confirmed", "cancelled"],
  awaiting_confirmation: ["confirmed", "cancelled"],
  confirmed: ["assigned", "cancelled", "reschedule_requested", "provider_unavailable"],
  assigned: ["en_route", "in_progress", "confirmed", "provider_unavailable", "cancelled", "reschedule_requested"],
  en_route: ["in_progress", "provider_unavailable"],
  in_progress: ["completed", "awaiting_parts"],
  awaiting_parts: ["in_progress", "cancelled"],
  reschedule_requested: ["confirmed", "cancelled"],
  provider_unavailable: ["confirmed", "assigned", "cancelled"],
  completed: [],
  cancelled: [],
};

const CUSTOMER_CANCELLABLE: BookingStatus[] = [
  "requested",
  "quoted",
  "awaiting_confirmation",
  "confirmed",
  "assigned",
  "reschedule_requested",
];

export function windowStart(booking: Pick<Booking, "date" | "windowId">, settings: PlatformSettings): Date | null {
  const window = settings.windows.find((item) => item.id === booking.windowId);
  if (!window) return null;
  return atTime(booking.date, window.start);
}

export function cutoffDecision(
  start: Date | null,
  now: Date,
  cutoffHours: number,
): { allowed: boolean; reason: string } {
  if (!start) return { allowed: false, reason: "This booking has no appointment window." };
  if (start.getTime() <= now.getTime()) {
    return { allowed: false, reason: "This appointment window has already started." };
  }
  const closesAt = start.getTime() - cutoffHours * 60 * 60 * 1000;
  if (now.getTime() > closesAt) {
    return {
      allowed: false,
      reason: `Changes close ${cutoffHours} hours before the window.`,
    };
  }
  return { allowed: true, reason: `Open until ${cutoffHours} hours before the window.` };
}

export function canCustomerCancel(booking: Booking, settings: PlatformSettings, now: Date): { allowed: boolean; reason: string } {
  if (!CUSTOMER_CANCELLABLE.includes(booking.status)) {
    return { allowed: false, reason: "This visit can no longer be cancelled in the app." };
  }
  return cutoffDecision(windowStart(booking, settings), now, settings.cancellationCutoffHours);
}

export function canCustomerReschedule(
  booking: Booking,
  settings: PlatformSettings,
  now: Date,
): { allowed: boolean; reason: string } {
  if (!CUSTOMER_CANCELLABLE.includes(booking.status)) {
    return { allowed: false, reason: "This visit can no longer be rescheduled in the app." };
  }
  return cutoffDecision(windowStart(booking, settings), now, settings.rescheduleCutoffHours);
}

export interface ProviderAction {
  id: string;
  label: string;
  kind: "accept" | "decline" | "status";
  next?: BookingStatus;
}

export function providerActions(booking: Booking): ProviderAction[] {
  if (booking.status === "assigned" && !booking.accepted) {
    return [
      { id: "accept", label: "Accept job", kind: "accept" },
      { id: "decline", label: "Decline", kind: "decline" },
    ];
  }
  if (booking.status === "assigned" && booking.accepted) {
    if (booking.mode === "onsite") {
      return [{ id: "en_route", label: "I’m on the way", kind: "status", next: "en_route" }];
    }
    return [{ id: "start", label: "Start remote session", kind: "status", next: "in_progress" }];
  }
  if (booking.status === "en_route") {
    return [{ id: "start", label: "Start work", kind: "status", next: "in_progress" }];
  }
  if (booking.status === "in_progress") {
    return [
      { id: "parts", label: "Waiting on parts", kind: "status", next: "awaiting_parts" },
      { id: "done", label: "Mark complete", kind: "status", next: "completed" },
    ];
  }
  if (booking.status === "awaiting_parts") {
    return [{ id: "resume", label: "Resume work", kind: "status", next: "in_progress" }];
  }
  return [];
}

export function isOpenStatus(status: BookingStatus): boolean {
  return status !== "cancelled" && status !== "completed";
}

export function isAtRisk(booking: Booking, settings: PlatformSettings, now: Date): boolean {
  const needsOwner =
    !booking.providerId &&
    (booking.status === "confirmed" ||
      booking.status === "provider_unavailable" ||
      booking.status === "reschedule_requested");
  if (!needsOwner) return false;
  const start = windowStart(booking, settings);
  if (!start) return false;
  const hours = (start.getTime() - now.getTime()) / (60 * 60 * 1000);
  if (hours < 0) return true;
  return hours <= settings.assignmentDeadlineHours;
}
