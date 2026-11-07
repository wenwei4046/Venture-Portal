import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pdf.js itself does not run under happy-dom: a PDF here is a fake of three A4 pages, drawn by a spy.
const pdf = vi.hoisted(() => ({ getDocument: vi.fn(), drawPage: vi.fn(), destroy: vi.fn() }));
vi.mock("@/components/member/crm/shared/pdf", () => ({
  pdfjs: async () => ({ getDocument: pdf.getDocument }),
  drawPage: pdf.drawPage,
}));
import InvoiceField from "./InvoiceField";
import { INVOICE_VIEW_STEP } from "./InvoiceViewer";

// 2026-11-08 — the user: "when upload file invoice in the claim stage, i want it can be view. so that eazy to double
// confirm before submit". And the side note the user forwarded the same day: the phone's Back must close the preview,
// not the claim form under it.

function Field({ onFile = () => {} }: { onFile?: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  return <InvoiceField file={file} fileRef={ref} onFile={f => { setFile(f); onFile(f); }} />;
}
const input = (c: HTMLElement) => c.querySelector('input[type="file"]') as HTMLInputElement;
const choose = (c: HTMLElement, file: File) => fireEvent.change(input(c), { target: { files: [file] } });
const photo = () => new File([new Uint8Array(2048)], "parking-receipt.jpg", { type: "image/jpeg" });
const ticket = () => new File([new Uint8Array(3072)], "airasia-ticket.pdf", { type: "application/pdf" });
const viewer = () => screen.getByRole("dialog", { name: /^Invoice · / });

beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invoice-photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const page = { getViewport: () => ({ width: 595, height: 842 }) };
  pdf.getDocument.mockImplementation(() => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => page }), destroy: pdf.destroy }));
  pdf.drawPage.mockResolvedValue(undefined);
  pdf.destroy.mockResolvedValue(undefined);
  window.history.replaceState(null, "", "/member?page=account&view=requests");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pdf.getDocument.mockReset();
  pdf.drawPage.mockReset();
  pdf.destroy.mockReset();
});

describe("a claim's invoice, before it is sent", () => {
  it("asks for it until one is chosen", () => {
    const { container } = render(<Field />);
    expect(screen.getByRole("button", { name: /Take a photo or choose a file/ })).toHaveTextContent("JPG, PNG or PDF, up to 100 MB");
    expect(input(container)).toHaveAttribute("accept", "image/jpeg,image/png,application/pdf");
    expect(screen.queryByRole("button", { name: /^View/ })).not.toBeInTheDocument();
  });

  it("a photo shows as itself beside its name and size, with View and Change", () => {
    const { container } = render(<Field />);
    choose(container, photo());
    const card = container.querySelector("[data-invoice-picked]") as HTMLElement;
    expect(card).toHaveTextContent("parking-receipt.jpg");
    expect(card).toHaveTextContent("Photo · 2 KB");
    expect(card.querySelector("img")).toHaveAttribute("src", "blob:invoice-photo");
    expect(within(card).getByRole("button", { name: "View parking-receipt.jpg" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Change the invoice" })).toBeInTheDocument();
  });

  it("Change opens the picker again; a picker closed with nothing keeps the one chosen", () => {
    const onFile = vi.fn();
    const { container } = render(<Field onFile={onFile} />);
    choose(container, photo());
    const click = vi.spyOn(input(container), "click");
    fireEvent.click(screen.getByRole("button", { name: "Change the invoice" }));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.change(input(container), { target: { files: [] } });
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(screen.getByText("parking-receipt.jpg")).toBeInTheDocument();
    choose(container, ticket());
    expect(screen.getByText("airasia-ticket.pdf")).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:invoice-photo");
  });

  it("View opens the photo full screen over the form; × closes it and gives its history step back", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { container } = render(<Field />);
    choose(container, photo());
    fireEvent.click(screen.getByRole("button", { name: "View parking-receipt.jpg" }));
    const shown = viewer();
    expect(shown).toHaveAttribute("data-revenue-app");
    expect(shown.parentElement).toBe(document.body);
    expect(within(shown).getByRole("img", { name: "parking-receipt.jpg" })).toHaveAttribute("src", "blob:invoice-photo");
    expect(shown).toHaveTextContent("Photo · 2 KB");
    expect(within(shown).getByRole("button", { name: "Close" })).toHaveFocus();
    expect((window.history.state as Record<string, unknown> | null)?.[INVOICE_VIEW_STEP]).toBe(1);
    fireEvent.click(within(shown).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(back).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "View parking-receipt.jpg" })).toHaveFocus();
  });

  it("the phone's Back closes the preview and leaves the form as it was — no second step back", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { container } = render(<Field />);
    choose(container, photo());
    fireEvent.click(screen.getByRole("button", { name: "View parking-receipt.jpg" }));
    expect(viewer()).toBeInTheDocument();
    // Back: the browser lands on the entry under ours (its state has no key of ours) and says so.
    const under = { ...(window.history.state as Record<string, unknown>) };
    delete under[INVOICE_VIEW_STEP];
    act(() => {
      window.history.replaceState(under, "");
      window.dispatchEvent(new PopStateEvent("popstate", { state: under }));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(back).not.toHaveBeenCalled();
    expect(screen.getByText("parking-receipt.jpg")).toBeInTheDocument();
    expect(window.location.search).toBe("?page=account&view=requests");
  });

  it("Escape closes it too", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { container } = render(<Field />);
    choose(container, photo());
    fireEvent.click(screen.getByRole("button", { name: "View parking-receipt.jpg" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("parking-receipt.jpg")).toBeInTheDocument();
  });

  describe("a PDF", () => {
    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
    });

    it("shows its first page as the thumbnail and counts its pages — read on the phone", async () => {
      const { container } = render(<Field />);
      choose(container, ticket());
      expect(await screen.findByText("PDF · 3 pages · 3 KB")).toBeInTheDocument();
      await waitFor(() => expect(pdf.drawPage).toHaveBeenCalledWith(expect.anything(), 1, expect.any(HTMLCanvasElement), 56));
      await waitFor(() => expect(container.querySelector("[data-invoice-picked] canvas")).not.toHaveAttribute("hidden"));
      expect(pdf.getDocument).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
      await waitFor(() => expect(pdf.destroy).toHaveBeenCalled());
    });

    it("View opens every page of it, the page it is on counted", async () => {
      vi.spyOn(window.history, "back").mockImplementation(() => {});
      const { container } = render(<Field />);
      choose(container, ticket());
      fireEvent.click(screen.getByRole("button", { name: "View airasia-ticket.pdf" }));
      const shown = viewer();
      expect(shown).toHaveTextContent("Opening…");
      expect(await within(shown).findByText("PDF · page 1 of 3 · 3 KB")).toBeInTheDocument();
      expect(within(shown).getAllByLabelText(/^Page \d$/)).toHaveLength(3);
    });

    it("one pdf.js cannot read keeps its name and size, and offers no View", async () => {
      pdf.getDocument.mockImplementation(() => ({ promise: Promise.reject(new Error("Invalid PDF structure.")), destroy: pdf.destroy }));
      const { container } = render(<Field />);
      choose(container, new File(["%PDF-1.7"], "broken.pdf", { type: "application/pdf" }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "View broken.pdf" })).not.toBeInTheDocument());
      expect(screen.getByText("PDF · 1 KB")).toBeInTheDocument();
      expect(container.querySelector("[data-invoice-picked]")).toHaveTextContent("PDF");
      expect(screen.getByRole("button", { name: "Change the invoice" })).toBeInTheDocument();
    });
  });

  it("a file that is neither a photo nor a PDF shows only its name", () => {
    const { container } = render(<Field />);
    choose(container, new File(["x"], "receipt.heic", { type: "" }));
    expect(container.querySelector("[data-invoice-picked]")).toHaveTextContent("HEIC");
    expect(screen.getByText("File · 1 KB")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^View/ })).not.toBeInTheDocument();
  });
});
