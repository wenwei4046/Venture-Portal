"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ItNoteInput } from "@/app/(member)/member/it-actions";
import {
  CATEGORY_LABEL, IT_LIMITS, IT_STATUSES, STATUS_LABEL, STATUS_TONE, fileSize, fileTag, isImage, itWhen, noteProblem,
  type ItFile, type ItRequest, type ItStatus,
} from "@/lib/it-requests/model";
import Sheet, { SheetHandle } from "../Sheet";
import { TONE } from "./IncomePages";
import { ItFileList, useItUploads, type ItUploader } from "./ItUploads";
import s from "./profile.module.css";
import t from "./it.module.css";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * One IT request, read in full (2026-10-20 — the user: "我们也可以帮做 annotation，这样就能看到他 submit 的 case 被
 * annotate，他也能看到自己 submit 的 case status。如果我们给它 fix 了，他那边就可以收到 fix 的通知"): what was sent, its
 * pictures and files, and its thread — IT's notes on the peach, the sender's replies on white, every status IT set. Its
 * sender replies; IT requests · Edit writes a note and sets the status (New · In progress · Fixed · Closed), and the
 * sender is told. View as reads it and writes nothing.
 */
export default function ItRequestSheet({ open, request, canEdit, readOnly, onNote, sign, openFile, onClose, upload }: {
  open: boolean;
  request: ItRequest | null;
  /** IT requests · Edit: notes on anybody's, and the status. */
  canEdit: boolean;
  readOnly: boolean;
  onNote: (input: ItNoteInput) => Promise<Outcome<ItRequest>>;
  /** Short links for the pictures' previews. */
  sign?: (ids: string[]) => Promise<Outcome<Record<string, string>>>;
  /** A file opened at the tap (a tab readied in the tap). */
  openFile?: (id: string, mode: "view" | "download") => void;
  onClose: () => void;
  upload?: ItUploader;
}) {
  return (
    <Sheet open={open} onClose={onClose} z={22} maxHeight="88%" scroll peek className={s.sheetBody} label={request?.title ?? "IT request"}>
      <SheetHandle />
      {open && request && <Body key={request.id} request={request} canEdit={canEdit} readOnly={readOnly} onNote={onNote} sign={sign} openFile={openFile} onClose={onClose} upload={upload} />}
    </Sheet>
  );
}

function Body({ request: r, canEdit, readOnly, onNote, sign, openFile, onClose, upload }: {
  request: ItRequest;
  canEdit: boolean;
  readOnly: boolean;
  onNote: (input: ItNoteInput) => Promise<Outcome<ItRequest>>;
  sign?: (ids: string[]) => Promise<Outcome<Record<string, string>>>;
  openFile?: (id: string, mode: "view" | "download") => void;
  onClose: () => void;
  upload?: ItUploader;
}) {
  // The pictures' previews: short links made when the request opens, again when a note brings more.
  const pictures = useMemo(() => r.files.filter(f => isImage(f.contentType)).map(f => f.id), [r.files]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const wanted = pictures.filter(id => !urls[id]).join(",");
  useEffect(() => {
    if (!wanted || !sign) return;
    let live = true;
    void sign(wanted.split(",")).then(res => { if (live && res.ok) setUrls(u => ({ ...u, ...res.data })); });
    return () => { live = false; };
  }, [wanted, sign]);

  const [body, setBody] = useState("");
  const [status, setStatus] = useState<ItStatus>(r.status);
  useEffect(() => { setStatus(r.status); }, [r.status]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const files = useItUploads(upload);
  const { discard } = files;
  const closed = useRef(false);
  const sending = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
      // A send may still be filing these uploads. Its answer decides which ones can be removed.
      if (!sending.current) discard();
    };
  }, [discard]);
  const writes = !readOnly && (r.mine || canEdit);
  const setsStatus = canEdit && !readOnly;

  const send = async () => {
    if (sending.current) return;
    setError(null);
    const next = setsStatus && status !== r.status ? status : null;
    const problem = noteProblem({ body, files: files.items.length, status: next, current: r.status });
    if (problem) return setError(problem);
    if (files.busy) return setError("Wait for the files to finish uploading.");
    if (files.failed) return setError("Take off the files that could not be uploaded, or add them again.");
    setBusy(true);
    sending.current = true;
    try {
      const res = await onNote({ id: r.id, body, files: files.uploads, status: next, current: r.status });
      if (!res.ok) {
        if (!closed.current) setError(res.error);
        return;
      }
      files.clear();
      if (!closed.current) setBody("");
    } finally {
      sending.current = false;
      if (closed.current) discard();
      else setBusy(false);
    }
  };

  const own = r.files.filter(f => f.noteId === null);
  return (
    <>
      <div className={s.sheetTop}>
        <div className={s.sheetMinW}><span className={s.rdTitle}>{r.title}</span><span className={s.rdId}>{r.ref}</span></div>
        <span className={`${s.tag} ${TONE[STATUS_TONE[r.status]]}`}>{STATUS_LABEL[r.status]}</span>
      </div>
      <div className={s.rdFacts}>
        <div className={s.rdFact}><span className={s.rdFactLabel}>Type</span><span className={s.rdFactValue}>{CATEGORY_LABEL[r.category]}</span></div>
        <div className={s.rdFact}><span className={s.rdFactLabel}>Sent</span><span className={s.rdFactValue}>{itWhen(r.createdAt)}</span></div>
        <div className={s.rdFact}><span className={s.rdFactLabel}>By</span><span className={s.rdFactValue}>{r.mine ? "You" : [r.senderName, r.senderTitle].filter(Boolean).join(" · ")}</span></div>
        {r.statusByName && r.statusAt && (
          <div className={s.rdFact}><span className={s.rdFactLabel}>{STATUS_LABEL[r.status]}</span><span className={s.rdFactValue}>{`${r.statusByName} · ${itWhen(r.statusAt)}`}</span></div>
        )}
        {r.device && <div className={s.rdFact}><span className={s.rdFactLabel}>Device</span><span className={s.rdFactValue}>{r.device}</span></div>}
      </div>
      {r.details && <p className={t.details}>{r.details}</p>}
      {own.length > 0 && (
        <div>
          <p className={t.label}>SCREENSHOTS AND FILES</p>
          <Files files={own} urls={urls} openFile={openFile} />
        </div>
      )}
      {r.notes.length > 0 && (
        <div>
          <p className={t.label}>UPDATES</p>
          <div className={t.thread}>
            {r.notes.map(n => {
              const theirs = r.files.filter(f => f.noteId === n.id);
              return (
                <div key={n.id} className={`${t.note} ${n.side === "it" ? t.noteIt : ""}`}>
                  <div className={t.noteHead}>
                    <span className={t.noteWho}>{n.mine ? "You" : n.side === "it" ? `IT · ${n.authorName}` : n.authorName}</span>
                    <span className={t.noteWhen}>{itWhen(n.at)}</span>
                  </div>
                  {n.statusTo && (
                    <div className={t.noteStatus}>Marked <span className={`${s.status} ${TONE[STATUS_TONE[n.statusTo]]}`}>{STATUS_LABEL[n.statusTo]}</span></div>
                  )}
                  {n.body && <p className={t.noteBody}>{n.body}</p>}
                  {theirs.length > 0 && <Files files={theirs} urls={urls} openFile={openFile} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {writes && (
        <div className={t.composer} onPaste={files.paste}>
          <p className={t.label}>{r.mine && !canEdit ? "REPLY" : "WRITE ON IT"}</p>
          <textarea rows={3} className={`${s.input} ${s.textarea}`} value={body} onChange={e => setBody(e.target.value)} maxLength={IT_LIMITS.note}
            placeholder={r.mine ? "Anything to add — still happening, another screenshot…" : "A note for the sender — what was found, what was done"} aria-label="Your note" />
          <ItFileList items={files.items} full={files.full} onAdd={files.add} onRemove={files.remove} label="Attach" />
          {setsStatus && (
            <div className={s.field} role="group" aria-label="Status">
              <span className={s.fieldLabel}>Status</span>
              <div className={s.pills}>
                {IT_STATUSES.map(x => (
                  <button key={x.id} type="button" className={`${s.pill} ${status === x.id ? s.pillOn : ""}`} aria-pressed={status === x.id} onClick={() => setStatus(x.id)}>{x.label}</button>
                ))}
              </div>
            </div>
          )}
          {error && <p className={s.formError} role="alert">{error}</p>}
          <div className={t.composeRow}>
            <span className={t.hint}>{setsStatus && !r.mine ? `${r.senderName} is told.` : r.mine && !canEdit ? "IT is told." : ""}</span>
            <button className={t.send} onClick={() => void send()} disabled={busy}>{busy ? "Sending…" : "Send"}</button>
          </div>
        </div>
      )}
      <button className={s.done} onClick={onClose}>Done</button>
    </>
  );
}

/** A request's (or a note's) files: the pictures as previews, the rest as rows. */
function Files({ files, urls, openFile }: { files: ItFile[]; urls: Record<string, string>; openFile?: (id: string, mode: "view" | "download") => void }) {
  const pics = files.filter(f => isImage(f.contentType));
  const docs = files.filter(f => !isImage(f.contentType));
  return (
    <>
      {pics.length > 0 && (
        <div className={t.thumbs}>
          {pics.map(f => (
            <button key={f.id} type="button" className={t.thumb} onClick={() => openFile?.(f.id, "view")} aria-label={`Open ${f.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link, never a page asset */}
              {urls[f.id] ? <img src={urls[f.id]} alt={f.name} /> : fileTag(f.name, f.contentType)}
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className={t.docs}>
          {docs.map(f => (
            <button key={f.id} type="button" className={t.docRow} onClick={() => openFile?.(f.id, "view")}>
              <span className={t.fileTile} aria-hidden="true">{fileTag(f.name, f.contentType)}</span>
              <span className={t.fileText}><span className={t.fileName}>{f.name}</span><span className={t.fileMeta}>{fileSize(f.size)}</span></span>
              <span className={t.docOpen}>Open</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
