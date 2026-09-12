"use client";

/**
 * My team, as a map.
 *
 * The tab used to draw the caller's own branch as an indented list, which
 * answers "who reports to me" and nothing else. The portal's Revenue chart
 * draws a department as a map — a frame per sub-department, the heads above
 * it, a card per membership, a line per reporting relationship — and the user
 * asked for the same thing in the member app, with every department visible
 * rather than only their own branch.
 *
 * It shares the portal chart's layout (`layoutTree`, the same tidy-tree that
 * places the Revenue and People charts) so the three cannot disagree about
 * who stands under whom, and its own presentation, because this is a phone.
 *
 * One node per MEMBERSHIP, not per person: somebody in Fair and IR stands in
 * both frames, under a different upline and a different title in each. Tapping
 * either card offers the other.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NODE_HEIGHT, NODE_WIDTH } from "@/lib/org-layout";
import { headsLabel } from "@/lib/department-heads";
import { placeMap, type PlacedCard } from "@/lib/member/org-map-layout";
import type { MemberOrgMap } from "@/lib/member/types";
import { Empty, Icon, Pill, initials } from "./MemberUI";
import s from "./member.module.css";

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.3;
/** Movement, in CSS pixels, that turns a tap into a pan. */
const DRAG_SLOP = 5;

export default function MemberOrgMap({
  map,
  busy,
  error,
  search,
  onRefresh,
  onDialog,
}: {
  map: MemberOrgMap | null;
  busy: boolean;
  error: string | null;
  search: string;
  onRefresh: () => void;
  onDialog: (dialog: { title: string; content: ReactNode }) => void;
}) {
  const [scale, setScale] = useState(0.72);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const panned = useRef(false);

  const placed = useMemo(() => (map ? placeMap(map) : null), [map]);
  const query = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      query && placed
        ? new Set(
            placed.cards
              .filter((c) =>
                (c.person?.name ?? c.director?.name ?? "").toLowerCase().includes(query),
              )
              .map((c) => c.key),
          )
        : null,
    [placed, query],
  );

  const centreOn = useCallback(
    (key: string) => {
      const card = placed?.cards.find((c) => c.key === key);
      const box = viewport.current?.getBoundingClientRect();
      if (!card || !box) return;
      setOrigin({
        x: box.width / 2 - (card.x + NODE_WIDTH / 2) * scale,
        y: box.height / 2 - (card.y + NODE_HEIGHT / 2) * scale,
      });
    },
    [placed, scale],
  );

  // Open on the caller, so the map answers "where am I" before anything else.
  // The viewport's height comes from CSS, so this waits for a painted frame
  // rather than measuring a box that is still zero and parking them off-screen.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || !placed) return;
    const me = placed.cards.find((c) => c.person?.self) ?? placed.cards[0];
    if (!me) return;
    let frame = 0;
    const attempt = (tries: number) => {
      const box = viewport.current?.getBoundingClientRect();
      if (!box?.height) {
        if (tries > 0) frame = requestAnimationFrame(() => attempt(tries - 1));
        return;
      }
      settled.current = true;
      centreOn(me.key);
    };
    frame = requestAnimationFrame(() => attempt(10));
    return () => cancelAnimationFrame(frame);
  }, [placed, centreOn]);

  useEffect(() => {
    if (!matches?.size || !placed) return;
    const first = placed.cards.find((c) => matches.has(c.key));
    if (first) centreOn(first.key);
  }, [matches, placed, centreOn]);

  // Pointer capture is taken only once a pan actually begins. Capturing on
  // pointerdown sends the pointerup to the canvas instead of the card under
  // the finger, and a map whose cards cannot be tapped is half a map.
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    drag.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    if (!active.moved) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.current = { ...active, x: event.clientX, y: event.clientY, moved: true };
    setOrigin((o) => ({ x: o.x + dx, y: o.y + dy }));
  }
  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    // A card's click fires after this, so remember a pan for exactly one click.
    panned.current = drag.current.moved;
    drag.current = null;
  }

  function zoom(by: number) {
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number((current + by).toFixed(2)))));
  }

  function open(card: PlacedCard) {
    if (panned.current) {
      panned.current = false;
      return;
    }
    if (card.director) {
      onDialog({
        title: card.director.name,
        content: (
          <div className={s.stack}>
            <p className={s.sub}>
              Heads this department. A director is above the ladder: no rank, no
              commission override — the line to them is reporting only.
            </p>
          </div>
        ),
      });
      return;
    }
    const person = card.person!;
    const department = map?.departments.find((d) => d.id === person.departmentId);
    const upline = map?.people.find((p) => p.id === person.parentId);
    const reports = map?.people.filter((p) => p.parentId === person.id) ?? [];
    const elsewhere =
      map?.people.filter((p) => p.staffId === person.staffId && p.id !== person.id) ?? [];
    onDialog({
      title: person.name,
      content: (
        <div className={s.stack}>
          <dl className={s.dl}>
            <dt>Department</dt>
            <dd>{department?.name ?? "—"}</dd>
            <dt>Title here</dt>
            <dd>{person.title}</dd>
            <dt>Reports to</dt>
            <dd>
              {upline?.name ??
                (department?.directors.length
                  ? `${headsLabel(department.directors)} (department head)`
                  : "Top of this tree")}
            </dd>
            <dt>Direct reports</dt>
            <dd>{reports.length || "None"}</dd>
            {person.code && (
              <>
                <dt>Staff code</dt>
                <dd>{person.code}</dd>
              </>
            )}
          </dl>
          {elsewhere.length > 0 && (
            <>
              <h3>Also in</h3>
              {elsewhere.map((other) => (
                <div className={s.listRow} key={other.id}>
                  <span>
                    {map?.departments.find((d) => d.id === other.departmentId)?.name ??
                      other.departmentId}
                  </span>
                  <span className={s.sub}>{other.title}</span>
                </div>
              ))}
              <p className={s.caption}>
                A sub-department is a world of its own: the same person can hold a
                different title and a different upline in each.
              </p>
            </>
          )}
          {reports.length > 0 && (
            <>
              <h3>Team members</h3>
              {reports.map((report) => (
                <div className={s.listRow} key={report.id}>
                  <span>{report.name}</span>
                  <span className={s.sub}>{report.title}</span>
                </div>
              ))}
            </>
          )}
          <p className={s.sub}>
            Names, titles and reporting lines only. Salaries, commission and private
            requests stay private.
          </p>
        </div>
      ),
    });
  }

  if (error)
    return (
      <section className={s.card}>
        <Empty title="The team map is unavailable">{error}</Empty>
        <button className={`${s.button} ${s.full}`} onClick={onRefresh} disabled={busy}>
          <Icon name="refresh" size={17} />
          Try again
        </button>
      </section>
    );
  if (!placed || !placed.cards.length)
    return (
      <section className={s.card}>
        <Empty title={busy ? "Drawing the map" : "No one is placed yet"}>
          {busy
            ? "Reading every department's reporting lines."
            : "The map appears once members are placed in a department."}
        </Empty>
      </section>
    );

  return (
    <section className={s.mapCard}>
      <div className={s.mapTools}>
        <div className={s.mapLegend}>
          {map?.departments.map((department) => (
            <Pill key={department.id} tone={department.mine ? "active" : "neutral"}>
              {department.name} ·{" "}
              {map.people.filter((p) => p.departmentId === department.id).length}
            </Pill>
          ))}
        </div>
        <div className={s.mapButtons}>
          <button
            className={s.iconButton}
            onClick={() => zoom(-0.12)}
            aria-label="Zoom out"
            disabled={scale <= MIN_SCALE}
          >
            <Icon name="zoomOut" size={18} />
          </button>
          <button
            className={s.iconButton}
            onClick={() => zoom(0.12)}
            aria-label="Zoom in"
            disabled={scale >= MAX_SCALE}
          >
            <Icon name="zoomIn" size={18} />
          </button>
          <button
            className={s.iconButton}
            onClick={() => {
              const me = placed.cards.find((c) => c.person?.self);
              if (me) centreOn(me.key);
            }}
            aria-label="Centre on me"
          >
            <Icon name="locate" size={18} />
          </button>
        </div>
      </div>
      <div
        className={s.mapViewport}
        ref={viewport}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="application"
        aria-label="Department map. Drag to pan, and use the list below to open a member."
      >
        <div
          className={s.mapCanvas}
          style={{
            transform: `translate(${origin.x}px, ${origin.y}px) scale(${scale})`,
            width: placed.width,
            height: placed.height,
          }}
        >
          {placed.frames.map((frame) => (
            <div
              key={frame.department.id}
              className={`${s.mapFrame} ${frame.department.mine ? s.mapFrameMine : ""}`}
              style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
            >
              <span className={s.mapFrameTitle}>
                {frame.department.name}
                <em>
                  {frame.count} {frame.count === 1 ? "member" : "members"}
                  {frame.department.capacity ? ` / ${frame.department.capacity}` : ""}
                  {frame.department.directors.length
                    ? ` · reports to ${headsLabel(frame.department.directors)}`
                    : ""}
                </em>
              </span>
            </div>
          ))}
          <svg
            className={s.mapLines}
            width={placed.width}
            height={placed.height}
            aria-hidden="true"
          >
            {placed.lines.map((line) => (
              <path
                key={line.key}
                d={`M${line.from.x},${line.from.y} C${line.from.x},${(line.from.y + line.to.y) / 2} ${line.to.x},${(line.from.y + line.to.y) / 2} ${line.to.x},${line.to.y}`}
                className={line.derived ? s.mapLineDerived : s.mapLine}
              />
            ))}
          </svg>
          {placed.cards.map((card) => {
            const name = card.person?.name ?? card.director?.name ?? "";
            const dimmed = matches ? !matches.has(card.key) : false;
            return (
              <button
                key={card.key}
                type="button"
                className={[
                  s.mapNode,
                  card.person?.self ? s.mapNodeSelf : "",
                  card.director ? s.mapNodeHead : "",
                  dimmed ? s.mapNodeDim : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{ left: card.x, top: card.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                onClick={() => open(card)}
              >
                <span className={s.mapAvatar}>{initials(name)}</span>
                <span className={s.mapNodeText}>
                  <strong>{name}</strong>
                  <em>{card.director ? "Department head" : card.person?.title}</em>
                </span>
                {card.person?.self && <span className={s.mapYou}>You</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className={s.caption}>
        Drag to move around, pinch or use the buttons to zoom. Tap anybody to see
        their department, title and reporting line.
      </p>
    </section>
  );
}
