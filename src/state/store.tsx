import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createSeedState } from "../data/seed";
import { defaultAccessRoles } from "../domain/roles";
import type { AppState } from "../types";
import {
  acceptJob,
  advanceJob,
  assignProvider,
  blockSlot,
  cancelBooking,
  declineJob,
  deleteAddress,
  deleteAccessRole,
  deleteZone,
  markNoticesRead,
  placeBooking,
  requestCoverage,
  reopenBooking,
  rescheduleBooking,
  reviewCoverageRequest,
  reopenSlot,
  saveAccessRole,
  saveAddress,
  saveAreaPrice,
  saveCategory,
  saveCity,
  linkGoogle,
  saveMyAvailability,
  saveProvider,
  signInWithGoogle,
  unlinkGoogle,
  updateTechnicianProfile,
  saveService,
  saveSettings,
  saveZone,
  setAccessRoleStatus,
  setBookingStatus,
  setInternalNote,
  setPostal,
  signIn,
  updateProfile,
  type NewBookingInput,
  type Out,
  type Result,
  type TechnicianProfilePatch,
} from "./logic";
import type { AccessRole, Address, AreaPrice, BookingStatus, Category, City, CoverageRequest, GoogleIdentity, Provider, Role, Service, WorkingHours, Zone } from "../types";

const STORAGE_KEY = "techcare.demo.v1";

interface Toast {
  id: string;
  message: string;
  tone: "ok" | "error" | "info";
}

interface StoreValue {
  state: AppState;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  signIn: (email: string, password: string, expected?: Role) => Result;
  signInWithGoogle: (identity: GoogleIdentity) => Result;
  linkGoogle: (identity: GoogleIdentity) => Result;
  unlinkGoogle: () => Result;
  signOut: () => void;
  setPostal: (postal: string) => Result;
  clearPostal: () => void;
  updateProfile: (patch: { name: string; phone: string }) => Result;
  saveAddress: (address: Address) => Result;
  deleteAddress: (addressId: string) => Result;
  requestCoverage: (input: Omit<CoverageRequest, "id" | "createdAt" | "status">) => Result;
  placeBooking: (input: NewBookingInput) => Result;
  cancelBooking: (bookingId: string, reason: string) => Result;
  rescheduleBooking: (bookingId: string, date: string, windowId: string) => Result;
  reopenBooking: (bookingId: string) => Result;
  assignProvider: (bookingId: string, providerId: string) => Result;
  setBookingStatus: (bookingId: string, status: BookingStatus, detail?: string) => Result;
  setInternalNote: (bookingId: string, note: string) => Result;
  acceptJob: (bookingId: string) => Result;
  declineJob: (bookingId: string, reason: string) => Result;
  advanceJob: (bookingId: string, status: BookingStatus) => Result;
  saveCity: (city: City) => Result;
  saveZone: (zone: Zone) => Result;
  deleteZone: (zoneId: string) => Result;
  saveCategory: (category: Category) => Result;
  saveService: (service: Service) => Result;
  saveAreaPrice: (price: AreaPrice) => Result;
  saveProvider: (provider: Provider) => Result;
  saveMyAvailability: (workingHours: WorkingHours[], timeOff: string[], acceptingWork: boolean) => Result;
  saveTechnicianProfile: (patch: TechnicianProfilePatch) => Result;
  blockSlot: (zoneId: string, date: string, windowId: string) => Result;
  reopenSlot: (zoneId: string, date: string, windowId: string) => Result;
  saveSettings: (settings: AppState["settings"]) => Result;
  markNoticesRead: () => void;
  reviewCoverageRequest: (id: string) => Result;
  resetDemo: () => void;
  saveAccessRole: (role: AccessRole) => Result;
  setAccessRoleStatus: (id: string, status: AccessRole["status"]) => Result;
  deleteAccessRole: (id: string) => Result;
}

const StoreContext = createContext<StoreValue | null>(null);

function loadState(): AppState {
  if (typeof localStorage === "undefined") return createSeedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as { version?: number; state?: AppState };
    if (parsed.version !== 1 || !parsed.state?.settings?.windows) return createSeedState();
    if (!parsed.state.accessRoles) parsed.state.accessRoles = defaultAccessRoles();
    return parsed.state;
  } catch {
    return createSeedState();
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state }));
  }, [state]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => setToasts((current) => current.slice(1)), 4200);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const api = useMemo<StoreValue>(() => {
    const toast = (message: string, tone: Toast["tone"]) => {
      if (!message) return;
      setToasts((current) => [...current, { id: `${Date.now()}-${current.length}`, message, tone }]);
    };
    const commit = (produce: (current: AppState) => Out, silent = false): Result => {
      const next = produce(stateRef.current);
      if (next.result.ok) {
        stateRef.current = next.state;
        setState(next.state);
      }
      if (!silent && next.result.message) toast(next.result.message, next.result.ok ? "ok" : "error");
      return next.result;
    };

    return {
      state,
      toasts,
      dismissToast: (id) => setToasts((current) => current.filter((item) => item.id !== id)),
      signIn: (email, password, expected) => commit((current) => signIn(current, email, password, expected)),
      signInWithGoogle: (identity) => commit((current) => signInWithGoogle(current, identity)),
      linkGoogle: (identity) => commit((current) => linkGoogle(current, identity)),
      unlinkGoogle: () => commit((current) => unlinkGoogle(current)),
      signOut: () => setState((current) => ({ ...current, session: null })),
      setPostal: (postal) => commit((current) => setPostal(current, postal)),
      clearPostal: () => setState((current) => ({ ...current, coverage: { postalCode: "", zoneId: null, status: "idle" } })),
      updateProfile: (patch) => commit((current) => updateProfile(current, patch)),
      saveAddress: (address) => commit((current) => saveAddress(current, address)),
      deleteAddress: (addressId) => commit((current) => deleteAddress(current, addressId)),
      requestCoverage: (input) => commit((current) => requestCoverage(current, input)),
      placeBooking: (input) => commit((current) => placeBooking(current, input)),
      cancelBooking: (bookingId, reason) => commit((current) => cancelBooking(current, bookingId, reason)),
      rescheduleBooking: (bookingId, date, windowId) => commit((current) => rescheduleBooking(current, bookingId, date, windowId)),
      reopenBooking: (bookingId) => commit((current) => reopenBooking(current, bookingId)),
      assignProvider: (bookingId, providerId) => commit((current) => assignProvider(current, bookingId, providerId)),
      setBookingStatus: (bookingId, status, detail) => commit((current) => setBookingStatus(current, bookingId, status, detail)),
      setInternalNote: (bookingId, note) => commit((current) => setInternalNote(current, bookingId, note)),
      acceptJob: (bookingId) => commit((current) => acceptJob(current, bookingId)),
      declineJob: (bookingId, reason) => commit((current) => declineJob(current, bookingId, reason)),
      advanceJob: (bookingId, status) => commit((current) => advanceJob(current, bookingId, status)),
      saveCity: (city) => commit((current) => saveCity(current, city)),
      saveZone: (zone) => commit((current) => saveZone(current, zone)),
      deleteZone: (zoneId) => commit((current) => deleteZone(current, zoneId)),
      saveCategory: (category) => commit((current) => saveCategory(current, category)),
      saveService: (service) => commit((current) => saveService(current, service)),
      saveAreaPrice: (price) => commit((current) => saveAreaPrice(current, price)),
      saveProvider: (provider) => commit((current) => saveProvider(current, provider)),
      saveMyAvailability: (workingHours, timeOff, acceptingWork) =>
        commit((current) => saveMyAvailability(current, workingHours, timeOff, acceptingWork)),
      saveTechnicianProfile: (patch) => commit((current) => updateTechnicianProfile(current, patch)),
      blockSlot: (zoneId, date, windowId) => commit((current) => blockSlot(current, zoneId, date, windowId)),
      reopenSlot: (zoneId, date, windowId) => commit((current) => reopenSlot(current, zoneId, date, windowId)),
      saveSettings: (settings) => commit((current) => saveSettings(current, settings)),
      markNoticesRead: () => commit((current) => markNoticesRead(current), true),
      reviewCoverageRequest: (id) => commit((current) => reviewCoverageRequest(current, id)),
      resetDemo: () => {
        setState(createSeedState());
        toast("Demo data restored on this browser.", "info");
      },
      saveAccessRole: (role) => commit((current) => saveAccessRole(current, role)),
      setAccessRoleStatus: (id, status) => commit((current) => setAccessRoleStatus(current, id, status)),
      deleteAccessRole: (id) => commit((current) => deleteAccessRole(current, id)),
    };
  }, [state, toasts]);

  return (
    <StoreContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`} role="status">
            <span>{item.message}</span>
            <button type="button" onClick={() => api.dismissToast(item.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used within StoreProvider");
  return value;
}
