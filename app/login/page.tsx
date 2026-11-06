"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Login failed");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="clapper">
          {/* The hinged stick snaps shut while the sign-in request is running. */}
          <div className={`clapper-arm ${busy ? "clap" : ""}`} aria-hidden="true" />
          <div className="clapper-stick" aria-hidden="true" />
          <form onSubmit={onSubmit} className="board space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold">CineGrid</h1>
              <p className="text-sm text-chalk/70 mt-1">Sign in to the film city desk</p>
            </div>
            <label className="block text-sm text-chalk/80">
              Email
              <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="block text-sm text-chalk/80">
              Password
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-[#ff8a8a]">{error}</p>}
            <button
              disabled={busy}
              className="w-full rounded-sm bg-tape py-2.5 font-semibold text-ink hover:bg-tape-dark disabled:opacity-60"
            >
              {busy ? "Signing in" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
