"use client";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api, BTN_PRIMARY, BTN_QUIET, errText, FOCUS, INPUT, Notice, TAPE } from "../finance/shared";
import AssignPanel from "./AssignPanel";
import { Person } from "./shared";

type Kind = "actors" | "crew";

export default function PeoplePage() {
  const [kind, setKind] = useState<Kind>("actors");
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople((await api<{ people: Person[] }>(`/api/people/${kind}`)).people);
      setError("");
    } catch (e) {
      setError(errText(e));
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  function switchTab(k: Kind) {
    if (k === kind) return;
    setKind(k);
    setPeople(null);
    setQ("");
    setRole("");
    setOpenId(null);
    setAdding(false);
    setNotice(null);
  }

  const roles = useMemo(
    () => Array.from(new Set((people ?? []).map((p) => p.crew_role).filter((r): r is string => !!r))).sort(),
    [people]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (people ?? []).filter(
      (p) => (needle === "" || p.name.toLowerCase().includes(needle)) && (role === "" || p.crew_role === role)
    );
  }, [people, q, role]);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    setNotice(null);
    try {
      await api(`/api/people/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          contact_info: String(fd.get("contact_info") ?? ""),
          ...(kind === "crew" ? { crew_role: String(fd.get("crew_role") ?? "") } : {}),
        }),
      });
      setNotice({ kind: "ok", text: `${String(fd.get("name"))} added.` });
      form.reset();
      setAdding(false);
      await load();
    } catch (err) {
      setNotice({ kind: "err", text: errText(err) });
    } finally {
      setBusy(false);
    }
  }

  const label = kind === "actors" ? "actor" : "crew member";

  return (
    <div className="max-w-6xl">
      <h1 className="font-display text-4xl font-bold tracking-tight">Actors and crew</h1>
      <p className="mt-1 text-muted">The talent pool, and who is booked into which scene.</p>

      <div role="tablist" aria-label="People" className="mt-8 flex gap-6 border-b border-rule">
        {(["actors", "crew"] as const).map((k) => (
          <button
            key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => switchTab(k)}
            className={`-mb-px border-b-4 pb-2 font-display text-lg font-semibold ${FOCUS} ${kind === k ? "" : "border-transparent text-muted"}`}
            style={kind === k ? { borderColor: TAPE.yellow } : undefined}
          >
            {k === "actors" ? "Actors" : "Crew"}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-6 empty:hidden">
        {notice && (
          <p
            role={notice.kind === "err" ? "alert" : "status"}
            className="border-l-4 bg-white/60 py-2.5 pl-4 pr-4"
            style={{ borderColor: notice.kind === "err" ? TAPE.red : TAPE.green }}
          >
            {notice.text}
          </p>
        )}
      </div>
      {error && <p role="alert" className="mt-6 text-alert">{error}</p>}

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-sm">
          Search by name
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT} w-64`} />
        </label>
        {kind === "crew" && (
          <label className="grid gap-1 text-sm">
            Crew role
            <select value={role} onChange={(e) => setRole(e.target.value)} className={INPUT}>
              <option value="">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        <button type="button" className={BTN_PRIMARY} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          {adding ? "Cancel" : `Add ${label}`}
        </button>
        {people && <span className="pb-2 text-sm text-muted">Showing {rows.length} of {people.length}</span>}
      </div>

      {adding && (
        <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-4 border-l-4 bg-white/50 p-4" style={{ borderColor: TAPE.yellow }}>
          <label className="grid gap-1 text-sm">
            Name
            <input name="name" required minLength={2} className={`${INPUT} w-60`} />
          </label>
          {kind === "crew" && (
            <label className="grid gap-1 text-sm">
              Crew role
              <input name="crew_role" required minLength={2} list="crew-roles" className={`${INPUT} w-60`} />
              <datalist id="crew-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
            </label>
          )}
          <label className="grid gap-1 text-sm">
            Phone or email
            <input name="contact_info" className={`${INPUT} w-60`} />
          </label>
          <button type="submit" className={BTN_PRIMARY} disabled={busy}>Save {label}</button>
        </form>
      )}

      {!people && !error && <p className="mt-8 text-muted">Loading the roster</p>}

      {people && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="text-muted">
              <tr className="[&>th]:pb-2 [&>th]:font-normal">
                <th>Name</th>
                {kind === "crew" && <th>Crew role</th>}
                <th>Contact</th>
                <th className="text-right">Scenes</th>
                <th className="text-right">Productions</th>
                {kind === "crew" && <th className="pl-6">App login</th>}
                <th><span className="sr-only">Assignments</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const open = openId === p.id;
                const cols = kind === "crew" ? 7 : 5;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-rule [&>td]:py-3">
                      <td className="pr-4 font-medium">{p.name}</td>
                      {kind === "crew" && <td className="pr-4">{p.crew_role}</td>}
                      <td className="pr-4 text-muted">{p.contact_info ?? "None on file"}</td>
                      <td className="text-right tabular-nums">{p.scenes}</td>
                      <td className="text-right tabular-nums">{p.productions}</td>
                      {kind === "crew" && <td className="pl-6">{p.has_login ? "Has login" : "No login"}</td>}
                      <td className="pl-4 text-right">
                        <button
                          type="button" className={BTN_QUIET} aria-expanded={open}
                          aria-controls={`as-row-${kind}-${p.id}`}
                          onClick={() => { setNotice(null); setOpenId(open ? null : p.id); }}
                        >
                          {open ? "Hide scenes" : "Scenes"}
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr id={`as-row-${kind}-${p.id}`}>
                        <td colSpan={cols} className="p-0">
                          <AssignPanel kind={kind} person={p} onChanged={load} notify={setNotice} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="border-t border-rule py-6 text-muted">No one matches. Clear the search or choose another role.</p>
          )}
        </div>
      )}
    </div>
  );
}
