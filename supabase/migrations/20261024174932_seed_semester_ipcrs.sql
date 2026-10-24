-- Seed completed semester IPCRs so succession planning has a performance score
-- for every employee who was employed for the semester.
--
-- Plan: docs/plans/2026-10-25-semester-ipcr-seed.md
--
-- What this does
--   1. Turns the two year-long performance cycles into semesters: cycle
--      "2025 Performance Cycle" becomes July–December 2025, "2026 Performance
--      Cycle" becomes July–December 2026 (still Active, left empty), and adds
--      January–June 2025 and January–June 2026 as Completed cycles. Titles use the
--      "January–June 2025" form that normalizeSemesterKey() parses.
--   2. For each active Regular employee and each completed semester that began on
--      or after their hire date, and that has no IPCR yet, inserts a finalized IPCR
--      (target_settings -> mfos -> success_indicators -> success_indicator_ratings).
--      The Core MFO is tailored to the position and level; Strategic and Support
--      copy the office's existing wording. An office whose Support weight is 0
--      gets no Support MFO.
--   3. Ratings keep each employee's own level: an employee who already has an IPCR
--      keeps its average as their baseline, anyone else gets a deterministic
--      baseline (about 27% Outstanding, the rest Very Satisfactory). Each semester
--      drifts by under 0.3 from that baseline. Ratings never depend on credentials.
--   4. Records the department head as approver on every IPCR that has none (the
--      head's own IPCR and offices without an active head stay empty).
--
-- Idempotent: an (employee, cycle) pair that already has an IPCR is skipped, and
-- cycles are matched by title. Re-running changes nothing.
--
-- mfos and success_indicators reject writes once their IPCR is approved, so each
-- IPCR is inserted as 'submitted', filled in, and only then approved.

create or replace function pg_temp.ipcr_h(seed text) returns numeric
language sql immutable as $$
  select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint)::numeric / 4294967296
$$;

-- 1. Semester cycles ----------------------------------------------------------

update public.performance_cycles
   set title = 'July–December 2025', start_date = '2025-07-01', end_date = '2025-12-31'
 where title = '2025 Performance Cycle';

update public.performance_cycles
   set title = 'July–December 2026', start_date = '2026-07-01', end_date = '2026-12-31'
 where title = '2026 Performance Cycle';

insert into public.performance_cycles (title, start_date, end_date, status, created_at)
select v.title, v.start_date::date, v.end_date::date, 'Completed', v.start_date::timestamptz
  from (values
         ('January–June 2025', '2025-01-01', '2025-06-30'),
         ('January–June 2026', '2026-01-01', '2026-06-30')
       ) as v(title, start_date, end_date)
 where not exists (select 1 from public.performance_cycles c where c.title = v.title);

-- 2. IPCRs --------------------------------------------------------------------

do $seed$
declare
  v_planned int;
  v_bad     int;
begin
  -- The three completed semesters. drift is relative to July–December 2025, the
  -- semester the pre-existing IPCRs belong to.
  create temp table _sem on commit drop as
  select c.id as cycle_id, v.ord, c.start_date, c.end_date, v.drift
    from public.performance_cycles c
    join (values
           ('January–June 2025',  1, -0.12),
           ('July–December 2025', 2,  0.00),
           ('January–June 2026',  3,  0.08)
         ) as v(title, ord, drift) on v.title = c.title;

  -- Position families, first match wins. duty is the Core MFO subject; deliver is
  -- what the indicator counts.
  create temp table _family on commit drop as
  select * from (values
    ( 1, 'city accountant',
         'accounting, financial reporting and pre-audit operations',
         'financial statements, pre-audit reviews and internal control reports'),
    ( 2, 'city engineer',
         'infrastructure planning, construction and maintenance programs',
         'infrastructure projects and maintenance work orders'),
    ( 3, 'city general services',
         'supply, property, facilities and transport services',
         'service requests and property and supply reports'),
    ( 4, 'city health',
         'public health programs and clinical health services',
         'health program targets and clinical service reports'),
    ( 5, 'city social welfare',
         'social welfare, protection and development programs',
         'case management and program delivery reports'),
    ( 6, 'attorney',
         'legal counsel, legislative review and court representation',
         'legal opinions, pleadings and assigned cases'),
    ( 7, 'engineer|architect|engineering aide',
         'engineering design, plan evaluation and project inspection',
         'plans, inspection reports and project evaluations'),
    ( 8, 'electrician|plumber|mechanic|foreman|heavy equipment|driver|utility',
         'repair, maintenance and operation of facilities, equipment and vehicles',
         'work orders and maintenance schedules'),
    ( 9, 'storekeeper|supply officer|buyer|warehouse|procurement',
         'procurement, inventory and property custody',
         'purchase requests, inventory counts and supply reports'),
    (10, 'building official|transportation regulation|inspection lead',
         'regulatory inspection, permitting and compliance enforcement',
         'permits, inspections and compliance reports'),
    (11, 'dentist',
         'dental examination, treatment and oral health programs',
         'dental procedures and oral health reports'),
    (12, 'medical officer|medical specialist|physician',
         'clinical consultation, diagnosis and patient care',
         'patient consultations and clinical records'),
    (13, 'nurse',
         'nursing care, public health nursing and health program support',
         'patient care plans and program reports'),
    (14, 'midwife',
         'maternal and child health, prenatal and delivery support',
         'maternal care visits and health records'),
    (15, 'nutritionist',
         'nutrition programs, assessment and counseling',
         'nutrition assessments and program reports'),
    (16, 'sanitation',
         'sanitation inspection and environmental health enforcement',
         'inspections and compliance reports'),
    (17, 'medical laboratory',
         'laboratory testing and specimen analysis',
         'laboratory tests and result reports'),
    (18, 'medical records',
         'health records management and reporting',
         'patient records and health information reports'),
    (19, 'social welfare|early childhood',
         'case management, community assistance and social welfare services',
         'cases handled and assistance delivered'),
    (20, 'programmer|systems analyst|computer operator|information systems',
         'systems development, technical support and data processing',
         'system requests, program updates and data outputs'),
    (21, 'accountant|accounts analyst|bookkeeper|payroll examiner|books of accounts',
         'accounting, bookkeeping and financial transactions',
         'journal entries, ledgers and financial reports'),
    (22, 'administrative officer|hrmo|supervising administrative',
         'human resource, personnel and administrative services',
         'personnel actions, records and administrative reports'),
    (23, 'aide|assistant|clerk|bookbinder|stenographic',
         'clerical, records and documentation work',
         'documents processed and records maintained')
  ) as f(ord, pattern, duty, deliver);

  -- Each office's Strategic and Support wording, copied from its existing IPCRs.
  create temp table _tpl on commit drop as
  select e.department, m.function_type,
         mode() within group (order by m.title)         as title,
         mode() within group (order by si.description)  as descr
    from public.mfos m
    join public.success_indicators si on si.mfo_id = m.id
    join public.target_settings t     on t.id = m.target_setting_id
    join public.employees e           on e.id = t.employee_id
   where m.function_type in ('strategic', 'support')
   group by e.department, m.function_type;

  -- Plan: one row per (employee, semester) still missing an IPCR.
  create temp table _plan on commit drop as
  select gen_random_uuid() as ts_id, e.id as employee_id, e.department, e.position,
         s.cycle_id, s.ord, s.start_date, s.end_date, s.drift
    from public.employees e
   cross join _sem s
   where e.deleted_at is null
     and e.status = 'Active'
     and e.employment_status in ('Regular', 'Permanent')
     and e.date_hired is not null
     and e.date_hired <= s.start_date
     and not exists (select 1 from public.target_settings t
                      where t.employee_id = e.id and t.cycle_id = s.cycle_id);

  select count(*) into v_planned from _plan;

  -- Baseline: keep the average of an existing IPCR, otherwise derive one.
  create temp table _base on commit drop as
  select p.employee_id,
         coalesce(x.b,
                  case when pg_temp.ipcr_h(p.employee_id::text || '|base') < 0.27
                       then 4.85
                       else 3.60 + 0.80 * pg_temp.ipcr_h(p.employee_id::text || '|level')
                  end) as b
    from (select distinct employee_id from _plan) p
    left join (select t.employee_id,
                      avg((r.quality + r.efficiency + r.timeliness) / 3.0) as b
                 from public.success_indicator_ratings r
                 join public.success_indicators si on si.id = r.success_indicator_id
                 join public.mfos m                on m.id = si.mfo_id
                 join public.target_settings t     on t.id = m.target_setting_id
                group by t.employee_id) x on x.employee_id = p.employee_id;

  -- Offices whose weighting gives Support nothing carry no Support MFO.
  create temp table _office on commit drop as
  select d.department,
         coalesce(bool_and(o.support_weight > 0), true) as has_support
    from (select distinct department from _plan) d
    left join public.departments dep on dep.name = d.department
    left join public.department_weighting_configs dc
           on dc.department_id = dep.id and dc.is_active
    left join public.weighting_schema_options o on o.id = dc.schema_option_id
   group by d.department;

  create temp table _ipcr on commit drop as
  select p.*, b.b, o.has_support,
         case when o.has_support then 3 else 2 end as n_mfo,
         case
           when lower(p.position) ~ '^city ' then 'head'
           when lower(p.position) ~ '(assistant city|division chief|supervising|chief |head\)|lead\)|foreman|manager|inspection lead)' then 'supervisory'
           when lower(p.position) ~ '\m(iii|iv|v|vi)\M' then 'senior'
           else 'staff'
         end as lvl,
         coalesce(f.duty, 'assigned technical and administrative functions of the position') as duty,
         coalesce(f.deliver, 'assigned deliverables') as deliver,
         least(4.89, greatest(3.56,
           b.b + p.drift + (pg_temp.ipcr_h(p.employee_id::text || '|' || p.ord) - 0.5) * 0.2)) as m,
         p.start_date::timestamptz
           + make_interval(days => 10 + floor(pg_temp.ipcr_h(p.employee_id::text || '|c' || p.ord) * 5)::int)
           + interval '9 hours' as created_ts
    from _plan p
    join _base b using (employee_id)
    join _office o on o.department = p.department
    left join lateral (select ff.duty, ff.deliver from _family ff
                        where lower(p.position) ~ ff.pattern
                        order by ff.ord limit 1) f on true;

  alter table _ipcr add column submitted_ts timestamptz, add column approved_ts timestamptz,
                    add column p2_done timestamptz,      add column p2_appr timestamptz;
  update _ipcr i set
    submitted_ts = i.created_ts + interval '5 days',
    approved_ts  = i.created_ts + interval '5 days'
                     + make_interval(days => 3 + floor(pg_temp.ipcr_h(i.employee_id::text || '|a' || i.ord) * 3)::int),
    p2_done      = i.end_date::timestamptz
                     - make_interval(days => 1 + floor(pg_temp.ipcr_h(i.employee_id::text || '|p' || i.ord) * 5)::int)
                     + interval '8 hours 30 minutes',
    p2_appr      = i.end_date::timestamptz
                     - make_interval(days => floor(pg_temp.ipcr_h(i.employee_id::text || '|p' || i.ord) * 5)::int)
                     + interval '2 hours 15 minutes';

  -- Ratings as exact integer points: total = round(mean x slots), spread over the
  -- slots so every value is floor or ceil of the mean, never below 3.
  create temp table _slot on commit drop as
  select i.ts_id, g.j,
         ((g.j - 1) / 3) + 1 as mfo_idx,
         (g.j - 1) % 3       as dim,
         (round(i.m * i.n_mfo * 3)::int / (i.n_mfo * 3))
           + case when row_number() over (
                         partition by i.ts_id
                         order by pg_temp.ipcr_h(i.employee_id::text || '|' || i.ord || '|' || g.j))
                       <= (round(i.m * i.n_mfo * 3)::int % (i.n_mfo * 3))
                  then 1 else 0 end as val
    from _ipcr i
   cross join lateral generate_series(1, i.n_mfo * 3) as g(j);

  insert into public.target_settings
         (id, employee_id, cycle_id, status, submitted_at, created_at, updated_at, phase2_status)
  select ts_id, employee_id, cycle_id, 'submitted', submitted_ts, created_ts, submitted_ts, 'not_started'
    from _ipcr;

  create temp table _mfo on commit drop as
  select gen_random_uuid() as mfo_id, gen_random_uuid() as si_id, i.ts_id, i.employee_id, k.idx, i.p2_done,
         case k.idx
           when 1 then case i.lvl
                         when 'head'        then 'Directs ' || i.duty
                         when 'supervisory' then 'Supervises and reviews ' || i.duty
                         when 'senior'      then 'Independently handles ' || i.duty
                         else                    'Performs ' || i.duty end
           when 2 then coalesce(ts.title, 'Continuous Quality Improvement and Service Innovation')
           else        coalesce(tp.title, 'General Administrative, Documentation, and Operational Support')
         end as title,
         case k.idx
           when 1 then case i.lvl
                         when 'head'        then 'Delivered 100% of the office''s ' || i.deliver || ' within prescribed timelines and standards.'
                         when 'supervisory' then 'Ensured 100% of the division''s ' || i.deliver || ' were reviewed, accurate and submitted on schedule.'
                         when 'senior'      then 'Completed 100% of assigned ' || i.deliver || ' with minimal revisions and within prescribed timelines.'
                         else                    'Completed 100% of assigned ' || i.deliver || ' accurately and within prescribed timelines.' end
           when 2 then coalesce(ts.descr, 'Implemented 100% of scheduled operational reforms and service enhancement initiatives.')
           else        coalesce(tp.descr, 'Maintained 100% compliance with office administrative reports, attendance, and record-keeping requirements.')
         end as descr
    from _ipcr i
   cross join lateral generate_series(1, i.n_mfo) as k(idx)
    left join _tpl ts on ts.department = i.department and ts.function_type = 'strategic'
    left join _tpl tp on tp.department = i.department and tp.function_type = 'support';

  insert into public.mfos (id, target_setting_id, function_type, title, sort_order, created_at)
  select mfo_id, ts_id,
         case idx when 1 then 'core' when 2 then 'strategic' else 'support' end,
         title, idx, p2_done
    from _mfo;

  insert into public.success_indicators (id, mfo_id, description, sort_order, created_at)
  select si_id, mfo_id, descr, 1, p2_done from _mfo;

  insert into public.success_indicator_ratings
         (success_indicator_id, quality, efficiency, timeliness, rated_by, created_at, updated_at)
  select m.si_id,
         max(s.val) filter (where s.dim = 0),
         max(s.val) filter (where s.dim = 1),
         max(s.val) filter (where s.dim = 2),
         m.employee_id, m.p2_done, m.p2_done
    from _mfo m
    join _slot s on s.ts_id = m.ts_id and s.mfo_idx = m.idx
   group by m.si_id, m.employee_id, m.p2_done;

  -- Finalize now that the targets are in place.
  update public.target_settings t set
         status = 'approved',
         reviewed_at = i.approved_ts,
         approved_at = i.approved_ts,
         phase2_status = 'completed',
         phase2_completed_at = i.p2_done,
         phase2_approved_at = i.p2_appr,
         updated_at = i.p2_appr
    from _ipcr i
   where t.id = i.ts_id;

  -- Assertions: fail the migration rather than leave a half-built IPCR.
  select count(*) into v_bad
    from _ipcr i
   where (select count(*) from public.mfos m where m.target_setting_id = i.ts_id) <> i.n_mfo
      or (select count(*)
            from public.success_indicator_ratings r
            join public.success_indicators si on si.id = r.success_indicator_id
            join public.mfos m on m.id = si.mfo_id
           where m.target_setting_id = i.ts_id) <> i.n_mfo;
  if v_bad > 0 then
    raise exception 'semester IPCR seed: % IPCRs are missing MFOs or ratings', v_bad;
  end if;

  select count(*) into v_bad
    from public.target_settings t join _ipcr i on i.ts_id = t.id
   where t.status <> 'approved' or t.phase2_status <> 'completed';
  if v_bad > 0 then
    raise exception 'semester IPCR seed: % IPCRs were not finalized', v_bad;
  end if;

  if current_setting('app.ipcr_dry_run', true) = 'on' then
    raise exception 'DRY RUN OK: % IPCRs planned (rolled back)', v_planned;
  end if;

  raise notice 'semester IPCR seed: % IPCRs inserted', v_planned;
end
$seed$;

-- 3. Department-head approval -------------------------------------------------
-- Fills only empty approvers. The head never approves their own IPCR
-- (target_settings_no_self_approval), and an office with no active head keeps
-- its IPCRs unapproved-by-name, as the existing records are.

update public.target_settings t
   set approved_by = h.head_id,
       phase2_approved_by = coalesce(t.phase2_approved_by, h.head_id)
  from (
        select e.id as employee_id,
               (select d.head_employee_id
                  from public.departments d
                  join public.employees hd
                    on hd.id = d.head_employee_id and hd.deleted_at is null and hd.status = 'Active'
                 where d.name = e.department
                 limit 1) as head_id
          from public.employees e
       ) h
 where t.employee_id = h.employee_id
   and t.approved_by is null
   and h.head_id is not null
   and h.head_id <> t.employee_id;
