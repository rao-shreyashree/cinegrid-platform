import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { NAV } from "@/lib/nav";
import LogoutButton from "./LogoutButton";
import NavLinks from "./NavLinks";

function roleLabel(role: string) {
  const s = role.replace("_", " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login"); // second check besides middleware

  const items = NAV.filter((n) => n.roles.includes(session.role));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="flex md:flex-col items-center md:items-stretch gap-4 md:gap-8 border-b md:border-b-0 md:border-r border-rule px-4 py-4 md:px-5 md:py-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-7 w-7 rounded-[3px] border-2 border-slate"
            style={{ background: "repeating-linear-gradient(115deg,#eceef2 0 6px,#1b2631 6px 12px)" }}
          />
          <span className="font-display text-xl font-bold">CineGrid</span>
        </div>
        <NavLinks items={items.map(({ href, label }) => ({ href, label }))} />
        <div className="ml-auto md:ml-0 md:mt-auto text-sm">
          <p className="font-medium">{session.name}</p>
          <p className="text-muted mb-1">{roleLabel(session.role)}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="px-5 py-6 md:px-10 md:py-8 min-w-0">{children}</main>
    </div>
  );
}
