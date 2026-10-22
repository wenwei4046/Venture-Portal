import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadWhenSeen } from "./seen";

// A chat's messages are read once its newest is on the screen (the owner, 2026-10-17: "只有当你的 screen 显示到这条信息才算 …
// 往上滑着看 chat history，然后有新的 message 进来 … 它就不算你已经 read 了 … 只要你滑到最下面 … 它才会当成是已读").
// The list's size and place stand in for a layout (happy-dom draws none): 1,000 px of messages in a 500 px window.
const box = { height: 1000, client: 500, top: 500 };
const screen = { visible: true, focus: true };

function Chat({ id, unread, read, drawn = true }: { id: string | null; unread: number; read: (id: string) => void; drawn?: boolean }) {
  useReadWhenSeen(id, unread, read);
  return drawn ? <div data-chat-list="1" data-testid="list" /> : <div />;
}

const SIZES = { scrollHeight: () => box.height, clientHeight: () => box.client, scrollTop: () => box.top } as const;
const kept = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(box, { height: 1000, client: 500, top: 500 });
  Object.assign(screen, { visible: true, focus: true });
  for (const [k, get] of Object.entries(SIZES)) {
    kept.set(k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k));
    Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get, set: () => {} });
  }
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (screen.visible ? "visible" : "hidden"));
  vi.spyOn(document, "hasFocus").mockImplementation(() => screen.focus);
});
afterEach(() => {
  cleanup();
  for (const [k, d] of kept) { if (d) Object.defineProperty(HTMLElement.prototype, k, d); else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k]; }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const scrollTo = (top: number) => { box.top = top; fireEvent.scroll(document.querySelector("[data-chat-list]")!); };

describe("a chat is read once its newest message is on the screen", () => {
  it("opening it on its newest message reads it", () => {
    const read = vi.fn();
    render(<Chat id="c1" unread={2} read={read} />);
    expect(read).toHaveBeenCalledWith("c1");
  });

  it("scrolled up into the history, it stays unread — until the reader is back at the newest", () => {
    const read = vi.fn();
    box.top = 100; // 400 px above the end
    render(<Chat id="c1" unread={1} read={read} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(read).not.toHaveBeenCalled();
    scrollTo(300);
    expect(read).not.toHaveBeenCalled();
    scrollTo(450); // within 120 px of the end: the newest is on screen
    expect(read).toHaveBeenCalledWith("c1");
  });

  it("a message arriving while the reader is up in the history is not read; scrolling down reads it", () => {
    const read = vi.fn();
    const { rerender } = render(<Chat id="c1" unread={0} read={read} />);
    box.top = 100;
    scrollTo(100);
    rerender(<Chat id="c1" unread={1} read={read} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(read).not.toHaveBeenCalled();
    scrollTo(500);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("a message arriving at the newest is read at once", () => {
    const read = vi.fn();
    const { rerender } = render(<Chat id="c1" unread={0} read={read} />);
    expect(read).not.toHaveBeenCalled();
    rerender(<Chat id="c1" unread={1} read={read} />);
    expect(read).toHaveBeenCalledWith("c1");
  });

  it("not while the app is behind another, or the window is not in front — on coming back, yes", () => {
    const read = vi.fn();
    screen.visible = false;
    render(<Chat id="c1" unread={3} read={read} />);
    expect(read).not.toHaveBeenCalled();
    screen.visible = true;
    screen.focus = false;
    fireEvent(document, new Event("visibilitychange"));
    expect(read).not.toHaveBeenCalled();
    screen.focus = true;
    fireEvent(window, new Event("focus"));
    expect(read).toHaveBeenCalledWith("c1");
  });

  it("put on its newest a moment after it opened (a screen sliding in): read on the second look", () => {
    const read = vi.fn();
    box.top = 0;
    render(<Chat id="c1" unread={1} read={read} />);
    expect(read).not.toHaveBeenCalled();
    box.top = 500;
    act(() => { vi.advanceTimersByTime(120); });
    expect(read).toHaveBeenCalledWith("c1");
  });

  it("nothing unread, no chat open, or no list drawn: nothing is read", () => {
    const read = vi.fn();
    render(<Chat id="c1" unread={0} read={read} />);
    cleanup();
    render(<Chat id={null} unread={4} read={read} />);
    cleanup();
    render(<Chat id="c1" unread={4} read={read} drawn={false} />);
    cleanup();
    box.client = 0; // a list that takes no room — not on the screen
    render(<Chat id="c1" unread={4} read={read} />);
    act(() => { vi.advanceTimersByTime(200); });
    expect(read).not.toHaveBeenCalled();
  });
});
