"use client";

import { useEffect, useRef, useState } from "react";
import type { ItSubmitInput } from "@/app/(member)/member/it-actions";
import { IT_CATEGORIES, IT_LIMITS, deviceLabel, submitProblem, type ItCategory, type ItRequest } from "@/lib/it-requests/model";
import { ICON, Svg } from "../icons";
import Sheet, { SheetHandle } from "../Sheet";
import { ItFileList, useItUploads, type ItUploader } from "./ItUploads";
import s from "./profile.module.css";
import t from "./it.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };
const CLOSE = "M6 6l12 12M18 6 6 18";

/** The device it is sent from, as IT wants to know it of a bug — read in the browser that sends it. */
function thisDevice(): string {
  if (typeof navigator === "undefined") return "";
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
  return deviceLabel(navigator.userAgent, { standalone, width: window.innerWidth, height: window.innerHeight });
}

/**
 * Send a request to IT (2026-10-20 — the user: "上面是 title，然后 details 讲具体内容，还可以加 screenshot。你可以选
 * category … suggest 加 feature 还是 fix bug，或者是有什么建议 … upload image 或者传一个包"): what it is (Fix a bug · New
 * feature · Suggestion), a title, the details, and screenshots or files — picked, or pasted on a computer — each going up
 * as soon as it is added. Sent, it says its number (IT-0007); closed unsent, what went up is taken out of the bucket.
 */
export default function ItRequestForm({ open, readOnly, onSubmit, onClose, upload }: {
  open: boolean;
  /** View as: the form fills in, and sends nothing. */
  readOnly: boolean;
  onSubmit: (input: ItSubmitInput) => Promise<Outcome<ItRequest>>;
  onClose: () => void;
  /** Tests and the preview: where a file goes instead of the bucket. */
  upload?: ItUploader;
}) {
  // A fresh form every time it opens.
  const [session, setSession] = useState(0);
  useEffect(() => { if (open) setSession(n => n + 1); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} z={23} height="90%" className={s.rfPanel} label="Send to IT">
      {open && <FormBody key={session} readOnly={readOnly} onSubmit={onSubmit} onClose={onClose} upload={upload} />}
    </Sheet>
  );
}

function FormBody({ readOnly, onSubmit, onClose, upload }: {
  readOnly: boolean;
  onSubmit: (input: ItSubmitInput) => Promise<Outcome<ItRequest>>;
  onClose: () => void;
  upload?: ItUploader;
}) {
  const [category, setCategory] = useState<ItCategory | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<ItRequest | null>(null);
  const files = useItUploads(upload);
  const { discard } = files;
  // Closed (or swiped away) before it was sent: what went up comes out again.
  const closed = useRef(false);
  const sending = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      // An in-flight send must finish filing its uploads before cleanup can remove any.
      if (!sending.current) discard();
    };
  }, [discard]);

  const send = async () => {
    if (sending.current) return;
    setError(null);
    const problem = !category ? "Pick what it is: a bug, a new feature or a suggestion." : submitProblem({ category, title, details, files: files.items.length });
    if (problem) return setError(problem);
    if (files.busy) return setError("Wait for the files to finish uploading.");
    if (files.failed) return setError("Take off the files that could not be uploaded, or add them again.");
    setBusy(true);
    sending.current = true;
    try {
      const res = await onSubmit({ category: category!, title, details, files: files.uploads, device: thisDevice() });
      if (!res.ok) {
        if (!closed.current) setError(res.error);
        return;
      }
      files.clear();
      if (!closed.current) setSent(res.data);
    } finally {
      sending.current = false;
      if (closed.current) discard();
      else setBusy(false);
    }
  };

  const head = (
    <div className={s.rfHead}>
      <SheetHandle />
      <div className={s.rfHeadRow}>
        <div><span className={s.rfTitle}>Send to IT</span><span className={s.rfSub}>A bug, a new feature or a suggestion</span></div>
        <button className={s.rfClose} onClick={onClose} aria-label="Close"><Svg d={CLOSE} size={16} sw={2} /></button>
      </div>
    </div>
  );

  if (sent) {
    return (
      <>
        {head}
        <div className={s.doneWrap}>
          <span className={s.doneTick}><Svg d={ICON.tick} size={30} sw={2.4} /></span>
          <span className={s.doneTitle}>Sent to IT</span>
          <span className={s.doneText}>You will be told here when IT replies or its status changes.</span>
          <span className={s.doneId}>{sent.ref}</span>
          <button className={s.doneBtn} onClick={onClose}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      {head}
      <div className={s.rfScroll} onPaste={readOnly || busy ? undefined : files.paste}>
        <div className={s.field} role="group" aria-label="What is it?">
          <span className={s.fieldLabel}>What is it?</span>
          <div className={s.pills}>
            {IT_CATEGORIES.map(c => (
              <button key={c.id} type="button" className={`${s.pill} ${category === c.id ? s.pillOn : ""}`} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          {category && <span className={t.hint}>{IT_CATEGORIES.find(c => c.id === category)?.sub}</span>}
        </div>
        <label className={s.field}><span className={s.fieldLabel}>Title</span>
          <input type="text" className={s.input} placeholder="In a few words — e.g. The Quote freezes on step 2" value={title}
            onChange={e => setTitle(e.target.value)} maxLength={IT_LIMITS.title} />
        </label>
        <label className={s.field}><span className={s.fieldLabel}>Details</span>
          <textarea rows={5} className={`${s.input} ${s.textarea}`} placeholder="What happened, where in the app, and what you expected" value={details}
            onChange={e => setDetails(e.target.value)} maxLength={IT_LIMITS.details} />
        </label>
        <div className={s.field}><span className={s.fieldLabel}>Screenshots and files</span>
          <ItFileList items={files.items} full={files.full} disabled={readOnly || busy} onAdd={files.add} onRemove={files.remove} />
          <span className={t.hint}>Pictures, videos, PDF, Office, zip — up to 10, 2 GB each.</span>
        </div>
        {error && <p className={s.formError} role="alert">{error}</p>}
      </div>
      <div className={s.rfFoot}>
        <button className={s.rfCta} onClick={() => void send()} disabled={busy || readOnly}>
          {readOnly ? "Read-only while viewing as" : busy ? "Sending…" : files.busy ? "Uploading files…" : "Send to IT"}
        </button>
      </div>
    </>
  );
}
