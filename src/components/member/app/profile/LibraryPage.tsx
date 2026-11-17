"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { docDay } from "@/lib/documentation/model";
import type { TrainingApi, TrainingRights } from "@/lib/rev-training/api";
import { itemBadge, LIB_ACCEPT, libFileRefusal, libraryUnseen, markSeen, sizeText, type LibraryCategory, type LibraryItem } from "@/lib/rev-training/model";
import { Svg } from "../icons";
import d from "./docs.module.css";
import t from "./training.module.css";

const BACK = "M15 6l-6 6 6 6";
const NEXT = "M9 6l6 6-6 6";

type Form =
  | { at: "add"; kind: "file" | "link"; categoryId: string; title: string; url: string; note: string; file: File | null }
  | { at: "edit"; item: LibraryItem; categoryId: string; title: string; url: string; note: string }
  | { at: "category"; id: string | null; name: string };

/**
 * Library (2026-11-16 — the owner: reading material so new people get up to speed; PDF, pictures, Word and links, in
 * categories, "New" until opened): every category's files and links, newest first. A tap opens it — a file through
 * /files (signed at the click), a link in its own tab — and it is no longer New for them. Whoever holds Free test &
 * Library · Create adds files and links and new categories; Edit changes and deletes them.
 */
export default function LibraryPage({ api, rights, readOnly, onBack, onSeen }: {
  api: TrainingApi;
  rights: TrainingRights;
  readOnly: boolean;
  onBack: () => void;
  /** What is still New — Profile's row counts it. */
  onSeen?: (unseen: number) => void;
}) {
  const [cats, setCats] = useState<LibraryCategory[] | null>(null);
  const [pickCat, setPickCat] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [opening, setOpening] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [tools, setTools] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const writer = (rights.create || rights.edit) && !readOnly;

  const read = useCallback(() => {
    void api.library().then(r => {
      if (r.ok) { setCats(r.data); setMessage(null); onSeen?.(libraryUnseen(r.data)); } else setMessage(r.error);
    });
  }, [api, onSeen]);
  useEffect(() => { read(); }, [read]);

  const open = (item: LibraryItem) => {
    setOpening(item.title);
    if (!readOnly && cats) { const seen = markSeen(cats, item.id); setCats(seen); onSeen?.(libraryUnseen(seen)); }
    // Readied in the tap: a tab opened after the server answers is a pop-up to a phone.
    const tab = typeof window !== "undefined" ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
    void api.open(item.id).then(r => {
      if (r.ok && r.data.href !== "about:blank") {
        if (tab) tab.location.href = r.data.href; else window.location.assign(r.data.href);
      } else {
        tab?.close();
        if (!r.ok) { setMessage(r.error); setOpening(""); }
      }
    });
  };

  const shown = cats?.filter(c => pickCat === null || c.id === pickCat) ?? [];
  const firstCat = pickCat ?? cats?.[0]?.id ?? "";

  const submit = async () => {
    if (!form) return;
    setFormError(null);
    setSaving(true);
    try {
      if (form.at === "category") {
        const r = await api.saveCategory(form.id, form.name);
        if (!r.ok) return setFormError(r.error);
      } else if (form.at === "add") {
        if (!form.title.trim()) return setFormError("Give it a title (up to 200 characters).");
        let path: string | undefined;
        if (form.kind === "file") {
          if (!form.file) return setFormError("Choose the file to add.");
          const up = await api.upload(form.file);
          if (!up.ok) return setFormError(up.error);
          path = up.data;
        }
        const r = await api.addItem({ categoryId: form.categoryId, title: form.title, kind: form.kind, path, url: form.url, note: form.note });
        if (!r.ok) return setFormError(r.error);
      } else {
        const r = await api.editItem({ id: form.item.id, categoryId: form.categoryId, title: form.title, url: form.url, note: form.note });
        if (!r.ok) return setFormError(r.error);
      }
      setForm(null);
      read();
    } finally {
      setSaving(false);
    }
  };
  const remove = (id: string, kind: "item" | "category") => {
    if (sure !== id) return setSure(id);
    setSure(null);
    void (kind === "item" ? api.deleteItem(id) : api.deleteCategory(id)).then(r => (r.ok ? read() : setMessage(r.error)));
  };

  return (
    <div className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Profile</button>
        <h1 className={d.title}>Library</h1>
      </div>
      <p className={d.lede}>Reading to get you up to speed — product knowledge, how to sell, the company&apos;s rules.</p>

      {cats && cats.length > 1 ? (
        <div className={t.cats} role="tablist" aria-label="Categories">
          {[{ id: null as string | null, name: "All", n: libraryUnseen(cats) }, ...cats.map(c => ({ id: c.id as string | null, name: c.name, n: libraryUnseen([c]) }))].map(c => (
            <button key={c.id ?? "all"} role="tab" aria-selected={pickCat === c.id} className={`${t.catChip} ${pickCat === c.id ? t.catOn : ""}`} onClick={() => setPickCat(c.id)}>
              {c.name}{c.n ? ` · ${c.n} new` : ""}
            </button>
          ))}
        </div>
      ) : null}

      {writer ? (
        <div className={t.actions}>
          {rights.create ? <button className={t.small} onClick={() => { setFormError(null); setForm({ at: "add", kind: "file", categoryId: firstCat, title: "", url: "", note: "", file: null }); }}>+ Add file or link</button> : null}
          {rights.create ? <button className={t.small} onClick={() => { setFormError(null); setForm({ at: "category", id: null, name: "" }); }}>+ Category</button> : null}
          {rights.edit ? <button className={t.small} aria-pressed={tools} onClick={() => setTools(!tools)}>{tools ? "Done" : "Edit"}</button> : null}
        </div>
      ) : null}

      {form ? (
        <div className={t.form}>
          {form.at === "category" ? (
            <label className={t.field}>
              <span className={t.label}>{form.id ? "Rename category" : "New category"}</span>
              <input className={t.input} value={form.name} maxLength={60} placeholder="e.g. Objection handling" onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
          ) : (
            <>
              {form.at === "add" ? (
                <div className={t.actions} role="radiogroup" aria-label="Add">
                  {(["file", "link"] as const).map(k => (
                    <button key={k} role="radio" aria-checked={form.kind === k} className={`${t.catChip} ${form.kind === k ? t.catOn : ""}`} onClick={() => setForm({ ...form, kind: k })}>
                      {k === "file" ? "A file" : "A link"}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className={t.field}>
                <span className={t.label}>Category</span>
                <select className={t.select} value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                  {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {form.at === "add" && form.kind === "file" ? (
                <div className={t.field}>
                  <span className={t.label}>File — PDF, Word, Excel, CSV, PowerPoint, a picture or a video</span>
                  <input ref={fileRef} type="file" accept={LIB_ACCEPT} className={t.input} onChange={e => {
                    const file = e.target.files?.[0] ?? null;
                    const refused = file ? libFileRefusal(file) : null;
                    setFormError(refused);
                    setForm({ ...form, file: refused ? null : file, title: form.title || (file ? file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ") : "") });
                  }} />
                </div>
              ) : null}
              {(form.at === "add" && form.kind === "link") || (form.at === "edit" && form.item.kind === "link") ? (
                <label className={t.field}>
                  <span className={t.label}>Link</span>
                  <input className={t.input} type="url" inputMode="url" value={form.url} placeholder="https://" onChange={e => setForm({ ...form, url: e.target.value })} />
                </label>
              ) : null}
              <label className={t.field}>
                <span className={t.label}>Title</span>
                <input className={t.input} value={form.title} maxLength={200} onChange={e => setForm({ ...form, title: e.target.value })} />
              </label>
              <label className={t.field}>
                <span className={t.label}>Note (optional)</span>
                <input className={t.input} value={form.note} maxLength={500} placeholder="e.g. Use this one from 15 Nov" onChange={e => setForm({ ...form, note: e.target.value })} />
              </label>
            </>
          )}
          {formError && <p className={t.error} role="alert">{formError}</p>}
          <div className={t.actions}>
            <button className={t.primary} disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : form.at === "add" ? "Add to the Library" : "Save"}</button>
            <button className={t.secondary} disabled={saving} onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {message && <p className={t.error} role="alert">{message}</p>}
      {shown.map(c => (
        <section key={c.id} aria-label={c.name} style={{ display: "contents" }}>
          <div className={t.catHead}>
            <div className={d.group}>{c.name}</div>
            {tools ? (
              <div className={t.actions}>
                <button className={t.link} onClick={() => { setFormError(null); setForm({ at: "category", id: c.id, name: c.name }); }}>Rename</button>
                {!c.items.length ? <button className={t.danger} onClick={() => remove(c.id, "category")}>{sure === c.id ? "Tap again to delete" : "Delete"}</button> : null}
              </div>
            ) : null}
          </div>
          <div>
            {c.items.map(item => (
              <div key={item.id} data-lib-item={item.id}>
                <button className={d.row} onClick={() => open(item)}>
                  <span className={`${d.ext} ${item.kind === "link" ? t.extLink : ""}`}>{itemBadge(item)}</span>
                  <span className={d.text}>
                    <span className={d.name}>{item.title}{!item.seen && <span className={d.new}>New</span>}</span>
                    <span className={d.meta}>Added {docDay(item.createdAt)}{item.size !== null ? ` · ${sizeText(item.size)}` : ""}</span>
                    {item.note && <span className={t.note}>{item.note}</span>}
                  </span>
                  <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
                </button>
                {tools ? (
                  <div className={t.rowTools}>
                    <button className={t.link} onClick={() => { setFormError(null); setForm({ at: "edit", item, categoryId: c.id, title: item.title, url: item.url ?? "", note: item.note }); }}>Edit</button>
                    <button className={t.danger} onClick={() => remove(item.id, "item")}>{sure === item.id ? "Tap again to delete" : "Delete"}</button>
                  </div>
                ) : null}
              </div>
            ))}
            {!c.items.length && <p className={d.meta} style={{ margin: "8px 0 4px" }}>Nothing here yet.</p>}
          </div>
        </section>
      ))}
      {cats && !cats.length && <p className={d.empty}>The Library is empty.</p>}
      {!cats && !message && <p className={d.empty} role="status">Loading the Library…</p>}
      {opening && <div className={d.opening} role="status">Opening {opening}</div>}
    </div>
  );
}
