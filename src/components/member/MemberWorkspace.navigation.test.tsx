import type { AnchorHTMLAttributes } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memberDemo } from "@/lib/member/demo";
import MemberWorkspace from "./MemberWorkspace";

vi.mock("next/link", () => ({
  default: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props} />,
}));
vi.mock("@/app/(member)/member/actions", () => ({
  calculateMemberQuote: vi.fn(),
  submitMemberRequest: vi.fn(),
  acknowledgeMemberMemo: vi.fn(),
  refreshMemberData: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  window.history.replaceState({}, "", "/member/preview?page=quote&quoteView=calculator&department=fair");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Workspace back navigation", () => {
  it("returns a directly opened calculator to products without losing the quote", async () => {
    const data = memberDemo();
    localStorage.setItem(`member-cart-v1-${data.profile.userId}`, JSON.stringify({
      schemeId: "fair-scheme", price: "7999", delivery: "500",
      lines: [{ productId: "cloud-q", quantity: 2, gift: false }],
    }));
    render(<MemberWorkspace initialData={data} />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999"));
    fireEvent.click(screen.getByRole("button", { name: "Back to products" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Build your offer", level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole("navigation", { name: "Quote steps" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculator" }));
    expect(screen.getByRole("textbox", { name: "Selling price" })).toHaveValue("7999");
    expect(screen.getByText("Additional charges").closest("summary")).toHaveTextContent(/500\.00/);
    expect(screen.getByRole("button", { name: "Your combination" })).toHaveTextContent("2 products");
  });

  it.each(["page=quote&quoteView=catalog", "page=today"])("has no Back button on the entry page %s", async (query) => {
    window.history.replaceState({}, "", `/member/preview?${query}&department=fair`);
    render(<MemberWorkspace initialData={memberDemo()} />);
    expect(screen.queryByRole("button", { name: /^Back/ })).not.toBeInTheDocument();
  });
});
