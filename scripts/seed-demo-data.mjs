// ⚠️  DEMO / STAGING SEED SCRIPT — NEVER RUN AGAINST PRODUCTION ⚠️
//
// Creates interlocking demo data (auth accounts, employees, training programs,
// sessions, enrollments, ratings, requests, IDP goals, FGD notes) so every
// LND and PM page has real, consistent, navigable content.
//
// Prerequisites:
//   1. Apply supabase/migrations/20260705_lnd_seed_schema_extensions.sql first.
//   2. Copy .env.seed.example → .env.seed and fill in your staging project creds.
//
// Run:
//   node scripts/seed-demo-data.mjs
//
// Output: scripts/seed-credentials.md  (gitignored — keep private)

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(__dir, '..');

// ── Load .env.seed ────────────────────────────────────────────────────────────
const envFile = join(ROOT, '.env.seed');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  console.error('   Copy .env.seed.example → .env.seed and fill in your values.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const SEED_PASSWORD = 'Demo@CICTrix2026';
const credentials   = [];   // { role, name, email, password }

// ── SEED DATA DEFINITIONS ─────────────────────────────────────────────────────

const DEPARTMENTS = [
  { code: 'HRMO',  name: 'HRMO',                  topComp: 'Public Administration Principles',        trCat: 'Leadership'         },
  { code: 'EO',    name: 'Engineering Office',     topComp: 'Technical Writing for Government Documents', trCat: 'Technical'       },
  { code: 'BO',    name: 'Budget Office',          topComp: 'Fiscal Management/Budgeting for LGU',    trCat: 'Technical'          },
  { code: 'ICT',   name: 'ICT/MIS Office',         topComp: 'Digital Literacy for Government Services', trCat: 'Technical'        },
  { code: 'HO',    name: 'Health Office',          topComp: 'Community Engagement Skills',             trCat: 'Employee Development'},
  { code: 'AO',    name: "Assessor's Office",      topComp: 'Transparency and Accountability Practices', trCat: 'Technical'       },
  { code: 'AGR',   name: 'Agriculture Office',     topComp: 'Community Engagement Skills',             trCat: 'Employee Development'},
  { code: 'MSWD',  name: 'Social Welfare Office',  topComp: 'Public Communication Skills',             trCat: 'Employee Development'},
];

// Ratings index 0-1 = low performers; 2-5 = satisfactory; 6-8 = very satisfactory; 9 = outstanding
const EMP_RATINGS = [2.30, 2.65, 3.10, 3.25, 3.50, 3.75, 4.00, 4.25, 4.50, 4.80];

const LND_ADMINS = [
  { fn: 'Alex',    mn: 'Reyes',    ln: 'Gonzales', pos: 'L&D Division Chief',    sex: 'Male',   dob: '1982-04-10', hire: '2008-06-01' },
  { fn: 'Maricel', mn: 'Cruz',     ln: 'Dela Rosa',pos: 'Training Officer III',  sex: 'Female', dob: '1985-09-25', hire: '2011-03-15' },
];

const PM_ADMINS = [
  { fn: 'Jonathan', mn: 'Santos',  ln: 'Cruz', pos: 'PM Division Chief',  sex: 'Male',   dob: '1980-12-02', hire: '2007-08-01' },
  { fn: 'Patricia', mn: 'Navarro', ln: 'Lim',  pos: 'HR Evaluator II',   sex: 'Female', dob: '1987-06-18', hire: '2013-01-10' },
];

const DEPT_HEADS = [
  { dept:'HRMO',                  fn:'Maria Cristina', mn:'Buenaventura', ln:'Aguilar',   pos:'HRMO Division Chief',  sex:'Female', dob:'1975-03-20', hire:'2000-07-01' },
  { dept:'Engineering Office',    fn:'Roberto',        mn:'Santos',        ln:'Dela Cruz', pos:'City Engineer',         sex:'Male',   dob:'1972-11-05', hire:'1999-04-01' },
  { dept:'Budget Office',         fn:'Josephine',      mn:'Ramos',         ln:'Mendoza',   pos:'City Budget Officer',   sex:'Female', dob:'1978-08-14', hire:'2003-09-15' },
  { dept:'ICT/MIS Office',        fn:'Noel Patrick',   mn:'Flores',        ln:'Salazar',   pos:'MIS Division Head',     sex:'Male',   dob:'1983-01-30', hire:'2010-02-01' },
  { dept:'Health Office',         fn:'Analiza',        mn:'Reyes',         ln:'Santos',    pos:'City Health Officer',   sex:'Female', dob:'1976-05-22', hire:'2001-11-01' },
  { dept:"Assessor's Office",     fn:'Fernando',       mn:'Ocampo',        ln:'Reyes',     pos:'City Assessor',          sex:'Male',   dob:'1970-09-08', hire:'1998-01-15' },
  { dept:'Agriculture Office',    fn:'Elisa',          mn:'Castillo',      ln:'Macaraeg',  pos:'City Agriculturist',    sex:'Female', dob:'1980-07-12', hire:'2006-05-01' },
  { dept:'Social Welfare Office', fn:'Corazon',        mn:'Padilla',       ln:'Bautista',  pos:'MSWD Officer',           sex:'Female', dob:'1977-02-28', hire:'2002-03-01' },
];

const EMPLOYEES_BY_DEPT = {
  'HRMO': [
    { fn:'Ana Marie',    mn:'Cruz',         ln:'Santos',      pos:'HR Officer III',                sex:'Female', dob:'1985-03-15', hire:'2010-06-01' },
    { fn:'Ronaldo',      mn:'Dela Torre',   ln:'Corpuz',      pos:'HR Officer II',                 sex:'Male',   dob:'1988-07-22', hire:'2013-02-15' },
    { fn:'Luz Divina',   mn:'Hernandez',    ln:'Esperanza',   pos:'HR Officer I',                  sex:'Female', dob:'1990-11-08', hire:'2016-04-01' },
    { fn:'Danilo',       mn:'Vitug',        ln:'Villanueva',  pos:'Personnel Development Officer I',sex:'Male',   dob:'1987-05-30', hire:'2014-09-15' },
    { fn:'Jenny Rose',   mn:'Alcantara',    ln:'Calderon',    pos:'Records Officer II',            sex:'Female', dob:'1992-01-17', hire:'2018-07-01' },
    { fn:'Marco Antonio',mn:'Gutierrez',    ln:'Delos Reyes', pos:'Administrative Aide VI',        sex:'Male',   dob:'1995-08-25', hire:'2021-01-01' },
    { fn:'Shirley Mae',  mn:'Dela Cruz',    ln:'Gonzalez',    pos:'HR Specialist',                 sex:'Female', dob:'1986-12-03', hire:'2012-05-01' },
    { fn:'Efren Jr.',    mn:'Bayan',        ln:'Gutierrez',   pos:'Administrative Officer I',      sex:'Male',   dob:'1983-06-14', hire:'2009-10-15' },
    { fn:'Kristine Anne',mn:'Poblete',      ln:'Paras',       pos:'HR Officer II',                 sex:'Female', dob:'1991-09-20', hire:'2017-03-01' },
    { fn:'Benjamin',     mn:'Aquino',       ln:'Ocampo',      pos:'Records Officer I',             sex:'Male',   dob:'1993-04-07', hire:'2019-06-01' },
  ],
  'Engineering Office': [
    { fn:'Dante',        mn:'Morales',      ln:'Cruz',        pos:'Engineer II',                   sex:'Male',   dob:'1984-02-18', hire:'2011-08-01' },
    { fn:'Rhodora',      mn:'Albano',       ln:'Pascual',     pos:'Engineer I',                    sex:'Female', dob:'1989-06-10', hire:'2015-01-15' },
    { fn:'Clemente Jr.', mn:'Ong',          ln:'Tan',         pos:'Draftsman II',                  sex:'Male',   dob:'1986-10-22', hire:'2013-07-01' },
    { fn:'Anabelle',     mn:'Vargas',       ln:'Ramos',       pos:'Engineering Assistant II',      sex:'Female', dob:'1991-03-05', hire:'2017-10-15' },
    { fn:'Eduardo',      mn:'Villanueva',   ln:'Santos',      pos:'Engineer III',                  sex:'Male',   dob:'1979-08-30', hire:'2005-05-01' },
    { fn:'Marites',      mn:'Laguna',       ln:'Flores',      pos:'Administrative Officer V',      sex:'Female', dob:'1982-12-15', hire:'2008-11-01' },
    { fn:'Dennis',       mn:'Buenaventura', ln:'Rivera',      pos:'Engineer I',                    sex:'Male',   dob:'1993-01-28', hire:'2019-02-01' },
    { fn:'Gracia',       mn:'Ponce',        ln:'Catalan',     pos:'Engineering Assistant I',       sex:'Female', dob:'1994-07-04', hire:'2020-06-15' },
    { fn:'Ronel',        mn:'Castro',       ln:'Castillo',    pos:'Engineer II',                   sex:'Male',   dob:'1987-04-19', hire:'2014-03-01' },
    { fn:'Imelda',       mn:'Guzman',       ln:'Barrientos',  pos:'Administrative Aide IV',        sex:'Female', dob:'1990-09-11', hire:'2016-09-01' },
  ],
  'Budget Office': [
    { fn:'Conchita',     mn:'Sison',        ln:'Abad',        pos:'Budget Officer III',            sex:'Female', dob:'1978-05-20', hire:'2003-04-01' },
    { fn:'Ramil',        mn:'Dela Peña',    ln:'Soriano',     pos:'Budget Officer II',             sex:'Male',   dob:'1985-11-14', hire:'2010-10-15' },
    { fn:'Tessie',       mn:'Coronel',      ln:'Manalo',      pos:'Budget Officer I',              sex:'Female', dob:'1989-03-08', hire:'2015-07-01' },
    { fn:'Gideon',       mn:'Santos',       ln:'Lacson',      pos:'Budget Specialist',             sex:'Male',   dob:'1983-07-25', hire:'2009-01-15' },
    { fn:'Flordeliza',   mn:'Tan',          ln:'Mendez',      pos:'Administrative Officer III',    sex:'Female', dob:'1987-01-31', hire:'2013-06-01' },
    { fn:'Alejandro',    mn:'Cruz',         ln:'Gutierrez',   pos:'Budget Officer II',             sex:'Male',   dob:'1980-10-16', hire:'2006-08-01' },
    { fn:'Celia',        mn:'Reyes',        ln:'Abejo',       pos:'Administrative Aide VI',        sex:'Female', dob:'1992-06-02', hire:'2018-01-01' },
    { fn:'Norman',       mn:'Lim',          ln:'Torino',      pos:'Budget Officer I',              sex:'Male',   dob:'1990-12-20', hire:'2016-05-15' },
    { fn:'Lilia',        mn:'Buenaventura', ln:'Bautista',    pos:'Records Officer I',             sex:'Female', dob:'1994-02-28', hire:'2020-09-01' },
    { fn:'Adriano',      mn:'Manalo',       ln:'Cruz',        pos:'Administrative Officer II',     sex:'Male',   dob:'1988-08-10', hire:'2014-12-01' },
  ],
  'ICT/MIS Office': [
    { fn:'Kyle Aaron',   mn:'Navarro',      ln:'Dizon',       pos:'Computer Programmer II',        sex:'Male',   dob:'1990-05-14', hire:'2016-03-01' },
    { fn:'Hazel Anne',   mn:'Santos',       ln:'Reyes',       pos:'IT Officer I',                  sex:'Female', dob:'1992-09-08', hire:'2018-06-15' },
    { fn:'Jerome',       mn:'Dela Cruz',    ln:'Domingo',     pos:'Computer Programmer I',         sex:'Male',   dob:'1994-01-22', hire:'2020-01-01' },
    { fn:'Michelle',     mn:'Lim',          ln:'Tan',         pos:'Systems Analyst II',            sex:'Female', dob:'1987-11-30', hire:'2013-11-15' },
    { fn:'Carlo',        mn:'Aquino',       ln:'Ramos',       pos:'Data Controller I',             sex:'Male',   dob:'1991-04-17', hire:'2017-07-01' },
    { fn:'Tricia',       mn:'Hernandez',    ln:'Macaraeg',    pos:'Computer Programmer II',        sex:'Female', dob:'1989-07-05', hire:'2015-09-01' },
    { fn:'Aldo',         mn:'Buenaventura', ln:'Fernandez',   pos:'IT Officer I',                  sex:'Male',   dob:'1993-03-12', hire:'2019-04-15' },
    { fn:'Camille',      mn:'Santos',       ln:'Uy',          pos:'Administrative Aide VI',        sex:'Female', dob:'1995-12-01', hire:'2021-08-01' },
    { fn:'Renz Anthony', mn:'Cruz',         ln:'Villanueva',  pos:'Computer Maintenance Technologist I',sex:'Male',dob:'1988-06-28',hire:'2014-05-01' },
    { fn:'Joanna Marie', mn:'Reyes',        ln:'Garcia',      pos:'IT Officer II',                 sex:'Female', dob:'1986-02-14', hire:'2012-03-01' },
  ],
  'Health Office': [
    { fn:'Remedios',     mn:'Agustin',      ln:'Pascua',      pos:'Nurse II',                      sex:'Female', dob:'1984-08-22', hire:'2010-01-01' },
    { fn:'Amado',        mn:'Macaraeg',     ln:'Guerrero',    pos:'Health Officer I',              sex:'Male',   dob:'1979-12-10', hire:'2005-04-01' },
    { fn:'Nilda',        mn:'Aquino',       ln:'Santos',      pos:'Nurse I',                       sex:'Female', dob:'1991-05-03', hire:'2017-01-15' },
    { fn:'Froilan',      mn:'Bautista',     ln:'Macapagal',   pos:'Sanitation Inspector I',        sex:'Male',   dob:'1986-10-18', hire:'2013-08-01' },
    { fn:'Marian',       mn:'Dela Cruz',    ln:'Sison',       pos:'Administrative Officer IV',     sex:'Female', dob:'1988-03-27', hire:'2014-11-01' },
    { fn:'Cesar',        mn:'Gonzalez',     ln:'Lim',         pos:'Health Officer I',              sex:'Male',   dob:'1982-07-15', hire:'2008-06-01' },
    { fn:'Leticia',      mn:'Manalo',       ln:'Delos Santos',pos:'Nurse II',                      sex:'Female', dob:'1985-01-09', hire:'2011-05-15' },
    { fn:'Rodel',        mn:'Cruz',         ln:'Agustin',     pos:'Sanitation Inspector I',        sex:'Male',   dob:'1993-09-25', hire:'2019-10-01' },
    { fn:'Marilyn',      mn:'Santos',       ln:'Herrera',     pos:'Nurse I',                       sex:'Female', dob:'1992-06-14', hire:'2018-03-01' },
    { fn:'Arsenio',      mn:'Ocampo',       ln:'Castro',      pos:'Administrative Aide VI',        sex:'Male',   dob:'1994-11-30', hire:'2020-07-15' },
  ],
  "Assessor's Office": [
    { fn:'Elma',         mn:'Navarro',      ln:'Conception',  pos:'Appraiser II',                  sex:'Female', dob:'1980-04-05', hire:'2006-09-01' },
    { fn:'Norberto',     mn:'Reyes',        ln:'Quisumbing',  pos:'Tax Mapper II',                 sex:'Male',   dob:'1977-11-22', hire:'2003-01-15' },
    { fn:'Lourdes',      mn:'Santos',       ln:'Enriquez',    pos:'Appraiser I',                   sex:'Female', dob:'1985-08-15', hire:'2011-04-01' },
    { fn:'Salvador',     mn:'Dela Cruz',    ln:'Tolentino',   pos:'Revenue Officer I',             sex:'Male',   dob:'1982-03-28', hire:'2008-12-01' },
    { fn:'Teresita',     mn:'Buenaventura', ln:'Ang',         pos:"Assessor's Aide I",             sex:'Female', dob:'1990-07-11', hire:'2016-06-15' },
    { fn:'Aurelio',      mn:'Hernandez',    ln:'Velasco',     pos:'Appraiser II',                  sex:'Male',   dob:'1975-12-03', hire:'2001-08-01' },
    { fn:'Virginia',     mn:'Lim',          ln:'Sy',          pos:'Administrative Officer III',    sex:'Female', dob:'1988-01-18', hire:'2014-02-01' },
    { fn:'Ruperto',      mn:'Santos',       ln:'Hipolito',    pos:'Tax Mapper I',                  sex:'Male',   dob:'1992-05-26', hire:'2018-09-01' },
    { fn:'Gloria',       mn:'Cruz',         ln:'Chua',        pos:'Administrative Aide VI',        sex:'Female', dob:'1995-10-04', hire:'2021-03-01' },
    { fn:'Hermie',       mn:'Aquino',       ln:'Torres',      pos:'Appraiser I',                   sex:'Male',   dob:'1987-08-31', hire:'2013-05-15' },
  ],
  'Agriculture Office': [
    { fn:'Pacita',       mn:'Santos',       ln:'Dela Torre',  pos:'Agriculturist II',              sex:'Female', dob:'1979-06-16', hire:'2005-10-01' },
    { fn:'Armando',      mn:'Cruz',         ln:'Pascual',     pos:'Agricultural Technologist II',  sex:'Male',   dob:'1984-02-08', hire:'2010-07-01' },
    { fn:'Rosalinda',    mn:'Navarro',      ln:'Natividad',   pos:'Agriculturist I',               sex:'Female', dob:'1988-09-22', hire:'2015-01-01' },
    { fn:'Ernesto',      mn:'Dela Cruz',    ln:'Cabrera',     pos:'Agricultural Technologist I',   sex:'Male',   dob:'1991-05-14', hire:'2017-06-15' },
    { fn:'Corazon',      mn:'Reyes',        ln:'Padilla',     pos:'Farm Worker II',                sex:'Female', dob:'1987-11-29', hire:'2013-12-01' },
    { fn:'Benito',       mn:'Santos',       ln:'Domingo',     pos:'Agricultural Technologist II',  sex:'Male',   dob:'1981-03-17', hire:'2007-09-01' },
    { fn:'Felicitas',    mn:'Lim',          ln:'Soriano',     pos:'Agriculturist I',               sex:'Female', dob:'1990-08-05', hire:'2016-04-01' },
    { fn:'Godofredo',    mn:'Cruz',         ln:'Santos',      pos:'Administrative Aide VI',        sex:'Male',   dob:'1993-12-20', hire:'2020-01-15' },
    { fn:'Narcisa',      mn:'Buenaventura', ln:'Reyes',       pos:'Agricultural Technologist I',   sex:'Female', dob:'1989-04-08', hire:'2015-10-01' },
    { fn:'Rodolfo',      mn:'Manalo',       ln:'Garcia',      pos:'Agriculturist II',              sex:'Male',   dob:'1976-07-31', hire:'2002-11-01' },
  ],
  'Social Welfare Office': [
    { fn:'Luz',          mn:'Santos',       ln:'Cabanilla',   pos:'Social Welfare Officer II',     sex:'Female', dob:'1981-10-12', hire:'2007-06-01' },
    { fn:'Tomas',        mn:'Cruz',         ln:'Arevalo',     pos:'Social Welfare Officer I',      sex:'Male',   dob:'1986-04-25', hire:'2012-09-15' },
    { fn:'Eleonor',      mn:'Reyes',        ln:'Lacuesta',    pos:'Social Worker II',              sex:'Female', dob:'1989-08-07', hire:'2015-03-01' },
    { fn:'Feliciano',    mn:'Dela Cruz',    ln:'Ramos',       pos:'DSWD Officer I',                sex:'Male',   dob:'1984-01-19', hire:'2010-12-01' },
    { fn:'Prudencia',    mn:'Navarro',      ln:'Castillo',    pos:'Community Development Officer I',sex:'Female',dob:'1991-06-03', hire:'2017-08-15' },
    { fn:'Victoriano',   mn:'Santos',       ln:'Mercado',     pos:'Social Welfare Officer I',      sex:'Male',   dob:'1983-11-28', hire:'2009-04-01' },
    { fn:'Asuncion',     mn:'Buenaventura', ln:'de Leon',     pos:'Administrative Officer III',    sex:'Female', dob:'1978-07-15', hire:'2004-07-01' },
    { fn:'Domingo',      mn:'Lim',          ln:'Navarro',     pos:'Social Welfare Officer II',     sex:'Male',   dob:'1987-03-09', hire:'2013-10-01' },
    { fn:'Milagros',     mn:'Cruz',         ln:'Padua',       pos:'Administrative Aide VI',        sex:'Female', dob:'1993-09-21', hire:'2019-01-15' },
    { fn:'Laureano',     mn:'Santos',       ln:'Dalmacio',    pos:'Social Worker I',               sex:'Male',   dob:'1990-02-14', hire:'2016-11-01' },
  ],
};

const TRAINING_PROGRAMS = [
  { name:'Integrity, Values, and Ethics in Public Service',        category:'Compliance',   description:'Reinforces core values of public service: integrity, transparency, accountability, and ethical conduct.' },
  { name:'Transparency, Accountability, and Anti-Corruption Workshop', category:'Compliance', description:'Builds practical SALN submission, FOIA compliance, audit readiness, and anti-corruption practice skills.' },
  { name:'Effective Communication for Government Employees',       category:'Soft Skills',  description:'Develops oral and written communication competencies tailored for LGU settings.' },
  { name:'Community Engagement and Stakeholder Partnership',       category:'Soft Skills',  description:'Equips employees with tools to plan and execute community consultations and multi-sector partnerships.' },
  { name:'Frontline Leadership Excellence Program',                category:'Leadership',   description:'Prepares supervisors and division chiefs for strategic planning, conflict resolution, and performance coaching.' },
  { name:'Project Management for Government Initiatives',          category:'Leadership',   description:'Covers project lifecycle, Gantt charts, procurement scheduling, and stakeholder reporting for LGU projects.' },
  { name:'Digital Systems and e-Government Tools Training',        category:'Technical',    description:'Hands-on training on government digital platforms: GSIS e-Card, PhilSys, online procurement, and LGU portals.' },
  { name:'Government Financial Management and Budgeting',          category:'Technical',    description:'In-depth coverage of GAA, Annual Budget Preparation, SARO processing, and COA audit compliance.' },
];

// 11 completed sessions for enrollments/evaluations; rest are upcoming
const SESSIONS_2026 = [
  { pi:0, title:'Ethics in Public Service — Batch 1',                    date:'2026-02-10T08:00:00', cap:40, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Atty. Reynaldo Macaraeg' },
  { pi:0, title:'Ethics in Public Service — Batch 2',                    date:'2026-03-18T08:00:00', cap:40, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Atty. Reynaldo Macaraeg' },
  { pi:1, title:'Transparency and Accountability Workshop',              date:'2026-04-22T08:00:00', cap:30, loc:'Provincial Capitol Function Room',      status:'Completed', internal:false, inst:'Dr. Esmeralda Fajardo' },
  { pi:2, title:'Public Communication Skills — Module 1',               date:'2026-01-15T08:00:00', cap:25, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Dr. Rosario Alcantara' },
  { pi:2, title:'Public Communication Skills — Module 2',               date:'2026-05-12T08:00:00', cap:25, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Dr. Rosario Alcantara' },
  { pi:3, title:'Community Engagement — Health & MSWD Track',           date:'2026-03-05T08:00:00', cap:35, loc:'Barangay Multi-Purpose Hall',           status:'Completed', internal:true,  inst:'Ms. Leah Buenaventura' },
  { pi:4, title:'Leadership Excellence — Division Chiefs Cohort',       date:'2026-06-09T08:00:00', cap:20, loc:'Provincial Capitol Board Room',         status:'Completed', internal:false, inst:'Dr. Percival Sanchez' },
  { pi:5, title:'Project Management Fundamentals — Batch 1',           date:'2026-02-24T08:00:00', cap:30, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Engr. Ferdinand Ngo' },
  { pi:5, title:'Project Management Fundamentals — Batch 2',           date:'2026-04-07T08:00:00', cap:30, loc:'LGU Training Hall',                    status:'Completed', internal:true,  inst:'Engr. Ferdinand Ngo' },
  { pi:6, title:'Digital Systems Orientation — Batch 1',               date:'2026-01-27T08:00:00', cap:35, loc:'ICT/MIS Lab — City Hall Annex',         status:'Completed', internal:true,  inst:'Mr. Bart Ocampo' },
  { pi:7, title:'Annual Budget Preparation Workshop',                   date:'2026-03-25T08:00:00', cap:20, loc:'Budget Office Conference Room',         status:'Completed', internal:true,  inst:'Ms. Cynthia Vidal' },
  { pi:6, title:'Digital Systems Orientation — Batch 2',               date:'2026-05-19T08:00:00', cap:35, loc:'ICT/MIS Lab — City Hall Annex',         status:'Upcoming',  internal:true,  inst:'Mr. Bart Ocampo' },
  { pi:7, title:'COA Audit Readiness Seminar',                          date:'2026-06-30T08:00:00', cap:25, loc:'Provincial Capitol Function Room',      status:'Upcoming',  internal:false, inst:'Dir. Carmelita Mendez' },
  { pi:1, title:'SALN and FOIA Compliance Training',                    date:'2026-07-28T08:00:00', cap:50, loc:'LGU Training Hall',                    status:'Upcoming',  internal:true,  inst:'Atty. Reynaldo Macaraeg' },
  { pi:4, title:'Leadership Excellence — Supervisors Cohort',          date:'2026-08-18T08:00:00', cap:25, loc:'HRMO Conference Room',                  status:'Upcoming',  internal:true,  inst:'Dr. Percival Sanchez' },
  { pi:3, title:'Community Engagement — Agriculture & MSWD Track',     date:'2026-09-10T08:00:00', cap:30, loc:'City Agriculture Office',               status:'Upcoming',  internal:true,  inst:'Ms. Leah Buenaventura' },
  { pi:0, title:'Anti-Corruption Values Refresher',                     date:'2026-10-05T08:00:00', cap:60, loc:'LGU Training Hall',                    status:'Upcoming',  internal:true,  inst:'Atty. Reynaldo Macaraeg' },
  { pi:2, title:'Technical Report Writing for Government Employees',   date:'2026-11-12T08:00:00', cap:30, loc:'HRMO Conference Room',                  status:'Upcoming',  internal:true,  inst:'Dr. Rosario Alcantara' },
  { pi:5, title:'Procurement and Project Scheduling Workshop',         date:'2026-12-09T08:00:00', cap:20, loc:'Engineering Office Conference Room',     status:'Upcoming',  internal:false, inst:'Engr. Ferdinand Ngo' },
  { pi:6, title:'e-Government Tools Advanced Track',                    date:'2026-11-25T08:00:00', cap:20, loc:'ICT/MIS Lab — City Hall Annex',         status:'Upcoming',  internal:true,  inst:'Mr. Bart Ocampo' },
];

const SESSIONS_2027 = [
  { pi:0, title:'Ethics and Integrity Refresher 2027',                  date:'2027-02-15T08:00:00', cap:50, loc:'LGU Training Hall',                    ps:'Confirmed',    internal:true,  inst:'Atty. Reynaldo Macaraeg' },
  { pi:1, title:'Advanced Transparency Workshop 2027',                  date:'2027-03-10T08:00:00', cap:35, loc:'Provincial Capitol Function Room',      ps:'Approved',     internal:false, inst:'Dr. Esmeralda Fajardo' },
  { pi:2, title:'Communication Mastery — Year 2 Module',               date:'2027-01-20T08:00:00', cap:30, loc:'LGU Training Hall',                    ps:'Confirmed',    internal:true,  inst:'Dr. Rosario Alcantara' },
  { pi:3, title:'Community Organizing for LGU Staff 2027',             date:'2027-04-07T08:00:00', cap:40, loc:'Barangay Multi-Purpose Hall',           ps:'Proposed',     internal:true,  inst:'TBD' },
  { pi:4, title:'Leadership Excellence — Supervisors 2027',            date:'2027-05-19T08:00:00', cap:25, loc:'HRMO Conference Room',                  ps:'Approved',     internal:true,  inst:'Dr. Percival Sanchez' },
  { pi:4, title:'Leadership for Division Chiefs 2027',                  date:'2027-06-09T08:00:00', cap:20, loc:'Provincial Capitol Board Room',         ps:'Confirmed',    internal:false, inst:'Dr. Percival Sanchez' },
  { pi:5, title:'Project Management Masterclass 2027',                  date:'2027-03-24T08:00:00', cap:30, loc:'LGU Training Hall',                    ps:'Needs Budget', internal:false, inst:'Engr. Ferdinand Ngo' },
  { pi:6, title:'Digital Government Systems — Advanced 2027',          date:'2027-02-10T08:00:00', cap:30, loc:'ICT/MIS Lab — City Hall Annex',         ps:'Approved',     internal:true,  inst:'Mr. Bart Ocampo' },
  { pi:6, title:'Cybersecurity Awareness for LGU Staff',               date:'2027-07-14T08:00:00', cap:60, loc:'LGU Training Hall',                    ps:'Proposed',     internal:false, inst:'TBD' },
  { pi:7, title:'National Budget Preparation Training 2027',           date:'2027-01-28T08:00:00', cap:20, loc:'Budget Office Conference Room',         ps:'Confirmed',    internal:true,  inst:'Ms. Cynthia Vidal' },
  { pi:7, title:'COA Advanced Compliance Seminar 2027',                 date:'2027-08-25T08:00:00', cap:25, loc:'Provincial Capitol Function Room',      ps:'Needs Budget', internal:false, inst:'Dir. Carmelita Mendez' },
  { pi:1, title:'Freedom of Information Act Workshop 2027',            date:'2027-09-15T08:00:00', cap:50, loc:'LGU Training Hall',                    ps:'Proposed',     internal:true,  inst:'TBD' },
];

// Training requests — one record per entry below; dept heads are requestors.
// Status intentionally spread: approved/pending/rejected across all 4 categories per dept.
const TR_DEFS = [
  { dept:'HRMO',                  cat:'Leadership',            comp:'Public Administration Principles',         profs:[2,4], metric:'Division chiefs apply strategic HR planning within 6 months',                    status:'approved', title:'Strategic HR Management Program',           just:'Division chiefs need structured leadership training to implement civil service reforms.' },
  { dept:'HRMO',                  cat:'Technical',             comp:'Data and Records Management and Organization', profs:[2,4], metric:'Achieve 95% digital filing compliance by Q4 2026',                       status:'pending',  title:'Digital Records Management System Training', just:'Transition to eDMS requires staff upskilling in document management.' },
  { dept:'HRMO',                  cat:'Cultural Transformation',comp:'Transparency and Accountability Practices',profs:[3,5], metric:'All staff complete SALN online filing within deadline',                      status:'approved', title:'Transparency in Public Service Workshop',    just:'Reinforce SALN, FOIA, and anti-corruption practices across HRMO staff.' },
  { dept:'HRMO',                  cat:'Employee Development',  comp:'Public Communication Skills',             profs:[2,3], metric:'Improve inter-department coordination scores by 20%',                         status:'rejected', title:'Professional Communication Enhancement',     just:'Improve inter-departmental communication and public-facing service interactions.' },

  { dept:'Engineering Office',    cat:'Technical',             comp:'Technical Writing for Government Documents',profs:[2,4], metric:'100% of project reports pass COA documentation standards',                   status:'approved', title:'Government Technical Report Writing',        just:'Engineers need training to produce clear, audit-ready technical reports.' },
  { dept:'Engineering Office',    cat:'Technical',             comp:'Digital Literacy for Government Services', profs:[2,4], metric:'All engineers trained on AutoCAD and LGU e-procurement by Q3',              status:'pending',  title:'Digital Tools for Engineering Projects',     just:'Upskill engineers on AutoCAD, digital blueprints, and the online procurement system.' },
  { dept:'Engineering Office',    cat:'Leadership',            comp:'Project Management in a Public Setting',   profs:[2,4], metric:'90% of infrastructure projects completed on schedule in 2026',               status:'approved', title:'Infrastructure Project Management Masterclass',just:'Division chiefs need PM training to ensure on-time, on-budget city infrastructure delivery.' },
  { dept:'Engineering Office',    cat:'Cultural Transformation',comp:'Ethical Conduct and Public Service Standards',profs:[3,5], metric:'Zero procurement irregularities for 2026 infrastructure contracts',    status:'pending',  title:'Ethical Procurement and Anti-Corruption Training',just:'Embed ethical standards in engineering procurement workflows.' },

  { dept:'Budget Office',         cat:'Technical',             comp:'Fiscal Management/Budgeting for LGU',     profs:[2,4], metric:'Budget utilization rate improved to 85%+ by year-end',                      status:'approved', title:'Advanced LGU Budget Preparation Training',   just:'Budget officers need to master Annual Budget Preparation and SARO utilization.' },
  { dept:'Budget Office',         cat:'Technical',             comp:'Transparency and Accountability Practices',profs:[2,4], metric:'Achieve green COA rating in financial statement audit',                      status:'approved', title:'COA Compliance and Financial Reporting Workshop',just:'Improve audit readiness and eliminate common COA findings.' },
  { dept:'Budget Office',         cat:'Employee Development',  comp:'Public Communication Skills',             profs:[2,3], metric:'Budget coordination meetings reduced from 5 to 3 rounds per cycle',          status:'pending',  title:'Budget Communication and Presentation Skills',just:'Budget staff needs to communicate financial data effectively to non-finance colleagues.' },
  { dept:'Budget Office',         cat:'Cultural Transformation',comp:'Knowledge of Local Governance',          profs:[2,4], metric:'All budget staff completes LGC refresher by Q2',                             status:'rejected', title:'Local Government Code and LGU Finance Workshop',just:'Staff needs refresher on LGC provisions on local fiscal management.' },

  { dept:'ICT/MIS Office',        cat:'Technical',             comp:'Digital Literacy for Government Services', profs:[3,5], metric:'Reduce IT helpdesk tickets by 30% through staff self-service capability',   status:'approved', title:'Advanced e-Government Systems Administration', just:'ICT staff needs advanced training on PhilSys integration and DICT portals.' },
  { dept:'ICT/MIS Office',        cat:'Technical',             comp:'Data and Records Management and Organization',profs:[2,4], metric:'Implement city-wide data backup system by Q3 2026',                    status:'approved', title:'Data Governance and Records Management Training',just:'Establish proper data governance to ensure compliance with NPC regulations.' },
  { dept:'ICT/MIS Office',        cat:'Employee Development',  comp:'Community Engagement Skills',             profs:[1,3], metric:'ICT staff rated as helpful by 80%+ of departments surveyed',                 status:'pending',  title:'Customer Service and User Support Excellence', just:'ICT staff struggles to communicate technical concepts to non-technical colleagues.' },
  { dept:'ICT/MIS Office',        cat:'Leadership',            comp:'Project Management in a Public Setting',   profs:[2,4], metric:'ICT projects delivered on schedule 90% of the time',                       status:'approved', title:'IT Project Management for Government',         just:'MIS Division Head and senior staff need PM training for government ICT initiatives.' },

  { dept:'Health Office',         cat:'Employee Development',  comp:'Community Engagement Skills',             profs:[2,4], metric:'Health programs reach 90%+ of target beneficiaries by Q4',                   status:'approved', title:'Community Health Outreach and Engagement Training',just:'Health staff needs skills to mobilize barangay health workers and engage the community.' },
  { dept:'Health Office',         cat:'Employee Development',  comp:'Public Communication Skills',             profs:[2,3], metric:'Patient satisfaction score improves to 4.5/5.0 by year-end',                status:'approved', title:'Health Communication and Patient Interaction Skills',just:'Health personnel need communication training to serve patients and deliver health advisories.' },
  { dept:'Health Office',         cat:'Cultural Transformation',comp:'Ethical Conduct and Public Service Standards',profs:[3,5], metric:'Zero complaints on professional conduct',                                status:'pending',  title:'Medical Ethics and Public Service Values',   just:'Reinforce ethical standards and professional conduct for all health personnel.' },
  { dept:'Health Office',         cat:'Technical',             comp:'Disaster Risk Reduction and Management',   profs:[1,3], metric:'All health staff completes DRRM protocols by typhoon season',               status:'rejected', title:'DRRM Health Response Training',              just:'Health personnel need DRRM training to respond to disasters and public health emergencies.' },

  { dept:"Assessor's Office",     cat:'Technical',             comp:'Technical Writing for Government Documents',profs:[2,4], metric:'100% of assessments documented per BLGF standards',                       status:'approved', title:'Assessment Documentation and Report Writing', just:'Assessors need training to produce legally defensible assessment reports.' },
  { dept:"Assessor's Office",     cat:'Technical',             comp:'Transparency and Accountability Practices',profs:[2,3], metric:'All RPT records updated and publicly accessible by Q4',                     status:'pending',  title:'Property Assessment Transparency Workshop',  just:'Improve transparency in real property tax assessment to reduce taxpayer disputes.' },
  { dept:"Assessor's Office",     cat:'Cultural Transformation',comp:'Knowledge of Local Governance',          profs:[2,4], metric:'All assessors complete LGC and BLGF refresher by Q2',                       status:'approved', title:'Property Assessment Law and Governance Workshop',just:'Ensure all assessors are updated on LGC and BLGF regulations.' },
  { dept:"Assessor's Office",     cat:'Leadership',            comp:'Public Administration Principles',         profs:[2,4], metric:'Assessment operations streamlined by 20%',                                 status:'pending',  title:'Leadership and Operational Management for Assessors',just:'Dept head and senior staff need leadership training to manage operations effectively.' },

  { dept:'Agriculture Office',    cat:'Employee Development',  comp:'Community Engagement Skills',             profs:[2,4], metric:'80% of farmers in target barangays engaged in extension programs',           status:'approved', title:'Agricultural Extension and Community Mobilization',just:'Agriculture staff needs training to effectively deliver extension services to farmers.' },
  { dept:'Agriculture Office',    cat:'Cultural Transformation',comp:'Knowledge of Local Governance',          profs:[2,4], metric:'All agriculture staff completes LGC refresher by Q2',                       status:'approved', title:'Local Governance and Agriculture Service Delivery',just:'Reinforce understanding of LGC provisions on agriculture and DAR regulations.' },
  { dept:'Agriculture Office',    cat:'Technical',             comp:'Disaster Risk Reduction and Management',   profs:[1,3], metric:'DRRM-ready agricultural contingency plan approved by CDRRMC',               status:'pending',  title:'Agricultural DRRM and Climate-Smart Farming', just:'Agriculture staff needs DRRM training to support farmers during calamities.' },
  { dept:'Agriculture Office',    cat:'Employee Development',  comp:'Public Communication Skills',             profs:[2,3], metric:'Farmer feedback score for extension services reaches 4.0/5.0',               status:'rejected', title:'Agricultural Communication and Extension Methods',just:'Improve how agriculture staff communicates technical farming advice to non-expert farmers.' },

  { dept:'Social Welfare Office', cat:'Employee Development',  comp:'Community Engagement Skills',             profs:[2,4], metric:'90% of target beneficiaries enrolled in social programs by Q3',              status:'approved', title:'Social Work Community Engagement Program',    just:'Social workers need skills to identify and engage vulnerable communities for DSWD programs.' },
  { dept:'Social Welfare Office', cat:'Employee Development',  comp:'Public Communication Skills',             profs:[2,4], metric:'Client feedback score improves to 4.5/5.0',                                 status:'approved', title:'Client Communication and Case Management Skills',just:'Social workers need enhanced communication skills for sensitive case interviews.' },
  { dept:'Social Welfare Office', cat:'Cultural Transformation',comp:'Ethical Conduct and Public Service Standards',profs:[3,5], metric:'Zero ethical violations or client complaints for the year',             status:'pending',  title:'Social Work Ethics and Professional Conduct',just:'Reinforce ethical standards in social work practice for vulnerable beneficiary handling.' },
  { dept:'Social Welfare Office', cat:'Technical',             comp:'Digital Literacy for Government Services', profs:[1,3], metric:'All social workers trained on DSWD-MIIS by Q2 2026',                       status:'pending',  title:'DSWD Digital Systems and MIS Training',      just:'Social workers need training on the DSWD Management Information System and other digital tools.' },
];

// IDP goals: index 0 and 1 in each dept are the low performers targeted here
const IDP_DEFS = [
  { dept:'HRMO',                  empIdx:0, goals:[
    { title:'Improve HRMO Policy Writing Skills',          comp:'Public Administration Principles',             cl:2, tl:4, date:'2026-12-31', notes:'Enroll in Technical Writing workshop Q3 2026.' },
    { title:'Digital Records Compliance',                  comp:'Data and Records Management and Organization', cl:1, tl:3, date:'2026-09-30', notes:'Complete eDMS onboarding by July 2026.' },
  ]},
  { dept:'HRMO',                  empIdx:1, goals:[
    { title:'Leadership Communication Skills',             comp:'Public Communication Skills',                  cl:2, tl:4, date:'2026-10-31', notes:'Attend Communication Mastery seminar Q3.' },
  ]},
  { dept:'Engineering Office',    empIdx:0, goals:[
    { title:'Technical Report Writing Proficiency',        comp:'Technical Writing for Government Documents',   cl:2, tl:4, date:'2026-11-30', notes:'COA documentation compliance required.' },
    { title:'e-Procurement System Mastery',                comp:'Digital Literacy for Government Services',     cl:1, tl:3, date:'2026-08-31', notes:'Mandatory per regional office directive.' },
  ]},
  { dept:'Engineering Office',    empIdx:1, goals:[
    { title:'Project Scheduling and Gantt Charts',         comp:'Project Management in a Public Setting',       cl:2, tl:4, date:'2026-12-31', notes:'Apply to Q4 infrastructure project.' },
  ]},
  { dept:'Budget Office',         empIdx:0, goals:[
    { title:'Annual Budget Preparation Mastery',           comp:'Fiscal Management/Budgeting for LGU',          cl:2, tl:5, date:'2026-09-30', notes:'Prepare for next year budget cycle.' },
    { title:'COA Compliance Documentation',                comp:'Transparency and Accountability Practices',    cl:2, tl:4, date:'2026-08-31', notes:'Reduce COA findings to zero.' },
  ]},
  { dept:'Budget Office',         empIdx:1, goals:[
    { title:'Financial Presentation Skills',               comp:'Public Communication Skills',                  cl:2, tl:3, date:'2026-10-31', notes:'Improve budget briefing clarity.' },
  ]},
  { dept:'ICT/MIS Office',        empIdx:0, goals:[
    { title:'PhilSys and DICT Portal Administration',      comp:'Digital Literacy for Government Services',     cl:3, tl:5, date:'2026-07-31', notes:'Lead PhilSys city rollout.' },
  ]},
  { dept:'ICT/MIS Office',        empIdx:1, goals:[
    { title:'Data Governance Framework Implementation',    comp:'Data and Records Management and Organization', cl:2, tl:4, date:'2026-11-30', notes:'NPC compliance target.' },
    { title:'IT Support Communication Skills',             comp:'Community Engagement Skills',                  cl:1, tl:3, date:'2026-08-31', notes:'Improve helpdesk satisfaction scores.' },
  ]},
  { dept:'Health Office',         empIdx:0, goals:[
    { title:'Barangay Health Program Facilitation',        comp:'Community Engagement Skills',                  cl:2, tl:4, date:'2026-09-30', notes:'Target: 90% beneficiary reach by Q4.' },
  ]},
  { dept:'Health Office',         empIdx:1, goals:[
    { title:'Patient Communication Improvement',           comp:'Public Communication Skills',                  cl:2, tl:4, date:'2026-10-31', notes:'DOH patient satisfaction target.' },
    { title:'DRRM Health Response Protocols',              comp:'Disaster Risk Reduction and Management',       cl:1, tl:3, date:'2026-06-30', notes:'Typhoon season preparedness.' },
  ]},
  { dept:"Assessor's Office",     empIdx:0, goals:[
    { title:'Assessment Report Documentation Standards',   comp:'Technical Writing for Government Documents',   cl:2, tl:4, date:'2026-10-31', notes:'BLGF compliance requirement.' },
  ]},
  { dept:"Assessor's Office",     empIdx:1, goals:[
    { title:'Real Property Tax Assessment Transparency',   comp:'Transparency and Accountability Practices',    cl:2, tl:4, date:'2026-11-30', notes:'Reduce taxpayer disputes.' },
    { title:'LGC and BLGF Policy Knowledge',               comp:'Knowledge of Local Governance',                cl:2, tl:4, date:'2026-07-31', notes:'Update on new BLGF circulars.' },
  ]},
  { dept:'Agriculture Office',    empIdx:0, goals:[
    { title:'Community Agricultural Extension Methods',    comp:'Community Engagement Skills',                  cl:2, tl:4, date:'2026-09-30', notes:'Target 80% farmer participation.' },
  ]},
  { dept:'Agriculture Office',    empIdx:1, goals:[
    { title:'Agricultural DRRM Response Planning',         comp:'Disaster Risk Reduction and Management',       cl:1, tl:3, date:'2026-06-30', notes:'CDRRMC contingency plan submission.' },
    { title:'Climate-Smart Farming Communication',         comp:'Public Communication Skills',                  cl:2, tl:3, date:'2026-10-31', notes:'Farmer survey feedback improvement.' },
  ]},
  { dept:'Social Welfare Office', empIdx:0, goals:[
    { title:'Vulnerable Community Engagement',             comp:'Community Engagement Skills',                  cl:2, tl:4, date:'2026-09-30', notes:'DSWD 4Ps enrollment targets.' },
  ]},
  { dept:'Social Welfare Office', empIdx:1, goals:[
    { title:'Social Case Interview Communication',         comp:'Public Communication Skills',                  cl:2, tl:4, date:'2026-08-31', notes:'Client complaint reduction target.' },
    { title:'DSWD MIIS System Proficiency',                comp:'Digital Literacy for Government Services',     cl:1, tl:3, date:'2026-07-31', notes:'DSWD mandatory system training.' },
  ]},
];

const FGD_DATA = [
  { dept:'HRMO',                  date:'2026-01-20', fac:'Alex Gonzales (L&D Division Chief)',      parts:['Maria Cristina Aguilar','Ana Marie Santos','Ronaldo Corpuz','Jenny Rose Calderon'],          need:'Improve HR policy documentation and records management',               cat:'Technical',             comp:'Data and Records Management and Organization',   notes:'Significant gap identified in digital records management. Staff expressed difficulty navigating the legacy filing system. Consensus on the need for a structured eDMS training. Dept head flagged upcoming CSC compliance requirements.' },
  { dept:'Engineering Office',    date:'2026-02-15', fac:'Maricel Dela Rosa (L&D Training Officer)',parts:['Roberto Dela Cruz','Dante Cruz','Eduardo Santos','Ronel Castillo'],                           need:'Technical report writing and e-procurement skills gap',                cat:'Technical',             comp:'Technical Writing for Government Documents',     notes:'Recent COA findings cited poor documentation quality. Multiple participants never attended a formal technical writing course. The group requested both report writing and hands-on e-procurement system training. Linked to Engineering Office TR-EO-001.' },
  { dept:'Health Office',         date:'2026-03-10', fac:'Alex Gonzales (L&D Division Chief)',      parts:['Analiza Santos','Remedios Pascua','Marian Sison','Marilyn Herrera'],                          need:'Community outreach facilitation and health program engagement',         cat:'Employee Development',  comp:'Community Engagement Skills',                    notes:'Health staff finds it difficult to engage barangay residents in health programs, especially in far-flung areas. Language barriers and cultural resistance were cited as key challenges. Participants requested a community engagement seminar with role-play exercises and local case studies.' },
  { dept:'Social Welfare Office', date:'2026-04-05', fac:'Maricel Dela Rosa (L&D Training Officer)',parts:['Corazon Bautista','Luz Cabanilla','Eleonor Lacuesta','Feliciano Ramos'],                     need:'Client communication and DSWD digital systems proficiency',            cat:'Employee Development',  comp:'Public Communication Skills',                    notes:'Social workers expressed frustration with the DSWD MIIS system, citing poor training during the original rollout. Communication challenges during case interviews with trauma-affected clients were also identified. The group suggested a combined communication skills and digital tools training.' },
  { dept:'ICT/MIS Office',        date:'2026-05-18', fac:'Alex Gonzales (L&D Division Chief)',      parts:['Noel Patrick Salazar','Kyle Aaron Dizon','Michelle Tan','Joanna Marie Garcia'],               need:'Data governance and NPC compliance framework',                         cat:'Technical',             comp:'Data and Records Management and Organization',   notes:'ICT staff discussed the implications of the recent NPC audit. Knowledge gaps on data retention policies, encryption standards, and breach notification protocols were identified. Participants requested a structured data governance training with NPC compliance components. Directly supports ICT/MIS TR-ICT-002.' },
  { dept:'Agriculture Office',    date:'2026-06-02', fac:'Maricel Dela Rosa (L&D Training Officer)',parts:['Elisa Macaraeg','Pacita Dela Torre','Armando Pascual','Rosalinda Natividad'],                 need:'Agricultural DRRM and climate-smart farming readiness',                cat:'Technical',             comp:'Disaster Risk Reduction and Management',         notes:'Participants expressed urgency around DRRM readiness following the 2025 flood damage to city farm areas. Staff knowledge of contingency plans and climate-smart farming techniques was critically low. The FGD recommended a DRRM-focused training with participation from CDRRMC and DA technical experts. Linked to TR-AGR-003.' },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────

function slug(firstName, lastName, dept) {
  const fn = firstName.toLowerCase().replace(/\s+/g,'.');
  const ln = lastName.toLowerCase().replace(/\s+/g,'.');
  const d  = dept ? `.${dept.toLowerCase().replace(/[^a-z]/g,'')}` : '';
  return `${fn}.${ln}${d}`;
}

function empNum(deptCode, seq) {
  return `${deptCode}-${String(seq).padStart(3,'0')}`;
}

async function getOrCreateAuthUser(email, password, userMeta) {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (list?.users ?? []).find(u => u.email === email);
  if (existing) {
    console.log(`  ↩  exists: ${email}`);
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMeta,
    app_metadata: { role: userMeta.role },
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  console.log(`  ✓  created auth: ${email}`);
  return data.user.id;
}

async function upsertEmployee(row) {
  const { data: ex } = await db.from('employees').select('id').eq('email', row.email).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from('employees').insert(row).select('id').single();
  if (error) throw new Error(`employee insert(${row.email}): ${error.message}`);
  return data.id;
}

async function upsertDept(code, name) {
  const { data: ex } = await db.from('departments').select('id').eq('code', code).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from('departments')
    .insert({ code, name, is_active: true })
    .select('id').single();
  if (error) {
    // table might not exist or have different columns — log and continue
    console.warn(`  ⚠  dept insert(${code}): ${error.message}`);
    return null;
  }
  return data.id;
}

async function upsertProgram(prog) {
  const { data: ex } = await db.from('training_programs').select('id').eq('name', prog.name).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from('training_programs')
    .insert({ ...prog, status: 'Active' }).select('id').single();
  if (error) throw new Error(`program insert(${prog.name}): ${error.message}`);
  return data.id;
}

async function upsertSession(sess) {
  const { data: ex } = await db.from('training_sessions').select('id').eq('title', sess.title).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from('training_sessions').insert(sess).select('id').single();
  if (error) throw new Error(`session insert(${sess.title}): ${error.message}`);
  return data.id;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('\n🌱  CICTrix LND/PM Demo Seed — Starting…\n');
  console.log('⚠️  STAGING/TEST ENVIRONMENT ONLY\n');

  // ── 1. Departments ─────────────────────────────────────────────────────────
  console.log('📂  Seeding departments…');
  const deptIdMap = {};  // name → departments.id (may be null if table missing)
  for (const d of DEPARTMENTS) {
    deptIdMap[d.name] = await upsertDept(d.code, d.name);
  }

  // ── 2. LND Admins ──────────────────────────────────────────────────────────
  console.log('\n👤  Seeding LND admin accounts…');
  for (const [i, a] of LND_ADMINS.entries()) {
    const email = `${slug(a.fn, a.ln)}@demo.cictrix.gov.ph`;
    const uid   = await getOrCreateAuthUser(email, SEED_PASSWORD, { role: 'LND', name: `${a.fn} ${a.ln}` });
    await upsertEmployee({
      employee_number: empNum('LND', i + 1),
      first_name: a.fn, middle_name: a.mn, last_name: a.ln,
      email, phone: `09${String(1001 + i).padStart(9,'0')}`,
      position: a.pos, department: 'L&D Division',
      date_hired: a.hire, status: 'Active',
      user_account_id: uid,
      date_of_birth: a.dob, sex: a.sex,
      civil_status: i === 0 ? 'Married' : 'Single',
      nationality: 'Filipino',
    });
    credentials.push({ role: 'LND Admin', name: `${a.fn} ${a.ln}`, email, password: SEED_PASSWORD });
  }

  // ── 3. PM Admins ───────────────────────────────────────────────────────────
  console.log('\n👤  Seeding PM admin accounts…');
  for (const [i, a] of PM_ADMINS.entries()) {
    const email = `${slug(a.fn, a.ln)}@demo.cictrix.gov.ph`;
    const uid   = await getOrCreateAuthUser(email, SEED_PASSWORD, { role: 'PM', name: `${a.fn} ${a.ln}` });
    await upsertEmployee({
      employee_number: empNum('PM', i + 1),
      first_name: a.fn, middle_name: a.mn, last_name: a.ln,
      email, phone: `09${String(2001 + i).padStart(9,'0')}`,
      position: a.pos, department: 'PM Division',
      date_hired: a.hire, status: 'Active',
      user_account_id: uid,
      date_of_birth: a.dob, sex: a.sex,
      civil_status: i === 0 ? 'Married' : 'Single',
      nationality: 'Filipino',
    });
    credentials.push({ role: 'PM Admin', name: `${a.fn} ${a.ln}`, email, password: SEED_PASSWORD });
  }

  // ── 4. Dept Heads + regular employees ─────────────────────────────────────
  console.log('\n👥  Seeding department heads and employees…');
  const deptHeadEmpId = {};   // dept name → employees.id
  const empIdsByDept  = {};   // dept name → [employees.id] (regular employees, ordered)

  for (const dh of DEPT_HEADS) {
    const deptDef  = DEPARTMENTS.find(d => d.name === dh.dept);
    const deptCode = deptDef?.code ?? 'XX';
    const email    = `${slug(dh.fn, dh.ln)}@demo.cictrix.gov.ph`;
    const uid      = await getOrCreateAuthUser(email, SEED_PASSWORD, { role: 'office', name: `${dh.fn} ${dh.ln}`, department: dh.dept });
    const empId    = await upsertEmployee({
      employee_number: empNum(deptCode, 0),
      first_name: dh.fn, middle_name: dh.mn, last_name: dh.ln,
      email, phone: `09${String(3001 + DEPT_HEADS.indexOf(dh)).padStart(9,'0')}`,
      position: dh.pos, department: dh.dept,
      date_hired: dh.hire, status: 'Active',
      user_account_id: uid,
      date_of_birth: dh.dob, sex: dh.sex,
      civil_status: 'Married', nationality: 'Filipino',
    });
    deptHeadEmpId[dh.dept] = empId;
    credentials.push({ role: 'Dept Head', name: `${dh.fn} ${dh.ln}`, dept: dh.dept, email, password: SEED_PASSWORD });

    // Regular employees
    const empList = EMPLOYEES_BY_DEPT[dh.dept] ?? [];
    empIdsByDept[dh.dept] = [];
    for (const [j, e] of empList.entries()) {
      const empEmail = `${slug(e.fn, e.ln)}@demo.cictrix.gov.ph`;
      const eUid     = await getOrCreateAuthUser(empEmail, SEED_PASSWORD, { role: 'employee', name: `${e.fn} ${e.ln}`, department: dh.dept });
      const eId      = await upsertEmployee({
        employee_number: empNum(deptCode, j + 1),
        first_name: e.fn, middle_name: e.mn, last_name: e.ln,
        email: empEmail, phone: `09${String(4000 + DEPARTMENTS.indexOf(deptDef) * 100 + j).padStart(9,'0')}`,
        position: e.pos, department: dh.dept,
        date_hired: e.hire, status: 'Active',
        user_account_id: eUid,
        date_of_birth: e.dob, sex: e.sex,
        civil_status: j % 3 === 0 ? 'Married' : 'Single',
        nationality: 'Filipino',
      });
      empIdsByDept[dh.dept].push(eId);
      credentials.push({ role: 'Employee', name: `${e.fn} ${e.ln}`, dept: dh.dept, email: empEmail, password: SEED_PASSWORD });
    }
  }

  // ── 5. Training Programs ───────────────────────────────────────────────────
  console.log('\n📚  Seeding training programs…');
  const progIds = [];
  for (const p of TRAINING_PROGRAMS) {
    progIds.push(await upsertProgram(p));
  }

  // ── 6. Training Sessions 2026 (current year) ───────────────────────────────
  console.log('\n📅  Seeding 2026 training sessions…');
  const sessionIds2026 = [];
  for (const s of SESSIONS_2026) {
    const sid = await upsertSession({
      program_id: progIds[s.pi],
      title: s.title,
      scheduled_date: s.date,
      capacity: s.cap,
      location: s.loc,
      status: s.status,
      instructor_name: s.inst,
      is_internal: s.internal,
    });
    sessionIds2026.push({ id: sid, status: s.status, pi: s.pi });
  }

  // ── 7. Training Sessions 2027 (planned next year) ─────────────────────────
  console.log('\n📅  Seeding 2027 planned training sessions…');
  for (const s of SESSIONS_2027) {
    await upsertSession({
      program_id: progIds[s.pi],
      title: s.title,
      scheduled_date: s.date,
      capacity: s.cap,
      location: s.loc,
      status: 'Upcoming',
      plan_status: s.ps,
      instructor_name: s.inst,
      is_internal: s.internal,
    });
  }

  // ── 8. Training Enrollments (for completed sessions) ──────────────────────
  console.log('\n📝  Seeding training enrollments and evaluation scores…');
  const completedSessions = sessionIds2026.filter(s => s.status === 'Completed');

  // Collect all employee IDs for enrollment distribution
  const allEmpIds = Object.values(empIdsByDept).flat();

  // Deterministic attendance status based on session and employee index
  const attendanceOptions = ['Present', 'Present', 'Present', 'Present', 'Excused', 'Absent'];

  // Two sessions use file_submission evaluation type (indices 0 and 6 = Completed sessions 0 and 6)
  const fileSubmissionSessionIndices = new Set([0, 6]);

  for (const [si, sess] of completedSessions.entries()) {
    // Enroll a slice of employees (8-15 per session, varied)
    const startIdx = (si * 8) % allEmpIds.length;
    const count    = 8 + (si % 8);
    const enrollees = [];
    for (let k = 0; k < count; k++) {
      enrollees.push(allEmpIds[(startIdx + k) % allEmpIds.length]);
    }
    const isFileSubmission = fileSubmissionSessionIndices.has(si);

    for (const [ei, empId] of enrollees.entries()) {
      // Check if enrollment already exists
      const { data: ex } = await db.from('training_enrollments')
        .select('id').eq('employee_id', empId).eq('session_id', sess.id).maybeSingle();
      if (ex) continue;

      const attnStatus = attendanceOptions[(ei + si) % attendanceOptions.length];
      const attended   = attnStatus !== 'Absent';
      const preScore   = attended ? 40 + (ei * 7 + si * 3) % 31 : null;   // 40–70
      const delta      = attended ? 10 + (ei * 5 + si) % 25 : null;        // improvement 10–34
      // Mostly positive delta; introduce 2 flat/negative cases per session
      const postScore  = attended
        ? (ei % 8 === 3 ? preScore - 2 : ei % 8 === 6 ? preScore : preScore + delta)
        : null;

      const { error } = await db.from('training_enrollments').insert({
        employee_id: empId,
        session_id: sess.id,
        status: attended ? 'Completed' : 'Enrolled',
        completed_at: attended ? new Date('2026-06-30').toISOString() : null,
        score: postScore,
        attendance_status: attnStatus,
        pre_test_score:  isFileSubmission ? null : preScore,
        post_test_score: isFileSubmission ? null : postScore,
        evaluation_type: isFileSubmission ? 'file_submission' : 'quiz_score',
        submission_file_path: isFileSubmission && attended
          ? `evaluations/${empId}/session-${sess.id}-output.pdf`
          : null,
      });
      if (error) console.warn(`  ⚠  enrollment(${empId}, ${sess.id}): ${error.message}`);
    }
  }
  console.log('   ✓  enrollments inserted');

  // ── 9. PM/LND Reports (Summary of Ratings) ────────────────────────────────
  console.log('\n📊  Seeding PM→LND summary of ratings reports…');
  const periods = [
    { label: 'January–June 2025',  status: 'Actioned' },
    { label: 'July–December 2025', status: 'Reviewed' },
    { label: 'January–June 2026',  status: 'Pending Review' },
  ];

  for (const dept of DEPARTMENTS) {
    const empList = EMPLOYEES_BY_DEPT[dept.name] ?? [];

    for (const period of periods) {
      // Check for existing report
      const { data: ex } = await db.from('pm_lnd_reports')
        .select('id').eq('department', dept.name).eq('period', period.label).maybeSingle();
      if (ex) { console.log(`  ↩  report exists: ${dept.name} / ${period.label}`); continue; }

      // Build records array (IPCRRatingRecord shape)
      const records = empList.map((e, i) => {
        const rating = EMP_RATINGS[i % EMP_RATINGS.length];
        const deptDef = DEPARTMENTS.find(d => d.name === dept.name);
        const topComp = deptDef?.topComp ?? 'Public Administration Principles';

        // Competency breakdown: 3 competencies per employee, low performers have more gaps
        const comps = [
          { name: topComp,                     possessed: Math.max(1, Math.round(rating / 5 * 4)), required: 4, isGap: rating < 3.5 },
          { name: 'Public Communication Skills',possessed: Math.max(1, Math.round(rating / 5 * 3) + 1), required: 3, isGap: rating < 3.0 },
          { name: 'Ethical Conduct and Public Service Standards', possessed: Math.max(1, Math.round(rating / 5 * 4)), required: 4, isGap: false },
        ];

        return {
          id: empNum(dept.code, i + 1),
          department: dept.name,
          name: `${e.ln}, ${e.fn}`,
          position: e.pos,
          period: period.label,
          numericalRating: rating,
          remarks: rating < 3 ? 'Training Recommended' : '',
          submissionStatus: 'SUBMITTED',
          competencies: comps,
        };
      });

      const avgRating = records.reduce((s, r) => s + (r.numericalRating ?? 0), 0) / records.length;
      const flagged   = records.filter(r => (r.numericalRating ?? 5) < 3).map(r => r.id);

      const { error } = await db.from('pm_lnd_reports').insert({
        department: dept.name,
        period: period.label,
        average_rating: Math.round(avgRating * 100) / 100,
        employees_flagged: flagged,
        pm_notes: flagged.length > 0
          ? `${flagged.length} employee(s) below Satisfactory threshold. Training nomination recommended for ${dept.topComp ?? 'identified competency gaps'}.`
          : 'All employees meet Satisfactory threshold or above.',
        status: period.status,
        records: records,
      });
      if (error) console.warn(`  ⚠  pm_lnd_reports(${dept.name}/${period.label}): ${error.message}`);
      else console.log(`  ✓  ${dept.name} — ${period.label}`);
    }
  }

  // ── 10. Training Requests (drives LND Dashboard) ──────────────────────────
  console.log('\n📋  Seeding training requests…');
  for (const tr of TR_DEFS) {
    const headId = deptHeadEmpId[tr.dept];
    if (!headId) { console.warn(`  ⚠  no dept head id for ${tr.dept}`); continue; }

    const { data: ex } = await db.from('training_requests')
      .select('id').eq('title', tr.title).eq('employee_id', headId).maybeSingle();
    if (ex) { console.log(`  ↩  tr exists: ${tr.title}`); continue; }

    const now = new Date();
    const requestedDaysAgo = 30 + TR_DEFS.indexOf(tr) * 7;   // spread over past ~7 months
    const requestedAt = new Date(now.getTime() - requestedDaysAgo * 86_400_000).toISOString();
    const decidedAt   = tr.status !== 'pending'
      ? new Date(now.getTime() - (requestedDaysAgo - 14) * 86_400_000).toISOString()
      : null;

    const { error } = await db.from('training_requests').insert({
      employee_id: headId,
      title: tr.title,
      justification: tr.just,
      category: tr.cat,
      competency: tr.comp,
      rationales: [`Competency gap in ${tr.comp}`, 'Dept performance data shows training need', 'FGD/IDP source'],
      current_proficiency: tr.profs[0],
      desired_proficiency: tr.profs[1],
      after_training_metric: tr.metric,
      status: tr.status,
      requested_at: requestedAt,
      decided_at: decidedAt,
    });
    if (error) console.warn(`  ⚠  tr insert(${tr.title}): ${error.message}`);
    else console.log(`  ✓  [${tr.status.toUpperCase()}] ${tr.dept} — ${tr.cat}`);
  }

  // ── 11. IDP Entries ───────────────────────────────────────────────────────
  console.log('\n🎯  Seeding IDP entries…');
  for (const def of IDP_DEFS) {
    const empIds = empIdsByDept[def.dept] ?? [];
    const empId  = empIds[def.empIdx];
    if (!empId) { console.warn(`  ⚠  no empId for ${def.dept}[${def.empIdx}]`); continue; }

    for (const g of def.goals) {
      const { data: ex } = await db.from('idp_entries')
        .select('id').eq('employee_id', empId).eq('goal_title', g.title).maybeSingle();
      if (ex) continue;

      const { error } = await db.from('idp_entries').insert({
        employee_id:     empId,
        goal_title:      g.title,
        competency_name: g.comp,
        target_date:     g.date,
        current_level:   g.cl,
        target_level:    g.tl,
        status:          'In Progress',
        notes:           g.notes,
      });
      if (error) console.warn(`  ⚠  idp insert(${g.title}): ${error.message}`);
    }
  }
  console.log('   ✓  IDP entries inserted');

  // ── 12. FGD Notes ─────────────────────────────────────────────────────────
  console.log('\n💬  Seeding FGD notes…');
  for (const f of FGD_DATA) {
    const { data: ex } = await db.from('fgd_notes')
      .select('id').eq('department', f.dept).eq('session_date', f.date).eq('facilitator', f.fac).maybeSingle();
    if (ex) { console.log(`  ↩  fgd exists: ${f.dept} / ${f.date}`); continue; }

    const { error } = await db.from('fgd_notes').insert({
      department: f.dept, session_date: f.date, facilitator: f.fac,
      participants: f.parts, training_need: f.need, category: f.cat,
      competency_name: f.comp, notes: f.notes, source_label: 'FGD',
    });
    if (error) console.warn(`  ⚠  fgd insert(${f.dept}/${f.date}): ${error.message}`);
    else console.log(`  ✓  FGD: ${f.dept} — ${f.date}`);
  }

  // ── 13. Output Credentials ────────────────────────────────────────────────
  console.log('\n📄  Writing credentials file…');
  const groups = {};
  for (const c of credentials) {
    const g = c.role;
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  }

  let md = `# CICTrix Demo Seed Credentials\n\n`;
  md += `> ⚠️  **STAGING/DEMO ENVIRONMENT ONLY.**  \n`;
  md += `> This file contains known passwords for seeded demo accounts.  \n`;
  md += `> **Never commit this file. It is git-ignored.**\n\n`;
  md += `Seed date: ${new Date().toISOString().split('T')[0]}  \n`;
  md += `Supabase project: ${SUPABASE_URL}\n\n`;

  for (const [role, list] of Object.entries(groups)) {
    md += `## ${role}\n\n`;
    md += `| Name | Dept | Email | Password |\n|------|------|-------|----------|\n`;
    for (const c of list) {
      md += `| ${c.name} | ${c.dept ?? '—'} | \`${c.email}\` | \`${c.password}\` |\n`;
    }
    md += '\n';
  }

  const credFile = join(__dir, 'seed-credentials.md');
  writeFileSync(credFile, md, 'utf8');
  console.log(`\n✅  Credentials written to: scripts/seed-credentials.md`);
  console.log(`\n🎉  Seed complete! ${credentials.length} accounts created/verified.\n`);
  console.log('   All accounts use password: Demo@CICTrix2026\n');
}

seed().catch(err => {
  console.error('\n💥  Seed failed:', err.message);
  process.exit(1);
});
