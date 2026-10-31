"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { dayList, dayRange, initials, klToday, monthShort, MONTHS_SHORT, rm2, shortDay, weekdayShort } from "../format";
import type { ClaimWeek, FormOptions, RequestKindVM } from "./profile-vm";
import StayCalendar from "./StayCalendar";
import Reveal from "./Reveal";
import {
  airbnbCap, airbnbGroup, claimAmount, claimedFoodDays, claimedFoodMonths, fairDays, fairRegion, foodAmount, foodDayState, foodMonthOpensOn,
  foodMonthOver, isOutstation, monthOfWeek, nightsBetween, stayProblem, stayWindow, transportPartProblem,
} from "@/lib/member/claim-rules";
import { applicationFormHtml, BUILTIN_FIELDS, FORM_KINDS, REPLACEMENT_BUILTIN_FIELDS, type WaitingField } from "@/lib/commission/waiting-form";
import { answersFor, blankRequired, capacityLine, fillIn, priorAnswers } from "@/lib/member/waiting-answers";
import { ANY_TIME, ANY_TIME_LABEL, isAnyTime } from "@/lib/member/waiting-start";
import { stageFiles } from "@/lib/storage/stage";
import s from "./profile.module.css";

const CAT_OUT = "M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18";
const CAT_AIR = "M3 11 12 4l9 7v9h-6v-6H9v6H3v-9Z";
const CAMERA = "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z";
const PLANE = "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z";
const CLOSE = "M6 6l12 12M18 6 6 18";
const DOWNLOAD = "M12 4v11M7 10l5 5 5-5M4 19h16";
const UPLOAD = "M12 15V4M7 9l5-5 5 5M4 19h16";

export type { ClaimWeek, FormOptions };
export type SubmitOutcome = { ok: true; code: string } | { ok: false; error: string };
/** Download form: a fresh link to HR's uploaded application form, or null when the app builds it. */
export type FormLink = () => Promise<{ ok: true; data: { url: string; name: string } | null } | { ok: false; error: string }>;

const TEXT: Record<RequestKindVM, [string, string, string, string]> = {
  claim: ["Submit transport claim", "Outstation or Airbnb stay for a fair", "Review & submit claim", "HR will check your claim. Payment is tracked in Requests."],
  food: ["Submit food claim", "Meals on the days you worked a fair", "Review & submit claim", "HR will check your claim. Payment is tracked in Requests."],
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
export default function RequestForm({ kind, options, revising, readOnly, onSubmit, onClose, formLink, replFormLink }: {
  kind: RequestKindVM | null;
  options: FormOptions;
  /** HR returned this request: its details come back to be updated. */
  revising: { id: string; detail: Record<string, unknown> } | null;
  /** A Principal viewing somebody: the form fills in with that person's choices, and sends nothing. */
  readOnly: boolean;
  onSubmit: (form: FormData) => Promise<SubmitOutcome>;
  onClose: () => void;
  /** The waiting list's Download form, when HR uploaded its own (the preview has none: it builds the form). */
  formLink?: FormLink;
  /** The replacement's Download form (2026-10-11), the same way. */
  replFormLink?: FormLink;
}) {
  const open = kind !== null;
  // A fresh form every time it opens; the same key on a retry (idempotent submission).
  const [session, setSession] = useState(0);
  useEffect(() => { if (open) setSession(n => n + 1); }, [open, kind]);
  return (
    <Sheet open={open} onClose={onClose} z={23} height="90%" className={s.rfPanel} label={kind ? TEXT[kind][0] : "Request"}>
      {kind && <FormBody key={`${kind}-${session}`} kind={kind} options={options} revising={revising} readOnly={readOnly} onSubmit={onSubmit} onClose={onClose}
        formLink={kind === "replacement" ? replFormLink : formLink} />}
    </Sheet>
  );
}

function FormBody({ kind, options, revising, readOnly, onSubmit, onClose, formLink }: {
  kind: RequestKindVM;
  options: FormOptions;
  revising: { id: string; detail: Record<string, unknown> } | null;
  readOnly: boolean;
  onSubmit: (form: FormData) => Promise<SubmitOutcome>;
  onClose: () => void;
  /** This kind's Download form: the waiting list's, or the replacement's. */
  formLink?: FormLink;
}) {
  // What of a transport claim their title may send (2026-10-31): by road and an Airbnb stay, a plane ticket.
  const parts = options.transport ?? { road: true, plane: true };
  const planeOnly = parts.plane && !parts.road;
  const [title, textSub, cta, doneText] = TEXT[kind];
  const sub = kind === "claim" && planeOnly ? "A plane ticket to a fair you fly to" : textSub;
  const prior = revising?.detail ?? {};
  const str = (key: string) => (typeof prior[key] === "string" ? (prior[key] as string) : "");
  const idem = useRef<string>("");
  if (!idem.current) idem.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;

  // ── claim ──
  const [cat, setCat] = useState<"outstation" | "airbnb">(str("claimType") === "airbnb" ? "airbnb" : "outstation");
  // The newest weekend with a brand week until the member picks another (the list may arrive after the form opens) —
  // for a title that may claim a plane ticket alone, the newest at a fair flown to.
  const [weekPick, setWeek] = useState(() => str("week"));
  const claimableWeeks = options.weeks.filter(w => w.claimable);
  const week = weekPick
    || (planeOnly ? claimableWeeks.find(w => fairRegion(options.rates, w.fairId).region?.planeTicket)?.key : undefined)
    || claimableWeeks[0]?.key || "";
  const [ticket, setTicket] = useState(() => (prior.planeTicket === true && typeof prior.amount === "number" ? String(prior.amount) : ""));
  const [stay, setStay] = useState(() => (typeof prior.invoiceAmount === "number" ? String(prior.invoiceAmount) : ""));
  const [male, setMale] = useState(() => Number(prior.male ?? options.initial?.male ?? 0));
  const [female, setFemale] = useState(() => Number(prior.female ?? options.initial?.female ?? 0));
  const [checkIn, setCheckIn] = useState(str("start"));
  const [checkOut, setCheckOut] = useState(str("end"));
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState(str("notes"));
  // ── food (2026-10-13): a MONTH at a time (the user: "submit by total month … dont by week submit") — every brand
  // week of it, each opened to its fair's days, every day they may claim ticked to start; sent once the month is over ──
  const today = options.today ?? klToday();
  const perDay = options.rates.food?.perDay ?? null;
  // A month, and a day, another food claim of theirs holds is not offered again — this one's own, sent back by HR, still is.
  const takenDays = useMemo(() => claimedFoodDays(options.foodClaims ?? [], revising?.id), [options.foodClaims, revising?.id]);
  const takenMonths = useMemo(() => claimedFoodMonths(options.foodClaims ?? [], revising?.id), [options.foodClaims, revising?.id]);
  const openDaysOf = (w: ClaimWeek) => fairDays(w, w.key).filter(d => foodDayState(d, today, takenDays) === "open");
  // The months with a weekend they worked, newest first; the form opens on the newest that is over and not claimed.
  const foodMonths = useMemo(() => [...new Set(options.weeks.filter(w => w.worked).map(w => monthOfWeek(w.key)))].sort().reverse(), [options.weeks]);
  const [foodMonthPick, setFoodMonth] = useState(() => str("month"));
  const foodMonth = foodMonthPick || foodMonths.find(m => foodMonthOver(m, today) && !takenMonths.has(m))
    || foodMonths.find(m => foodMonthOver(m, today)) || foodMonths[0] || "";
  const monthWeeks = options.weeks.filter(w => monthOfWeek(w.key) === foodMonth).sort((a, b) => a.key.localeCompare(b.key));
  // The days ticked, a weekend at a time; a weekend not in it = every day of it still open, until the member taps one
  // (a returned claim's weekends start as it was sent — one it left out, with none).
  const [dayPick, setDayPick] = useState<Record<string, string[]>>(() => priorFoodDays(prior));
  const revisingMonth = str("claimType") === "food" ? str("month") : "";
  const [openWeeks, setOpenWeeks] = useState<ReadonlySet<string>>(() => new Set());
  const daysOf = (w: ClaimWeek) => (!w.worked ? []
    : (dayPick[w.key] ?? (monthOfWeek(w.key) === revisingMonth ? [] : openDaysOf(w)))
      .filter(d => fairDays(w, w.key).includes(d) && foodDayState(d, today, takenDays) === "open").sort());
  const foodWeeks = monthWeeks.map(w => ({ week: w, days: daysOf(w) }));
  const foodDays = foodWeeks.flatMap(x => x.days).sort();
  const foodTotal = foodAmount(perDay, foodDays.length);
  const monthTaken = !!foodMonth && takenMonths.has(foodMonth);
  const monthOver = !!foodMonth && foodMonthOver(foodMonth, today);
  const pickFoodMonth = (m: string) => {
    if (m === foodMonth) return;
    setFoodMonth(m);
    setOpenWeeks(new Set());
    setError(null);
  };
  const toggleWeek = (key: string) => setOpenWeeks(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
  const toggleDay = (w: ClaimWeek, day: string) => {
    const now = daysOf(w);
    setDayPick(prev => ({ ...prev, [w.key]: now.includes(day) ? now.filter(d => d !== day) : [...now, day].sort() }));
    setError(null);
  };
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
  // ── waiting: the form HR set (Sales Groups › Form settings) — its four built-ins until it arrives ──
  const wform = options.waitingForm?.form ?? null;
  const questions: readonly WaitingField[] = wform?.fields.length ? wform.fields : BUILTIN_FIELDS;
  // ── replacement: the Replacement list's form (2026-10-11, round 2's README 18.5) — its five built-ins,
  // each drawn with this form's own controls, and HR's own questions where HR put them ──
  const rform = options.replacementForm?.form ?? null;
  const rquestions: readonly WaitingField[] = rform?.fields.length ? rform.fields : REPLACEMENT_BUILTIN_FIELDS;
  const rown = rquestions.filter(f => !f.builtin);
  // The form this request is sent on — what Download builds and what the signed form must match.
  const sentForm = kind === "replacement" ? rform : wform;
  const [vals, setVals] = useState<Record<string, string>>(() => ({
    ...priorAnswers(prior), newPerson: str("newPerson"), contact: str("contact"), start: str("start"),
  }));
  const setVal = (id: string, value: string) => { setVals(prev => ({ ...prev, [id]: value })); setError(null); };
  const [signed, setSigned] = useState<File | null>(null);
  // A revision keeps the signed form it was sent with until another is chosen.
  const keptForm = str("signedFormHash") && str("signedFormName") ? str("signedFormName") : "";
  const signedName = signed?.name ?? keptForm;
  const [tried, setTried] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [sigMode, setSigMode] = useState<"typed" | "draw">("typed");
  const [signature, setSignature] = useState(str("signature"));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [doneFile, setDoneFile] = useState("");

  const weekRow = options.weeks.find(w => w.key === week) ?? null;
  // The region is the one HR set for the brand week's venue — never picked here (user 2026-10-06).
  const fair = fairRegion(options.rates, weekRow?.fairId ?? null);
  const regionRow = fair.region;
  const venue = fair.venue ?? weekRow?.venue ?? "this fair";
  // A part of the claim their title is not ticked for (2026-10-31): the plane ticket is the air ticket's tick, by
  // road and an Airbnb stay the transport claim's — said in place of the part's fields, and refused on send.
  const partProblem = transportPartProblem(parts, cat, regionRow, options.title);
  const ticketValue = money(ticket);
  const stayValue = money(stay);
  const nights = nightsBetween(checkIn, checkOut);
  const pax = male + female;
  // The invoice's total is typed and paid up to a cap by head count: up to HR's small group, HR's
  // figure a night (user 2026-10-06); more people, the rate a person a night — a cap too (2026-10-12).
  // Nobody counted yet reads as the smallest group, so the cap's rows do not jump on the first +.
  const group = airbnbGroup(options.rates, Math.max(1, pax));
  const capPerNight = options.rates.groupCapPerNight ?? 0;
  const perPax = options.rates.perPaxNight;
  // Airbnb is for an outstation fair only (2026-10-06); its stay falls between the day before the fair
  // and the day after (2026-10-12), tapped on one calendar that opens on just those days.
  const range = weekRow ? stayWindow(weekRow, weekRow.key) : null;
  const stayIssue = weekRow && range ? stayProblem(checkIn, checkOut, range, weekRow.dates) : null;
  const stayNights = stayIssue ? 0 : nights ?? 0;
  const cap = airbnbCap(options.rates, pax, stayNights);
  const amount = useMemo(() => claimAmount(options.rates, cat === "outstation"
    ? { type: "outstation", regionId: regionRow?.id ?? null, ticket: ticketValue }
    : { type: "airbnb", pax, nights: stayNights, invoice: stayValue }), [options.rates, cat, regionRow, ticketValue, pax, stayNights, stayValue]);
  /** Another brand week: a stay picked for the last one stays only if it falls in this one's days. */
  const pickWeek = (w: ClaimWeek) => {
    setWeek(w.key);
    const next = stayWindow(w, w.key);
    const fits = (day: string) => !day || (day >= next.first && day <= next.last);
    if (!fits(checkIn) || !fits(checkOut)) { setCheckIn(""); setCheckOut(""); }
  };
  const department = options.departments.find(d => d.id === (kind === "waiting" ? target || options.departmentId : options.departmentId));
  // The waiting list's answers as one map: the built-in sub-department is always chosen.
  const answered = { ...vals, target: target || options.departmentId };
  const blank = !tried ? new Set<string>()
    : new Set((kind === "replacement" ? blankRequired(rown, vals) : blankRequired(questions, answered)).map(f => f.id));
  const needsForm = !!sentForm?.requireUpload;

  /** Download form: HR's own when it uploaded one, else the black-and-white form built from the questions. */
  const downloadForm = async () => {
    if (fetching) return;
    const formKind = kind === "replacement" ? "replacement" : "waiting";
    const builtName = FORM_KINDS[formKind].formName;
    const built = () => save(new Blob([applicationFormHtml(sentForm ?? { version: 1, fields: [...(formKind === "replacement" ? rquestions : questions)], templateName: builtName },
      formKind === "replacement" ? options.subName : department?.name ?? options.subName, options.departments.map(d => d.name), formKind)], { type: "text/html" }),
      sentForm?.templateName ?? builtName);
    if (!sentForm?.templatePath || !formLink) return built();
    setFetching(true);
    try {
      const link = await formLink();
      if (!link.ok) return setError(link.error);
      if (!link.data) return built();
      try {
        const res = await fetch(link.data.url);
        if (!res.ok) throw new Error(String(res.status));
        save(await res.blob(), link.data.name);
      } catch {
        // The link itself downloads (it is signed as an attachment).
        window.location.assign(link.data.url);
      }
    } catch {
      setError("The form could not be downloaded. Check your connection and try again.");
    } finally {
      setFetching(false);
    }
  };

  const submit = async () => {
    if (busy || readOnly) return;
    setError(null);
    const form = new FormData();
    // A food claim is a claim to the database (`claimType` food).
    form.set("kind", kind === "food" ? "claim" : kind);
    form.set("subDepartmentId", options.departmentId);
    form.set("idempotencyKey", idem.current);
    if (revising) form.set("requestId", revising.id);
    if (kind === "food") {
      // The month, its weekends and their days are all that is sent: the fairs, the rate and the amount are the database's.
      if (!foodMonth) return setError("No fair weekends to claim food for yet.");
      if (!monthOver) return setError(`Food for ${monthShort(foodMonth)} is claimed once the month is over, from ${shortDay(foodMonthOpensOn(foodMonth))}.`);
      if (monthTaken) return setError(`Food for ${monthShort(foodMonth)} is already claimed${takenMonths.get(foodMonth) ? ` (${takenMonths.get(foodMonth)})` : ""}: a month is claimed once.`);
      if (perDay === null || !(perDay > 0)) return setError("HR has not set the food claim's rate a day yet.");
      if (!foodDays.length) return setError("Tick the days you worked at the fairs.");
      form.set("claimType", "food");
      form.set("month", foodMonth);
      form.set("weeks", JSON.stringify(foodWeeks.filter(x => x.days.length).map(x => ({ week: x.week.key, days: x.days }))));
      form.set("notes", notes.trim());
    } else if (kind === "claim") {
      // The week is all that is sent: its fair, venue and region are the database's own records.
      if (!weekRow?.claimable) return setError("Choose one of your brand weeks. A claim is only for your own brand week.");
      form.set("claimType", cat);
      form.set("week", weekRow.key);
      form.set("notes", notes.trim());
      if (cat === "airbnb" && partProblem) return setError(partProblem);
      if (cat === "outstation") {
        if (!regionRow) return setError(`HR has not set the region for ${venue} yet, so it cannot be claimed.`);
        if (partProblem) return setError(partProblem);
        if (regionRow.planeTicket) {
          if (!(amount > 0)) return setError("Enter the plane ticket's price, as its invoice shows.");
          if (!file) return setError("Add the plane ticket's invoice.");
          if (file.size > 100 * 1024 * 1024) return setError("The invoice must be 100 MB or smaller.");
          form.set("amount", ticket.trim());
          form.set("invoice", file);
        } else if (!(amount > 0)) {
          return setError(regionRow.spots > 0 ? "HR has not set the rate per spot yet." : `${venue} is local to ${options.rates.base}, so there is no outstation claim.`);
        }
      } else {
        if (!regionRow) return setError(`HR has not set the region for ${venue} yet, so it cannot be claimed.`);
        if (!isOutstation(regionRow)) return setError(`${venue} is local to ${options.rates.base}, so there is no Airbnb claim.`);
        if (!checkIn || !checkOut || nights === null || nights < 1) return setError("Tap your check-in and check-out days on the calendar.");
        if (stayIssue) return setError(stayIssue);
        if (male + female < 1) return setError("Add who stayed.");
        if (!(stayValue && stayValue > 0)) return setError("Enter the stay's total from its invoice.");
        if (!(amount > 0)) return setError("HR has not set the Airbnb rate yet.");
        if (!file) return setError("Add the invoice.");
        if (file.size > 100 * 1024 * 1024) return setError("The invoice must be 100 MB or smaller.");
        form.set("start", checkIn);
        form.set("end", checkOut);
        form.set("male", String(male));
        form.set("female", String(female));
        form.set("amount", stay.trim());
        form.set("invoice", file);
      }
    } else if (kind === "replacement") {
      if (!member) return setError("Choose the member being replaced.");
      if (dest === "transfer" && !target) return setError("Choose the receiving sub-department.");
      if (!effective) return setError("Enter the planned effective date.");
      if (!reason.trim()) return setError("Say why, and how the handover works.");
      // HR's own questions on the replacement form, then its signed form (2026-10-11).
      const missing = fillIn(blankRequired(rown, vals));
      if (missing) { setTried(true); return setError(missing); }
      if (needsForm && !signedName) { setTried(true); return setError("Upload the signed replacement form."); }
      if (signed && signed.size > 100 * 1024 * 1024) return setError("The signed form must be 100 MB or smaller.");
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
      if (rform) {
        form.set("formVersion", String(rform.version));
        form.set("answers", JSON.stringify(answersFor(rform, vals)));
      }
      if (signed) form.set("signedForm", signed);
      else if (keptForm) {
        form.set("signedFormName", keptForm);
        form.set("signedFormHash", str("signedFormHash"));
      }
    } else {
      // The handoff's order: the questions, then the signed form, then the signature.
      const missing = fillIn(blankRequired(questions, answered));
      if (missing) { setTried(true); return setError(missing); }
      if (needsForm && !signedName) { setTried(true); return setError("Upload the signed application form."); }
      if (signed && signed.size > 100 * 1024 * 1024) return setError("The signed form must be 100 MB or smaller.");
      if (sigMode === "draw" ? !drawn : !signature.trim()) {
        setTried(true);
        return setError(sigMode === "draw" ? "Sign in the box, or type your signature." : "Type your full name to sign.");
      }
      form.set("newPerson", vals.newPerson.trim());
      form.set("contact", vals.contact.trim());
      form.set("targetDepartmentId", target || options.departmentId);
      form.set("start", vals.start);
      form.set("consent", "true");
      if (wform) {
        form.set("formVersion", String(wform.version));
        form.set("answers", JSON.stringify(answersFor(wform, vals)));
      }
      if (signed) form.set("signedForm", signed);
      else if (keptForm) {
        form.set("signedFormName", keptForm);
        form.set("signedFormHash", str("signedFormHash"));
      }
      if (sigMode === "draw") {
        form.set("signature", vals.newPerson.trim());
        form.set("signatureImage", canvasRef.current?.toDataURL("image/png") ?? "");
      } else {
        form.set("signature", signature.trim());
      }
    }
    setBusy(true);
    try {
      // The invoice and the signed form go ahead of the request (2026-10-23, lib/storage/stage.ts): up to 100 MB,
      // not the 4 MB a Server Action's body carries.
      await stageFiles(form);
      const outcome = await onSubmit(form);
      if (outcome.ok) {
        setDone(outcome.code);
        if (kind !== "claim" && kind !== "food" && signedName) setDoneFile(`Signed form attached · ${signedName}`);
      } else {
        setError(outcome.error);
        freshKey();
      }
    } catch {
      setError("Could not send it. Check your connection and try again.");
      freshKey();
    } finally {
      setBusy(false);
    }
  };
  // A food claim sent again after a refusal is a new submission: the days it holds may have changed, and a key
  // already used for other days is refused. Sending twice cannot pay twice — a day is claimed once (the database).
  const freshKey = () => {
    if (kind === "food") idem.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
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
          {doneFile && <span className={s.doneFile}>{doneFile}</span>}
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
        {kind === "food" && (
          <>
            <div className={s.field}><span className={s.fieldLabel}>Month</span>
              <div className={s.pills}>
                {foodMonths.map(m => (
                  <button key={m} className={`${s.pill} ${m === foodMonth ? s.pillOn : ""}`} aria-pressed={m === foodMonth} onClick={() => pickFoodMonth(m)}>{monthShort(m)}</button>
                ))}
              </div>
              {!foodMonths.length && <p className={s.local}>No fair weekends to claim food for yet.</p>}
              {monthTaken
                ? <p className={s.formNote}>{monthShort(foodMonth)} is already claimed{takenMonths.get(foodMonth) ? ` · ${takenMonths.get(foodMonth)}` : ""}.</p>
                : foodMonth && !monthOver ? <p className={s.formNote}>Claimed once the month is over, from {shortDay(foodMonthOpensOn(foodMonth))}.</p> : null}
            </div>
            {foodMonth && (
              <div className={s.field}><span className={s.fieldLabel}>Brand weeks</span>
                <div className={s.weeks}>
                  {foodWeeks.map(({ week: w, days }) => {
                    const open = !!w.worked && openWeeks.has(w.key);
                    return (
                      <div key={w.key} className={`${s.foodWeek} ${days.length ? s.weekOn : ""} ${w.worked ? "" : s.weekOff}`}
                        style={days.length ? { borderColor: w.color, background: w.tint } : undefined}>
                        <button className={s.foodWeekHead} onClick={() => toggleWeek(w.key)} aria-expanded={open} disabled={!w.worked}>
                          <span className={`${s.weekBadge} ${s.weekBadgeMonth}`} style={{ background: w.color }}><span className={s.weekMonth}>{w.month}</span>{w.n}</span>
                          <span className={s.weekText}>
                            <span className={s.weekTitle}>{w.brandWeek} · {w.dates}</span>
                            <span className={s.weekWhere}>{w.worked ? [w.venue, w.org].filter(Boolean).join(" · ") || "Your booth that weekend" : "No booth that weekend"}</span>
                          </span>
                          {w.worked && <span className={s.foodWeekCount}>{days.length ? `${days.length} day${days.length === 1 ? "" : "s"}` : "None"}</span>}
                          {w.worked && <span className={`${s.wlCaret} ${open ? s.wlCaretOpen : ""}`}><Svg d={ICON.chevronDown} size={16} sw={2} stroke="var(--rv-sub)" /></span>}
                        </button>
                        {open && (
                          <Reveal className={s.foodDays} role="group" aria-label={`Days of the ${w.brandWeek}, ${w.dates}`}>
                            {fairDays(w, w.key).map(day => {
                              const state = foodDayState(day, today, takenDays);
                              const ticked = state === "open" && days.includes(day);
                              return (
                                <button key={day} className={`${s.foodDay} ${ticked ? s.foodDayOn : ""}`} disabled={state !== "open"} aria-pressed={ticked}
                                  aria-label={`${weekdayShort(day)} ${Number(day.slice(8, 10))} ${MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}${state === "claimed" ? ", claimed" : state === "ahead" ? ", not yet" : ""}`}
                                  onClick={() => toggleDay(w, day)}>
                                  <span className={s.foodDayWk}>{weekdayShort(day)}</span>
                                  <span className={s.foodDayN}>{Number(day.slice(8, 10))}</span>
                                  <span className={s.foodDayNote}>
                                    {state === "claimed" ? "Claimed" : state === "ahead" ? "Not yet"
                                      : ticked ? <Svg d={ICON.tick} size={13} sw={2.6} /> : MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}
                                  </span>
                                </button>
                              );
                            })}
                          </Reveal>
                        )}
                      </div>
                    );
                  })}
                  {!foodWeeks.length && <p className={s.local}>No fair weekends in {monthShort(foodMonth)}.</p>}
                </div>
              </div>
            )}
            <div className={s.sum}>
              <div className={s.sumRow}><span className={s.sumLabel}>Month</span><span className={`${s.sumValue} ${s.sumWords}`}>{foodMonth ? monthShort(foodMonth) : "—"}</span></div>
              <div className={s.sumRow}><span className={`${s.sumLabel} ${s.sumLabelFixed}`}>Days</span><span className={`${s.sumValue} ${s.sumWords} ${s.sumDays}`}>{foodDays.length ? `${foodDays.length} day${foodDays.length === 1 ? "" : "s"} · ${dayList(foodDays)}` : "—"}</span></div>
              <div className={s.sumRow}><span className={s.sumLabel}>Rate a day</span><span className={s.sumValue}>{perDay !== null && perDay > 0 ? rm2(perDay) : "Not set"}</span></div>
              <div className={s.sumTotal}><span className={s.sumTotalLabel}>Claim amount</span><span className={s.sumTotalValue}>{rm2(foodTotal)}</span></div>
              <span className={s.sumNote}>Set by HR&apos;s rate a day. You can&apos;t edit the amount.</span>
            </div>
            <label className={s.field}><span className={s.fieldLabel}>Notes (optional)</span><textarea rows={2} className={`${s.input} ${s.textarea}`} placeholder="Anything HR should know" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1500} /></label>
          </>
        )}
        {kind === "claim" && (
          <>
            <div className={s.field}><span className={s.fieldLabel}>Claim category</span>
              <div className={s.cats}>
                {/* An Airbnb stay is the transport claim's tick: a title ticked for the air ticket alone sees Outstation, a plane ticket only (2026-10-31). */}
                {([["outstation", "Outstation", planeOnly ? "Plane ticket only" : "Fixed by spots for the route", CAT_OUT], ["airbnb", "Airbnb accommodation", perPax !== null ? `Up to ${rm0(perPax)} per pax per night` : "Rate not set yet", CAT_AIR]] as const)
                  .filter(([id]) => id === "outstation" || parts.road || cat === id).map(([id, label, note, d]) => (
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
                    <button key={w.key} className={`${s.week} ${on ? s.weekOn : ""} ${w.claimable ? "" : s.weekOff}`} onClick={() => pickWeek(w)} aria-pressed={on}
                      disabled={!w.claimable} style={on ? { borderColor: w.color, background: w.tint } : undefined}>
                      <span className={`${s.weekBadge} ${s.weekBadgeMonth}`} style={{ background: w.color }}><span className={s.weekMonth}>{w.month}</span>{w.n}</span>
                      <span className={s.weekText}>
                        <span className={s.weekTitle}>{w.brandWeek} · {w.dates}</span>
                        <span className={s.weekWhere}>{w.claimable
                          ? [w.venue, w.org, w.auto ? "auto-located" : null].filter(Boolean).join(" · ")
                          : "Not picked, and nothing sold that weekend"}</span>
                      </span>
                    </button>
                  );
                })}
                {!options.weeks.length && <p className={s.local}>No fair weekends to claim for yet.</p>}
              </div>
            </div>
            {cat === "outstation" ? (
              weekRow?.claimable ? (
                <>
                  <div className={s.field}><span className={s.fieldLabel}>Fair region</span>
                    {regionRow ? (
                      <div className={s.regionSet}>
                        <span className={`${s.region} ${s.regionOn} ${s.regionChip}`}>{regionRow.name}</span>
                        <span className={s.regionFrom}>Set by HR for {venue}</span>
                      </div>
                    ) : <p className={s.local}>HR has not set the region for {venue} yet. It can be claimed once they have.</p>}
                  </div>
                  {partProblem && <p className={s.local}>{partProblem}</p>}
                  {!partProblem && regionRow?.planeTicket && (
                    <>
                      <div className={s.spots}>
                        <span className={s.spotsN}><Svg d={PLANE} size={26} sw={1.9} /></span>
                        <span className={s.spotsText}><span className={s.spotsTitle}>Plane ticket</span><span className={s.spotsRoute}>{options.rates.base} → {regionRow.name} · the price on its invoice</span></span>
                      </div>
                      <label className={s.field}><span className={s.fieldLabel}>Ticket price (RM)</span>
                        <input type="text" inputMode="decimal" className={s.input} placeholder="e.g. 456.70" value={ticket} onChange={e => setTicket(e.target.value)} maxLength={12} />
                      </label>
                      <div className={s.sum}>
                        <div className={s.sumTotal}><span className={s.sumTotalLabel}>Claim amount</span><span className={s.sumTotalValue}>{rm2(amount)}</span></div>
                        <span className={s.sumNote}>HR checks it against the invoice.</span>
                      </div>
                      <Invoice file={file} fileRef={fileRef} onFile={setFile} />
                    </>
                  )}
                  {!partProblem && regionRow && !regionRow.planeTicket && regionRow.spots > 0 && (
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
                  {!partProblem && regionRow && !regionRow.planeTicket && regionRow.spots === 0 && <p className={s.local}>{venue} is local to {options.rates.base}, so there is no outstation claim.</p>}
                </>
              ) : null
            ) : !weekRow?.claimable ? null : partProblem ? (
              <p className={s.local}>{partProblem}</p>
            ) : !regionRow ? (
              <p className={s.local}>HR has not set the region for {venue} yet. It can be claimed once they have.</p>
            ) : !isOutstation(regionRow) ? (
              // Airbnb is for an outstation fair only (user 2026-10-06).
              <p className={s.local}>{venue} is local to {options.rates.base}, so there is no Airbnb claim.</p>
            ) : (
              <>
                <div className={s.field}><span className={s.fieldLabel}>Check-in and check-out</span>
                  {range && (
                    <StayCalendar range={range} checkIn={checkIn} checkOut={checkOut} tone={weekRow.color}
                      onPick={next => { setCheckIn(next.checkIn); setCheckOut(next.checkOut); setError(null); }} />
                  )}
                </div>
                {range && (
                  <p className={stayIssue ? s.formError : s.formNote}>{stayIssue
                    ?? `Open from the day before the fair to the day after (${dayRange(range.first, range.last)}). Dots mark the fair's days.`}</p>
                )}
                <div className={s.field}><span className={s.fieldLabel}>Who stayed</span>
                  <div className={s.pax}>
                    <Counter label="Male" value={male} onChange={setMale} />
                    <Counter label="Female" value={female} onChange={setFemale} />
                  </div>
                </div>
                <label className={s.field}><span className={s.fieldLabel}>Invoice total (RM)</span>
                  <input type="text" inputMode="decimal" className={s.input} placeholder="e.g. 380.00" value={stay} onChange={e => setStay(e.target.value)} maxLength={12} />
                </label>
                <div className={s.sum}>
                  <div className={s.sumRow}><span className={s.sumLabel}>Total pax</span><span className={s.sumValue}>{pax} pax · {male} male, {female} female</span></div>
                  <div className={s.sumRow}><span className={s.sumLabel}>Nights</span><span className={s.sumValue}>{nights !== null && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "—"}</span></div>
                  {group
                    ? <div className={s.sumRow}><span className={s.sumLabel}>Up to, per night</span><span className={s.sumValue}>{rm2(capPerNight)}</span></div>
                    : <div className={s.sumRow}><span className={s.sumLabel}>Up to, per pax per night</span><span className={s.sumValue}>{perPax !== null ? rm2(perPax) : "Not set"}</span></div>}
                  <div className={s.sumRow}><span className={s.sumLabel}>Most for this stay</span><span className={s.sumValue}>{cap !== null ? rm2(cap) : "—"}</span></div>
                  <div className={s.sumTotal}><span className={s.sumTotalLabel}>Claim amount</span><span className={s.sumTotalValue}>{rm2(amount)}</span></div>
                  <span className={s.sumNote}>{stayValue !== null && cap !== null && stayValue > cap
                    ? `The invoice is over the limit, so the claim is ${rm2(amount)}. HR checks it against the invoice.`
                    : group
                      ? `Up to ${options.rates.groupMaxPax} pax claim the invoice's total, up to ${rm0(capPerNight)} a night. HR checks it against the invoice.`
                      : perPax === null
                        ? "HR has not set the Airbnb rate yet."
                        : `${capPerNight > 0 ? `More than ${options.rates.groupMaxPax} pax claim` : "You claim"} the invoice's total, up to ${rm0(perPax)} per pax a night. HR checks it against the invoice.`}</span>
                </div>
                <Invoice file={file} fileRef={fileRef} onFile={setFile} />
              </>
            )}
            <label className={s.field}><span className={s.fieldLabel}>Notes (optional)</span><textarea rows={2} className={`${s.input} ${s.textarea}`} placeholder="Anything HR should know" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1500} /></label>
          </>
        )}
        {kind === "replacement" && (
          <>
            {rquestions.map(f => {
              // HR's own questions (2026-10-11), where HR put them.
              if (!f.builtin) {
                return (
                  <FormQuestion key={f.id} f={f} err={blank.has(f.id)} value={vals[f.id] ?? ""} maxLength={500} onValue={v => setVal(f.id, v)}
                    choices={f.type === "dropdown" || f.type === "yesno" ? (f.type === "yesno" ? ["Yes", "No"] : f.options ?? []).map(o => [o, o] as const) : null} />
                );
              }
              // The five built-ins, each with this form's own controls.
              if (f.id === "original") return (
            <div key={f.id} className={s.field}><span className={s.fieldLabel}>Original member</span>
              <div className={s.pills}>
                {options.members.map(m => (
                  <button key={m.id} className={`${s.pill} ${member === m.id ? s.pillOn : ""}`} onClick={() => setMember(m.id)} aria-pressed={member === m.id}>{m.name}</button>
                ))}
                {!options.members.length && <p className={s.local}>Nobody reports to you in this sub-department yet.</p>}
              </div>
            </div>
              );
              if (f.id === "destination") return (
            <Fragment key={f.id}>
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
            </Fragment>
              );
              if (f.id === "source") return (
            <Fragment key={f.id}>
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
            </Fragment>
              );
              if (f.id === "effective") return (
            <label key={f.id} className={s.field}><span className={s.fieldLabel}>Planned effective date</span><input type="date" className={s.input} value={effective} onChange={e => setEffective(e.target.value)} /></label>
              );
              if (f.id === "reason") return (
            <label key={f.id} className={s.field}><span className={s.fieldLabel}>Reason and arrangement</span><textarea rows={3} className={`${s.input} ${s.textarea}`} placeholder="Why, and how the handover works" value={reason} onChange={e => setReason(e.target.value)} maxLength={3000} /></label>
              );
              return null;
            })}
            <SignedFormBox title="Replacement form" needs={needsForm} flagged={tried && needsForm} signedName={signedName} fetching={fetching}
              note="Download the form, print it in black and white, fill it in and have it signed, then upload a photo or scan — or the filled-in Word file."
              label="Signed replacement form" onDownload={() => void downloadForm()} onFile={file => { setSigned(file); setError(null); }} />
            <p className={s.formNote}>Transfers need the receiving department to confirm. Member and payroll records change after approval.</p>
          </>
        )}
        {kind === "waiting" && (
          <>
            <div className={s.capPill}><span className={s.capPillLabel}>{department?.name ?? options.subName} capacity</span><span className={s.capPillValue}>{capacityLine(department)}</span></div>
            {questions.map(f => {
              // The built-in sub-department offers the department's sub-departments; HR's own, their options.
              const choices = f.type !== "dropdown" && f.type !== "yesno" ? null
                : f.builtin && f.id === "target"
                  ? options.departments.map(d => [d.id, d.name] as const)
                  : (f.type === "yesno" ? ["Yes", "No"] : f.options ?? []).map(o => [o, o] as const);
              return (
                <FormQuestion key={f.id} f={f} err={blank.has(f.id)} choices={choices}
                  value={f.id === "target" ? target || options.departmentId : vals[f.id] ?? ""}
                  onValue={v => (f.id === "target" ? setTarget(v) : setVal(f.id, v))}
                  anyTime={f.builtin && f.id === "start"}
                  maxLength={f.id === "contact" ? 32 : f.id === "newPerson" ? 150 : 500} />
              );
            })}
            <SignedFormBox title="Application form" needs={needsForm} flagged={tried && needsForm} signedName={signedName} fetching={fetching}
              note="Download the form, print it in black and white, have the applicant fill it in and sign, then upload a photo or scan — or the filled-in Word file."
              label="Signed application form" onDownload={() => void downloadForm()} onFile={file => { setSigned(file); setError(null); }} />
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

/** A returned food claim's weekends and their days, as it was sent (`detail.weeks`). */
function priorFoodDays(prior: Record<string, unknown>): Record<string, string[]> {
  if (prior.claimType !== "food" || !Array.isArray(prior.weeks)) return {};
  return Object.fromEntries(prior.weeks.flatMap(w => {
    const x = w && typeof w === "object" ? (w as Record<string, unknown>) : null;
    return x && typeof x.week === "string" && Array.isArray(x.days) ? [[x.week, x.days.filter((d): d is string => typeof d === "string")]] : [];
  }));
}

function rm0(n: number): string {
  return Number.isInteger(n) ? `RM ${n}` : rm2(n);
}

/** A typed amount in RM — up to two decimals, else nothing. */
function money(typed: string): number | null {
  return /^\d{1,9}(\.\d{1,2})?$/.test(typed.trim()) ? Number(typed.trim()) : null;
}

/** Hand the phone a file to keep — the application form, built or HR's. */
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The invoice: an Airbnb stay's, or a plane ticket's. */
function Invoice({ file, fileRef, onFile }: { file: File | null; fileRef: RefObject<HTMLInputElement | null>; onFile: (file: File | null) => void }) {
  return (
    <div className={s.field}><span className={s.fieldLabel}>Invoice</span>
      <button className={s.upload} onClick={() => fileRef.current?.click()}>
        <Svg d={CAMERA} size={24} sw={1.8} stroke="var(--rv-accent)" />
        <span className={s.uploadTitle}>{file ? file.name : "Take a photo or choose a file"}</span>
        <span className={s.uploadSub}>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to change` : "JPG, PNG or PDF, up to 100 MB"}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={e => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
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

/**
 * One question of a form HR set — pills for a choice (Dropdown, Yes / No), a
 * field for the rest; "(optional)" when it need not be answered and a red
 * Required once a send found it blank. The waiting list's and, since
 * 2026-10-11, the replacement's. Declared out here so a field keeps its focus
 * while it is typed in. The waiting list's start date may be *Any time ready*
 * instead of a day (2026-10-14) — a pill beside it, the day then left empty.
 */
function FormQuestion({ f, err, value, choices, onValue, maxLength, anyTime = false }: {
  f: WaitingField;
  err: boolean;
  value: string;
  /** [value, label] for a choice; null for a typed field. */
  choices: ReadonlyArray<readonly [string, string]> | null;
  onValue: (value: string) => void;
  maxLength: number;
  /** A day, or Any time ready. */
  anyTime?: boolean;
}) {
  const head = (
    <span className={`${s.fieldLabel} ${s.qHead}`}>
      <span>{f.label}{f.required ? "" : " (optional)"}</span>
      {err && <span className={s.qErr}>Required</span>}
    </span>
  );
  if (choices) {
    return (
      <div className={s.field} role="group" aria-label={f.label}>
        {head}
        <div className={s.pills}>
          {choices.map(([id, label]) => (
            <button key={id} className={`${s.pill} ${value === id ? s.pillOn : ""}`} aria-pressed={value === id} onClick={() => onValue(id)}>{label}</button>
          ))}
        </div>
      </div>
    );
  }
  if (anyTime) {
    const on = isAnyTime(value);
    return (
      <div className={s.field}>
        {head}
        <div className={s.dayOrAny}>
          <input type="date" aria-label={f.label} className={`${s.input} ${err ? s.inputErr : ""}`} value={on ? "" : value}
            disabled={on} onChange={e => onValue(e.target.value)} />
          <button type="button" className={`${s.pill} ${on ? s.pillOn : ""}`} aria-pressed={on} onClick={() => onValue(on ? "" : ANY_TIME)}>{ANY_TIME_LABEL}</button>
        </div>
      </div>
    );
  }
  return (
    <label className={s.field}>
      {head}
      <input type={f.type === "date" ? "date" : f.type === "phone" ? "tel" : "text"} inputMode={f.type === "phone" ? "tel" : undefined}
        className={`${s.input} ${err ? s.inputErr : ""}`} placeholder={f.placeholder ?? ""} value={value}
        onChange={e => onValue(e.target.value)} maxLength={maxLength} />
    </label>
  );
}

/**
 * What the signed form may be: a photo or scan (JPG, PNG, PDF) — and, since
 * 2026-10-20 ("need as well"), the filled-in Word file (.docx, or an old .doc).
 * Types and extensions both, so a phone's picker offers Word documents too.
 */
const SIGNED_FORM_TYPES = [
  "image/jpeg", "image/png", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".doc", ".docx",
].join(",");

/**
 * The form to print and sign: Download form (HR's upload, or the black-and-
 * white one built from the questions), Upload signed form → Replace file, and
 * "✓ name" — "(optional)" unless HR's form requires it.
 */
function SignedFormBox({ title, note, label, needs, flagged, signedName, fetching, onDownload, onFile }: {
  title: string;
  note: string;
  /** The hidden file input's name. */
  label: string;
  needs: boolean;
  /** A send found it missing. */
  flagged: boolean;
  signedName: string;
  fetching: boolean;
  onDownload: () => void;
  onFile: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className={s.appForm}>
      <span className={s.appFormTitle}>{title}{needs ? "" : " (optional)"}</span>
      <span className={s.appFormNote}>{note}</span>
      <div className={s.appFormBtns}>
        <button className={`${s.appFormBtn} ${s.appFormBtnPlain}`} onClick={onDownload} aria-busy={fetching}><Svg d={DOWNLOAD} size={15} sw={1.8} />Download form</button>
        <button className={`${s.appFormBtn} ${signedName ? s.appFormBtnOn : flagged ? s.appFormBtnErr : ""}`} onClick={() => ref.current?.click()}>
          <Svg d={UPLOAD} size={15} sw={1.8} />{signedName ? "Replace file" : "Upload signed form"}
        </button>
      </div>
      <input ref={ref} type="file" accept={SIGNED_FORM_TYPES} hidden aria-label={label}
        onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); }} />
      {signedName && <span className={s.appFormFile}>✓ {signedName}</span>}
    </div>
  );
}
