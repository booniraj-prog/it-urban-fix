import type { AppState, Booking } from "../types";
import { addDays, todayISO } from "./format";

export interface OpsFilter {
  when: "all" | "today" | "tomorrow" | "week";
  cityId: string;
  zoneId: string;
  categoryId: string;
  providerId: string;
  status: string;
}

export const emptyOpsFilter: OpsFilter = {
  when: "all",
  cityId: "",
  zoneId: "",
  categoryId: "",
  providerId: "",
  status: "",
};

export function filterBookings(state: AppState, filter: OpsFilter, now = new Date()): Booking[] {
  const today = todayISO(now);
  return state.bookings.filter((booking) => {
    if (filter.status && booking.status !== filter.status) return false;
    if (filter.zoneId && booking.zoneId !== filter.zoneId) return false;
    if (filter.providerId && booking.providerId !== filter.providerId) return false;
    if (filter.cityId) {
      const zone = state.zones.find((item) => item.id === booking.zoneId);
      if (!zone || zone.cityId !== filter.cityId) return false;
    }
    if (filter.categoryId) {
      const service = state.services.find((item) => item.id === booking.serviceId);
      if (!service || service.categoryId !== filter.categoryId) return false;
    }
    if (filter.when === "today" && booking.date !== today) return false;
    if (filter.when === "tomorrow" && booking.date !== addDays(today, 1)) return false;
    if (filter.when === "week") {
      const end = addDays(today, 6);
      if (booking.date < today || booking.date > end) return false;
    }
    return true;
  });
}
