import type { AppState, Booking, PlatformSettings, ScheduleDecision, Service, SlotDemand, TimeWindow, VisitMode, Zone } from "../types";
import { addDays, atTime, minutesBetween, rangesOverlap, todayISO, windowFitsHours } from "./format";
import { isOpenStatus, windowStart } from "./lifecycle";
import { assessProvider, type ProviderFit } from "./matching";

export interface SlotOption {
  date: string;
  window: TimeWindow;
  decision: ScheduleDecision;
}

function demandFromBooking(booking: Booking): SlotDemand {
  return {
    id: booking.id,
    serviceId: booking.serviceId,
    zoneId: booking.zoneId,
    mode: booking.mode,
    deviceType: booking.deviceType,
    date: booking.date,
    windowId: booking.windowId,
    providerId: booking.providerId,
    status: booking.status,
  };
}

function findService(state: AppState, id: string): Service | undefined {
  return state.services.find((service) => service.id === id);
}

function findZone(state: AppState, id: string): Zone | undefined {
  return state.zones.find((zone) => zone.id === id);
}

function contextFor(state: AppState, demand: SlotDemand): { service: Service; zone: Zone; window: TimeWindow } | null {
  const service = findService(state, demand.serviceId);
  const zone = findZone(state, demand.zoneId);
  const window = state.settings.windows.find((item) => item.id === demand.windowId);
  if (!service || !zone || !window) return null;
  return { service, zone, window };
}

export function eligibleFits(state: AppState, demand: SlotDemand): ProviderFit[] {
  const ctx = contextFor(state, demand);
  if (!ctx) return [];
  return state.providers.map((provider) =>
    assessProvider(provider, {
      service: ctx.service,
      zone: ctx.zone,
      mode: demand.mode,
      deviceType: demand.deviceType,
      date: demand.date,
      window: ctx.window,
      travelBufferMinutes: state.settings.travelBufferMinutes,
    }, assignedJobsOnDate(state, provider.id, demand.date, demand.id)),
  );
}

function assignedJobsOnDate(state: AppState, providerId: string, date: string, ignoreId?: string): number {
  return state.bookings.filter(
    (booking) =>
      booking.id !== ignoreId &&
      booking.providerId === providerId &&
      booking.date === date &&
      isOpenStatus(booking.status),
  ).length;
}

function summarize(fits: ProviderFit[]): string {
  if (fits.length === 0) return "No technicians are set up for this area yet.";
  const counts = new Map<string, number>();
  for (const fit of fits) {
    const key = fit.blockers[0] ?? "Unavailable";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? "No technician is available.";
}

function gate(state: AppState, demand: SlotDemand, now: Date): ScheduleDecision | null {
  const ctx = contextFor(state, demand);
  if (!ctx) return { ok: false, code: "coverage", reason: "The service or area could not be found." };
  const { service, zone, window } = ctx;
  if (!zone.enabledServiceIds.includes(service.id)) {
    return { ok: false, code: "coverage", reason: `${service.name} is not offered in ${zone.name}.` };
  }
  if (!zone.enabledModes.includes(demand.mode)) {
    return {
      ok: false,
      code: "coverage",
      reason: `${demand.mode === "remote" ? "Remote" : "On-site"} visits are not offered in ${zone.name}.`,
    };
  }
  if (service.requiredTag && !zone.enabledTags.includes(service.requiredTag)) {
    return { ok: false, code: "coverage", reason: `${zone.name} does not enable the technician type for this service.` };
  }
  if (state.blocks.some((block) => block.zoneId === zone.id && block.date === demand.date && block.windowId === window.id)) {
    return { ok: false, code: "blocked", reason: "Operations has closed this window." };
  }
  if (!windowFitsHours(zone.open, zone.close, window)) {
    return { ok: false, code: "hours", reason: `Outside ${zone.name} operating hours (${zone.open}–${zone.close}).` };
  }
  const needed = demand.mode === "onsite" ? service.durationMinutes + state.settings.travelBufferMinutes : service.durationMinutes;
  if (minutesBetween(window.start, window.end) < needed) {
    return { ok: false, code: "duration", reason: "This window is shorter than the visit and travel buffer." };
  }
  const start = atTime(demand.date, window.start);
  if (start.getTime() < now.getTime() + zone.leadTimeHours * 60 * 60 * 1000) {
    return {
      ok: false,
      code: "lead_time",
      reason: `Bookings in ${zone.name} need ${zone.leadTimeHours} hours’ notice.`,
    };
  }
  return null;
}

interface Usage {
  windows: string[];
  count: number;
}

function dayDemands(state: AppState, date: string, extra: SlotDemand | null, ignoreIds: string[]): SlotDemand[] {
  const existing = state.bookings
    .filter((booking) => booking.date === date && isOpenStatus(booking.status) && !ignoreIds.includes(booking.id))
    .map(demandFromBooking);
  return extra ? [...existing.filter((item) => item.id !== extra.id), extra] : existing;
}

export function dayIsFeasible(state: AppState, demands: SlotDemand[]): boolean {
  const pinned: SlotDemand[] = [];
  const open: SlotDemand[] = [];
  for (const demand of demands) {
    if (demand.providerId) pinned.push(demand);
    else if (eligibleFits(state, demand).some((fit) => fit.eligible)) open.push(demand);
  }

  const usage = new Map<string, Usage>();
  const take = (providerId: string, windowId: string): boolean => {
    const provider = state.providers.find((item) => item.id === providerId);
    if (!provider) return false;
    const current = usage.get(providerId) ?? { windows: [], count: 0 };
    if (current.windows.some((id) => overlaps(state.settings, id, windowId))) return false;
    if (current.count >= provider.maxJobsPerDay) return false;
    usage.set(providerId, { windows: [...current.windows, windowId], count: current.count + 1 });
    return true;
  };

  for (const demand of pinned) {
    if (!demand.providerId || !take(demand.providerId, demand.windowId)) return false;
  }

  const ordered = [...open].sort(
    (a, b) => eligibleFits(state, a).filter((fit) => fit.eligible).length - eligibleFits(state, b).filter((fit) => fit.eligible).length,
  );

  const search = (index: number): boolean => {
    if (index >= ordered.length) return true;
    const demand = ordered[index];
    if (!demand) return true;
    const options = eligibleFits(state, demand)
      .filter((fit) => fit.eligible)
      .sort((a, b) => b.score - a.score);
    for (const fit of options) {
      const snapshot = new Map(usage);
      if (!take(fit.provider.id, demand.windowId)) continue;
      if (search(index + 1)) return true;
      usage.clear();
      snapshot.forEach((value, key) => usage.set(key, value));
    }
    return false;
  };

  return search(0);
}

function overlaps(settings: PlatformSettings, leftId: string, rightId: string): boolean {
  const left = settings.windows.find((window) => window.id === leftId);
  const right = settings.windows.find((window) => window.id === rightId);
  if (!left || !right) return true;
  return rangesOverlap(left, right);
}

export function canSchedule(
  state: AppState,
  demand: SlotDemand,
  now: Date,
  ignoreIds: string[] = [],
): ScheduleDecision {
  const blocked = gate(state, demand, now);
  if (blocked) return blocked;
  const fits = eligibleFits(state, demand);
  if (!fits.some((fit) => fit.eligible)) {
    return { ok: false, code: "no_providers", reason: summarize(fits) };
  }
  const demands = dayDemands(state, demand.date, demand, ignoreIds);
  if (!dayIsFeasible(state, demands)) {
    return {
      ok: false,
      code: "capacity",
      reason: "Technicians who can take this visit are already booked for that window.",
    };
  }
  return { ok: true, code: "ok", reason: "A qualified technician is free in this window." };
}

export function listSlots(
  state: AppState,
  input: { serviceId: string; zoneId: string; mode: VisitMode; deviceType: string },
  now: Date,
  days = 10,
): SlotOption[] {
  const start = todayISO(now);
  const options: SlotOption[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(start, offset);
    for (const window of state.settings.windows) {
      const demand: SlotDemand = {
        id: "candidate",
        serviceId: input.serviceId,
        zoneId: input.zoneId,
        mode: input.mode,
        deviceType: input.deviceType || "Laptop",
        date,
        windowId: window.id,
        status: "confirmed",
      };
      options.push({ date, window, decision: canSchedule(state, demand, now) });
    }
  }
  return options;
}

export function nextOpenSlot(options: SlotOption[]): SlotOption | undefined {
  return options.find((option) => option.decision.ok);
}

export function recommendProviders(state: AppState, booking: Booking, now: Date): ProviderFit[] {
  const demand = demandFromBooking(booking);
  const started = windowStart(booking, state.settings);
  const windowPassed = Boolean(started && started.getTime() < now.getTime());
  return state.providers
    .map((provider) => {
      const fit = eligibleFits(state, demand).find((item) => item.provider.id === provider.id);
      if (!fit) {
        return {
          provider,
          eligible: false,
          score: 0,
          reasons: [],
          blockers: ["Technician record is incomplete"],
        };
      }
      const blockers = [...fit.blockers];
      if (windowPassed) blockers.push("That appointment window has already started");
      const clash = state.bookings.some(
        (other) =>
          other.id !== booking.id &&
          other.providerId === provider.id &&
          other.date === booking.date &&
          isOpenStatus(other.status) &&
          overlaps(state.settings, other.windowId, booking.windowId),
      );
      if (clash) blockers.push("Already booked in this window");
      const jobs = assignedJobsOnDate(state, provider.id, booking.date, booking.id);
      if (jobs >= provider.maxJobsPerDay) blockers.push("At the daily job limit");
      const eligible = blockers.length === 0;
      let assignable = eligible;
      if (eligible) {
        const simulated = state.bookings.map((item) =>
          item.id === booking.id ? { ...item, providerId: provider.id, status: "assigned" as const } : item,
        );
        assignable = dayIsFeasible({ ...state, bookings: simulated }, dayDemands({ ...state, bookings: simulated }, booking.date, null, []));
        if (!assignable) blockers.push("Needed for another open job in this window");
      }
      return {
        ...fit,
        eligible: eligible && assignable,
        blockers,
      };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
}

export function canAssign(state: AppState, booking: Booking, providerId: string, now: Date): { ok: boolean; message: string } {
  const start = windowStart(booking, state.settings);
  if (start && start.getTime() < now.getTime()) {
    return { ok: false, message: "That appointment window has already started." };
  }
  const fit = recommendProviders(state, booking, now).find((item) => item.provider.id === providerId);
  if (!fit) return { ok: false, message: "That technician could not be found." };
  if (!fit.eligible) return { ok: false, message: fit.blockers[0] ?? "That technician is not available." };
  return { ok: true, message: fit.reasons.slice(0, 3).join(" · ") };
}

export function findWindowOverlap(windows: TimeWindow[]): string | null {
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const left = windows[i];
      const right = windows[j];
      if (left && right && rangesOverlap(left, right)) {
        return `${left.label} overlaps ${right.label}. Windows must not overlap, or one technician could be double-booked.`;
      }
    }
  }
  return null;
}

export function blockImpact(state: AppState, zoneId: string, date: string, windowId: string): string {
  const zone = findZone(state, zoneId);
  const window = state.settings.windows.find((item) => item.id === windowId);
  const existing = state.bookings.filter(
    (booking) =>
      booking.zoneId === zoneId &&
      booking.date === date &&
      booking.windowId === windowId &&
      isOpenStatus(booking.status),
  );
  const place = zone && window ? `${window.label} in ${zone.name}` : "this window";
  if (existing.length === 0) {
    return `Closing ${place} stops new bookings. No visit is currently booked there.`;
  }
  return `Closing ${place} stops new bookings. ${existing.length} existing visit${existing.length === 1 ? "" : "s"} stay on the schedule until someone moves them.`;
}
