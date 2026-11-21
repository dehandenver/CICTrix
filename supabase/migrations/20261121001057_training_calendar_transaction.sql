-- ============================================================================
-- Training calendar: atomic event + competency saves, consistent snapshots,
-- and replay-safe creation.
--
-- Before this migration the browser saved a training in two requests (the
-- session row, then its competency tags), so a tag failure left new content with
-- old tags, a lost create response could be retried into a duplicate session,
-- and an edit form was hydrated from a list row plus a separate tag query.
--
--   * training_sessions.client_request_id  — nullable uuid, unique when set. A
--     create retried with the same request id returns the original session.
--   * public.read_training_calendar_event  — one consistent snapshot of a
--     session, its competency tags, and a deterministic revision.
--   * public.save_training_calendar_event  — validates and writes whitelisted
--     session content and reconciles the competency joins in one transaction,
--     guarded by that revision, and keeps the existing three-day lock for
--     competency changes as well as content.
--
-- Both RPCs are SECURITY INVOKER and require an active LND or ADMIN user (or
-- service_role). Existing table grants and policies are NOT changed: the
-- training_* tables stay as open as they were, so this does not stop an old
-- client from writing the tables directly. That hardening is tracked separately.
-- ============================================================================

BEGIN;

-- ── 1. Create-replay identity ───────────────────────────────────────────────
DO $$
DECLARE
  existing_type text;
  existing_def  text;
BEGIN
  SELECT data_type INTO existing_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'training_sessions' AND column_name = 'client_request_id';
  IF existing_type IS NOT NULL AND existing_type <> 'uuid' THEN
    RAISE EXCEPTION
      'public.training_sessions.client_request_id already exists as % (expected uuid). Resolve manually before migrating.',
      existing_type;
  END IF;

  SELECT indexdef INTO existing_def
    FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'training_sessions_client_request_id_uidx';
  IF existing_def IS NOT NULL AND (
       existing_def NOT ILIKE 'CREATE UNIQUE INDEX%'
    OR existing_def NOT ILIKE '%(client_request_id)%'
    OR existing_def NOT ILIKE '%WHERE (client_request_id IS NOT NULL)%'
  ) THEN
    RAISE EXCEPTION
      'training_sessions_client_request_id_uidx already exists with a different definition: %. Resolve manually before migrating.',
      existing_def;
  END IF;
END $$;

ALTER TABLE public.training_sessions
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_client_request_id_uidx
  ON public.training_sessions (client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ── 2. Actor check shared by both RPCs ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.training_calendar_assert_actor()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = auth.uid()
       AND r.is_active IS TRUE
       AND upper(btrim(r.role)) IN ('LND', 'ADMIN')
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Only an active L&D or Admin user can manage training calendar events.'
    USING ERRCODE = '42501', HINT = 'not_authorized';
END;
$$;

-- ── 3. Deterministic revision ───────────────────────────────────────────────
-- Covers every editable field, the operational status, updated_at, and the
-- ordered (competency, weight) joins. Office viewing (last_viewed_by_office) and
-- roster workflow columns are deliberately excluded so they never invalidate an
-- open edit. Timestamps are rendered in UTC so the hash does not depend on the
-- caller's TimeZone setting.
CREATE OR REPLACE FUNCTION public.training_calendar_tag_digest(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    jsonb_agg(jsonb_build_array(c.competency_id, c.weight) ORDER BY c.competency_id),
    '[]'::jsonb)
  FROM public.training_competencies c
  WHERE c.session_id = p_session_id
$$;

CREATE OR REPLACE FUNCTION public.training_calendar_revision(p_session public.training_sessions, p_tags jsonb)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT md5(jsonb_build_object(
    'title', p_session.title,
    'category', p_session.category,
    'scheduled_date', to_char(p_session.scheduled_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'end_date', to_char(p_session.end_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'instructor_name', p_session.instructor_name,
    'location', p_session.location,
    'objectives', to_jsonb(p_session.objectives),
    'description', p_session.description,
    'materials', p_session.materials,
    'prerequisites', p_session.prerequisites,
    'status', p_session.status,
    'capacity', p_session.capacity,
    'updated_at', to_char(p_session.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'competencies', coalesce(p_tags, '[]'::jsonb)
  )::text)
$$;

-- ── 4. Whitelisted event content ────────────────────────────────────────────
-- Applies only the keys present in p_event on top of p_base (NULL for a create)
-- and validates the result. Keys outside the whitelist are ignored, so a client
-- cannot set program_id, roster columns, client_request_id, or timestamps.
CREATE OR REPLACE FUNCTION public.training_calendar_merge_event(p_base public.training_sessions, p_event jsonb)
RETURNS public.training_sessions
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.training_sessions;
  allowed_categories CONSTANT text[] :=
    ARRAY['Cultural Transformation', 'Employee Development', 'Leadership', 'Technical'];
  allowed_statuses CONSTANT text[] :=
    ARRAY['Scheduled', 'Ongoing', 'Completed', 'Cancelled'];
BEGIN
  IF p_event IS NULL OR jsonb_typeof(p_event) <> 'object' THEN
    RAISE EXCEPTION 'The training details are missing.'
      USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  r := p_base;

  IF p_event ? 'title' THEN
    r.title := nullif(btrim(p_event ->> 'title'), '');
  END IF;
  IF r.title IS NULL THEN
    RAISE EXCEPTION 'Title is required.' USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  IF p_event ? 'category' THEN
    r.category := nullif(btrim(p_event ->> 'category'), '');
  END IF;
  IF r.category IS NOT NULL AND NOT (r.category = ANY (allowed_categories)) THEN
    RAISE EXCEPTION 'Category must be one of the L&D training categories.'
      USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  IF p_event ? 'scheduled_date' THEN
    r.scheduled_date := (p_event ->> 'scheduled_date')::timestamptz;
  END IF;
  IF r.scheduled_date IS NULL THEN
    RAISE EXCEPTION 'Start date is required.' USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  IF p_event ? 'end_date' THEN
    r.end_date := nullif(btrim(p_event ->> 'end_date'), '')::timestamptz;
  END IF;
  IF r.end_date IS NOT NULL AND r.end_date < r.scheduled_date THEN
    RAISE EXCEPTION 'End date cannot be before the start date.'
      USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  IF p_event ? 'instructor_name' THEN
    r.instructor_name := nullif(btrim(p_event ->> 'instructor_name'), '');
  END IF;
  IF p_event ? 'location' THEN
    r.location := nullif(btrim(p_event ->> 'location'), '');
  END IF;
  IF p_event ? 'description' THEN
    r.description := nullif(btrim(p_event ->> 'description'), '');
  END IF;
  IF p_event ? 'materials' THEN
    r.materials := nullif(btrim(p_event ->> 'materials'), '');
  END IF;
  IF p_event ? 'prerequisites' THEN
    r.prerequisites := nullif(btrim(p_event ->> 'prerequisites'), '');
  END IF;

  IF p_event ? 'objectives' THEN
    IF jsonb_typeof(p_event -> 'objectives') = 'array' THEN
      SELECT coalesce(array_agg(btrim(o.value) ORDER BY o.ord), '{}'::text[])
        INTO r.objectives
        FROM jsonb_array_elements_text(p_event -> 'objectives') WITH ORDINALITY AS o(value, ord)
       WHERE btrim(o.value) <> '';
    ELSIF jsonb_typeof(p_event -> 'objectives') = 'null' THEN
      r.objectives := '{}'::text[];
    ELSE
      RAISE EXCEPTION 'Objectives must be a list.' USING ERRCODE = '22023', HINT = 'invalid_event';
    END IF;
  ELSIF r.objectives IS NULL THEN
    r.objectives := '{}'::text[];
  END IF;

  IF p_event ? 'status' THEN
    r.status := nullif(btrim(p_event ->> 'status'), '');
  ELSIF r.status IS NULL THEN
    r.status := 'Scheduled';
  END IF;
  IF r.status IS NULL OR NOT (r.status = ANY (allowed_statuses)) THEN
    RAISE EXCEPTION 'Status must be Scheduled, Ongoing, Completed, or Cancelled.'
      USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  IF p_event ? 'capacity' THEN
    r.capacity := (p_event ->> 'capacity')::integer;
  ELSIF r.capacity IS NULL THEN
    r.capacity := 0;
  END IF;
  IF r.capacity IS NULL OR r.capacity < 0 THEN
    RAISE EXCEPTION 'Capacity must be zero or more.' USING ERRCODE = '22023', HINT = 'invalid_event';
  END IF;

  RETURN r;
END;
$$;

-- ── 5. Consistent snapshot ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.read_training_calendar_event(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM public.training_calendar_assert_actor();

  -- One statement, one snapshot: the session, its tags, and the revision cannot
  -- straddle a concurrent save.
  SELECT jsonb_build_object(
           'event', jsonb_build_object(
             'id', s.id,
             'title', s.title,
             'category', s.category,
             'scheduled_date', s.scheduled_date,
             'end_date', s.end_date,
             'instructor_name', s.instructor_name,
             'location', s.location,
             'objectives', to_jsonb(s.objectives),
             'description', s.description,
             'materials', s.materials,
             'prerequisites', s.prerequisites,
             'status', s.status,
             'capacity', s.capacity,
             'roster_finalized_at', s.roster_finalized_at
           ),
           'competencies', coalesce((
             SELECT jsonb_agg(
                      jsonb_build_object('id', t.id, 'name', t.name, 'name_key', t.name_key, 'category', t.category)
                      ORDER BY t.name, t.id)
               FROM public.training_competencies c
               JOIN public.training_competency_tags t ON t.id = c.competency_id
              WHERE c.session_id = s.id
           ), '[]'::jsonb),
           'competency_ids', coalesce((
             SELECT jsonb_agg(c.competency_id ORDER BY c.competency_id)
               FROM public.training_competencies c
              WHERE c.session_id = s.id
           ), '[]'::jsonb),
           'revision', public.training_calendar_revision(s, public.training_calendar_tag_digest(s.id))
         )
    INTO result
    FROM public.training_sessions s
   WHERE s.id = p_session_id;

  IF result IS NULL THEN
    RAISE EXCEPTION 'That training no longer exists.'
      USING ERRCODE = 'P0002', HINT = 'session_not_found';
  END IF;

  RETURN result;
END;
$$;

-- ── 6. Atomic create / update ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_training_calendar_event(
  p_session_id        uuid,
  p_event             jsonb,
  p_competency_ids    uuid[],
  p_expected_revision text,
  p_request_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing      public.training_sessions%ROWTYPE;
  merged        public.training_sessions%ROWTYPE;
  target_tags   uuid[];
  current_tags  uuid[];
  tags_changed  boolean := false;
  stamp_update  boolean := false;
  is_locked     boolean;
  valid_tags    integer;
  next_updated_at timestamptz;
BEGIN
  PERFORM public.training_calendar_assert_actor();

  IF p_competency_ids IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[])
      INTO target_tags
      FROM unnest(p_competency_ids) AS x
     WHERE x IS NOT NULL;
  END IF;

  -- ── Create ────────────────────────────────────────────────────────────────
  IF p_session_id IS NULL THEN
    IF p_request_id IS NULL THEN
      RAISE EXCEPTION 'A request id is required to create a training.'
        USING ERRCODE = '22023', HINT = 'missing_request_id';
    END IF;
    IF p_event IS NULL THEN
      RAISE EXCEPTION 'The training details are missing.'
        USING ERRCODE = '22023', HINT = 'invalid_event';
    END IF;

    -- Serialise concurrent attempts that carry the same request id, so a retry
    -- always sees the first attempt's committed row.
    PERFORM pg_advisory_xact_lock(hashtextextended('training_calendar_create:' || p_request_id::text, 0));

    SELECT * INTO existing FROM public.training_sessions WHERE client_request_id = p_request_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', existing.id,
        'revision', public.training_calendar_revision(existing, public.training_calendar_tag_digest(existing.id)));
    END IF;

    merged := public.training_calendar_merge_event(NULL::public.training_sessions, p_event);

    IF target_tags IS NOT NULL THEN
      SELECT count(*) INTO valid_tags FROM public.training_competency_tags WHERE id = ANY (target_tags);
      IF valid_tags <> coalesce(array_length(target_tags, 1), 0) THEN
        RAISE EXCEPTION 'One or more competencies no longer exist.'
          USING ERRCODE = '23503', HINT = 'invalid_competency';
      END IF;
    END IF;

    INSERT INTO public.training_sessions (
      program_id, title, category, scheduled_date, end_date, instructor_name, location,
      objectives, description, materials, prerequisites, status, capacity, client_request_id
    ) VALUES (
      NULL, merged.title, merged.category, merged.scheduled_date, merged.end_date, merged.instructor_name,
      merged.location, merged.objectives, merged.description, merged.materials, merged.prerequisites,
      merged.status, merged.capacity, p_request_id
    )
    RETURNING * INTO existing;

    IF target_tags IS NOT NULL AND coalesce(array_length(target_tags, 1), 0) > 0 THEN
      INSERT INTO public.training_competencies (session_id, competency_id)
      SELECT existing.id, t FROM unnest(target_tags) AS t
      ON CONFLICT (session_id, competency_id) DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
      'id', existing.id,
      'revision', public.training_calendar_revision(existing, public.training_calendar_tag_digest(existing.id)));
  END IF;

  -- ── Update ────────────────────────────────────────────────────────────────
  IF p_expected_revision IS NULL OR btrim(p_expected_revision) = '' THEN
    RAISE EXCEPTION 'The loaded revision is required to save changes.'
      USING ERRCODE = '22023', HINT = 'missing_revision';
  END IF;

  -- Lock the session, then its joins in id order.
  SELECT * INTO existing FROM public.training_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That training no longer exists.'
      USING ERRCODE = 'P0002', HINT = 'session_not_found';
  END IF;
  PERFORM 1 FROM public.training_competencies WHERE session_id = existing.id ORDER BY id FOR UPDATE;

  IF public.training_calendar_revision(existing, public.training_calendar_tag_digest(existing.id))
       IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'This training changed since it was loaded. Reload it and try again.'
      USING ERRCODE = '40001', HINT = 'revision_conflict';
  END IF;

  IF target_tags IS NOT NULL THEN
    SELECT count(*) INTO valid_tags FROM public.training_competency_tags WHERE id = ANY (target_tags);
    IF valid_tags <> coalesce(array_length(target_tags, 1), 0) THEN
      RAISE EXCEPTION 'One or more competencies no longer exist.'
        USING ERRCODE = '23503', HINT = 'invalid_competency';
    END IF;
  END IF;

  merged := existing;
  IF p_event IS NOT NULL THEN
    merged := public.training_calendar_merge_event(existing, p_event);
  END IF;

  SELECT coalesce(array_agg(competency_id ORDER BY competency_id), '{}'::uuid[])
    INTO current_tags
    FROM public.training_competencies
   WHERE session_id = existing.id;
  tags_changed := target_tags IS NOT NULL AND target_tags IS DISTINCT FROM current_tags;

  -- The same three-day cutoff as trg_enforce_training_lock, applied here so the
  -- refusal carries a hint, and extended to competency changes. Operational
  -- status changes and unchanged saves stay allowed.
  is_locked := now() >= (existing.scheduled_date - interval '3 days');
  IF is_locked AND (
       tags_changed
    OR merged.title           IS DISTINCT FROM existing.title
    OR merged.category        IS DISTINCT FROM existing.category
    OR merged.scheduled_date  IS DISTINCT FROM existing.scheduled_date
    OR merged.end_date        IS DISTINCT FROM existing.end_date
    OR merged.capacity        IS DISTINCT FROM existing.capacity
    OR merged.objectives      IS DISTINCT FROM existing.objectives
    OR merged.instructor_name IS DISTINCT FROM existing.instructor_name
    OR merged.location        IS DISTINCT FROM existing.location
    OR merged.description     IS DISTINCT FROM existing.description
    OR merged.materials       IS DISTINCT FROM existing.materials
    OR merged.prerequisites   IS DISTINCT FROM existing.prerequisites
  ) THEN
    RAISE EXCEPTION 'Training is locked: editing closes 3 days before start.'
      USING ERRCODE = '23514', HINT = 'training_locked';
  END IF;

  stamp_update := p_event IS NOT NULL OR tags_changed;
  IF stamp_update THEN
    -- Strictly advance updated_at, even if the stored value is ahead of this
    -- server's clock, so Office Training Courses can flag "Updated by L&D".
    next_updated_at := GREATEST(
      clock_timestamp(),
      coalesce(existing.updated_at, to_timestamp(0)) + interval '1 millisecond');

    UPDATE public.training_sessions
       SET title           = merged.title,
           category        = merged.category,
           scheduled_date  = merged.scheduled_date,
           end_date        = merged.end_date,
           instructor_name = merged.instructor_name,
           location        = merged.location,
           objectives      = merged.objectives,
           description     = merged.description,
           materials       = merged.materials,
           prerequisites   = merged.prerequisites,
           status          = merged.status,
           capacity        = merged.capacity,
           updated_at      = next_updated_at
     WHERE id = existing.id;
  END IF;

  IF tags_changed THEN
    -- Delete only removed tags and insert only added ones, so unchanged joins
    -- keep their ids and weights.
    DELETE FROM public.training_competencies
     WHERE session_id = existing.id
       AND NOT (competency_id = ANY (target_tags));

    INSERT INTO public.training_competencies (session_id, competency_id)
    SELECT existing.id, t FROM unnest(target_tags) AS t
    ON CONFLICT (session_id, competency_id) DO NOTHING;
  END IF;

  SELECT * INTO existing FROM public.training_sessions WHERE id = existing.id;

  RETURN jsonb_build_object(
    'id', existing.id,
    'revision', public.training_calendar_revision(existing, public.training_calendar_tag_digest(existing.id)));
END;
$$;

-- ── 7. Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.training_calendar_assert_actor() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_calendar_tag_digest(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_calendar_revision(public.training_sessions, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.training_calendar_merge_event(public.training_sessions, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_training_calendar_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_training_calendar_event(uuid, jsonb, uuid[], text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.training_calendar_assert_actor() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_calendar_tag_digest(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_calendar_revision(public.training_sessions, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.training_calendar_merge_event(public.training_sessions, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_training_calendar_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_training_calendar_event(uuid, jsonb, uuid[], text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
