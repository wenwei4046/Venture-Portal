"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { initials, rm2 } from "../format";
import type { ClaimWeek, FormOptions, RequestKindVM } from "./profile-vm";
import { claimAmount, nightsBetween } from "@/lib/member/claim-rules";
import s from "./profile.module.css";

const CAT_OUT = "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18";
const CAT_AIR = "M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z";
const CAMERA = "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
const CLOSE = "M6 6l12 12M18 6 6 18";

export type { ClaimWeek, FormOptions };
export type SubmitOutcome = { ok: true; code: string } | { ok: false; error: string };

const TEXT: Record<RequestKindVM, [string, string, string, string]> = {
  claim: ["Submit claim", "Outstation or Airbnb stay for a fair", "Review & submit claim", "HR will check your claim. Payment is tracked in Requests."],
  replacement: ["Submit replacement", "Replace, transfer or release a team member", "Review & submit", "HR reviews it, and the receiving department confirms if it is a transfer."],
  waiting: ["Submit waiting list", "Bring a new member into the team", "Review & submit", "HR matches the request to an open place by eligibility and start date."],
};
const DESTS = [
  ["department_exit", "Leave this sub-department", "Stays with the company"],
  ["transfer", "Transfer", "Moves to another sub-department"],
  ["company_exit", "Exit the company", "Leaves Houzs"],
] as const;
const SOURCES = [
  ["new", "New member joining", "Someone new takes the place"],
  ["existing", "Existing member", "Someone already in Houzs"],
  ["waiting", "From the waiting list", "Use an approved waiting-list request"],
  ["vacancy", "No replacement", "Release the position"],
] as const;

/** The request form (lines 1553–1679): claim, replacement or waiting list, then the request ID. */
export default function RequestForm({ kind, options, revising, readOnly, onSubmit, onClose }: {
  kind: RequestKindVM | null;
  options: FormOptions;
  /** HR returned this request: its details come back to be updated. */
  revising: { id: string; detail: Record<string, unknown> } | null;
  /** A Principal viewing somebody: the form fills in with that person's choices, and sends nothing. */
  readOnly: boolean;
  onSubmit: (form: FormData) => Promise<SubmitOutcome>;
  onClose: () => void;
}) {
  const open = kind !== null;
  // A fresh form every time it opens; the same key on a retry (idempotent submission).
  const [session, setSession] = useState(0);
  useEffect(() => { if (open) setSession(n => n + 1); }, [open, kind]);
  return (
    <Sheet open={open} onClose={onClose} z={23} height="90%" className={s.rfPanel} label={kind ? TEXT[kind][0] : "Request"}>
      {kind && <FormBody key={`${kind}-${session}`} kind={kind} options={options} revising={revising} readOnly={readOnly} onSubmit={onSubmit} onClose={onClose} />}
    </Sheet>
  );
}

function FormBody({ kind, options, revising, readOnly, onSubmit, onClose }: {
  kind: RequestKindVM;
  options: FormOptions;
  revising: { id: string; detail: Record<string, unknown> } | null;
  readOnly: boolean;
  onSubmit: (form: FormData) => Promise<SubmitOutcome>;
  onClose: () => void;
}) {
  const [title, sub, cta, doneText] = TEXT[kind];
  const prior = revising?.detail ?? {};
  const str = (key: string) => (typeof prior[key] === "string" ? (prior[key] as string) : "");
  const idem = useRef<string>("");
  if (!idem.current) idem.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

  // ── claim ──
  const [cat, setCat] = useState<"outstation" | "airbnb">(str("claimType") === "airbnb" ? "airbnb" : "outstation");
  const [week, setWeek] = useState(() => str("week") || options.weeks[0]?.key || "");
  const [region, setRegion] = useState(() => str("region") || options.initial?.region || "");
  const [male, setMale] = useState(() => Number(prior.male ?? options.initial?.male ?? 0));
  const [female, setFemale] = useState(() => Number(prior.female ?? options.initial?.female ?? 0));
  const [checkIn, setCheckIn] = useState(str("start"));
  const [checkOut, setCheckOut] = useState(str("end"));
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(str("notes"));
  // ── replacement ──
  const [member, setMember] = useState(() => str("originalStaffId") || options.initial?.member || "");
  const [dest, setDest] = useState<string>(() => ({ member_exit: "department_exit", resignation: "company_exit" } as Record<string, string>)[str("destination")] ?? (str("destination") || "department_exit"));
  const [target, setTarget] = useState(() => str("targetDepartmentId") || (kind === "waiting" ? options.initial?.department ?? options.departmentId : ""));
  const [src, setSrc] = useState(() => str("replacementSource") || "new");
  const [wlPick, setWlPick] = useState(() => options.waitingList.find(w => w.ok)?.id ?? "");
  const [wlOpen, setWlOpen] = useState(false);
  const [newPerson, setNewPerson] = useState(str("newPerson"));
  const [effective, setEffective] = useState(str("effective"));
  const [reason, setReason] = useState(str("reason"));
  // ── waiting ──
  const [phone, setPhone] = useState(str("contact"));
  const [start, setStart] = useState(str("start"));
  const [sigMode, setSigMode] = useState<"typed" | "draw">("typed");
  const [signature, setSignature] = useState(str("signature"));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const weekRow = options.weeks.find(w => w.key === week) ?? null;
  const regionRow = options.rates.regions.find(r => r.id === region) ?? null;
  const nights = nightsBetween(checkIn, checkOut);
  const amount = useMemo(() => claimAmount(options.rates, cat === "outstation"
    ? { type: "outstation", regionId: region }
    : { type: "airbnb", pax: male + female, nights: nights ?? 0 }), [options.rates, cat, region, male, female, nights]);
  const department = options.departments.find(d => d.id === (kind === "waiting" ? target : options.departmentId));

  const submit = async () => {
    if (busy || readOnly) return;
    setError(null);
    const form = new FormData();
    form.set("kind", kind);
    form.set("subDepartmentId", options.departmentId);
    form.set("idempotencyKey", idem.current);
    if (revising) form.set("requestId", revising.id);
    if (kind === "claim") {
      if (!weekRow) return setError("Choose the brand week the claim is for.");
      form.set("claimType", cat);
      form.set("week", weekRow.key);
      if (weekRow.brand) form.set("brand", weekRow.brand);
      form.set("location", weekRow.venue ?? weekRow.dates);
      form.set("notes", notes.trim());
      if (cat === "outstation") {
        if (!regionRow) return setError("Choose the fair's region.");
        if (!(amount > 0)) return setError(regionRow.spots > 0 ? "HR has not set the rate per spot yet." : `${options.rates.base} fairs are local, so there is no outstation claim.`);
        form.set("region", regionRow.id);
      } else {
        if (!checkIn || !checkOut || nights === null || nights < 1) return setError("Enter the check-in and check-out dates.");
        if (male + female < 1) return setError("Add who stayed.");
        if (!(amount > 0)) return setError("HR has not set the Airbnb rate yet.");
        if (!file) return setError("Add the invoice.");
        if (file.size > 3 * 1024 * 1024) return setError("The invoice must be 3 MB or smaller.");
        form.set("start", checkIn);
        form.set("end", checkOut);
        form.set("male", String(male));
        form.set("female", String(female));
        form.set("invoice", file);
      }
    } else if (kind === "replacement") {
      if (!member) return setError("Choose the member being replaced.");
      if (dest === "transfer" && !target) return setError("Choose the receiving sub-department.");
      if (!effective) return setError("Enter the planned effective date.");
      if (!reason.trim()) return setError("Say why, and how the handover works.");
      form.set("originalStaffId", member);
      form.set("destination", dest);
      if (dest === "transfer") form.set("targetDepartmentId", target);
      form.set("replacementSource", src);
      const wl = options.waitingList.find(w => w.id === wlPick);
      if (src === "waiting") {
        if (!wl?.ok) return setError("Choose an approved waiting-list request.");
        form.set("newPerson", wl.name);
        form.set("waitingRequestId", wl.id);
      } else if (src !== "vacancy") {
        if (!newPerson.trim()) return setError("Enter the replacement's name or request ID.");
        form.set("newPerson", newPerson.trim());
      }
      form.set("effective", effective);
      form.set("reason", reason.trim());
    } else {
      if (!newPerson.trim()) return setError("Enter the new member's full name.");
      if (!phone.trim()) return setError("Enter a phone number.");
      if (!start) return setError("Enter the preferred start date.");
      form.set("newPerson", newPerson.trim());
      form.set("contact", phone.trim());
      form.set("targetDepartmentId", target || options.departmentId);
      form.set("start", start);
      form.set("consent", "true");
      if (sigMode === "draw") {
        if (!drawn) return setError("Sign in the box, or type your signature.");
        form.set("signature", newPerson.trim());
        form.set("signatureImage", canvasRef.current?.toDataURL("image/png") ?? "");
      } else {
        if (!signature.trim()) return setError("Type your full name to sign.");
        form.set("signature", signature.trim());
      }
    }
    setBusy(true);
    try {
      const outcome = await onSubmit(form);
      if (outcome.ok) setDone(outcome.code);
      else setError(outcome.error);
    } catch {
      setError("Could not send it. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) * e.currentTarget.width) / box.width, y: ((e.clientY - box.top) * e.currentTarget.height) / box.height };
  };

  if (done) {
    return (
      <>
        <div className={s.rfHead}>
          <SheetHandle />
          <div className={s.rfHeadRow}>
            <div><span className={s.rfTitle}>{title}</span><span className={s.rfSub}>{sub}</span></div>
            <button className={s.rfClose} onClick={onClose} aria-label="Close"><Svg d={CLOSE} size={16} sw={2} /></button>
          </div>
        </div>
        <div className={s.doneWrap}>
          <span className={s.doneTick}><Svg d={ICON.tick} size={30} sw={2.4} /></span>
          <span className={s.doneTitle}>Request submitted</span>
          <span className={s.doneText}>{doneText}</span>
          <span className={s.doneId}>{done}</span>
          <button className={s.doneBtn} onClick={onClose}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={s.rfHead}>
        <SheetHandle />
        <div className={s.rfHeadRow}>
          <div><span className={s.rfTitle}>{title}</span><span className={s.rfSub}>{sub}</span></div>
          <button className={s.rfClose} onClick={onClose} aria-label="Close"><Svg d={CLOSE} size={16} sw={2} /></button>
        </div>
      </div>
      <div className={s.rfScroll} data-rq-form-scroll="1">
        {kind === "claim" && (
          <>
            <div className={s.field}><span className={s.fieldLabel}>Claim category</span>
              <div className={s.cats}>
                {([["outstation", "Outstation", "Fixed by spots for the route", CAT_OUT], ["airbnb", "Airbnb accommodation", options.rates.perPaxNight !== null ? `${rm0(options.rates.perPaxNight)} per pax per night` : "Rate not set yet", CAT_AIR]] as const).map(([id, label, note, d]) => (
                  <button key={id} className={`${s.cat} ${cat === id ? s.catOn : ""}`} onClick={() => setCat(id)} aria-pressed={cat === id}>
                    <span className={s.catIcon}><Svg d={d} size={17} sw={1.9} /></span>
                    <span className={s.catLabel}>{label}</span>
                    <span className={s.catSub}>{note}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}><span className={s.fieldLabel}>Brand week</span>
              <div className={s.weeks}>
                {options.weeks.map(w => {
                  const on = w.key === week;
                  return (
                    <button key={w.key} className={`${s.week} ${on ? s.weekOn : ""}`} onClick={() => setWeek(w.key)} aria-pressed={on}
                      style={on ? { borderColor: w.color, background: w.tint } : undefined}>
                      <span className={s.weekBadge} style={{ background: w.color }}>{w.n}</span>
                      <span className={s.weekText}>
                        <span className={s.weekTitle}>{w.brandWeek} · {w.dates}</span>
                        <span className={s.weekWhere}>{[w.venue ?? "No fair on the calendar", w.org].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  );
                })}
                {!options.weeks.length && <p className={s.local}>No fair weekends to claim for yet.</p>}
              </div>
            </div>
            {cat === "outstation" ? (
              <>
                <div className={s.field}><span className={s.fieldLabel}>Fair region</span>
                  <div className={s.regions}>
                    {options.rates.regions.map(r => (
                      <button key={r.id} className={`${s.region} ${r.id === region ? s.regionOn : ""}`} onClick={() => setRegion(r.id)} aria-pressed={r.id === region}>{r.name}</button>
                    ))}
                  </div>
                </div>
                {regionRow && regionRow.spots > 0 && (
                  <>
                    <div className={s.spots}>
                      <span className={s.spotsN}>{regionRow.spots}</span>
                      <span className={s.spotsText}><span className={s.spotsTitle}>spots, worked out for you</span><span className={s.spotsRoute}>{options.rates.base} → {regionRow.name} · return trip</span></span>
                    </div>
                    <div className={s.sum}>
                      <div className={s.sumRow}><span className={s.sumLabel}>Spots for this route</span><span className={s.sumValue}>{regionRow.spots} spots</span></div>
                      <div className={s.sumRow}><span className={s.sumLabel}>Rate per spot</span><span className={s.sumValue}>{options.rates.perSpot !== null ? rm2(options.rates.perSpot) : "Not set"}</span></div>
                      <div className={s.sumTotal}><span className={s.sumTotalLabel}>Claim amount</span><span className={s.sumTotalValue}>{rm2(amount)}</span></div>
                      <span className={s.sumNote}>Set by the fixed rate. You can&apos;t edit the amount.</span>
                    </div>
                  </>
                )}
                {regionRow && regionRow.spots === 0 && <p className={s.local}>{options.rates.base} fairs are local, so there is no outstation claim.</p>}
              </>
            ) : (
              <>
                <div className={s.two}>
                  <label className={s.field}><span className={s.fieldLabel}>Check-in</span><input type="date" className={s.input} value={checkIn} onChange={e => setCheckIn(e.target.value)} /></label>
                  <label className={s.field}><span className={s.fieldLabel}>Check-out</span><input type="date" className={s.input} value={checkOut} onChange={e => setCheckOut(e.target.value)} /></label>
                </div>
                <div className={s.field}><span className={s.fieldLabel}>Who stayed</span>
                  <div className={s.pax}>
                    <Counter label="Male" value={male} onChange={setMale} />
                    <Counter label="Female" value={female} onChange={setFemale} />
                  </div>
                </div>
                <div className={s.sum}>
                  <div className={s.sumRow}><span className={s.sumLabel}>Total pax</span><span className={s.sumValue}>{male + female} pax · {male} male, {female} female</span></div>
                  <div className={s.sumRow}><span className={s.sumLabel}>Nights</span><span className={s.sumValue}>{nights !== null && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "—"}</span></div>
                  <div className={s.sumRow}><span className={s.sumLabel}>Rate per pax per night</span><span className={s.sumValue}>{options.rates.perPaxNight !== null ? rm2(options.rates.perPaxNight) : "Not set"}</span></div>
                  <div className={s.sumTotal}><span className={s.sumTotalLabel}>Claim amount</span><span className={s.sumTotalValue}>{rm2(amount)}</span></div>
                  <span className={s.sumNote}>Set by the fixed rate. You can&apos;t edit the amount.</span>
                </div>
                <div className={s.field}><span className={s.fieldLabel}>Invoice</span>
                  <button className={s.upload} onClick={() => fileRef.current?.click()}>
                    <Svg d={CAMERA} size={24} sw={1.8} stroke="var(--rv-accent)" />
                    <span className={s.uploadTitle}>{file ? file.name : "Take a photo or choose a file"}</span>
                    <span className={s.uploadSub}>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to change` : "JPG, PNG or PDF, up to 3 MB"}</span>
                  </button>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </div>
              </>
            )}
            <label className={s.field}><span className={s.fieldLabel}>Notes (optional)</span><textarea rows={2} className={`${s.input} ${s.textarea}`} placeholder="Anything HR should know" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1500} /></label>
          </>
        )}
        {kind === "replacement" && (
          <>
            <div className={s.field}><span className={s.fieldLabel}>Original member</span>
              <div className={s.pills}>
                {options.members.map(m => (
                  <button key={m.id} className={`${s.pill} ${member === m.id ? s.pillOn : ""}`} onClick={() => setMember(m.id)} aria-pressed={member === m.id}>{m.name}</button>
                ))}
                {!options.members.length && <p className={s.local}>Nobody reports to you in this sub-department yet.</p>}
              </div>
            </div>
            <div className={s.field}><span className={s.fieldLabel}>What happens to them</span>
              <div className={s.radios}>{DESTS.map(([id, label, note]) => <Radio key={id} on={dest === id} label={label} sub={note} onClick={() => setDest(id)} />)}</div>
            </div>
            {dest === "transfer" && (
              <div className={s.field}><span className={s.fieldLabel}>Receiving sub-department</span>
                <div className={s.pills}>
                  {options.departments.filter(d => d.id !== options.departmentId).map(d => (
                    <button key={d.id} className={`${s.pill} ${target === d.id ? s.pillOn : ""}`} onClick={() => setTarget(d.id)} aria-pressed={target === d.id}>{d.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className={s.field}><span className={s.fieldLabel}>Replacement</span>
              <div className={s.radios}>{SOURCES.map(([id, label, note]) => <Radio key={id} on={src === id} label={label} sub={note} onClick={() => setSrc(id)} />)}</div>
            </div>
            {src === "waiting" && (
              <div className={s.field}>
                <span className={s.fieldLabel}>Choose from your waiting list</span>
                {(() => {
                  const cur = options.waitingList.find(w => w.id === wlPick);
                  return (
                    <button className={`${s.wlBtn} ${wlOpen ? s.wlBtnOpen : ""}`} onClick={() => setWlOpen(!wlOpen)}>
                      <span className={s.wlAv}>{cur ? initials(cur.name) : "—"}</span>
                      <span className={s.wlText}><span className={s.wlName}>{cur?.name ?? "No approved request yet"}</span><span className={s.wlSub}>{cur?.sub ?? "Submit a waiting list first"}</span></span>
                      <span className={`${s.wlCaret} ${wlOpen ? s.wlCaretOpen : ""}`}><Svg d={ICON.chevronDown} size={16} sw={2} stroke="var(--rv-sub)" /></span>
                    </button>
                  );
                })()}
                {wlOpen && (
                  <div className={s.wlList}>
                    {options.waitingList.map(w => (
                      <button key={w.id} className={`${s.wlItem} ${w.id === wlPick ? s.wlItemOn : ""} ${w.ok ? "" : s.wlItemOff}`} onClick={() => { if (w.ok) { setWlPick(w.id); setWlOpen(false); } }}>
                        <span className={s.wlItemAv}>{initials(w.name)}</span>
                        <span className={s.wlText}><span className={s.newTitle}>{w.name}</span><span className={s.wlSub}>{w.sub}</span></span>
                        <span className={`${s.wlStatus} ${w.ok ? s.toneGood : s.toneWarn}`}>{w.status}</span>
                      </button>
                    ))}
                    <div className={s.wlFoot}>Only approved requests from your team can be used.</div>
                  </div>
                )}
              </div>
            )}
            {(src === "new" || src === "existing") && (
              <label className={s.field}><span className={s.fieldLabel}>Replacement name or request ID</span><input type="text" className={s.input} placeholder="Optional if no replacement" value={newPerson} onChange={e => setNewPerson(e.target.value)} maxLength={150} /></label>
            )}
            <label className={s.field}><span className={s.fieldLabel}>Planned effective date</span><input type="date" className={s.input} value={effective} onChange={e => setEffective(e.target.value)} /></label>
            <label className={s.field}><span className={s.fieldLabel}>Reason and arrangement</span><textarea rows={3} className={`${s.input} ${s.textarea}`} placeholder="Why, and how the handover works" value={reason} onChange={e => setReason(e.target.value)} maxLength={3000} /></label>
            <p className={s.formNote}>Transfers need the receiving department to confirm. Member and payroll records change after approval.</p>
          </>
        )}
        {kind === "waiting" && (
          <>
            <div className={s.capPill}><span className={s.capPillLabel}>{department?.name ?? options.subName} capacity</span><span className={s.capPillValue}>{capacityText(department)}</span></div>
            <label className={s.field}><span className={s.fieldLabel}>New member name</span><input type="text" className={s.input} placeholder="Full name as per IC" autoComplete="name" value={newPerson} onChange={e => setNewPerson(e.target.value)} maxLength={150} /></label>
            <label className={s.field}><span className={s.fieldLabel}>Phone number</span><input type="tel" className={s.input} placeholder="e.g. 012-345 6789" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={32} /></label>
            <div className={s.field}><span className={s.fieldLabel}>Preferred sub-department</span>
              <div className={s.pills}>
                {options.departments.map(d => (
                  <button key={d.id} className={`${s.pill} ${(target || options.departmentId) === d.id ? s.pillOn : ""}`} onClick={() => setTarget(d.id)} aria-pressed={(target || options.departmentId) === d.id}>{d.name}</button>
                ))}
              </div>
            </div>
            <label className={s.field}><span className={s.fieldLabel}>Preferred start date</span><input type="date" className={s.input} value={start} onChange={e => setStart(e.target.value)} /></label>
            <div className={s.field}>
              <span className={s.fieldLabel}>Your signature</span>
              <div className={s.sigTabs}>
                {([["typed", "Type signature"], ["draw", "Draw signature"]] as const).map(([id, label]) => (
                  <button key={id} className={`${s.sigTab} ${sigMode === id ? s.sigOn : ""}`} onClick={() => setSigMode(id)} aria-pressed={sigMode === id}>{label}</button>
                ))}
              </div>
              {sigMode === "typed" ? (
                <input type="text" className={s.input} placeholder="Type your full name" value={signature} onChange={e => setSignature(e.target.value)} maxLength={150} />
              ) : (
                <div className={s.sigPad}>
                  {!drawn && "Sign here with your finger"}
                  <canvas ref={canvasRef} className={s.sigCanvas} width={600} height={220} aria-label="Signature"
                    onPointerDown={e => {
                      drawing.current = true; setDrawn(true);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const ctx = e.currentTarget.getContext("2d"); const p = point(e);
                      if (ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineWidth = 3; ctx.strokeStyle = getComputedStyle(e.currentTarget).color; ctx.lineCap = "round"; }
                    }}
                    onPointerMove={e => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d"); const p = point(e); ctx?.lineTo(p.x, p.y); ctx?.stroke(); }}
                    onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} />
                  {drawn && <button className={s.sigClear} onClick={() => { canvasRef.current?.getContext("2d")?.clearRect(0, 0, 600, 220); setDrawn(false); }}>Clear</button>}
                </div>
              )}
              <span className={s.sumNote}>By signing you confirm these details and the applicant&apos;s wish to join.</span>
            </div>
          </>
        )}
        {error && <p className={s.formError} role="alert">{error}</p>}
      </div>
      <div className={s.rfFoot}>
        {/* View as: the form opens and fills in as the member's would, and sends nothing (the Quote's add button reads the same). */}
        <button className={s.rfCta} onClick={() => void submit()} disabled={busy || readOnly}>
          {readOnly ? "Read-only while viewing as" : busy ? "Sending…" : revising ? "Send the update" : cta}
        </button>
      </div>
    </>
  );
}

function rm0(n: number): string {
  return Number.isInteger(n) ? `RM ${n}` : rm2(n);
}

function capacityText(d: { capacity: number | null; occupied: number } | undefined): string {
  if (!d) return "—";
  if (d.capacity === null) return `${d.occupied} · no limit`;
  const open = Math.max(d.capacity - d.occupied, 0);
  return `${d.occupied} / ${d.capacity} · ${open} open`;
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className={s.paxBox}>
      <span className={s.paxLabel}>{label}</span>
      <div className={s.paxRow}>
        <button className={s.paxMinus} onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <span className={s.paxN}>{value}</span>
        <button className={s.paxPlus} onClick={() => onChange(Math.min(20, value + 1))} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

function Radio({ on, label, sub, onClick }: { on: boolean; label: string; sub: string; onClick: () => void }) {
  return (
    <button className={`${s.radio} ${on ? s.radioOn : ""}`} onClick={onClick} aria-pressed={on}>
      <span className={s.radioRing}><span className={s.radioDot} /></span>
      <span className={s.radioText}><span className={s.radioLabel}>{label}</span><span className={s.radioSub}>{sub}</span></span>
    </button>
  );
}
