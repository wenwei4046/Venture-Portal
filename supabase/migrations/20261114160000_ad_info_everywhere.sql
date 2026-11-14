-- Every customer from an ad shows that ad in Customer info (2026-11-14 — the owner: "帮我检查目前和接下来的所有广告资讯，在
-- customer info 要都能收到", then "搜寻到广告link"). Checked on production that evening, two gaps:
--
--   1. An Instant Form customer whose ad link Meta did not answer for in time (Mr Lim, 14 Nov 12:14 — the webhook asks
--      Meta for the ad's post with a 3 s limit). Six other customers of the very same ad had its link. Now any customer
--      whose ad is known but whose link is not takes the link (and its photo / video kind) of the newest customer of that
--      ad that has one — on arrival, and whenever its ad is set (trigger `crm_contacts_ad_link_fill`).
--
--   2. A Messenger copy of an Instant Form customer. After the form, Meta writes the answers into Messenger as the
--      customer's message ("Hello! I filled out your form …\nWhatsApp number: +60…") — with no ad on it — so the CRM made
--      a second customer with no ad (13 of them 13–14 Nov, the duplicates the owner saw). The Instant Form customer always
--      arrived first (1–18 s before). Now that message gives its Messenger customer the ad of the Instant Form customer
--      whose number it names (trigger `crm_messages_form_twin_ad`), and an Instant Form customer arriving after such a
--      message gives the ad back the other way (trigger `crm_contacts_form_twin_ad`). Only a customer with no ad of its
--      own is ever filled; nothing is merged or deleted.
--
-- Both run inside the ingest that writes the row (service role); none is anybody's to call. Then the gaps of today are
-- filled the same way.

CREATE OR REPLACE FUNCTION public.crm_form_phone(p_body text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF p_body IS NULL OR p_body !~* 'filled out your form' THEN RETURN NULL; END IF;
  v := regexp_replace(coalesce(substring(p_body from '(?i)whatsapp number:\s*([+0-9 ()-]{6,30})'), ''), '\D', '', 'g');
  IF v LIKE '0%' THEN v := '6' || v; END IF;      -- as crm_ingest_lead keeps an Instant Form number
  RETURN nullif(v, '');
END $$;

CREATE OR REPLACE FUNCTION public.crm_contacts_ad_link_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ad_source_id IS NOT NULL AND NEW.ad_source_url IS NULL THEN
    SELECT c.ad_source_url, coalesce(NEW.ad_media, c.ad_media) INTO NEW.ad_source_url, NEW.ad_media
      FROM crm_contacts c
     WHERE c.ad_source_id = NEW.ad_source_id AND c.ad_source_url IS NOT NULL AND c.id IS DISTINCT FROM NEW.id
     ORDER BY c.created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.crm_messages_form_twin_ad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; w crm_contacts;
BEGIN
  v_phone := crm_form_phone(NEW.body);
  IF v_phone IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO w FROM crm_contacts
   WHERE channel = 'whatsapp' AND external_id = v_phone AND lead_form->>'kind' = 'instant' AND ad_source_id IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;
  IF w.id IS NULL THEN RETURN NULL; END IF;
  UPDATE crm_contacts SET ad_source_id = w.ad_source_id, ad_headline = coalesce(ad_headline, w.ad_headline),
         ad_source_url = coalesce(ad_source_url, w.ad_source_url), ad_media = coalesce(ad_media, w.ad_media)
   WHERE id = NEW.contact_id AND channel = 'messenger' AND ad_source_id IS NULL;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_messages_form_twin_ad: %', SQLERRM;   -- never stops a message being kept
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.crm_contacts_form_twin_ad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.channel <> 'whatsapp' OR NEW.lead_form->>'kind' IS DISTINCT FROM 'instant' OR NEW.ad_source_id IS NULL THEN RETURN NULL; END IF;
  UPDATE crm_contacts c SET ad_source_id = NEW.ad_source_id, ad_headline = coalesce(c.ad_headline, NEW.ad_headline),
         ad_source_url = coalesce(c.ad_source_url, NEW.ad_source_url), ad_media = coalesce(c.ad_media, NEW.ad_media)
   WHERE c.channel = 'messenger' AND c.ad_source_id IS NULL AND c.created_at > now() - interval '7 days'
     AND EXISTS (SELECT 1 FROM crm_messages m WHERE m.contact_id = c.id AND m.direction = 'in' AND crm_form_phone(m.body) = NEW.external_id);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_contacts_form_twin_ad: %', SQLERRM;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.crm_form_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_contacts_ad_link_fill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_messages_form_twin_ad() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_contacts_form_twin_ad() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS crm_contacts_ad_link_fill ON public.crm_contacts;
CREATE TRIGGER crm_contacts_ad_link_fill BEFORE INSERT OR UPDATE OF ad_source_id, ad_source_url ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_contacts_ad_link_fill();
DROP TRIGGER IF EXISTS crm_messages_form_twin_ad ON public.crm_messages;
CREATE TRIGGER crm_messages_form_twin_ad AFTER INSERT ON public.crm_messages
  FOR EACH ROW WHEN (NEW.direction = 'in') EXECUTE FUNCTION public.crm_messages_form_twin_ad();
DROP TRIGGER IF EXISTS crm_contacts_form_twin_ad ON public.crm_contacts;
CREATE TRIGGER crm_contacts_form_twin_ad AFTER INSERT OR UPDATE OF ad_source_id ON public.crm_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_contacts_form_twin_ad();

-- Today's gaps.
UPDATE public.crm_contacts c SET ad_source_id = w.ad_source_id, ad_headline = coalesce(c.ad_headline, w.ad_headline),
       ad_source_url = coalesce(c.ad_source_url, w.ad_source_url), ad_media = coalesce(c.ad_media, w.ad_media)
  FROM public.crm_messages m, public.crm_contacts w
 WHERE m.contact_id = c.id AND m.direction = 'in' AND c.channel = 'messenger' AND c.ad_source_id IS NULL
   AND w.channel = 'whatsapp' AND w.lead_form->>'kind' = 'instant' AND w.ad_source_id IS NOT NULL
   AND w.external_id = public.crm_form_phone(m.body);
UPDATE public.crm_contacts SET ad_source_url = NULL WHERE ad_source_id IS NOT NULL AND ad_source_url IS NULL;  -- fires the fill
