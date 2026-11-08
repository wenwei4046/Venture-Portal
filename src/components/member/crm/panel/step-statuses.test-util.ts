import { act, fireEvent, screen } from "@testing-library/react";

/**
 * The Team inbox shows one status at a time, picked from its dropdown (2026-11-08; tabs before): pick each status in turn
 * until `name` is on screen. Nothing to pick (Mine's inbox) → nothing done.
 */
export async function stepStatuses(name: string) {
  for (let i = 0; i < 12; i++) {
    if (screen.queryAllByText(name, { exact: true }).length) return;
    const pick = screen.queryByRole("button", { name: /^Status:/ });
    if (!pick) return;
    fireEvent.click(pick); await act(async () => {});
    const opts = screen.getAllByRole("option");
    if (i >= opts.length) { fireEvent.click(pick); await act(async () => {}); return; }
    fireEvent.click(opts[i]); await act(async () => {});
  }
}
