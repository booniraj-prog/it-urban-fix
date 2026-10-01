import type { AccessRole, Role } from "../types";

export interface PermissionDef {
  id: string;
  label: string;
  detail: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { id: "browse", label: "Browse services", detail: "See the catalog, coverage, and quotes." },
  { id: "book", label: "Book own visits", detail: "Confirm, reschedule, and cancel as a customer." },
  { id: "jobs", label: "Work assigned jobs", detail: "Open a job, accept it, and record progress." },
  { id: "availability", label: "Edit own availability", detail: "Set working hours and time off." },
  { id: "dispatch", label: "Dispatch jobs", detail: "Assign and reassign technicians." },
  { id: "catalog", label: "Edit the catalog", detail: "Change services, prices, and categories." },
  { id: "areas", label: "Edit service areas", detail: "Change cities, zones, and coverage." },
  { id: "capacity", label: "Edit capacity", detail: "Change windows, blocks, and lead time." },
  { id: "reports", label: "View reports", detail: "Read estimated booking reports." },
  { id: "roles", label: "Manage roles", detail: "Edit the role directory." },
];

const LOCKED: Record<Role, string[]> = {
  customer: ["browse", "book"],
  provider: ["jobs", "availability"],
  admin: ["dispatch", "catalog", "areas", "capacity", "reports", "roles"],
};

export function defaultAccessRoles(): AccessRole[] {
  return [
    {
      id: "role-customer",
      name: "Customer",
      purpose: "Books IT support and follows the quote and visit status.",
      status: "active",
      permissions: ["browse", "book"],
      systemKey: "customer",
    },
    {
      id: "role-provider",
      name: "Technician",
      purpose: "Sees assigned jobs, accepts work, and updates progress.",
      status: "active",
      permissions: ["jobs", "availability"],
      systemKey: "provider",
    },
    {
      id: "role-admin",
      name: "Operations",
      purpose: "Runs coverage, dispatch, capacity, reports, and roles.",
      status: "active",
      permissions: ["dispatch", "catalog", "areas", "capacity", "reports", "roles"],
      systemKey: "admin",
    },
  ];
}

export function lockedPermissions(role: AccessRole): string[] {
  return role.systemKey ? LOCKED[role.systemKey] : [];
}

export function permissionLabel(id: string): string {
  return PERMISSIONS.find((item) => item.id === id)?.label ?? id;
}
