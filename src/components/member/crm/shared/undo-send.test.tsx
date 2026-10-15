import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { holdForUndo, UNDO_MS, UndoSendBar } from "./undo-send";

afterEach(() => { vi.useRealTimers(); });

describe("undo send (2026-10-15)", () => {
  it("lets a send go after its moment, and shows the bar meanwhile", async () => {
    vi.useFakeTimers();
    render(<UndoSendBar />);
    let went: boolean | undefined;
    act(() => { void holdForUndo("m1", '"Hello"').then(v => { went = v; }); });
    expect(screen.getByText(/"Hello" · sending in 10s/)).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(UNDO_MS); });
    expect(went).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("Undo takes the newest back — it never goes", async () => {
    vi.useFakeTimers();
    render(<UndoSendBar />);
    let first: boolean | undefined, second: boolean | undefined;
    act(() => { void holdForUndo("a", "Photo").then(v => { first = v; }); void holdForUndo("b", '"Hi"').then(v => { second = v; }); });
    expect(screen.getByText(/2 messages · sending in/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByText("Undo")); });
    expect(second).toBe(false);
    expect(first).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(UNDO_MS); });
    expect(first).toBe(true);
  });
});
