/**
 * The owner, 2026-11-09: "如果我点进看了一个聊天，那在返回时要回到那个聊天的 inbox，而不是又从上开始往下滑". A chat takes the
 * phone's whole screen, so the Inbox list is drawn again on the way back — at the place it was left, Mine's and Team's.
 */
import { describe, expect, it } from "vitest";
import { useRef, useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { useKeepInboxScroll } from "./inbox-scroll";

function App({ team }: { team?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useKeepInboxScroll(root);
  const [chat, setChat] = useState(false);
  return (
    <div ref={root}>
      <button onClick={() => setChat(c => !c)}>toggle</button>
      {chat ? <div>chat</div> : team ? (
        <div data-inb-board="1" data-testid="board" style={{ overflowX: "auto" }}>
          <div><div data-testid="col0" style={{ overflowY: "auto", height: "100px" }}><div style={{ height: "900px" }} /></div></div>
          <div><div data-testid="col1" style={{ overflowY: "auto", height: "100px" }}><div style={{ height: "900px" }} /></div></div>
        </div>
      ) : (
        <main data-testid="list" style={{ overflowY: "auto", height: "100px" }}>
          {Array.from({ length: 30 }, (_, i) => <div key={i} data-inbox-row="1" style={{ height: "60px" }} />)}
        </main>
      )}
    </div>
  );
}
const scrollTo = (el: HTMLElement, top: number, left = 0) => { el.scrollTop = top; el.scrollLeft = left; fireEvent.scroll(el); };
const toggle = async (r: ReturnType<typeof render>) => { await act(async () => { fireEvent.click(r.getByText("toggle")); }); };

describe("the Inbox keeps its place across a chat", () => {
  it("Mine's list", async () => {
    const r = render(<App />);
    scrollTo(r.getByTestId("list"), 640);
    await toggle(r); expect(r.getByText("chat")).toBeTruthy();
    await toggle(r);
    expect(r.getByTestId("list").scrollTop).toBe(640);
  });
  it("Team's board, sideways and in its column", async () => {
    const r = render(<App team />);
    scrollTo(r.getByTestId("board"), 0, 300);
    scrollTo(r.getByTestId("col1"), 420);
    await toggle(r);
    await toggle(r); // the board and its columns are new elements on the way back
    expect(r.getByTestId("board").scrollLeft).toBe(300);
    expect(r.getByTestId("col1").scrollTop).toBe(420);
  });
});
