import { describe, expect, it } from "vitest";
import { detectRequestedTime } from "./crm-datetime";

// Wed 30 Sep 2026, 4pm local.
const now = new Date(2026, 8, 30, 16, 0);
const when = (text: string) => {
  const d = detectRequestedTime(text, now);
  return d && `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

describe("detectRequestedTime", () => {
  it("reads English", () => {
    expect(when("Can we change to Saturday 3pm?")).toBe("3/10 15:00");
    expect(when("tomorrow 2:30pm ok?")).toBe("1/10 14:30");
    expect(when("How about 5 Oct 11am")).toBe("5/10 11:00");
    expect(when("Oct 5 at 11.30am")).toBe("5/10 11:30");
    expect(when("6/10 4pm can?")).toBe("6/10 16:00");
    expect(when("next saturday 10am")).toBe("10/10 10:00");
    expect(when("today 6pm")).toBe("30/9 18:00");
  });

  it("reads Malay", () => {
    expect(when("Boleh tukar esok pukul 3 petang?")).toBe("1/10 15:00");
    expect(when("Sabtu 10 pagi boleh?")).toBe("3/10 10:00");
    expect(when("lusa jam 11 pagi")).toBe("2/10 11:00");
  });

  it("reads Chinese", () => {
    expect(when("可以改到星期六下午3点吗？")).toBe("3/10 15:00");
    expect(when("明天下午两点半")).toBe("1/10 14:30");
    expect(when("10月5号上午11点")).toBe("5/10 11:00");
    expect(when("周日晚上7点")).toBe("4/10 19:00");
  });

  it("treats a bare 'at 3' as the afternoon, inside shop hours", () => {
    expect(when("Saturday at 3")).toBe("3/10 15:00");
  });

  it("needs both a day and a time", () => {
    expect(when("3pm can?")).toBeNull();
    expect(when("Saturday can?")).toBeNull();
    expect(when("Thanks, see you!")).toBeNull();
  });

  it("never proposes the past", () => {
    expect(when("today 10am")).toBeNull();
  });

  it("means next week when a weekday is today", () => {
    expect(when("Wednesday 11am")).toBe("7/10 11:00");
  });
});
