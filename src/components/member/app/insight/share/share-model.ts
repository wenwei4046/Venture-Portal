import {
  holdersLine, pctLabel, proposedHolders, shareStatus, stepLabel, waitingOn,
  type ShareAnswer, type ShareRequest, type ShareTone,
} from "@/lib/member/share-requests";
import { klDayTime, rm2, shortDay } from "../../format";

/**
 * What a share request's sheet shows (2026-10-21): the bill, the split it asks for, each colleague's answer, its trail —
 * and what the reader may do on it: a colleague still to answer accepts or declines; its salesperson withdraws it while it
 * is open. View as reads it and does nothing.
 */
export interface ShareRequestVM {
  id: string;
  orderNo: string;
  sub: string;
  status: string;
  tone: ShareTone;
  facts: { l: string; v: string }[];
  parts: { id: string; name: string; pct: string; amount: string; answer: string; tone: ShareTone }[];
  log: { what: string; who: string; when: string; note: string | null; dot: "good" | "bad" | null }[];
  canAnswer: boolean;
  canWithdraw: boolean;
}

const ANSWER: Record<ShareAnswer, { text: string; tone: ShareTone }> = {
  pending: { text: "Waiting", tone: "warn" },
  accepted: { text: "Accepted", tone: "good" },
  declined: { text: "Declined", tone: "bad" },
};

export function shareRequestVM(r: ShareRequest, staffId: string, readOnly: boolean): ShareRequestVM {
  const status = shareStatus(r);
  const total = r.bill?.total ?? 0;
  const open = r.status === "partner" || r.status === "hr";
  const facts = [
    { l: "Bill total", v: rm2(total) },
    { l: "Salesperson", v: r.owner.name },
    { l: open || r.status === "approved" ? "Split" : "Split asked", v: holdersLine(proposedHolders(r)) },
    ...(r.note ? [{ l: "Note", v: r.note }] : []),
    ...(r.decisionNote ? [{ l: r.status === "rejected" ? "HR’s reason" : "HR’s note", v: r.decisionNote }] : []),
  ];
  return {
    id: r.id,
    orderNo: r.orderNo,
    sub: [r.bill?.customer || "Walk-in", r.bill?.venue || null, r.bill?.date ? shortDay(r.bill.date) : null].filter(Boolean).join(" · "),
    status: status.text,
    tone: status.tone,
    facts,
    parts: r.parts.map(p => ({
      id: p.id, name: p.name, pct: pctLabel(p.pct), amount: rm2(Math.round(total * p.pct * 100) / 100),
      answer: ANSWER[p.answer].text, tone: ANSWER[p.answer].tone,
    })),
    log: r.events.map(e => ({
      what: stepLabel(e.step), who: e.name, when: klDayTime(e.at), note: e.note,
      dot: e.step === "declined" || e.step === "rejected" || e.step === "cancelled" ? "bad" : e.step === "approved" || e.step === "accepted" ? "good" : null,
    })),
    canAnswer: !readOnly && waitingOn(r, staffId),
    canWithdraw: !readOnly && r.mine === "owner" && open,
  };
}
