"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { docDay } from "@/lib/documentation/model";
import type { TrainingApi, TrainingRights } from "@/lib/rev-training/api";
import {
  answered, answeredCount, changeKind, draftProblem, emptyQuestion, isWritten, KIND_LABEL, KINDS, letter, marksProblem, percent, pick,
  pointsText, removeChoice, scoreText, toggleCorrect, waitingPoints, WRITTEN_MAX,
  type AdminTest, type Answer, type AttemptView, type DraftQuestion, type DraftTest, type QuestionKind, type ReviewItem, type TakeQuestion,
  type TestScoreRow, type TestSummary, type TestToTake, type ToMark,
} from "@/lib/rev-training/model";
import { Svg } from "../icons";
import d from "./docs.module.css";
import t from "./training.module.css";
import p from "./profile.module.css";

const BACK = "M15 6l-6 6 6 6";
const NEXT = "M9 6l6 6-6 6";

/** A page of its own starts at its top: the app scrolls its own column, not the window. */
function useTop<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    // The nearest column that scrolls goes back to its top — never the window or a frame around the app.
    for (let el = ref.current?.parentElement; el; el = el.parentElement) {
      const y = getComputedStyle(el).overflowY;
      if ((y === "auto" || y === "scroll") && el.scrollHeight > el.clientHeight) { el.scrollTop = 0; return; }
    }
  }, []);
  return ref;
}

type View =
  | { at: "list" }
  | { at: "take"; test: TestToTake }
  | { at: "attempt"; attempt: AttemptView; from: "list" | "manage" | "scores"; scores?: { test: AdminTest; rows: TestScoreRow[] | null } }
  | { at: "edit"; draft: DraftTest }
  | { at: "scores"; test: AdminTest; rows: TestScoreRow[] | null };

/** The letter a choice is drawn with. */
const mark = (q: { kind: QuestionKind }, i: number) => (q.kind === "truefalse" ? (i === 0 ? "T" : "F") : letter(i));

/**
 * Free test (2026-11-16 — the owner: simple multiple-choice tests IR's salespeople take "so the team can check what
 * they know"; 2026-11-17: "每题设不同分数；简答题／段落题（人工改）需要"): the tests to take, each with one's own best and
 * last score; a test's questions one under another, its answers picked A / B / C or written, each worth its points;
 * handed in, the score and, question by question, what was right — a written answer waits for a writer's mark, and the
 * last attempt can be opened again to read the marks. Taken again as often as they like. Whoever holds Free test &
 * Library · View has *Manage*: what waits for marking, every test, a test's scores — and, with Create / Edit, writing
 * one, publishing it, deleting it and marking written answers.
 */
export default function TestsPage({ api, rights, readOnly, onBack }: {
  api: TrainingApi;
  rights: TrainingRights;
  /** The Principal viewing somebody: nothing is handed in or marked. */
  readOnly: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"take" | "manage">("take");
  const [view, setView] = useState<View>({ at: "list" });
  const [tests, setTests] = useState<TestSummary[] | null>(null);
  const [admin, setAdmin] = useState<AdminTest[] | null>(null);
  const [toMark, setToMark] = useState<ToMark[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readTests = useCallback(() => {
    void api.tests().then(r => (r.ok ? (setTests(r.data), setMessage(null)) : setMessage(r.error)));
  }, [api]);
  const readAdmin = useCallback(() => {
    if (!rights.view) return;
    void api.adminTests().then(r => (r.ok ? (setAdmin(r.data), setMessage(null)) : setMessage(r.error)));
    void api.toMark().then(r => (r.ok ? setToMark(r.data) : setMessage(r.error)));
  }, [api, rights.view]);
  useEffect(() => { readTests(); }, [readTests]);
  // A writer sees at once how many wait for marking, on the Manage tab's name.
  useEffect(() => {
    if (!rights.view) return;
    void api.toMark().then(r => { if (r.ok) setToMark(r.data); });
  }, [api, rights.view]);
  useEffect(() => { if (tab === "manage") readAdmin(); }, [tab, readAdmin]);

  const top = () => { setView({ at: "list" }); setMessage(null); };
  const start = (id: string) => {
    setBusy(true);
    void api.take(id).then(r => {
      setBusy(false);
      if (r.ok) { setView({ at: "take", test: r.data }); setMessage(null); } else setMessage(r.error);
    });
  };
  const openAttempt = (id: string, from: "list" | "manage" | "scores", scores?: { test: AdminTest; rows: TestScoreRow[] | null }) => {
    setBusy(true);
    void api.attempt(id).then(r => {
      setBusy(false);
      if (r.ok) { setView({ at: "attempt", attempt: r.data, from, scores }); setMessage(null); } else setMessage(r.error);
    });
  };

  if (view.at === "take") {
    return <TakeTest test={view.test} readOnly={readOnly} onBack={top} hand={answers => api.submit(view.test.id, answers).then(r => {
      if (r.ok) {
        readTests();
        setView({ at: "attempt", from: "list", attempt: {
          id: r.data.attemptId ?? "", testId: view.test.id, title: view.test.title, name: "", at: new Date().toISOString(),
          score: r.data.score, total: r.data.total, pending: r.data.pending, markedByName: "", markedAt: null,
          questions: view.test.questions, review: r.data.review,
        } });
        if (!r.data.saved) setMessage("You have no Revenue staff record, so this try is not kept.");
      }
      return r.ok ? null : r.error;
    })} />;
  }
  if (view.at === "attempt") {
    const back = view.from === "scores" && view.scores
      ? () => setView({ at: "scores", ...view.scores! })
      : view.from === "manage" ? () => { top(); readAdmin(); } : top;
    return <Attempt attempt={view.attempt} own={view.from === "list"} canMark={rights.edit && !readOnly && view.from !== "list"} api={api}
      note={message} onBack={back} onAgain={view.from === "list" ? () => start(view.attempt.testId) : undefined}
      onMarked={a => { setView({ ...view, attempt: a }); readAdmin(); }} />;
  }
  if (view.at === "edit") {
    return <Editor draft={view.draft} rights={rights} readOnly={readOnly} onBack={() => { top(); readAdmin(); }} api={api}
      onSaved={() => { top(); readAdmin(); readTests(); }} />;
  }
  if (view.at === "scores") {
    return <Scores test={view.test} rows={view.rows} onBack={top}
      onOpen={id => openAttempt(id, "scores", { test: view.test, rows: view.rows })} />;
  }

  const openScores = (test: AdminTest) => {
    setView({ at: "scores", test, rows: null });
    void api.scores(test.id).then(r => (r.ok ? setView({ at: "scores", test, rows: r.data }) : setMessage(r.error)));
  };
  const openEdit = (id: string) => {
    setBusy(true);
    void api.adminTest(id).then(r => { setBusy(false); if (r.ok) setView({ at: "edit", draft: r.data }); else setMessage(r.error); });
  };

  return (
    <div className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Profile</button>
        <h1 className={d.title}>Free test</h1>
      </div>
      {rights.view ? (
        <div className={p.seg} role="tablist" aria-label="Free test">
          {([["take", "Take a test"], ["manage", toMark?.length ? `Manage · ${toMark.length} to mark` : "Manage"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`${p.segBtn} ${tab === id ? p.segOn : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      ) : null}
      {message && <p className={t.error} role="alert">{message}</p>}

      {tab === "take" ? (
        <section aria-label="Tests" style={{ display: "contents" }}>
          <p className={d.lede}>Check what you know. Take a test as often as you like — your best score is kept.</p>
          {tests?.map(test => (
            <article key={test.id} className={t.card}>
              <div className={t.cardTop}>
                <h2 className={t.cardTitle}>{test.title}</h2>
                {!test.published && <span className={`${t.chip} ${t.chipDraft}`}>Draft</span>}
              </div>
              {test.intro && <p className={t.cardText}>{test.intro}</p>}
              <div className={t.stats}>
                <span>{test.questions === 1 ? "1 question" : `${test.questions} questions`} · {pointsText(test.points)}</span>
                {test.attempts ? (
                  <>
                    <span>Best <b>{scoreText(test.best, test.bestTotal)}</b></span>
                    <span>Last <b>{test.lastPending ? "waiting for marking" : scoreText(test.last, test.lastTotal)}</b>{test.lastAt ? ` · ${docDay(test.lastAt)}` : ""}</span>
                    <span>{test.attempts === 1 ? "Taken once" : `Taken ${test.attempts} times`}</span>
                  </>
                ) : <span>Not taken yet</span>}
              </div>
              {test.written && <p className={t.cardText}>Has written answers — your manager marks them.</p>}
              <div className={t.actions}>
                <button className={t.primary} disabled={busy} onClick={() => start(test.id)}>{test.attempts ? "Take it again" : "Start"}</button>
                {test.lastId ? <button className={t.secondary} disabled={busy} onClick={() => openAttempt(test.lastId!, "list")}>My last answers</button> : null}
              </div>
            </article>
          ))}
          {tests && !tests.length && <p className={d.empty}>No tests yet.</p>}
          {!tests && !message && <p className={d.empty} role="status">Loading the tests…</p>}
        </section>
      ) : (
        <section aria-label="Manage" style={{ display: "contents" }}>
          {toMark?.length ? (
            <div>
              <div className={d.group}>To mark</div>
              {toMark.map(m => (
                <button key={m.id} className={d.row} disabled={busy} onClick={() => openAttempt(m.id, "manage")}>
                  <span className={`${d.ext} ${t.extMark}`}>{m.score}/{m.total}</span>
                  <span className={d.text}>
                    <span className={d.name}>{m.name}</span>
                    <span className={d.meta}>{m.title} · {docDay(m.at)}</span>
                  </span>
                  <Svg d={NEXT} size={16} sw={1.8} stroke="var(--rv-sub)" />
                </button>
              ))}
            </div>
          ) : null}
          <div className={t.bar}>
            <span className={t.count}>{admin ? (admin.length === 1 ? "1 test" : `${admin.length} tests`) : ""}</span>
            {rights.create && !readOnly ? (
              <button className={t.small} onClick={() => setView({ at: "edit", draft: { title: "", intro: "", published: false, questions: [emptyQuestion()] } })}>+ New test</button>
            ) : null}
          </div>
          {admin?.map(test => (
            <article key={test.id} className={t.card}>
              <div className={t.cardTop}>
                <h2 className={t.cardTitle}>{test.title}</h2>
                <span className={`${t.chip} ${test.published ? t.chipLive : t.chipDraft}`}>{test.published ? "Published" : "Draft"}</span>
              </div>
              <div className={t.stats}>
                <span>{test.questions === 1 ? "1 question" : `${test.questions} questions`} · {pointsText(test.points)}</span>
                <span><b>{test.people}</b> {test.people === 1 ? "person" : "people"} took it</span>
                {test.toMark ? <span><b>{test.toMark}</b> to mark</span> : null}
                <span>{test.byName ? `By ${test.byName}` : ""}{test.updatedAt ? ` · ${docDay(test.updatedAt)}` : ""}</span>
              </div>
              <div className={t.actions}>
                <button className={t.secondary} onClick={() => openScores(test)}>Scores</button>
                {rights.edit ? <button className={t.secondary} disabled={busy} onClick={() => openEdit(test.id)}>Edit</button> : null}
              </div>
            </article>
          ))}
          {admin && !admin.length && <p className={d.empty}>No tests yet — write the first one.</p>}
          {!admin && !message && <p className={d.empty} role="status">Loading…</p>}
        </section>
      )}
    </div>
  );
}

function QuestionHead({ n, q, extra }: { n: number; q: { kind: QuestionKind; points: number }; extra?: React.ReactNode }) {
  return (
    <div className={t.qHead}>
      <span>Question {n} · {q.kind === "multiple" ? "Pick every right answer" : KIND_LABEL[q.kind]} · {pointsText(q.points)}{extra}</span>
    </div>
  );
}

function TakeTest({ test, readOnly, onBack, hand }: {
  test: TestToTake; readOnly: boolean; onBack: () => void;
  hand: (answers: Record<string, Answer>) => Promise<string | null>;
}) {
  const topRef = useTop<HTMLDivElement>();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const done = answeredCount(answers, test);
  const left = test.questions.length - done;
  const send = () => {
    setSending(true);
    void hand(answers).then(e => { setSending(false); setError(e); });
  };
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Free test</button>
        <h1 className={d.title}>{test.title}</h1>
      </div>
      {test.intro && <p className={d.lede}>{test.intro}</p>}
      <div className={t.bar}>
        <span className={t.count}>{done} of {test.questions.length} answered · {pointsText(test.questions.reduce((s, q) => s + q.points, 0))}</span>
      </div>
      <div className={t.progress} aria-hidden><div className={t.progressFill} style={{ width: `${test.questions.length ? (done / test.questions.length) * 100 : 0}%` }} /></div>
      {test.questions.map((q, n) => (
        <div key={q.id} className={t.q} role="group" aria-label={`Question ${n + 1}`}>
          <QuestionHead n={n + 1} q={q} />
          <p className={t.qPrompt}>{q.prompt}</p>
          {isWritten(q.kind) ? (
            q.kind === "short" ? (
              <input className={t.input} aria-label={`Answer to question ${n + 1}`} maxLength={WRITTEN_MAX.short} placeholder="Your answer"
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            ) : (
              <textarea className={`${t.area} ${t.areaTall}`} aria-label={`Answer to question ${n + 1}`} maxLength={WRITTEN_MAX.paragraph} placeholder="Your answer"
                value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
            )
          ) : q.choices.map((c, i) => {
            const now = answers[q.id];
            const on = Array.isArray(now) && now.includes(i);
            return (
              <button key={i} type="button" role={q.kind === "multiple" ? "checkbox" : "radio"} aria-checked={on}
                className={`${t.choice} ${on ? t.choiceOn : ""}`}
                onClick={() => setAnswers(a => ({ ...a, [q.id]: pick(q.kind, Array.isArray(a[q.id]) ? (a[q.id] as number[]) : [], i) }))}>
                <span className={`${t.letter} ${q.kind === "multiple" ? t.letterBox : ""}`}>{mark(q, i)}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      ))}
      {error && <p className={t.error} role="alert">{error}</p>}
      <button className={t.primary} disabled={sending || readOnly || done === 0} onClick={send}>
        {readOnly ? "Read-only while viewing as" : sending ? "Handing in…" : left ? `Hand in · ${left} not answered` : "Hand in"}
      </button>
    </div>
  );
}

/**
 * An attempt: the score, then question by question. The taker's own (just handed in, or opened again to read the
 * marks), or — for a writer — anybody's, with each written answer's points and comment to give.
 */
function Attempt({ attempt, own, canMark, api, note, onBack, onAgain, onMarked }: {
  attempt: AttemptView; own: boolean; canMark: boolean; api: TrainingApi; note: string | null;
  onBack: () => void; onAgain?: () => void; onMarked: (a: AttemptView) => void;
}) {
  const topRef = useTop<HTMLDivElement>();
  const written = attempt.review.filter(r => isWritten(r.kind) && r.text.trim());
  const [marks, setMarks] = useState<Record<string, { points: string; comment: string }>>(() =>
    Object.fromEntries(written.map(r => [r.id, { points: r.awarded === null ? "" : String(r.awarded), comment: r.comment }])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const waiting = waitingPoints(attempt.review);
  const byId = new Map(attempt.questions.map(q => [q.id, q]));
  const save = () => {
    const problem = marksProblem(attempt.review, marks);
    if (problem) return setError(problem);
    setSaving(true);
    setError(null);
    void api.mark(attempt.id, Object.fromEntries(written.map(r => [r.id, { points: Number(marks[r.id]?.points ?? 0), comment: marks[r.id]?.comment ?? "" }])))
      .then(r => { setSaving(false); if (r.ok) { setSaved(true); onMarked(r.data); } else setError(r.error); });
  };
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />{own ? "Free test" : "Manage"}</button>
        <h1 className={d.title}>{attempt.title}</h1>
        {!own && attempt.name ? <p className={d.lede}>{attempt.name} · handed in {docDay(attempt.at)}</p> : null}
      </div>
      <div className={t.score} role="status">
        <span className={t.scoreBig}>{attempt.score} / {attempt.total}</span>
        <span className={t.scoreSub}>
          {attempt.pending
            ? `So far · ${pointsText(waiting)} waiting for marking`
            : `${percent(attempt.score, attempt.total)}%${attempt.markedByName ? ` · marked by ${attempt.markedByName}` : ""}`}
        </span>
      </div>
      {note && <p className={t.error} role="alert">{note}</p>}
      {own ? (
        <div className={t.actions}>
          {onAgain ? <button className={t.primary} onClick={onAgain}>Take it again</button> : null}
          <button className={t.secondary} onClick={onBack}>All tests</button>
        </div>
      ) : null}
      {attempt.review.map((r, n) => (
        <Reviewed key={r.id} n={n + 1} r={r} q={byId.get(r.id)} canMark={canMark} mark={marks[r.id]}
          setMark={m => { setSaved(false); setMarks(x => ({ ...x, [r.id]: m })); }} />
      ))}
      {canMark && written.length ? (
        <>
          {error && <p className={t.error} role="alert">{error}</p>}
          {saved && !error && <p className={t.ok} role="status">Marks saved.</p>}
          <button className={t.primary} disabled={saving} onClick={save}>{saving ? "Saving…" : attempt.pending ? "Save marks" : "Save changed marks"}</button>
        </>
      ) : null}
    </div>
  );
}

function Reviewed({ n, r, q, canMark, mark: m, setMark }: {
  n: number; r: ReviewItem; q: TakeQuestion | undefined; canMark: boolean;
  mark: { points: string; comment: string } | undefined; setMark: (m: { points: string; comment: string }) => void;
}) {
  const head = r.pending ? <span className={t.markWait}> · Waiting for marking</span>
    : isWritten(r.kind) ? <span className={r.awarded ? t.markRight : t.markWrong}> · {r.awarded ?? 0} of {r.points}</span>
    : <span className={r.right ? t.markRight : t.markWrong}> · {r.right ? "Right" : "Wrong"}</span>;
  return (
    <div className={t.q}>
      <QuestionHead n={n} q={r} extra={head} />
      {q ? <p className={t.qPrompt}>{q.prompt}</p> : null}
      {isWritten(r.kind) ? (
        <>
          <p className={t.written}>{r.text.trim() ? r.text : <span className={t.notTaken}>Left blank</span>}</p>
          {canMark && r.text.trim() ? (
            <div className={t.markRow}>
              <label className={t.markPts}>
                <input className={t.input} inputMode="numeric" aria-label={`Points for question ${n}`} value={m?.points ?? ""}
                  onChange={e => setMark({ points: e.target.value.replace(/\D/g, "").slice(0, 3), comment: m?.comment ?? "" })} />
                <span>/ {r.points}</span>
              </label>
              <input className={t.input} aria-label={`Comment on question ${n}`} maxLength={500} placeholder="Comment (optional)" value={m?.comment ?? ""}
                onChange={e => setMark({ points: m?.points ?? "", comment: e.target.value })} />
            </div>
          ) : r.comment ? <p className={t.explain}>{r.comment}</p> : null}
        </>
      ) : q?.choices.map((c, i) => {
        const right = r.correct.includes(i);
        const chose = r.chosen.includes(i);
        const tone = right ? t.choiceRight : chose ? t.choiceWrong : "";
        return (
          <div key={i} className={`${t.choice} ${tone}`}>
            <span className={`${t.letter} ${r.kind === "multiple" ? t.letterBox : ""}`}>{mark(r, i)}</span>
            <span>
              {c}
              {right && <span className={`${t.choiceTag} ${t.tagRight}`}>{chose ? "Your answer · right" : "The right answer"}</span>}
              {!right && chose && <span className={`${t.choiceTag} ${t.tagWrong}`}>Your answer</span>}
            </span>
          </div>
        );
      })}
      {r.explain && (!isWritten(r.kind) || !r.pending || canMark) ? <p className={t.explain}>{r.explain}</p> : null}
    </div>
  );
}

function Editor({ draft: first, rights, readOnly, api, onBack, onSaved }: {
  draft: DraftTest; rights: TrainingRights; readOnly: boolean; api: TrainingApi; onBack: () => void; onSaved: () => void;
}) {
  const topRef = useTop<HTMLDivElement>();
  const [draft, setDraft] = useState<DraftTest>(first);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sure, setSure] = useState(false);
  const isNew = !draft.id;
  const canSave = !readOnly && (isNew ? rights.create : rights.edit);
  const setQ = (n: number, q: DraftQuestion) => setDraft(x => ({ ...x, questions: x.questions.map((y, k) => (k === n ? q : y)) }));
  const total = draft.questions.reduce((s, q) => s + (Number.isFinite(q.points) ? q.points : 0), 0);
  const save = () => {
    const problem = draftProblem(draft);
    if (problem) return setError(problem);
    setSaving(true);
    void api.saveTest(draft).then(r => { setSaving(false); if (r.ok) onSaved(); else setError(r.error); });
  };
  const remove = () => {
    if (!draft.id) return;
    if (!sure) return setSure(true);
    setSaving(true);
    void api.deleteTest(draft.id).then(r => { setSaving(false); if (r.ok) onSaved(); else setError(r.error); });
  };
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Manage</button>
        <h1 className={d.title}>{isNew ? "New test" : "Edit test"}</h1>
      </div>
      <label className={t.field}>
        <span className={t.label}>Title</span>
        <input className={t.input} value={draft.title} maxLength={120} placeholder="e.g. Mattress basics" onChange={e => setDraft({ ...draft, title: e.target.value })} />
      </label>
      <label className={t.field}>
        <span className={t.label}>Note for the team (optional)</span>
        <textarea className={t.area} value={draft.intro} maxLength={1000} placeholder="What the test covers" onChange={e => setDraft({ ...draft, intro: e.target.value })} />
      </label>
      {draft.questions.map((q, n) => (
        <div key={n} className={t.q}>
          <div className={t.bar}>
            <span className={t.qHead}>Question {n + 1}</span>
            {draft.questions.length > 1 ? (
              <button className={t.danger} onClick={() => setDraft(x => ({ ...x, questions: x.questions.filter((_, k) => k !== n) }))}>Remove</button>
            ) : null}
          </div>
          <div className={t.typeRow}>
            <label className={t.field}>
              <span className={t.label}>Type</span>
              <select className={t.select} aria-label={`Question ${n + 1} type`} value={q.kind} onChange={e => setQ(n, changeKind(q, e.target.value as QuestionKind))}>
                {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className={t.field}>
              <span className={t.label}>Points</span>
              <input className={t.input} inputMode="numeric" aria-label={`Question ${n + 1} points`} value={Number.isFinite(q.points) ? String(q.points) : ""}
                onChange={e => setQ(n, { ...q, points: e.target.value === "" ? Number.NaN : Number(e.target.value.replace(/\D/g, "").slice(0, 3)) })} />
            </label>
          </div>
          <textarea className={t.area} aria-label={`Question ${n + 1}`} value={q.prompt} maxLength={1000} placeholder="Write the question" onChange={e => setQ(n, { ...q, prompt: e.target.value })} />
          {isWritten(q.kind) ? (
            <p className={t.cardText}>{q.kind === "short" ? "A line of words" : "A few sentences"} — you mark it by hand after it is handed in, 0 to {pointsText(Number.isFinite(q.points) ? q.points : 1)}.</p>
          ) : (
            <>
              <span className={t.label}>{q.kind === "multiple" ? "Answers — mark every right one" : "Answers — mark the right one"}</span>
              {q.choices.map((c, i) => (
                <div key={i} className={t.edChoice}>
                  <span className={t.letter}>{mark(q, i)}</span>
                  {q.kind === "truefalse"
                    ? <span className={t.cardText} style={{ color: "var(--rv-ink)" }}>{c}</span>
                    : <input className={t.input} aria-label={`Answer ${letter(i)}`} value={c} maxLength={300} placeholder={`Answer ${letter(i)}`}
                        onChange={e => setQ(n, { ...q, choices: q.choices.map((y, k) => (k === i ? e.target.value : y)) })} />}
                  <button className={`${t.rightBtn} ${q.correct.includes(i) ? t.rightOn : ""}`} aria-pressed={q.correct.includes(i)} onClick={() => setQ(n, toggleCorrect(q, i))}>
                    {q.correct.includes(i) ? "✓ Right" : "Right?"}
                  </button>
                  <button className={t.x} aria-label={`Remove answer ${letter(i)}`} disabled={q.kind === "truefalse" || q.choices.length <= 2} onClick={() => setQ(n, removeChoice(q, i))}>×</button>
                </div>
              ))}
              {q.kind !== "truefalse" && q.choices.length < 8 ? (
                <button className={t.link} style={{ alignSelf: "flex-start" }} onClick={() => setQ(n, { ...q, choices: [...q.choices, ""] })}>+ Add an answer</button>
              ) : null}
            </>
          )}
          <input className={t.input} aria-label={`Question ${n + 1} explanation`} value={q.explain} maxLength={1000}
            placeholder={isWritten(q.kind) ? "What a good answer says — shown once it is marked (optional)" : "Why it is right — shown after handing in (optional)"}
            onChange={e => setQ(n, { ...q, explain: e.target.value })} />
        </div>
      ))}
      {draft.questions.length < 100 ? (
        <button className={t.secondary} onClick={() => setDraft(x => {
          const last = x.questions[x.questions.length - 1];
          return { ...x, questions: [...x.questions, emptyQuestion(last?.kind ?? "single", last && Number.isFinite(last.points) ? last.points : 1)] };
        })}>+ Add a question</button>
      ) : null}
      <p className={t.count}>{draft.questions.length === 1 ? "1 question" : `${draft.questions.length} questions`} · {pointsText(total)} in all</p>
      <label className={t.toggle}>
        <input type="checkbox" checked={draft.published} onChange={e => setDraft({ ...draft, published: e.target.checked })} />
        Published — IR&apos;s team can take it
      </label>
      {error && <p className={t.error} role="alert">{error}</p>}
      <button className={t.primary} disabled={saving || !canSave} onClick={save}>
        {readOnly ? "Read-only while viewing as" : saving ? "Saving…" : "Save test"}
      </button>
      {!isNew && rights.edit && !readOnly ? (
        <button className={t.danger} style={{ alignSelf: "center" }} disabled={saving} onClick={remove}>{sure ? "Tap again to delete this test" : "Delete test"}</button>
      ) : null}
    </div>
  );
}

function Scores({ test, rows, onBack, onOpen }: { test: AdminTest; rows: TestScoreRow[] | null; onBack: () => void; onOpen: (attemptId: string) => void }) {
  const topRef = useTop<HTMLDivElement>();
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Manage</button>
        <h1 className={d.title}>{test.title}</h1>
      </div>
      <p className={d.lede}>Everybody in IR, and how they did — out of {pointsText(test.points)}. Tap a name for their last answers.</p>
      {rows ? (
        <table className={t.table}>
          <thead><tr><th>Name</th><th>Best</th><th>Last</th><th>Tries</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staffId}>
                <td>{r.lastId ? <button className={t.link} onClick={() => onOpen(r.lastId!)}>{r.name}</button> : r.name}</td>
                {r.attempts ? (
                  <>
                    <td><b>{scoreText(r.best, r.total)}</b></td>
                    <td>{r.lastPending ? <span className={t.markWait}>To mark</span> : scoreText(r.last, r.total)}{r.lastAt ? <span className={t.notTaken}> · {docDay(r.lastAt)}</span> : null}</td>
                    <td>{r.attempts}</td>
                  </>
                ) : <td colSpan={3} className={t.notTaken}>Not taken</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className={d.empty} role="status">Loading the scores…</p>}
      {rows && !rows.length && <p className={d.empty}>Nobody in IR yet.</p>}
    </div>
  );
}
