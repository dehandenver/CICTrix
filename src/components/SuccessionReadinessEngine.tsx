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

const tabs = [
  { id: 'overview', label: 'Overview', icon: <GridIcon /> },
  { id: 'position', label: 'Position DNA', icon: <LockIcon /> },
  { id: 'candidate', label: 'Candidate Matrix', icon: <BranchIcon /> },
  { id: 'system', label: 'System Intelligence', icon: <CircleIcon /> },
  { id: 'scoring', label: 'Final Scoring', icon: <ChevronIcon /> },
];

const steps = [
  {
    num: 1,
    label: 'Step 1:',
    title: 'Position DNA',
    desc: 'Define hard skills, decision authority, and critical workflows required for the vacant role.',
    bg: '#fffbeb',
    border: '#fde68a',
    color: '#d97706',
    iconBg: '#fef3c7',
    icon: <LockIcon />,
  },
  {
    num: 2,
    label: 'Step 2:',
    title: 'Candidate Matrix',
    desc: 'Score 2-3 candidates across Technical, Business Logic, Leadership, and Strategic dimensions.',
    bg: '#f0f0ff',
    border: '#c7d2fe',
    color: '#4f46e5',
    iconBg: '#e0e7ff',
    icon: <BranchIcon />,
  },
  {
    num: 3,
    label: 'Step 3:',
    title: 'System Intelligence',
    desc: 'Analyze candidates using C4.5 Decision Tree and 9-Box Talent Matrix classification methodology.',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    color: '#16a34a',
    iconBg: '#dcfce7',
    icon: <CircleIcon />,
  },
  {
    num: 4,
    label: 'Step 4:',
    title: 'Final Scoring',
    desc: 'Combines Education, Experience, Performance, and Potential to generate Gap Reports.',
    bg: '#fff1f2',
    border: '#fecdd3',
    color: '#e11d48',
    iconBg: '#ffe4e6',
    icon: <ChevronIcon />,
  },
];

const howItWorks = [
  {
    n: 1,
    title: 'Objective Scoring:',
    text: 'Each candidate is measured against defined competency benchmarks - not subjective impressions.',
  },
  {
    n: 2,
    title: 'Weighted Dimensions:',
    text: 'Education (20%), Experience (20%), Performance Rating (30%), and Potential/RQ (30%) are combined into a composite score.',
  },
  {
    n: 3,
    title: 'Data Analysis:',
    text: 'The System Intelligence module uses C4.5 Decision Tree logic and 9-Box Talent Matrix to identify readiness tier and development gaps.',
  },
  {
    n: 4,
    title: 'Audit-Ready Output:',
    text: 'Final Scoring generates a ranked succession slate with supporting evidence for every recommendation.',
  },
];

const timeline = [
  { phase: 1, title: 'Position Setup', desc: 'Configure Position DNA and scoring weights.', time: '1-2 days' },
  { phase: 2, title: 'Candidate Enrollment', desc: 'Nominate and profile all candidates.', time: '2-3 days' },
  { phase: 3, title: 'Assessment & Analysis', desc: 'Conduct scoring; system generates intelligence reports.', time: '3-5 days' },
  { phase: 4, title: 'Final Scoring & Decision', desc: 'Review ranked slate and approve succession decision.', time: '1-2 days' },
];

export default function SuccessionReadinessEngine() {
  return (
    <div
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: '#f3f4f6',
        minHeight: '100vh',
        padding: '24px 16px',
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .tab-btn { background: none; border: none; display: flex; align-items: center; gap: 6px; padding: 12px 4px; font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #6b7280; border-bottom: 2px solid transparent; transition: color 0.2s, border-color 0.2s; white-space: nowrap; }
        .tab-btn.active { color: #4f46e5; border-bottom-color: #4f46e5; font-weight: 600; cursor: default; }
        .tab-btn.disabled { cursor: not-allowed; opacity: 0.45; pointer-events: none; }
        .step-card { border-radius: 12px; padding: 20px; border: 1px solid; transition: transform 0.15s, box-shadow 0.15s; }
        .step-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .start-btn { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; transition: opacity 0.2s, transform 0.15s; }
        .start-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .num-badge { width: 28px; height: 28px; border-radius: 50%; background: #e8e9ff; color: #4f46e5; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .phase-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #9ca3af; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .time-chip { font-size: 12px; color: #6366f1; background: #ede9fe; padding: 3px 10px; border-radius: 20px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 4px 32px rgba(0,0,0,0.07)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '28px 32px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
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
                  color: '#111827',
                  letterSpacing: '-0.01em',
                }}
              >
                Succession Readiness Engine
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#9ca3af',
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
                color: '#111827',
              }}
            >
              Evaluation Process
            </h2>
          </div>

          <p
            style={{
              fontSize: 14.5,
              color: '#4b5563',
              lineHeight: 1.7,
              marginBottom: 28,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            This evaluation system uses objective criteria to assess candidates for <span style={{ color: '#4f46e5', fontWeight: 500 }}>promotion</span> and{' '}
            <span style={{ color: '#4f46e5', fontWeight: 500 }}>succession planning</span>. The process includes position definition, candidate scoring, data-driven{' '}
            <span style={{ color: '#4f46e5', fontWeight: 500 }}>analysis</span>, and final <span style={{ color: '#4f46e5', fontWeight: 500 }}>scoring</span>.
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
                    <span style={{ color: '#111827', fontWeight: 600 }}>{s.title}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.6, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>{s.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
            <h3
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 20,
              }}
            >
              How the Evaluation Works
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {howItWorks.map((item) => (
                <div key={item.n} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div className="num-badge">{item.n}</div>
                  <p style={{ fontSize: 13.5, color: '#374151', lineHeight: 1.65, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
                    <strong style={{ color: '#111827' }}>{item.title}</strong> {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px 28px', marginBottom: 20 }}>
            <h3
              style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                fontSize: 18,
                fontWeight: 700,
                color: '#111827',
                marginBottom: 20,
              }}
            >
              Evaluation Timeline
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {timeline.map((item, i) => (
                <div
                  key={item.phase}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 0',
                    borderBottom: i < timeline.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <div className="num-badge" style={{ background: '#e8e9ff' }}>
                    {item.phase}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="phase-badge">PHASE {item.phase}</span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: '#111827',
                          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                        }}
                      >
                        {item.title}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: '#9ca3af',
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

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '18px 22px', marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <WarningIcon />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#92400e',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                }}
              >
                Before You Begin
              </span>
            </div>
            <p style={{ fontSize: 13.5, color: '#b45309', lineHeight: 1.65, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
              Ensure you have organizational approval and HR data access before launching the evaluation. All candidate data is strictly confidential. Evaluators must complete all four
              stages for a valid succession recommendation.
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="start-btn">
              Start Evaluation
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
