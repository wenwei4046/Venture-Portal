'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import {
  boxOf, edgePath, LANE_H, mapRows, mapSize, replayAt, type MapEdge, type MapNode, type MapTone, type TaskMap as Model,
} from '@/lib/marketing/taskmap'
import s from './map.module.css'

// The task map (`Task Map.dc.html`, ④-4): the lanes, the stations and the lines between them on a dotted ground —
// dragged or scrolled sideways, ⌘/Ctrl + scroll or − + to zoom, Fit; a line's when / who / what on hover; a station's
// panel on click; the same road as a list. As Replay (the Audit trail's): ▶ walks the trail record by record, the
// lines lighting as they are made, a dot running along each, the caption and the scrubber under it.

const TONE: Record<MapTone, string> = { done: s.done, waiting: s.waiting, draft: s.draft, red: s.red }
// A lane's ground by its tone (a group's colour, read from its People title — lib/marketing/groups.ts).
const LANE: Record<string, string> = {
  appr: s.lane_appr, social: s.lane_social, content: s.lane_content, design: s.lane_design, ads: s.lane_ads, brand: s.lane_brand,
  manager: s.lane_manager, none: s.lane_none,
}
const VH = 480
const TAG_W = 132

export default function TaskMap({ map, mode = 'map', track }: { map: Model; mode?: 'map' | 'replay'; track: string }) {
  const replay = mode === 'replay'
  const uid = useId().replace(/:/g, '')
  const vp = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(1000)
  const [view, setView] = useState<'map' | 'list'>('map')
  const [z, setZ] = useState(0.7)
  const [px, setPx] = useState(12)
  const [drag, setDrag] = useState<{ x: number; px: number } | null>(null)
  const moved = useRef(false)
  const [sel, setSel] = useState<string | null>(null)
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)
  const [step, setStep] = useState(map.steps.length)
  const [playing, setPlaying] = useState(false)

  const { w: CW, h: CH } = mapSize(map)
  const boxes = useMemo(() => new Map(map.nodes.map(n => [n.id, boxOf(n, map.lanes)])), [map])
  const paths = useMemo(() => new Map(map.edges.map(e => {
    const a = boxes.get(e.from)
    const b = boxes.get(e.to)
    return [e.key, a && b ? edgePath(a, b, e.kind === 'return') : null]
  })), [map, boxes])

  const clampZ = useCallback((v: number) => Math.min(Math.min(1.6, (VH - 20) / CH), Math.max(0.3, v)), [CH])
  const clampX = useCallback((v: number, zz: number) => {
    const max = TAG_W
    const min = Math.min(max, vw - CW * zz - 12)
    return Math.min(max, Math.max(min, v))
  }, [vw, CW])

  // Fit: the whole road if it fits, else from its start (Replay) or with where it stands in view.
  const fit = useCallback((width: number) => {
    const zz = clampZ(Math.max(replay ? 0.45 : 0.62, Math.min(1, (width - 24) / CW)))
    const start = boxes.get('start')
    const here = map.nodes.find(n => n.current)
    const startPx = TAG_W + 12 - ((start?.l ?? 0) - 10) * zz
    const hx = here ? boxes.get(here.id)?.cx ?? 0 : 0
    const want = replay || !here ? startPx : Math.min(startPx, Math.max(width - CW * zz - 12, width * 0.55 - hx * zz))
    setZ(zz)
    setPx(Math.min(TAG_W, Math.max(Math.min(TAG_W, width - CW * zz - 12), want)))
  }, [boxes, map.nodes, replay, CW, clampZ])

  useEffect(() => {
    const el = vp.current
    if (!el) return
    const width = el.clientWidth || 1000
    setVw(width)
    fit(width)
  }, [fit, view])

  // The wheel reads the zoom and the offset as they are now (refs), so a fast scroll never works from stale ones.
  const zr = useRef(z)
  const pr = useRef(px)
  useEffect(() => { zr.current = z; pr.current = px }, [z, px])
  useEffect(() => {
    const el = vp.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - el.getBoundingClientRect().left
        const old = zr.current
        const zz = clampZ(old * (e.deltaY < 0 ? 1.08 : 0.92))
        setZ(zz)
        setPx(clampX(mx - (mx - pr.current) * (zz / old), zz))
      } else setPx(clampX(pr.current - (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY), zr.current))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [clampX, clampZ, view])

  // Replay: a record every 1.1 s.
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setStep(n => {
        if (n >= map.steps.length) { setPlaying(false); return n }
        return n + 1
      })
    }, 1100)
    return () => clearInterval(t)
  }, [playing, map.steps.length])
  useEffect(() => { if (playing && step >= map.steps.length) setPlaying(false) }, [playing, step, map.steps.length])

  const r = replay ? replayAt(map, step) : null
  const py = Math.max(10, (VH - CH * z) / 2)
  const zoomBy = (f: number) => { const zz = clampZ(z * f); setZ(zz); setPx(p => clampX(p, zz)) }

  const nodeState = (n: MapNode): MapNode => {
    if (!r) return n
    const current = n.id === r.at
    const seen = r.seen.has(n.id)
    return { ...n, current, future: !seen && !current, tone: current ? 'waiting' : seen ? 'done' : 'draft' }
  }
  const edgeOff = (e: MapEdge) => !!r && !r.lit.has(e.key)
  const edgeClass = (e: MapEdge) => {
    if (edgeOff(e) || e.kind === 'future') return `${s.edge} ${s.edgeFaint}`
    return `${s.edge}${e.kind === 'return' ? ` ${s.edgeRed}` : ''}${e.kind === 'dashed' ? ` ${s.edgeDashed}` : ''}`
  }
  const marker = (e: MapEdge) => `url(#${uid}${edgeOff(e) || e.kind === 'future' ? 'f' : e.kind === 'return' ? 'r' : 'a'})`

  const node = sel ? map.nodes.find(n => n.id === sel) ?? null : null
  const panel = node ? map.stations[node.id] : null
  const laneOf = (id: string) => map.lanes.find(l => l.id === id)
  const here = map.nodes.find(n => n.current)
  const hov = hover ? map.edges.find(e => e.key === hover.key) ?? null : null
  const last = r?.last ?? null
  const fresh = r && step > 0 ? map.steps[step - 1]?.edges ?? [] : []
  const ticks = tickLabels(map.steps.map(x => x.t))

  return (
    <div className={s.root}>
      {replay ? null : (
        <div className={s.top}>
          <span className={s.topIcon} aria-hidden="true">🗺️</span>
          <span className={s.topTitle}>Task Map</span>
          {here ? <span className={s.topNow}>Now at {here.icon ? `${here.icon} ` : ''}{here.full}</span> : null}
          <span className={s.grow} />
          <div className={s.seg} role="tablist" aria-label="View">
            {(['map', 'list'] as const).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={`${s.segBtn}${view === v ? ` ${s.segOn}` : ''}`} onClick={() => setView(v)}>
                {v === 'map' ? '🗺️ Map view' : '☰ List view'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={s.frame}>
        {view === 'map' ? (
          <div
            ref={vp}
            className={`${s.vp}${drag ? ` ${s.vpDrag}` : ''}`}
            style={{ height: VH }}
            role="region"
            aria-label={`${track} — task map`}
            onMouseDown={e => { moved.current = false; setDrag({ x: e.clientX, px }) }}
            onMouseMove={e => {
              if (!drag) return
              const dx = e.clientX - drag.x
              if (Math.abs(dx) > 4) moved.current = true
              setPx(clampX(drag.px + dx, z))
            }}
            onMouseUp={() => { setDrag(null); setTimeout(() => { moved.current = false }, 0) }}
            onMouseLeave={() => setDrag(null)}
          >
            <div className={s.canvas} style={{ width: CW, height: CH, transform: `translate(${px}px, ${py}px) scale(${z})` }}>
              {map.lanes.map((l, i) => <div key={l.id} className={`${s.lane} ${LANE[l.tone]}`} style={{ top: i * LANE_H, width: CW, height: LANE_H }} />)}
              <svg className={s.svg} width={CW} height={CH} aria-hidden="true">
                <defs>
                  {(['a', 'r', 'f'] as const).map(k => (
                    <marker key={k} id={`${uid}${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0,0 L10,5 L0,10 z" className={k === 'a' ? s.arrow : k === 'r' ? s.arrowRed : s.arrowFaint} />
                    </marker>
                  ))}
                </defs>
                {map.edges.map(e => {
                  const p = paths.get(e.key)
                  return p ? <path key={e.key} d={p.d} className={edgeClass(e)} markerEnd={marker(e)} /> : null
                })}
                {map.edges.map(e => {
                  const p = paths.get(e.key)
                  if (!p) return null
                  const show = (ev: ReactMouseEvent) => {
                    const rect = vp.current?.getBoundingClientRect()
                    if (!rect) return
                    let x = ev.clientX - rect.left + 14
                    let y = ev.clientY - rect.top + 14
                    if (x > rect.width - 280) x -= 300
                    if (y > rect.height - 170) y -= 180
                    setHover({ key: e.key, x, y })
                  }
                  return (
                    <path key={`${e.key}:hit`} d={p.d} className={`${s.hit}${hover?.key === e.key ? ` ${s.hitOn}` : ''}`}
                      onMouseEnter={show} onMouseMove={show} onMouseLeave={() => setHover(null)} />
                  )
                })}
                {/* Replay: a dot runs along each line the record just made. */}
                {r && playing ? fresh.map(k => {
                  const p = paths.get(k)
                  return p ? (
                    <circle key={`${step}:${k}`} r="7" className={s.runner}>
                      <animateMotion dur="0.9s" fill="freeze" path={p.d} />
                    </circle>
                  ) : null
                }) : null}
              </svg>
              {map.edges.map(e => {
                const p = paths.get(e.key)
                if (!p || !e.label || edgeOff(e) || e.kind === 'future') return null
                return <div key={`${e.key}:label`} className={`${s.edgeLabel}${e.kind === 'return' ? ` ${s.edgeLabelRed}` : ''}`} style={{ left: p.mid[0], top: p.mid[1] }}>{e.label}</div>
              })}
              {map.nodes.map(raw => {
                const n = nodeState(raw)
                const b = boxes.get(n.id)!
                return (
                  <div key={n.id} className={s.station} style={{ left: b.l, top: b.t, width: b.w, height: b.h }}>
                    {n.current ? <span className={s.pulse} aria-hidden="true" /> : null}
                    <button
                      type="button"
                      className={`${n.kind === 'gate' ? s.gate : s.card} ${TONE[n.tone]}${n.current ? ` ${s.current}` : ''}${n.future ? ` ${s.future}` : ''}`}
                      aria-label={`${n.full} · ${n.status}`}
                      aria-pressed={sel === n.id}
                      onClick={() => { if (!moved.current) setSel(n.id) }}
                    >
                      {n.kind === 'card' ? (
                        <>
                          <span className={s.cardWho}><span className={s.av} aria-hidden="true">{n.person.slice(0, 1)}</span><span className={s.cardPerson}>{n.person}</span></span>
                          <span className={s.cardTitle}>{n.title}</span>
                          <span className={s.cardFoot}>
                            <span className={s.dot} aria-hidden="true" />
                            <span className={s.cardDate}>{n.date}</span>
                            {n.tag ? <span className={`${s.tag}${n.tag.startsWith('returned') ? ` ${s.tagRed}` : ''}`}>{n.tag}</span> : null}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className={s.gateWho}><span aria-hidden="true">{n.icon}</span><span>{n.person}</span>{n.tone === 'done' ? <span className={s.mark} aria-hidden="true">✓</span> : null}</span>
                          <span className={s.gateTitle}>{n.title}</span>
                        </>
                      )}
                    </button>
                    {n.current ? <span className={s.here}>📍 Now here</span> : null}
                    {sel === n.id ? <span className={s.selRing} aria-hidden="true" /> : null}
                  </div>
                )
              })}
            </div>
            {map.lanes.map((l, i) => (
              <div key={`${l.id}:tag`} className={`${s.laneTag} ${LANE[l.tone]}`} title={l.name} style={{ top: py + i * LANE_H * z, height: LANE_H * z }}>
                <span className={s.laneEmoji} aria-hidden="true">{l.emoji}</span>
                <span className={s.laneName}>{l.name}</span>
              </div>
            ))}
            <div className={s.legend} aria-label="Legend">
              <span><span className={s.lgLine} />🔒 Assigned</span>
              <span><span className={`${s.lgLine} ${s.lgDashed}`} />🔓 Picked by the stage before</span>
              <span><span className={`${s.lgLine} ${s.lgRed}`} />Returned</span>
              <span><span className={s.lgGate} />Approval gate</span>
              <span><span className={s.lgPlanned} />Planned</span>
            </div>
            <div className={s.zoom}>
              <button type="button" className={s.zoomBtn} aria-label="Zoom out" onClick={() => zoomBy(0.87)}>−</button>
              <span className={s.zoomPct}>{Math.round(z * 100)}%</span>
              <button type="button" className={s.zoomBtn} aria-label="Zoom in" onClick={() => zoomBy(1.15)}>+</button>
              <button type="button" className={s.fit} onClick={() => fit(vw)}>Fit</button>
            </div>
            {hover && hov ? (
              <div className={s.tip} style={{ left: hover.x, top: hover.y }} role="tooltip">
                <div className={s.tipT}>{hov.meta?.t ?? 'Planned'}</div>
                <div className={s.tipWho}>{hov.meta?.who ?? `${map.nodes.find(n => n.id === hov.from)?.person ?? '—'} → ${map.nodes.find(n => n.id === hov.to)?.person ?? '—'}`}</div>
                <div className={s.tipWhat}>{hov.meta?.what ?? `Opens when ${map.nodes.find(n => n.id === hov.from)?.full ?? 'the stage before'} is done`}</div>
                {hov.meta?.reason ? <div className={s.tipReason}>&ldquo;{hov.meta.reason}&rdquo;</div> : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={s.list} role="table" aria-label="Stations">
            <div className={`${s.lr} ${s.lh}`} role="row">
              {['#', 'Station', 'Lane', 'Person', 'Handoff', 'Status', 'Date'].map(h => <span key={h} role="columnheader">{h}</span>)}
            </div>
            {mapRows(map).map(row => {
              const lane = laneOf(map.nodes.find(n => n.id === row.id)?.lane ?? '')
              return (
                <button key={row.id} type="button" role="row" className={`${s.lr}${row.current ? ` ${s.lrHere}` : ''}${sel === row.id ? ` ${s.lrSel}` : ''}`} onClick={() => setSel(row.id)}>
                  <span className={s.lrNo} role="cell">{row.no}</span>
                  <span className={s.lrTitle} role="cell"><span aria-hidden="true">{row.icon}</span><span className={s.ellipsis}>{row.title}</span></span>
                  <span className={s.lrLane} role="cell"><span className={`${s.lrLaneDot} ${LANE[lane?.tone ?? 'appr']}`} aria-hidden="true" />{row.lane}</span>
                  <span className={s.ellipsis} role="cell">{row.person}</span>
                  <span className={`${s.ellipsis} ${s.soft}`} role="cell">{row.handoff}</span>
                  <span role="cell"><span className={`${s.pill} ${TONE[row.tone]}`}><span className={s.pillDot} aria-hidden="true" />{row.status}</span></span>
                  <span className={s.lrDate} role="cell">{row.date}</span>
                </button>
              )
            })}
          </div>
        )}

        {node && panel ? (
          <aside className={s.panel} aria-label={node.full}>
            <div className={s.panelHead}>
              <div className={s.panelTop}>
                <span className={`${s.panelLane} ${LANE[laneOf(node.lane)?.tone ?? 'none']}`}>{laneOf(node.lane)?.name}</span>
                <span className={s.grow} />
                <button type="button" className={s.panelX} aria-label="Close the station" onClick={() => setSel(null)}>×</button>
              </div>
              <div className={s.panelTitle}>{node.full}</div>
              <span className={`${s.pill} ${TONE[node.tone]}`}><span className={s.pillDot} aria-hidden="true" />{node.status}</span>
            </div>
            <div className={s.facts}>
              {panel.facts.map(([k, v]) => <div key={k} className={s.fact}><span className={s.factK}>{k}</span><span>{v}</span></div>)}
            </div>
            <div className={s.panelSec}>
              <div className={s.panelHd}>Attachments</div>
              {panel.files.length ? panel.files.map(f => (
                <a key={f.href} href={f.href} target="_blank" rel="noopener noreferrer" className={s.file}><span aria-hidden="true">📎</span><span className={s.ellipsis}>{f.name}</span></a>
              )) : <div className={s.none}>No attachments</div>}
            </div>
            <div className={s.panelSec}>
              <div className={s.panelHd}>Versions</div>
              {panel.versions.length ? panel.versions.map(v => (
                <div key={v.v} className={s.ver}><span className={s.verV}>{v.v}</span><span>{v.t}</span></div>
              )) : <div className={s.none}>No versions yet</div>}
            </div>
            <div className={`${s.panelSec} ${s.panelLast}`}>
              <div className={s.panelHd}>Audit · this station</div>
              {panel.audit.length ? panel.audit.map((a, i) => (
                <div key={i} className={s.aud}><span className={s.audT}>{a.t}</span><span>{a.e}</span></div>
              )) : <div className={s.none}>Nothing yet</div>}
            </div>
          </aside>
        ) : null}
      </div>

      {replay ? (
        <div className={s.replay}>
          <div className={s.replayTop}>
            <button type="button" className={s.play} onClick={() => {
              if (playing) { setPlaying(false); return }
              if (step >= map.steps.length) setStep(0)
              setPlaying(true)
            }}>
              <span className={s.playIcon} aria-hidden="true">{playing ? '❚❚' : '▶'}</span>{playing ? 'Pause' : step >= map.steps.length ? 'Replay' : 'Play'}
            </button>
            <div className={s.caption} key={step}>
              <span className={s.capT}>{last?.t ?? map.steps[0]?.t ?? ''}</span>
              <span className={s.capText}>{last?.text ?? 'Start'}</span>
              <span className={s.capStep}>{step} / {map.steps.length}</span>
            </div>
          </div>
          <div className={s.scrub}>
            <input type="range" min={0} max={map.steps.length} step={1} value={step} aria-label="Replay step"
              onChange={e => { setPlaying(false); setStep(+e.target.value) }} />
            <div className={s.ticks}>
              {[null, ...map.steps].map((_, i) => (
                <button key={i} type="button" className={`${s.tick}${i <= step ? ` ${s.tickOn}` : ''}${i === step ? ` ${s.tickNow}` : ''}`}
                  style={{ left: `${map.steps.length ? (i / map.steps.length) * 100 : 0}%` } as CSSProperties}
                  aria-label={i === 0 ? 'Start' : `Step ${i}`} onClick={() => { setPlaying(false); setStep(i) }}>
                  <span className={s.tickDot} aria-hidden="true" />
                  {i === 0 ? <span className={s.tickLabel}>Start</span> : ticks[i - 1] ? <span className={s.tickLabel}>{ticks[i - 1]}</span> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** A tick's label: its day where the day changes — none when they would crowd (more than 12 days). */
function tickLabels(times: readonly string[]): (string | null)[] {
  const days = times.map(t => t.split(' ').slice(0, 2).join(' '))
  const out = days.map((d, i) => (i === 0 || d !== days[i - 1] ? d : null))
  return out.filter(Boolean).length > 12 ? out.map(() => null) : out
}
