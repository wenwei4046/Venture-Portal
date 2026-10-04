"use client";

import { bedframeKey, tierLabel } from "@/lib/member/catalog";
import type { FrameChoices } from "@/lib/member/build";
import type { BedframeBuild, OptionCharge } from "@/lib/member/types";
import { valueKey } from "@/lib/catalogue/keys";
import { ICON, Svg } from "../icons";
import { rm } from "../format";
import {
  SIZES, accAt, accOrder, firstFrame, frameBuildFor, frameBuildMeta, frameMeta, layoutFits, layoutKey, liveFrames, sheetLines, sizeLabel, sofaPick, sofaSeats, sofaText,
  type BfPick, type CartLine, type QCatalog, type QuoteMemory, type RecentFrame, type SheetState, type SizeKey,
} from "./quote-model";
import s from "./quote.module.css";

const HISTORY = "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2";
const PENCIL = "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z";
const PLUS = "M12 5v14M5 12h14";
const CLOSE = "m6 6 12 12M6 18 18 6";
const X = "M6 6l12 12M18 6 6 18";
/** The accessories a sheet lists before *Show all*. */
const ACC_FIRST = 5;

export interface ProductSheetActions {
  close: () => void;
  patch: (p: Partial<SheetState>) => void;
  patchFrame: (p: Partial<BfPick & { drop: boolean }>) => void;
  openBf: () => void;
  editBf: (i: number) => void;
  removeBf: (i: number) => void;
  backToMattress: () => void;
  applyFrame: (r: RecentFrame) => void;
  add: () => void;
}

/** The product sheet — mattress, sofa, bed frame only, accessories only (1864–2038). */
export default function ProductSheet({ sheet, catalog, memory, cart, build, readOnly, actions }: {
  sheet: SheetState | null;
  catalog: QCatalog;
  memory: QuoteMemory;
  cart: CartLine[];
  build: { height: string | null; tier: string | null };
  readOnly: boolean;
  actions: ProductSheetActions;
}) {
  if (!sheet) return null;
  const a = actions;
  const model = sheet.mode === "model" || sheet.mode === "sofa" ? catalog.models.find(m => m.key === sheet.key) : undefined;
  const inF = sheet.mode === "model" && !!sheet.fx;
  /** The bed frame being chosen: inside a mattress, or the frame-only sheet itself. */
  const fv = sheet.mode === "frame" ? sheet : sheet.mode === "model" && sheet.fx ? sheet.fx : null;
  const lines = sheetLines(sheet, catalog);
  const pick = sheet.mode === "sofa" ? sofaPick(sheet, catalog, cart, build) : null;
  const brandUp = catalog.name.toUpperCase();
  const eyebrow = `${brandUp} · ${inF ? "BED FRAME FOR THIS MATTRESS" : sheet.mode === "sofa" ? "SOFA" : sheet.mode === "model" ? "MATTRESS" : sheet.mode === "frame" ? "BED FRAME" : "ACCESSORIES"}`;
  const title = inF ? "Add bed frame" : model ? model.name : sheet.mode === "frame" ? "Bed frame only" : "Accessories only";
  const hasKpi = catalog.kpis.length > 0;

  // ── the footer ──
  const qty = fv && inF ? fv.qty : sheet.mode === "acc" ? 1 : sheet.qty;
  const setQty = (n: number) => (inF ? a.patchFrame({ qty: n }) : a.patch({ qty: n }));
  let addText: string;
  let addOn: boolean;
  if (readOnly) { addText = "Read-only while viewing as"; addOn = false; }
  else if (inF && sheet.mode === "model" && sheet.fx) {
    addOn = !!sheet.fx.frame;
    addText = !sheet.fx.frame ? "No bed frame in this size" : sheet.fx.idx >= 0 ? "Save bed frame" : qty > 1 ? `Add ${qty} bed frames` : "Add bed frame";
  } else if (pick?.clash) { addText = "No seat height fits these modules"; addOn = false; }
  else if (!lines.length) { addText = "Choose something to add"; addOn = false; }
  else { addText = qty > 1 ? `Add ${qty} sets to cart` : "Add to cart"; addOn = true; }
  const showPkg = !inF && (sheet.mode === "model" || sheet.mode === "sofa") && (sheet.qty > 1 || (sheet.mode === "model" && sheet.bfs.length > 0));
  const sets = sheet.mode === "model" || sheet.mode === "sofa" ? sheet.qty : 1;
  const kpiQty = lines.filter(l => l.kind === "kpi").reduce((n, l) => n + l.qty, 0);
  const pkgParts = [...lines.filter(l => l.kind !== "kpi").map(l => `${l.qty} ${l.name}`), ...(kpiQty ? [`${kpiQty} KPI item${kpiQty > 1 ? "s" : ""}`] : [])];

  return (
    <div className={s.psLayer}>
      <div className={s.psDim} onClick={a.close} />
      {fv && <FramePicker fv={fv} catalog={catalog} onPick={key => a.patchFrame({ frame: key, drop: false })} onClose={() => a.patchFrame({ drop: false })} />}
      <div className={s.psPanel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={s.psHandle} />
        <div className={s.psHead}>
          <div className={s.psHeadText}>
            {inF && <button className={s.psBack} onClick={a.backToMattress}><Svg d={ICON.chevronLeft} size={18} sw={2} />{model?.name ?? "Back"}</button>}
            <p className={s.psEyebrow}>{eyebrow}</p>
            <h2 className={s.psTitle}>{title}</h2>
            <p className={s.psSub}>Counts in {catalog.name}&apos;s margin</p>
          </div>
          <button className={s.psClose} aria-label="Close" onClick={a.close}><Svg d={CLOSE} size={18} sw={1.9} /></button>
        </div>
        <div className={s.psBody} data-sheet-body>
          {sheet.mode === "sofa" && model && pick && <SofaSections sheet={sheet} catalog={catalog} memory={memory} pick={pick} hasKpi={hasKpi} onPatch={a.patch} />}
          {fv && <FrameSections fv={fv} catalog={catalog} memory={memory} brandName={catalog.name} onPatch={a.patchFrame} onRecent={a.applyFrame} hasKpi={hasKpi} />}
          {sheet.mode === "model" && !inF && model && (
            <>
              <div>
                <p className={s.secLabel}>1 · Size</p>
                <SizeChips sizes={sizeKeys(model.sizes)} has={k => !!model.sizes[k]} value={sheet.size} onPick={size => a.patch({ size })} />
              </div>
              <BedFrames bfs={sheet.bfs} catalog={catalog} onAdd={a.openBf} onEdit={a.editBf} onRemove={a.removeBf} />
              <AccSection title="3 · Accessories" catalog={catalog} memory={memory} picked={sheet.acc} size={sheet.size} all={sheet.accAll}
                onAll={() => a.patch({ accAll: !sheet.accAll })} onSet={acc => a.patch({ acc })} />
            </>
          )}
          {sheet.mode === "acc" && (
            <>
              {catalog.accs.some(x => Object.keys(x.sizes).length > 0) && (
                <div>
                  <p className={s.secLabel}>Size</p>
                  <SizeChips sizes={SIZES.map(z => z.key)} has={() => true} value={sheet.size} onPick={size => a.patch({ size })} />
                </div>
              )}
              <AccSection title="Accessories" catalog={catalog} memory={memory} picked={sheet.acc} size={sheet.size} all={sheet.accAll}
                onAll={() => a.patch({ accAll: !sheet.accAll })} onSet={acc => a.patch({ acc })} />
            </>
          )}
        </div>
        <div className={s.psFoot}>
          {showPkg && <p className={s.pkg}><strong className={s.pkgHead}>{sets > 1 ? `${sets} sets =` : "This set:"}</strong> {pkgParts.join(" · ")}</p>}
          <div className={s.footRow}>
            {sheet.mode !== "acc" && (
              <div className={s.qtyBig}>
                <button className={s.qtyBigBtn} aria-label="Less" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <span className={s.qtyBigNum}>{qty}</span>
                <button className={s.qtyBigBtn} aria-label="More" onClick={() => setQty(Math.min(20, qty + 1))}>+</button>
              </div>
            )}
            <button className={`${s.addBtn} ${addOn ? "" : s.addBtnOff}`} onClick={addOn ? a.add : undefined} aria-disabled={!addOn}>{addText}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The four bed sizes, and Super King when something here comes in it. */
function sizeKeys(...held: Partial<Record<SizeKey, string>>[]): SizeKey[] {
  return [...SIZES.map(z => z.key), ...(held.some(h => h.SK) ? ["SK" as SizeKey] : [])];
}

function SizeChips({ sizes, has, value, onPick }: { sizes: SizeKey[]; has: (k: SizeKey) => boolean; value: SizeKey; onPick: (k: SizeKey) => void }) {
  return (
    <div className={s.chips}>
      {sizes.map(k => {
        const ok = has(k);
        return (
          <button key={k} className={`${s.chip} ${k === value ? s.chipOn : ""} ${ok ? "" : s.chipOff}`} disabled={!ok} onClick={() => onPick(k)}>
            <span className={s.chipLabel}>{sizeLabel(k)}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecentOpt({ label, on, onUse }: { label: string; on: boolean; onUse: () => void }) {
  return (
    <div className={`${s.ropt} ${on ? s.roptOn : ""}`}>
      <button className={s.roptMain} onClick={onUse}>
        <Svg d={HISTORY} size={17} sw={1.9} stroke="var(--rv-accent)" className={s.roptIcon} />
        <span className={s.roptLabel}>{label}</span>
      </button>
      <button className={`${s.roptUse} ${on ? s.roptUseOn : ""}`} onClick={onUse}>{on ? "Applied" : "Use"}</button>
    </div>
  );
}

/** Size, model and KPI items of a bed frame — on its own, or for the mattress being quoted. */
function FrameSections({ fv, catalog, memory, brandName, hasKpi, onPatch, onRecent }: {
  fv: BfPick & { drop: boolean };
  catalog: QCatalog;
  memory: QuoteMemory;
  brandName: string;
  hasKpi: boolean;
  onPatch: (p: Partial<BfPick & { drop: boolean }>) => void;
  onRecent: (r: RecentFrame) => void;
}) {
  const recent = liveFrames(memory, catalog);
  const frame = catalog.frames.find(f => f.key === fv.frame && f.sizes[fv.size]);
  const onSize = (size: SizeKey) => onPatch({ size, frame: catalog.frames.some(f => f.key === fv.frame && f.sizes[size]) ? fv.frame : firstFrame(catalog, size) });
  const kpiTotal = catalog.kpis.filter(k => fv.kpi.includes(k.key)).reduce((n, k) => n + k.price, 0);
  // The frame's own divan, leg, gap and total height (FOC or charged) and specials, numbered after the model.
  const build = frame ? frameBuildFor(frame.choices, fv.build) : undefined;
  const optionRows = frame ? frameOptionRows(frame.choices) : [];
  const kpiNo = 3 + optionRows.length + (frame && frame.choices.specials.length ? 1 : 0);
  return (
    <>
      {recent.length > 0 && (
        <div>
          <p className={s.capsHead}>LAST USED · TAP USE, THEN SET THE QUANTITY BELOW</p>
          <div className={s.recentOpts}>
            {recent.map((r, i) => (
              <RecentOpt key={i} label={frameMeta(r, catalog)} on={r.size === fv.size && r.frame === fv.frame && r.kpi.join() === fv.kpi.join() && bedframeKey(r.build) === bedframeKey(fv.build)} onUse={() => onRecent(r)} />
            ))}
          </div>
        </div>
      )}
      <div>
        <p className={s.secLabel}>1 · Size</p>
        <SizeChips sizes={sizeKeys(...catalog.frames.map(f => f.sizes))} has={k => catalog.frames.some(f => f.sizes[k])} value={fv.size} onPick={onSize} />
      </div>
      <div>
        <div className={s.rowHead}><p className={s.rowHeadTitle}>2 · Model</p><span className={s.rowHeadCap}>{sizeLabel(fv.size)} · {brandName} margin</span></div>
        <div className={s.drop}>
          <button className={`${s.dropBtn} ${fv.drop ? s.dropBtnOpen : ""}`} onClick={() => onPatch({ drop: !fv.drop })}>
            <span className={s.dropSel}>{frame ? frame.name : <span className={s.dropEmpty}>No bed frame in {sizeLabel(fv.size)}</span>}</span>
            <Svg d={ICON.chevronDown} size={18} sw={2} stroke="var(--rv-accent)" className={`${s.dropChev} ${fv.drop ? s.dropChevOpen : ""}`} />
          </button>
        </div>
      </div>
      {frame && <FrameOptions rows={optionRows} specials={frame.choices.specials} build={build} start={3} onBuild={next => onPatch({ build: next })} />}
      {hasKpi && (
        <div>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{kpiNo} · KPI items</p><span className={s.rowHeadCap}>Fixed price · not in margin</span></div>
          {catalog.kpis.map(k => {
            const on = fv.kpi.includes(k.key);
            return (
              <button key={k.key} className={s.kpiRow} onClick={() => onPatch({ kpi: on ? fv.kpi.filter(x => x !== k.key) : [...fv.kpi, k.key] })}>
                <span className={`${s.box} ${on ? s.boxOn : ""}`}><Svg d={ICON.tick} size={14} sw={3} className={s.boxTick} /></span>
                <span className={s.kpiName}>{k.name}</span>
                <span className={s.kpiPrice}>{rm(k.price)}</span>
              </button>
            );
          })}
          <p className={s.kpiNote}>{fv.kpi.length
            ? `${fv.kpi.length} ticked · ${rm(kpiTotal)} is added on top of your selling price and does not change the margin.`
            : "KPI items are added on top of your selling price and do not change the margin."}</p>
        </div>
      )}
    </>
  );
}

type OptionRow = { key: "divan" | "leg" | "gap" | "total"; title: string; list: OptionCharge[] };

/** The divan, leg, gap and total height a frame may be CHARGED for — a row only where Maintenance charges something. */
function frameOptionRows(c: FrameChoices): OptionRow[] {
  const rows: OptionRow[] = [
    { key: "divan", title: "Divan height", list: c.divans },
    { key: "leg", title: "Leg height", list: c.legs },
    { key: "gap", title: "Gap", list: c.gaps },
    { key: "total", title: "Total height", list: c.totals },
  ];
  return rows.filter(r => r.list.length > 0);
}

/**
 * A bed frame's divan, leg, gap and total height — FOC, or an option charged on top of the
 * price, out of the margin — and its specials (user 2026-10-04: "only show a
 * FOC 1 option and other with charges option").
 */
function FrameOptions({ rows, specials, build, start, onBuild }: {
  rows: OptionRow[];
  specials: string[];
  build: BedframeBuild | undefined;
  start: number;
  onBuild: (build: BedframeBuild | undefined) => void;
}) {
  const write = (next: BedframeBuild) => onBuild(Object.keys(next).length ? next : undefined);
  const set = (key: OptionRow["key"], value: string | undefined) => {
    const next: BedframeBuild = { ...(build ?? {}) };
    if (value) next[key] = value;
    else delete next[key];
    write(next);
  };
  const picked = build?.specials ?? [];
  const toggle = (sp: string) => {
    const on = picked.some(x => valueKey(x) === valueKey(sp));
    const list = on ? picked.filter(x => valueKey(x) !== valueKey(sp)) : [...picked, sp];
    const next: BedframeBuild = { ...(build ?? {}) };
    if (list.length) next.specials = list;
    else delete next.specials;
    write(next);
  };
  let n = start - 1;
  return (
    <>
      {rows.map(r => (
        <div key={r.key}>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{++n} · {r.title}</p><span className={s.rowHeadCap}>Charged on top · not in margin</span></div>
          <div className={s.chips} style={{ marginTop: 6 }}>
            <button className={`${s.chip} ${!build?.[r.key] ? s.chipOn : ""}`} onClick={() => set(r.key, undefined)}>
              <span className={s.chipLabel}>FOC</span><span className={s.chipSub}>Free of charge</span>
            </button>
            {r.list.map(o => (
              <button key={o.value} className={`${s.chip} ${valueKey(build?.[r.key]) === valueKey(o.value) ? s.chipOn : ""}`} onClick={() => set(r.key, o.value)}>
                <span className={s.chipLabel}>{o.value}</span><span className={s.chipSub}>+ {rm(o.charge)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {specials.length > 0 && (
        <div>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{++n} · Specials</p><span className={s.rowHeadCap}>Optional</span></div>
          <div className={s.chips} style={{ marginTop: 6 }}>
            {specials.map(sp => (
              <button key={sp} className={`${s.chip} ${picked.some(x => valueKey(x) === valueKey(sp)) ? s.chipOn : ""}`} onClick={() => toggle(sp)}>
                <span className={s.chipLabel}>{sp}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** *Choose bed frame* — the dropdown's list, as a sheet of its own (`frame-drop-style="b"`). */
function FramePicker({ fv, catalog, onPick, onClose }: { fv: BfPick & { drop: boolean }; catalog: QCatalog; onPick: (key: string) => void; onClose: () => void }) {
  const frames = catalog.frames.filter(f => f.sizes[fv.size]);
  return (
    <div className={`${s.pickLayer} ${fv.drop ? s.pickLayerOpen : ""}`} aria-hidden={!fv.drop}>
      <div className={s.pickDim} onClick={onClose} />
      <div className={s.pickPanel} role="dialog" aria-label="Choose bed frame" inert={!fv.drop}>
        <div className={s.pickHandle} />
        <div className={s.pickHead}>
          <button className={s.pickBack} onClick={onClose}><Svg d={ICON.chevronLeft} size={20} sw={2} />Back</button>
          <h2 className={s.pickTitle}>Choose bed frame</h2>
          <span className={s.pickCount}>{frames.length} model{frames.length === 1 ? "" : "s"}</span>
        </div>
        <div className={s.pickList}>
          {frames.map(f => {
            const on = fv.frame === f.key;
            return (
              <button key={f.key} className={s.radioRow} onClick={() => onPick(f.key)}>
                <span className={`${s.radio} ${on ? s.radioOn : ""}`}><span className={s.radioDot} /></span>
                <span className={s.radioName}>{f.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** *2 · Bed frame* inside a mattress: add one, or the ones already chosen. */
function BedFrames({ bfs, catalog, onAdd, onEdit, onRemove }: {
  bfs: BfPick[]; catalog: QCatalog; onAdd: () => void; onEdit: (i: number) => void; onRemove: (i: number) => void;
}) {
  if (!catalog.frames.length) return null;
  return (
    <div>
      <div className={s.bfHead}>
        <p className={s.rowHeadTitle}>2 · Bed frame</p>
        {bfs.length ? (
          <button className={s.bfPlus} aria-label="Add another bed frame" onClick={onAdd}><Svg d={PLUS} size={15} sw={2.4} /></button>
        ) : <span className={s.bfOptional}>Optional</span>}
      </div>
      {bfs.length ? (
        <div className={s.bfList}>
          {bfs.map((b, i) => {
            const frame = catalog.frames.find(f => f.key === b.frame);
            const kpi = catalog.kpis.length ? [b.kpi.length ? `${b.kpi.length} KPI item${b.kpi.length > 1 ? "s" : ""}` : "No KPI items"] : [];
            const opts = frame ? frameBuildMeta(frame.choices, frameBuildFor(frame.choices, b.build)) : "";
            return (
              <div key={i} className={s.bfRow}>
                <button className={s.bfMain} onClick={() => onEdit(i)}>
                  <span className={s.bfName}>{frame?.name ?? "Bed frame"}</span>
                  <span className={s.bfMeta}>{[sizeLabel(b.size), ...(opts ? [opts] : []), ...kpi, `×${b.qty}`].join(" · ")}</span>
                </button>
                <button className={s.bfEdit} onClick={() => onEdit(i)}>Edit</button>
                <button className={s.bfX} aria-label="Remove bed frame" onClick={() => onRemove(i)}><Svg d={X} size={16} sw={2} /></button>
              </div>
            );
          })}
        </div>
      ) : (
        <button className={s.bfAdd} onClick={onAdd}>
          <span className={s.bfAddIcon}><Svg d={PLUS} size={16} sw={2.4} /></span>
          <span className={s.bfAddText}>
            <span className={s.bfAddName}>Add bed frame</span>
            <span className={s.bfAddSub}>{catalog.kpis.length ? "Size, model, KPI items and quantity" : "Size, model and quantity"}</span>
          </span>
          <Svg d={ICON.chevronRight} size={16} sw={1.9} stroke="var(--rv-sub)" />
        </button>
      )}
    </div>
  );
}

function AccSection({ title, catalog, memory, picked, size, all, onAll, onSet }: {
  title: string;
  catalog: QCatalog;
  memory: QuoteMemory;
  picked: Record<string, number>;
  size: SizeKey;
  all: boolean;
  onAll: () => void;
  onSet: (acc: Record<string, number>) => void;
}) {
  const rows = accOrder(catalog, memory, picked).map(acc => ({ acc, at: accAt(acc, size) })).filter(r => r.at);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, Math.max(ACC_FIRST, rows.filter(r => (picked[r.acc.key] ?? 0) > 0).length));
  return (
    <div>
      <div className={s.rowHead}><p className={s.rowHeadTitle}>{title}</p><span className={s.rowHeadCap}>Optional</span></div>
      {shown.map(({ acc, at }) => {
        const n = picked[acc.key] ?? 0;
        return (
          <div key={acc.key} className={s.accRow}>
            <div className={s.accText}>
              <span className={s.accName}>{acc.name}</span>
              <span className={s.accSize}>{at?.size ? sizeLabel(at.size) : ""}</span>
            </div>
            <div className={`${s.accStep} ${n ? s.accStepOn : ""}`}>
              <button className={s.accBtn} aria-label="Remove one" onClick={() => n && onSet({ ...picked, [acc.key]: n - 1 })}>−</button>
              <span className={s.accQty}>{n}</span>
              <button className={s.accBtn} aria-label="Add one" onClick={() => onSet({ ...picked, [acc.key]: n + 1 })}>+</button>
            </div>
          </div>
        );
      })}
      {rows.length > shown.length || all ? (
        <button className={s.more} onClick={onAll}>
          {all ? "Show fewer" : `Show all ${rows.length} accessories`}
          <Svg d={ICON.chevronDown} size={18} sw={2} className={`${s.dropChev} ${all ? s.dropChevOpen : ""}`} />
        </button>
      ) : null}
    </div>
  );
}

function SofaSections({ sheet, catalog, memory, pick, hasKpi, onPatch }: {
  sheet: Extract<SheetState, { mode: "sofa" }>;
  catalog: QCatalog;
  memory: QuoteMemory;
  pick: ReturnType<typeof sofaPick>;
  hasKpi: boolean;
  onPatch: (p: Partial<SheetState>) => void;
}) {
  const model = catalog.models.find(m => m.key === sheet.key)!;
  const mods = sheet.mods;
  const layouts = (memory.layouts[catalog.brand] ?? []).filter(m => layoutFits(model, m));
  const setMods = (next: Record<string, number>) => {
    const i = layouts.findIndex(m => layoutKey(m) === layoutKey(next));
    onPatch({ mods: next, layout: i >= 0 ? `R${i}` : "C" });
  };
  const blocks = model.modules.flatMap(x => Array.from({ length: mods[x.code] ?? 0 }, (_, i) => ({ key: `${x.code}-${i}`, code: x.code, flex: Math.max(1, x.seats) + (x.chaise ? 0.6 : 0) })));
  const seats = sofaSeats(model.modules, mods);
  const rows = [...layouts.map((m, i) => ({ k: `R${i}`, label: `${sofaSeats(model.modules, m)} seats`, sub: sofaText(model.modules, m), mods: m })),
    { k: "C", label: "Custom", sub: "Build from the modules below", mods: {} as Record<string, number> }];
  let n = 2;
  const graded = pick.graded;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div className={s.sofaCard}>
        <div className={s.blocks}>
          {blocks.map(b => <span key={b.key} className={s.block} style={{ flex: b.flex }}>{b.code}</span>)}
        </div>
        <div className={s.sofaSum}>
          <span className={s.sofaText}>{sofaText(model.modules, mods) || "No modules yet"}</span>
          <span className={s.sofaSeats}>{seats ? `${seats} seats` : ""}</span>
        </div>
      </div>
      <div>
        <p className={s.capsHead}>1 · LAST USED · TAP USE, OR BUILD A CUSTOM ONE</p>
        <div className={s.recentOpts}>
          {rows.map(l => {
            const on = sheet.layout === l.k;
            return (
              <div key={l.k} className={`${s.ropt} ${on ? s.roptOn : ""}`}>
                <Svg d={l.k === "C" ? PENCIL : HISTORY} size={17} sw={1.9} stroke="var(--rv-accent)" className={s.roptIcon} />
                <span className={s.roptText}><span className={s.roptName}>{l.label}</span><span className={s.roptSub}>{l.sub}</span></span>
                <button className={`${s.roptUse} ${on ? s.roptUseOn : ""}`} onClick={() => onPatch({ layout: l.k, mods: { ...l.mods } })}>
                  {on ? (l.k === "C" ? "Editing" : "Applied") : "Use"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className={s.rowHead}><p className={s.rowHeadTitle}>2 · Modules</p><span className={s.rowHeadCap}>Adjust to build any shape</span></div>
        {model.modules.map(x => {
          const q = mods[x.code] ?? 0;
          return (
            <div key={x.code} className={s.modRow}>
              <span className={`${s.modCode} ${q ? s.modCodeOn : ""}`}>{x.code}</span>
              <span className={s.modDesc}>{x.desc}</span>
              <div className={s.stepper3}>
                <button className={s.stepBtn} aria-label="Less" onClick={() => q && setMods({ ...mods, [x.code]: q - 1 })}>−</button>
                <span className={s.stepQty}>{q}</span>
                <button className={s.stepBtn} aria-label="More" onClick={() => setMods({ ...mods, [x.code]: q + 1 })}>+</button>
              </div>
            </div>
          );
        })}
      </div>
      {graded && (
        <div>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{++n} · Seat height</p><span className={s.rowHeadCap}>For every sofa in this quote</span></div>
          <div className={s.chips} style={{ marginTop: 6 }}>
            {pick.heights.map(h => (
              <button key={h} className={`${s.chip} ${h === pick.height ? s.chipOn : ""}`} onClick={() => onPatch({ height: h })}>
                <span className={s.chipLabel}>{h}</span>
              </button>
            ))}
          </div>
          {pick.clash && <p className={s.clash}>No seat height costs every module chosen. Change the modules.</p>}
        </div>
      )}
      {graded && pick.tiers.length > 0 && (
        <div>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{++n} · Fabric</p><span className={s.rowHeadCap}>Price tier</span></div>
          <div className={s.chips} style={{ marginTop: 6 }}>
            {pick.tiers.map(t => (
              <button key={t} className={`${s.chip} ${t === pick.tier ? s.chipOn : ""}`} onClick={() => onPatch({ tier: t })}>
                <span className={s.chipLabel}>{tierLabel(t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {hasKpi && (
        <div>
          <div className={s.rowHead}><p className={s.rowHeadTitle}>{++n} · KPI items</p><span className={s.rowHeadCap}>Fixed price · not in margin</span></div>
          {catalog.kpis.map(k => {
            const on = sheet.kpi.includes(k.key);
            return (
              <button key={k.key} className={s.kpiRow} onClick={() => onPatch({ kpi: on ? sheet.kpi.filter(x => x !== k.key) : [...sheet.kpi, k.key] })}>
                <span className={`${s.box} ${on ? s.boxOn : ""}`}><Svg d={ICON.tick} size={14} sw={3} className={s.boxTick} /></span>
                <span className={s.kpiName}>{k.name}</span>
                <span className={s.kpiPrice}>{rm(k.price)}</span>
              </button>
            );
          })}
          <p className={s.kpiNote}>{sheet.kpi.length
            ? `${sheet.kpi.length} ticked · ${rm(catalog.kpis.filter(k => sheet.kpi.includes(k.key)).reduce((t, k) => t + k.price, 0))} is added on top of your selling price and does not change the margin.`
            : "KPI items are added on top of your selling price and do not change the margin."}</p>
        </div>
      )}
    </div>
  );
}
