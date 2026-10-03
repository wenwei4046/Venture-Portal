"use client";

import { useState } from "react";
import type { CrmShowroom } from "@/lib/member/crm";
import s from "./member.module.css";
import c from "./MemberCrm.module.css";

/**
 * The showroom list, kept by the Boss and HOD in Settings: add a new one when
 * it opens, rename, or close one (its appointments stay; it takes no new
 * booking). Every salesperson's booking list follows at once.
 */
export default function MemberCrmShowrooms({ showrooms, onSave }: {
  showrooms: CrmShowroom[];
  /** id null = a new showroom. Resolves false when it was not saved (the reason is shown above the screen). */
  onSave: (id: string | null, name: string, active: boolean) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const run = async (save: () => Promise<boolean>, after?: () => void) => {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (ok) after?.();
  };
  const taken = (name: string, except?: string) => showrooms.some(r => r.id !== except && r.name.trim().toLowerCase() === name.trim().toLowerCase());

  return (
    <section className={s.card} aria-label="Showrooms">
      <h2>Showrooms</h2>
      <p className={s.caption}>Where customers can book. A closed showroom keeps its appointments but takes no new booking.</p>
      {showrooms.map(r => {
        const draft = names[r.id] ?? r.name;
        const changed = draft.trim() !== r.name && draft.trim() !== "" && !taken(draft, r.id);
        return <div key={r.id} className={c.rule}>
          <div className={c.ruleTop}>
            <input aria-label={`Name of ${r.name}`} value={draft} maxLength={80} disabled={busy}
              onChange={e => setNames(n => ({ ...n, [r.id]: e.target.value }))} />
            <label className={c.switch}>
              <input type="checkbox" checked={r.active !== false} disabled={busy}
                onChange={e => void run(() => onSave(r.id, r.name, e.target.checked))} />
              {r.active !== false ? "Open" : "Closed"}
            </label>
          </div>
          {changed && <button className={s.button} disabled={busy}
            onClick={() => void run(() => onSave(r.id, draft, r.active !== false), () => setNames(n => Object.fromEntries(Object.entries(n).filter(([k]) => k !== r.id))))}>Save name</button>}
        </div>;
      })}
      <form className={c.rule} onSubmit={e => { e.preventDefault(); if (adding.trim() && !taken(adding)) void run(() => onSave(null, adding, true), () => setAdding("")); }}>
        <label className={s.field}><span>New showroom</span>
          <input value={adding} maxLength={80} placeholder="e.g. Penang Showroom" disabled={busy} onChange={e => setAdding(e.target.value)} />
        </label>
        {adding.trim() && taken(adding) && <p className={s.caption}>There is already a showroom with that name.</p>}
        <button type="submit" className={`${s.button} ${s.primary}`} disabled={busy || !adding.trim() || taken(adding)}>Add showroom</button>
      </form>
    </section>
  );
}
