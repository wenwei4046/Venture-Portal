-- ============================================================================
-- 20261011070100_documentation_published_letter_type.sql
-- People › Documentation (2026-10-11): a published Letter shows its letter type
-- ("Warning letter") on Publish's Published list, as the handoff draws it
-- (pubVals: typeName = the letter type's name for a Letter). hr_documentation()
-- again from 20261011070000, one expression changed: the row's kind.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_documentation()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_action(ARRAY['documentation.view']) THEN
    RAISE EXCEPTION 'Documentation access is required' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH dn AS (
      SELECT dp.id, dp.name, count(*)::int AS n
        FROM public.departments dp
        JOIN public.hr_staff_costs s ON s.department_id = dp.id AND s.status = 'active'
       GROUP BY dp.id, dp.name
    ), ppl AS (
      SELECT s.id, s.employee_name, s.employee_code, coalesce(t.name, s.designation) AS title, s.department_id,
             lv.rank AS level, dn.n AS dept_n, dn.name AS dept_name
        FROM public.hr_staff_costs s
        LEFT JOIN public.titles t ON t.id = s.title_id
        LEFT JOIN public.title_levels lv ON lv.id = t.level_id
        LEFT JOIN dn ON dn.id = s.department_id
       WHERE s.status = 'active'
    )
    SELECT jsonb_build_object(
      'departments', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', dn.id, 'name', dn.name, 'people', dn.n) ORDER BY dn.n DESC, dn.name), '[]'::jsonb) FROM dn),
      'people', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.employee_name, 'code', p.employee_code,
                   'title', p.title, 'departmentId', p.department_id)
                   ORDER BY p.dept_n DESC NULLS LAST, p.dept_name NULLS LAST, p.level DESC NULLS LAST, p.employee_code NULLS LAST, p.employee_name), '[]'::jsonb)
                 FROM ppl p),
      'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', d.id, 'ref', d.ref, 'name', d.name, 'fileName', d.file_name, 'contentType', d.content_type,
                     'size', d.file_size, 'departmentIds', to_jsonb(d.department_ids),
                     'departments', (SELECT coalesce(jsonb_agg(dp.name ORDER BY array_position(d.department_ids, dp.id)), '[]'::jsonb)
                                       FROM public.departments dp WHERE dp.id = ANY (d.department_ids)),
                     'uploadedAt', d.uploaded_at, 'uploadedBy', d.uploaded_by_name, 'deletedAt', d.deleted_at,
                     'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                                  ORDER BY e.created_at, e.id), '[]'::jsonb)
                                  FROM public.hr_document_events e WHERE e.document_id = d.id)
                   ) ORDER BY d.uploaded_at DESC, d.ref DESC), '[]'::jsonb)
                   FROM public.hr_documents d),
      'letterTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'compulsory', t.compulsory,
                       'count', (SELECT count(*) FROM public.hr_person_letters l WHERE l.letter_type_id = t.id))
                       ORDER BY t.sort_order, t.created_at), '[]'::jsonb)
                     FROM public.hr_letter_types t WHERE t.deleted_at IS NULL),
      'letters', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', l.id, 'ref', l.ref, 'staffId', l.staff_id, 'staffName', s.employee_name,
                   'typeId', l.letter_type_id, 'typeName', coalesce(t.name, l.type_name),
                   'fileName', l.file_name, 'contentType', l.content_type, 'size', l.file_size,
                   'filedAt', l.filed_at, 'filedBy', l.filed_by_name, 'source', l.source,
                   'readAt', rc.read_at, 'acknowledgedAt', rc.acknowledged_at,
                   'events', (SELECT coalesce(jsonb_agg(jsonb_build_object('what', e.what, 'at', e.created_at, 'who', e.actor_name, 'note', e.note)
                                ORDER BY e.created_at, e.id), '[]'::jsonb)
                                FROM public.hr_letter_events e WHERE e.letter_id = l.id)
                 ) ORDER BY l.filed_at DESC, l.ref DESC), '[]'::jsonb)
                 FROM public.hr_person_letters l
                 JOIN public.hr_staff_costs s ON s.id = l.staff_id
                 LEFT JOIN public.hr_letter_types t ON t.id = l.letter_type_id
                 LEFT JOIN public.member_memos m ON m.id = l.memo_id
                 LEFT JOIN LATERAL (
                   SELECT min(r.read_at) AS read_at, min(r.acknowledged_at) AS acknowledged_at
                     FROM public.member_memo_receipts r
                    WHERE r.memo_id = l.memo_id AND r.user_id = s.user_id AND r.version = m.version
                 ) rc ON true),
      'publishTypes', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'builtin', p.builtin)
                        ORDER BY p.sort_order, p.created_at), '[]'::jsonb)
                      FROM public.hr_publish_types p WHERE p.deleted_at IS NULL),
      'published', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', m.id, 'kind', coalesce((SELECT lt.name FROM public.hr_letter_types lt WHERE lt.id = m.letter_type_id), m.kind),
                     'title', m.title, 'publishedAt', m.published_at,
                     'audience', m.audience_label,
                     'subDepartments', (SELECT coalesce(jsonb_agg(sd.name ORDER BY sd.name), '[]'::jsonb)
                                          FROM public.member_memo_audiences a JOIN public.comm_sub_departments sd ON sd.id = a.sub_department_id
                                         WHERE a.memo_id = m.id),
                     'attachmentName', m.attachment_name, 'saved', m.saved_to_records,
                     'recipients', (SELECT count(*) FROM public.member_memo_recipients r WHERE r.memo_id = m.id),
                     'acknowledged', (SELECT count(DISTINCT x.user_id) FROM public.member_memo_receipts x
                                       WHERE x.memo_id = m.id AND x.version = m.version AND x.acknowledged_at IS NOT NULL)
                   ) ORDER BY m.published_at DESC, m.id), '[]'::jsonb)
                   FROM public.member_memos m WHERE m.origin = 'publish')
    )
  );
END
$$;
REVOKE ALL ON FUNCTION public.hr_documentation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_documentation() TO authenticated;
