/**
 * A person's first and last name (2026-10-17 — the user: "大家的名字需要拆分为 first name 和 last name。在这里的层面上就只放
 * first name", then "full name = loo wen wei, wen wei ( first name ) , loo ( last name )"). The full name stays the one
 * on their IC; the two are what the apps call them — `hr_staff_costs.first_name` / `last_name`, filled from the full
 * name by the database (`person_name_parts`, mig 20261017180000) and HR's to change on the person's page. Pure.
 */

/** Surnames as Malaysia writes them — `person_name_parts`'s own list (person-name.test.ts holds the two alike). */
export const CHINESE_SURNAMES: readonly string[] = [
  'ANG', 'AU', 'AW', 'BAI', 'BEH', 'BOEY', 'BONG', 'BOO', 'BOON', 'CAI', 'CHAI', 'CHAM', 'CHAN', 'CHANG', 'CHAO', 'CHAU', 'CHEAH',
  'CHEE', 'CHEN', 'CHENG', 'CHEOK', 'CHEONG', 'CHEOW', 'CHEW', 'CHIA', 'CHIAM', 'CHIANG', 'CHIEW', 'CHIN', 'CHING', 'CHIONG',
  'CHIU', 'CHNG', 'CHOI', 'CHONG', 'CHOO', 'CHOOI', 'CHOONG', 'CHOW', 'CHOY', 'CHU', 'CHUA', 'CHUAH', 'CHUNG', 'DENG', 'DING',
  'DONG', 'FAN', 'FANG', 'FENG', 'FONG', 'FOO', 'FOONG', 'FU', 'FUNG', 'GAN', 'GAO', 'GOH', 'GOI', 'GUAN', 'GUO', 'HAN', 'HEE',
  'HENG', 'HEW', 'HII', 'HIEW', 'HO', 'HOH', 'HON', 'HONG', 'HOO', 'HOOI', 'HOON', 'HOR', 'HU', 'HUANG', 'HUNG', 'JIANG', 'JIN',
  'JONG', 'KAM', 'KAN', 'KANG', 'KEE', 'KEK', 'KHAW', 'KHEW', 'KHO', 'KHOH', 'KHONG', 'KHOO', 'KHOR', 'KIEW', 'KOAY', 'KOH', 'KOK',
  'KONG', 'KOO', 'KOOI', 'KU', 'KUAN', 'KUEH', 'KUNG', 'KWAN', 'KWEK', 'KWOK', 'LAI', 'LAM', 'LAU', 'LAW', 'LEE', 'LEONG', 'LEOW',
  'LEU', 'LEW', 'LI', 'LIAN', 'LIANG', 'LIAO', 'LIAU', 'LIEW', 'LIM', 'LIN', 'LING', 'LIONG', 'LIOW', 'LIU', 'LO', 'LOH', 'LOI',
  'LOKE', 'LONG', 'LOO', 'LOOI', 'LOW', 'LU', 'LUI', 'LUM', 'LUO', 'LYE', 'MAH', 'MAK', 'MOK', 'NEO', 'NG', 'NGIAM', 'NGOH', 'NGU',
  'OH', 'ONG', 'OOI', 'OON', 'OW', 'PANG', 'PEH', 'PENG', 'PHANG', 'PHOON', 'PHUA', 'POH', 'POON', 'QUAH', 'QUEK', 'SAW', 'SEAH',
  'SEE', 'SEET', 'SEOH', 'SEOW', 'SHI', 'SIA', 'SIAH', 'SIM', 'SIOW', 'SIT', 'SIU', 'SNG', 'SOH', 'SONG', 'SOO', 'SOON', 'SOONG',
  'SU', 'SUN', 'TAI', 'TAM', 'TAN', 'TANG', 'TAY', 'TEE', 'TEH', 'TENG', 'TEO', 'TEOH', 'THAM', 'THEAN', 'THEN', 'THIEN', 'THONG',
  'TIAH', 'TIAN', 'TIEW', 'TING', 'TIONG', 'TOH', 'TONG', 'TSANG', 'TSE', 'TUNG', 'WAI', 'WANG', 'WEE', 'WONG', 'WOO', 'WOON', 'WU',
  'XIE', 'XU', 'YAM', 'YANG', 'YAP', 'YAU', 'YEAP', 'YEE', 'YEO', 'YEOH', 'YEONG', 'YEOW', 'YEP', 'YEUNG', 'YEW', 'YIP', 'YONG',
  'YOONG', 'YU', 'YUEN', 'ZENG', 'ZHANG', 'ZHAO', 'ZHENG', 'ZHONG', 'ZHOU', 'ZHU',
]

/** What starts a father's name: IZZUL BIN ISMAIL, KUMAR A/L RAJ, … SYED NOR HAKIM. */
export const FATHERS_NAME_STARTS: readonly string[] = ['BIN', 'BINTI', 'BT', 'BTE', 'A/L', 'A/P', 'S/O', 'D/O', 'SYED', 'SHARIFAH']

/** One Chinese syllable as Malaysia romanises it: KAR, JIUN, HUAN, SHUANG, YIK — never JAMES, JOEY or JONAS. */
export const CHINESE_SYLLABLE = /^(B|CHH|CH|C|D|F|GH|G|H|J|KH|KW|K|L|M|NG|NY|N|PH|P|Q|SH|SY|S|TSH|TS|TH|T|W|X|Y|ZH|Z)?(IAO|IAU|UAI|UEI|OOI|AI|AO|AU|EA|EE|EI|EO|EU|IA|IE|IO|IU|OA|OI|OO|OU|UA|UE|UI|UO|A|E|I|O|U)(NG|N|M|K|P|T|H|W|Y|R)?$/

const SURNAMES = new Set(CHINESE_SURNAMES)
const FATHERS = new Set(FATHERS_NAME_STARTS)
const surname = (word: string) => SURNAMES.has(word.toUpperCase())
const syllable = (word: string) => CHINESE_SYLLABLE.test(word.toUpperCase())

/**
 * The database's own split (`person_name_parts`): "LOO WEN WEI" → WEN WEI · LOO, "JAMES SEOW" → JAMES · SEOW,
 * "WONG JOEY" → JOEY · WONG, "IZZUL BIN ISMAIL" → IZZUL · BIN ISMAIL, "PETER" → PETER · none — and two words it cannot
 * tell apart ("MEI TING", "CHIN YING") stay the first name whole.
 */
export function nameParts(name: string | null | undefined): { first: string | null; last: string | null } {
  const full = (name ?? '').trim().replace(/\s+/g, ' ')
  if (!full) return { first: null, last: null }
  const words = full.split(' ')
  const rest = (from: number) => words.slice(from).join(' ')
  if (words.length === 1) return { first: full, last: null }
  const father = words.findIndex((word, i) => i > 0 && FATHERS.has(word.toUpperCase()))
  if (father > 0) return { first: words.slice(0, father).join(' '), last: rest(father) }
  if (words.length > 2) return surname(words[0]) ? { first: rest(1), last: words[0] } : { first: words[0], last: rest(1) }
  if (surname(words[0]) && !syllable(words[1])) return { first: words[1], last: words[0] }
  if (surname(words[1]) && !syllable(words[0])) return { first: words[0], last: words[1] }
  return { first: full, last: null }
}

/** The two as a page shows them: what the record keeps — or, for a row with neither (read before they were filled), the full name's parts. */
export function keptParts(row: { employee_name: string; first_name?: string | null; last_name?: string | null }): { first: string | null; last: string | null } {
  if (row.first_name == null && row.last_name == null) return nameParts(row.employee_name)
  return { first: row.first_name ?? null, last: row.last_name ?? null }
}

/**
 * Their full name as People Management lists it (2026-10-20, the user: "我要他的名字显示全名（也就是 Last Name 加 First
 * Name）… 点进去之后才分别看到他的 First Name 跟 Last Name"): the last name, then the first — LOO WEN WEI, TEOH CHEA HUAN —
 * except a last name that is a father's name (IZZUL BIN ISMAIL, NUR HAKIIMAH ZULAIKHA SYED NOR HAKIM), which follows the
 * first as their IC writes it. One of the two alone is the name; neither kept, the full name on their IC.
 */
export function fullNameOf(row: { employee_name: string; first_name?: string | null; last_name?: string | null }): string {
  const first = (row.first_name ?? '').trim().replace(/\s+/g, ' ')
  const last = (row.last_name ?? '').trim().replace(/\s+/g, ' ')
  if (!first || !last) return first || last || row.employee_name.trim().replace(/\s+/g, ' ')
  return FATHERS.has(last.split(' ')[0].toUpperCase()) ? `${first} ${last}` : `${last} ${first}`
}

/** What an app greets them by: the first name the record keeps, else the full name's (`nameParts`). */
export function greetingName(name: string | null | undefined, first?: string | null): string {
  return first?.trim() || nameParts(name).first || ''
}
