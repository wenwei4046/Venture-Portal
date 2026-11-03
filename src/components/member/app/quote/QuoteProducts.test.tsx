import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuoteProducts from "./QuoteProducts";
import { EMPTY_MEMORY, NO_SOFA_CHOICES, type QCatalog } from "./quote-model";

const sofa = (accs: QCatalog["accs"]): QCatalog => ({
  brand: "ZANOTTI", name: "Zanotti", sofa: true, kpis: [], accSummary: `${accs.length} item${accs.length === 1 ? "" : "s"}`, accs,
  models: [{ key: "8030", name: "SOFFIO", desc: "8030", sizes: {}, modules: [], choices: NO_SOFA_CHOICES }],
  frames: [{ key: "cody", name: "CODY", sizes: { Q: "f-q" }, choices: { divans: [], legs: [], gaps: [], totals: [], specials: [] } }],
});

function draw(catalog: QCatalog) {
  const onAccOnly = vi.fn();
  render(<QuoteProducts catalog={catalog} memory={EMPTY_MEMORY} onBrand={vi.fn()} onSet={vi.fn()} onAll={vi.fn()} onFrameOnly={vi.fn()} onAccOnly={onAccOnly} />);
  return onAccOnly;
}

afterEach(cleanup);

// 2026-10-26, the user: "沙发这里基本上还 need 多了一个沙发 accessory，所以它应该是「沙发 accessory only」".
describe("step 1's Buy separately", () => {
  it("offers a sofa brand its sofa accessories on their own — never a bed frame", () => {
    const onAccOnly = draw(sofa([{ key: "SQUARE PILLOW", name: "SQUARE PILLOW", any: "sq", sizes: {} }]));
    expect(screen.getByRole("heading", { name: "Buy separately" })).toBeInTheDocument();
    expect(screen.queryByText("Bed frame only")).not.toBeInTheDocument();
    expect(screen.getByText("1 item · Zanotti margin")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sofa accessories only/ }));
    expect(onAccOnly).toHaveBeenCalledTimes(1);
  });

  it("has nothing to say for a sofa brand with no sofa accessory", () => {
    draw(sofa([]));
    expect(screen.queryByRole("heading", { name: "Buy separately" })).not.toBeInTheDocument();
  });

  it("keeps a mattress brand's bed frames and accessories", () => {
    draw({ ...sofa([{ key: "PIL", name: "PIL", any: "p", sizes: {} }]), brand: "AKEMI", name: "Akemi", sofa: false });
    expect(screen.getByText("Bed frame only")).toBeInTheDocument();
    expect(screen.getByText("Accessories only")).toBeInTheDocument();
  });
});
