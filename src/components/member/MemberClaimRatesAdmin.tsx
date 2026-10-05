"use client";

import { useEffect, useRef, useState } from "react";
import { fetchClaimRatesAdmin, saveClaimRatesAdmin } from "@/app/(portal)/member-admin/claim-rates-actions";
import {
  airbnbExample, claimRatesChanged, claimRatesDraft, claimRatesProblems, claimRatesToSave,
  type ClaimRatesAdmin, type ClaimRatesDraft,
} from "@/lib/member/claim-rates-admin";
import { formatIntlDate, formatMoney } from "@/lib/utils";
import m from "./member.module.css";
import s from "./MemberClaimRatesAdmin.module.css";

const savedOn = (at: string) => formatIntlDate(new Date(at), { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }, "en-GB");
const fairDay = (day: string) => formatIntlDate(new Date(`${day}T00:00:00Z`), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }, "en-GB");

/**
 * People › Member services › Claim rates (2026-10-05): what a member's fair
 * claim pays. The member's form shows these and cannot change the amount; it
 * is worked out in the database from them when the claim is sent. Since
 * 2026-10-06 a region may be flown to, a small Airbnb group claims its invoice
 * up to a limit a night (HR sets how many people and the limit), and every
 * venue the ERP's fairs name is given its region here.
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
  const editRegion = (key: string, next: { name?: string; spots?: string; planeTicket?: boolean }) =>
    edit({ regions: (draft?.regions ?? []).map(g => (g.key === key ? { ...g, ...next } : g)) });
  const regionOf = (venue: string) => (draft && draft.regions.some(g => g.key === draft.venues[venue]) ? draft.venues[venue] : "");
  const unset = saved && draft ? saved.venues.filter(v => !regionOf(v.key)).length : 0;

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

  const footer = (
    <span className={s.actions}>
      <button type="button" className={m.button} disabled={!changed || saving} onClick={() => { if (saved) setDraft(claimRatesDraft(saved)); setStatus(""); }}>Discard</button>
      <button type="button" className={`${m.button} ${m.primary}`} disabled={!changed || saving || problems.length > 0} onClick={() => void save()}>
        {saving ? "Saving…" : "Save"}
      </button>
    </span>
  );

  return <section className={m.card} aria-labelledby="claim-rates-heading">
    <h2 id="claim-rates-heading">Claim rates</h2>
    <p className={m.sub}>
      A member&apos;s fair claim is for their own brand week, and is worked out from these. <strong>Outstation</strong> pays the route&apos;s spots × the rate per spot, counted from the base, to the region set below for the fair&apos;s venue; no invoice — except a region ticked <strong>Plane ticket</strong>, where the member types the ticket&apos;s price and adds its invoice. <strong>Airbnb</strong> comes with its invoice: a small group types the invoice&apos;s total and is paid it, up to the limit a night; a bigger group is paid the rate × people × nights. A claim keeps the amount it was sent with.
    </p>
    {error && <p className="sheet-danger" role="alert">{error}</p>}
    {!draft && busy && <p className={m.sub}>Loading claim rates…</p>}
    {draft && saved && <>
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
          <small>× people × nights, for a group bigger than the small one</small>
        </label>
        <label><span>Airbnb · small group, up to (people)</span>
          <input inputMode="numeric" value={draft.groupMaxPax} disabled={saving} onChange={e => edit({ groupMaxPax: e.target.value })} aria-label="Airbnb small group, up to this many people" />
          <small>Up to this many claim their invoice&apos;s total, whoever they are</small>
        </label>
        <label><span>Airbnb · small group, up to a night (RM)</span>
          <input inputMode="decimal" value={draft.groupCapPerNight} disabled={saving} onChange={e => edit({ groupCapPerNight: e.target.value })} aria-label="Airbnb small group, the most a night" />
          <small>The invoice is paid up to this × nights; blank = every group per person</small>
        </label>
      </div>
      {airbnbExample(draft) && <p className={m.caption}>{airbnbExample(draft)}</p>}
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className={`ledger-table ${s.regions}`} aria-label="Regions and their spots">
            <thead><tr><th scope="col">Region</th><th scope="col" className="num">Spots from {draft.base.trim() || "the base"}</th><th scope="col">Plane ticket</th><th scope="col" className="num">Outstation pays</th><th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody>
              {draft.regions.map((g, i) => {
                const pays = g.planeTicket ? "Ticket price · invoice"
                  : /^\d{1,3}$/.test(g.spots.trim()) && /^\d+(\.\d{1,2})?$/.test(draft.perSpot.trim()) ? formatMoney(Number(g.spots) * Number(draft.perSpot)) : "—";
                return <tr key={g.key}>
                  <td><input value={g.name} maxLength={40} disabled={saving} aria-label={`Region ${i + 1} name`} onChange={e => editRegion(g.key, { name: e.target.value })} /></td>
                  <td className="num"><input className={s.spots} inputMode="numeric" value={g.spots} disabled={saving || g.planeTicket} aria-label={`Spots for ${g.name || `region ${i + 1}`}`} onChange={e => editRegion(g.key, { spots: e.target.value })} /></td>
                  <td><label className={s.tick}><input type="checkbox" checked={g.planeTicket} disabled={saving} onChange={e => editRegion(g.key, { planeTicket: e.target.checked })} aria-label={`${g.name || `Region ${i + 1}`} is flown to`} /> Flown to</label></td>
                  <td className="num">{pays}</td>
                  <td><button type="button" className={m.button} disabled={saving} onClick={() => edit({ regions: draft.regions.filter(x => x.key !== g.key) })}>Remove</button></td>
                </tr>;
              })}
              {!draft.regions.length && <tr><td colSpan={5}>No regions yet — add one, or members cannot claim outstation.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-frame-foot">
          <span>
            <button type="button" className={m.button} disabled={saving || draft.regions.length >= 60}
              onClick={() => { added.current += 1; edit({ regions: [...draft.regions, { key: `new-${added.current}`, id: null, name: "", spots: "0", planeTicket: false }] }); }}>
              Add region
            </button>
            {saved.updatedAt && <small className={s.saved}>Last saved {savedOn(saved.updatedAt)}{saved.updatedBy ? ` by ${saved.updatedBy}` : ""}</small>}
          </span>
          {footer}
        </div>
      </div>
      <p className={m.caption}>A region removed here stays on the claims that used it; its venues are left without a region. A region inside the base, like KL, is 0 spots. A plane ticket has no spots: its price is the invoice&apos;s.</p>

      <div className={`sect-head ${s.venuesHead}`}>
        <h2>Venues</h2>
        <span className="rule" aria-hidden />
        <span className="count">{saved.venues.length} VENUES · {unset ? `${unset} WITHOUT A REGION` : "ALL SET"}</span>
      </div>
      <p className={m.sub}>Every venue the ERP&apos;s fairs have named, newest fair first — a new one appears here by itself. An outstation claim&apos;s region is the one set for its fair&apos;s venue; a venue without one cannot be claimed for.</p>
      <div className="table-frame">
        <div className="table-frame-scroll">
          <table className={`ledger-table ${s.regions}`} aria-label="Venues and their regions">
            <thead><tr><th scope="col">Venue</th><th scope="col" className="num">Fairs</th><th scope="col">Last fair</th><th scope="col">Region</th></tr></thead>
            <tbody>
              {saved.venues.map(v => {
                const region = regionOf(v.key);
                return <tr key={v.key}>
                  <td>{v.name}</td>
                  <td className="num">{v.fairs}</td>
                  <td>{v.lastFair ? fairDay(v.lastFair) : "—"}</td>
                  <td>
                    <select className={s.select} value={region} disabled={saving} aria-label={`Region of ${v.name}`}
                      onChange={e => edit({ venues: { ...draft.venues, [v.key]: e.target.value } })}>
                      <option value="">Not set</option>
                      {draft.regions.filter(g => g.name.trim()).map(g => <option key={g.key} value={g.key}>{g.name.trim()}</option>)}
                    </select>
                    {!region && <span className={`chip ${s.unset}`}>No region</span>}
                  </td>
                </tr>;
              })}
              {!saved.venues.length && <tr><td colSpan={4}>No fair has named a venue yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-frame-foot"><span />{footer}</div>
      </div>
      {changed && problems.length > 0 && <p className="sheet-danger" role="alert">{problems[0]}</p>}
    </>}
    {status && <p role="status" className={m.notice}>{status}</p>}
    {!busy && !draft && !error && <button type="button" className={m.button} onClick={() => setRevision(v => v + 1)}>Try again</button>}
  </section>;
}
