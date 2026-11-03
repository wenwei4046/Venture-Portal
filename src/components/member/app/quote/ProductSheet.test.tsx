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

// 2026-10-26, the user: "如果我点沙发的话，下面应该可以选择要不要加 accessory" — SKU Master's Sofa Accessory, beside the sofa.
describe("a sofa's accessories", () => {
  const sofaCatalog: QCatalog = {
    brand: "ZANOTTI", name: "Zanotti", sofa: true, frames: [], kpis: [], accSummary: "2 items",
    models: [{ key: "8030", name: "SOFFIO", desc: "8030", sizes: {}, choices: NO_SOFA_CHOICES, modules: [
      { code: "1A(LHF)", desc: "1-seat · left arm", seats: 1, chaise: false, productId: "s-1a", options: [] },
      { code: "1A(RHF)", desc: "1-seat · right arm", seats: 1, chaise: false, productId: "s-1b", options: [] },
    ] }],
    accs: [
      { key: "BACK CUSHION 01", name: "BACK CUSHION 01", any: "bc01", sizes: {} },
      { key: "SQUARE PILLOW", name: "SQUARE PILLOW", any: "sq", sizes: {} },
    ],
  };

  function drawSofa(sheet: SheetState) {
    const add = vi.fn();
    function Harness() {
      const [current, setSheet] = useState<SheetState>(sheet);
      return <ProductSheet sheet={current} catalog={sofaCatalog} memory={EMPTY_MEMORY} cart={[]} build={NO_SOFA_BUILD} readOnly={false}
        actions={{
          close: vi.fn(), patch: patch => setSheet(s => ({ ...s, ...patch } as SheetState)),
          patchFrame: vi.fn(), openBf: vi.fn(), editBf: vi.fn(), removeBf: vi.fn(), backToMattress: vi.fn(), applyFrame: vi.fn(),
          add: () => add(sheetLines(current, sofaCatalog)),
        }} />;
    }
    render(<Harness />);
    return add;
  }

  it("lists the sofa accessories under the sofa, optional, and adds them with it — per set", () => {
    const add = drawSofa({ mode: "sofa", key: "8030", layout: "C", mods: { "1A(LHF)": 1, "1A(RHF)": 1 }, qty: 1, kpi: [], height: null, tier: null,
      leg: null, specials: [], acc: {}, accAll: false });
    expect(screen.getByText("3 · Accessories")).toBeInTheDocument();
    addOne("SQUARE PILLOW");
    addOne("SQUARE PILLOW");
    // The footer's sets — the last "More"; each module's stepper has one too.
    fireEvent.click(screen.getAllByRole("button", { name: "More" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 sets to cart" }));
    expect(add).toHaveBeenCalledWith([
      expect.objectContaining({ kind: "sofa", productId: "s-1a", qty: 2 }),
      expect.objectContaining({ kind: "sofa", productId: "s-1b", qty: 2 }),
      expect.objectContaining({ kind: "acc", productId: "sq", qty: 4 }),
    ]);
  });

  it("sells them on their own as Sofa accessories only", () => {
    drawSofa({ mode: "acc", acc: {}, accAll: false });
    expect(screen.getByRole("dialog", { name: "Sofa accessories only" })).toBeInTheDocument();
    expect(screen.getByText("ZANOTTI · SOFA ACCESSORIES")).toBeInTheDocument();
    expect(screen.getByText("Sofa accessories")).toBeInTheDocument();
  });
});

// 2026-10-26, the user: "比如 change 8030 back cushion … 应该要乘三。所以它需要在 quotation 那边的 quantity 可以放 plus 和 minus".
describe("a sofa special charged by quantity", () => {
  const BACK = { value: "Change 8030 Backcushion", charge: 200, byQuantity: true };
  const SEAT = { value: "Seat Base Fully Cover", charge: 300 };
  const catalogWith = (specials: typeof SEAT[]): QCatalog => ({
    brand: "ZANOTTI", name: "Zanotti", sofa: true, frames: [], kpis: [], accSummary: "0 items", accs: [],
    models: [{ key: "8030", name: "SOFFIO", desc: "8030", sizes: {}, choices: { legs: [], specials, upgrades: [] }, modules: [
      { code: "1A(LHF)", desc: "1-seat · left arm", seats: 1, chaise: false, productId: "s-1a", options: [] },
      { code: "2A(LHF)", desc: "2-seat · left arm", seats: 2, chaise: false, productId: "s-2a", options: [] },
      { code: "L(RHF)", desc: "Chaise · right", seats: 1, chaise: true, productId: "s-l", options: [] },
    ] }],
  });

  function drawSofa(specials: typeof SEAT[], mods: Record<string, number> = { "1A(LHF)": 1 }) {
    const patches: Partial<SheetState>[] = [];
    function Harness() {
      const [sheet, setSheet] = useState<SheetState>({ mode: "sofa", key: "8030", layout: "C", mods, qty: 1, kpi: [], height: null, tier: null,
        leg: null, specials: [], specialQty: {}, acc: {}, accAll: false });
      return <ProductSheet sheet={sheet} catalog={catalogWith(specials)} memory={EMPTY_MEMORY} cart={[]} build={NO_SOFA_BUILD} readOnly={false}
        actions={{
          close: vi.fn(), patch: patch => { patches.push(patch); setSheet(s => ({ ...s, ...patch } as SheetState)); },
          patchFrame: vi.fn(), openBf: vi.fn(), editBf: vi.fn(), removeBf: vi.fn(), backToMattress: vi.fn(), applyFrame: vi.fn(), add: vi.fn(),
        }} />;
    }
    render(<Harness />);
    return patches;
  }

  it("counts it with − and +, each at its price, beside the specials charged once per sofa", () => {
    const patches = drawSofa([SEAT, BACK]);
    expect(screen.getByText("Not in margin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Seat Base Fully Cover/ })).toHaveTextContent("+ RM 300 per sofa");
    const row = screen.getByRole("group", { name: BACK.value });
    expect(row).toHaveTextContent("+ RM 200 each");
    expect(within(row).getByText("0")).toBeInTheDocument();
    for (let i = 0; i < 3; i++) fireEvent.click(within(row).getByRole("button", { name: "Add one" }));
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(patches.at(-1)).toEqual({ specials: [BACK.value], specialQty: { [BACK.value]: 3 } });
    fireEvent.click(within(row).getByRole("button", { name: "Remove one" }));
    fireEvent.click(within(row).getByRole("button", { name: "Remove one" }));
    fireEvent.click(within(row).getByRole("button", { name: "Remove one" }));
    expect(within(row).getByText("0")).toBeInTheDocument();
    expect(patches.at(-1)).toEqual({ specials: [], specialQty: {} });
  });

  // 2026-10-27, the user: "就看它有哪几个 compartment … 1A 是一个 back cushion，2A 就是两个 back cushion".
  it("starts at the sofa's compartments — 2A two, the chaise one — then counts one at a time", () => {
    const patches = drawSofa([BACK], { "2A(LHF)": 1, "L(RHF)": 1 });
    const row = screen.getByRole("group", { name: BACK.value });
    fireEvent.click(within(row).getByRole("button", { name: "Add one" }));
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(patches.at(-1)).toEqual({ specials: [BACK.value], specialQty: { [BACK.value]: 3 } });
    fireEvent.click(within(row).getByRole("button", { name: "Add one" }));
    expect(within(row).getByText("4")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Remove one" }));
    expect(patches.at(-1)).toEqual({ specials: [BACK.value], specialQty: { [BACK.value]: 3 } });
  });

  it("keeps the once-per-sofa words when nothing is counted", () => {
    drawSofa([SEAT]);
    expect(screen.getByText("Once per sofa · not in margin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Seat Base Fully Cover/ })).toHaveTextContent(/^Seat Base Fully Cover\+ RM 300$/);
  });
});

// 2026-10-29 (user): "just like them choose, like upgrade fabric enough" — Maintenance › Fabrics' upgrades, by name.
describe("a fabric upgrade", () => {
  const UP = { value: "Upgrade fabric", charge: 200 };
  const sofaCatalog: QCatalog = {
    brand: "ZANOTTI", name: "Zanotti", sofa: true, frames: [], kpis: [], accSummary: "0 items", accs: [],
    models: [{ key: "8030", name: "SOFFIO", desc: "8030", sizes: {}, choices: { legs: [], specials: [], upgrades: [UP] }, modules: [
      { code: "1NA", desc: "1-seat · no arm", seats: 1, chaise: false, productId: "s-1na", options: [] },
    ] }],
  };
  const frameCatalog: QCatalog = {
    brand: "AKEMI", name: "Akemi", sofa: false, kpis: [], accSummary: "0 items", accs: [], models: [],
    frames: [{ key: "y04", name: "Y04", sizes: { Q: "y04-q" },
      choices: { divans: [], legs: [], gaps: [], totals: [], specials: [], upgrades: [{ value: "Upgrade fabric", charge: 150 }] } }],
  };
  const actions = (over: object) => ({
    close: vi.fn(), patch: vi.fn(), patchFrame: vi.fn(), openBf: vi.fn(), editBf: vi.fn(), removeBf: vi.fn(), backToMattress: vi.fn(),
    applyFrame: vi.fn(), add: vi.fn(), ...over,
  });

  it("is a sofa's choice after its fabric: Standard, or an upgrade once per sofa", () => {
    const patches: Partial<SheetState>[] = [];
    function Harness() {
      const [sheet, setSheet] = useState<SheetState>({ mode: "sofa", key: "8030", layout: "C", mods: { "1NA": 1 }, qty: 1, kpi: [], height: null,
        tier: null, leg: null, specials: [], specialQty: {}, acc: {}, accAll: false });
      return <ProductSheet sheet={sheet} catalog={sofaCatalog} memory={EMPTY_MEMORY} cart={[]} build={NO_SOFA_BUILD} readOnly={false}
        actions={actions({ patch: (patch: Partial<SheetState>) => { patches.push(patch); setSheet(s => ({ ...s, ...patch } as SheetState)); } })} />;
    }
    render(<Harness />);
    expect(screen.getByText(/· Fabric upgrade$/)).toBeInTheDocument();
    expect(screen.getByText("Once per sofa · not in margin")).toBeInTheDocument();
    const standard = screen.getByRole("button", { name: /^Standard/ });
    expect(standard.className).toMatch(/chipOn/);
    fireEvent.click(screen.getByRole("button", { name: /Upgrade fabric/ }));
    expect(patches.at(-1)).toEqual({ fabricUpgrade: "Upgrade fabric" });
    expect(screen.getByRole("button", { name: /Upgrade fabric/ })).toHaveTextContent("+ RM 200");
    fireEvent.click(screen.getByRole("button", { name: /^Standard/ }));
    expect(patches.at(-1)).toEqual({ fabricUpgrade: null });
  });

  it("is a bed frame's choice after its specials, per frame", () => {
    const patchFrame = vi.fn();
    render(<ProductSheet sheet={{ mode: "frame", size: "Q", frame: "y04", kpi: [], qty: 1, drop: false }} catalog={frameCatalog}
      memory={EMPTY_MEMORY} cart={[]} build={NO_SOFA_BUILD} readOnly={false} actions={actions({ patchFrame })} />);
    expect(screen.getByText("3 · Fabric upgrade")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Upgrade fabric/ }));
    expect(patchFrame).toHaveBeenLastCalledWith({ build: { fabricUpgrade: "Upgrade fabric" } });
  });
});
