-- ============================================================================
-- Org restructure: 5 offices, 55 employees, one Department Head per office.
-- Created: 2026-08-03.
--
--   * Keep exactly 5 active offices; deactivate the rest (is_active=false, not
--     deleted — FKs and history survive).
--   * Reshape to exactly 55 employees = 5 offices x (10 staff + 1 Department
--     Head). Existing rows are reshaped in place (formal names, reassigned to a
--     kept office) to preserve their IPCR / enrollment / role FK links; new rows
--     are inserted to reach 55.
--   * One Department Head per office. The Supervisor office-role is retired: all
--     prior assignments are revoked and the role CHECK is narrowed to 'DeptHead'
--     only. (This is the OFFICE role — the IPCR rater subsystem is untouched.)
--
-- Review the seeded names/positions below before applying to production.
-- Idempotent-ish: re-running re-asserts the target state (names/offices/roles).
-- ============================================================================

BEGIN;

-- ── 1. Offices: keep 5 active, deactivate the rest ──────────────────────────
UPDATE departments SET is_active = true
 WHERE name IN ('Information Technology','Office of The City Accountant',
                'Office of The City Health Officer','Legal','Office of The City Engineer');
UPDATE departments SET is_active = false
 WHERE name NOT IN ('Information Technology','Office of The City Accountant',
                    'Office of The City Health Officer','Legal','Office of The City Engineer');

-- ── 2. Target roster (55 slots) ─────────────────────────────────────────────
CREATE TEMP TABLE org_slots (
  slot int, office text, position text, first text, middle text, last text, is_head boolean
) ON COMMIT DROP;

INSERT INTO org_slots (slot, office, position, first, middle, last, is_head) VALUES
-- Information Technology
(1 ,'Information Technology','Head of Information Technology','Ricardo','Bautista','Villanueva',true),
(2 ,'Information Technology','Information Technology Officer III','Antonio','Cruz','Delgado',false),
(3 ,'Information Technology','Information Technology Officer II','Manuel','Reyes','Aquino',false),
(4 ,'Information Technology','Information Technology Officer I','Eduardo','Santos','Mercado',false),
(5 ,'Information Technology','Computer Programmer III','Fernando','Garcia','Panganiban',false),
(6 ,'Information Technology','Computer Programmer II','Roberto','Flores','Salazar',false),
(7 ,'Information Technology','Systems Analyst II','Alfredo','Ramos','Bernardo',false),
(8 ,'Information Technology','Network Administrator II','Danilo','Torres','Espinosa',false),
(9 ,'Information Technology','Data Encoder III','Rogelio','Castro','Mationg',false),
(10,'Information Technology','Information Systems Analyst I','Wilfredo','Navarro','Sarmiento',false),
(11,'Information Technology','Administrative Aide VI','Arturo','Domingo','Ocampo',false),
-- Office of The City Accountant
(12,'Office of The City Accountant','City Accountant','Teresita','Gonzales','Almazan',true),
(13,'Office of The City Accountant','Accountant IV','Corazon','Villar','Enriquez',false),
(14,'Office of The City Accountant','Accountant III','Lourdes','Aguilar','Rosales',false),
(15,'Office of The City Accountant','Accountant III','Milagros','Fajardo','Buenaventura',false),
(16,'Office of The City Accountant','Accountant II','Josefina','Pascual','Concepcion',false),
(17,'Office of The City Accountant','Accountant I','Erlinda','Bautista','Magsaysay',false),
(18,'Office of The City Accountant','Management and Audit Analyst II','Remedios','Cruz','Valdez',false),
(19,'Office of The City Accountant','Bookkeeper II','Cristina','Reyes','Alonzo',false),
(20,'Office of The City Accountant','Accounting Clerk III','Marilou','Santos','Ferrer',false),
(21,'Office of The City Accountant','Accounting Clerk II','Nenita','Garcia','Tolentino',false),
(22,'Office of The City Accountant','Administrative Aide VI','Aurora','Flores','Lacson',false),
-- Office of The City Health Officer
(23,'Office of The City Health Officer','City Health Officer','Ramon','Dizon','Macapagal',true),
(24,'Office of The City Health Officer','Medical Officer IV','Gloria','Estrada','Villaroman',false),
(25,'Office of The City Health Officer','Medical Officer III','Benjamin','Ocampo','Zamora',false),
(26,'Office of The City Health Officer','Nurse III','Perla','Rivera','Custodio',false),
(27,'Office of The City Health Officer','Nurse II','Leonardo','Aquino','Mendoza',false),
(28,'Office of The City Health Officer','Midwife II','Imelda','Bonifacio','Pineda',false),
(29,'Office of The City Health Officer','Dentist II','Cesar','Villanueva','Guevarra',false),
(30,'Office of The City Health Officer','Sanitation Inspector II','Editha','Ramos','Cabrera',false),
(31,'Office of The City Health Officer','Medical Technologist II','Rodolfo','Cruz','Palanca',false),
(32,'Office of The City Health Officer','Pharmacist II','Victoria','Santos','Manalo',false),
(33,'Office of The City Health Officer','Administrative Aide VI','Ernesto','Reyes','Bacani',false),
-- Legal
(34,'Legal','City Legal Officer','Amelia','Roxas','Katigbak',true),
(35,'Legal','Attorney IV','Rafael','Lim','Sionil',false),
(36,'Legal','Attorney III','Bienvenido','Cruz','Aragon',false),
(37,'Legal','Attorney II','Purita','Santos','Escudero',false),
(38,'Legal','Legal Officer III','Salvador','Reyes','Montenegro',false),
(39,'Legal','Legal Officer II','Concepcion','Flores','Yulo',false),
(40,'Legal','Legal Assistant III','Alberto','Garcia','Ledesma',false),
(41,'Legal','Legal Assistant II','Natividad','Ramos','Ayala',false),
(42,'Legal','Legal Researcher II','Gregorio','Santos','Zulueta',false),
(43,'Legal','Administrative Officer II','Dolores','Cruz','Osmena',false),
(44,'Legal','Administrative Aide VI','Feliciano','Reyes','Cojuangco',false),
-- Office of The City Engineer
(45,'Office of The City Engineer','City Engineer','Vicente','Aquino','Lazaro',true),
(46,'Office of The City Engineer','Engineer IV','Isagani','Cruz','Rustia',false),
(47,'Office of The City Engineer','Engineer III','Honorio','Santos','Padilla',false),
(48,'Office of The City Engineer','Engineer II','Restituto','Reyes','Gatchalian',false),
(49,'Office of The City Engineer','Engineer I','Domingo','Flores','Advincula',false),
(50,'Office of The City Engineer','Architect II','Emmanuel','Garcia','Sison',false),
(51,'Office of The City Engineer','Draftsman III','Bayani','Ramos','Trinidad',false),
(52,'Office of The City Engineer','Draftsman II','Nestor','Santos','Quintos',false),
(53,'Office of The City Engineer','Construction and Maintenance Foreman','Marcelo','Cruz','Ilagan',false),
(54,'Office of The City Engineer','Engineering Assistant','Teodoro','Reyes','Banaag',false),
(55,'Office of The City Engineer','Administrative Aide VI','Pedro','Villanueva','Samonte',false);

-- ── 3. Reshape existing employees + insert new to reach exactly 55 ──────────
DO $$
DECLARE n int;
BEGIN
  -- Neutralise emails first so the name-based reassignment can't transiently
  -- collide with an existing unique email during the UPDATE.
  UPDATE employees SET email = 'seed-tmp-' || id || '@local.invalid';

  SELECT count(*) INTO n FROM employees;

  -- Map existing rows onto slots 1..LEAST(n,55): formal names, office, position.
  WITH ex AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM employees)
  UPDATE employees e SET
    first_name = s.first, middle_name = s.middle, last_name = s.last,
    department = s.office, position = s.position,
    employment_status = 'Regular', status = 'Active',
    email = lower(s.first) || '.' || lower(s.last) || '@cityhall.gov.ph'
  FROM ex JOIN org_slots s ON s.slot = ex.rn
  WHERE e.id = ex.id AND ex.rn <= 55;

  -- Any existing rows beyond 55 are separated (not deleted). Not expected at 30.
  WITH ex AS (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM employees)
  UPDATE employees e SET status = 'Separated'
  FROM ex WHERE e.id = ex.id AND ex.rn > 55;

  -- Insert new employees for the slots the current headcount didn't cover.
  INSERT INTO employees
    (employee_number, first_name, middle_name, last_name, email, department, position,
     employment_status, status, nationality, account_status, date_hired, created_by)
  SELECT
    'EMP-2026-9' || LPAD(s.slot::text, 3, '0'),
    s.first, s.middle, s.last,
    lower(s.first) || '.' || lower(s.last) || '@cityhall.gov.ph',
    s.office, s.position, 'Regular', 'Active', 'Filipino', 'Active',
    DATE '2024-01-15' + (s.slot || ' days')::interval,
    '00000000-0000-0000-0000-000000000000'
  FROM org_slots s
  WHERE s.slot > n;
END $$;

-- ── 4. One Department Head per office; Supervisor office-role retired ───────
UPDATE office_role_assignments
   SET status = 'Revoked', revoked_at = now(),
       revoke_reason = COALESCE(revoke_reason, 'Consolidated: one Department Head per office; Supervisor role retired.')
 WHERE status = 'Active';

ALTER TABLE office_role_assignments DROP CONSTRAINT IF EXISTS office_role_assignments_role_check;
ALTER TABLE office_role_assignments
  ADD CONSTRAINT office_role_assignments_role_check CHECK (role IN ('DeptHead'));

-- Assign the head of each office (the employee now holding the head position).
INSERT INTO office_role_assignments
  (employee_id, employee_name, office_id, office_name, role, status, assigned_by, must_change_password)
SELECT e.id, btrim(e.first_name || ' ' || e.last_name), d.id, d.name, 'DeptHead', 'Active', 'org-restructure', true
FROM org_slots s
JOIN employees e ON e.department = s.office AND e.position = s.position
JOIN departments d ON d.name = s.office
WHERE s.is_head;

-- Point each office's head_employee_id at its Department Head.
UPDATE departments d SET head_employee_id = ora.employee_id
FROM office_role_assignments ora
WHERE ora.office_id = d.id AND ora.role = 'DeptHead' AND ora.status = 'Active';

NOTIFY pgrst, 'reload schema';
COMMIT;

-- ── Verification (run after applying) ───────────────────────────────────────
-- SELECT name FROM departments WHERE is_active ORDER BY name;                         -- expect the 5
-- SELECT department, count(*) FROM employees WHERE status='Active' GROUP BY 1;         -- expect 11 each, 55 total
-- SELECT office_name, count(*) FROM office_role_assignments
--   WHERE role='DeptHead' AND status='Active' GROUP BY 1;                              -- expect 1 each
-- SELECT count(*) FROM office_role_assignments WHERE role='Supervisor' AND status='Active';  -- expect 0
