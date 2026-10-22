-- The first name is the person's own name, the last name their surname (2026-10-17 — the user, the same afternoon
-- 20261017153000 split the names by the first word: "full name = loo wen wei, wen wei ( first name ) , loo ( last
-- name )"). The Revenue app greets "Hello, WEN WEI".
--
-- The roster is written every way, so the split reads the name before it cuts it (person_name_parts):
--   · one word — the first name                                             PETER → PETER · none
--   · BIN / BINTI / BT / BTE / A/L / A/P / S/O / D/O, or a SYED / SHARIFAH after the first word, starts the
--     father's name — the first name is what comes before it                IZZUL BIN ISMAIL → IZZUL · BIN ISMAIL
--   · three words or more: a Chinese surname in front is the last name      LOO WEN WEI → WEN WEI · LOO
--     — otherwise the first word is their own name (an English one)         RACHAEL LIM SHEUE LYNN → RACHAEL · LIM SHEUE LYNN
--   · two words are split only where one is a Chinese surname and the
--     other plainly not a Chinese syllable (an English name)                WONG JOEY → JOEY · WONG, JAMES SEOW → JAMES · SEOW
--     — otherwise the two are the first name: a given name on its own       MEI TING → MEI TING · none, CHIN YING → CHIN YING
--     and a surname with one syllable read alike, and the whole name is the safer greeting.
-- HR changes either on the person's page (People › person › Identity). src/lib/person-name.ts is the same split for
-- the apps (person-name.test.ts holds the two lists and the syllable to this file's).
--
-- 1. person_name_parts — the split above (its only callers are the trigger, the backfill and the two snapshots).
-- 2. Everybody whose two are still the first-word split is split again; a name HR set is left.
-- 3. The snapshots' fallback (a record with no first name) is the same split, not the first word — one fragment
--    swapped in place in PRODUCTION's bodies, refused unless it is there exactly once (CLAUDE.md › Do NOT).

-- ── 1. A full name's parts ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.person_name_parts(p_name text, OUT first_name text, OUT last_name text)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  -- Surnames as Malaysia writes them (Hokkien, Cantonese, Hakka, Teochew, Hainanese, Foochow, Mandarin).
  c_surnames CONSTANT text[] := ARRAY[
    'ANG','AU','AW','BAI','BEH','BOEY','BONG','BOO','BOON','CAI','CHAI','CHAM','CHAN','CHANG','CHAO','CHAU','CHEAH',
    'CHEE','CHEN','CHENG','CHEOK','CHEONG','CHEOW','CHEW','CHIA','CHIAM','CHIANG','CHIEW','CHIN','CHING','CHIONG',
    'CHIU','CHNG','CHOI','CHONG','CHOO','CHOOI','CHOONG','CHOW','CHOY','CHU','CHUA','CHUAH','CHUNG','DENG','DING',
    'DONG','FAN','FANG','FENG','FONG','FOO','FOONG','FU','FUNG','GAN','GAO','GOH','GOI','GUAN','GUO','HAN','HEE',
    'HENG','HEW','HII','HIEW','HO','HOH','HON','HONG','HOO','HOOI','HOON','HOR','HU','HUANG','HUNG','JIANG','JIN',
    'JONG','KAM','KAN','KANG','KEE','KEK','KHAW','KHEW','KHO','KHOH','KHONG','KHOO','KHOR','KIEW','KOAY','KOH','KOK',
    'KONG','KOO','KOOI','KU','KUAN','KUEH','KUNG','KWAN','KWEK','KWOK','LAI','LAM','LAU','LAW','LEE','LEONG','LEOW',
    'LEU','LEW','LI','LIAN','LIANG','LIAO','LIAU','LIEW','LIM','LIN','LING','LIONG','LIOW','LIU','LO','LOH','LOI',
    'LOKE','LONG','LOO','LOOI','LOW','LU','LUI','LUM','LUO','LYE','MAH','MAK','MOK','NEO','NG','NGIAM','NGOH','NGU',
    'OH','ONG','OOI','OON','OW','PANG','PEH','PENG','PHANG','PHOON','PHUA','POH','POON','QUAH','QUEK','SAW','SEAH',
    'SEE','SEET','SEOH','SEOW','SHI','SIA','SIAH','SIM','SIOW','SIT','SIU','SNG','SOH','SONG','SOO','SOON','SOONG',
    'SU','SUN','TAI','TAM','TAN','TANG','TAY','TEE','TEH','TENG','TEO','TEOH','THAM','THEAN','THEN','THIEN','THONG',
    'TIAH','TIAN','TIEW','TING','TIONG','TOH','TONG','TSANG','TSE','TUNG','WAI','WANG','WEE','WONG','WOO','WOON','WU',
    'XIE','XU','YAM','YANG','YAP','YAU','YEAP','YEE','YEO','YEOH','YEONG','YEOW','YEP','YEUNG','YEW','YIP','YONG',
    'YOONG','YU','YUEN','ZENG','ZHANG','ZHAO','ZHENG','ZHONG','ZHOU','ZHU'];
  -- What starts a father's name.
  c_fathers CONSTANT text[] := ARRAY['BIN','BINTI','BT','BTE','A/L','A/P','S/O','D/O','SYED','SHARIFAH'];
  -- One Chinese syllable as Malaysia romanises it: KAR, JIUN, HUAN, SHUANG, YIK — never JAMES, JOEY or JONAS.
  c_syllable CONSTANT text := '^(B|CHH|CH|C|D|F|GH|G|H|J|KH|KW|K|L|M|NG|NY|N|PH|P|Q|SH|SY|S|TSH|TS|TH|T|W|X|Y|ZH|Z)?(IAO|IAU|UAI|UEI|OOI|AI|AO|AU|EA|EE|EI|EO|EU|IA|IE|IO|IU|OA|OI|OO|OU|UA|UE|UI|UO|A|E|I|O|U)(NG|N|M|K|P|T|H|W|Y|R)?$';
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_words text[];
  v_n     int;
BEGIN
  IF v_name = '' THEN RETURN; END IF;
  v_words := string_to_array(v_name, ' ');
  v_n := cardinality(v_words);
  IF v_n = 1 THEN first_name := v_name; RETURN; END IF;
  FOR i IN 2 .. v_n LOOP
    IF upper(v_words[i]) = ANY (c_fathers) THEN
      first_name := array_to_string(v_words[1:i - 1], ' ');
      last_name := array_to_string(v_words[i:v_n], ' ');
      RETURN;
    END IF;
  END LOOP;
  IF v_n > 2 THEN
    IF upper(v_words[1]) = ANY (c_surnames) THEN
      first_name := array_to_string(v_words[2:v_n], ' ');
      last_name := v_words[1];
    ELSE
      first_name := v_words[1];
      last_name := array_to_string(v_words[2:v_n], ' ');
    END IF;
  ELSIF upper(v_words[1]) = ANY (c_surnames) AND upper(v_words[2]) !~ c_syllable THEN
    first_name := v_words[2];
    last_name := v_words[1];
  ELSIF upper(v_words[2]) = ANY (c_surnames) AND upper(v_words[1]) !~ c_syllable THEN
    first_name := v_words[1];
    last_name := v_words[2];
  ELSE
    first_name := v_name;
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.person_name_parts(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_name_parts(text) TO authenticated, service_role;

-- ── 2. Everybody still on the first-word split ──────────────────────────────

-- The first-word split, written out (the function no longer makes it): a row whose two are exactly that was never
-- touched by HR, so it takes the new split; any other is HR's and stays. The trigger is not woken (no full name
-- changes).
UPDATE public.hr_staff_costs s
   SET first_name = w.new_first, last_name = w.new_last
  FROM (SELECT x.id, x.n, p.first_name AS new_first, p.last_name AS new_last
          FROM (SELECT id, employee_name, regexp_replace(btrim(coalesce(employee_name, '')), '\s+', ' ', 'g') AS n
                  FROM public.hr_staff_costs) x
          CROSS JOIN LATERAL public.person_name_parts(x.employee_name) p) w
 WHERE w.id = s.id
   AND s.first_name IS NOT DISTINCT FROM nullif(split_part(w.n, ' ', 1), '')
   AND s.last_name IS NOT DISTINCT FROM nullif(substr(w.n, length(split_part(w.n, ' ', 1)) + 2), '')
   AND (s.first_name IS DISTINCT FROM w.new_first OR s.last_name IS DISTINCT FROM w.new_last);

-- ── 3. The snapshots' fallback: the same split ──────────────────────────────

DO $migration$
DECLARE
  v_fn   record;
  v_def  text;
BEGIN
  FOR v_fn IN
    SELECT * FROM (VALUES
      ('member_data_snapshot',
       $old$'firstName',coalesce(nullif(btrim(s.first_name),''),split_part(btrim(s.employee_name),' ',1)),$old$,
       $new$'firstName',coalesce(nullif(btrim(s.first_name),''),(public.person_name_parts(s.employee_name)).first_name),$new$),
      ('member_principal_snapshot',
       $old$split_part(btrim(coalesce(nullif(u.name,''),'Principal')),' ',1)),$old$,
       $new$(public.person_name_parts(coalesce(nullif(u.name,''),'Principal'))).first_name),$new$)
    ) AS x(fn, old_text, new_text)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p
     WHERE p.proname = v_fn.fn AND p.pronamespace = 'public'::regnamespace
       AND pg_get_function_identity_arguments(p.oid) = 'p_full boolean';
    IF v_def IS NULL THEN RAISE EXCEPTION '%(p_full boolean) is missing', v_fn.fn; END IF;
    IF (length(v_def) - length(replace(v_def, v_fn.old_text, ''))) / length(v_fn.old_text) <> 1 THEN
      RAISE EXCEPTION '%: the first name''s fallback is not there exactly once', v_fn.fn;
    END IF;
    EXECUTE replace(v_def, v_fn.old_text, v_fn.new_text);
  END LOOP;
END
$migration$;
