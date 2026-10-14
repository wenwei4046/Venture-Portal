/**
 * The design runtime's logic base class (docs/design_handoff_crm_desktop_v2/prototypes/support.js › StreamableLogic),
 * for the prototype's own script (proto-logic.ts) to run on exactly as it runs in Claude Design: state merged at once
 * (a function updater sees the latest), the host re-renders, a callback runs after. Only DeskProto uses it.
 */
export type ProtoState = Record<string, unknown>;
type Update = Partial<ProtoState> | ((s: ProtoState) => Partial<ProtoState> | null | undefined);

export class DCLogic {
  props: Record<string, unknown>;
  state: ProtoState = {};
  /** Set by the host: re-render, then run `cb`. */
  __rerender: (cb?: () => void) => void = () => {};
  constructor(props?: Record<string, unknown>) { this.props = props || {}; }
  setState(update: Update, cb?: () => void) {
    const prev = this.state;
    const patch = typeof update === "function" ? update(prev) : update;
    this.state = { ...prev, ...(patch || {}) };
    this.__rerender(cb);
  }
  forceUpdate() { this.__rerender(); }
  componentDidMount() {}
  componentDidUpdate(_prev?: unknown) {}
  componentWillUnmount() {}
  renderVals(): Record<string, unknown> { return {}; }
}
