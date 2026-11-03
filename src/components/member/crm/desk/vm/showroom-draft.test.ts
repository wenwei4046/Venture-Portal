import { describe, expect, it } from "vitest";
import type { CrmRoom } from "@/lib/member/crm-data";
import { draftFromStore, draftOf, draftToStore } from "./showrooms";

// A showroom's draft (2026-11-03, the owner: "帮我在 showroom 的部分做一个存为草稿"): kept in crm_showroom_drafts, read back
// over the showroom as it stands; the showroom itself is untouched until Save.
const room = { id: "kl", name: "Kuala Lumpur Showroom", address: "Jalan 1", active: true, slots: ["10:00", "14:00@012"], cap: 2, weekly: [0], blocks: [],
  photo: null, mapGoogle: null, mapWaze: null, remarks: "" } as unknown as CrmRoom;

describe("a showroom's draft", () => {
  it("keeps everything but a photo picked and not uploaded, and comes back as it was", () => {
    const d = { ...draftOf(room), dispName: "KL Flagship", limit: 4, photoFile: new File(["x"], "a.jpg") };
    const stored = JSON.parse(JSON.stringify(draftToStore(d)));
    expect(stored).not.toHaveProperty("photoFile");
    const back = draftFromStore(stored, room);
    expect(back).toEqual({ ...d, photoFile: null });
  });
  it("a field the draft lacks, or one that is not what it should be, keeps the showroom's", () => {
    const back = draftFromStore({ dispName: "New name", limit: "lots", times: "x", weekDays: [1, 9] }, room);
    expect(back.dispName).toBe("New name");
    expect(back.limit).toBe(2);
    expect(back.times).toEqual(draftOf(room).times);
    expect(back.weekDays).toEqual([1]);
    expect(back.addr).toBe("Jalan 1");
    expect(back.id).toBe("kl");
  });
  it("nothing kept reads as the showroom", () => {
    expect(draftFromStore(null, room)).toEqual(draftOf(room));
    expect(draftFromStore({ dispName: "New one" }, null).id).toBeNull();
  });
});
