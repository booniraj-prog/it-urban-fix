import type { AppState, Booking, Provider, Service, TimeWindow, VisitMode, Zone } from "../types";
import { minutesBetween, weekday, windowFitsHours } from "./format";

export interface JobContext {
  service: Service;
  zone: Zone;
  mode: VisitMode;
  deviceType: string;
  date: string;
  window: TimeWindow;
  travelBufferMinutes: number;
}

export interface ProviderFit {
  provider: Provider;
  eligible: boolean;
  score: number;
  reasons: string[];
  blockers: string[];
}

export function assessProvider(provider: Provider, ctx: JobContext, jobsThatDay = 0): ProviderFit {
  const blockers: string[] = [];
  const reasons: string[] = [];

  if (provider.status === "paused") blockers.push("Paused by operations");
  else if (provider.status === "suspended") blockers.push("Suspended");
  else reasons.push("Active");

  if (!provider.acceptingWork) blockers.push("Not accepting new jobs");
  if (provider.verification !== "verified") blockers.push("Verification is not complete");
  else reasons.push("Verified");

  if (!provider.skills.includes(ctx.service.id)) blockers.push(`Does not offer ${ctx.service.name}`);
  else reasons.push(`Offers ${ctx.service.name}`);

  if (ctx.service.requiredTag && !provider.tags.includes(ctx.service.requiredTag)) {
    blockers.push("Missing the technician type this service requires");
  }

  if (!provider.zoneIds.includes(ctx.zone.id)) blockers.push(`Outside ${ctx.zone.name}`);
  else reasons.push(`Covers ${ctx.zone.name}`);

  if (!provider.modes.includes(ctx.mode)) {
    blockers.push(ctx.mode === "remote" ? "Does not take remote sessions" : "Does not take on-site visits");
  } else {
    reasons.push(ctx.mode === "remote" ? "Remote capable" : "On-site capable");
  }

  if (provider.deviceTypes.length > 0 && !provider.deviceTypes.includes(ctx.deviceType)) {
    blockers.push(`Does not support ${ctx.deviceType}`);
  }

  if (provider.timeOff.includes(ctx.date)) blockers.push("Away on this date");

  const day = weekday(ctx.date);
  const hours = provider.workingHours.find((item) => item.day === day);
  if (!hours) blockers.push("Not scheduled to work that day");
  else if (!windowFitsHours(hours.start, hours.end, ctx.window)) {
    blockers.push("Shift does not cover this window");
  } else {
    reasons.push("Shift covers this window");
  }

  const needed =
    ctx.mode === "onsite" ? ctx.service.durationMinutes + ctx.travelBufferMinutes : ctx.service.durationMinutes;
  if (minutesBetween(ctx.window.start, ctx.window.end) < needed) {
    blockers.push("Visit is longer than this window allows");
  }

  if (!ctx.zone.enabledServiceIds.includes(ctx.service.id)) {
    blockers.push(`${ctx.zone.name} does not offer this service`);
  }
  if (!ctx.zone.enabledModes.includes(ctx.mode)) {
    blockers.push(`${ctx.zone.name} does not enable this visit type`);
  }
  if (ctx.service.requiredTag && !ctx.zone.enabledTags.includes(ctx.service.requiredTag)) {
    blockers.push(`${ctx.zone.name} does not enable this technician type`);
  }

  reasons.push(`Rating ${provider.rating.toFixed(1)}`);
  reasons.push(jobsThatDay === 0 ? "No other assigned jobs that day" : `${jobsThatDay} assigned job${jobsThatDay === 1 ? "" : "s"} that day`);

  let score = provider.rating * 20 + 8;
  score -= jobsThatDay * 6;
  if (provider.modes.length === 1 && provider.modes[0] === ctx.mode) score += 4;

  return {
    provider,
    eligible: blockers.length === 0,
    score,
    reasons,
    blockers,
  };
}

export function jobWarnings(state: AppState, booking: Booking, provider: Provider): string[] {
  const service = state.services.find((item) => item.id === booking.serviceId);
  const zone = state.zones.find((item) => item.id === booking.zoneId);
  const window = state.settings.windows.find((item) => item.id === booking.windowId);
  if (!service || !zone || !window) return ["Booking details are incomplete."];
  const fit = assessProvider(
    provider,
    {
      service,
      zone,
      mode: booking.mode,
      deviceType: booking.deviceType,
      date: booking.date,
      window,
      travelBufferMinutes: state.settings.travelBufferMinutes,
    },
    0,
  );
  return fit.blockers;
}
