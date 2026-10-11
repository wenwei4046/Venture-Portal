"use client";

import { docDay } from "@/lib/documentation/model";
import type { MemberDocument } from "@/lib/documentation/member";
import { Svg } from "../icons";
import d from "./docs.module.css";

/** The handoff's own chevrons (its pages' back link, 18px · 2; a row's, 16px · 1.8). */
const BACK = "M15 6l-6 6 6 6";
const NEXT = "M9 6l6 6-6 6";

/**
 * Documentation (README 18.4, app-06): the files HR shares with the member's
 * department, newest first, "New" until opened. A row opens its file; the note
 * under the list says which one is opening.
 */
export default function DocsPage({ docs, message, opening, onBack, onOpen }: {
  /** null while it is read (or when it could not be). */
  docs: MemberDocument[] | null;
  message: string | null;
  /** The file being opened ("Opening …"), or ''. */
  opening: string;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Profile</button>
        <h1 className={d.title}>Documentation</h1>
        <p className={d.lede}>Shared with Revenue by HR.</p>
      </div>
      <section>
        {docs?.map(doc => (
          <button key={doc.id} className={d.row} onClick={() => onOpen(doc.id)}>
            <span className={d.ext}>{doc.ext}</span>
            <span className={d.text}>
              <span className={d.name}>{doc.name}{!doc.seen && <span className={d.new}>New</span>}</span>
              <span className={d.meta}>Added {docDay(doc.uploadedAt)}</span>
            </span>
            <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
          </button>
        ))}
        {docs && !docs.length && <p className={d.empty}>Nothing shared with you yet.</p>}
        {!docs && <p className={d.empty} role={message ? "alert" : "status"}>{message ?? "Loading the documents…"}</p>}
      </section>
      {opening && <div className={d.opening} role="status">Opening {opening}</div>}
      {docs && message && <p className={d.empty} role="alert">{message}</p>}
    </div>
  );
}
