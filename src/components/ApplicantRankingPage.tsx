import { useEffect, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, ChevronRight, Printer, Trophy, UserCheck, Users } from 'lucide-react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { supabase } from '../lib/supabase';
import { getApplicants, saveApplicants } from '../lib/recruitmentData';

interface Applicant {
  id: string;
  full_name: string;
  email: string;
  position: string;
  office: string;
  status: string;
  total_score: number | null;
  application_type?: string | null;
}

interface PositionGroup {
  position: string;
  office: string;
  members: Applicant[];
  topScore: number | null;
  avgScore: number | null;
}

const fmtScore = (s: number | null) =>
  s !== null ? s.toFixed(2) : '—';

const medalStyle = (rank: number) => {
  if (rank === 1) return { bg: 'bg-yellow-400',  text: 'text-yellow-900' };
  if (rank === 2) return { bg: 'bg-slate-300',   text: 'text-slate-800'  };
  if (rank === 3) return { bg: 'bg-amber-500',   text: 'text-amber-900'  };
  return             { bg: 'bg-slate-100',   text: 'text-slate-600'  };
};

export const ApplicantRankingPage = () => {
  const [applicants, setApplicants]   = useState<Applicant[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null);
  const [activePosition, setActivePosition] = useState<string | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [hiring, setHiring]           = useState(false);
  const [toast, setToast]             = useState('');

  const mapRow = (r: any): Applicant => ({
    id:               String(r.id ?? ''),
    full_name:        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
                        || String(r.full_name ?? '—'),
    email:            String(r.email ?? ''),
    position:         String(r.position ?? ''),
    office:           String(r.office ?? ''),
    status:           String(r.status ?? ''),
    total_score:      r.total_score != null ? Number(r.total_score) : null,
    application_type: r.application_type ?? null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        // Primary: backend API (bypasses RLS, always returns full data)
        let rows: Applicant[] = [];
        try {
          const res = await fetch('/api/applicants/?skip=0&limit=5000');
          if (res.ok) {
            const data = await res.json();
            rows = (Array.isArray(data) ? data : []).map(mapRow);
          }
        } catch { /* fall through to Supabase */ }

        // Fallback: direct Supabase query
        if (rows.length === 0) {
          const { data } = await (supabase as any).from('applicants').select('*');
          rows = (data ?? []).map(mapRow);
        }

        setApplicants(rows);
      } catch {
        setApplicants([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, []);

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
      const sorted  = [...members].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1));
      const scores  = members.map(m => m.total_score).filter((s): s is number => s !== null);
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
      // Use title-case to match what the backend stores via status_label_map
      const newStatus = 'Recommended for Hiring';

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
    const deptLabel = activeDepartment ? `${activeDepartment} &mdash; ` : '';

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
        .center { text-align: center; }
        .footer { margin-top: 24px; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }
        @media print { body { padding: 16px; } }
      </style>`;

    win.document.body.innerHTML = `
      <h2>APPLICANT RANKING REPORT</h2>
      <p class="sub">${deptLabel}Office of the City Human Resource Management Officer, Iloilo City Government<br/>Printed: ${dateStr}</p>
      ${groupsForPrint.map(g => `
        <div class="pos-header">${g.position} &mdash; ${g.office} (${g.members.length} applicant${g.members.length !== 1 ? 's' : ''})</div>
        <table>
          <thead><tr><th>Rank</th><th>Applicant Name</th><th>Office</th><th>Type</th><th>Total Score</th><th>Status</th></tr></thead>
          <tbody>
            ${g.members.map((a, i) => `
              <tr>
                <td class="center" style="font-weight:700">${i + 1}</td>
                <td><strong>${a.full_name}</strong><br/><span style="font-size:8pt;color:#555">${a.email}</span></td>
                <td>${a.office || '&mdash;'}</td>
                <td>${(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}</td>
                <td class="center" style="font-weight:700">${fmtScore(a.total_score)}</td>
                <td>${a.status || 'Pending'}</td>
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
            {children}
          </main>
        </div>
      </div>
    </>
  );

  if (loading) return (
    <Shell>
      <div className="flex items-center justify-center p-12 text-slate-500">Loading ranking data…</div>
    </Shell>
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 no-print">
          {departmentGroups.map((d) => (
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
          {departmentGroups.length === 0 && (
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setActiveDepartment(null)}
              className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Departments
            </button>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white no-print">
          <table className="w-full min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
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
              {positionsInActiveDept.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Trophy className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                    <p className="font-medium">No positions found in this department.</p>
                  </td>
                </tr>
              )}
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
        {/* Toolbar */}
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setActivePosition(null); setSelected(new Set()); }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white no-print">
          <table className="w-full min-w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
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
                const medal    = medalStyle(rank);
                const isSelected = selected.has(a.id);
                const alreadyMarked = isMarked(a.status);
                const isHired = a.status.toLowerCase().includes('hired') && !a.status.toLowerCase().includes('recommended');
                return (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-100 last:border-0 transition-colors ${isSelected ? 'bg-blue-50' : alreadyMarked ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
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
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medal.bg} ${medal.text}`}>
                        {rank}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-sm text-slate-900">{a.full_name}</p>
                      <p className="text-xs text-slate-400">{a.email}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{a.office || '—'}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'}`}>
                        {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`text-lg font-bold ${a.total_score !== null ? 'text-slate-900' : 'text-slate-300'}`}>
                        {fmtScore(a.total_score)}
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
