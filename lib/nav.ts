import type { Role } from "./auth/roles";
import { ALL_ROLES } from "./auth/roles";

// Add your pages here when they exist (keep one item per line to avoid merge conflicts).
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ALL_ROLES },
  { href: "/finance", label: "Finance", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/people", label: "Actors and crew", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/my-work", label: "My schedule", roles: ["CREW"] },
  { href: "/search",  label: "Search",  roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/vendors", label: "Vendors", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/schedule", label: "Calendar", roles: ALL_ROLES },
  { href: "/bookings", label: "Bookings", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { href: "/incidents", label: "Incidents", roles: ALL_ROLES },
];
