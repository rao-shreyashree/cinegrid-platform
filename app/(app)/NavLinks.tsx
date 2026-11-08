"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex md:flex-col gap-1 md:gap-0.5">
      {items.map((n) => {
        const active = path === n.href || path.startsWith(n.href + "/");
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`relative rounded-sm px-3 py-2 text-[15px] ${
              active ? "font-semibold text-ink bg-panel" : "text-muted hover:text-ink hover:bg-panel/60"
            }`}
          >
            {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-tape" aria-hidden="true" />}
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
