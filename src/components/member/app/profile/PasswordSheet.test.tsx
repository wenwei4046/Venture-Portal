import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProfileMain from "./ProfileMain";
import PasswordSheet from "./PasswordSheet";
import type { ProfileMainVM } from "./profile-vm";

// Profile › Change password (2026-10-12 — the user: "in their profile tab", "just for that personal acc"): the
// Account section is there only when RevenueApp hands it the action (a login of their own, their own Profile), and its
// sheet asks the current password, then the new one twice.

const vm: ProfileMainVM = { name: "ONG MEI SHUANG", ini: "OM", sub: "HOUZS Venture · Finance", title: "Accounts Executive", rank: "—", badges: {} };

describe("Profile’s Account section", () => {
  it("offers Change password when it may", () => {
    const changePassword = vi.fn();
    render(<ProfileMain vm={vm} hidden={false} actions={{ open: vi.fn(), signOut: vi.fn(), changePassword }} />);
    fireEvent.click(within(screen.getByRole("region", { name: "Account" })).getByRole("button", { name: "Change password" }));
    expect(changePassword).toHaveBeenCalled();
  });

  it("is not there for a shared login, nor while a member is viewed", () => {
    render(<ProfileMain vm={vm} hidden={false} actions={{ open: vi.fn(), signOut: vi.fn() }} />);
    expect(screen.queryByRole("region", { name: "Account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("the Change password sheet", () => {
  const fill = (current: string, next: string, confirm: string) => {
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  };

  it("hides what is typed until Show passwords, and says what is wrong before sending", () => {
    const change = vi.fn();
    render(<PasswordSheet open onClose={vi.fn()} change={change} />);
    expect(screen.getByLabelText("Current password")).toHaveAttribute("type", "password");
    fill("old-pass", "12345", "12345");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Your new password needs at least 6 characters.");
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Show passwords"));
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("type", "text");
  });

  it("sends the three, and says it is done", async () => {
    const change = vi.fn().mockResolvedValue({ ok: true });
    const close = vi.fn();
    render(<PasswordSheet open onClose={close} change={change} />);
    fill("old-pass", "new-pass-1", "new-pass-1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Password changed."));
    expect(change).toHaveBeenCalledWith({ current: "old-pass", next: "new-pass-1", confirm: "new-pass-1" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(close).toHaveBeenCalled();
  });

  it("stays while it is being sent — Cancel and the backdrop wait for the answer", async () => {
    let answer: (v: { ok: true }) => void = () => {};
    const change = vi.fn(() => new Promise<{ ok: true }>(r => { answer = r; }));
    const close = vi.fn();
    render(<PasswordSheet open onClose={close} change={change} />);
    fill("old-pass", "new-pass-1", "new-pass-1");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(close).not.toHaveBeenCalled();
    answer({ ok: true });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Password changed."));
  });

  it("forgets what was typed once it is closed", () => {
    const { rerender } = render(<PasswordSheet open onClose={vi.fn()} change={vi.fn()} />);
    fill("old-pass", "new-pass-1", "new-pass-1");
    rerender(<PasswordSheet open={false} onClose={vi.fn()} change={vi.fn()} />);
    rerender(<PasswordSheet open onClose={vi.fn()} change={vi.fn()} />);
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText(/^New password/)).toHaveValue("");
  });
});
