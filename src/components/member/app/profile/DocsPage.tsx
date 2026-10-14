"use client";

import { useState } from "react";
import { docDay } from "@/lib/documentation/model";
import type { MemberDocument } from "@/lib/documentation/member-model";
import { letterState, personalIn, personalPath, personalUnseen, type Personal } from "@/lib/documentation/personal";
import { Svg } from "../icons";
import d from "./docs.module.css";
import p from "./profile.module.css";

/** The handoff's own chevrons (its pages' back link, 18px · 2; a row's, 16px · 1.8). */
const BACK = "M15 6l-6 6 6 6";
const NEXT = "M9 6l6 6-6 6";
/** A folder, as the Data center draws one. */
const FOLDER = "M3 7.5A2 2 0 0 1 5 5.5h3.8l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z";

export type DocsTab = "company" | "personal";

/**
 * Documentation (README 18.4, app-06): the files HR shares with the member's
 * department, newest first, "New" until opened. A row opens its file; the note
 * under the list says which one is opening.
 *
 * Company · Personal since 2026-10-14 (the user: "documentation 我要分成两种：一个是 company，一个是 personal"):
 * Personal is what HR shares with the member of their own Data center folder — its folders (a tap goes in, "‹" back
 * up), its files, and at the top their letters (the memos they were sent as, *To acknowledge* until done).
 */
export default function DocsPage({ docs, personal, message, personalMessage, opening, onBack, onOpen, onOpenPersonal, initialTab = "company" }: {
  /** null while it is read (or when it could not be). */
  docs: MemberDocument[] | null;
  personal: Personal | null;
  message: string | null;
  personalMessage: string | null;
  /** The file being opened ("Opening …"), or ''. */
  opening: string;
  onBack: () => void;
  onOpen: (id: string) => void;
  onOpenPersonal: (kind: "drive" | "letter", id: string) => void;
  initialTab?: DocsTab;
}) {
  const [tab, setTab] = useState<DocsTab>(initialTab);
  const [folder, setFolder] = useState<string | null>(null);
  const companyNew = docs?.filter(x => !x.seen).length ?? 0;
  const personalNew = personal ? personalUnseen(personal) : 0;
  // A folder taken away since (no longer shared): back to the top.
  const here = personal && folder && personal.folders.some(f => f.id === folder) ? folder : null;
  const path = personal ? personalPath(personal, here) : [];
  const held = personal ? personalIn(personal, here) : null;
  const up = path.length > 1 ? path[path.length - 2] : null;

  return (
    <div className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Profile</button>
        <h1 className={d.title}>Documentation</h1>
      </div>
      <div className={p.seg} role="tablist" aria-label="Documentation">
        {([["company", "Company", companyNew], ["personal", "Personal", personalNew]] as const).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`${p.segBtn} ${tab === id ? p.segOn : ""}`}
            onClick={() => setTab(id)}
          >
            {label}{n ? ` · ${n}` : ""}
          </button>
        ))}
      </div>

      {tab === "company" ? (
        <section aria-label="Company">
          <p className={d.lede}>Shared with Revenue by HR.</p>
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
          {docs && message && <p className={d.empty} role="alert">{message}</p>}
        </section>
      ) : (
        <section aria-label="Personal">
          {up ? (
            <button className={d.up} onClick={() => setFolder(up.id)}>
              <Svg d={BACK} size={16} sw={2} />{up.name}
            </button>
          ) : (
            <p className={d.lede}>Your own documents, shared with you by HR.</p>
          )}
          {up && <h2 className={d.folderTitle}>{path[path.length - 1]?.name}</h2>}
          {held?.letters.length ? <div className={d.group}>Letters</div> : null}
          {held?.letters.map(l => {
            const state = letterState(l);
            return (
              <button key={l.id} className={d.row} onClick={() => onOpenPersonal("letter", l.id)}>
                <span className={d.ext}>{l.ext}</span>
                <span className={d.text}>
                  <span className={d.name}>{l.typeName}{state === "new" && <span className={d.new}>New</span>}</span>
                  <span className={d.meta}>{l.name} · {docDay(l.at)}</span>
                </span>
                <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
              </button>
            );
          })}
          {held?.folders.length || held?.files.length ? (held?.letters.length ? <div className={d.group}>Files</div> : null) : null}
          {held?.folders.map(f => (
            <button key={f.id} className={d.row} onClick={() => setFolder(f.id)}>
              <span className={`${d.ext} ${d.folder}`}><Svg d={FOLDER} size={20} sw={1.8} /></span>
              <span className={d.text}>
                <span className={d.name}>{f.name}{f.unseen ? <span className={d.new}>{f.unseen} new</span> : null}</span>
                <span className={d.meta}>{f.files === 1 ? "1 file" : `${f.files} files`}</span>
              </span>
              <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          ))}
          {held?.files.map(f => (
            <button key={f.id} className={d.row} onClick={() => onOpenPersonal("drive", f.id)}>
              <span className={d.ext}>{f.ext}</span>
              <span className={d.text}>
                <span className={d.name}>{f.name}{!f.seen && <span className={d.new}>New</span>}</span>
                <span className={d.meta}>Added {docDay(f.at)}</span>
              </span>
              <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
            </button>
          ))}
          {held && !held.letters.length && !held.folders.length && !held.files.length && (
            <p className={d.empty}>{here ? "This folder is empty." : "Nothing of yours is shared with you yet."}</p>
          )}
          {!personal && <p className={d.empty} role={personalMessage ? "alert" : "status"}>{personalMessage ?? "Loading your documents…"}</p>}
          {personal && personalMessage && <p className={d.empty} role="alert">{personalMessage}</p>}
        </section>
      )}
      {opening && <div className={d.opening} role="status">Opening {opening}</div>}
    </div>
  );
}
