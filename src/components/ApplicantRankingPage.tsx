import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronRight, Printer, Trophy, UserCheck, Users } from 'lucide-react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { supabase } from '../lib/supabase';
import { hireApplicant } from '../lib/api/employeesApi';

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
  const [activePosition, setActivePosition] = useState<string | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [hiring, setHiring]           = useState(false);
  const [toast, setToast]             = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await (supabase as any).from('applicants').select('*');
        const rows: Applicant[] = (data ?? []).map((r: any) => ({
          id:               String(r.id ?? ''),
          full_name:        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || String(r.full_name ?? '—'),
          email:            String(r.email ?? ''),
          position:         String(r.position ?? ''),
          office:           String(r.office ?? ''),
          status:           String(r.status ?? ''),
          total_score:      r.total_score != null ? Number(r.total_score) : null,
          application_type: r.application_type ?? null,
        }));
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

  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectAll = () => {
    if (!activeGroup) return;
    const all = new Set(activeGroup.members.filter(a => !a.status.toLowerCase().includes('hired')).map(a => a.id));
    setSelected(all);
  };

  const handleHire = async () => {
    if (selected.size === 0) return;
    setHiring(true);
    try {
      const toHire = applicants.filter(a => selected.has(a.id));
      for (const a of toHire) {
        try { await hireApplicant(a.id); } catch {
          await (supabase as any).from('applicants').update({ status: 'Hired' }).eq('id', a.id);
        }
      }
      setSelected(new Set());
      setToast(`${toHire.length} applicant(s) marked as Hired.`);
      window.dispatchEvent(new Event('cictrix:applicants-updated'));
      setTimeout(() => setToast(''), 3500);
    } finally {
      setHiring(false);
    }
  };

  const handlePrint = () => window.print();

  // ── Shared shell ─────────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ranking-print-area, #ranking-print-area * { visibility: visible; }
          #ranking-print-area {
            position: absolute; inset: 0; padding: 28px;
            font-family: Arial, sans-serif; color: #000; background: #fff;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
          th, td { border: 1px solid #000; padding: 6px 10px; font-size: 11pt; }
          th { background: #ddd; font-weight: 700; text-align: left; }
          .print-title   { font-size: 16pt; font-weight: 700; text-align: center; margin-bottom: 2px; }
          .print-sub     { font-size: 10pt; text-align: center; color: #555; margin-bottom: 18px; }
          .print-pos-hdr { font-size: 13pt; font-weight: 700; margin: 14px 0 4px; border-bottom: 2px solid #000; padding-bottom: 3px; }
        }
        .print-only { display: none; }
      `}</style>
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

  // ── VIEW 1 — Positions overview table ────────────────────────────────────────
  if (!activePosition) return (
    <Shell>
      <div className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Applicant Ranking</h1>
            <p className="text-sm text-slate-500">Select a position to view its ranked applicant list</p>
          </div>
          <button
            type="button"
            onClick={handlePrint}
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
              {groups.map(g => (
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
              {groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Trophy className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                    <p className="font-medium">No applicant data yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Full print layout (all positions) */}
        <div id="ranking-print-area">
          <div className="print-only print-title">APPLICANT RANKING REPORT</div>
          <div className="print-only print-sub">
            Office of the City Human Resource Management Officer — ABYAN HRIS
            <br />Printed: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          {groups.map(g => (
            <div key={g.position} className="print-only">
              <div className="print-pos-hdr">{g.position} — {g.office} ({g.members.length} applicants)</div>
              <table>
                <thead><tr><th>Rank</th><th>Name</th><th>Type</th><th>Score</th><th>Status</th></tr></thead>
                <tbody>
                  {g.members.map((a, i) => (
                    <tr key={a.id}>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                      <td>{a.full_name}</td>
                      <td>{(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{fmtScore(a.total_score)}</td>
                      <td>{a.status || 'Pending'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
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
                onClick={handleHire}
                disabled={hiring}
                className="inline-flex items-center gap-2 rounded-xl bg-[#363EE8] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <UserCheck className="h-4 w-4" />
                {hiring ? 'Processing…' : `Hire Selected (${selected.size})`}
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
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
                    checked={selected.size > 0 && activeGroup !== null && selected.size === activeGroup.members.filter(a => !a.status.toLowerCase().includes('hired')).length}
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
                const isHired  = a.status.toLowerCase().includes('hired');
                return (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-100 last:border-0 transition-colors ${isSelected ? 'bg-blue-50' : isHired ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-3.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isHired}
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
                        : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{a.status || 'Pending'}</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Print layout for this position */}
        <div id="ranking-print-area">
          <div className="print-only print-title">APPLICANT RANKING — {activePosition}</div>
          <div className="print-only print-sub">
            {activeGroup?.office} · {activeGroup?.members.length} applicants<br />
            Office of the City Human Resource Management Officer — ABYAN HRIS<br />
            Printed: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
          <table className="print-only">
            <thead><tr><th>Rank</th><th>Applicant Name</th><th>Office</th><th>Type</th><th>Score</th><th>Status</th></tr></thead>
            <tbody>
              {(activeGroup?.members ?? []).map((a, i) => (
                <tr key={a.id}>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                  <td>{a.full_name}</td>
                  <td>{a.office || '—'}</td>
                  <td>{(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{fmtScore(a.total_score)}</td>
                  <td>{a.status || 'Pending'}</td>
                </tr>
              ))}
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
