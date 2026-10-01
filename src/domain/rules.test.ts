import { describe, expect, it } from "vitest";
import { assessPostal, zoneHealth } from "./coverage";
import { dateOffset, weekday } from "./format";
import { cutoffDecision, isAtRisk } from "./lifecycle";
import { assessProvider } from "./matching";
import { calculateQuote } from "./pricing";
import { canSchedule, findWindowOverlap } from "./scheduling";
import { createSeedState } from "../data/seed";
import type { AppState, Booking, Provider, Service, Zone } from "../types";

const windows = [
  { id: "morning", label: "Morning", start: "09:00", end: "12:00" },
  { id: "afternoon", label: "Afternoon", start: "12:00", end: "15:00" },
  { id: "evening", label: "Evening", start: "15:00", end: "18:00" },
];

function service(partial: Partial<Service> = {}): Service {
  return {
    id: "svc",
    categoryId: "repair",
    name: "Laptop repair",
    summary: "",
    description: "",
    inclusions: [],
    exclusions: [],
    warranty: "",
    cancellationNote: "",
    deviceTypes: ["Laptop"],
    modes: ["onsite", "remote"],
    durationMinutes: 90,
    rating: 4.8,
    reviewCount: 10,
    priceType: "estimate",
    basePrice: 0,
    diagnosticFee: 349,
    laborRatePerHour: 699,
    urgencySurcharge: 249,
    taxRate: 0.18,
    commissionRate: 0.22,
    questions: [],
    ...partial,
  };
}

function zone(partial: Partial<Zone> = {}): Zone {
  return {
    id: "z1",
    cityId: "c1",
    name: "Indiranagar",
    postalCodes: ["560038"],
    travelRadiusKm: 8,
    travelFee: 79,
    open: "09:00",
    close: "18:00",
    leadTimeHours: 2,
    enabledServiceIds: ["svc"],
    enabledModes: ["onsite", "remote"],
    enabledTags: ["field", "remote_desk"],
    ...partial,
  };
}

function provider(partial: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "Asha",
    headline: "",
    skills: ["svc"],
    deviceTypes: ["Laptop"],
    zoneIds: ["z1"],
    modes: ["onsite", "remote"],
    tags: ["field"],
    rating: 4.8,
    status: "active",
    verification: "verified",
    maxJobsPerDay: 2,
    workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "18:00" })),
    timeOff: [],
    acceptingWork: true,
    ...partial,
  };
}

function state(partial: Partial<AppState> = {}): AppState {
  return {
    users: [],
    session: null,
    customers: [],
    cities: [],
    zones: [zone()],
    categories: [],
    services: [service()],
    providers: [provider()],
    areaPrices: [],
    bookings: [],
    blocks: [],
    coverageRequests: [],
    notices: [],
    reviews: [],
    settings: {
      cancellationCutoffHours: 4,
      rescheduleCutoffHours: 4,
      urgencyWithinHours: 6,
      assignmentDeadlineHours: 12,
      travelBufferMinutes: 20,
      windows,
    },
    coverage: { postalCode: "", zoneId: null, status: "idle" },
    ...partial,
  };
}

describe("pricing", () => {
  const now = new Date("2026-09-30T12:00:00");

  it("itemizes an on-site estimate with discount, tax, and payout", () => {
    const quote = calculateQuote({
      service: service(),
      zone: zone(),
      areaPrices: [],
      mode: "onsite",
      partsEstimate: 500,
      discountCode: "care10",
      priority: true,
      now,
      urgencyWithinHours: 6,
    });
    expect(quote.lines.map((line) => [line.id, line.amount])).toEqual([
      ["diagnostic", 349],
      ["labor", 1049],
      ["parts", 500],
      ["travel", 79],
      ["urgency", 249],
      ["discount", -223],
      ["tax", 361],
    ]);
    expect(quote.preTax).toBe(2003);
    expect(quote.total).toBe(2364);
    expect(quote.commission).toBe(441);
    expect(quote.providerPayout).toBe(1562);
    expect(quote.hasEstimate).toBe(true);
    expect(quote.summaryLabel).toBe("Estimated total");
  });

  it("keeps a remote fixed price free of travel and labor lines", () => {
    const quote = calculateQuote({
      service: service({
        priceType: "fixed",
        basePrice: 1000,
        diagnosticFee: 0,
        laborRatePerHour: 0,
        commissionRate: 0.2,
      }),
      zone: zone(),
      areaPrices: [{ zoneId: "z1", serviceId: "svc", basePrice: 800 }],
      mode: "remote",
      partsEstimate: 0,
      discountCode: "NOPE",
      priority: false,
      now,
      urgencyWithinHours: 6,
    });
    expect(quote.lines.find((line) => line.id === "travel")).toBeUndefined();
    expect(quote.lines.find((line) => line.id === "base")?.amount).toBe(800);
    expect(quote.total).toBe(944);
    expect(quote.hasEstimate).toBe(false);
    expect(quote.discountMessage).toMatch(/not active/i);
  });
});

describe("coverage", () => {
  const zones = [zone(), zone({ id: "z2", name: "Hadapsar", postalCodes: ["411028"] })];

  it("distinguishes a bad code, an unknown code, and a covered code", () => {
    expect(assessPostal(zones, "5600").code).toBe("invalid");
    expect(assessPostal(zones, "400001").code).toBe("uncovered");
    expect(assessPostal(zones, "560 038").code).toBe("covered");
  });

  it("flags a zone with no accepting technician", () => {
    expect(zoneHealth([provider({ zoneIds: ["other"] })], zone())).toBe("uncovered");
    expect(zoneHealth([provider()], zone())).toBe("thin");
  });
});

describe("scheduling", () => {
  const future = dateOffset(12);

  it("books one qualified technician and refuses a second job in that window", () => {
    const current = state();
    const first = canSchedule(
      current,
      {
        id: "b1",
        serviceId: "svc",
        zoneId: "z1",
        mode: "onsite",
        deviceType: "Laptop",
        date: future,
        windowId: "morning",
        status: "confirmed",
      },
      new Date(),
    );
    expect(first.ok).toBe(true);

    const booked = state({
      bookings: [
        {
          id: "b1",
          providerId: "p1",
          date: future,
          windowId: "morning",
          status: "assigned",
          serviceId: "svc",
          zoneId: "z1",
          mode: "onsite",
          deviceType: "Laptop",
        } as Booking,
      ],
    });
    const second = canSchedule(
      booked,
      {
        id: "b2",
        serviceId: "svc",
        zoneId: "z1",
        mode: "onsite",
        deviceType: "Laptop",
        date: future,
        windowId: "morning",
        status: "confirmed",
      },
      new Date(),
    );
    expect(second.ok).toBe(false);
    expect(second.code).toBe("capacity");
  });

  it("does not let an unstaffed zone block a different zone", () => {
    const current = state({
      zones: [zone(), zone({ id: "empty", name: "Hadapsar", postalCodes: ["411028"], enabledServiceIds: ["svc"] })],
      bookings: [
        {
          id: "gap",
          date: future,
          windowId: "morning",
          status: "confirmed",
          serviceId: "svc",
          zoneId: "empty",
          mode: "onsite",
          deviceType: "Laptop",
        } as Booking,
      ],
    });
    const decision = canSchedule(
      current,
      {
        id: "ok",
        serviceId: "svc",
        zoneId: "z1",
        mode: "remote",
        deviceType: "Laptop",
        date: future,
        windowId: "afternoon",
        status: "confirmed",
      },
      new Date(),
    );
    expect(decision.ok).toBe(true);
  });

  it("respects blocks, lead time, and closed hours", () => {
    const now = new Date(2026, 9, 5, 11, 0, 0);
    const today = "2026-10-05";
    expect(
      canSchedule(
        state({ blocks: [{ zoneId: "z1", date: future, windowId: "evening" }] }),
        {
          id: "c",
          serviceId: "svc",
          zoneId: "z1",
          mode: "remote",
          deviceType: "Laptop",
          date: future,
          windowId: "evening",
          status: "confirmed",
        },
        now,
      ).code,
    ).toBe("blocked");
    expect(
      canSchedule(
        state(),
        {
          id: "c",
          serviceId: "svc",
          zoneId: "z1",
          mode: "remote",
          deviceType: "Laptop",
          date: today,
          windowId: "morning",
          status: "confirmed",
        },
        now,
      ).code,
    ).toBe("lead_time");
    expect(
      canSchedule(
        state({ zones: [zone({ open: "12:00" })] }),
        {
          id: "c",
          serviceId: "svc",
          zoneId: "z1",
          mode: "remote",
          deviceType: "Laptop",
          date: future,
          windowId: "morning",
          status: "confirmed",
        },
        now,
      ).code,
    ).toBe("hours");
  });

  it("rejects overlapping appointment windows", () => {
    expect(findWindowOverlap([windows[0]!, { id: "mid", label: "Mid", start: "11:00", end: "14:00" }])).toMatch(/overlap/i);
    expect(findWindowOverlap(windows)).toBeNull();
  });
});

describe("matching and cutoff", () => {
  it("explains why a paused technician is not a fit", () => {
    const fit = assessProvider(provider({ status: "paused" }), {
      service: service(),
      zone: zone(),
      mode: "onsite",
      deviceType: "Laptop",
      date: dateOffset(12),
      window: windows[0]!,
      travelBufferMinutes: 20,
    });
    expect(fit.eligible).toBe(false);
    expect(fit.blockers[0]).toMatch(/Paused/);
  });

  it("closes changes inside the cutoff and flags late unassigned work", () => {
    const start = new Date("2026-10-02T09:00:00");
    const now = new Date("2026-10-02T06:30:00");
    expect(cutoffDecision(start, now, 4).allowed).toBe(false);
    expect(cutoffDecision(start, new Date("2026-10-01T12:00:00"), 4).allowed).toBe(true);

    const booking = {
      status: "confirmed",
      date: "2026-10-02",
      windowId: "morning",
      providerId: undefined,
    } as Booking;
    const settings = state().settings;
    expect(isAtRisk(booking, settings, new Date("2026-10-02T08:00:00"))).toBe(true);
    expect(isAtRisk({ ...booking, providerId: "p1", status: "assigned" }, settings, new Date("2026-10-01T08:00:00"))).toBe(false);
  });

  it("keeps the sample marketplace internally bookable", () => {
    const current = createSeedState();
    const now = new Date();
    for (const booking of current.bookings) {
      if (booking.providerId || booking.status === "cancelled" || booking.status === "completed") continue;
      const staffed = current.providers.some(
        (person) =>
          person.zoneIds.includes(booking.zoneId) && person.status === "active" && person.verification === "verified",
      );
      if (!staffed) continue;
      const window = current.settings.windows.find((item) => item.id === booking.windowId);
      expect(window, booking.ref).toBeTruthy();
      expect(weekday(booking.date)).toBeGreaterThanOrEqual(0);
    }
    expect(current.services.length).toBeGreaterThan(7);
    expect(current.zones.some((item) => item.postalCodes.includes("560038"))).toBe(true);
    expect(now).toBeInstanceOf(Date);
  });
});
