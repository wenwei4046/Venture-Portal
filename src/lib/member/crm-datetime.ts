/**
 * Finds the date and time a customer asks for in a chat message, so the
 * salesperson can confirm it in one tap instead of retyping it.
 *
 * Covers the ways Malaysian customers write it in English, Malay and Chinese:
 * "Saturday 3pm", "tomorrow 2:30pm", "3 Oct 11am", "3/10 4pm" (day/month),
 * "esok pukul 3 petang", "Sabtu 10 pagi", "星期六下午3点", "明天下午两点半".
 * It needs BOTH a day and a time — "3pm" alone or "Saturday" alone is not
 * enough to move an appointment — and only ever looks forward from `now`.
 * The salesperson always confirms; nothing here books anything.
 */

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sun(day)?|ahad)\b|(星期|礼拜|禮拜|周|週)(日|天)/i, 0],
  [/\b(mon(day)?|isnin)\b|(星期|礼拜|禮拜|周|週)一/i, 1],
  [/\b(tue(s|sday)?|selasa)\b|(星期|礼拜|禮拜|周|週)二/i, 2],
  [/\b(wed(nesday)?|rabu)\b|(星期|礼拜|禮拜|周|週)三/i, 3],
  [/\b(thu(r|rs|rsday)?|khamis)\b|(星期|礼拜|禮拜|周|週)四/i, 4],
  [/\b(fri(day)?|jumaat)\b|(星期|礼拜|禮拜|周|週)五/i, 5],
  [/\b(sat(urday)?|sabtu)\b|(星期|礼拜|禮拜|周|週)六/i, 6],
];

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, mac: 2, mei: 4, julai: 6, ogos: 7, oktober: 9, disember: 11,
};

const CN_DIGITS: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** "三" → 3, "十一" → 11, "十二" → 12, "12" → 12. */
function cnNumber(text: string): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (text.length === 1) return CN_DIGITS[text] ?? null;
  if (text.startsWith("十")) return 10 + (CN_DIGITS[text.slice(1)] ?? 0);
  if (text.endsWith("十")) return (CN_DIGITS[text[0]] ?? 0) * 10;
  if (text.length === 3 && text[1] === "十") return (CN_DIGITS[text[0]] ?? 0) * 10 + (CN_DIGITS[text[2]] ?? 0);
  return null;
}

function findTime(text: string): { hour: number; minute: number } | null {
  // Chinese: 下午3点, 下午三点半, 上午10点30分, 晚上7点
  const cn = text.match(/(上午|早上|中午|下午|傍晚|晚上)?\s*([0-9一二两兩三四五六七八九十]{1,3})\s*(点|點|时|時)\s*(半|([0-9一二三四五六七八九十]{1,3})\s*分?)?/);
  if (cn) {
    let hour = cnNumber(cn[2]);
    if (hour !== null && hour <= 24) {
      const minute = cn[4] === "半" ? 30 : cn[5] ? cnNumber(cn[5]) ?? 0 : 0;
      if (/下午|傍晚|晚上/.test(cn[1] ?? "") && hour < 12) hour += 12;
      if (cn[1] === "中午" && hour < 11) hour += 12;
      return { hour, minute };
    }
  }
  // English / Malay: 3pm, 3.30 pm, 3:30pm, 15:00, pukul 3 petang, 10 pagi
  const ampm = text.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?![a-z])/i);
  if (ampm) {
    let hour = Number(ampm[1]) % 12;
    if (/p/i.test(ampm[3])) hour += 12;
    return { hour, minute: Number(ampm[2] ?? 0) };
  }
  const malay = text.match(/\b(?:pukul|jam)?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(pagi|tengah hari|petang|malam)\b/i);
  if (malay) {
    let hour = Number(malay[1]) % 12;
    const part = malay[3].toLowerCase();
    if (part === "petang" || part === "malam" || (part === "tengah hari" && hour < 11)) hour += 12;
    return { hour, minute: Number(malay[2] ?? 0) };
  }
  const h24 = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) return { hour: Number(h24[1]), minute: Number(h24[2]) };
  const pukul = text.match(/\b(?:pukul|jam|at)\s+(\d{1,2})\b/i);
  if (pukul) {
    // "at 3" / "pukul 3" with no am/pm: shop hours are 8am–8pm, so 1–7 means the afternoon.
    const n = Number(pukul[1]);
    return { hour: n >= 1 && n <= 7 ? n + 12 : n, minute: 0 };
  }
  return null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function findDay(text: string, now: Date): Date | null {
  const today = startOfDay(now);
  const plus = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

  if (/day after tomorrow|\blusa\b|后天|後天/i.test(text)) return plus(2);
  if (/\btomorrow\b|\besok\b|明天|明日/i.test(text)) return plus(1);
  if (/\btoday\b|\btonight\b|hari ini|malam ini|今天|今晚/i.test(text)) return today;

  // 3 Oct / 3 October / Oct 3
  const dm = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b/i);
  const md = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  for (const [dayText, monthText] of [dm ? [dm[1], dm[2]] : null, md ? [md[2], md[1]] : null].filter(Boolean) as [string, string][]) {
    const month = MONTHS[monthText.toLowerCase()] ?? MONTHS[monthText.toLowerCase().slice(0, 3)];
    if (month === undefined) continue;
    const d = new Date(today.getFullYear(), month, Number(dayText));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // 3/10 — Malaysia writes day/month
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (slash) {
    const d = new Date(today.getFullYear(), Number(slash[2]) - 1, Number(slash[1]));
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // 10月3号 / 3号
  const cnDate = text.match(/(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*(号|號|日)/);
  if (cnDate) {
    const month = cnDate[1] ? Number(cnDate[1]) - 1 : today.getMonth();
    const d = new Date(today.getFullYear(), month, Number(cnDate[2]));
    if (d < today) {
      if (cnDate[1]) d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
    }
    return d;
  }
  // Weekday: the next one ("Saturday" said on a Saturday means next week); "next Saturday" skips a week.
  for (const [pattern, weekday] of WEEKDAYS) {
    if (!pattern.test(text)) continue;
    let ahead = (weekday - today.getDay() + 7) % 7 || 7;
    if (/\bnext\b|minggu depan|下(个|個)?(星期|礼拜|禮拜|周|週)/i.test(text) && ahead < 7) ahead += 7;
    return plus(ahead);
  }
  return null;
}

/** The date and time asked for in a message, or null when it does not name both (or names the past). */
export function detectRequestedTime(text: string, now: Date = new Date()): Date | null {
  const day = findDay(text, now);
  const t = findTime(text);
  if (!day || !t) return null;
  const at = new Date(day);
  at.setHours(t.hour, t.minute, 0, 0);
  return at > now ? at : null;
}
