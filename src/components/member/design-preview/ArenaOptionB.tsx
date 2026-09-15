"use client";
import { Icon } from "../MemberUI";
import s from "./ArenaOptionB.module.css";
export default function ArenaOptionB({ score, position, population, onNavigate }: {
  score: number; position: number; population: number; onNavigate: () => void;
}) {
  return <section className={s.summary} aria-label="Your Championship points">
    <div className={s.summaryLabel}><span>Championship points</span><span>Preview</span></div>
    <p className={s.salesAmount}><span>{new Intl.NumberFormat("en-MY", { maximumFractionDigits: 2 }).format(score)}</span><span className={s.currency}>pts</span></p>
    <p className={s.standing}><strong>#{position}</strong><span>of {population} qualified members</span></p>
    <button className={s.more} onClick={onNavigate}><span>See points breakdown</span><Icon name="arrow" size={18} /></button>
  </section>;
}
