import { assessPostal, coverageMessage, isPostalShape, normalizePostal, serviceEnabled, zoneHealth } from "../domain/coverage";
import { atTime, createId, modeLabel, weekday, windowFitsHours } from "../domain/format";
import { ADMIN_TRANSITIONS, STATUS_LABEL, canCustomerCancel, canCustomerReschedule, windowStart } from "../domain/lifecycle";
import { jobWarnings } from "../domain/matching";
import { calculateQuote } from "../domain/pricing";
import { canAssign, canSchedule, findWindowOverlap } from "../domain/scheduling";
import { lockedPermissions } from "../domain/roles";
import { authorizePayment } from "../integrations/mocks";
import type {
  Actor,
  Address,
  AppState,
  AreaPrice,
  Booking,
  BookingStatus,
  Category,
  City,
  CoverageRequest,
  Notice,
  AccessRole,
  GoogleIdentity,
  Provider,
  Role,
  Service,
  Session,
  SlotDemand,
  TimelineEvent,
  VisitMode,
  WorkingHours,
  Zone,
} from "../types";

export interface Result {
  ok: boolean;
  message: string;
  bookingId?: string;
}

export interface Out {
  state: AppState;
  result: Result;
}

function pass(state: AppState, message: string, bookingId?: string): Out {
  return { state, result: { ok: true, message, bookingId } };
}

function stop(state: AppState, message: string): Out {
  return { state, result: { ok: false, message } };
}

function actorOf(session: Session): Actor {
  return { role: session.role, name: session.name };
}

function stamp(status: BookingStatus, title: string, actor: Actor, detail?: string): TimelineEvent {
  return { id: createId("evt"), at: new Date().toISOString(), status, title, detail, actor };
}

function notice(userId: string, title: string, body: string, bookingId?: string): Notice {
  return { id: createId("ntc"), userId, title, body, bookingId, createdAt: new Date().toISOString(), read: false };
}

function withNotices(state: AppState, items: Notice[]): AppState {
  return { ...state, notices: [...items, ...state.notices] };
}

function admins(state: AppState): string[] {
  return state.users.filter((user) => user.role === "admin").map((user) => user.id);
}

function providerUser(state: AppState, providerId: string): string | undefined {
  return state.users.find((user) => user.providerId === providerId)?.id;
}

function customerUser(state: AppState, customerId: string): string | undefined {
  return state.users.find((user) => user.customerId === customerId)?.id;
}

function replaceBooking(state: AppState, booking: Booking): AppState {
  return { ...state, bookings: state.bookings.map((item) => (item.id === booking.id ? booking : item)) };
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function nextRef(state: AppState): string {
  const nums = state.bookings.map((booking) => Number(booking.ref.replace(/\D/g, ""))).filter((num) => Number.isFinite(num));
  return `TC-${Math.max(2415, ...nums) + 1}`;
}

function inactiveRoleMessage(state: AppState, role: Role): string | null {
  const record = (state.accessRoles ?? []).find((item) => item.systemKey === role);
  if (record?.status !== "inactive") return null;
  return `${record.name} is inactive. An administrator must reactivate it before this account can sign in.`;
}

function sessionFor(user: AppState["users"][number]): Session {
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    customerId: user.customerId,
    providerId: user.providerId,
  };
}

export function signIn(state: AppState, email: string, password: string, expected?: Role): Out {
  const user = state.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || user.password !== password) return stop(state, "Those demo credentials were not recognized.");
  const inactive = inactiveRoleMessage(state, user.role);
  if (inactive) return stop(state, inactive);
  if (expected && user.role !== expected) {
    const wanted = (state.accessRoles ?? []).find((role) => role.systemKey === user.role)?.name ?? user.role;
    return stop(state, `This demo account belongs to ${wanted}. Choose that role and try again.`);
  }
  return pass({ ...state, session: sessionFor(user) }, `Signed in as ${user.name}.`);
}

export function signInWithGoogle(state: AppState, identity: GoogleIdentity): Out {
  const email = identity.email.trim().toLowerCase();
  const name = identity.name.trim() || email;
  if (!identity.sub || !email.includes("@")) return stop(state, "Google did not return a usable account.");
  const linked = state.users.find((user) => user.googleSub === identity.sub);
  const byEmail = state.users.find((user) => user.email.toLowerCase() === email || user.googleEmail === email);
  if (linked && byEmail && linked.id !== byEmail.id) {
    return stop(state, "That Google account does not match the email already on file.");
  }
  const user = linked ?? byEmail;
  if (user?.googleSub && user.googleSub !== identity.sub) {
    return stop(state, "This account is already linked to a different Google account.");
  }
  if (user) {
    const inactive = inactiveRoleMessage(state, user.role);
    if (inactive) return stop(state, inactive);
    return pass(
      {
        ...state,
        users: state.users.map((item) => (item.id === user.id ? { ...item, googleSub: identity.sub, googleEmail: email } : item)),
        session: sessionFor(user),
      },
      `Signed in as ${user.name}.`,
    );
  }
  const inactive = inactiveRoleMessage(state, "customer");
  if (inactive) return stop(state, inactive);
  if (name.length < 2) return stop(state, "Google did not return a name for this account.");
  const customerId = `c-${identity.sub}`;
  const account = {
    id: `user-${identity.sub}`,
    role: "customer" as const,
    name,
    email,
    password: `google.${identity.sub}`,
    customerId,
    googleSub: identity.sub,
    googleEmail: email,
  };
  return pass(
    {
      ...state,
      customers: [...state.customers, { id: customerId, name, email, phone: "", addresses: [] }],
      users: [...state.users, account],
      session: sessionFor(account),
    },
    `Signed in as ${name}.`,
  );
}

export function linkGoogle(state: AppState, identity: GoogleIdentity): Out {
  const session = state.session;
  if (!session) return stop(state, "Sign in before connecting Google.");
  const email = identity.email.trim().toLowerCase();
  if (!identity.sub || !email.includes("@")) return stop(state, "Google did not return a usable account.");
  const taken = state.users.find(
    (user) => user.id !== session.userId && (user.googleSub === identity.sub || user.email.toLowerCase() === email || user.googleEmail === email),
  );
  if (taken) return stop(state, "That Google account is already used by another sign-in.");
  const mine = state.users.find((user) => user.id === session.userId);
  if (!mine) return stop(state, "This sign-in has no account to update.");
  if (mine.googleSub === identity.sub) return pass(state, `Google is already connected as ${email}.`);
  return pass(
    {
      ...state,
      users: state.users.map((user) => (user.id === mine.id ? { ...user, googleSub: identity.sub, googleEmail: email } : user)),
    },
    `Google connected as ${email}.`,
  );
}

export function unlinkGoogle(state: AppState): Out {
  const session = state.session;
  if (!session) return stop(state, "Sign in before disconnecting Google.");
  const mine = state.users.find((user) => user.id === session.userId);
  if (!mine?.googleSub) return stop(state, "No Google account is connected.");
  return pass(
    {
      ...state,
      users: state.users.map((user) => (user.id === mine.id ? { ...user, googleSub: undefined, googleEmail: undefined } : user)),
    },
    "Google disconnected. The demo password still works.",
  );
}

export interface TechnicianProfilePatch {
  name: string;
  headline: string;
  phone: string;
  skills: string[];
  zoneIds: string[];
  modes: VisitMode[];
  deviceTypes: string[];
}

export function updateTechnicianProfile(state: AppState, patch: TechnicianProfilePatch): Out {
  const session = state.session;
  const providerId = session?.providerId;
  if (!session || session.role !== "provider" || !providerId) return stop(state, "Sign in as a technician to edit this profile.");
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) return stop(state, "Technician profile missing.");
  const name = patch.name.trim();
  const headline = patch.headline.trim();
  const phone = digits(patch.phone);
  if (name.length < 2) return stop(state, "Enter the name customers should see.");
  if (headline.length < 8) return stop(state, "Enter a headline of at least a few words.");
  if (phone.length !== 10) return stop(state, "Enter a 10-digit mobile number.");
  const skills = [...new Set(patch.skills.filter((id) => state.services.some((service) => service.id === id)))];
  const zoneIds = [...new Set(patch.zoneIds.filter((id) => state.zones.some((zone) => zone.id === id)))];
  const modes = [...new Set(patch.modes.filter((mode) => mode === "onsite" || mode === "remote"))];
  const deviceTypes = [...new Set(patch.deviceTypes.map((item) => item.trim()).filter(Boolean))];
  if (skills.length === 0) return stop(state, "Keep at least one skill.");
  if (zoneIds.length === 0) return stop(state, "Keep at least one area.");
  if (modes.length === 0) return stop(state, "Keep at least one visit type.");
  const open = state.bookings.filter(
    (booking) => booking.providerId === providerId && booking.status !== "cancelled" && booking.status !== "completed",
  );
  for (const booking of open) {
    if (provider.skills.includes(booking.serviceId) && !skills.includes(booking.serviceId)) {
      const service = state.services.find((item) => item.id === booking.serviceId)?.name ?? "that service";
      return stop(state, `${booking.ref} is still assigned for ${service}. Keep that skill, or ask operations to move the job.`);
    }
    if (provider.zoneIds.includes(booking.zoneId) && !zoneIds.includes(booking.zoneId)) {
      const zone = state.zones.find((item) => item.id === booking.zoneId)?.name ?? "that area";
      return stop(state, `${booking.ref} is in ${zone}. Keep that area, or ask operations to move the job.`);
    }
    if (provider.modes.includes(booking.mode) && !modes.includes(booking.mode)) {
      return stop(state, `${booking.ref} is a ${modeLabel(booking.mode).toLowerCase()} visit. Keep that visit type.`);
    }
    const coveredDevice = provider.deviceTypes.length === 0 || provider.deviceTypes.includes(booking.deviceType);
    const stillCovered = deviceTypes.length === 0 || deviceTypes.includes(booking.deviceType);
    if (coveredDevice && !stillCovered) {
      return stop(state, `${booking.ref} is for a ${booking.deviceType}. Keep that device, or leave devices blank to accept every type.`);
    }
  }
  return pass(
    {
      ...state,
      providers: state.providers.map((item) =>
        item.id === providerId ? { ...item, name, headline, phone, skills, zoneIds, modes, deviceTypes } : item,
      ),
      users: state.users.map((user) => (user.id === session.userId ? { ...user, name } : user)),
      session: { ...session, name },
    },
    "Profile saved in this demo.",
  );
}

export function setPostal(state: AppState, postal: string): Out {
  const assessment = assessPostal(state.zones, postal);
  if (!assessment.ok && assessment.code === "invalid") return stop(state, assessment.message);
  if (!assessment.ok) {
    return pass(
      { ...state, coverage: { postalCode: assessment.postal, zoneId: null, status: "uncovered" } },
      assessment.message,
    );
  }
  const health = zoneHealth(state.providers, assessment.zone);
  const extra = health === "uncovered" ? " No verified technician is accepting work there yet." : "";
  return pass(
    { ...state, coverage: { postalCode: normalizePostal(postal), zoneId: assessment.zone.id, status: "covered" } },
    `${assessment.message}${extra}`,
  );
}

export function updateProfile(state: AppState, patch: { name: string; phone: string }): Out {
  const session = state.session;
  if (!session?.customerId) return stop(state, "Sign in as a customer to edit a profile.");
  const name = patch.name.trim();
  const phone = digits(patch.phone);
  if (name.length < 2) return stop(state, "Enter the name technicians should use.");
  if (phone.length !== 10) return stop(state, "Enter a 10-digit mobile number.");
  return pass(
    {
      ...state,
      customers: state.customers.map((customer) =>
        customer.id === session.customerId ? { ...customer, name, phone } : customer,
      ),
      session: { ...session, name },
    },
    "Profile saved in this demo.",
  );
}

export function saveAddress(state: AppState, address: Address): Out {
  const session = state.session;
  if (!session?.customerId) return stop(state, "Sign in as a customer to save an address.");
  if (address.line1.trim().length < 5) return stop(state, "Enter a street address.");
  if (!isPostalShape(address.postalCode)) return stop(state, "Enter a 6-digit postal code.");
  if (digits(address.phone).length !== 10) return stop(state, "Enter a 10-digit contact number.");
  const next = { ...address, postalCode: normalizePostal(address.postalCode), phone: digits(address.phone), line1: address.line1.trim() };
  return pass(
    {
      ...state,
      customers: state.customers.map((customer) => {
        if (customer.id !== session.customerId) return customer;
        const exists = customer.addresses.some((item) => item.id === next.id);
        return {
          ...customer,
          addresses: exists ? customer.addresses.map((item) => (item.id === next.id ? next : item)) : [...customer.addresses, next],
        };
      }),
    },
    "Address saved on this device.",
  );
}

export function deleteAddress(state: AppState, addressId: string): Out {
  const session = state.session;
  if (!session?.customerId) return stop(state, "Sign in as a customer to remove an address.");
  return pass(
    {
      ...state,
      customers: state.customers.map((customer) =>
        customer.id === session.customerId
          ? { ...customer, addresses: customer.addresses.filter((item) => item.id !== addressId) }
          : customer,
      ),
    },
    "Address removed.",
  );
}

export function requestCoverage(state: AppState, input: Omit<CoverageRequest, "id" | "createdAt" | "status">): Out {
  const postal = normalizePostal(input.postalCode);
  if (!isPostalShape(postal)) return stop(state, "Enter the 6-digit postal code you want covered.");
  if (input.name.trim().length < 2) return stop(state, "Enter your name.");
  if (digits(input.phone).length !== 10) return stop(state, "Enter a 10-digit mobile number.");
  const request: CoverageRequest = {
    ...input,
    name: input.name.trim(),
    phone: digits(input.phone),
    postalCode: postal,
    note: input.note.trim(),
    id: createId("cov"),
    createdAt: new Date().toISOString(),
    status: "new",
  };
  let next = { ...state, coverageRequests: [request, ...state.coverageRequests] };
  next = withNotices(
    next,
    admins(state).map((userId) =>
      notice(userId, "Coverage request", `${request.name} asked about ${postal}.`, undefined),
    ),
  );
  return pass(next, "Request saved for operations. Nobody was emailed or texted.");
}

export interface NewBookingInput {
  serviceId: string;
  zoneId: string;
  postalCode: string;
  mode: VisitMode;
  deviceType: string;
  issue: string;
  answers: Booking["answers"];
  address?: Address;
  remoteContact?: Booking["remoteContact"];
  date: string;
  windowId: string;
  partsEstimate: number;
  discountCode: string;
  priority: boolean;
}

export function placeBooking(state: AppState, input: NewBookingInput, now = new Date()): Out {
  const session = state.session;
  if (!session?.customerId) return stop(state, "Sign in as a customer to book.");
  const customer = state.customers.find((item) => item.id === session.customerId);
  const service = state.services.find((item) => item.id === input.serviceId);
  const zone = state.zones.find((item) => item.id === input.zoneId);
  if (!customer || !service || !zone) return stop(state, "Choose a service and a covered area.");
  if (!zone.postalCodes.includes(normalizePostal(input.postalCode))) {
    return stop(state, "That postal code is not part of the selected area.");
  }
  const unavailable = coverageMessage(service, zone, zoneHealth(state.providers, zone));
  if (unavailable) return stop(state, unavailable);
  if (!service.modes.includes(input.mode) || !zone.enabledModes.includes(input.mode)) {
    return stop(state, "That visit type is not offered here.");
  }
  if (!service.deviceTypes.includes(input.deviceType)) return stop(state, "Choose a device this service covers.");
  if (input.issue.trim().length < 12) return stop(state, "Describe the issue in at least a sentence.");
  if (!serviceEnabled(zone, service.id)) return stop(state, `${service.name} is not offered in ${zone.name}.`);

  const demand: SlotDemand = {
    id: "candidate",
    serviceId: service.id,
    zoneId: zone.id,
    mode: input.mode,
    deviceType: input.deviceType,
    date: input.date,
    windowId: input.windowId,
    status: "confirmed",
  };
  const slot = canSchedule(state, demand, now);
  if (!slot.ok) return stop(state, slot.reason);

  let address: Address | undefined;
  let remoteContact: Booking["remoteContact"];
  if (input.mode === "onsite") {
    if (!input.address) return stop(state, "Enter the visit address.");
    const phone = digits(input.address.phone);
    if (input.address.line1.trim().length < 5) return stop(state, "Enter the street address.");
    if (input.address.contactName.trim().length < 2) return stop(state, "Enter a contact name.");
    if (phone.length !== 10) return stop(state, "Enter a 10-digit contact number.");
    if (!zone.postalCodes.includes(normalizePostal(input.address.postalCode))) {
      return stop(state, "The address postal code has to stay inside the selected area.");
    }
    address = { ...input.address, phone, postalCode: normalizePostal(input.address.postalCode), line1: input.address.line1.trim() };
  } else {
    if (!input.remoteContact) return stop(state, "Enter remote-session details.");
    const phone = digits(input.remoteContact.phone);
    if (phone.length !== 10) return stop(state, "Enter a 10-digit number for the remote session.");
    if (!input.remoteContact.channel.trim()) return stop(state, "Choose how the technician should reach you.");
    remoteContact = { ...input.remoteContact, phone, notes: input.remoteContact.notes.trim() };
  }

  const window = state.settings.windows.find((item) => item.id === input.windowId);
  if (!window) return stop(state, "Choose an appointment window.");
  const quote = calculateQuote({
    service,
    zone,
    areaPrices: state.areaPrices,
    mode: input.mode,
    partsEstimate: input.partsEstimate,
    discountCode: input.discountCode,
    priority: input.priority,
    slotStartsAt: atTime(input.date, window.start),
    now,
    urgencyWithinHours: state.settings.urgencyWithinHours,
  });
  const payment = authorizePayment(quote.total);
  const ref = nextRef(state);
  const id = createId("bkg");
  const booking: Booking = {
    id,
    ref,
    customerId: customer.id,
    customerName: customer.name,
    serviceId: service.id,
    zoneId: zone.id,
    postalCode: normalizePostal(input.postalCode),
    accepted: false,
    status: "confirmed",
    mode: input.mode,
    deviceType: input.deviceType,
    issue: input.issue.trim(),
    answers: input.answers.filter((answer) => answer.value),
    address,
    remoteContact,
    quote,
    quoteInput: {
      partsEstimate: Number.isFinite(input.partsEstimate) ? Math.max(0, input.partsEstimate) : 0,
      discountCode: input.discountCode.trim(),
      priority: input.priority,
    },
    date: input.date,
    windowId: input.windowId,
    timeline: [
      stamp("requested", "Visit requested", actorOf(session)),
      stamp("quoted", "Estimate shown", { role: "system", name: "TechCare" }, quote.summaryLabel),
      stamp("confirmed", "Customer confirmed the visit", actorOf(session), payment.message),
    ],
    assignmentHistory: [],
    internalNote: "",
    createdAt: new Date().toISOString(),
  };
  let next: AppState = { ...state, bookings: [booking, ...state.bookings] };
  const notes = [
    notice(session.userId, "Visit confirmed", `${ref} is confirmed. ${payment.message}`, id),
    ...admins(state).map((userId) => notice(userId, "New booking needs assignment", `${ref} · ${service.name} · ${zone.name}`, id)),
  ];
  next = withNotices(next, notes);
  return pass(next, `${ref} is confirmed. ${payment.message}`, id);
}

export function cancelBooking(state: AppState, bookingId: string, reason: string, now = new Date()): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session || !booking) return stop(state, "That booking could not be found.");
  const admin = session.role === "admin";
  const owner = session.role === "customer" && session.customerId === booking.customerId;
  if (!admin && !owner) return stop(state, "You cannot cancel this booking.");
  if (booking.status === "cancelled") return stop(state, `${booking.ref} is already cancelled.`);
  if (!reason.trim()) return stop(state, "Add a short reason.");
  if (!admin) {
    const decision = canCustomerCancel(booking, state.settings, now);
    if (!decision.allowed) return stop(state, decision.reason);
  }
  const nextBooking: Booking = {
    ...booking,
    status: "cancelled",
    timeline: [...booking.timeline, stamp("cancelled", "Cancelled", actorOf(session), reason.trim())],
  };
  let next = replaceBooking(state, nextBooking);
  const items: Notice[] = [];
  const customerId = customerUser(state, booking.customerId);
  if (customerId && customerId !== session.userId) items.push(notice(customerId, "Visit cancelled", `${booking.ref} was cancelled.`, booking.id));
  if (booking.providerId) {
    const userId = providerUser(state, booking.providerId);
    if (userId) items.push(notice(userId, "Job cancelled", `${booking.ref} was cancelled.`, booking.id));
  }
  admins(state)
    .filter((userId) => userId !== session.userId)
    .forEach((userId) => items.push(notice(userId, "Visit cancelled", `${booking.ref} was cancelled.`, booking.id)));
  next = withNotices(next, items);
  return pass(next, `${booking.ref} is cancelled. No payment had been taken.`);
}

export function reopenBooking(state: AppState, bookingId: string, now = new Date()): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session || !booking) return stop(state, "That booking could not be found.");
  const owner = session.role === "customer" && session.customerId === booking.customerId;
  if (!owner) return stop(state, "You cannot reopen this booking.");
  if (booking.status !== "cancelled") return stop(state, "Only a cancelled visit can be reopened.");
  const service = state.services.find((item) => item.id === booking.serviceId);
  const zone = state.zones.find((item) => item.id === booking.zoneId);
  const window = state.settings.windows.find((item) => item.id === booking.windowId);
  if (!service || !zone || !window) return stop(state, "That window is no longer in the schedule.");
  const decision = canSchedule(
    state,
    {
      id: booking.id,
      serviceId: booking.serviceId,
      zoneId: booking.zoneId,
      mode: booking.mode,
      deviceType: booking.deviceType,
      date: booking.date,
      windowId: booking.windowId,
      status: "confirmed",
    },
    now,
    [booking.id],
  );
  if (!decision.ok) return stop(state, decision.reason);
  let providerId = booking.providerId;
  let status: BookingStatus = "confirmed";
  let detail = "Reopened on the same window. No payment was taken.";
  if (providerId) {
    const simulated: Booking = { ...booking, status: "assigned", accepted: false };
    const keep = canAssign(state, simulated, providerId, now);
    if (keep.ok) {
      status = "assigned";
      detail = "Reopened with the same technician, who still needs to accept. No payment was taken.";
    } else {
      providerId = undefined;
      detail = "Reopened. The previous technician is not free, so the visit needs a new assignment. No payment was taken.";
    }
  }
  const nextBooking: Booking = {
    ...booking,
    status,
    providerId,
    accepted: false,
    timeline: [...booking.timeline, stamp(status, "Reopened", actorOf(session), detail)],
  };
  let next = replaceBooking(state, nextBooking);
  const items: Notice[] = [];
  if (providerId) {
    const userId = providerUser(state, providerId);
    if (userId) items.push(notice(userId, "Job reopened", `${booking.ref} is on your schedule again.`, booking.id));
  }
  admins(state).forEach((userId) => items.push(notice(userId, "Visit reopened", `${booking.ref} was reopened by the customer.`, booking.id)));
  next = withNotices(next, items);
  return pass(next, `${booking.ref} is open again.`);
}

export function rescheduleBooking(state: AppState, bookingId: string, date: string, windowId: string, now = new Date()): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session || !booking) return stop(state, "That booking could not be found.");
  const admin = session.role === "admin";
  const owner = session.role === "customer" && session.customerId === booking.customerId;
  if (!admin && !owner) return stop(state, "You cannot move this booking.");
  if (!admin) {
    const decision = canCustomerReschedule(booking, state.settings, now);
    if (!decision.allowed) return stop(state, decision.reason);
  }
  const service = state.services.find((item) => item.id === booking.serviceId);
  const zone = state.zones.find((item) => item.id === booking.zoneId);
  const window = state.settings.windows.find((item) => item.id === windowId);
  if (!service || !zone || !window) return stop(state, "That window is no longer in the schedule.");
  const decision = canSchedule(
    state,
    {
      id: booking.id,
      serviceId: booking.serviceId,
      zoneId: booking.zoneId,
      mode: booking.mode,
      deviceType: booking.deviceType,
      date,
      windowId,
      status: "confirmed",
    },
    now,
    [booking.id],
  );
  if (!decision.ok) return stop(state, decision.reason);
  const quote = calculateQuote({
    service,
    zone,
    areaPrices: state.areaPrices,
    mode: booking.mode,
    partsEstimate: booking.quoteInput.partsEstimate,
    discountCode: booking.quoteInput.discountCode,
    priority: booking.quoteInput.priority,
    slotStartsAt: atTime(date, window.start),
    now,
    urgencyWithinHours: state.settings.urgencyWithinHours,
  });
  let providerId = booking.providerId;
  let accepted = booking.accepted;
  let status: BookingStatus = booking.status === "reschedule_requested" ? "confirmed" : booking.status;
  let detail = `Moved to ${date} · ${window.label}.`;
  if (quote.total !== booking.quote.total) detail += ` Estimate updated from the shared price rules.`;
  if (providerId) {
    const simulated: Booking = { ...booking, date, windowId, quote, status: "assigned" };
    const keep = canAssign(
      { ...state, bookings: state.bookings.map((item) => (item.id === booking.id ? simulated : item)) },
      simulated,
      providerId,
      now,
    );
    if (!keep.ok) {
      providerId = undefined;
      accepted = false;
      status = "confirmed";
      detail += " The previous technician is not free, so the visit is unassigned.";
    } else {
      accepted = false;
      status = "assigned";
    }
  } else {
    status = "confirmed";
  }
  const nextBooking: Booking = {
    ...booking,
    date,
    windowId,
    quote,
    providerId,
    accepted,
    status,
    timeline: [...booking.timeline, stamp(status, "Rescheduled", actorOf(session), detail)],
  };
  return pass(replaceBooking(state, nextBooking), `${booking.ref} was moved. ${detail}`);
}

export function assignProvider(state: AppState, bookingId: string, providerId: string, now = new Date()): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can assign technicians.");
  const booking = state.bookings.find((item) => item.id === bookingId);
  const provider = state.providers.find((item) => item.id === providerId);
  if (!booking || !provider) return stop(state, "Choose a booking and a technician.");
  if (!["confirmed", "assigned", "provider_unavailable", "reschedule_requested"].includes(booking.status)) {
    return stop(state, "This visit is too far along to reassign here.");
  }
  const decision = canAssign(state, booking, providerId, now);
  if (!decision.ok) return stop(state, decision.message);
  const from = booking.providerId;
  const nextBooking: Booking = {
    ...booking,
    providerId,
    accepted: false,
    status: "assigned",
    assignmentHistory: [
      ...booking.assignmentHistory,
      {
        id: createId("asn"),
        at: new Date().toISOString(),
        fromProviderId: from,
        toProviderId: providerId,
        actorName: state.session.name,
        note: decision.message,
      },
    ],
    timeline: [...booking.timeline, stamp("assigned", `Assigned to ${provider.name}`, actorOf(state.session), decision.message)],
  };
  let next = replaceBooking(state, nextBooking);
  const items: Notice[] = [];
  const techUser = providerUser(state, providerId);
  if (techUser) items.push(notice(techUser, "Job assigned", `${booking.ref} is on your schedule. Accept or decline it.`, booking.id));
  const customerId = customerUser(state, booking.customerId);
  if (customerId) items.push(notice(customerId, "Technician assigned", `${provider.name} was assigned to ${booking.ref}. This is an in-app demo notice.`, booking.id));
  next = withNotices(next, items);
  return pass(next, `${provider.name} is assigned to ${booking.ref}. ${decision.message}`);
}

export function setBookingStatus(state: AppState, bookingId: string, status: BookingStatus, detail?: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can change status directly.");
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return stop(state, "That booking could not be found.");
  if (!ADMIN_TRANSITIONS[booking.status].includes(status)) {
    return stop(state, `${STATUS_LABEL[booking.status]} cannot move to ${STATUS_LABEL[status]}.`);
  }
  let providerId = booking.providerId;
  let accepted = booking.accepted;
  if (status === "confirmed" || status === "provider_unavailable") {
    providerId = undefined;
    accepted = false;
  }
  if (status === "assigned" && !providerId) return stop(state, "Assign a technician before marking the visit assigned.");
  const nextBooking: Booking = {
    ...booking,
    status,
    providerId,
    accepted,
    timeline: [...booking.timeline, stamp(status, STATUS_LABEL[status], actorOf(state.session), detail?.trim())],
  };
  return pass(replaceBooking(state, nextBooking), `${booking.ref} is now ${STATUS_LABEL[status]}.`);
}

export function setInternalNote(state: AppState, bookingId: string, note: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can store an internal note.");
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return stop(state, "That booking could not be found.");
  return pass(replaceBooking(state, { ...booking, internalNote: note }), "Internal note saved.");
}

export function acceptJob(state: AppState, bookingId: string): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session?.providerId || !booking || booking.providerId !== session.providerId) {
    return stop(state, "This job is not on your schedule.");
  }
  const provider = state.providers.find((item) => item.id === session.providerId);
  if (!provider) return stop(state, "Technician profile missing.");
  const warnings = jobWarnings(state, booking, provider);
  if (warnings.length) return stop(state, `${warnings[0]} Decline the job so operations can reassign it.`);
  const nextBooking: Booking = {
    ...booking,
    accepted: true,
    timeline: [...booking.timeline, stamp("assigned", "Technician accepted", actorOf(session))],
  };
  let next = replaceBooking(state, nextBooking);
  const customerId = customerUser(state, booking.customerId);
  if (customerId) next = withNotices(next, [notice(customerId, "Technician accepted", `${provider.name} accepted ${booking.ref}.`, booking.id)]);
  return pass(next, `${booking.ref} accepted.`);
}

export function declineJob(state: AppState, bookingId: string, reason: string): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session?.providerId || !booking || booking.providerId !== session.providerId) {
    return stop(state, "This job is not on your schedule.");
  }
  if (reason.trim().length < 3) return stop(state, "Add a short reason for declining.");
  const nextBooking: Booking = {
    ...booking,
    providerId: undefined,
    accepted: false,
    status: "provider_unavailable",
    timeline: [...booking.timeline, stamp("provider_unavailable", "Technician declined", actorOf(session), reason.trim())],
  };
  let next = replaceBooking(state, nextBooking);
  next = withNotices(
    next,
    admins(state).map((userId) => notice(userId, "Technician declined", `${booking.ref} needs another technician. ${reason.trim()}`, booking.id)),
  );
  return pass(next, `${booking.ref} was handed back to operations.`);
}

export function advanceJob(state: AppState, bookingId: string, status: BookingStatus): Out {
  const session = state.session;
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!session?.providerId || !booking || booking.providerId !== session.providerId) {
    return stop(state, "This job is not on your schedule.");
  }
  const provider = state.providers.find((item) => item.id === session.providerId);
  if (!provider) return stop(state, "Technician profile missing.");
  const warnings = jobWarnings(state, booking, provider);
  if (warnings.length) return stop(state, warnings[0] ?? "You are not available for this job.");
  if (!ADMIN_TRANSITIONS[booking.status].includes(status)) return stop(state, "That update is not available yet.");
  const nextBooking: Booking = {
    ...booking,
    status,
    timeline: [...booking.timeline, stamp(status, STATUS_LABEL[status], actorOf(session))],
  };
  let next = replaceBooking(state, nextBooking);
  const customerId = customerUser(state, booking.customerId);
  if (customerId) next = withNotices(next, [notice(customerId, STATUS_LABEL[status], `${booking.ref} is now ${STATUS_LABEL[status].toLowerCase()}.`, booking.id)]);
  return pass(next, `${booking.ref} is now ${STATUS_LABEL[status].toLowerCase()}.`);
}

export function saveCity(state: AppState, city: City): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit cities.");
  if (city.name.trim().length < 2 || city.region.trim().length < 2) return stop(state, "Enter a city and region.");
  const next = { ...city, name: city.name.trim(), region: city.region.trim() };
  const exists = state.cities.some((item) => item.id === city.id);
  return pass(
    { ...state, cities: exists ? state.cities.map((item) => (item.id === city.id ? next : item)) : [...state.cities, next] },
    `${next.name} saved.`,
  );
}

export function saveZone(state: AppState, zone: Zone): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit service areas.");
  const postalCodes = [...new Set(zone.postalCodes.map(normalizePostal).filter(Boolean))];
  if (zone.name.trim().length < 2) return stop(state, "Name the zone.");
  if (!state.cities.some((city) => city.id === zone.cityId)) return stop(state, "Choose a city.");
  if (postalCodes.length === 0 || postalCodes.some((code) => !isPostalShape(code))) {
    return stop(state, "Add at least one 6-digit postal code.");
  }
  const clash = state.zones.find((item) => item.id !== zone.id && item.postalCodes.some((code) => postalCodes.includes(code)));
  if (clash) return stop(state, `${clash.name} already uses one of those postal codes.`);
  if (zone.travelFee < 0 || zone.travelRadiusKm <= 0 || zone.leadTimeHours < 0) {
    return stop(state, "Check the travel fee, radius, and lead time.");
  }
  if (zone.open >= zone.close) return stop(state, "Closing time has to be after opening time.");
  if (zone.enabledServiceIds.length === 0 || zone.enabledModes.length === 0 || zone.enabledTags.length === 0) {
    return stop(state, "Enable at least one service, visit type, and technician type.");
  }
  const nextZone: Zone = { ...zone, name: zone.name.trim(), postalCodes };
  const exists = state.zones.some((item) => item.id === zone.id);
  return pass(
    { ...state, zones: exists ? state.zones.map((item) => (item.id === zone.id ? nextZone : item)) : [...state.zones, nextZone] },
    `${nextZone.name} saved.`,
  );
}

export function deleteZone(state: AppState, zoneId: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can remove a zone.");
  const used = state.bookings.some((booking) => booking.zoneId === zoneId && booking.status !== "cancelled");
  if (used) return stop(state, "Move or cancel bookings in this zone before removing it.");
  return pass(
    { ...state, zones: state.zones.filter((zone) => zone.id !== zoneId), blocks: state.blocks.filter((block) => block.zoneId !== zoneId) },
    "Zone removed.",
  );
}

export function saveCategory(state: AppState, category: Category): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit categories.");
  if (category.name.trim().length < 2) return stop(state, "Name the category.");
  const next = { ...category, name: category.name.trim(), blurb: category.blurb.trim() };
  const exists = state.categories.some((item) => item.id === category.id);
  return pass(
    {
      ...state,
      categories: exists ? state.categories.map((item) => (item.id === category.id ? next : item)) : [...state.categories, next],
    },
    `${next.name} saved.`,
  );
}

export function saveService(state: AppState, service: Service): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit the catalog.");
  if (service.name.trim().length < 2) return stop(state, "Name the service.");
  if (service.durationMinutes < 15) return stop(state, "Duration should be at least 15 minutes.");
  if (service.modes.length === 0 || service.deviceTypes.length === 0) return stop(state, "Add a device type and a visit mode.");
  if (service.taxRate < 0 || service.taxRate > 0.4 || service.commissionRate < 0 || service.commissionRate > 0.8) {
    return stop(state, "Check the tax and commission rates.");
  }
  const numbers = [service.basePrice, service.diagnosticFee, service.laborRatePerHour, service.urgencySurcharge];
  if (numbers.some((value) => !Number.isFinite(value) || value < 0)) return stop(state, "Prices cannot be negative.");
  const next = { ...service, name: service.name.trim(), deviceTypes: service.deviceTypes.map((item) => item.trim()).filter(Boolean) };
  const exists = state.services.some((item) => item.id === service.id);
  return pass(
    { ...state, services: exists ? state.services.map((item) => (item.id === service.id ? next : item)) : [...state.services, next] },
    `${next.name} saved. New quotes use this version.`,
  );
}

export function saveAreaPrice(state: AppState, price: AreaPrice): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit area prices.");
  const rest = state.areaPrices.filter((item) => !(item.zoneId === price.zoneId && item.serviceId === price.serviceId));
  const empty = price.basePrice === undefined && price.travelFee === undefined;
  return pass(
    { ...state, areaPrices: empty ? rest : [...rest, price] },
    empty ? "Area override removed." : "Area price saved. The customer quote uses the same rule.",
  );
}

export function saveProvider(state: AppState, provider: Provider): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit technicians.");
  if (provider.name.trim().length < 2) return stop(state, "Enter the technician’s name.");
  if (provider.maxJobsPerDay < 1) return stop(state, "Daily capacity should be at least 1.");
  const clash = availabilityClash(state, provider.id, provider.workingHours, provider.timeOff);
  if (clash) return stop(state, clash);
  const next = { ...provider, name: provider.name.trim() };
  const exists = state.providers.some((item) => item.id === provider.id);
  return pass(
    { ...state, providers: exists ? state.providers.map((item) => (item.id === provider.id ? next : item)) : [...state.providers, next] },
    `${next.name} saved.`,
  );
}

export function saveMyAvailability(state: AppState, workingHours: WorkingHours[], timeOff: string[], acceptingWork: boolean): Out {
  const providerId = state.session?.providerId;
  if (!providerId) return stop(state, "Sign in as a technician to edit availability.");
  const provider = state.providers.find((item) => item.id === providerId);
  if (!provider) return stop(state, "Technician profile missing.");
  const clash = availabilityClash(state, providerId, workingHours, timeOff);
  if (clash) return stop(state, clash);
  return pass(
    {
      ...state,
      providers: state.providers.map((item) => (item.id === providerId ? { ...item, workingHours, timeOff, acceptingWork } : item)),
    },
    acceptingWork ? "Availability saved. You are accepting new jobs." : "Availability saved. You are not accepting new jobs.",
  );
}

function availabilityClash(state: AppState, providerId: string, workingHours: WorkingHours[], timeOff: string[]): string | null {
  const jobs = state.bookings.filter((booking) => booking.providerId === providerId && booking.status !== "cancelled" && booking.status !== "completed");
  for (const booking of jobs) {
    if (timeOff.includes(booking.date)) return `You already have ${booking.ref} on ${booking.date}. Move that job before taking the day off.`;
    const window = state.settings.windows.find((item) => item.id === booking.windowId);
    const dayHours = workingHours.find((item) => item.day === weekday(booking.date));
    if (!window || !dayHours || !windowFitsHours(dayHours.start, dayHours.end, window)) {
      return `${booking.ref} falls outside those working hours. Move the job first.`;
    }
  }
  return null;
}

export function blockSlot(state: AppState, zoneId: string, date: string, windowId: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can close a window.");
  const exists = state.blocks.some((block) => block.zoneId === zoneId && block.date === date && block.windowId === windowId);
  if (exists) return stop(state, "That window is already closed.");
  return pass({ ...state, blocks: [...state.blocks, { zoneId, date, windowId }] }, "Window closed for new bookings.");
}

export function reopenSlot(state: AppState, zoneId: string, date: string, windowId: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can reopen a window.");
  return pass(
    { ...state, blocks: state.blocks.filter((block) => !(block.zoneId === zoneId && block.date === date && block.windowId === windowId)) },
    "Window reopened. Capacity follows the technicians who are actually free.",
  );
}

export function saveSettings(state: AppState, settings: AppState["settings"]): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit schedule rules.");
  if (settings.windows.length === 0) return stop(state, "Add at least one appointment window.");
  const overlap = findWindowOverlap(settings.windows);
  if (overlap) return stop(state, overlap);
  for (const window of settings.windows) {
    if (window.start >= window.end || !window.label.trim() || !window.id.trim()) return stop(state, "Each window needs a name and a start before its end.");
  }
  const ids = new Set(settings.windows.map((window) => window.id));
  const missing = state.bookings.find((booking) => booking.status !== "cancelled" && booking.status !== "completed" && !ids.has(booking.windowId));
  if (missing) return stop(state, `${missing.ref} still uses a window you removed.`);
  if ([settings.cancellationCutoffHours, settings.rescheduleCutoffHours, settings.assignmentDeadlineHours, settings.travelBufferMinutes].some((value) => value < 0)) {
    return stop(state, "Cutoffs and buffers cannot be negative.");
  }
  return pass({ ...state, settings }, "Schedule rules saved. Customer slots use these windows.");
}

export function markNoticesRead(state: AppState): Out {
  const userId = state.session?.userId;
  if (!userId) return pass(state, "");
  return pass(
    { ...state, notices: state.notices.map((item) => (item.userId === userId ? { ...item, read: true } : item)) },
    "",
  );
}

export function reviewCoverageRequest(state: AppState, id: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can review coverage requests.");
  return pass(
    { ...state, coverageRequests: state.coverageRequests.map((item) => (item.id === id ? { ...item, status: "reviewed" } : item)) },
    "Marked as reviewed.",
  );
}

export function saveAccessRole(state: AppState, role: AccessRole): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can edit roles.");
  const name = role.name.trim();
  if (name.length < 2) return stop(state, "Give the role a name.");
  if (!role.purpose.trim()) return stop(state, "Describe what this role is for.");
  const rolesNow = state.accessRoles ?? [];
  const existing = rolesNow.find((item) => item.id === role.id);
  if (existing?.systemKey) {
    if (role.status === "inactive") return stop(state, `${existing.name} is required for sign-in. It cannot be deactivated.`);
    if (role.systemKey !== existing.systemKey) return stop(state, "A sign-in role cannot be turned into a different role.");
    const missing = lockedPermissions(existing).filter((id) => !role.permissions.includes(id));
    if (missing.length) return stop(state, "Required permissions for this sign-in role have to stay on.");
  }
  const next = { ...role, name, purpose: role.purpose.trim(), systemKey: existing?.systemKey };
  const roles = existing ? rolesNow.map((item) => (item.id === role.id ? next : item)) : [...rolesNow, next];
  return pass({ ...state, accessRoles: roles }, existing ? `${name} saved.` : `${name} added. It does not sign anyone in.`);
}

export function setAccessRoleStatus(state: AppState, id: string, status: AccessRole["status"]): Out {
  const role = (state.accessRoles ?? []).find((item) => item.id === id);
  if (!role) return stop(state, "That role is not in the directory.");
  return saveAccessRole(state, { ...role, status });
}

export function deleteAccessRole(state: AppState, id: string): Out {
  if (state.session?.role !== "admin") return stop(state, "Only operations can delete roles.");
  const role = (state.accessRoles ?? []).find((item) => item.id === id);
  if (!role) return stop(state, "That role is not in the directory.");
  if (role.systemKey) return stop(state, `${role.name} is required for sign-in and cannot be deleted.`);
  return pass(
    { ...state, accessRoles: (state.accessRoles ?? []).filter((item) => item.id !== id) },
    `${role.name} deleted. Inactive roles stay in the list until you delete them.`,
  );
}

export function demandWindow(state: AppState, booking: Booking): Date | null {
  return windowStart(booking, state.settings);
}
