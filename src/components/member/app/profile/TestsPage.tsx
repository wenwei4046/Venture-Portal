"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { docDay } from "@/lib/documentation/model";
import type { TrainingApi, TrainingRights } from "@/lib/rev-training/api";
import {
  answeredCount, changeKind, draftProblem, emptyQuestion, KIND_LABEL, letter, percent, pick, removeChoice, scoreText, toggleCorrect,
  type AdminTest, type DraftQuestion, type DraftTest, type QuestionKind, type TestResult, type TestScoreRow, type TestSummary, type TestToTake,
} from "@/lib/rev-training/model";
import { Svg } from "../icons";
import d from "./docs.module.css";
import p from "./profile.module.css";
import t from "./training.module.css";

const BACK = "M15 6l-6 6 6 6";
const KINDS: QuestionKind[] = ["single", "multiple", "truefalse"];

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
  | { at: "result"; test: TestToTake; answers: Record<string, number[]>; result: TestResult }
  | { at: "edit"; draft: DraftTest }
  | { at: "scores"; test: AdminTest; rows: TestScoreRow[] | null };

/**
 * Free test (2026-11-16 — the owner: simple multiple-choice tests IR's salespeople take "so the team can check what
 * they know"): the tests to take, each with one's own best and last score; a test's questions one under another, its
 * answers picked A / B / C; handed in, the score and, question by question, what was right. Taken again as often as
 * they like. Whoever holds Free test & Library · View has *Manage*: every test with how many took it, a test's scores,
 * and — with Create / Edit — writing one (every question type), publishing it and deleting it.
 */
export default function TestsPage({ api, rights, readOnly, onBack }: {
  api: TrainingApi;
  rights: TrainingRights;
  /** The Principal viewing somebody: nothing is handed in. */
  readOnly: boolean;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"take" | "manage">("take");
  const [view, setView] = useState<View>({ at: "list" });
  const [tests, setTests] = useState<TestSummary[] | null>(null);
  const [admin, setAdmin] = useState<AdminTest[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readTests = useCallback(() => {
    void api.tests().then(r => (r.ok ? (setTests(r.data), setMessage(null)) : setMessage(r.error)));
  }, [api]);
  const readAdmin = useCallback(() => {
    if (!rights.view) return;
    void api.adminTests().then(r => (r.ok ? (setAdmin(r.data), setMessage(null)) : setMessage(r.error)));
  }, [api, rights.view]);
  useEffect(() => { readTests(); }, [readTests]);
  useEffect(() => { if (tab === "manage") readAdmin(); }, [tab, readAdmin]);

  const top = () => { setView({ at: "list" }); setMessage(null); };
  const start = (id: string) => {
    setBusy(true);
    void api.take(id).then(r => {
      setBusy(false);
      if (r.ok) { setView({ at: "take", test: r.data }); setMessage(null); } else setMessage(r.error);
    });
  };

  if (view.at === "take") {
    return <TakeTest test={view.test} readOnly={readOnly} onBack={top} hand={answers => api.submit(view.test.id, answers).then(r => {
      if (r.ok) { setView({ at: "result", test: view.test, answers, result: r.data }); readTests(); }
      return r.ok ? null : r.error;
    })} />;
  }
  if (view.at === "result") {
    return <Result test={view.test} result={view.result} onBack={top} onAgain={() => start(view.test.id)} />;
  }
  if (view.at === "edit") {
    return <Editor draft={view.draft} rights={rights} readOnly={readOnly} onBack={() => { top(); readAdmin(); }} api={api}
      onSaved={() => { top(); readAdmin(); readTests(); }} />;
  }
  if (view.at === "scores") {
    return <Scores test={view.test} rows={view.rows} onBack={top} />;
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
          {([["take", "Take a test"], ["manage", "Manage"]] as const).map(([id, label]) => (
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
                <span>{test.questions === 1 ? "1 question" : `${test.questions} questions`}</span>
                {test.attempts ? (
                  <>
                    <span>Best <b>{scoreText(test.best, test.lastTotal)}</b></span>
                    <span>Last <b>{scoreText(test.last, test.lastTotal)}</b>{test.lastAt ? ` · ${docDay(test.lastAt)}` : ""}</span>
                    <span>{test.attempts === 1 ? "Taken once" : `Taken ${test.attempts} times`}</span>
                  </>
                ) : <span>Not taken yet</span>}
              </div>
              <div className={t.actions}>
                <button className={t.primary} disabled={busy} onClick={() => start(test.id)}>{test.attempts ? "Take it again" : "Start"}</button>
              </div>
            </article>
          ))}
          {tests && !tests.length && <p className={d.empty}>No tests yet.</p>}
          {!tests && !message && <p className={d.empty} role="status">Loading the tests…</p>}
        </section>
      ) : (
        <section aria-label="Manage" style={{ display: "contents" }}>
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
                <span>{test.questions === 1 ? "1 question" : `${test.questions} questions`}</span>
                <span><b>{test.people}</b> {test.people === 1 ? "person" : "people"} took it</span>
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

function TakeTest({ test, readOnly, onBack, hand }: {
  test: TestToTake; readOnly: boolean; onBack: () => void;
  hand: (answers: Record<string, number[]>) => Promise<string | null>;
}) {
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const done = answeredCount(answers, test);
  const left = test.questions.length - done;
  const send = () => {
    setSending(true);
    void hand(answers).then(e => { setSending(false); setError(e); });
  };
  const topRef = useTop<HTMLDivElement>();
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Free test</button>
        <h1 className={d.title}>{test.title}</h1>
      </div>
      {test.intro && <p className={d.lede}>{test.intro}</p>}
      <div className={t.bar}>
        <span className={t.count}>{done} of {test.questions.length} answered</span>
      </div>
      <div className={t.progress} aria-hidden><div className={t.progressFill} style={{ width: `${test.questions.length ? (done / test.questions.length) * 100 : 0}%` }} /></div>
      {test.questions.map((q, n) => (
        <fieldset key={q.id} className={t.q} style={{ margin: 0 }}>
          <legend className={t.qHead} style={{ float: "left", width: "100%", padding: 0 }}>Question {n + 1} · {q.kind === "multiple" ? "Pick every right answer" : KIND_LABEL[q.kind]}</legend>
          <p className={t.qPrompt}>{q.prompt}</p>
          {q.choices.map((c, i) => {
            const on = answers[q.id]?.includes(i) ?? false;
            return (
              <button key={i} type="button" role={q.kind === "multiple" ? "checkbox" : "radio"} aria-checked={on}
                className={`${t.choice} ${on ? t.choiceOn : ""}`}
                onClick={() => setAnswers(a => ({ ...a, [q.id]: pick(q.kind, a[q.id] ?? [], i) }))}>
                <span className={`${t.letter} ${q.kind === "multiple" ? t.letterBox : ""}`}>{q.kind === "truefalse" ? (i === 0 ? "T" : "F") : letter(i)}</span>
                <span>{c}</span>
              </button>
            );
          })}
        </fieldset>
      ))}
      {error && <p className={t.error} role="alert">{error}</p>}
      <button className={t.primary} disabled={sending || readOnly || done === 0} onClick={send}>
        {readOnly ? "Read-only while viewing as" : sending ? "Handing in…" : left ? `Hand in · ${left} not answered` : "Hand in"}
      </button>
    </div>
  );
}

function Result({ test, result, onBack, onAgain }: { test: TestToTake; result: TestResult; onBack: () => void; onAgain: () => void }) {
  const byId = new Map(result.review.map(r => [r.id, r]));
  const topRef = useTop<HTMLDivElement>();
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Free test</button>
        <h1 className={d.title}>{test.title}</h1>
      </div>
      <div className={t.score} role="status">
        <span className={t.scoreBig}>{result.score} / {result.total}</span>
        <span className={t.scoreSub}>{percent(result.score, result.total)}% right{result.saved ? " · kept in your scores" : " · a try, not kept"}</span>
      </div>
      <div className={t.actions}>
        <button className={t.primary} onClick={onAgain}>Take it again</button>
        <button className={t.secondary} onClick={onBack}>All tests</button>
      </div>
      {test.questions.map((q, n) => {
        const r = byId.get(q.id);
        if (!r) return null;
        return (
          <div key={q.id} className={t.q}>
            <div className={t.qHead}>
              Question {n + 1} · <span className={r.right ? t.markRight : t.markWrong}>{r.right ? "Right" : "Wrong"}</span>
            </div>
            <p className={t.qPrompt}>{q.prompt}</p>
            {q.choices.map((c, i) => {
              const right = r.correct.includes(i);
              const chose = r.chosen.includes(i);
              const tone = right ? t.choiceRight : chose ? t.choiceWrong : "";
              return (
                <div key={i} className={`${t.choice} ${tone}`}>
                  <span className={`${t.letter} ${q.kind === "multiple" ? t.letterBox : ""}`}>{q.kind === "truefalse" ? (i === 0 ? "T" : "F") : letter(i)}</span>
                  <span>
                    {c}
                    {right && <span className={`${t.choiceTag} ${t.tagRight}`}>{chose ? "Your answer · right" : "The right answer"}</span>}
                    {!right && chose && <span className={`${t.choiceTag} ${t.tagWrong}`}>Your answer</span>}
                  </span>
                </div>
              );
            })}
            {r.explain && <p className={t.explain}>{r.explain}</p>}
          </div>
        );
      })}
    </div>
  );
}

function Editor({ draft: first, rights, readOnly, api, onBack, onSaved }: {
  draft: DraftTest; rights: TrainingRights; readOnly: boolean; api: TrainingApi; onBack: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<DraftTest>(first);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sure, setSure] = useState(false);
  const isNew = !draft.id;
  const canSave = !readOnly && (isNew ? rights.create : rights.edit);
  const setQ = (n: number, q: DraftQuestion) => setDraft(x => ({ ...x, questions: x.questions.map((y, k) => (k === n ? q : y)) }));
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
  const topRef = useTop<HTMLDivElement>();
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
          <div className={`${p.seg} ${p.seg3}`} role="radiogroup" aria-label={`Question ${n + 1} type`}>
            {KINDS.map(k => (
              <button key={k} role="radio" aria-checked={q.kind === k} className={`${p.segBtn} ${q.kind === k ? p.segOn : ""}`} onClick={() => setQ(n, changeKind(q, k))}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <textarea className={t.area} aria-label={`Question ${n + 1}`} value={q.prompt} maxLength={1000} placeholder="Write the question" onChange={e => setQ(n, { ...q, prompt: e.target.value })} />
          <span className={t.label}>{q.kind === "multiple" ? "Answers — mark every right one" : "Answers — mark the right one"}</span>
          {q.choices.map((c, i) => (
            <div key={i} className={t.edChoice}>
              <span className={t.letter}>{q.kind === "truefalse" ? (i === 0 ? "T" : "F") : letter(i)}</span>
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
          <input className={t.input} aria-label={`Question ${n + 1} explanation`} value={q.explain} maxLength={1000} placeholder="Why it is right — shown after handing in (optional)"
            onChange={e => setQ(n, { ...q, explain: e.target.value })} />
        </div>
      ))}
      {draft.questions.length < 100 ? (
        <button className={t.secondary} onClick={() => setDraft(x => ({ ...x, questions: [...x.questions, emptyQuestion(x.questions[x.questions.length - 1]?.kind ?? "single")] }))}>+ Add a question</button>
      ) : null}
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

function Scores({ test, rows, onBack }: { test: AdminTest; rows: TestScoreRow[] | null; onBack: () => void }) {
  const topRef = useTop<HTMLDivElement>();
  return (
    <div ref={topRef} className={d.page}>
      <div className={d.head}>
        <button className={d.back} onClick={onBack}><Svg d={BACK} size={18} sw={2} />Manage</button>
        <h1 className={d.title}>{test.title}</h1>
      </div>
      <p className={d.lede}>Everybody in IR, and how they did. Best and last of {test.questions}.</p>
      {rows ? (
        <table className={t.table}>
          <thead><tr><th>Name</th><th>Best</th><th>Last</th><th>Tries</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staffId}>
                <td>{r.name}</td>
                {r.attempts ? (
                  <>
                    <td><b>{scoreText(r.best, r.total)}</b></td>
                    <td>{scoreText(r.last, r.total)}{r.lastAt ? <span className={t.notTaken}> · {docDay(r.lastAt)}</span> : null}</td>
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
