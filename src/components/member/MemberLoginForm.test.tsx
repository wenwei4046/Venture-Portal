import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberLoginForm from "./MemberLoginForm";

afterEach(cleanup);

function fillCredentials(
  email = "member@example.com",
  password = "Example password 123",
) {
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

function submit() {
  fireEvent.submit(screen.getByRole("form", { name: "Member sign-in" }));
}

describe("MemberLoginForm", () => {
  it("provides labelled native credential fields and displays an initial server error", () => {
    render(
      <MemberLoginForm
        action={vi.fn()}
        initialError="Your account is not active. Please contact HR."
      />,
    );
    const email = screen.getByLabelText("Work email");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toBeRequired();
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toBeRequired();
    expect(
      screen.getByRole("form", { name: "Member sign-in" }),
    ).not.toHaveAttribute("novalidate");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your account is not active. Please contact HR.",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("disables submission while pending and keeps both entered credentials after an authentication error", async () => {
    let resolve!: (result: { error: string }) => void;
    const action = vi.fn(
      () =>
        new Promise<{ error: string }>((done) => {
          resolve = done;
        }),
    );
    render(<MemberLoginForm action={action} />);
    fillCredentials("sales@example.com", "  Password with spaces  ");
    submit();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(
      screen.getByRole("form", { name: "Member sign-in" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Work email")).toBeDisabled();
    expect(screen.getByLabelText("Password")).toBeDisabled();

    await act(async () =>
      resolve({
        error: "The email or password is incorrect. Please try again.",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The email or password is incorrect. Please try again.",
    );
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "sales@example.com",
    );
    expect(screen.getByLabelText("Password")).toHaveValue(
      "  Password with spaces  ",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(
      screen.getByRole("form", { name: "Member sign-in" }),
    ).toHaveAttribute("aria-busy", "false");
  });

  it("keeps invalid or incomplete credentials behind native form validation", async () => {
    const action = vi.fn(async () => ({ error: "Should not submit." }));
    render(<MemberLoginForm action={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByLabelText("Work email")).toBeInvalid();
    expect(screen.getByLabelText("Password")).toBeInvalid();
    fillCredentials("not-an-email", "Example password 123");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await act(async () => {});
    expect(screen.getByLabelText("Work email")).toBeInvalid();
    expect(action).not.toHaveBeenCalled();
  });

  it("trims the submitted email while preserving the password exactly", async () => {
    const action = vi.fn(async (_form: FormData) => ({
      error: "Please try again.",
    }));
    render(<MemberLoginForm action={action} />);
    fillCredentials(
      "  Sales.Member@example.com  ",
      "  Do not trim this password  ",
    );
    submit();
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const form = action.mock.calls[0][0];
    expect(form.get("email")).toBe("Sales.Member@example.com");
    expect(form.get("password")).toBe("  Do not trim this password  ");
    await screen.findByRole("alert");
  });

  it("reveals and hides the password using the button inside its control without submitting", () => {
    const action = vi.fn();
    render(<MemberLoginForm action={action} />);
    fillCredentials();
    const password = screen.getByLabelText("Password");
    const reveal = screen.getByRole("button", { name: "Show password" });
    expect(reveal.parentElement).toBe(password.parentElement);
    fireEvent.click(reveal);
    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(password).toHaveValue("Example password 123");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(action).not.toHaveBeenCalled();
  });

  it("discloses HR password and invitation guidance without pretending to send a reset", () => {
    const action = vi.fn();
    render(<MemberLoginForm action={action} />);
    const help = screen.getByRole("button", { name: "Forgot password?" });
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    fireEvent.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("note")).toHaveTextContent(
      "Contact HR to reset your password or resend your invitation.",
    );
    expect(screen.getByRole("note")).toHaveAttribute(
      "id",
      help.getAttribute("aria-controls"),
    );
    fireEvent.click(help);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("never calls the supplied action from a design preview", async () => {
    const action = vi.fn(async () => ({ error: "Live action must not run." }));
    render(<MemberLoginForm action={action} preview />);
    fillCredentials();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This is a design preview. Use Preview workspace to explore.",
    );
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "member@example.com",
    );
    expect(screen.getByLabelText("Password")).toHaveValue(
      "Example password 123",
    );
  });

  it.each([false, true])(
    "retains credentials through a native button submission and React's form reset (preview=%s)",
    async (preview) => {
      const action = vi.fn(async () => ({
        error: "Please check your credentials.",
      }));
      render(<MemberLoginForm action={action} preview={preview} />);
      fillCredentials("demo.member@example.com", "  preview-only  ");
      const form = screen.getByRole("form", { name: "Member sign-in" });
      const reset = vi.fn();
      form.addEventListener("reset", reset);

      await act(async () => {
        (
          screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement
        ).click();
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(
        preview
          ? "This is a design preview. Use Preview workspace to explore."
          : "Please check your credentials.",
      );
      await waitFor(() => expect(reset).toHaveBeenCalled());
      expect(screen.getByLabelText("Work email")).toHaveValue(
        "demo.member@example.com",
      );
      expect(screen.getByLabelText("Password")).toHaveValue("  preview-only  ");
      expect(action).toHaveBeenCalledTimes(preview ? 0 : 1);
      form.removeEventListener("reset", reset);
    },
  );

  it("shows a retryable connection error without clearing entered credentials", async () => {
    const action = vi.fn(async () => {
      throw new Error("Connection unavailable");
    });
    render(<MemberLoginForm action={action} />);
    fillCredentials();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to connect right now. Please try again shortly.",
    );
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "member@example.com",
    );
    expect(screen.getByLabelText("Password")).toHaveValue(
      "Example password 123",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});
