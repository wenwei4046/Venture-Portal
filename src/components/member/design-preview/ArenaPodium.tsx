import { Icon, initials } from "../MemberUI";
import type { Standing } from "./arena-model";
import s from "./ArenaPodium.module.css";

type Place = 1 | 2 | 3;
const places: readonly Place[] = [2, 1, 3];

export function ArenaPodium({ rows, format, onOpen, heading = "Top 3", selfId = "jia" }: {
  rows: readonly Standing[];
  format: (value: number) => string;
  onOpen?: () => void;
  heading?: string;
  selfId?: string;
}) {
  // Competition ranks can skip a place after a tie. Keep the supplied positions
  // and every tied person, rather than assigning medals by array index.
  const leaders = rows.filter(row => row.eligible && Number.isFinite(row.value)
    && row.value > 0 && row.position !== null && places.includes(row.position as Place));
  if (leaders.length === 0) return null;
  const hasTies = places.some(place => leaders.filter(row => row.position === place).length > 1);
  // Tied winners share equal visual space. A single tall centre lane would hide
  // people below the fold and imply that the first listed winner matters more.
  const lanes = hasTies
    ? [...leaders].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(person => ({ place: person.position as Place, people: [person], key: person.id }))
    : places.map(place => ({ place, people: leaders.filter(row => row.position === place), key: String(place) }));

  const content = <>
    <span className={s.heading}>{heading}<span className={s.headingNote}>{hasTies ? "Shared honours" : "Leading the way"}</span></span>
    {places.map(place => {
      const count = leaders.filter(row => row.position === place).length;
      return count > 0 && <span key={place} className={s.visuallyHidden}>Rank {place}{count > 1 ? ", tied" : ""}</span>;
    })}
    <span className={`${s.stage} ${hasTies ? s.tiedStage : ""}`} data-count={leaders.length} data-wrapped={hasTies && leaders.length > 3 || undefined}>
      {lanes.map(({ place, people, key }) => {
        if (people.length === 0) return <span className={s.emptyPlace} key={key} aria-hidden="true" />;
        const joint = leaders.filter(row => row.position === place).length > 1;
        return <span className={s.lane} data-place={place} key={key}>
          <span className={s.people}>
            {people.map(person => <span className={s.person} key={person.id}>
              <span className={s.avatarWrap}>
                {place === 1 && <svg className={s.laurel} viewBox="0 0 88 72" fill="none" aria-hidden="true">
                  <path d="M27 61C9 51 6 33 14 19M61 61C79 51 82 33 74 19" />
                  <path d="M17 49C8 49 5 44 5 39C12 39 17 42 17 49ZM12 36C4 33 4 27 6 23C12 26 15 30 12 36ZM14 23C9 16 12 11 16 8C20 14 20 19 14 23ZM25 58C16 62 11 58 9 53C16 50 21 52 25 58ZM71 49C80 49 83 44 83 39C76 39 71 42 71 49ZM76 36C84 33 84 27 82 23C76 26 73 30 76 36ZM74 23C79 16 76 11 72 8C68 14 68 19 74 23ZM63 58C72 62 77 58 79 53C72 50 67 52 63 58Z" className={s.laurelLeaves} />
                </svg>}
                <span className={s.avatar} aria-hidden="true">{initials(person.name)}</span>
                <span className={s.medalBadge} aria-hidden="true">{place === 1 ? <Icon name="trophy" size={13} /> : place}</span>
              </span>
              {hasTies && <span className={s.jointPlace}>{joint ? "Joint" : "Rank"} #{place}</span>}
              <span className={s.name}>{person.name}{person.id === selfId && <span className={s.you}>You</span>}</span>
              <span className={s.value}>{format(person.value)}</span>
            </span>)}
          </span>
          <span className={s.platform} aria-hidden="true"><span className={s.plate}>{place}</span>{place === 1 && !hasTies && <span className={s.champion}>Champion</span>}</span>
        </span>;
      })}
    </span>
    {onOpen && <span className={s.footer}>View full ranking<Icon name="arrow" size={17} /></span>}
  </>;

  return <section className={s.region} aria-label="Top three">
    {onOpen
      ? <button type="button" className={`${s.card} ${s.link}`} onClick={onOpen}>{content}</button>
      : <div className={s.card}>{content}</div>}
  </section>;
}
