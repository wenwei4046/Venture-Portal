"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  adminMemberAction,
  type AdminMemberData,
  type AdminMemberInput,
} from "@/app/(member)/member/actions";
import s from "./member.module.css";

const names: Record<string, string> = {
  submitted: "Pending review",
  needs_info: "More information needed",
  approved: "Approved",
  rejected: "Rejected",
  waiting: "Waiting",
  reserved: "Reserved",
  accepted: "Applicant confirmed",
  allocated: "Allocated",
  executed: "Completed",
  withdrawn: "Withdrawn",
  expired: "Expired",
  paid: "Paid",
};
const detailLabels: Record<string, string> = {
  category: "Claim category",
  amount: "Claim amount",
  location: "Location",
  start: "Start / joining date",
  end: "End date",
  newPerson: "New member / replacement",
  contact: "Mobile number",
  signature: "Signed by",
  destination: "Original member arrangement",
  replacementSource: "Replacement source",
  effective: "Planned effective date",
  reason: "Reason and notes",
  invoiceName: "Invoice",
  department: "Request department",
  subDepartmentId: "Request department",
  targetDepartmentId: "Preferred / receiving department",
  originalStaffId: "Original member",
  allocatedStaffId: "Linked new member",
  uplineStaffId: "Direct manager",
  reservationExpiresAt: "Reservation expires",
};
const detailValues: Record<string, string> = {
  department_exit: "Leave this department only",
  member_exit: "Leave this department only",
  transfer: "Transfer to another department",
  company_exit: "Leave the company",
  resignation: "Leave the company",
  exit: "Leave the company",
  new: "New member joining",
  existing: "Existing member",
  waiting: "Waiting List",
  vacancy: "Release the position without a replacement",
};
// Preserve existing catalogue values while presenting English labels.
const categoryNames: Record<string, string> = {
  床垫: "Mattress",
  床架: "Bed frame",
  沙发: "Sofa",
  枕头: "Pillow",
  Protector: "Protector",
  赠品床架: "Gift bed frame",
  "Outstation 住宿": "Outstation accommodation",
  "Airbnb 住宿": "Airbnb accommodation",
};
function displayDetail(key: string, value: unknown, data: AdminMemberData) {
  const raw = String(value);
  if (key === "category") return categoryNames[raw] ?? raw;
  if (key === "amount")
    return Number.isFinite(Number(value))
      ? new Intl.NumberFormat("en-MY", {
          style: "currency",
          currency: "MYR",
        }).format(Number(value))
      : raw;
  if (key === "destination" || key === "replacementSource")
    return detailValues[raw] ?? raw;
  if (key === "subDepartmentId" || key === "targetDepartmentId")
    return (
      data.departments.find((d) => d.id === raw)?.name ??
      `Department ID · ${raw}`
    );
  if (
    key === "originalStaffId" ||
    key === "allocatedStaffId" ||
    key === "uplineStaffId"
  )
    return (
      data.candidates.find((c) => c.id === raw)?.name ??
      data.uplines.find((p) => p.id === raw)?.name ??
      `Member ID · ${raw}`
    );
  if (key === "reservationExpiresAt")
    return new Date(raw).toLocaleString("en-MY", {
      timeZone: "Asia/Kuala_Lumpur",
    });
  return raw;
}
export default function MemberAdmin({
  initialData,
  demo = false,
}: {
  initialData: AdminMemberData;
  demo?: boolean;
}) {
  const [data, setData] = useState(initialData),
    [tab, setTab] = useState(
      initialData.canManageRequests
        ? "requests"
        : initialData.canPublishMemos
          ? "memos"
          : "products",
    ),
    [selected, setSelected] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [candidate, setCandidate] = useState(""),
    [accepted, setAccepted] = useState(false),
    [titleId, setTitleId] = useState(""),
    [uplineStaffId, setUplineStaffId] = useState(""),
    [rosterChecked, setRosterChecked] = useState(false),
    [invoiceUrl, setInvoiceUrl] = useState("");
  const request = data.requests.find((r) => r.id === selected);
  const running = useRef(false);
  const requestSub = String(
    request?.detail.subDepartmentId ??
      request?.detail.targetDepartmentId ??
      data.departments.find((d) => d.name === request?.detail.department)?.id ??
      "",
  );
  const linkedId = String(request?.detail.allocatedStaffId ?? "");
  const linkedName = data.candidates.find((c) => c.id === linkedId)?.name;
  const canCreate =
    data.departments.find((d) => d.id === requestSub)?.name.toLowerCase() ===
    "fair";
  const titles = (data.titles ?? []).filter((t) =>
    t.subDepartmentIds?.includes(requestSub),
  );
  const uplines = (data.uplines ?? []).filter(
    (p) => p.subDepartmentId === requestSub,
  );
  const today = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
  const needsNote = ["qualify", "approve", "reject", "needs_info", "accept"];

  async function run(input: AdminMemberInput) {
    if (running.current) return;
    const allowed =
      input.action === "publish_memo"
        ? data.canPublishMemos
        : input.action === "configure_product"
          ? data.canConfigureProducts
          : data.canManageRequests;
    if (!allowed) {
      setMessage("Your account does not have permission for this action.");
      return;
    }
    if (needsNote.includes(input.action) && !String(input.note ?? "").trim()) {
      setMessage(
        "Enter review notes or a record of the applicant’s confirmation.",
      );
      return;
    }
    if (
      input.action === "publish_memo" &&
      (!Array.isArray(input.departments) || !input.departments.length)
    ) {
      setMessage("Choose at least one department for this memo.");
      return;
    }
    running.current = true;
    setBusy(true);
    setMessage("");
    setInvoiceUrl("");
    try {
      if (demo) {
        const next = structuredClone(data),
          r = next.requests.find((r) => r.id === input.requestId),
          now = new Date().toISOString();
        const event = (status: string, description: string) => {
          if (!r) return;
          next.events.unshift({
            request_id: r.id,
            actor_id: null,
            from_status: r.status,
            to_status: status,
            note: "Demo · " + description,
            created_at: now,
          });
          r.status = status;
          if (input.note) r.note = input.note;
        };
        const reserve = (id: string) => {
          const d = next.departments.find((d) => d.id === id);
          if (!d || d.capacity === null) return;
          for (const row of next.requests) {
            const sub = String(
              row.detail.subDepartmentId ??
                row.detail.targetDepartmentId ??
                next.departments.find((d) => d.name === row.detail.department)
                  ?.id ??
                "",
            );
            if (d.occupied + d.reserved >= d.capacity) break;
            if (
              row.kind === "waiting" &&
              row.status === "waiting" &&
              sub === id &&
              String(row.detail.start ?? "") <= today()
            ) {
              next.events.unshift({
                request_id: row.id,
                actor_id: null,
                from_status: row.status,
                to_status: "reserved",
                note: "Demo · Position matched and reserved",
                created_at: now,
              });
              row.status = "reserved";
              row.detail.reservationExpiresAt = new Date(
                Date.now() + 48 * 60 * 60 * 1000,
              ).toISOString();
              d.reserved++;
            }
          }
        };
        if (input.action === "invoice") {
          setMessage(
            "This demo request has no invoice. Live requests provide a private file link that expires.",
          );
          return;
        }
        if (input.action === "set_capacity") {
          const d = next.departments.find(
              (d) => d.id === input.subDepartmentId,
            ),
            capacity = Number(input.capacity);
          if (
            !d ||
            !Number.isInteger(capacity) ||
            capacity < 1 ||
            capacity > 10000 ||
            capacity < d.occupied + d.reserved
          )
            throw new Error(
              "Capacity cannot be lower than active members plus reserved positions.",
            );
          d.capacity = capacity;
        } else if (input.action === "process_queue")
          reserve(String(input.subDepartmentId));
        else if (input.action === "publish_memo") {
          const audience = input.departments as string[];
          next.memos.unshift({
            id: "DEMO-MEMO-" + crypto.randomUUID(),
            title: String(input.title),
            body: String(input.body),
            sender: String(input.sender),
            publishedAt: now,
            effectiveAt: String(input.effectiveAt),
            version: Number(input.version),
            requiresAck: input.requiresAck === true,
            readAt: null,
            acknowledgedAt: null,
            departments: next.departments
              .filter((d) => audience.includes(d.id))
              .map((d) => d.name),
          });
        } else if (input.action === "configure_product")
          next.products = next.products.map((p) =>
            p.id === input.productId
              ? {
                  ...p,
                  category: String(input.category),
                  size: String(input.size),
                  color: String(input.color),
                  gift: input.gift === true,
                  available: input.available === true,
                }
              : p,
          );
        else if (!r) throw new Error("Select a request.");
        else if (input.action === "bind_candidate") {
          if (!["reserved", "accepted", "approved"].includes(r.status))
            throw new Error(
              "Reserve a position or approve the arrangement before linking a staff record.",
            );
          const c = next.candidates.find((c) => c.id === input.staffId);
          if (
            !c ||
            c.name.trim().toLowerCase() !==
              String(r.detail.newPerson ?? "")
                .trim()
                .toLowerCase()
          )
            throw new Error("The staff record name must match the applicant.");
          r.detail.allocatedStaffId = c.id;
          event(r.status, "Linked staff record: " + c.name);
        } else if (input.action === "create_candidate") {
          if (
            !canCreate ||
            r.kind !== "waiting" ||
            r.status !== "accepted" ||
            r.detail.allocatedStaffId
          )
            throw new Error(
              "Staff records can be created for confirmed Fair applicants without an existing linked record.",
            );
          const title = titles.find((t) => t.id === input.titleId);
          if (!title) throw new Error("Select an applicable title.");
          const id = "DEMO-STAFF-" + crypto.randomUUID();
          next.candidates.push({
            id,
            name: String(r.detail.newPerson),
            departmentId: title.departmentId ?? "",
            titleId: title.id,
          });
          r.detail.allocatedStaffId = id;
          r.detail.uplineStaffId = input.uplineStaffId ?? null;
          event(
            r.status,
            "Created demo staff record with " + title.name + " assignment",
          );
        } else if (input.action === "accept") {
          if (r.status !== "reserved" || input.applicantConfirmed !== true)
            throw new Error(
              "Reserve a position and verify the applicant’s confirmation first.",
            );
          event("accepted", String(input.note));
        } else if (input.action === "allocate") {
          if (r.status !== "accepted" || !r.detail.allocatedStaffId)
            throw new Error(
              "Confirm the applicant’s acceptance and link a staff record first.",
            );
          event(
            "allocated",
            String(
              input.note ||
                "Demo allocation completed after checking the assignment",
            ),
          );
          const d = next.departments.find((d) => d.id === requestSub);
          if (d) {
            d.reserved = Math.max(0, d.reserved - 1);
            d.occupied++;
          }
        } else if (input.action === "execute") {
          if (
            r.status !== "approved" ||
            String(r.detail.effective ?? "") > today() ||
            (r.detail.replacementSource !== "vacancy" &&
              !r.detail.allocatedStaffId)
          )
            throw new Error(
              "Approve the arrangement, link the replacement and wait for the effective date.",
            );
          event(
            "executed",
            String(
              input.note ||
                "Demo change marked complete after verifying staff arrangements",
            ),
          );
        } else if (["qualify", "approve"].includes(input.action)) {
          if (!["submitted", "needs_info", "expired"].includes(r.status))
            throw new Error(
              "This request cannot be approved again in its current status.",
            );
          event(
            r.kind === "waiting" ? "waiting" : "approved",
            String(input.note),
          );
          if (r.kind === "waiting") reserve(requestSub);
        } else if (["needs_info", "reject"].includes(input.action)) {
          event(
            input.action === "reject" ? "rejected" : "needs_info",
            String(input.note),
          );
        } else throw new Error("This action is not available in the demo.");
        setData(next);
        setAccepted(false);
        setRosterChecked(false);
        setMessage(
          "Demo action recorded for this preview. Refreshing resets these changes. Live staff and financial records are unaffected.",
        );
        return;
      }
      const result = await adminMemberAction(input);
      if (!result.ok) throw new Error(result.error);
      if (input.action === "invoice") {
        setInvoiceUrl((result.data as { url: string }).url);
        setMessage(
          "Your invoice is ready. Open the file link before it expires.",
        );
        return;
      }
      const fresh = await adminMemberAction({ action: "list" });
      if (!fresh.ok) {
        setMessage(
          "Changes saved, but the list could not refresh. Reload and check the result before continuing.",
        );
        return;
      }
      setData(fresh.data as AdminMemberData);
      setAccepted(false);
      setRosterChecked(false);
      setMessage("Changes saved.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The action could not be completed. Please try again.",
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const action = (
    name: string,
    action: string,
    extra: Record<string, unknown> = {},
  ) => (
    <button
      type="button"
      className={s.button}
      disabled={
        busy ||
        !data.canManageRequests ||
        (needsNote.includes(action) && !note.trim())
      }
      onClick={() =>
        void run({ action, requestId: request?.id, note, ...extra })
      }
    >
      {name}
    </button>
  );
  const bindControls = request && (
    <div className={s.form} style={{ marginTop: 20 }}>
      <h3>
        {linkedId ? "Linked staff record" : "Link a replacement or new member"}
      </h3>
      {linkedId ? (
        <p className={s.notice}>{linkedName || linkedId}</p>
      ) : (
        <>
          <p className={s.sub}>
            The record name must match {String(request.detail.newPerson ?? "")}{" "}
            in the request. Department and active status will also be checked.
          </p>
          <label className={s.field}>
            <span>Staff record</span>
            <select
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            >
              <option value="">Select a member</option>
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className={s.button}
            disabled={!candidate || busy || !data.canManageRequests}
            onClick={() =>
              void run({
                action: "bind_candidate",
                requestId: request.id,
                staffId: candidate,
                note,
              })
            }
          >
            Link staff record
          </button>
        </>
      )}
    </div>
  );
  return (
    <div className={s.workspace} lang="en-MY">
      <main className={s.main}>
        <div className={s.titleRow}>
          <div>
            <p className={s.eyebrow}>REVENUE · PEOPLE OPERATIONS</p>
            <h1>Member services</h1>
            <p className={`${s.sub} ${s.intro}`}>
              Manage HR requests, waiting lists, memos and the member catalogue.
            </p>
          </div>
          <Link className={s.link} href={demo ? "/member/preview" : "/member"}>
            Member workspace →
          </Link>
        </div>
        {demo && (
          <div className={s.notice}>
            Admin preview · Live staff and financial records are unaffected
          </div>
        )}
        <div className={s.tabs}>
          {[
            ...(data.canManageRequests
              ? [
                  ["requests", "Request reviews"],
                  ["capacity", "Capacity & waiting list"],
                ]
              : []),
            ...(data.canPublishMemos ? [["memos", "Publish memo"]] : []),
            ...(data.canConfigureProducts
              ? [["products", "Product options"]]
              : []),
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {message && (
          <p role="status" className={s.notice}>
            {message}
          </p>
        )}
        {invoiceUrl && (
          <a
            className={s.link}
            href={invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open private invoice ↗
          </a>
        )}
        {tab === "requests" && (
          <div className={s.grid}>
            <section className={s.card}>
              <h2>Requests</h2>
              {data.requests.length ? (
                data.requests.map((r) => (
                  <button
                    key={r.id}
                    className={s.listRow}
                    disabled={busy}
                    aria-pressed={selected === r.id}
                    onClick={() => {
                      setSelected(r.id);
                      setNote("");
                      setCandidate("");
                      setAccepted(false);
                      setTitleId("");
                      setUplineStaffId("");
                      setRosterChecked(false);
                      setInvoiceUrl("");
                    }}
                  >
                    <div>
                      <h3>{r.title}</h3>
                      <p className={s.caption}>
                        {r.kind} · {r.id.slice(0, 12)}
                      </p>
                    </div>
                    <span className={`${s.pill} ${s.warning}`}>
                      {names[r.status] ?? r.status}
                    </span>
                  </button>
                ))
              ) : (
                <p className={s.sub}>No requests yet.</p>
              )}
            </section>
            <section className={s.card}>
              {request ? (
                <>
                  <h2>{request.title}</h2>
                  <p className={s.caption}>Reference {request.id}</p>
                  <dl className={s.dl} style={{ marginTop: 20 }}>
                    {Object.entries(request.detail)
                      .filter(
                        ([k, v]) =>
                          detailLabels[k] &&
                          v !== null &&
                          v !== undefined &&
                          v !== "" &&
                          typeof v !== "object" &&
                          !(
                            k === "subDepartmentId" && request.detail.department
                          ),
                      )
                      .map(([k, v]) => (
                        <div key={k} style={{ display: "contents" }}>
                          <dt>{detailLabels[k]}</dt>
                          <dd>{displayDetail(k, v, data)}</dd>
                        </div>
                      ))}
                  </dl>
                  {typeof request.detail.signatureImage === "string" &&
                    /^data:image\/png;base64,/.test(
                      request.detail.signatureImage,
                    ) && (
                      <div style={{ marginTop: 20 }}>
                        <h3>Applicant signature</h3>
                        <img
                          src={request.detail.signatureImage}
                          alt="Handwritten signature submitted by the applicant"
                          className={s.receiptPreview}
                        />
                      </div>
                    )}
                  {request.note && (
                    <p className={s.notice} style={{ marginTop: 20 }}>
                      Last review note: {request.note}
                    </p>
                  )}
                  <hr className={s.divider} />
                  {request.kind === "claim" ? (
                    <>
                      <p className={s.sub}>
                        This request is linked to a standard claim. Complete its
                        review and payment in the existing Claims workflow to
                        avoid duplicate processing.
                      </p>
                      {request.status === "submitted" && (
                        <>
                          <label className={s.field}>
                            <span>Additional invoice details / reason</span>
                            <textarea
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                            />
                          </label>
                          {action("Request more information", "needs_info")}
                        </>
                      )}
                      <div className={s.dialogActions}>
                        <Link
                          className={`${s.button} ${s.primary}`}
                          href="/claims"
                        >
                          Open claim review
                        </Link>
                        {action("View invoice", "invoice")}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>
                        {["submitted", "needs_info", "expired"].includes(
                          request.status,
                        )
                          ? "1 · Details and eligibility"
                          : "2 · Arrangements and completion"}
                      </h3>
                      <p className={s.caption}>
                        Record a note for approvals, requests for information,
                        rejections and applicant confirmations. Approval records
                        the plan; staff changes are completed separately.
                      </p>
                      <label className={s.field}>
                        <span>Review notes / reason</span>
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Explain requests for information, rejections or manual changes"
                        />
                      </label>
                      <div className={s.dialogActions}>
                        {["submitted", "needs_info", "expired"].includes(
                          request.status,
                        ) && (
                          <>
                            {action("Request more information", "needs_info")}
                            {action("Reject", "reject")}
                            {request.kind === "waiting"
                              ? action("Approve for waiting list", "qualify")
                              : action("Approve arrangement", "approve")}
                          </>
                        )}
                        {request.kind === "replacement" &&
                          request.status === "approved" && (
                            <>
                              <div className={s.full}>
                                {request.detail.replacementSource !==
                                  "vacancy" && bindControls}
                                <p className={s.sub}>
                                  Update the staff records and assignments, then
                                  confirm completion on or after the effective
                                  date.
                                </p>
                                <Link className={s.link} href="/team/people">
                                  Manage staff / department changes →
                                </Link>
                                <label className={s.check}>
                                  <input
                                    type="checkbox"
                                    checked={rosterChecked}
                                    onChange={(e) =>
                                      setRosterChecked(e.target.checked)
                                    }
                                  />
                                  <span>
                                    I have verified the original member’s
                                    arrangement, replacement assignment and
                                    effective date.
                                  </span>
                                </label>
                                <button
                                  className={s.button}
                                  disabled={
                                    busy ||
                                    !data.canManageRequests ||
                                    !rosterChecked ||
                                    String(request.detail.effective ?? "") >
                                      today() ||
                                    (request.detail.replacementSource !==
                                      "vacancy" &&
                                      !linkedId)
                                  }
                                  onClick={() =>
                                    void run({
                                      action: "execute",
                                      requestId: request.id,
                                      note,
                                    })
                                  }
                                >
                                  Confirm change completed
                                </button>
                              </div>
                            </>
                          )}
                      </div>
                      {request.kind === "waiting" &&
                        request.status === "waiting" && (
                          <p className={s.notice}>
                            The applicant is on the waiting list. An available
                            position can be reserved when the joining date is
                            eligible. View or run matching in Capacity & waiting
                            list.
                          </p>
                        )}
                      {request.kind === "waiting" &&
                        ["reserved", "accepted"].includes(request.status) && (
                          <div className={s.form} style={{ marginTop: 24 }}>
                            {bindControls}
                            {request.status === "reserved" && (
                              <>
                                <label className={s.check}>
                                  <input
                                    type="checkbox"
                                    checked={accepted}
                                    onChange={(e) =>
                                      setAccepted(e.target.checked)
                                    }
                                  />
                                  <span>
                                    I have verified that the applicant accepts
                                    the reserved position and joining
                                    arrangements.
                                  </span>
                                </label>
                                <button
                                  className={`${s.button} ${s.primary}`}
                                  disabled={
                                    !accepted ||
                                    !note.trim() ||
                                    busy ||
                                    !data.canManageRequests
                                  }
                                  onClick={() =>
                                    void run({
                                      action: "accept",
                                      requestId: request.id,
                                      applicantConfirmed: true,
                                      note,
                                    })
                                  }
                                >
                                  Record applicant confirmation
                                </button>
                              </>
                            )}
                            {request.status === "accepted" && (
                              <>
                                {!linkedId && canCreate && (
                                  <fieldset className={s.form}>
                                    <legend>
                                      New Fair member: create staff record and
                                      assignment
                                    </legend>
                                    <label className={s.field}>
                                      <span>Joining title</span>
                                      <select
                                        value={titleId}
                                        onChange={(e) =>
                                          setTitleId(e.target.value)
                                        }
                                      >
                                        <option value="">
                                          Select an applicable title
                                        </option>
                                        {titles.map((t) => (
                                          <option key={t.id} value={t.id}>
                                            {t.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <label className={s.field}>
                                      <span>Direct manager</span>
                                      <select
                                        value={uplineStaffId}
                                        onChange={(e) =>
                                          setUplineStaffId(e.target.value)
                                        }
                                      >
                                        <option value="">
                                          No manager · subject to department
                                          rules
                                        </option>
                                        {uplines.map((p) => (
                                          <option key={p.id} value={p.id}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <p className={s.caption}>
                                      Title, reporting line and capacity will be
                                      checked. After creating the record, verify
                                      salary and activate the login account
                                      separately.
                                    </p>
                                    <button
                                      className={s.button}
                                      disabled={
                                        !titleId ||
                                        busy ||
                                        !data.canManageRequests
                                      }
                                      onClick={() =>
                                        void run({
                                          action: "create_candidate",
                                          requestId: request.id,
                                          titleId,
                                          uplineStaffId: uplineStaffId || null,
                                          note,
                                        })
                                      }
                                    >
                                      {demo
                                        ? "Create demo staff record and assignment"
                                        : "Create staff record and assignment"}
                                    </button>
                                  </fieldset>
                                )}
                                {!canCreate && (
                                  <p className={s.notice}>
                                    For IR and other departments, create the
                                    staff record and correct assignment in
                                    People, then return here to link it.
                                  </p>
                                )}
                                <Link className={s.link} href="/team/people">
                                  Open People →
                                </Link>
                                <p className={s.sub}>
                                  Check the new member’s record and assignment
                                  before confirming allocation. Eligibility and
                                  capacity will be checked again.
                                </p>
                                <label className={s.check}>
                                  <input
                                    type="checkbox"
                                    checked={rosterChecked}
                                    onChange={(e) =>
                                      setRosterChecked(e.target.checked)
                                    }
                                  />
                                  <span>
                                    I have verified the new member’s record,
                                    assignment and joining arrangements.
                                  </span>
                                </label>
                                <button
                                  className={s.button}
                                  disabled={
                                    busy ||
                                    !data.canManageRequests ||
                                    !linkedId ||
                                    !rosterChecked
                                  }
                                  onClick={() =>
                                    void run({
                                      action: "allocate",
                                      requestId: request.id,
                                      note,
                                    })
                                  }
                                >
                                  Confirm allocation
                                </button>
                              </>
                            )}
                          </div>
                        )}
                    </>
                  )}
                  <hr className={s.divider} />
                  <h3>Activity log</h3>
                  {data.events
                    .filter((e) => e.request_id === request.id)
                    .map((e, i) => (
                      <div className={s.listRow} key={i}>
                        <div>
                          <strong>{names[e.to_status] ?? e.to_status}</strong>
                          <p className={s.sub}>{e.note}</p>
                          <p className={s.caption}>
                            {new Date(e.created_at).toLocaleString("en-MY", {
                              timeZone: "Asia/Kuala_Lumpur",
                            })}
                          </p>
                        </div>
                      </div>
                    ))}
                </>
              ) : (
                <p className={s.sub}>
                  Select a request to review its details and next steps.
                </p>
              )}
            </section>
          </div>
        )}
        {tab === "memos" && (
          <div className={s.grid}>
            <section className={s.card}>
              <h2>Publish a new memo</h2>
              <form
                className={s.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run({
                    action: "publish_memo",
                    title: f.get("title"),
                    body: f.get("body"),
                    sender: f.get("sender"),
                    effectiveAt: f.get("effective"),
                    requiresAck: f.get("ack") === "on",
                    departments: f.getAll("audience"),
                    version: Number(f.get("version")),
                  });
                }}
              >
                <label className={s.field}>
                  <span>Title</span>
                  <input name="title" required maxLength={200} />
                </label>
                <label className={s.field}>
                  <span>Sending department / author</span>
                  <input
                    name="sender"
                    required
                    defaultValue="People & Culture"
                  />
                </label>
                <label className={s.field}>
                  <span>Message</span>
                  <textarea name="body" required rows={7} maxLength={30000} />
                </label>
                <div className={s.two}>
                  <label className={s.field}>
                    <span>Effective date</span>
                    <input name="effective" type="date" required />
                  </label>
                  <label className={s.field}>
                    <span>Version</span>
                    <input
                      name="version"
                      type="number"
                      min={1}
                      defaultValue={1}
                      required
                    />
                  </label>
                </div>
                <fieldset>
                  <legend className={s.sub}>Audience departments</legend>
                  {data.departments.map((d) => (
                    <label
                      className={s.check}
                      key={d.id}
                      style={{ marginTop: 10 }}
                    >
                      <input type="checkbox" name="audience" value={d.id} />
                      {d.name}
                    </label>
                  ))}
                </fieldset>
                <label className={s.check}>
                  <input type="checkbox" name="ack" defaultChecked />
                  Require members to acknowledge reading
                </label>
                <button
                  className={`${s.button} ${s.primary}`}
                  disabled={busy || !data.canPublishMemos}
                >
                  Publish memo
                </button>
              </form>
            </section>
            <section className={s.card}>
              <h2>Published</h2>
              {data.memos.map((m) => (
                <div className={s.listRow} key={m.id}>
                  <div>
                    <h3>{m.title}</h3>
                    <p className={s.sub}>
                      {m.sender} · v{m.version}
                    </p>
                    <p className={s.caption}>{m.departments.join(" / ")}</p>
                  </div>
                </div>
              ))}
              <p className={s.caption} style={{ marginTop: 18 }}>
                Each publication creates a separate version. Members must
                acknowledge a new version again when confirmation is required.
              </p>
            </section>
          </div>
        )}
        {tab === "capacity" && (
          <section className={s.card}>
            <h2>Department capacity & reservations</h2>
            <p className={s.sub}>
              Capacity includes active members and reserved positions. Set an
              explicit limit for each department.
            </p>
            {data.departments.map((d) => (
              <form
                key={d.id}
                className={s.listRow}
                style={{ flexWrap: "wrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run({
                    action: "set_capacity",
                    subDepartmentId: d.id,
                    capacity: Number(
                      new FormData(e.currentTarget).get("capacity"),
                    ),
                  });
                }}
              >
                <div>
                  <h3>{d.name}</h3>
                  <p className={s.sub}>
                    Active {d.occupied} · Reserved {d.reserved}
                  </p>
                </div>
                <label className={s.field} style={{ width: 120 }}>
                  <span>Member limit</span>
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={10000}
                    defaultValue={d.capacity ?? ""}
                    required
                  />
                </label>
                <button
                  className={s.button}
                  disabled={busy || !data.canManageRequests}
                >
                  Save capacity
                </button>
                <button
                  className={s.button}
                  type="button"
                  disabled={busy || !data.canManageRequests}
                  onClick={() =>
                    void run({ action: "process_queue", subDepartmentId: d.id })
                  }
                >
                  Match vacancies
                </button>
              </form>
            ))}
          </section>
        )}
        {tab === "products" && (
          <section className={s.card}>
            <div className={s.sectionHead}>
              <h2>Sales catalogue</h2>
              <Link className={s.link} href="/revenue/products?tab=modular">
                Open Product List › Modular →
              </Link>
            </div>
            <p className={s.sub}>
              What members can quote is now set on the Product List, which
              mirrors the Houzs ERP&apos;s catalogue item by item. Tick a model
              and its SKUs on the Modular tab to offer them in the calculator,
              tick the leg heights, specials and bed frame heights its
              dropdowns may show, and key each SKU&apos;s price on the SKU
              Master tab — every margin is measured against those prices.
            </p>
            <p className={s.caption} style={{ marginTop: 10 }}>
              A SKU the ERP adds arrives unticked: the calculator never offers
              what nobody here decided to offer.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
