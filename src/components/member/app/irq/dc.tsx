"use client";
// IR Quote (2026-11-05): the little runtime the prototype's templates need. The Claude Design prototypes
// (`.design/ir-quote/design_handoff_ir_quote/*.dc.html`) are a template plus a logic class whose `renderVals()`
// fills the template's holes; `tools/ir-quote/dc-to-tsx.mjs` turns each template into a render function
// (`tpl/*Tpl.tsx`), and `DcHost` below runs a ported logic class the way the prototype's runtime did — its own
// `state`, `setState`, lifecycle — so the screens behave exactly as the prototype, step for step.
import { Component, isValidElement, type ComponentType, type CSSProperties, type ReactNode } from "react";

// The templates read whatever the logic hands them; the prototype's values are untyped by nature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DcVals = Record<string, any>;
export type DcComponents = Record<string, ComponentType<DcVals>>;

/** A text hole: nothing for undefined / null / booleans, an element or a list as it is, anything else as text. */
export function dcText(v: unknown): ReactNode {
  if (v === undefined || v === null || typeof v === "boolean") return null;
  if (isValidElement(v) || Array.isArray(v)) return v as ReactNode;
  // The prototype's runtime wraps every text hole in a span (support.js › walkText) — in a flex row with a gap, the gap
  // falls between the span and the words around it, so the app draws the same span.
  return <span className="sc-interp">{String(v)}</span>;
}
/** A hole inside a longer string. */
export const dcS = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
export const dcList = <T,>(v: T[] | unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const dcValue = (v: unknown) => (v === undefined ? "" : v);
export const dcChecked = (v: unknown) => (v === undefined ? false : v);

const cssCache = new Map<string, CSSProperties>();
/** An inline style with holes, as the prototype's runtime reads it (`cssToObj`). */
export function dcCss(css: string): CSSProperties {
  const hit = cssCache.get(css);
  if (hit) return hit;
  const o: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    o[prop.startsWith("--") ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = decl.slice(i + 1).trim();
  }
  if (cssCache.size > 4000) cssCache.clear();
  cssCache.set(css, o as CSSProperties);
  return o as CSSProperties;
}

const HOST_STYLE_PROPS = new Set(["position", "left", "right", "top", "bottom", "inset", "width", "height", "zIndex", "transform"]);
function hostBox(style: CSSProperties | undefined): CSSProperties | undefined {
  if (!style) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (HOST_STYLE_PROPS.has(k)) out[k] = v;
  return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

type Updater = DcVals | ((s: DcVals) => DcVals | null);

/** The prototype's `DCLogic` (support.js › StreamableLogic): state, setState, the lifecycle, `renderVals()`. */
export class DcLogic<P extends DcVals = DcVals> {
  props: P;
  state: DcVals = {};
  __host: { setLogic: (u: Updater, cb?: () => void) => void; forceUpdate: () => void } | null = null;
  constructor(props: P) {
    this.props = props;
  }
  setState(update: Updater, cb?: () => void) {
    this.__host?.setLogic(update, cb);
  }
  forceUpdate() {
    this.__host?.forceUpdate();
  }
  componentDidMount() {}
  componentDidUpdate(prevProps: P, prevState: DcVals) {
    void prevProps;
    void prevState;
  }
  componentWillUnmount() {}
  renderVals(): DcVals {
    return {};
  }
}

type HostProps<P extends DcVals> = {
  logic: new (props: P) => DcLogic<P>;
  render: (v: DcVals, C: DcComponents) => ReactNode;
  props: P;
  components?: DcComponents;
  /** Positions the host box, as `<dc-import style>` did. */
  hostStyle?: CSSProperties;
};

/** Runs one logic class against its template — the prototype runtime's StreamableComponent, without the editor. */
export class DcHost<P extends DcVals> extends Component<HostProps<P>, { logic: DcVals }> {
  inst: DcLogic<P>;
  constructor(p: HostProps<P>) {
    super(p);
    this.inst = new p.logic(p.props);
    this.state = { logic: this.inst.state };
    this.attach();
  }
  /** Wires the logic to this host — again on every mount: React's StrictMode mounts, unmounts and mounts again. */
  attach() {
    this.inst.__host = {
      setLogic: (u, cb) =>
        this.setState(
          s => {
            const next = typeof u === "function" ? u(s.logic) : u;
            return next == null ? null : { logic: { ...s.logic, ...next } };
          },
          cb,
        ),
      forceUpdate: () => this.forceUpdate(),
    };
  }
  // The prototype's logic mounts once: its timers and first edits are not written to run twice. React's StrictMode
  // (development) unmounts and mounts a component again at once — that pair is absorbed here, so the logic sees one
  // mount, as on the prototype's page; a real unmount still reaches it (a microtask later).
  mounted = false;
  leaving = false;
  componentDidMount() {
    this.attach();
    this.inst.state = this.state.logic;
    if (this.leaving) {
      this.leaving = false;
      return;
    }
    if (this.mounted) return;
    this.mounted = true;
    this.inst.componentDidMount();
  }
  componentDidUpdate(prev: HostProps<P>, prevState: { logic: DcVals }) {
    this.inst.state = this.state.logic;
    if (prev.props !== this.props.props || prevState.logic !== this.state.logic) this.inst.componentDidUpdate(prev.props, prevState.logic);
  }
  componentWillUnmount() {
    this.leaving = true;
    queueMicrotask(() => {
      if (!this.leaving) return;
      this.leaving = false;
      this.mounted = false;
      this.inst.componentWillUnmount();
      this.inst.__host = null;
    });
  }
  render() {
    this.inst.props = this.props.props;
    this.inst.state = this.state.logic;
    const vals = { ...this.props.props, ...(this.inst.renderVals() || {}) };
    // The runtime's host box (support.js › StreamableComponent): a plain block, positioned only by
    // position / inset / width / height / z-index / transform (`hostPositionStyle`).
    return (
      <div className="sc-host" style={hostBox(this.props.hostStyle)}>
        {this.props.render(vals, this.props.components ?? {})}
      </div>
    );
  }
}
