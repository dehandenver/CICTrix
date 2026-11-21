-- ============================================================================
-- Tests for public.read_training_calendar_event / public.save_training_calendar_event
-- and the training_sessions.client_request_id create-replay identity.
--
-- Run against a LOCAL or disposable database only, as the postgres role:
--   psql -X -U postgres -d external_hire_test -v ON_ERROR_STOP=1 -f training_calendar_transaction.test.sql
--
-- Everything runs inside one transaction that ends in ROLLBACK, so it leaves no
-- data behind. All fixtures are synthetic labels. Success prints
-- "ALL TRAINING CALENDAR TRANSACTION TESTS PASSED"; any failure aborts with
-- "TEST FAILED: ...".
-- ============================================================================

BEGIN;

SET LOCAL search_path = public, pg_temp;

-- ── Fixture identities ──────────────────────────────────────────────────────
-- lnd      00000000-0000-4000-8000-0000000c0001  active LND
-- admin    00000000-0000-4000-8000-0000000c0002  active ADMIN
-- rsp      00000000-0000-4000-8000-0000000c0003  active RSP (not allowed)
-- stranger 00000000-0000-4000-8000-0000000c0004  no user_roles row
-- retired  00000000-0000-4000-8000-0000000c0005  inactive LND
-- tags     00000000-0000-4000-8000-0000000d000{1..4}
INSERT INTO public.user_roles (user_id, email, role, name, is_active) VALUES
  ('00000000-0000-4000-8000-0000000c0001', 'lnd.tc@example.test',     'LND',   'LND Actor',     true),
  ('00000000-0000-4000-8000-0000000c0002', 'admin.tc@example.test',   'ADMIN', 'Admin Actor',   true),
  ('00000000-0000-4000-8000-0000000c0003', 'rsp.tc@example.test',     'RSP',   'RSP Actor',     true),
  ('00000000-0000-4000-8000-0000000c0005', 'retired.tc@example.test', 'LND',   'Retired LND',   false);

INSERT INTO public.training_competency_tags (id, name, name_key) VALUES
  ('00000000-0000-4000-8000-0000000d0001', 'TC Tag One',   'tc tag one'),
  ('00000000-0000-4000-8000-0000000d0002', 'TC Tag Two',   'tc tag two'),
  ('00000000-0000-4000-8000-0000000d0003', 'TC Tag Three', 'tc tag three'),
  ('00000000-0000-4000-8000-0000000d0004', 'TC Tag Four',  'tc tag four');

-- ── Helpers ─────────────────────────────────────────────────────────────────

CREATE FUNCTION pg_temp.call_save_as(
  p_role text, p_sub uuid, p_session uuid, p_event jsonb, p_tags uuid[], p_rev text, p_req uuid
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE 'SELECT public.save_training_calendar_event($1, $2, $3, $4, $5)'
     INTO result
    USING p_session, p_event, p_tags, p_rev, p_req;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN result;
END $$;

CREATE FUNCTION pg_temp.call_read_as(p_role text, p_sub uuid, p_session uuid) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('sub', p_sub, 'role', p_role)::text END, true);
  PERFORM set_config('role', p_role, true);
  EXECUTE 'SELECT public.read_training_calendar_event($1)' INTO result USING p_session;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN result;
END $$;

-- Everything observable about one session plus the global row counts, so a
-- rejected call is proven to have written nothing at all.
CREATE FUNCTION pg_temp.world(p_session uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT md5(concat_ws('|',
    (SELECT count(*)::text FROM public.training_sessions),
    (SELECT count(*)::text FROM public.training_competencies),
    coalesce((SELECT row_to_json(s)::text FROM public.training_sessions s WHERE s.id = p_session), ''),
    coalesce((SELECT string_agg(c.id::text || ':' || c.competency_id::text || ':' || coalesce(c.weight::text, '-'),
                                ',' ORDER BY c.id)
                FROM public.training_competencies c WHERE c.session_id = p_session), '')))
$$;

CREATE FUNCTION pg_temp.tag_ids(p_session uuid) RETURNS uuid[]
LANGUAGE sql AS $$
  SELECT coalesce(array_agg(competency_id ORDER BY competency_id), '{}'::uuid[])
    FROM public.training_competencies WHERE session_id = p_session
$$;

CREATE FUNCTION pg_temp.ev(
  p_title text,
  p_start timestamptz,
  p_end timestamptz DEFAULT NULL,
  p_status text DEFAULT 'Scheduled',
  p_capacity integer DEFAULT 20
) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'title', p_title,
    'category', 'Technical',
    'scheduled_date', p_start,
    'end_date', p_end,
    'instructor_name', 'Dr. Test',
    'location', 'Room 1',
    'objectives', jsonb_build_array('Goal A', '   ', 'Goal B'),
    'description', 'Desc',
    'materials', 'Mats',
    'prerequisites', 'None',
    'status', p_status,
    'capacity', p_capacity)
$$;

CREATE FUNCTION pg_temp.expect_save_reject(
  p_label text,
  p_state text,
  p_hint text,
  p_role text,
  p_sub uuid,
  p_session uuid,
  p_event jsonb,
  p_tags uuid[],
  p_rev text,
  p_req uuid,
  p_snap_session uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  snap_session uuid := coalesce(p_snap_session, p_session);
  before_world text := pg_temp.world(snap_session);
  got_state    text;
  got_hint     text;
  got_message  text;
BEGIN
  BEGIN
    PERFORM pg_temp.call_save_as(p_role, p_sub, p_session, p_event, p_tags, p_rev, p_req);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS got_state = RETURNED_SQLSTATE, got_hint = PG_EXCEPTION_HINT, got_message = MESSAGE_TEXT;
  END;
  IF got_state IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: %: call succeeded when % / % was expected', p_label, p_state, p_hint;
  END IF;
  IF got_state <> p_state OR (p_hint <> '' AND coalesce(got_hint, '') <> p_hint) THEN
    RAISE EXCEPTION 'TEST FAILED: %: expected % / %, got % / % (%)', p_label, p_state, p_hint,
      got_state, got_hint, got_message;
  END IF;
  IF pg_temp.world(snap_session) <> before_world THEN
    RAISE EXCEPTION 'TEST FAILED: %: rejected call changed sessions, tags, or row counts', p_label;
  END IF;
END $$;

-- ── 1. Schema, grants, and SECURITY INVOKER ─────────────────────────────────
DO $$
DECLARE
  fn_save regprocedure := 'public.save_training_calendar_event(uuid, jsonb, uuid[], text, uuid)';
  fn_read regprocedure := 'public.read_training_calendar_event(uuid)';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'training_sessions'
       AND column_name = 'client_request_id' AND data_type = 'uuid' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: training_sessions.client_request_id must be a nullable uuid column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'training_sessions_client_request_id_uidx'
       AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
       AND indexdef ILIKE '%(client_request_id)%'
       AND indexdef ILIKE '%WHERE (client_request_id IS NOT NULL)%'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: partial unique index training_sessions_client_request_id_uidx is missing';
  END IF;

  IF has_function_privilege('anon', fn_save, 'EXECUTE') OR has_function_privilege('public', fn_save, 'EXECUTE')
     OR has_function_privilege('anon', fn_read, 'EXECUTE') OR has_function_privilege('public', fn_read, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: anon/public must not execute the training calendar RPCs';
  END IF;
  IF NOT has_function_privilege('authenticated', fn_save, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn_save, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', fn_read, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn_read, 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST FAILED: authenticated/service_role missing EXECUTE';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = fn_save) OR (SELECT prosecdef FROM pg_proc WHERE oid = fn_read) THEN
    RAISE EXCEPTION 'TEST FAILED: training calendar RPCs must be SECURITY INVOKER';
  END IF;

  RAISE NOTICE 'ok: schema, index, grants, and SECURITY INVOKER';
END $$;

-- ── 2. Actor authorization (save create/update and read) ────────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  admin    uuid := '00000000-0000-4000-8000-0000000c0002';
  rsp      uuid := '00000000-0000-4000-8000-0000000c0003';
  stranger uuid := '00000000-0000-4000-8000-0000000c0004';
  retired  uuid := '00000000-0000-4000-8000-0000000c0005';
  start_at timestamptz := now() + interval '30 days';
  created  jsonb;
  sid      uuid;
  rev      text;
BEGIN
  PERFORM pg_temp.expect_save_reject('anon create', '42501', '', 'anon', NULL,
    NULL, pg_temp.ev('Auth Anon', start_at), NULL, NULL, gen_random_uuid());
  PERFORM pg_temp.expect_save_reject('no-role create', '42501', 'not_authorized', 'authenticated', stranger,
    NULL, pg_temp.ev('Auth Stranger', start_at), NULL, NULL, gen_random_uuid());
  PERFORM pg_temp.expect_save_reject('RSP create', '42501', 'not_authorized', 'authenticated', rsp,
    NULL, pg_temp.ev('Auth RSP', start_at), NULL, NULL, gen_random_uuid());
  PERFORM pg_temp.expect_save_reject('inactive LND create', '42501', 'not_authorized', 'authenticated', retired,
    NULL, pg_temp.ev('Auth Retired', start_at), NULL, NULL, gen_random_uuid());

  created := pg_temp.call_save_as('authenticated', lnd, NULL, pg_temp.ev('Auth LND Created', start_at), NULL, NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev := created ->> 'revision';
  IF sid IS NULL OR rev IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: active LND create did not return { id, revision }: %', created;
  END IF;

  PERFORM pg_temp.expect_save_reject('anon update', '42501', '', 'anon', NULL,
    sid, pg_temp.ev('Auth Anon Edit', start_at), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('RSP update', '42501', 'not_authorized', 'authenticated', rsp,
    sid, pg_temp.ev('Auth RSP Edit', start_at), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('inactive LND update', '42501', 'not_authorized', 'authenticated', retired,
    sid, pg_temp.ev('Auth Retired Edit', start_at), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('service_role-less anon tag edit', '42501', '', 'anon', NULL,
    sid, NULL, ARRAY['00000000-0000-4000-8000-0000000d0001'::uuid], rev, NULL);

  BEGIN
    PERFORM pg_temp.call_read_as('anon', NULL, sid);
    RAISE EXCEPTION 'TEST FAILED: anon read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM pg_temp.call_read_as('authenticated', rsp, sid);
    RAISE EXCEPTION 'TEST FAILED: RSP read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM pg_temp.call_read_as('authenticated', stranger, sid);
    RAISE EXCEPTION 'TEST FAILED: role-less read succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- ADMIN and service_role are authorized.
  PERFORM pg_temp.call_read_as('authenticated', admin, sid);
  PERFORM pg_temp.call_read_as('service_role', NULL, sid);
  created := pg_temp.call_save_as('authenticated', admin, NULL, pg_temp.ev('Auth Admin Created', start_at), NULL, NULL, gen_random_uuid());
  PERFORM pg_temp.call_save_as('service_role', NULL, NULL, pg_temp.ev('Auth Service Created', start_at), NULL, NULL, gen_random_uuid());

  RAISE NOTICE 'ok: LND/ADMIN/service_role authorized; anon, RSP, role-less, inactive refused';
END $$;

-- ── 3. Create: whitelist, tag dedupe, replay by request id ──────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  t3       uuid := '00000000-0000-4000-8000-0000000d0003';
  req      uuid := gen_random_uuid();
  start_at timestamptz := now() + interval '30 days';
  first    jsonb;
  replay   jsonb;
  sess     public.training_sessions%ROWTYPE;
  session_rows integer;
BEGIN
  first := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Create Fixture', start_at, start_at + interval '1 day') ||
      jsonb_build_object('roster_status', 'Approved', 'program_id', gen_random_uuid(), 'created_at', '2001-01-01T00:00:00Z',
                         'id', gen_random_uuid(), 'client_request_id', gen_random_uuid(), 'is_internal', false),
    ARRAY[t1, t1, t2, NULL]::uuid[], NULL, req);

  SELECT * INTO sess FROM public.training_sessions WHERE id = (first ->> 'id')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEST FAILED: create did not insert a session';
  END IF;
  IF sess.client_request_id IS DISTINCT FROM req THEN
    RAISE EXCEPTION 'TEST FAILED: client_request_id was %, expected the supplied request id', sess.client_request_id;
  END IF;
  IF sess.program_id IS NOT NULL OR sess.roster_status <> 'Draft' OR sess.is_internal IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST FAILED: non-whitelisted p_event keys were applied (program %, roster %, internal %)',
      sess.program_id, sess.roster_status, sess.is_internal;
  END IF;
  IF sess.updated_at IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: create must leave updated_at NULL, got %', sess.updated_at;
  END IF;
  IF sess.objectives <> ARRAY['Goal A', 'Goal B'] THEN
    RAISE EXCEPTION 'TEST FAILED: blank objectives were not dropped: %', sess.objectives;
  END IF;
  IF sess.title <> 'Create Fixture' OR sess.status <> 'Scheduled' OR sess.capacity <> 20 OR sess.category <> 'Technical' THEN
    RAISE EXCEPTION 'TEST FAILED: whitelisted create fields were not applied';
  END IF;
  IF pg_temp.tag_ids(sess.id) <> ARRAY[t1, t2]::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: duplicate/NULL tags were not normalized: %', pg_temp.tag_ids(sess.id);
  END IF;

  -- Replay with the same request id returns the same session and writes nothing,
  -- even when the retry carries different content or tags.
  replay := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Create Fixture Retry Title', start_at), ARRAY[t3]::uuid[], NULL, req);
  IF (replay ->> 'id') <> (first ->> 'id') OR (replay ->> 'revision') <> (first ->> 'revision') THEN
    RAISE EXCEPTION 'TEST FAILED: replay returned % but the first create returned %', replay, first;
  END IF;
  SELECT count(*) INTO session_rows FROM public.training_sessions WHERE client_request_id = req;
  IF session_rows <> 1 THEN
    RAISE EXCEPTION 'TEST FAILED: replay created % sessions for one request id', session_rows;
  END IF;
  IF (SELECT title FROM public.training_sessions WHERE id = sess.id) <> 'Create Fixture'
     OR pg_temp.tag_ids(sess.id) <> ARRAY[t1, t2]::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: replay changed the original session or tags';
  END IF;

  -- Empty tag array and NULL tag array both create a session without tags.
  first := pg_temp.call_save_as('authenticated', lnd, NULL, pg_temp.ev('No Tags A', start_at), '{}'::uuid[], NULL, gen_random_uuid());
  IF pg_temp.tag_ids((first ->> 'id')::uuid) <> '{}'::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: empty array created tags';
  END IF;
  first := pg_temp.call_save_as('authenticated', lnd, NULL, pg_temp.ev('No Tags B', start_at), NULL, NULL, gen_random_uuid());
  IF pg_temp.tag_ids((first ->> 'id')::uuid) <> '{}'::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: NULL array created tags';
  END IF;

  RAISE NOTICE 'ok: create whitelist, tag normalization, and request-id replay';
END $$;

-- ── 4. Create rejections write nothing ──────────────────────────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  bogus    uuid := '99999999-9999-4999-8999-999999999999';
  start_at timestamptz := now() + interval '30 days';
BEGIN
  PERFORM pg_temp.expect_save_reject('create missing request id', '22023', 'missing_request_id', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject A', start_at), ARRAY[t1], NULL, NULL, NULL);
  PERFORM pg_temp.expect_save_reject('create null event', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, NULL, ARRAY[t1], NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create invalid competency rolls back session', '23503', 'invalid_competency', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Invalid Tag', start_at), ARRAY[t1, bogus]::uuid[], NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create blank title', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('   ', start_at), NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create missing start date', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Start', start_at) - 'scheduled_date', NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create end before start', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject End', start_at, start_at - interval '1 hour'), NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create negative capacity', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Capacity', start_at, NULL, 'Scheduled', -1), NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create unknown category', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Category', start_at) || '{"category":"Soft Skills"}'::jsonb, NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create unknown status', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Status', start_at, NULL, 'Upcoming'), NULL, NULL, gen_random_uuid(), NULL);
  PERFORM pg_temp.expect_save_reject('create objectives not an array', '22023', 'invalid_event', 'authenticated', lnd,
    NULL, pg_temp.ev('Reject Objectives', start_at) || '{"objectives":"not an array"}'::jsonb, NULL, NULL, gen_random_uuid(), NULL);

  RAISE NOTICE 'ok: create rejections leave no session or tag rows';
END $$;

-- ── 5. Update: tag failures roll back content, retained IDs and weights ─────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  t3       uuid := '00000000-0000-4000-8000-0000000d0003';
  t4       uuid := '00000000-0000-4000-8000-0000000d0004';
  bogus    uuid := '99999999-9999-4999-8999-999999999999';
  start_at timestamptz := now() + interval '30 days';
  created  jsonb;
  saved    jsonb;
  sid      uuid;
  rev      text;
  id_t1    uuid;
  id_t2    uuid;
  id_t3    uuid;
  id_t4    uuid;
BEGIN
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Update Fixture', start_at), ARRAY[t1, t2, t3]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev := created ->> 'revision';

  -- Weights are owned by a later AI-matcher feature; unchanged tags must keep theirs.
  UPDATE public.training_competencies SET weight = 4 WHERE session_id = sid AND competency_id = t1;
  UPDATE public.training_competencies SET weight = 2 WHERE session_id = sid AND competency_id = t2;
  -- Weights are part of the revision, so reload it as the editor would.
  rev := (pg_temp.call_read_as('authenticated', lnd, sid)) ->> 'revision';

  SELECT id INTO id_t1 FROM public.training_competencies WHERE session_id = sid AND competency_id = t1;
  SELECT id INTO id_t2 FROM public.training_competencies WHERE session_id = sid AND competency_id = t2;

  PERFORM pg_temp.expect_save_reject('update invalid competency rolls back content and tags', '23503', 'invalid_competency',
    'authenticated', lnd, sid, pg_temp.ev('Update Fixture Renamed', start_at), ARRAY[t1, bogus]::uuid[], rev, NULL);

  -- Update that removes t3, keeps t1 and t2, and adds t4.
  saved := pg_temp.call_save_as('authenticated', lnd, sid,
    pg_temp.ev('Update Fixture Renamed', start_at), ARRAY[t4, t2, t1, t2]::uuid[], rev, NULL);
  IF (saved ->> 'id')::uuid <> sid OR (saved ->> 'revision') = rev THEN
    RAISE EXCEPTION 'TEST FAILED: update did not return the same id with a new revision: %', saved;
  END IF;
  rev := saved ->> 'revision';

  IF (SELECT title FROM public.training_sessions WHERE id = sid) <> 'Update Fixture Renamed' THEN
    RAISE EXCEPTION 'TEST FAILED: update did not apply the new title';
  END IF;
  IF pg_temp.tag_ids(sid) <> ARRAY[t1, t2, t4]::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: tags were % after update, expected t1,t2,t4', pg_temp.tag_ids(sid);
  END IF;
  IF (SELECT id FROM public.training_competencies WHERE session_id = sid AND competency_id = t1) IS DISTINCT FROM id_t1
     OR (SELECT id FROM public.training_competencies WHERE session_id = sid AND competency_id = t2) IS DISTINCT FROM id_t2 THEN
    RAISE EXCEPTION 'TEST FAILED: unchanged tags did not keep their join row ids';
  END IF;
  IF (SELECT weight FROM public.training_competencies WHERE session_id = sid AND competency_id = t1) IS DISTINCT FROM 4
     OR (SELECT weight FROM public.training_competencies WHERE session_id = sid AND competency_id = t2) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'TEST FAILED: unchanged tags lost their weights';
  END IF;
  IF (SELECT weight FROM public.training_competencies WHERE session_id = sid AND competency_id = t4) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: a newly added tag must start with a NULL weight';
  END IF;
  SELECT id INTO id_t4 FROM public.training_competencies WHERE session_id = sid AND competency_id = t4;

  -- NULL tag array leaves tags untouched while content changes.
  saved := pg_temp.call_save_as('authenticated', lnd, sid,
    pg_temp.ev('Update Fixture Content Only', start_at), NULL, rev, NULL);
  rev := saved ->> 'revision';
  IF pg_temp.tag_ids(sid) <> ARRAY[t1, t2, t4]::uuid[]
     OR (SELECT id FROM public.training_competencies WHERE session_id = sid AND competency_id = t4) IS DISTINCT FROM id_t4 THEN
    RAISE EXCEPTION 'TEST FAILED: NULL tag array changed the tags';
  END IF;

  -- Tag-only change (p_event NULL) works, and the same tag set is a no-op.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, NULL, ARRAY[t1, t2]::uuid[], rev, NULL);
  rev := saved ->> 'revision';
  IF pg_temp.tag_ids(sid) <> ARRAY[t1, t2]::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: tag-only save produced %', pg_temp.tag_ids(sid);
  END IF;
  IF (SELECT title FROM public.training_sessions WHERE id = sid) <> 'Update Fixture Content Only' THEN
    RAISE EXCEPTION 'TEST FAILED: tag-only save changed session content';
  END IF;

  -- Empty array clears every tag.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, NULL, '{}'::uuid[], rev, NULL);
  rev := saved ->> 'revision';
  IF pg_temp.tag_ids(sid) <> '{}'::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: empty array did not clear tags';
  END IF;

  RAISE NOTICE 'ok: update rollback, retained join ids and weights, NULL vs empty tag arrays';
END $$;

-- ── 6. Partial p_event, validation on update, and trigger-induced rollback ──
CREATE FUNCTION pg_temp.fail_competency_insert() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected competency failure'; END $$;

DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  start_at timestamptz := now() + interval '30 days';
  created  jsonb;
  saved    jsonb;
  sid      uuid;
  rev      text;
  sess     public.training_sessions%ROWTYPE;
BEGIN
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Partial Fixture', start_at, start_at + interval '1 day'), ARRAY[t1]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev := created ->> 'revision';

  -- Only the keys present are applied; absent keys keep their stored value.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, '{"status":"Ongoing"}'::jsonb, NULL, rev, NULL);
  rev := saved ->> 'revision';
  SELECT * INTO sess FROM public.training_sessions WHERE id = sid;
  IF sess.status <> 'Ongoing' OR sess.title <> 'Partial Fixture' OR sess.location <> 'Room 1'
     OR sess.end_date IS NULL OR sess.capacity <> 20 THEN
    RAISE EXCEPTION 'TEST FAILED: partial p_event changed fields it did not name';
  END IF;

  -- A key that is present with JSON null clears a nullable field.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, '{"end_date":null,"location":"  "}'::jsonb, NULL, rev, NULL);
  rev := saved ->> 'revision';
  SELECT * INTO sess FROM public.training_sessions WHERE id = sid;
  IF sess.end_date IS NOT NULL OR sess.location IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: present null/blank keys did not clear nullable fields (end %, location %)',
      sess.end_date, sess.location;
  END IF;

  -- Required fields cannot be blanked or invalid on update either.
  PERFORM pg_temp.expect_save_reject('update blank title', '22023', 'invalid_event', 'authenticated', lnd,
    sid, '{"title":"  "}'::jsonb, NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('update null start date', '22023', 'invalid_event', 'authenticated', lnd,
    sid, '{"scheduled_date":null}'::jsonb, NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('update end before start', '22023', 'invalid_event', 'authenticated', lnd,
    sid, jsonb_build_object('end_date', start_at - interval '1 day'), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('update negative capacity', '22023', 'invalid_event', 'authenticated', lnd,
    sid, '{"capacity":-5}'::jsonb, NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('update unknown status', '22023', 'invalid_event', 'authenticated', lnd,
    sid, '{"status":"Upcoming"}'::jsonb, NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('update missing revision', '22023', 'missing_revision', 'authenticated', lnd,
    sid, '{"status":"Scheduled"}'::jsonb, NULL, NULL, NULL);
  PERFORM pg_temp.expect_save_reject('update blank revision', '22023', 'missing_revision', 'authenticated', lnd,
    sid, '{"status":"Scheduled"}'::jsonb, NULL, '   ', NULL);
  PERFORM pg_temp.expect_save_reject('update unknown session', 'P0002', 'session_not_found', 'authenticated', lnd,
    gen_random_uuid(), '{"status":"Scheduled"}'::jsonb, NULL, rev, NULL);

  -- A failure while inserting a join row rolls the content update back with it.
  CREATE TRIGGER trg_tc_fail_competency_insert
    BEFORE INSERT ON public.training_competencies
    FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_competency_insert();
  PERFORM pg_temp.expect_save_reject('update tag insert failure rolls back content', 'P0001', '', 'authenticated', lnd,
    sid, '{"title":"Should Roll Back"}'::jsonb, ARRAY[t1, t2]::uuid[], rev, NULL);
  PERFORM pg_temp.expect_save_reject('create tag insert failure rolls back session', 'P0001', '', 'authenticated', lnd,
    NULL, pg_temp.ev('Should Not Exist', start_at), ARRAY[t1]::uuid[], NULL, gen_random_uuid(), NULL);
  DROP TRIGGER trg_tc_fail_competency_insert ON public.training_competencies;

  RAISE NOTICE 'ok: partial p_event, update validation, and trigger-induced rollback';
END $$;

-- ── 7. Stale edits and revision semantics ───────────────────────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  start_at timestamptz := now() + interval '30 days';
  created  jsonb;
  saved    jsonb;
  snap     jsonb;
  sid      uuid;
  rev0     text;
  rev1     text;
  rev2     text;
BEGIN
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Stale Fixture', start_at), ARRAY[t1]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev0 := created ->> 'revision';

  snap := pg_temp.call_read_as('authenticated', lnd, sid);
  IF (snap ->> 'revision') <> rev0 THEN
    RAISE EXCEPTION 'TEST FAILED: read revision % differs from the create revision %', snap ->> 'revision', rev0;
  END IF;
  IF pg_temp.call_read_as('authenticated', lnd, sid) <> snap THEN
    RAISE EXCEPTION 'TEST FAILED: reading twice returned different snapshots';
  END IF;

  -- Operations that must NOT change the revision: office viewing and roster churn.
  UPDATE public.training_sessions SET last_viewed_by_office = now(), roster_status = 'Sent to Dept Head' WHERE id = sid;
  IF (pg_temp.call_read_as('authenticated', lnd, sid) ->> 'revision') <> rev0 THEN
    RAISE EXCEPTION 'TEST FAILED: office viewing or roster workflow changed the revision';
  END IF;

  -- First editor saves.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, pg_temp.ev('Stale Fixture Edit 1', start_at), NULL, rev0, NULL);
  rev1 := saved ->> 'revision';
  IF rev1 = rev0 THEN
    RAISE EXCEPTION 'TEST FAILED: a content change did not change the revision';
  END IF;

  -- Second editor still holds the old revision.
  PERFORM pg_temp.expect_save_reject('stale content edit', '40001', 'revision_conflict', 'authenticated', lnd,
    sid, pg_temp.ev('Stale Fixture Edit 2', start_at), NULL, rev0, NULL);
  PERFORM pg_temp.expect_save_reject('stale tag-only edit', '40001', 'revision_conflict', 'authenticated', lnd,
    sid, NULL, ARRAY[t2]::uuid[], rev0, NULL);

  -- A tag-only change moves the revision.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, NULL, ARRAY[t1, t2]::uuid[], rev1, NULL);
  rev2 := saved ->> 'revision';
  IF rev2 = rev1 THEN
    RAISE EXCEPTION 'TEST FAILED: a tag change did not change the revision';
  END IF;
  PERFORM pg_temp.expect_save_reject('edit with pre-tag-change revision', '40001', 'revision_conflict', 'authenticated', lnd,
    sid, pg_temp.ev('Stale Fixture Edit 3', start_at), NULL, rev1, NULL);

  -- A weight change by another writer moves the revision (weights are retained, so they count).
  UPDATE public.training_competencies SET weight = 5 WHERE session_id = sid AND competency_id = t1;
  PERFORM pg_temp.expect_save_reject('edit after a weight change', '40001', 'revision_conflict', 'authenticated', lnd,
    sid, pg_temp.ev('Stale Fixture Edit 4', start_at), NULL, rev2, NULL);
  rev2 := (pg_temp.call_read_as('authenticated', lnd, sid)) ->> 'revision';

  -- A direct status change (the cancel path) moves the revision.
  UPDATE public.training_sessions SET status = 'Cancelled' WHERE id = sid;
  PERFORM pg_temp.expect_save_reject('edit after cancel', '40001', 'revision_conflict', 'authenticated', lnd,
    sid, pg_temp.ev('Stale Fixture Edit 5', start_at), NULL, rev2, NULL);

  RAISE NOTICE 'ok: stale content and tag edits are refused, revision tracks content, tags, weights, and status';
END $$;

-- ── 8. Three-day lock applies to content and to competency changes ──────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  soon     timestamptz := now() + interval '2 days';
  created  jsonb;
  saved    jsonb;
  sid      uuid;
  rev      text;
  before_updated timestamptz;
BEGIN
  -- Creating inside the lock window is allowed: the lock only guards edits.
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Locked Fixture', soon), ARRAY[t1]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev := created ->> 'revision';

  PERFORM pg_temp.expect_save_reject('locked content edit', '23514', 'training_locked', 'authenticated', lnd,
    sid, pg_temp.ev('Locked Fixture Renamed', soon), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('locked date edit', '23514', 'training_locked', 'authenticated', lnd,
    sid, pg_temp.ev('Locked Fixture', soon + interval '1 day'), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('locked capacity edit', '23514', 'training_locked', 'authenticated', lnd,
    sid, pg_temp.ev('Locked Fixture', soon, NULL, 'Scheduled', 99), NULL, rev, NULL);
  PERFORM pg_temp.expect_save_reject('locked tag addition', '23514', 'training_locked', 'authenticated', lnd,
    sid, NULL, ARRAY[t1, t2]::uuid[], rev, NULL);
  PERFORM pg_temp.expect_save_reject('locked tag removal', '23514', 'training_locked', 'authenticated', lnd,
    sid, NULL, '{}'::uuid[], rev, NULL);
  PERFORM pg_temp.expect_save_reject('locked content plus tag edit', '23514', 'training_locked', 'authenticated', lnd,
    sid, pg_temp.ev('Locked Fixture Renamed', soon), ARRAY[t2]::uuid[], rev, NULL);

  -- Unchanged content and the same tag set are accepted on a locked training.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, pg_temp.ev('Locked Fixture', soon), ARRAY[t1, t1]::uuid[], rev, NULL);
  rev := saved ->> 'revision';
  IF pg_temp.tag_ids(sid) <> ARRAY[t1]::uuid[] THEN
    RAISE EXCEPTION 'TEST FAILED: an unchanged locked save altered the tags';
  END IF;

  -- Operational status changes stay allowed after the lock, with tags left alone.
  saved := pg_temp.call_save_as('authenticated', lnd, sid, pg_temp.ev('Locked Fixture', soon, NULL, 'Completed'), NULL, rev, NULL);
  rev := saved ->> 'revision';
  IF (SELECT status FROM public.training_sessions WHERE id = sid) <> 'Completed' THEN
    RAISE EXCEPTION 'TEST FAILED: a permitted operational status change was refused on a locked training';
  END IF;
  saved := pg_temp.call_save_as('authenticated', lnd, sid, '{"status":"Cancelled"}'::jsonb, NULL, rev, NULL);
  IF (SELECT status FROM public.training_sessions WHERE id = sid) <> 'Cancelled' THEN
    RAISE EXCEPTION 'TEST FAILED: a partial status-only save was refused on a locked training';
  END IF;

  RAISE NOTICE 'ok: lock refuses content and tag edits, allows unchanged saves and status changes';
END $$;

-- ── 9. Office Training Courses indicator timestamps ─────────────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t2       uuid := '00000000-0000-4000-8000-0000000d0002';
  start_at timestamptz := now() + interval '30 days';
  future   timestamptz := clock_timestamp() + interval '10 minutes';
  created  jsonb;
  saved    jsonb;
  sid      uuid;
  rev      text;
  stamped  timestamptz;
BEGIN
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Indicator Fixture', start_at), ARRAY[t1]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;
  rev := created ->> 'revision';
  IF (SELECT updated_at FROM public.training_sessions WHERE id = sid) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FAILED: a brand-new training must not show as Updated by L&D';
  END IF;

  saved := pg_temp.call_save_as('authenticated', lnd, sid, pg_temp.ev('Indicator Fixture Edit', start_at), NULL, rev, NULL);
  rev := saved ->> 'revision';
  SELECT updated_at INTO stamped FROM public.training_sessions WHERE id = sid;
  IF stamped IS NULL THEN
    RAISE EXCEPTION 'TEST FAILED: an L&D edit did not stamp updated_at';
  END IF;

  -- Office has seen it; a later tag-only edit must raise the indicator again.
  UPDATE public.training_sessions SET last_viewed_by_office = clock_timestamp() WHERE id = sid;
  saved := pg_temp.call_save_as('authenticated', lnd, sid, NULL, ARRAY[t1, t2]::uuid[], rev, NULL);
  rev := saved ->> 'revision';
  IF (SELECT updated_at FROM public.training_sessions WHERE id = sid) <= stamped
     OR (SELECT updated_at FROM public.training_sessions WHERE id = sid) <=
        (SELECT last_viewed_by_office FROM public.training_sessions WHERE id = sid) THEN
    RAISE EXCEPTION 'TEST FAILED: a tag-only change did not advance updated_at past the office view';
  END IF;

  -- A no-op call (nothing to write) does not stamp updated_at.
  SELECT updated_at INTO stamped FROM public.training_sessions WHERE id = sid;
  saved := pg_temp.call_save_as('authenticated', lnd, sid, NULL, NULL, rev, NULL);
  IF (SELECT updated_at FROM public.training_sessions WHERE id = sid) IS DISTINCT FROM stamped
     OR (saved ->> 'revision') <> rev THEN
    RAISE EXCEPTION 'TEST FAILED: a call with nothing to write changed updated_at or the revision';
  END IF;

  -- Clock skew: a row stamped in the future still advances strictly.
  UPDATE public.training_sessions SET updated_at = future WHERE id = sid;
  rev := (pg_temp.call_read_as('authenticated', lnd, sid)) ->> 'revision';
  saved := pg_temp.call_save_as('authenticated', lnd, sid, pg_temp.ev('Indicator Fixture Skew', start_at), NULL, rev, NULL);
  IF (SELECT updated_at FROM public.training_sessions WHERE id = sid) <= future THEN
    RAISE EXCEPTION 'TEST FAILED: updated_at did not advance past a future-dated row';
  END IF;

  RAISE NOTICE 'ok: updated_at stays NULL on create, advances on edits, and survives clock skew';
END $$;

-- ── 10. Snapshot content ────────────────────────────────────────────────────
DO $$
DECLARE
  lnd      uuid := '00000000-0000-4000-8000-0000000c0001';
  t1       uuid := '00000000-0000-4000-8000-0000000d0001';
  t3       uuid := '00000000-0000-4000-8000-0000000d0003';
  start_at timestamptz := now() + interval '30 days';
  created  jsonb;
  snap     jsonb;
  sid      uuid;
BEGIN
  created := pg_temp.call_save_as('authenticated', lnd, NULL,
    pg_temp.ev('Snapshot Fixture', start_at, start_at + interval '2 days'), ARRAY[t3, t1]::uuid[], NULL, gen_random_uuid());
  sid := (created ->> 'id')::uuid;

  snap := pg_temp.call_read_as('authenticated', lnd, sid);
  IF jsonb_typeof(snap -> 'event') <> 'object' OR (snap -> 'event' ->> 'id')::uuid <> sid
     OR snap -> 'event' ->> 'title' <> 'Snapshot Fixture'
     OR snap -> 'event' ->> 'category' <> 'Technical'
     OR snap -> 'event' ->> 'instructor_name' <> 'Dr. Test'
     OR (snap -> 'event' ->> 'capacity')::integer <> 20
     OR jsonb_array_length(snap -> 'event' -> 'objectives') <> 2
     OR NOT (snap -> 'event') ? 'roster_finalized_at' OR NOT (snap -> 'event') ? 'end_date'
     OR NOT (snap -> 'event') ? 'description' OR NOT (snap -> 'event') ? 'materials'
     OR NOT (snap -> 'event') ? 'prerequisites' OR NOT (snap -> 'event') ? 'status' THEN
    RAISE EXCEPTION 'TEST FAILED: snapshot event is missing columns CalendarEvent needs: %', snap -> 'event';
  END IF;
  IF (snap -> 'competency_ids') <> jsonb_build_array(t1::text, t3::text) THEN
    RAISE EXCEPTION 'TEST FAILED: competency_ids were % (expected ordered t1,t3)', snap -> 'competency_ids';
  END IF;
  IF jsonb_array_length(snap -> 'competencies') <> 2
     OR NOT (snap -> 'competencies' -> 0) ?& ARRAY['id', 'name', 'name_key', 'category']
     OR snap -> 'competencies' -> 0 ->> 'name' <> 'TC Tag One'
     OR snap -> 'competencies' -> 0 ->> 'name_key' <> 'tc tag one' THEN
    RAISE EXCEPTION 'TEST FAILED: structured competency tags are wrong: %', snap -> 'competencies';
  END IF;
  IF (snap ->> 'revision') IS NULL OR (snap ->> 'revision') <> (created ->> 'revision') THEN
    RAISE EXCEPTION 'TEST FAILED: snapshot revision does not match the save revision';
  END IF;

  BEGIN
    PERFORM pg_temp.call_read_as('authenticated', lnd, gen_random_uuid());
    RAISE EXCEPTION 'TEST FAILED: reading a missing session succeeded';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;
  BEGIN
    PERFORM pg_temp.call_read_as('authenticated', lnd, NULL);
    RAISE EXCEPTION 'TEST FAILED: reading with a NULL id succeeded';
  EXCEPTION WHEN no_data_found THEN
    NULL;
  END;

  RAISE NOTICE 'ok: snapshot returns event, structured tags, ordered ids, and a stable revision';
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL TRAINING CALENDAR TRANSACTION TESTS PASSED'; END $$;

ROLLBACK;
