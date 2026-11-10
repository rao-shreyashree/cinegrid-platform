import type { Role } from "@/lib/auth/roles";
import { ALL_ROLES } from "@/lib/auth/roles";

// Add your pages here when they exist (keep one item per line to avoid merge conflicts).
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", roles: ALL_ROLES },
];
