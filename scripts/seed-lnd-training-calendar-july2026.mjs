// ─────────────────────────────────────────────────────────────────────────────
// Seed: 12 synthetic government/LGU training courses for July 2026, written to
// the LND Training Calendar (training_sessions) so Page 3's calendar/list is
// populated with a realistic capacity-building programme.
//
//   node scripts/seed-lnd-training-calendar-july2026.mjs
//
// Reference date is July 15, 2026. Status split is 4 Finished / 4 Ongoing /
// 4 Upcoming, each course carrying one of the 12 governance competencies.
//
// Schema note: training_sessions.category is DB-constrained to the 4 L&D chip
// colors ('Cultural Transformation','Employee Development','Leadership',
// 'Technical'), so the governance competency can't live there. Each course maps
// its competency to the closest category (for the calendar chip) and preserves
// the full competency + all the extra LGU fields (Course ID, Training Type,
// Target Participants, Enrolled, Provider) as labelled objective lines, which is
// where the calendar's detail panel surfaces them.
//
// Dates are anchored at 12:00 UTC so each course lands on the same calendar day
// regardless of the viewer's timezone. Idempotent: re-running replaces the same
// 12 courses (matched by Course ID marker) rather than duplicating them.
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const env = loadEnv();
const db = serviceClient(env);

// Noon-UTC ISO for a given July-2026 day (day-stable across timezones).
const jul = (day) => new Date(Date.UTC(2026, 6, day, 12, 0, 0)).toISOString();

// User status vocabulary → training_sessions status vocabulary.
const STATUS = { Finished: 'Completed', Ongoing: 'Ongoing', Upcoming: 'Scheduled' };

// The 12 courses. `category` is the mapped 4-value L&D chip; `competency` is the
// real governance competency, preserved in the objectives payload below.
const COURSES = [
  // ── Finished (end date before July 15) ────────────────────────────────────
  {
    courseId: 'TRN-2026-07-001',
    title: 'Foundations of Local Governance',
    competency: 'Knowledge of Local Governance',
    category: 'Leadership',
    type: 'Lecture Series',
    userStatus: 'Finished',
    start: jul(1), end: jul(3),
    location: 'City Hall Session Hall',
    target: 'Newly Elected Barangay Officials',
    enrolled: 42,
    trainer: 'Atty. Rolando M. Bautista',
    provider: 'DILG Region VI',
    description: 'Introduces the Local Government Code and the mandate, structure, and functions of LGUs.',
  },
  {
    courseId: 'TRN-2026-07-002',
    title: 'Principles of Public Administration in LGUs',
    competency: 'Public Administration Principles',
    category: 'Leadership',
    type: 'Seminar',
    userStatus: 'Finished',
    start: jul(4), end: jul(5),
    location: 'Provincial Capitol Convention Hall',
    target: 'LGU Department Heads',
    enrolled: 35,
    trainer: 'Dr. Imelda R. Fajardo',
    provider: 'Civil Service Commission (CSC) Regional Office',
    description: 'Covers core administrative theory, accountability, and public service delivery frameworks.',
  },
  {
    courseId: 'TRN-2026-07-003',
    title: 'Grassroots Community Engagement Workshop',
    competency: 'Community Engagement Skills',
    category: 'Cultural Transformation',
    type: 'Workshop',
    userStatus: 'Finished',
    start: jul(7), end: jul(9),
    location: 'Barangay Multi-purpose Hall',
    target: 'Barangay Officials & Community Volunteers',
    enrolled: 28,
    trainer: 'Ms. Kristine A. Villanueva',
    provider: 'LGU Community Affairs Office',
    description: 'Builds skills in participatory planning, stakeholder consultation, and community mobilization.',
  },
  {
    courseId: 'TRN-2026-07-004',
    title: 'Ethics and Integrity in Public Service',
    competency: 'Ethical Conduct and Public Service Standards',
    category: 'Cultural Transformation',
    type: 'Seminar',
    userStatus: 'Finished',
    start: jul(8), end: jul(10),
    location: 'City Hall Function Room B',
    target: 'All LGU Employees',
    enrolled: 48,
    trainer: 'Atty. Josefina C. Padua',
    provider: 'CSC / Office of the Ombudsman',
    description: 'Reviews RA 6713 (Code of Conduct) and applies its ethical standards to real workplace scenarios.',
  },

  // ── Ongoing (start before July 15, end after July 15) ─────────────────────
  {
    courseId: 'TRN-2026-07-005',
    title: 'LGU Budgeting and Fiscal Management Certification',
    competency: 'Fiscal Management / Budgeting for LGU',
    category: 'Technical',
    type: 'Certification Course',
    userStatus: 'Ongoing',
    start: jul(13), end: jul(17),
    location: 'Provincial Capitol AVR',
    target: 'Budget Officers & Treasury Staff',
    enrolled: 30,
    trainer: 'Mr. Ferdinand L. Aquino, CPA',
    provider: 'Commission on Audit (COA) / DBM',
    description: 'Certifies participants in LGU budget preparation, obligation, and disbursement under COA rules.',
  },
  {
    courseId: 'TRN-2026-07-006',
    title: 'Disaster Risk Reduction and Management Hands-on Training',
    competency: 'Disaster Risk Reduction and Management',
    category: 'Technical',
    type: 'Hands-on Training',
    userStatus: 'Ongoing',
    start: jul(14), end: jul(18),
    location: 'City DRRM Operations Center',
    target: 'DRRM Officers & Rescue Personnel',
    enrolled: 25,
    trainer: 'Engr. Marlon D. Reyes',
    provider: 'Office of Civil Defense (OCD)',
    description: 'Field-based training on hazard mapping, incident command, and emergency response protocols.',
  },
  {
    courseId: 'TRN-2026-07-007',
    title: 'Digital Literacy for Frontline Government Services',
    competency: 'Digital Literacy for Government Services',
    category: 'Technical',
    type: 'Webinar',
    userStatus: 'Ongoing',
    start: jul(10), end: jul(16),
    location: 'Zoom (Online)',
    target: 'Frontline & Administrative Staff',
    enrolled: 50,
    trainer: 'Ms. Angelica P. Soriano',
    provider: 'Department of Information and Communications Technology (DICT)',
    description: 'Introduces e-government tools, online service portals, and basic cybersecurity hygiene.',
  },
  {
    courseId: 'TRN-2026-07-008',
    title: 'Transparency and Accountability in Public Transactions',
    competency: 'Transparency and Accountability Practices',
    category: 'Cultural Transformation',
    type: 'Seminar',
    userStatus: 'Ongoing',
    start: jul(12), end: jul(16),
    location: 'Microsoft Teams (Online)',
    target: 'Procurement & Finance Staff',
    enrolled: 38,
    trainer: 'Dir. Nestor G. Lim',
    provider: 'COA / DILG',
    description: 'Discusses the Full Disclosure Policy, procurement transparency, and citizen oversight mechanisms.',
  },

  // ── Upcoming (start date after July 15) ───────────────────────────────────
  {
    courseId: 'TRN-2026-07-009',
    title: 'Project Management for Public Sector Programs',
    competency: 'Project Management in a Public Setting',
    category: 'Employee Development',
    type: 'Workshop',
    userStatus: 'Upcoming',
    start: jul(20), end: jul(22),
    location: 'City Hall Training Room A',
    target: 'Program Coordinators & Project Officers',
    enrolled: 26,
    trainer: 'Ms. Patricia B. Mendoza, PMP',
    provider: 'External Consultant (Ateneo School of Government)',
    description: 'Applies the project lifecycle, risk, and monitoring tools to LGU-funded programs and projects.',
  },
  {
    courseId: 'TRN-2026-07-010',
    title: 'Technical Writing for Government Documents',
    competency: 'Technical Writing for Government Documents',
    category: 'Employee Development',
    type: 'Workshop',
    userStatus: 'Upcoming',
    start: jul(23), end: jul(24),
    location: 'City Library Conference Room',
    target: 'Administrative & Records Staff',
    enrolled: 22,
    trainer: 'Prof. Daniel S. Ocampo',
    provider: 'LGU HR Office',
    description: 'Develops skills in drafting memoranda, resolutions, and clear official correspondence.',
  },
  {
    courseId: 'TRN-2026-07-011',
    title: 'Records and Data Management Systems Training',
    competency: 'Data and Records Management and Organization',
    category: 'Technical',
    type: 'Hands-on Training',
    userStatus: 'Upcoming',
    start: jul(27), end: jul(29),
    location: 'City Hall IT Laboratory',
    target: 'Records Officers & Administrative Staff',
    enrolled: 20,
    trainer: 'Ms. Grace T. Bautista',
    provider: 'National Archives of the Philippines / DICT',
    description: 'Trains staff on records classification, retention schedules, and digital archiving practices.',
  },
  {
    courseId: 'TRN-2026-07-012',
    title: 'Effective Public Communication and Media Relations',
    competency: 'Public Communication Skills',
    category: 'Employee Development',
    type: 'Seminar',
    userStatus: 'Upcoming',
    start: jul(29), end: jul(31),
    location: 'Google Meet (Online)',
    target: 'Information Officers & Spokespersons',
    enrolled: 40,
    trainer: 'Mr. Carlo V. Aguilar',
    provider: 'Philippine Information Agency (PIA)',
    description: 'Covers public messaging, press releases, and crisis communication strategies for LGUs.',
  },
];

// Marker embedded in objectives so the seed can find & replace its own rows.
const marker = (courseId) => `Course ID: ${courseId}`;

const toRow = (c) => ({
  program_id: null,
  title: c.title,
  category: c.category,
  scheduled_date: c.start,
  end_date: c.end,
  instructor_name: c.trainer,
  location: c.location,
  status: STATUS[c.userStatus],
  capacity: c.enrolled,
  objectives: [
    c.description,
    `Competency: ${c.competency}`,
    `Training Type: ${c.type}`,
    `Target Participants: ${c.target}`,
    `Enrolled Participants: ${c.enrolled}`,
    `Training Provider: ${c.provider}`,
    marker(c.courseId),
  ],
});

async function main() {
  // 1) Idempotency: remove any prior run of these exact courses. Match on the
  //    Course ID marker held in objectives so we never touch unrelated events.
  const markers = COURSES.map((c) => marker(c.courseId));
  const { data: existing, error: findErr } = await db
    .from('training_sessions')
    .select('id, objectives')
    .gte('scheduled_date', jul(1))
    .lt('scheduled_date', new Date(Date.UTC(2026, 7, 1, 0, 0, 0)).toISOString());
  if (findErr) die('lookup existing July-2026 sessions failed', findErr);

  const stale = (existing ?? [])
    .filter((r) => (r.objectives ?? []).some((o) => markers.includes(o)))
    .map((r) => r.id);
  if (stale.length) {
    const { error: delErr } = await db.from('training_sessions').delete().in('id', stale);
    if (delErr) die('delete prior seeded sessions failed', delErr);
    console.log(`↺ Removed ${stale.length} previously seeded course(s).`);
  }

  // 2) Insert the 12 fresh courses.
  const rows = COURSES.map(toRow);
  const { data, error } = await db.from('training_sessions').insert(rows).select('id, title, status');
  if (error) die('insert training sessions failed', error);

  console.log(`\n✓ Seeded ${data.length} LGU training courses into the July 2026 Training Calendar.\n`);
  const byStatus = { Completed: [], Ongoing: [], Scheduled: [] };
  for (const c of COURSES) byStatus[STATUS[c.userStatus]].push(c);
  const label = { Completed: 'FINISHED', Ongoing: 'ONGOING', Scheduled: 'UPCOMING' };
  for (const s of ['Completed', 'Ongoing', 'Scheduled']) {
    console.log(`  ${label[s]} (${byStatus[s].length}):`);
    for (const c of byStatus[s]) {
      console.log(`    ${c.courseId}  ${c.title}  —  ${c.competency}`);
    }
  }
  console.log('\nOpen the L&D Portal → Training Calendar (July 2026) to view them.\n');
}

main().catch((e) => die('seed-lnd-training-calendar-july2026 failed', e));
