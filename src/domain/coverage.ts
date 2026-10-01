import type { Provider, Service, Zone } from "../types";

export function normalizePostal(input: string): string {
  return input.replace(/\s+/g, "");
}

export function isPostalShape(input: string): boolean {
  return /^\d{6}$/.test(normalizePostal(input));
}

export function findZoneByPostal(zones: Zone[], postal: string): Zone | undefined {
  const code = normalizePostal(postal);
  return zones.find((zone) => zone.postalCodes.includes(code));
}

export type PostalAssessment =
  | { ok: false; code: "invalid"; message: string }
  | { ok: false; code: "uncovered"; postal: string; message: string }
  | { ok: true; code: "covered"; zone: Zone; message: string };

export function assessPostal(zones: Zone[], postal: string): PostalAssessment {
  const code = normalizePostal(postal);
  if (!isPostalShape(code)) {
    return { ok: false, code: "invalid", message: "Enter a 6-digit postal code." };
  }
  const zone = findZoneByPostal(zones, code);
  if (!zone) {
    return {
      ok: false,
      code: "uncovered",
      postal: code,
      message: `TechCare does not cover ${code} yet. You can ask operations to review it.`,
    };
  }
  return {
    ok: true,
    code: "covered",
    zone,
    message: `${code} is in ${zone.name}.`,
  };
}

export function serviceEnabled(zone: Zone, serviceId: string): boolean {
  return zone.enabledServiceIds.includes(serviceId);
}

export type ZoneHealth = "ok" | "thin" | "uncovered";

export function zoneHealth(providers: Provider[], zone: Zone): ZoneHealth {
  const active = providers.filter(
    (provider) =>
      provider.zoneIds.includes(zone.id) &&
      provider.status === "active" &&
      provider.verification === "verified" &&
      provider.acceptingWork,
  );
  if (active.length === 0) return "uncovered";
  if (active.length === 1) return "thin";
  return "ok";
}

export function coverageMessage(service: Service, zone: Zone, health: ZoneHealth): string | null {
  if (!serviceEnabled(zone, service.id)) {
    return `${service.name} is not offered in ${zone.name}.`;
  }
  if (!service.modes.some((mode) => zone.enabledModes.includes(mode))) {
    return `${zone.name} is not staffed for the visit types this service uses.`;
  }
  if (service.requiredTag && !zone.enabledTags.includes(service.requiredTag)) {
    return `${zone.name} does not enable the technician type this service needs.`;
  }
  if (health === "uncovered") {
    return `${zone.name} is on the map of service zones, but no verified technician is accepting work there.`;
  }
  return null;
}
