import type { Role } from "./auth/roles";
import { ALL_ROLES } from "./auth/roles";

// Add your pages here when they exist (keep one item per line to avoid merge conflicts).
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ALL_ROLES },
  { href: "/schedule", label: "Calendar", roles: ALL_ROLES },
  { href: "/bookings", label: "Bookings", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/incidents", label: "Incidents", roles: ALL_ROLES },
];
