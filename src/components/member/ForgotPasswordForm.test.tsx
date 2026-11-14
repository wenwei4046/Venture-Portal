import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberLoginScreen from "./MemberLoginScreen";

// Forgot password (2026-11-14): the sign-in's link swaps in the reset-link form, carrying the email.

afterEach(cleanup);

describe("Forgot password on the sign-in", () => {
  it("opens the reset form with the typed email, sends it, and goes back", async () => {
    const resetAction = vi.fn(async (_form: FormData) => ({ error: "", sent: "If a@b.com has an account, a link is on its way." }));
    render(<MemberLoginScreen action={vi.fn(async () => ({ error: "" }))} resetAction={resetAction} />);

    fireEvent.change(screen.getByLabelText("Work email"), { target: { value: "a@b.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    expect(screen.getByRole("heading", { name: "Reset your password." })).toBeTruthy();
    expect((screen.getByLabelText("Work email") as HTMLInputElement).value).toBe("a@b.com");
    expect(screen.queryByLabelText("Password")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("a link is on its way"));
    expect(resetAction.mock.calls[0][0].get("email")).toBe("a@b.com");

    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeTruthy();
  });

  it("without a reset action (the design preview) keeps the old note", () => {
    render(<MemberLoginScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeTruthy();
    expect(screen.getByRole("note").hidden).toBe(false);
  });
});
