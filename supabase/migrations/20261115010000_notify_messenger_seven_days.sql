-- The hourly reminders know Messenger's 7 days (2026-11-15 — Human Agent approved 2026-11-14; the owner: "提醒文字 要改",
-- then "Messenger 聊天剩最后的小时不用提醒"). Since the approval a person may answer a Messenger chat up to 7 days after
-- the customer's last message (WhatsApp stays 24 hours). notify_crm_due (production's body, md5
-- a82903e686357369360bc1659db54616) still told of a Messenger chat "closing" at 21–24 h, and stopped telling of one waiting
-- for a reply after 24 h. Two statements swapped in place:
--   2. a chat waiting for its person's reply is told of while its window is open — 7 days on Messenger;
--   5. the window-closing reminder is WhatsApp's alone — no Messenger chat is told of its window closing.
-- Each swap is refused unless its anchor is there exactly once; nothing else in the body moves.

DO $migration$
DECLARE
  v_def text;
  swaps text[][] := ARRAY[
    ARRAY[$q$AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - interval '24 hours'$q$,
          $q$AND coalesce(c.last_customer_at, coalesce(m.sent_at, m.created_at)) > v_now - CASE WHEN c.channel = 'messenger' THEN interval '7 days' ELSE interval '24 hours' END$q$],
    ARRAY[$q$AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'$q$,
          $q$AND c.channel <> 'messenger' AND c.last_customer_at <= v_now - interval '21 hours' AND c.last_customer_at > v_now - interval '24 hours'$q$]];
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
