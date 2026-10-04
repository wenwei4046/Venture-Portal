"use client";

import { useEffect, useRef, useState } from "react";
import { fetchClaimRatesAdmin, saveClaimRatesAdmin } from "@/app/(portal)/member-admin/claim-rates-actions";
import {
  claimRatesChanged, claimRatesDraft, claimRatesProblems, claimRatesToSave,
  type ClaimRatesAdmin, type ClaimRatesDraft,
} from "@/lib/member/claim-rates-admin";
import { formatIntlDate, formatMoney } from "@/lib/utils";
import m from "./member.module.css";
import s from "./MemberClaimRatesAdmin.module.css";

const savedOn = (at: string) => formatIntlDate(new Date(at), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }, "en-GB");

/**
 * People › Member services › Claim rates (2026-10-05): what a member's fair
 * claim pays. The member's form shows these and cannot change the amount; it
 * is worked out in the database from them when the claim is sent.
 */
export default function MemberClaimRatesAdmin() {
  const [saved, setSaved] = useState<ClaimRatesAdmin | null>(null);
  const [draft, setDraft] = useState<ClaimRatesDraft | null>(null);
  const [busy, setBusy] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const added = useRef(0);

  useEffect(() => {
    let active = true;
    setBusy(true); setError("");
    void fetchClaimRatesAdmin().then(result => {
      if (!active) return;
      if (result.ok) { setSaved(result.data); setDraft(claimRatesDraft(result.data)); }
      else setError(result.error);
    }).catch(() => { if (active) setError("Claim rates could not be loaded. Please try again."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [revision]);

  const changed = !!saved && !!draft && claimRatesChanged(saved, draft);
  const problems = draft ? claimRatesProblems(draft) : [];
  const edit = (next: Partial<ClaimRatesDraft>) => { setDraft(d => (d ? { ...d, ...next } : d)); setStatus(""); };
  const editRegion = (key: string, next: { name?: string; spots?: string }) =>
    edit({ regions: (draft?.regions ?? []).map(g => (g.key === key ? { ...g, ...next } : g)) });

  async function save() {
    if (!draft || saving || problems.length) return;
    setSaving(true); setError(""); setStatus("");
    try {
      const result = await saveClaimRatesAdmin(claimRatesToSave(draft));
      if (!result.ok) { setError(result.error); return; }
      setSaved(result.data); setDraft(claimRatesDraft(result.data));
      setStatus("Claim rates saved. Claims sent from now on are worked out with them; claims already sent keep their amounts.");
    } catch {
      setError("The claim rates could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  return <section className={m.card} aria-labelledby="claim-rates-heading">
    <h2 id="claim-rates-heading">Claim rates</h2>
    <p className={m.sub}>
      A member&apos;s fair claim is worked out from these, never typed. <strong>Outstation</strong> pays the route&apos;s spots × the rate per spot, counted from the base; no invoice. <strong>Airbnb</strong> pays the rate × people × nights, with the invoice. A claim keeps the amount it was sent with.
    </p>
    {error && <p className="sheet-danger" role="alert">{error}</p>}
    {!draft && busy && <p className={m.sub}>Loading claim rates…</p>}
    {draft && <>
      <div className={s.fields}>
        <label><span>Base</span>
          <input value={draft.base} maxLength={60} disabled={saving} onChange={e => edit({ base: e.target.value })} aria-label="Base every route starts from" />
          <small>Where every outstation route starts</small>
        </label>
        <label><span>Rate per spot (RM)</span>
          <input inputMode="decimal" value={draft.perSpot} disabled={saving} onChange={e => edit({ perSpot: e.target.value })} aria-label="Rate per spot" />
          <small>Blank = not set; members see &ldquo;Rate not set yet&rdquo;</small>
        </label>
        <label><span>Airbnb · per person per night (RM)</span>
          <input inputMode="decimal" value={draft.perPaxNight} disabled={saving} onChange={e => edit({ perPaxNight: e.target.value })} aria-label="Airbnb rate per person per night" />
          <small>× people × nights</small>
        </label>
      </div>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className={`ledger-table ${s.regions}`} aria-label="Regions and their spots">
            <thead><tr><th scope="col">Region</th><th scope="col" className="num">Spots from {draft.base.trim() || "the base"}</th><th scope="col" className="num">Outstation pays</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {draft.regions.map((g, i) => {
                const pays = /^\d{1,3}$/.test(g.spots.trim()) && /^\d+(\.\d{1,2})?$/.test(draft.perSpot.trim())
                  ? formatMoney(Number(g.spots) * Number(draft.perSpot)) : "—";
                return <tr key={g.key}>
                  <td><input value={g.name} maxLength={40} disabled={saving} aria-label={`Region ${i + 1} name`} onChange={e => editRegion(g.key, { name: e.target.value })} /></td>
                  <td className="num"><input className={s.spots} inputMode="numeric" value={g.spots} disabled={saving} aria-label={`Spots for ${g.name || `region ${i + 1}`}`} onChange={e => editRegion(g.key, { spots: e.target.value })} /></td>
                  <td className="num">{pays}</td>
                  <td><button type="button" className={m.button} disabled={saving} onClick={() => edit({ regions: draft.regions.filter(x => x.key !== g.key) })}>Remove</button></td>
                </tr>;
              })}
              {!draft.regions.length && <tr><td colSpan={4}>No regions yet — add one, or members cannot claim outstation.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-frame-foot">
          <span>
            <button type="button" className={m.button} disabled={saving || draft.regions.length >= 60}
              onClick={() => { added.current += 1; edit({ regions: [...draft.regions, { key: `new-${added.current}`, id: null, name: "", spots: "0" }] }); }}>
              Add region
            </button>
            {saved?.updatedAt && <small className={s.saved}>Last saved {savedOn(saved.updatedAt)}{saved.updatedBy ? ` by ${saved.updatedBy}` : ""}</small>}
          </span>
          <span className={s.actions}>
            <button type="button" className={m.button} disabled={!changed || saving} onClick={() => { if (saved) setDraft(claimRatesDraft(saved)); setStatus(""); }}>Discard</button>
            <button type="button" className={`${m.button} ${m.primary}`} disabled={!changed || saving || problems.length > 0} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      </div>
      {changed && problems.length > 0 && <p className="sheet-danger" role="alert">{problems[0]}</p>}
      <p className={m.caption}>A region removed here stays on the claims that used it; members simply cannot pick it any more. A region inside the base, like KL, is 0 spots.</p>
    </>}
    {status && <p role="status" className={m.notice}>{status}</p>}
    {!busy && !draft && !error && <button type="button" className={m.button} onClick={() => setRevision(v => v + 1)}>Try again</button>}
  </section>;
}
