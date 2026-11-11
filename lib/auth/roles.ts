export type Role = "ADMIN" | "PRODUCTION_MANAGER" | "CREW";

export const ALL_ROLES: Role[] = ["ADMIN", "PRODUCTION_MANAGER", "CREW"];

/** Which roles may open which page prefix. First matching prefix wins. Add your routes here. */
export const ROUTE_ACCESS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/", roles: ALL_ROLES }, // exact "/" only; other paths need their own line
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/finance", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { prefix: "/people", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { prefix: "/vendors", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { prefix: "/dashboard", roles: ALL_ROLES },
  { prefix: "/productions", roles: ALL_ROLES },
  { prefix: "/resources", roles: ALL_ROLES },
  { prefix: "/bookings", roles: ["ADMIN", "PRODUCTION_MANAGER"] },
  { prefix: "/schedule", roles: ALL_ROLES },
  { prefix: "/incidents", roles: ALL_ROLES },
  { prefix: "/search", roles: ALL_ROLES },
];

export function rolesForPath(pathname: string): Role[] | null {
  const rule = ROUTE_ACCESS.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return rule ? rule.roles : null;
}
