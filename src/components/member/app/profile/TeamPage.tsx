"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import Sheet, { SheetHandle } from "../Sheet";
import { PageHead } from "./IncomePages";
import type { PersonSheetVM, TeamDot, TeamNodeVM, TeamVM } from "./profile-vm";
import s from "./profile.module.css";

const DOT: Record<TeamDot, string> = { good: s.dotGood, wait: s.dotWait, up: s.dotUp };
const INK = { ink: "", good: s.psGood, up: s.psUp, wait: s.psWait } as const;

/** A director's place on a shared level (`.peer`): the 132px card and the 24px between two. */
const PEER_W = 156;

/** Team & capacity (`team-style="b"`, lines 999–1080): the department's places, then the family chart. */
export default function TeamPage({ vm, onBack, onPerson }: { vm: TeamVM | null; onBack: () => void; onPerson: (id: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const meId = vm?.me.id;
  const widest = vm ? Math.max(0, ...vm.ups.map(u => u.nodes.length)) * PEER_W : 0;
  // The chart opens at its left edge, as drawn. On a phone that puts the middle
  // column right of centre, and a second director would start half off-screen —
  // then, and only then, it opens on the middle instead.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box && widest > PEER_W && (box.scrollWidth + widest) / 2 > box.clientWidth) box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
  }, [meId, widest]);
  return (
    <div className={s.page}>
      <PageHead back="Profile" title="Team & capacity" lede={vm?.lede ?? ""} onBack={onBack} />
      {!vm ? <p className={s.empty}>Loading your team…</p> : (
        <>
          <section className={s.capCard}>
            <div className={s.capTop}>
              <span className={s.capLabel}>Department capacity</span>
              <span className={`${s.capOpen} ${vm.capacity.full ? s.capFull : ""}`}>{vm.capacity.chip}</span>
            </div>
            <span className={s.capCount}>{vm.capacity.occupied} <span className={s.capOf}>{vm.capacity.capacity !== null ? `of ${vm.capacity.capacity} places` : "people"}</span></span>
            {vm.capacity.capacity !== null && (
              <div className={s.capBar}>
                <span className={s.capUsed} style={{ flex: `${Math.min(vm.capacity.occupied, vm.capacity.capacity)} 1 0` }} />
                <span className={s.capFree} style={{ flex: `${Math.max(vm.capacity.capacity - vm.capacity.occupied, 0)} 1 0` }} />
              </div>
            )}
            <span className={s.capNote}>{vm.capacity.note}</span>
          </section>
          <section className={s.family}>
            <div className={s.familyHead}><h2 className={s.h2}>Your Revenue family</h2><span className={s.familyCount}>{vm.count}</span></div>
            <div className={s.legend}>
              {vm.legend.map((label, i) => (
                <span key={label} className={s.legendItem}><span className={`${s.legendDot} ${[s.dotGood, s.dotWait, s.dotUp][i]}`} />{label}</span>
              ))}
            </div>
            <div ref={scroller} className={s.chartScroll}>
              <div className={s.chart}>
                {vm.ups.map(u => (
                  <div key={u.nodes[0].id} className={s.upWrap}>
                    <span className={s.level}>{u.level}</span>
                    {u.nodes.length === 1 ? (
                      <>
                        <Node node={u.nodes[0]} kind="up" onClick={() => onPerson(u.nodes[0].id)} />
                        <span className={s.stem} style={{ height: 22 }} />
                      </>
                    ) : (
                      <>
                        {/* Peers: one bar under their cards, one line down from its middle — the same 22px as a single card */}
                        <div className={s.peers}>
                          {u.nodes.map((n, i) => (
                            <div key={n.id} className={s.peer}>
                              <Node node={n} kind="up" onClick={() => onPerson(n.id)} />
                              <span className={s.stem} style={{ height: 10 }} />
                              <div className={s.bus}>
                                <span className={`${s.busHalf} ${i === 0 ? s.busGap : ""}`} />
                                <span className={s.busMid} />
                                <span className={`${s.busHalf} ${i === u.nodes.length - 1 ? s.busGap : ""}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                        <span className={s.stem} style={{ height: 10 }} />
                      </>
                    )}
                  </div>
                ))}
                <span className={s.level}>YOU</span>
                <Node node={vm.me} kind="me" onClick={() => onPerson(vm.me.id)} />
                {vm.kids.length > 0 && <span className={s.stem} style={{ height: 20 }} />}
                <div className={s.kids}>
                  {vm.kids.map((k, i) => (
                    <div key={k.id} className={s.kid}>
                      <div className={s.bus}>
                        <span className={`${s.busHalf} ${i === 0 ? s.busGap : ""}`} />
                        <span className={s.busMid} />
                        <span className={`${s.busHalf} ${i === vm.kids.length - 1 ? s.busGap : ""}`} />
                      </div>
                      <span className={s.stem} style={{ height: 18 }} />
                      <Node node={k} kind="kid" onClick={() => onPerson(k.id)} />
                      {k.kids.length > 0 && (
                        <>
                          <span className={s.stem} style={{ height: 16 }} />
                          <div className={s.grand}>
                            {k.kids.map((g, j) => (
                              <Fragment key={g.id}>
                                <div className={s.grandWrap}>
                                  <span className={s.stem} style={{ height: j === 0 ? 0 : 10 }} />
                                  <button className={s.grandNode} onClick={() => onPerson(g.id)}>
                                    <span className={s.grandAv}>{g.ini}</span>
                                    <span className={s.grandText}><span className={s.grandName}>{g.name}</span><span className={s.grandTitle}>{g.title}</span></span>
                                  </button>
                                </div>
                              </Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <span className={s.swipe}>Swipe sideways to see everyone · tap a person for details</span>
          </section>
        </>
      )}
    </div>
  );
}

function Node({ node, kind, onClick }: { node: TeamNodeVM; kind: "up" | "me" | "kid"; onClick: () => void }) {
  const size = kind === "up" ? s.nodeUp : kind === "me" ? s.nodeMe : s.nodeKid;
  return (
    <button className={`${s.node} ${size}`} onClick={onClick}>
      <span className={s.nodeAv}>{node.ini}<span className={`${s.nodeDot} ${DOT[node.dot]}`} /></span>
      <span className={s.nodeName}>{node.name}</span>
      <span className={s.nodeTitle}>{node.title}</span>
    </button>
  );
}

/** A person on the chart (lines 1698–1711). */
export function PersonSheet({ open, vm, onClose }: { open: boolean; vm: PersonSheetVM | null; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} z={22} peek className={`${s.sheetBody} ${s.sheetGap14}`} label={vm?.name ?? "Person"}>
      <SheetHandle />
      {vm && (
        <>
          <div className={s.psWho}>
            <span className={`${s.psAv} ${vm.self ? s.psAvMe : ""}`}>{vm.ini}</span>
            <div className={s.sheetMinW}><span className={s.psName}>{vm.name}</span><span className={s.psRole}>{vm.role}</span></div>
          </div>
          <div className={s.grid3}>
            {vm.stats.map(x => (
              <div key={x.label} className={s.cell}><span className={s.cellLabel}>{x.label}</span><span className={`${s.psValue} ${INK[x.tone]}`}>{x.value}</span></div>
            ))}
          </div>
          <span className={s.psReports}>{vm.reportsTo}</span>
          <button className={s.done} onClick={onClose}>Done</button>
        </>
      )}
    </Sheet>
  );
}
