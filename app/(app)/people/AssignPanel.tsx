"use client";
import { useCallback, useEffect, useState } from "react";
import { api, BTN_QUIET, errText, INPUT, Notice } from "../finance/shared";
import { Person, SceneOption, SceneSlot, slotText } from "./shared";

type Props = {
  kind: "actors" | "crew";
  person: Person;
  onChanged: () => void;
  notify: (n: Notice | null) => void;
};

export default function AssignPanel({ kind, person, onChanged, notify }: Props) {
  const [assigned, setAssigned] = useState<SceneSlot[] | null>(null);
  const [options, setOptions] = useState<SceneOption[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const base = `/api/people/${kind}/${person.id}/assignments`;

  const loadAssigned = useCallback(async () => {
    try {
      setAssigned((await api<{ assignments: SceneSlot[] }>(base)).assignments);
    } catch (e) {
      notify({ kind: "err", text: errText(e) });
      setAssigned([]);
    }
  }, [base, notify]);

  const loadOptions = useCallback(async () => {
    try {
      const r = await api<{ scenes: SceneOption[] }>(
        `/api/people/scenes?kind=${kind}&id=${person.id}&q=${encodeURIComponent(q)}`
      );
      setOptions(r.scenes);
    } catch (e) {
      notify({ kind: "err", text: errText(e) });
      setOptions([]);
    }
  }, [kind, person.id, q, notify]);

  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  useEffect(() => {
    const t = setTimeout(loadOptions, 250); // wait for the typing to pause
    return () => clearTimeout(t);
  }, [loadOptions]);

  async function change(method: "POST" | "DELETE", s: SceneSlot) {
    setBusy(true);
    notify(null);
    try {
      if (method === "POST") {
        await api(base, { method, body: JSON.stringify({ scene_id: s.scene_id }) });
        notify({ kind: "ok", text: `${person.name} assigned to ${s.production}, scene ${s.scene_number}.` });
      } else {
        await api(`${base}?scene_id=${s.scene_id}`, { method });
        notify({ kind: "ok", text: `${person.name} removed from ${s.production}, scene ${s.scene_number}.` });
      }
      await Promise.all([loadAssigned(), loadOptions()]);
      onChanged();
    } catch (e) {
      notify({ kind: "err", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 border-t border-rule bg-white/50 px-5 py-6 lg:grid-cols-2">
      <section aria-labelledby={`as-${kind}-${person.id}`}>
        <h3 id={`as-${kind}-${person.id}`} className="font-display text-lg font-semibold">
          Assigned scenes{assigned ? ` (${assigned.length})` : ""}
        </h3>
        {assigned === null && <p className="mt-3 text-muted">Loading scenes</p>}
        {assigned && assigned.length === 0 && (
          <p className="mt-3 text-muted">Not assigned to any scene yet. Pick one from the list to start.</p>
        )}
        <ul className="mt-3 max-h-80 overflow-y-auto">
          {assigned?.map((s) => (
            <li key={s.scene_id} className="flex items-start justify-between gap-4 border-t border-rule py-2.5 text-sm">
              <div>
                <div className="font-medium">{s.production}, scene {s.scene_number}</div>
                <div className="text-muted">{slotText(s)}</div>
              </div>
              <button type="button" className={BTN_QUIET} disabled={busy} onClick={() => change("DELETE", s)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`add-${kind}-${person.id}`}>
        <h3 id={`add-${kind}-${person.id}`} className="font-display text-lg font-semibold">Assign to a scene</h3>
        <label className="mt-3 grid gap-1 text-sm">
          Search by production title
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT} max-w-sm`} />
        </label>
        {options === null && <p className="mt-3 text-muted">Loading scenes</p>}
        {options && options.length === 0 && (
          <p className="mt-3 text-muted">No open scenes match. Managers only see scenes of their own productions.</p>
        )}
        <ul className="mt-3 max-h-80 overflow-y-auto">
          {options?.map((s) => (
            <li key={s.scene_id} className="flex items-start justify-between gap-4 border-t border-rule py-2.5 text-sm">
              <div>
                <div className="font-medium">{s.production}, scene {s.scene_number}</div>
                <div className="text-muted">{slotText(s)}</div>
              </div>
              <button type="button" className={BTN_QUIET} disabled={busy} onClick={() => change("POST", s)}>
                Assign
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
