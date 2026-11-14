import { notMineStatus, type NotMineRequest, type NotMineTone } from "@/lib/member/not-mine-requests";
import { klDayTime, rm2, shortDay } from "../../format";

/**
 * What a Not my order request's sheet shows (2026-11-14): the bill, the reason sent, HR's answer and the trail — and
 * whether the reader may withdraw it (its salesperson, while it is with HR). View as reads it and does nothing.
 */
export interface NotMineRequestVM {
  id: string;
  orderNo: string;
  sub: string;
  status: string;
  tone: NotMineTone;
  facts: { l: string; v: string }[];
  log: { what: string; who: string; when: string; note: string | null; dot: "good" | "bad" | null }[];
  canWithdraw: boolean;
}

export function notMineRequestVM(r: NotMineRequest, readOnly: boolean): NotMineRequestVM {
  const status = notMineStatus(r);
  const facts = [
    { l: "Bill total", v: rm2(r.bill?.total ?? 0) },
    { l: "Reason", v: r.reason },
    ...(r.decisionNote ? [{ l: r.status === "rejected" ? "HR’s reason" : "HR’s note", v: r.decisionNote }] : []),
  ];
  const log: NotMineRequestVM["log"] = [{ what: "Sent to HR", who: r.staff.name, when: klDayTime(r.createdAt), note: null, dot: null }];
  if (r.status === "cancelled") log.push({ what: "Withdrawn", who: r.staff.name, when: klDayTime(r.updatedAt), note: null, dot: "bad" });
  if (r.status === "approved" || r.status === "rejected") {
    log.push({
      what: r.status === "approved" ? "Approved by HR · not counted" : "Rejected by HR",
      who: r.decidedByName ?? "HR", when: klDayTime(r.decidedAt ?? r.updatedAt), note: r.decisionNote,
      dot: r.status === "approved" ? "good" : "bad",
    });
  }
  return {
    id: r.id,
    orderNo: r.orderNo,
    sub: [r.bill?.customer || "Walk-in", r.bill?.venue || null, r.bill?.date ? shortDay(r.bill.date) : null].filter(Boolean).join(" · "),
    status: status.text,
    tone: status.tone,
    facts,
    log,
    canWithdraw: !readOnly && r.status === "hr",
  };
}
