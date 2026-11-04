/**
 * Cold lead templates, 2026-11-04: WhatsApp's formatting drawn as the customer sees it, and the buttons that write its marks
 * (the owner: "我能放粗体，斜体，底线等吗？" — WhatsApp has no underline).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeskTemplateFormat, DeskTemplateReview, WaText } from "./DeskTemplateMeta";

describe("WhatsApp's formatting in the preview", () => {
  it("draws *bold*, _italic_, ~strike~ and ```mono``` and leaves the rest as typed", () => {
    const { container } = render(<p><WaText t={"Hi *there* _you_ ~old~ ```code``` and 2*3"} /></p>);
    expect(container.querySelector("strong")?.textContent).toBe("there");
    expect(container.querySelector("em")?.textContent).toBe("you");
    expect(container.querySelector("s")?.textContent).toBe("old");
    expect(container.querySelector("code")?.textContent).toBe("code");
    expect(container.textContent).toBe("Hi there you old code and 2*3");
  });
});

describe("the format buttons", () => {
  it("wrap the selection in the message box in the mark", () => {
    const setDraft = vi.fn();
    render(<><textarea defaultValue="Hi there" data-testid="box" /><DeskTemplateFormat draft="Hi there" setDraft={setDraft} /></>);
    const box = screen.getByTestId("box") as HTMLTextAreaElement;
    box.focus(); box.setSelectionRange(3, 8);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(setDraft).toHaveBeenCalledWith({ target: { value: "Hi *there*" } });
  });
  it("with no box focused, put the pair at the end", () => {
    const setDraft = vi.fn();
    render(<DeskTemplateFormat draft="Hi" setDraft={setDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(setDraft).toHaveBeenCalledWith({ target: { value: "Hi__" } });
  });
});

describe("Meta's review, a click away", () => {
  it("opens WhatsApp Manager in a new tab, and nothing without an account", () => {
    const { rerender } = render(<DeskTemplateReview url="https://business.facebook.com/wa/manage/message-templates/?waba_id=1" />);
    const a = screen.getByRole("link", { name: /Review status in Meta/ });
    expect(a.getAttribute("target")).toBe("_blank");
    rerender(<DeskTemplateReview url={null} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
