import { Icon } from "../MemberUI";
import s from "./TodayKpiSummary.module.css";

interface Props {
  items: readonly { label: string; quantity: number | null }[];
  total: number | null;
  threshold: number | null;
  hit: boolean | null;
}

export default function TodayKpiSummary({ items, total, threshold, hit }: Props) {
  return <section className={s.section} aria-label="KPI item summary">
    <div className={s.heading}>
      <span className={s.icon}><Icon name="receipt" size={25} /></span>
      <div><h3>KPI items</h3><p>One combined total this month</p></div>
    </div>
    <div className={s.totalRow}>
      <div className={s.total}><strong>{total ?? "—"}</strong><span>items</span></div>
      <span className={s.status} data-hit={hit === true ? "yes" : "no"}>
        {hit === true && <Icon name="check" size={15} />}
        {total === null ? "Awaiting data" : threshold === null ? "Quantity recorded" : hit ? "Threshold hit" : "In progress"}
      </span>
    </div>
    {threshold !== null && <p className={s.threshold}>Shared threshold <strong>{threshold} items</strong> · any mix</p>}
    <dl className={s.breakdown}>
      {items.map((item, index) => <div className={s.item} key={item.label}>
        {index > 0 && <span className={s.plus} aria-hidden="true">+</span>}
        <dt>{item.label}</dt><dd>{item.quantity ?? "—"}</dd>
      </div>)}
    </dl>
  </section>;
}
