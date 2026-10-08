"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBrandWeeksAdmin, saveBrandWeeksAdmin } from "@/app/(portal)/member-admin/brand-weeks-actions";
import { ARENA_WEEK_BRANDS, arenaShortDay, arenaWeekendLabel, type ArenaWeekBrand, type ArenaWeekPicks } from "@/lib/member/arena";
import {
  brandWeekChanges, brandWeeksAdminRows, brandWeeksToSave,
  type BrandWeekBooth, type BrandWeekCell, type BrandWeeksAdminSnapshot,
} from "@/lib/member/brand-weeks-admin";
import { formatIntlDate, formatMoney } from "@/lib/utils";
import m from "./member.module.css";
import s from "./MemberBrandWeeksAdmin.module.css";

const currentMonth = () => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).slice(0, 7);
const monthName = (period: string) => formatIntlDate(new Date(`${period}-01T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" }, "en-GB");
const savedOn = (at: string) => formatIntlDate(new Date(at), { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }, "en-GB");
const copyPicks = (picks: Record<string, ArenaWeekPicks>) => Object.fromEntries(Object.entries(picks).map(([id, weeks]) => [id, { ...weeks }]));
const boothName = (brand: string | null) => brand ?? "No brand";
const bills = (count: number) => `${count} bill${count === 1 ? "" : "s"}`;

/** What the cell says under its dropdown, from what is stored. */
function stateLine(cell: BrandWeekCell): string {
  switch (cell.state) {
    case "picked": return cell.pickedElsewhere ? `No ${cell.pick} booth this week — no place scores` : "Picked";
    case "unconfirmed": return `Unconfirmed · ${cell.scoringBrand}`;
    case "auto": return `Auto-located · ${cell.scoringBrand}`;
    default: return cell.booths.length ? "No brand to place" : "No bills";
  }
}

const stateHelp: Record<BrandWeekCell["state"], string> = {
  picked: "The brand picked for this week: its booth is the one place that earns points.",
  unconfirmed: "Not picked yet: the booth with the most bills counts until the week closes.",
  auto: "Nobody picked before the week closed: the booth with the most bills counts — auto-located.",
  none: "Nothing to place this week.",
};

function boothTitle(booth: BrandWeekBooth): string {
  return `${boothName(booth.brand)} · ${booth.venue} — ${bills(booth.orders)}, ${formatMoney(booth.sales)}`
    + `${booth.held > 0 ? ` · ${formatMoney(booth.held)} held below the deposit` : ""}${booth.scoring ? " · earns the points" : ""}`;
}

/**
 * "AKEMI 3" — the booth and its bills. Bills all still below the deposit read
 * "held", not 0: they were written there. A brand met at two fairs in one week
 * names the place too ("AKEMI 3 · SUNWAY PYRAMID").
 */
function boothLabel(booth: BrandWeekBooth, booths: readonly BrandWeekBooth[]): string {
  const count = booth.orders > 0 || booth.held <= 0 ? String(booth.orders) : "held";
  const twice = booths.filter(other => other.brand === booth.brand).length > 1;
  return `${boothName(booth.brand)} ${count}${twice ? ` · ${booth.venue.split(/\s+/).slice(0, 2).join(" ")}` : ""}`;
}

/**
 * People › Member services › Brand weeks (2026-10-03): the back office's half
 * of My brand weeks. A member picks the brand they worked each fair weekend
 * until seven days after its fair; after that only the ERP or the back office
 * changes it (user: 除非是 ERP 那边改，或者是后台这边改). Here a whole
 * department's month is one grid — every week settable, closed ones too —
 * with what each member picked or what the board guessed, and the booths they
 * wrote at that week, so the choice is made with the bills in view.
 */
export default function MemberBrandWeeksAdmin({ departments }: { departments: { id: string; name: string }[] }) {
  const [subDepartmentId, setSubDepartmentId] = useState(() => (departments.find(d => d.name.trim().toLowerCase() === "fair") ?? departments[0])?.id ?? "");
  const [period, setPeriod] = useState(currentMonth);
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<BrandWeeksAdminSnapshot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ArenaWeekPicks>>({});
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const request = useRef(0);

  useEffect(() => {
    if (!subDepartmentId) return;
    const sequence = ++request.current;
    let active = true;
    setBusy(true); setError("");
    void fetchBrandWeeksAdmin(subDepartmentId, period).then(result => {
      if (!active || request.current !== sequence) return;
      if (result.ok) { setSnapshot(result.data); setDrafts(copyPicks(result.data.picks)); }
      else { setSnapshot(null); setError(result.error); }
    }).catch(() => { if (active && request.current === sequence) { setSnapshot(null); setError("Brand weeks could not be loaded. Please try again."); } })
      .finally(() => { if (active && request.current === sequence) setBusy(false); });
    return () => { active = false; };
  }, [subDepartmentId, period, revision]);

  if (!departments.length) return <section className={m.card}><h2>Brand weeks</h2><p className={m.sub}>There is no Revenue department to set brand weeks for.</p></section>;

  const rows = snapshot ? brandWeeksAdminRows(snapshot) : [];
  const weeks = snapshot?.weeks ?? [];
  const stored = snapshot?.picks ?? {};
  const changes = snapshot ? brandWeekChanges(snapshot.period, stored, drafts) : 0;
  const picked = rows.reduce((count, row) => count + row.cells.filter(cell => drafts[row.person.id]?.[cell.week]).length, 0);
  const label = monthName(period);

  async function save() {
    if (!snapshot || saving) return;
    const toSave = brandWeeksToSave(snapshot.period, stored, drafts);
    const ids = Object.keys(toSave);
    if (!ids.length) return;
    setSaving(true); setError(""); setStatus("");
    try {
      const result = await saveBrandWeeksAdmin(snapshot.subDepartmentId, snapshot.period, toSave);
      if (!result.ok) { setError(result.error); return; }
      const names = ids.map(id => snapshot.people.find(person => person.id === id)?.name ?? "A member");
      setStatus(names.length === 1 ? `${names[0]}’s brand weeks are saved.` : `Brand weeks saved for ${names.length} members: ${names.join(", ")}.`);
      // The boards move with the picks: read the month again.
      setRevision(value => value + 1);
    } catch {
      setError("The brand weeks could not be saved. Please try again.");
    } finally { setSaving(false); }
  }

  return <section className={m.card} aria-labelledby="brand-weeks-heading">
    <h2 id="brand-weeks-heading">Brand weeks · {label}</h2>
    <p className={m.sub}>
      The Arena&apos;s Fair results give each member points at one booth a week — the brand picked for that week. A member picks their own until seven days after the fair; here any week can be set, closed ones too. A week nobody picked counts the booth they opened the most bills at.
    </p>
    <div className={`sheet-toolbar ${s.toolbar}`}>
      {departments.length > 1 && <label>
        <span>Department</span>
        <select aria-label="Department" value={subDepartmentId} disabled={changes > 0 || saving}
          onChange={event => { setSubDepartmentId(event.target.value); setSnapshot(null); setStatus(""); }}>
          {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </label>}
      <label>
        <span>Month</span>
        <input type="month" aria-label="Month" value={period} max={currentMonth()} disabled={changes > 0 || saving}
          onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setPeriod(event.target.value); setSnapshot(null); setStatus(""); } }} />
      </label>
      <button type="button" className={m.button} disabled={busy || saving || changes > 0} onClick={() => { setStatus(""); setRevision(value => value + 1); }}>
        {busy ? "Loading…" : "Refresh"}
      </button>
      {changes > 0 && <small>Save or discard the changes to switch the month or department.</small>}
    </div>
    {error && <p className="sheet-danger" role="alert">{error}</p>}
    {!snapshot && busy && <p className={m.sub}>Loading brand weeks…</p>}
    {snapshot && <div className="table-frame">
      <div className="table-frame-scroll">
        <table className={`ledger-table ${s.grid}`} aria-label={`Brand weeks, ${label}`}>
          <thead><tr>
            <th scope="col">Member</th>
            {weeks.map((lock, index) => <th scope="col" key={lock.week}>
              Week {index + 1}
              <small>{arenaWeekendLabel(lock.week)}</small>
              <small>{lock.locked ? `Closed ${arenaShortDay(lock.closesOn)}` : `Open until ${arenaShortDay(lock.closesOn)}`}</small>
            </th>)}
          </tr></thead>
          <tbody>
            {rows.map(({ person, cells }) => <tr key={person.id}>
              <td className={s.member}>
                <strong>{person.name}</strong>
                {person.title && <small>{person.title}</small>}
                {!person.hasLogin && <small>No member login</small>}
                {person.savedAt && <small>Saved {savedOn(person.savedAt)} · {person.savedBySelf ? "by the member" : person.savedBy ?? "back office"}</small>}
              </td>
              {cells.map((cell, index) => {
                const value = drafts[person.id]?.[cell.week] ?? "";
                const changed = (value || null) !== (cell.pick ?? null);
                return <td key={cell.week} data-changed={changed || undefined} data-state={cell.state}>
                  <select aria-label={`Brand for ${person.name}, week ${index + 1}`} value={value} disabled={saving}
                    onChange={event => {
                      const brand = event.target.value as ArenaWeekBrand | "";
                      setDrafts(previous => ({ ...previous, [person.id]: { ...(previous[person.id] ?? {}), [cell.week]: brand || undefined } }));
                      setStatus("");
                    }}>
                    <option value="">Not picked</option>
                    {ARENA_WEEK_BRANDS.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                  </select>
                  <small title={changed ? "Saved when you press Save" : stateHelp[cell.state]}>{changed ? "Changed · not saved yet" : stateLine(cell)}</small>
                  {cell.booths.length > 0 && <small className={s.booths}>
                    {cell.booths.map((booth, at) => <span key={`${booth.brand ?? ""}|${booth.venue}|${at}`} title={boothTitle(booth)} data-scoring={booth.scoring || undefined}>
                      {boothLabel(booth, cell.booths)}
                    </span>)}
                  </small>}
                </td>;
              })}
            </tr>)}
            {!rows.length && <tr><td colSpan={weeks.length + 1}>Nobody is a member of this department yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-frame-foot">
        <span>{picked} of {rows.length * weeks.length} weeks picked{changes ? ` · ${changes} change${changes === 1 ? "" : "s"} not saved` : ""}{busy ? " · refreshing…" : ""}</span>
        <span className={s.actions}>
          <button type="button" className={m.button} disabled={!changes || saving} onClick={() => { setDrafts(copyPicks(stored)); setStatus(""); }}>Discard</button>
          <button type="button" className={`${m.button} ${m.primary}`} disabled={!changes || saving} onClick={() => void save()}>
            {saving ? "Saving…" : changes ? `Save ${changes} change${changes === 1 ? "" : "s"}` : "Save"}
          </button>
        </span>
      </div>
    </div>}
    {status && <p role="status" aria-label="Brand weeks save status" className={m.notice}>{status}</p>}
    {snapshot && <p className={m.caption}>
      Under each week: what is stored, then each booth the member wrote at that week and how many bills — the bold one earns the week&apos;s points. Bills written at another booth still count in their sales; that place just earns no points.
    </p>}
  </section>;
}
