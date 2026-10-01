import type { AreaPrice, Quote, QuoteInput, QuoteLine, Service, Zone } from "../types";
import { money } from "./format";

export function findAreaPrice(
  areaPrices: AreaPrice[],
  zoneId: string | undefined,
  serviceId: string,
): AreaPrice | undefined {
  if (!zoneId) return undefined;
  return areaPrices.find((price) => price.zoneId === zoneId && price.serviceId === serviceId);
}

export function calculateQuote(input: QuoteInput): Quote {
  const { service, zone } = input;
  const override = findAreaPrice(input.areaPrices, zone?.id, service.id);
  const lines: QuoteLine[] = [];
  const base = override?.basePrice ?? service.basePrice;

  if (base > 0) {
    lines.push({
      id: "base",
      label: "Base service",
      amount: base,
      kind: service.priceType === "fixed" ? "fixed" : "estimate",
      detail:
        service.priceType === "fixed"
          ? `Includes labor for about ${service.durationMinutes} minutes`
          : "Starting price, confirmed after diagnosis",
    });
  }

  if (service.diagnosticFee > 0) {
    lines.push({
      id: "diagnostic",
      label: "Diagnostic fee",
      amount: service.diagnosticFee,
      kind: "fixed",
      detail:
        service.priceType === "estimate"
          ? "Fixed visit fee. Ask the technician how it applies if you continue."
          : "Assessment included with the visit",
    });
  }

  if (service.priceType === "estimate" && service.laborRatePerHour > 0) {
    const labor = Math.round((service.durationMinutes / 60) * service.laborRatePerHour);
    lines.push({
      id: "labor",
      label: "Labor",
      amount: labor,
      kind: "estimate",
      detail: `About ${service.durationMinutes} minutes at ${money(service.laborRatePerHour)}/hour`,
    });
  }

  const parts = Number.isFinite(input.partsEstimate) ? Math.max(0, Math.round(input.partsEstimate)) : 0;
  if (parts > 0) {
    lines.push({
      id: "parts",
      label: "Parts",
      amount: parts,
      kind: "estimate",
      detail: "Your allowance. The technician confirms parts before fitting them.",
    });
  }

  if (input.mode === "onsite") {
    const travel = override?.travelFee ?? zone?.travelFee ?? 0;
    lines.push({
      id: "travel",
      label: "Travel fee",
      amount: travel,
      kind: "fixed",
      detail: zone ? `${zone.name} · ${zone.travelRadiusKm} km coverage radius` : "On-site visit",
    });
  }

  const urgent = isUrgent(input);
  if (urgent && service.urgencySurcharge > 0) {
    lines.push({
      id: "urgency",
      label: "Priority surcharge",
      amount: service.urgencySurcharge,
      kind: "fixed",
      detail: input.priority
        ? "Added because priority was requested"
        : `Added because the window starts within ${input.urgencyWithinHours} hours`,
    });
  }

  const chargeSum = lines.reduce((sum, line) => sum + line.amount, 0);
  const code = input.discountCode.trim().toUpperCase();
  let discount = 0;
  let discountMessage: string | undefined;
  if (code) {
    if (code === "CARE10") {
      discount = Math.round(chargeSum * 0.1);
      lines.push({
        id: "discount",
        label: "Discount CARE10",
        amount: -discount,
        kind: "discount",
        detail: "10% off pre-tax charges",
      });
    } else {
      discountMessage = "That code is not active. No discount was applied.";
    }
  }

  const preTax = chargeSum - discount;
  const tax = Math.round(preTax * service.taxRate);
  lines.push({
    id: "tax",
    label: `GST (${Math.round(service.taxRate * 100)}%)`,
    amount: tax,
    kind: "tax",
  });

  const estimatedPortion = lines
    .filter((line) => line.kind === "estimate")
    .reduce((sum, line) => sum + line.amount, 0);
  const fixedCharges = lines
    .filter((line) => line.kind === "fixed")
    .reduce((sum, line) => sum + line.amount, 0);
  const hasEstimate = estimatedPortion > 0 || service.priceType === "estimate";
  const total = preTax + tax;
  const commission = Math.round(preTax * service.commissionRate);

  return {
    priceType: hasEstimate ? "estimate" : "fixed",
    lines,
    preTax,
    discount,
    tax,
    total,
    fixedPortion: fixedCharges,
    estimatedPortion,
    commission,
    providerPayout: preTax - commission,
    hasEstimate,
    discountMessage,
    summaryLabel: hasEstimate ? "Estimated total" : "Fixed total",
    disclaimer: hasEstimate
      ? "Diagnostic, travel, and priority fees are fixed. Labor, parts, and any starting repair price can change after the technician diagnoses the device."
      : "This price is fixed for the booked service. Parts are estimated separately and are only included when a parts line is shown.",
  };
}

function isUrgent(input: QuoteInput): boolean {
  if (input.priority) return true;
  if (!input.slotStartsAt) return false;
  const delta = input.slotStartsAt.getTime() - input.now.getTime();
  return delta > 0 && delta <= input.urgencyWithinHours * 60 * 60 * 1000;
}

export function previewCardQuote(
  service: Service,
  zone: Zone | null,
  areaPrices: AreaPrice[],
  now: Date,
  urgencyWithinHours: number,
): Quote {
  const mode = service.modes.includes("remote") ? "remote" : "onsite";
  return calculateQuote({
    service,
    zone,
    areaPrices,
    mode,
    partsEstimate: 0,
    discountCode: "",
    priority: false,
    slotStartsAt: null,
    now,
    urgencyWithinHours,
  });
}
