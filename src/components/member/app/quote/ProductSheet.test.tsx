import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProductSheet from "./ProductSheet";
import { EMPTY_MEMORY, NO_SOFA_BUILD, NO_SOFA_CHOICES, sheetLines, type QCatalog, type SheetState } from "./quote-model";

const catalog: QCatalog = {
  brand: "AKEMI", name: "Akemi", sofa: false, frames: [], kpis: [], accSummary: "8 items",
  models: [{ key: "bastion", name: "BASTION", desc: "", sizes: { Q: "m-q", K: "m-k" }, modules: [], choices: NO_SOFA_CHOICES }],
  accs: [
    { key: "AERO-MP", name: "AERO-MP", any: null, sizes: { Q: "a-q", K: "a-k", SK: "a-sk" } },
    ...Array.from({ length: 6 }, (_, i) => ({ key: `PILLOW ${i + 1}`, name: `Pillow ${i + 1}`, any: `p-${i + 1}`, sizes: {} })),
    { key: "Z BOLSTER", name: "Z Bolster", any: "bolster", sizes: {} },
  ],
};

const initial = (mode: "acc" | "model"): SheetState => mode === "acc"
  ? { mode, acc: {}, accAll: false }
  : { mode, key: "bastion", size: "Q", acc: {}, accAll: false, qty: 1, bfs: [], fx: null };

function draw(mode: "acc" | "model", overrides: Partial<SheetState> = {}) {
  const add = vi.fn();
  function Harness() {
    const [sheet, setSheet] = useState<SheetState>({ ...initial(mode), ...overrides } as SheetState);
    return <ProductSheet sheet={sheet} catalog={catalog} memory={EMPTY_MEMORY} cart={[]} build={NO_SOFA_BUILD} readOnly={false}
      actions={{
        close: vi.fn(), patch: patch => setSheet(current => ({ ...current, ...patch } as SheetState)),
        patchFrame: vi.fn(), openBf: vi.fn(), editBf: vi.fn(), removeBf: vi.fn(), backToMattress: vi.fn(), applyFrame: vi.fn(),
        add: () => add(sheetLines(sheet, catalog)),
      }} />;
  }
  render(<Harness />);
  return add;
}

const search = (value: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Search accessories" }), { target: { value } });
const addOne = (name: string) => fireEvent.click(within(screen.getByRole("group", { name })).getByRole("button", { name: "Add one" }));

afterEach(cleanup);

describe("accessory search in product sheets", () => {
  it.each(["acc", "model"] as const)("searches beyond the collapsed list and preserves quantities in %s mode", mode => {
    const add = draw(mode);
    expect(screen.queryByRole("group", { name: "Z Bolster" })).not.toBeInTheDocument();

    search("  bOlStEr  ");
    expect(screen.getAllByRole("group")).toHaveLength(1);
    addOne("Z Bolster");
    search("pillow");
    expect(screen.getAllByRole("group")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
    addOne("Pillow 6");

    search("no such accessory");
    expect(screen.getByRole("status")).toHaveTextContent("No accessories match your search.");
    expect(screen.getByRole("searchbox")).toHaveValue("no such accessory");
    fireEvent.click(screen.getByRole("button", { name: "Clear accessory search" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    for (const name of ["Pillow 6", "Z Bolster"]) {
      expect(within(screen.getByRole("group", { name })).getByText("1")).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ productId: "p-6", qty: 1 }),
      expect.objectContaining({ productId: "bolster", qty: 1 }),
    ]));
  });

  it("offers standalone SKUs without a Size picker and adds different sizes independently", () => {
    const add = draw("acc");
    expect(screen.queryByText("Size")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Queen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "King" })).not.toBeInTheDocument();
    search("aero");
    expect(screen.getAllByRole("group")).toHaveLength(3);
    addOne("AERO-MP · Queen");
    addOne("AERO-MP · King");
    addOne("AERO-MP · King");
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledWith([
      expect.objectContaining({ productId: "a-q", size: "Queen", qty: 1 }),
      expect.objectContaining({ productId: "a-k", size: "King", qty: 2 }),
    ]);
  });

  it("keeps every selected SKU visible when the standalone list is collapsed", () => {
    draw("acc", { acc: { "a-sk": 1, "p-1": 1, "p-2": 1, "p-3": 1, "p-4": 1, "bolster": 1 } });
    expect(screen.getAllByRole("group")).toHaveLength(6);
    expect(screen.getByRole("group", { name: "AERO-MP · Super King" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Z Bolster" })).toBeInTheDocument();
  });

  it("matches mattress accessories to the mattress size while searching", () => {
    const add = draw("model");
    search("aero");
    expect(screen.getByRole("group", { name: "AERO-MP · Queen" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "AERO-MP · King" })).not.toBeInTheDocument();
    addOne("AERO-MP · Queen");
    fireEvent.click(screen.getByRole("button", { name: "King", exact: true }));
    expect(screen.getByRole("searchbox")).toHaveValue("aero");
    expect(screen.queryByRole("group", { name: "AERO-MP · Queen" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "AERO-MP · King" })).getByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(add).toHaveBeenCalledWith([
      expect.objectContaining({ productId: "m-k", qty: 1 }),
      expect.objectContaining({ productId: "a-k", qty: 1 }),
    ]);
  });
});
