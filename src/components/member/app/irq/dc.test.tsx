import { StrictMode } from "react";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DcHost, DcLogic, dcCss, dcText, type DcVals } from "./dc";

// IR Quote's runtime (2026-11-05): the prototype's logic classes run in the app as on the prototype's own page.

describe("dcText", () => {
  it("wraps a text hole in the runtime's span, as the prototype draws it", () => {
    const { container } = render(<div>RM {dcText(12)}</div>);
    expect(container.innerHTML).toBe('<div>RM <span class="sc-interp">12</span></div>');
  });
  it("draws nothing for undefined, null and booleans", () => {
    for (const v of [undefined, null, true, false]) expect(dcText(v)).toBeNull();
  });
});

describe("dcCss", () => {
  it("reads a style string as the runtime's cssToObj does", () => {
    expect(dcCss("display:flex;border-radius:12px;--x:1;background:var(--irq-c-f5871f)")).toEqual({
      display: "flex", borderRadius: "12px", "--x": "1", background: "var(--irq-c-f5871f)",
    });
  });
});

class Counter extends DcLogic {
  state = { n: 0 };
  mounts = 0;
  componentDidMount() {
    this.mounts++;
    Counter.seen.push(this.mounts);
  }
  static seen: number[] = [];
  renderVals(): DcVals {
    return { n: this.state.n, inc: () => this.setState((s: DcVals) => ({ n: s.n + 1 })) };
  }
}
const tpl = (v: DcVals) => <button onClick={v.inc}>{dcText(v.n)}</button>;

describe("DcHost", () => {
  it("runs a logic class: its state, its setState, its template", () => {
    render(<DcHost logic={Counter} render={tpl} props={{}} />);
    act(() => screen.getByRole("button").click());
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("2");
  });

  it("mounts the logic once under StrictMode, which mounts components twice", async () => {
    Counter.seen = [];
    render(<StrictMode><DcHost logic={Counter} render={tpl} props={{}} /></StrictMode>);
    await act(async () => { await Promise.resolve(); });
    expect(Counter.seen).toEqual([1]);
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("button").textContent).toBe("1");
  });

  it("lets a real unmount reach the logic", async () => {
    const off = vi.fn();
    class Leaves extends DcLogic {
      componentWillUnmount() { off(); }
    }
    const { unmount } = render(<DcHost logic={Leaves} render={() => <i />} props={{}} />);
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(off).toHaveBeenCalledTimes(1);
  });

  it("draws the runtime's host box, positioned only by its position props", () => {
    const { container } = render(<DcHost logic={Counter} render={tpl} props={{}} hostStyle={{ width: "100%", height: "100%", display: "flex" }} />);
    const host = container.firstElementChild as HTMLElement;
    expect(host.className).toBe("sc-host");
    expect(host.style.height).toBe("100%");
    expect(host.style.display).toBe("");
  });
});
