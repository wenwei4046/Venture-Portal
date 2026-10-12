import { describe, expect, it } from "vitest";
import {
  foodClaimChanged, foodClaimDraft, foodClaimProblems, foodClaimToSave, readFoodClaimAdmin, toggleFoodTitle, validFoodClaimToSave,
  type FoodClaimAdmin,
} from "./food-claim-admin";

// People › Member services › Food claim (2026-10-13): Fair's rate a day and the titles that may claim it.

const TL = "d52f82a8-3f11-4182-8b20-994124574b03";
const RS = "36ebf27d-cdaf-4587-afcd-8f0c19898579";
const TA = "002cab9a-6924-4db2-9f63-6088a82d21e8";

const stored: FoodClaimAdmin = {
  subDepartmentId: "fair", subName: "Fair", perDay: 20, titleIds: [RS, TL], updatedAt: "2026-10-13T02:00:00Z", updatedBy: "Principal",
  titles: [
    { id: TL, name: "Team Leader", level: "Senior Manager", people: 5, active: true },
    { id: TA, name: "Team Assistant", level: "Assistant Manager", people: 6, active: true },
    { id: RS, name: "Revenue Specialist", level: "Executive", people: 10, active: true },
  ],
};

describe("readFoodClaimAdmin", () => {
  it("reads what the database sends, numbers as text included", () => {
    expect(readFoodClaimAdmin({
      subDepartmentId: "fair", subName: "Fair", perDay: "20.00", titleIds: [TL, 7], updatedAt: "2026-10-13T02:00:00Z", updatedBy: "Principal",
      titles: [{ id: TL, name: "Team Leader", level: "Senior Manager", people: "5", active: true }, { id: 3, name: "x" }, { id: RS, name: "Old", active: false }],
    })).toEqual({
      subDepartmentId: "fair", subName: "Fair", perDay: 20, titleIds: [TL], updatedAt: "2026-10-13T02:00:00Z", updatedBy: "Principal",
      titles: [
        { id: TL, name: "Team Leader", level: "Senior Manager", people: 5, active: true },
        { id: RS, name: "Old", level: null, people: 0, active: false },
      ],
    });
  });

  it("reads nothing it cannot use", () => {
    expect(readFoodClaimAdmin(null)).toBeNull();
    expect(readFoodClaimAdmin({ perDay: 20 })).toBeNull();
    expect(readFoodClaimAdmin({ titles: [] })).toMatchObject({ perDay: null, titleIds: [], subName: null });
  });
});

describe("the form", () => {
  it("opens on what is stored, the ticks in the list's order, and is Saved until something changes", () => {
    const draft = foodClaimDraft(stored);
    expect(draft).toEqual({ perDay: "20", titleIds: [TL, RS] });
    expect(foodClaimChanged(stored, draft)).toBe(false);
    expect(foodClaimChanged(stored, { ...draft, perDay: "20.00" })).toBe(false);
    expect(foodClaimChanged(stored, { ...draft, perDay: "25" })).toBe(true);
    expect(foodClaimChanged(stored, toggleFoodTitle(stored, draft, TA))).toBe(true);
  });

  it("ticks and unticks a title, keeping the list's order", () => {
    const draft = foodClaimDraft(stored);
    expect(toggleFoodTitle(stored, draft, TA).titleIds).toEqual([TL, TA, RS]);
    expect(toggleFoodTitle(stored, draft, TL).titleIds).toEqual([RS]);
  });

  it("asks for a rate to the sen, and a rate before anybody may claim", () => {
    expect(foodClaimProblems({ perDay: "20", titleIds: [TL] })).toEqual([]);
    expect(foodClaimProblems({ perDay: "", titleIds: [] })).toEqual([]);
    expect(foodClaimProblems({ perDay: "12.505", titleIds: [] })).toEqual(["The rate a day must be an amount from RM 0 to RM 100,000, to the sen."]);
    expect(foodClaimProblems({ perDay: "RM 20", titleIds: [] })).toHaveLength(1);
    expect(foodClaimProblems({ perDay: "100001", titleIds: [] })).toHaveLength(1);
    expect(foodClaimProblems({ perDay: "", titleIds: [TL] })).toEqual(["Set the rate a day before ticking who may claim it."]);
    expect(foodClaimProblems({ perDay: "0", titleIds: [TL] })).toEqual(["Set the rate a day before ticking who may claim it."]);
  });

  it("saves the rate as a number and the titles once, in order", () => {
    expect(foodClaimToSave({ perDay: " 12.50 ", titleIds: [TL, RS, TL] })).toEqual({ perDay: 12.5, titleIds: [RS, TL].sort() });
    expect(foodClaimToSave({ perDay: "", titleIds: [] })).toEqual({ perDay: null, titleIds: [] });
  });
});

describe("validFoodClaimToSave — the server's own check", () => {
  it("lets through what the form saves", () => {
    expect(validFoodClaimToSave({ perDay: 20, titleIds: [TL] })).toBe(true);
    expect(validFoodClaimToSave({ perDay: 20.1, titleIds: [] })).toBe(true);
    expect(validFoodClaimToSave({ perDay: null, titleIds: [] })).toBe(true);
  });

  it("refuses anything else", () => {
    expect(validFoodClaimToSave(null)).toBe(false);
    expect(validFoodClaimToSave({ perDay: -1, titleIds: [] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: 12.345, titleIds: [] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: "20", titleIds: [] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: null, titleIds: [TL] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: 0, titleIds: [TL] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: 20, titleIds: ["Team Leader"] })).toBe(false);
    expect(validFoodClaimToSave({ perDay: 20, titleIds: TL })).toBe(false);
  });
});
