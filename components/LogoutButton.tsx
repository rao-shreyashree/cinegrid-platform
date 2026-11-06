"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="rounded-md border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
