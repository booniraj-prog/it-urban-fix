export type Role = "customer" | "provider" | "admin";

export type VisitMode = "remote" | "onsite";

export type PriceType = "fixed" | "estimate";

export type ProviderTag = "field" | "remote_desk" | "business";

export type ProviderStatus = "active" | "paused" | "suspended";

export type VerificationStatus = "verified" | "pending" | "rejected";

export type BookingStatus =
  | "requested"
  | "quoted"
  | "awaiting_confirmation"
  | "confirmed"
  | "assigned"
  | "en_route"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "reschedule_requested"
  | "provider_unavailable"
  | "awaiting_parts";

export type QuoteLineKind = "fixed" | "estimate" | "discount" | "tax";

export interface QuoteLine {
  id: string;
  label: string;
  amount: number;
  kind: QuoteLineKind;
  detail?: string;
}

export interface Quote {
  priceType: PriceType;
  lines: QuoteLine[];
  preTax: number;
  discount: number;
  tax: number;
  total: number;
  fixedPortion: number;
  estimatedPortion: number;
  commission: number;
  providerPayout: number;
  hasEstimate: boolean;
  discountMessage?: string;
  summaryLabel: string;
  disclaimer: string;
}

export interface TimeWindow {
  id: string;
  label: string;
  start: string;
  end: string;
}

export interface PlatformSettings {
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
  urgencyWithinHours: number;
  assignmentDeadlineHours: number;
  travelBufferMinutes: number;
  windows: TimeWindow[];
}

export interface City {
  id: string;
  name: string;
  region: string;
}

export interface Zone {
  id: string;
  cityId: string;
  name: string;
  postalCodes: string[];
  travelRadiusKm: number;
  travelFee: number;
  open: string;
  close: string;
  leadTimeHours: number;
  enabledServiceIds: string[];
  enabledModes: VisitMode[];
  enabledTags: ProviderTag[];
}

export interface DiagnosticQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface Service {
  id: string;
  categoryId: string;
  name: string;
  summary: string;
  description: string;
  inclusions: string[];
  exclusions: string[];
  warranty: string;
  cancellationNote: string;
  deviceTypes: string[];
  modes: VisitMode[];
  requiredTag?: ProviderTag;
  durationMinutes: number;
  rating: number;
  reviewCount: number;
  priceType: PriceType;
  basePrice: number;
  diagnosticFee: number;
  laborRatePerHour: number;
  urgencySurcharge: number;
  taxRate: number;
  commissionRate: number;
  questions: DiagnosticQuestion[];
}

export interface Category {
  id: string;
  name: string;
  blurb: string;
}

export interface AreaPrice {
  zoneId: string;
  serviceId: string;
  basePrice?: number;
  travelFee?: number;
}

export interface WorkingHours {
  day: number;
  start: string;
  end: string;
}

export interface Provider {
  id: string;
  name: string;
  headline: string;
  skills: string[];
  deviceTypes: string[];
  zoneIds: string[];
  modes: VisitMode[];
  tags: ProviderTag[];
  rating: number;
  status: ProviderStatus;
  verification: VerificationStatus;
  maxJobsPerDay: number;
  workingHours: WorkingHours[];
  timeOff: string[];
  acceptingWork: boolean;
  phone?: string;
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string;
  landmark: string;
  postalCode: string;
  contactName: string;
  phone: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  addresses: Address[];
}

export interface AccessRole {
  id: string;
  name: string;
  purpose: string;
  status: "active" | "inactive";
  permissions: string[];
  /** Present for the three sign-in roles. Those roles cannot be deleted or deactivated. */
  systemKey?: Role;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

export interface UserAccount {
  id: string;
  role: Role;
  name: string;
  email: string;
  password: string;
  customerId?: string;
  providerId?: string;
  /** Google account subject, set after Sign in with Google or linking from a profile. */
  googleSub?: string;
  googleEmail?: string;
}

export interface Session {
  userId: string;
  role: Role;
  name: string;
  customerId?: string;
  providerId?: string;
}

export interface Actor {
  role: Role | "system";
  name: string;
}

export interface TimelineEvent {
  id: string;
  at: string;
  status: BookingStatus;
  title: string;
  detail?: string;
  actor: Actor;
}

export interface AssignmentEvent {
  id: string;
  at: string;
  fromProviderId?: string;
  toProviderId?: string;
  actorName: string;
  note: string;
}

export interface RemoteContact {
  phone: string;
  channel: string;
  notes: string;
}

export interface BookingAnswer {
  questionId: string;
  label: string;
  value: string;
}

export interface Booking {
  id: string;
  ref: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  zoneId: string;
  postalCode: string;
  providerId?: string;
  accepted: boolean;
  status: BookingStatus;
  mode: VisitMode;
  deviceType: string;
  issue: string;
  answers: BookingAnswer[];
  address?: Address;
  remoteContact?: RemoteContact;
  quote: Quote;
  quoteInput: {
    partsEstimate: number;
    discountCode: string;
    priority: boolean;
  };
  date: string;
  windowId: string;
  timeline: TimelineEvent[];
  assignmentHistory: AssignmentEvent[];
  internalNote: string;
  createdAt: string;
}

export interface SlotBlock {
  zoneId: string;
  date: string;
  windowId: string;
}

export interface CoverageRequest {
  id: string;
  postalCode: string;
  serviceId?: string;
  name: string;
  phone: string;
  note: string;
  createdAt: string;
  status: "new" | "reviewed";
}

export interface Notice {
  id: string;
  userId: string;
  title: string;
  body: string;
  bookingId?: string;
  createdAt: string;
  read: boolean;
}

export interface Review {
  id: string;
  serviceId: string;
  customerName: string;
  zoneName: string;
  rating: number;
  text: string;
  dateLabel: string;
}

export interface CoverageSelection {
  postalCode: string;
  zoneId: string | null;
  status: "idle" | "covered" | "uncovered" | "invalid";
}

export interface AppState {
  users: UserAccount[];
  accessRoles: AccessRole[];
  session: Session | null;
  customers: Customer[];
  cities: City[];
  zones: Zone[];
  categories: Category[];
  services: Service[];
  providers: Provider[];
  areaPrices: AreaPrice[];
  bookings: Booking[];
  blocks: SlotBlock[];
  coverageRequests: CoverageRequest[];
  notices: Notice[];
  reviews: Review[];
  settings: PlatformSettings;
  coverage: CoverageSelection;
}

export interface QuoteInput {
  service: Service;
  zone: Zone | null;
  areaPrices: AreaPrice[];
  mode: VisitMode;
  partsEstimate: number;
  discountCode: string;
  priority: boolean;
  slotStartsAt?: Date | null;
  now: Date;
  urgencyWithinHours: number;
}

export type ScheduleCode =
  | "ok"
  | "blocked"
  | "lead_time"
  | "hours"
  | "duration"
  | "coverage"
  | "capacity"
  | "no_providers";

export interface ScheduleDecision {
  ok: boolean;
  code: ScheduleCode;
  reason: string;
}

export interface SlotDemand {
  id: string;
  serviceId: string;
  zoneId: string;
  mode: VisitMode;
  deviceType: string;
  date: string;
  windowId: string;
  providerId?: string;
  status: BookingStatus;
}
