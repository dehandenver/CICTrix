import { useBackClosesView } from '../hooks/useHistoryBack';
import { useEffect, useState } from 'react';
import { Building2, CheckCircle2, ChevronRight, Printer, Trophy, UserCheck, Users } from 'lucide-react';
import { AdminHeader } from './AdminHeader';
import { BackButton } from './BackButton';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { ErrorBanner } from './ErrorBanner';
import { Sidebar } from './Sidebar';
import { supabase } from '../lib/supabase';
import { getApplicants, saveApplicants } from '../lib/recruitmentData';
import { fetchApplicantScoreSummaries, isUuid } from '../lib/api/applicantScores';
import { LoadingStatus, Skeleton, useDelayedLoading } from './table-loading';
import { TableStateRows, TopScorerBadge, topScorerIds, topScorerRowClass } from './data-table';

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  position: string;
  office: string;
  status: string;
  /** Legacy stored total, kept only for original applicants without a summary. */
  total_score: number | null;
  applicationType: 'original' | 'promotional';
  /** Durable saved assessment total; null when the required categories are incomplete. */
  assessmentTotal: number | null;
}

interface PositionGroup {
  position: string;
  office: string;
  members: Applicant[];
  topScore: number | null;
  avgScore: number | null;
}

/** Placeholder department cards while the ranking data loads. */
const DEPARTMENT_PLACEHOLDERS = 6;

/** Applicant fields come from the public form, so they are escaped before going into the print window's HTML. */
const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const fmtScore = (s: number | null) =>
  s !== null ? s.toFixed(2) : '—';

/** Rank chip; the top scorer is marked by the row highlight, not the chip colour. */
const RANK_CHIP = 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-xs font-bold text-[var(--color-primary-700)]';

export const ApplicantRankingPage = () => {
  const [applicants, setApplicants]   = useState<Applicant[]>([]);
  const [loading, setLoading]         = useState(true);
  const showLoader = useDelayedLoading(loading);
  const pending = loading || showLoader;
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null);
  const [activePosition, setActivePosition] = useState<string | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  useBackClosesView(activeDepartment !== null, () => { setActivePosition(null); setActiveDepartment(null); }, 'ranking-department');
  useBackClosesView(activeDepartment !== null && activePosition !== null, () => { setActivePosition(null); setSelected(new Set()); }, 'ranking-position');
  const [hiring, setHiring]           = useState(false);
  const [toast, setToast]             = useState('');

  const [loadError, setLoadError] = useState<unknown>(null);

  const mapRow = (r: any): Applicant => ({
    id:               String(r.id ?? ''),
    full_name:        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
                        || String(r.full_name ?? '—'),
    email:            String(r.email ?? ''),
    position:         String(r.position ?? ''),
    office:           String(r.office ?? ''),
    status:           String(r.status ?? ''),
    total_score:      r.total_score != null ? Number(r.total_score) : null,
    applicationType:  String(r.application_type ?? '').toLowerCase().includes('promot') ? 'promotional' : 'original',
    assessmentTotal:  null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        // Primary: direct Supabase query
        let rows: Applicant[] = [];
        const { data, error } = await (supabase as any).from('applicants').select('*');
        if (error) throw error;
        rows = (data ?? []).map(mapRow);

        const summaryRes = await fetchApplicantScoreSummaries(
          rows.map((row) => row.id).filter(isUuid),
        );
        const summaries = summaryRes.data;

        setApplicants(rows.map((row) => {
          const summary = summaries.get(row.id);
          const applicationType = row.applicationType === 'promotional' || summary?.appointmentType === 'promotional'
            ? 'promotional'
            : 'original';
          return {
            ...row,
            applicationType,
            // A mismatched score row is not evidence for this application's
            // track; never use an original three-category total for a promotion.
            assessmentTotal: summary?.appointmentType === applicationType
              ? summary.assessmentTotal
              : null,
          };
        }));

        setLoadError(summaryRes.ok
          ? null
          : summaryRes.error ?? new Error('Failed to load saved assessment scores'));
      } catch (error) {
        setApplicants([]);
        setLoadError(error);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, []);

  /**
   * The saved assessment total is authoritative. A promotion never falls back
   * to the legacy `applicants.total_score`; an original may, for old rows whose
   * durable summary predates the score table.
   */
  const scoreOf = (a: Applicant): number | null =>
    a.applicationType === 'promotional'
      ? a.assessmentTotal
      : a.assessmentTotal ?? a.total_score;

  // Build position groups sorted by position name
  const groups: PositionGroup[] = Object.entries(
    applicants.reduce<Record<string, Applicant[]>>((acc, a) => {
      const pos = a.position || 'Unassigned';
      if (!acc[pos]) acc[pos] = [];
      acc[pos].push(a);
      return acc;
    }, {})
  )
    .map(([position, members]) => {
      const sorted  = [...members].sort((a, b) => (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1));
      const scores  = members.map(scoreOf).filter((s): s is number => s !== null);
      const office  = members.find(m => m.office)?.office ?? '—';
      return {
        position,
        office,
        members: sorted,
        topScore: scores.length ? Math.max(...scores) : null,
        avgScore: scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null,
      };
    })
    .sort((a, b) => a.position.localeCompare(b.position));

  const activeGroup = groups.find(g => g.position === activePosition) ?? null;

  // Highest total score per position, across every applicant for it (Task 5).
  const topIds = topScorerIds(applicants, {
    idOf: (a) => a.id,
    scoreOf,
    groupOf: (a) => a.position || 'Unassigned',
  });

  // Group positions by their office/department so the landing view is a
  // folder of departments and clicking one reveals the positions inside.
  const departmentGroups = Object.entries(
    groups.reduce<Record<string, PositionGroup[]>>((acc, g) => {
      const dept = g.office || 'Unassigned';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(g);
      return acc;
    }, {})
  )
    .map(([office, positions]) => ({
      office,
      positions,
      totalApplicants: positions.reduce((sum, p) => sum + p.members.length, 0),
    }))
    .sort((a, b) => a.office.localeCompare(b.office));

  const positionsInActiveDept = activeDepartment
    ? groups.filter(g => (g.office || 'Unassigned') === activeDepartment)
    : [];

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const isMarked = (status: string) => {
    const s = status.toLowerCase();
    return s.includes('hired') || s.includes('recommended for hiring');
  };

  const selectAll = () => {
    if (!activeGroup) return;
    const all = new Set(activeGroup.members.filter(a => !isMarked(a.status)).map(a => a.id));
    setSelected(all);
  };

  const handleMarkForHiring = async () => {
    if (selected.size === 0) return;
    setHiring(true);
    try {
      const toMark = applicants.filter(a => selected.has(a.id));
      // Reached only after ranking, i.e. the interview and exam are done and
      // scored. That is the complete selection process, so it stores Qualified.
      // It shared 'Recommended for Hiring' with the document-screening action
      // until the two stages were separated.
      const newStatus = 'Qualified';

      // Get auth token once before the loop
      let token: string | undefined;
      try {
        const { data: { session } } = await (supabase as any).auth.getSession();
        token = session?.access_token;
      } catch { /* no token */ }

      for (const a of toMark) {
        // Always run direct Supabase update — most reliable path when the user
        // is authenticated via the Supabase client (bypasses backend auth).
        try {
          await (supabase as any)
            .from('applicants')
            .update({ status: newStatus })
            .eq('id', a.id);
        } catch { /* continue to backend attempt */ }

        // Also attempt the backend API for redundancy (uses service-level Supabase).
        try {
          await fetch(`/api/applicants/${a.id}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ applicant_id: a.id, status: 'qualified' }),
          });
        } catch { /* continue */ }

        // Keep localStorage in sync as a local cache for offline resilience.
        const localApplicants = getApplicants();
        const existsLocally = localApplicants.some(la => la.id === a.id);
        if (existsLocally) {
          saveApplicants(localApplicants.map(la =>
            la.id === a.id ? { ...la, status: newStatus as any } : la
          ));
        } else {
          const nameParts = (a.full_name || '').trim().split(/\s+/);
          const synced: any = {
            id: a.id,
            jobPostingId: 'supabase-sync',
            personalInfo: {
              firstName: nameParts[0] || '',
              lastName: nameParts.slice(1).join(' ') || '',
              email: a.email,
              phone: '', address: '', dateOfBirth: '',
            },
            position: a.position,
            department: a.office,
            office: a.office,
            qualificationScore: a.total_score ?? 0,
            status: newStatus,
            education: [], experience: [], skills: [],
            certifications: [], documents: [],
            applicationDate: new Date().toISOString(),
          };
          saveApplicants([...localApplicants, synced]);
        }
      }

      // Reflect new status in local UI state immediately
      setApplicants(prev =>
        prev.map(a => selected.has(a.id) ? { ...a, status: newStatus } : a)
      );
      setSelected(new Set());
      setToast(`${toMark.length} applicant(s) marked for hiring.`);
      window.dispatchEvent(new Event('cictrix:applicants-updated'));
      setTimeout(() => setToast(''), 3500);
    } finally {
      setHiring(false);
    }
  };

  const handlePrint = (group?: PositionGroup | null) => {
    const printGroup = group ?? activeGroup;
    const win = window.open('', '_blank', 'width=800,height=650');
    if (!win) return;

    const groupsForPrint = printGroup ? [printGroup] : groups;
    const dateStr = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    const deptLabel = activeDepartment ? `${escapeHtml(activeDepartment)} &mdash; ` : '';

    win.document.head.innerHTML = `
      <title>Applicant Ranking Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #000; background: #fff; }
        h2 { font-size: 16pt; font-weight: 700; text-align: center; margin: 0 0 2px; }
        .sub { font-size: 9pt; text-align: center; color: #444; margin-bottom: 20px; }
        .pos-header { font-size: 12pt; font-weight: 700; margin: 20px 0 4px; border-bottom: 2px solid #000; padding-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #ddd; font-size: 9pt; font-weight: 700; text-align: left; padding: 6px 8px; border: 1px solid #000; }
        td { font-size: 9pt; padding: 5px 8px; border: 1px solid #000; }
        tr.top td { background: #EEF0FF; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        tr.top td:first-child { box-shadow: inset 3px 0 0 #363EE8; }
        .top-badge { display: inline-block; margin-left: 6px; padding: 0 6px; border: 1px solid #363EE8; border-radius: 999px; font-size: 7.5pt; font-weight: 700; color: #191FA8; }
        .center { text-align: center; }
        .footer { margin-top: 24px; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }
        @media print { body { padding: 16px; } }
      </style>`;

    win.document.body.innerHTML = `
      <h2>APPLICANT RANKING REPORT</h2>
      <p class="sub">${deptLabel}Office of the City Human Resource Management Officer, Iloilo City Government<br/>Printed: ${dateStr}</p>
      ${groupsForPrint.map(g => `
        <div class="pos-header">${escapeHtml(g.position)} &mdash; ${escapeHtml(g.office)} (${g.members.length} applicant${g.members.length !== 1 ? 's' : ''})</div>
        <table>
          <thead><tr><th>Rank</th><th>Applicant Name</th><th>Office</th><th>Type</th><th>Total Score</th><th>Status</th></tr></thead>
          <tbody>
            ${g.members.map((a, i) => `
              <tr${topIds.has(a.id) ? ' class="top"' : ''}>
                <td class="center" style="font-weight:700">${i + 1}</td>
                <td><strong>${escapeHtml(a.full_name)}</strong>${topIds.has(a.id) ? '<span class="top-badge">&#9733; Top scorer</span>' : ''}<br/><span style="font-size:8pt;color:#555">${escapeHtml(a.email)}</span></td>
                <td>${a.office ? escapeHtml(a.office) : '&mdash;'}</td>
                <td>${a.applicationType === 'promotional' ? 'Promotional' : 'Original'}</td>
                <td class="center" style="font-weight:700">${fmtScore(scoreOf(a))}</td>
                <td>${escapeHtml(a.status || 'Pending')}</td>
              </tr>`).join('')}
          </tbody>
        </table>`).join('')}
      <div class="footer">Generated by ABYAN HRIS &mdash; Office of the City Human Resource Management Officer &mdash; Iloilo City Government</div>`;

    win.focus();
    win.print();
  };

  // ── Shared shell ─────────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <>
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />
            {loadError ? (
              <div className="px-6 pt-6">
                <ErrorBanner
                  error={loadError}
                  action="load the applicant ranking"
                  onRetry={() => window.dispatchEvent(new Event('cictrix:applicants-updated'))}
                />
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </>
  );

  // ── VIEW 0 — Department folder grid ─────────────────────────────────────────
  if (!activePosition && !activeDepartment) return (
    <Shell>
      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Applicant Ranking</h1>
            <p className="text-sm text-slate-500">Select a department to view the vacant positions inside it.</p>
          </div>
          <button
            type="button"
            onClick={() => handlePrint(null)}
            className="no-print inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer className="h-4 w-4" /> Print All Rankings
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 no-print" aria-busy={loading}>
          {showLoader && (
            <>
              <LoadingStatus label="Loading ranking data…" />
              {Array.from({ length: DEPARTMENT_PLACEHOLDERS }, (_, i) => (
                <div key={i} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5" aria-hidden="true">
                  <Skeleton className="shrink-0" style={{ width: 40, height: 40, borderRadius: 12 }} />
                  <div className="flex-1">
                    <Skeleton style={{ width: '70%', height: 14 }} />
                    <Skeleton style={{ width: '45%', height: 10, marginTop: 8 }} />
                  </div>
                </div>
              ))}
            </>
          )}
          {!pending && departmentGroups.map((d) => (
            <button
              key={d.office}
              type="button"
              onClick={() => setActiveDepartment(d.office)}
              className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-blue-300 hover:bg-blue-50/30"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-xl bg-blue-100 p-2.5 text-blue-700">
                  <Building2 size={20} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 leading-tight">{d.office}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {d.positions.length} {d.positions.length === 1 ? 'position' : 'positions'} · {d.totalApplicants} applicant{d.totalApplicants === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-blue-600" />
            </button>
          ))}
          {!pending && !loadError && departmentGroups.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-slate-400">
              <Trophy className="mx-auto mb-2 h-9 w-9 text-slate-300" />
              <p className="font-medium">No applicant data yet.</p>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );

  // ── VIEW 1 — Positions overview table (within a department) ─────────────────
  if (!activePosition) return (
    <Shell>
      <div className="p-6">
        <BackButton className="mb-3" onBack={() => setActiveDepartment(null)} />
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{activeDepartment}</h1>
              <p className="text-sm text-slate-500">Vacant positions in this department — click a row to view its ranking.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handlePrint(null)}
            className="no-print inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer className="h-4 w-4" /> Print All Rankings
          </button>
        </div>

        {/* Screen table */}
        <div className="abyan-table-wrap no-print">
          <table className="abyan-table">
            <thead>
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position Title</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total Applicants</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Top Score</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Avg Score</th>
                <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positionsInActiveDept.map(g => (
                <tr
                  key={g.position}
                  className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors last:border-0 cursor-pointer"
                  onClick={() => { setActivePosition(g.position); setSelected(new Set()); }}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="shrink-0 rounded-lg bg-amber-100 p-1.5 text-amber-600"><Trophy size={14} /></div>
                      <span className="font-semibold text-sm text-slate-900">{g.position}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{g.office}</td>
                  <td className="px-5 py-4 text-center">
                    <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-900">
                      <Users className="h-3.5 w-3.5 text-slate-400" /> {g.members.length}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center font-bold text-slate-900 text-sm">{fmtScore(g.topScore)}</td>
                  <td className="px-5 py-4 text-center text-sm text-slate-600">{fmtScore(g.avgScore)}</td>
                  <td className="px-5 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => { setActivePosition(g.position); setSelected(new Set()); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                    >
                      View Ranking <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              <TableStateRows
                view={positionsInActiveDept.length === 0 ? 'empty' : 'rows'}
                columns={6}
                emptyIcon={Trophy}
                emptyTitle="No positions found in this department"
                emptyMessage="Positions appear here once applicants apply for them. Go back to choose another department."
              />
            </tbody>
          </table>
        </div>

      </div>
    </Shell>
  );

  // ── VIEW 2 — Per-position ranking ─────────────────────────────────────────────
  return (
    <Shell>
      <div className="p-6">
        <BackButton className="no-print mb-3" onBack={() => { setActivePosition(null); setSelected(new Set()); }} />
        {/* Toolbar */}
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{activePosition}</h1>
              <p className="text-sm text-slate-500">{activeGroup?.office} · {activeGroup?.members.length} applicant{activeGroup?.members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={handleMarkForHiring}
                disabled={hiring}
                className="inline-flex items-center gap-2 rounded-xl bg-[#363EE8] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="h-4 w-4" />
                {hiring ? 'Processing…' : `Mark for Hiring (${selected.size})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => handlePrint(activeGroup)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        {/* Ranking table */}
        <div className="abyan-table-wrap no-print">
          <table className="abyan-table">
            <thead>
              <tr>
                <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-[#363EE8]"
                    checked={selected.size > 0 && activeGroup !== null && selected.size === activeGroup.members.filter(a => !isMarked(a.status)).length}
                    onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
                  />
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total Score</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {(activeGroup?.members ?? []).map((a, idx) => {
                const rank     = idx + 1;
                const isTop    = topIds.has(a.id);
                const isSelected = selected.has(a.id);
                const alreadyMarked = isMarked(a.status);
                const isHired = a.status.toLowerCase().includes('hired') && !a.status.toLowerCase().includes('recommended');
                return (
                  <tr
                    key={a.id}
                    className={[isSelected ? 'is-selected' : '', topScorerRowClass(isTop)].filter(Boolean).join(' ')}
                  >
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={alreadyMarked}
                        onChange={() => toggleSelect(a.id)}
                        className="h-4 w-4 rounded border-slate-300 accent-[#363EE8] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={RANK_CHIP}>
                        {rank}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="abyan-cell-primary flex flex-wrap items-center gap-2">{a.full_name}{isTop && <TopScorerBadge />}</span>
                      <span className="abyan-cell-secondary">{a.email}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{a.office || '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${a.applicationType === 'promotional' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                        {a.applicationType === 'promotional' ? 'Promotional' : 'Original'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-lg font-bold ${scoreOf(a) !== null ? 'text-slate-900' : 'text-slate-300'}`}>
                        {fmtScore(scoreOf(a))}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {isHired
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Hired</span>
                        : a.status.toLowerCase().includes('recommended for hiring')
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700"><CheckCircle2 className="h-3 w-3" /> For Hiring</span>
                          : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{a.status || 'Pending'}</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </Shell>
  );
};
