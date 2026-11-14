const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const BranchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const CircleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const GradCapIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="0.5">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

// This page explains the succession model; the model itself runs in Succession
// Planning under the RSP dashboard. The tab names mirror its two stages.
//
// It used to describe a different system entirely — a four-stage "Position DNA
// / Candidate Matrix" workflow scored by C4.5 Decision Tree and a 9-Box Talent
// Matrix, weighted Education 20 / Experience 20 / Performance 30 /
// Potential-RQ 30. None of that exists in the codebase, the weights are not the
// ones the engine uses, and Potential/RQ is the leadership score the
// specification explicitly removed. An explainer that describes a system
// nobody built is worse than no explainer: it is read as a promise.
const tabs = [
  { id: 'overview', label: 'Overview', icon: <GridIcon /> },
  { id: 'qualification', label: 'Qualification Filter', icon: <LockIcon /> },
  { id: 'ranking', label: 'Weighted Ranking', icon: <ChevronIcon /> },
];

const steps = [
  {
    num: 1,
    label: 'Stage 1:',
    title: 'Qualification Filter',
    desc: "Checks each employee against the position's minimum education, eligibility, experience and training. This is a filter, not a score — an employee who misses any one of them is not ranked.",
    bg: 'var(--status-warning-light)',
    border: 'var(--status-warning)',
    color: 'var(--status-warning)',
    iconBg: 'var(--status-warning-light)',
    icon: <LockIcon />,
  },
  {
    num: 2,
    label: 'Stage 2:',
    title: 'Weighted Ranking',
    desc: 'Everyone who clears the filter is ranked on a 100-point readiness score: Performance 30, Experience 25, Training 20, Education 15, Tenure 10.',
    bg: 'var(--status-pending-light)',
    border: 'var(--status-pending)',
    color: 'var(--status-pending)',
    iconBg: 'var(--status-pending-light)',
    icon: <BranchIcon />,
  },
  {
    num: 3,
    label: 'Output:',
    title: 'Ranked Slate',
    desc: 'A ranked comparison with the score behind every row, each candidate’s readiness tier, and the gaps and required actions for anyone who did not clear the filter.',
    bg: 'var(--status-success-light)',
    border: 'var(--status-success)',
    color: 'var(--status-success)',
    iconBg: 'var(--status-success-light)',
    icon: <CircleIcon />,
  },
];

const howItWorks = [
  {
    n: 1,
    title: 'A filter, then a score:',
    text: "Minimum education, eligibility, experience and training are pass/fail. They are not weighted into the score, so strength in one cannot buy out a requirement the position actually sets.",
  },
  {
    n: 2,
    title: 'Weighted dimensions:',
    text: 'Performance (30%), Experience (25%), Training (20%), Education (15%) and Tenure (10%) make up the 100-point readiness score. There is no leadership or potential rating — every input is something already on record.',
  },
  {
    n: 3,
    title: 'Performance is the IPCR:',
    text: "Taken from the employee's latest IPCR, weighted by their department's own Core / Strategic / Support split rather than a flat average.",
  },
  {
    n: 4,
    title: 'Readiness tiers:',
    text: 'Ready Now, Ready in 1–2 Years, or a longer horizon — derived from the same score, with the gaps and required actions shown for each candidate.',
  },
  {
    n: 5,
    title: 'Nothing is invented:',
    text: 'An input with no data behind it is reported as not assessed rather than scored as zero, so a missing record never reads as a weak candidate.',
  },
];

// What has to be in place before the engine can rank anybody. These are data
// dependencies, not a schedule — the ranking itself is computed on demand.
const prerequisites = [
  {
    phase: 1,
    title: 'Position requirements',
    desc: "The critical position's minimum education, eligibility, experience and training, from the System of Ranking Positions.",
    time: 'Required',
  },
  {
    phase: 2,
    title: 'Employee records',
    desc: 'Education, eligibility, training hours and service dates on each employee profile.',
    time: 'Required',
  },
  {
    phase: 3,
    title: 'IPCR on record',
    desc: "A scored IPCR for the period, plus the department's function weighting. Without it, Performance is reported as not assessed.",
    time: 'Required',
  },
  {
    phase: 4,
    title: 'Work experience',
    desc: 'Position history on the employee record. Career progression is only assessed where this exists.',
    time: 'Optional',
  },
];

export default function SuccessionReadinessEngine() {
  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: 'var(--bg-page, #F1F5F9)',
        minHeight: '100vh',
        padding: '24px 16px',
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tab-btn { background: none; border: none; display: flex; align-items: center; gap: 6px; padding: 12px 4px; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--text-secondary); border-bottom: 2px solid transparent; transition: color 0.2s, border-color 0.2s; white-space: nowrap; }
        .tab-btn.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); font-weight: 600; cursor: default; }
        .tab-btn.disabled { cursor: not-allowed; opacity: 0.45; pointer-events: none; }
        .step-card { border-radius: 12px; padding: 20px; border: 1px solid; transition: transform 0.15s, box-shadow 0.15s; }
        .step-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .start-btn { background: var(--accent-primary); color: white; border: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; transition: opacity 0.2s, transform 0.15s; }
        .start-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .num-badge { width: 28px; height: 28px; border-radius: 50%; background: var(--status-pending-light); color: var(--status-pending); font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .phase-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: var(--text-secondary); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .time-chip { font-size: 12px; color: var(--status-pending); background: var(--status-pending-light); padding: 3px 10px; border-radius: 20px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          background: 'var(--bg-control)',
          borderRadius: 16,
          boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '28px 32px 0', borderBottom: `1px solid var(--border-subtle)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GradCapIcon />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                }}
              >
                Succession Readiness Engine
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  marginTop: 2,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                Department Head Evaluation for Promotion & Succession Planning
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, overflowX: 'auto' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`tab-btn${t.id === 'overview' ? ' active' : ' disabled'}`}
                disabled={t.id !== 'overview'}
              >
                <span style={{ opacity: 0.7 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '32px 32px 40px' }}>
          <div style={{ marginBottom: 8 }}>
            <h2
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 26,
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              How succession ranking works
            </h2>
          </div>

          <p
            style={{
              fontSize: 14.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
              marginBottom: 28,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            Candidates for <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>promotion</span> and{' '}
            <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>succession</span> are assessed from records the
            system already holds. Two stages: a{' '}
            <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>qualification filter</span> that decides who is
            eligible at all, then a <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>weighted ranking</span>{' '}
            of everyone who clears it. No subjective rating is entered anywhere.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 36 }}>
            {steps.map((s) => (
              <div key={s.num} className="step-card" style={{ backgroundColor: s.bg, borderColor: s.border }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: s.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: s.color,
                    }}
                  >
                    {s.icon}
                  </div>
                  <div style={{ fontSize: 14, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    <span style={{ color: s.color, fontWeight: 700 }}>{s.label} </span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.title}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>{s.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid var(--neutral-200, #E2E8F0)', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
            <h3
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 20,
              }}
            >
              What the score is made of
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {howItWorks.map((item) => (
                <div key={item.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div className="num-badge">{item.n}</div>
                  <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{item.title}</strong> {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: `1px solid var(--border-subtle)`, borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
            <h3
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 20,
              }}
            >
              Before the engine can rank
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {prerequisites.map((item, i) => (
                <div
                  key={item.phase}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 0',
                    borderBottom: i < prerequisites.length - 1 ? `1px solid var(--border-subtle)` : 'none',
                  }}
                >
                  <div className="num-badge" style={{ background: 'var(--status-pending-light)' }}>
                    {item.phase}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="phase-badge">PHASE {item.phase}</span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                            color: 'var(--text-primary)',
                          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        }}
                      >
                        {item.title}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                          color: 'var(--text-secondary)',
                        marginTop: 3,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                      }}
                    >
                      {item.desc}
                    </div>
                  </div>
                  <div className="time-chip">{item.time}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--status-warning-light)', border: `1px solid var(--status-warning)`, borderRadius: 12, padding: '18px 22px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <WarningIcon />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--status-warning)',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                Before You Begin
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--status-warning)', lineHeight: 1.65, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
              The ranking is only as good as the records behind it. A candidate missing an IPCR, training hours or
              service dates is not penalised — those inputs are reported as not assessed — but their score is
              built on less evidence than the rest of the slate, and the detail panel says which inputs those were.
              All candidate data is confidential.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Was a button with no handler: it looked like the entry point to
                a workflow that does not exist. It now goes to the engine. */}
            <a className="start-btn" href="/admin/rsp/succession" style={{ textDecoration: 'none' }}>
              Open Succession Planning
              <ArrowRightIcon />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
