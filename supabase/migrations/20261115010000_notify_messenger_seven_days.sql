-- The hourly reminders know Messenger's 7 days (2026-11-15 — Human Agent approved 2026-11-14; the owner: "提醒文字 要改").
-- Since the approval a person may answer a Messenger chat up to 7 days after the customer's last message (WhatsApp stays
-- 24 hours). notify_crm_due (production's body, md5 a82903e686357369360bc1659db54616) still told of a Messenger chat
-- "closing" at 21–24 h and stopped telling of one waiting for a reply after 24 h. Four statements swapped in place:
--   2. a chat waiting for its person's reply is told of while its window is open — 7 days on Messenger;
--   5. the window-closing reminder comes in the window's last 3 hours — 165–168 h on Messenger — and names it.
-- Each swap is refused unless its anchor is there exactly once; nothing else in the body moves.

DO $migration$
DECLARE
  v_def text;
  v_win constant text := $q$CASE WHEN c.channel = 'messenger' THEN interval '7 days' ELSE interval '24 hours' END$q$;
  swaps text[][] := ARRAY[
    ARRAY[$q$AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - interval '24 hours'$q$,
          $q$AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - $q$ || v_win],
    ARRAY[$q$AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'$q$,
          $q$AND c.last_customer_at <= v_now - ($q$ || v_win || $q$ - interval '3 hours') AND c.last_customer_at > v_now - $q$ || v_win],
    ARRAY[$q$r.last_customer_at + interval '24 hours' - v_now$q$,
          $q$r.last_customer_at + CASE WHEN r.channel = 'messenger' THEN interval '7 days' ELSE interval '24 hours' END - v_now$q$],
    ARRAY[$q$|| ' h — reply before the 24-hour window shuts';$q$,
          $q$|| CASE WHEN r.channel = 'messenger' THEN ' h — reply before Messenger''s 7-day window shuts' ELSE ' h — reply before the 24-hour window shuts' END;$q$]];
  i int;
BEGIN
  SELECT pg_get_functiondef('public.notify_crm_due()'::regprocedure) INTO v_def;
  FOR i IN 1 .. array_length(swaps, 1) LOOP
    IF (length(v_def) - length(replace(v_def, swaps[i][1], ''))) / length(swaps[i][1]) <> 1 THEN
      RAISE EXCEPTION 'notify_crm_due: swap % is not there exactly once — compare it with production first', i;
    END IF;
    v_def := replace(v_def, swaps[i][1], swaps[i][2]);
  END LOOP;
  EXECUTE v_def;
END $migration$;
