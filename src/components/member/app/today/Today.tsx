"use client";

import { ICON, Svg } from "../icons";
import { amountParts, type TodayBoard, type TodayModel, type TodayTodo } from "./today-model";
import s from "./today.module.css";

/**
 * What Today's taps open. Insight's two and the Arena's two are absent when
 * their holder's ticks close that page (2026-10-11): the figures then stay,
 * opening nothing, and Your Arena is not shown. With My income closed the
 * income stays hidden, so there is no eye to show it (`toggleHide` absent).
 */
export interface TodayActions {
  toggleHide?: () => void;
  openMetric?: (key: "sales" | "margin" | "kpi") => void;
  openTodo: (todo: TodayTodo) => void;
  openOrders?: () => void;
  openArena?: () => void;
  openBoard?: (board: TodayBoard["id"]) => void;
}

const TONE = { memo: s.toneMemo, request: s.toneRequest, weeks: s.toneWeeks } as const;
const BOARD = { sales: s.board_sales, margin: s.board_margin, kpi: s.board_kpi, champ: s.board_champ } as const;

/** Today — the command centre (`today-style="a"`). */
export default function Today({ model, hidden, actions }: { model: TodayModel; hidden: boolean; actions: TodayActions }) {
  const { openMetric, openOrders, openArena, openBoard } = actions;
  const amount = amountParts(model.heroAmount);
  return (
    <div className={s.page}>
      <div>
        <h1 className={s.hello}>{model.hello}</h1>
        <p className={s.helloSub}>{model.helloSub}</p>
      </div>

      {/* The income as a statement (2026-10-14, the refresh handoff §3): no card — the label and the eye, the figure,
          its split, then Sales · Margin · KPI between a dark rule and a light one. */}
      <section className={s.hero}>
        <div className={s.heroTop}>
          <span className={s.heroLabel}>{model.heroLabel}</span>
          {actions.toggleHide && (
            <button className={s.heroEye} onClick={actions.toggleHide} aria-label="Hide amounts">
              <Svg d={hidden ? ICON.eyeOff : ICON.eye} size={18} sw={1.7} />
            </button>
          )}
        </div>
        {model.heroLoading
          ? <span className={`${s.skelInk} ${s.heroSkel}`} role="img" aria-label="Working out your income" />
          : <div className={s.heroAmount}>{amount.cur && <span className={s.heroCur}>{amount.cur}</span>}<span className={s.heroNum}>{amount.num}</span></div>}
        <p className={s.heroSplit}>{model.heroSplit}</p>
        <div className={s.heroMetrics}>
          {model.metrics.map(m => {
            const body = (
              <>
                <span className={s.metricLabel}>{m.label}</span>
                {m.loading ? (
                  <>
                    <span className={`${s.skelInk} ${s.metricSkel}`} />
                    <span className={`${s.skelInk} ${s.metricTagSkel}`} />
                  </>
                ) : (
                  <>
                    <span className={s.metricValue}>{m.value}</span>
                    <span className={`${s.metricTag} ${m.tagTone === "good" ? s.metricTagGood : s.metricTagSub}`}>{m.tag}</span>
                  </>
                )}
              </>
            );
            return openMetric
              ? <button key={m.key} className={`${s.metric} ${s.metricTap}`} onClick={() => openMetric(m.key)} aria-busy={m.loading || undefined}>{body}</button>
              : <div key={m.key} className={s.metric} aria-busy={m.loading || undefined}>{body}</div>;
          })}
        </div>
      </section>

      <section>
        <div className={s.sectHead}><h2 className={s.sectTitle}>Needs your action</h2></div>
        {model.todo.length ? model.todo.map(t => (
          <button key={t.key} className={s.todo} onClick={() => actions.openTodo(t)}>
            <span className={`${s.todoIcon} ${TONE[t.tone]}`}><Svg d={t.icon} size={17} sw={1.8} /></span>
            <span className={s.todoText}>
              <span className={s.todoTitle}>{t.title}</span>
              <span className={s.todoSub}>{t.sub}</span>
            </span>
            <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-sub)" />
          </button>
        )) : <p className={s.todoEmpty}>You&apos;re all caught up.</p>}
      </section>

      {model.week && (
        <section>
          <div className={s.sectHead}>
            <h2 className={s.sectTitle}>This week</h2>
            {openOrders && <button className={s.sectLink} onClick={openOrders}>My orders<Svg d={ICON.chevronRight} size={15} sw={1.9} /></button>}
          </div>
          <div className={s.week}>
            <div className={s.weekTop}><span className={s.weekTitle}>{model.week.title}</span><span className={s.weekDates}>{model.week.dates}</span></div>
            {model.week.venue && (
              <span className={s.weekPlace}>{model.week.venue}{model.week.org && <> · <span className={s.weekOrg}>{model.week.org}</span></>}</span>
            )}
          </div>
        </section>
      )}

      {openArena && openBoard && (
        <section>
          <div className={s.sectHead}>
            <h2 className={s.sectTitle}>Your Arena</h2>
            <button className={s.sectLink} onClick={openArena}>All boards<Svg d={ICON.chevronRight} size={15} sw={1.9} /></button>
          </div>
          <div className={s.boards}>
            {model.boards.map(b => (
              <button key={b.id} className={`${s.board} ${BOARD[b.id]}`} onClick={() => openBoard(b.id)} aria-busy={b.state === "loading" || undefined}>
                <span className={s.boardLabel}>{b.label}</span>
                {b.state === "loading" ? <span className={`${s.skel} ${s.boardSkel}`} />
                  : b.state === "unranked" ? <span className={s.boardNone}>Not ranked yet</span>
                  : b.state === "lead" ? <span className={s.boardNone}>{b.leader ? `${b.leader} leads` : "Nobody placed yet"}</span>
                  : b.state === "off" ? <span className={s.boardNone}>Not counted</span>
                  : <span className={s.boardRank}><span className={s.boardNum}>{b.rankNum}</span><span className={s.boardSuf}>{b.rankSuf}</span></span>}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
