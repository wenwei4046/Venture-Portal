import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MemberLoginScreen from "./MemberLoginScreen";

const originalUrl = window.location.href;

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", originalUrl);
});

function fillCredentials() {
  fireEvent.change(screen.getByLabelText("Work email"), {
    target: { value: "member@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "  Member password  " },
  });
}

describe("MemberLoginScreen", () => {
  it("keeps the full brand and live sign-in behavior in the selected Warm Editorial design", async () => {
    const action = vi.fn(async (_form: FormData) => ({
      error: "Please check your email and password.",
    }));
    render(
      <MemberLoginScreen
        action={action}
        initialError="Your session has expired. Please sign in again."
      />,
    );

    expect(
      screen.getByLabelText("HOUZS VENTURE Revenue Workspace"),
    ).toHaveTextContent("HOUZS VENTURE");
    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your session has expired. Please sign in again.",
    );
    expect(
      screen.queryByRole("navigation", { name: "Login design options" }),
    ).not.toBeInTheDocument();

    fillCredentials();
    await act(async () => {
      (
        screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement
      ).click();
    });
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Please check your email and password.",
      );
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action.mock.calls[0][0].get("email")).toBe("member@example.com");
    expect(action.mock.calls[0][0].get("password")).toBe("  Member password  ");
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "member@example.com",
    );
    expect(screen.getByLabelText("Password")).toHaveValue(
      "  Member password  ",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("ignores an old design URL, offers the phone workspace preview and prevents live sign-in", async () => {
    window.history.replaceState(
      null,
      "",
      "/member/preview?device=phone&department=Fair&page=login&design=club",
    );
    const action = vi.fn(async () => ({
      error: "Live action must not run.",
    }));
    const previewHref = "/member/preview?device=phone&page=today";
    render(
      <MemberLoginScreen preview action={action} previewHref={previewHref} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome back." }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("HOUZS VENTURE Revenue Workspace"),
    ).toHaveTextContent("HOUZS VENTURE");
    expect(
      screen.queryByRole("navigation", { name: "Login design options" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Preview workspace" }),
    ).toHaveAttribute("href", previewHref);

    fillCredentials();
    await act(async () => {
      (
        screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement
      ).click();
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This is a design preview. Use Preview workspace to explore.",
    );
    expect(action).not.toHaveBeenCalled();
  });
});
