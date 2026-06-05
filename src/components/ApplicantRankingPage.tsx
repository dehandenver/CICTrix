import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Printer, Trophy, UserCheck, Users } from 'lucide-react';
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

const fmtScore = (s: number | null) =>
  s !== null && s !== undefined ? s.toFixed(2) : '—';

const medalColor = (rank: number) => {
  if (rank === 1) return { bg: 'bg-yellow-400', text: 'text-yellow-900', label: '1st' };
  if (rank === 2) return { bg: 'bg-slate-300', text: 'text-slate-800', label: '2nd' };
  if (rank === 3) return { bg: 'bg-amber-500', text: 'text-amber-900', label: '3rd' };
  return { bg: 'bg-slate-100', text: 'text-slate-700', label: `${rank}th` };
};

export const ApplicantRankingPage = () => {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hiring, setHiring] = useState(false);
  const [toast, setToast] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await (supabase as any).from('applicants').select('*');
        const rows: Applicant[] = (data ?? []).map((r: any) => ({
          id: String(r.id ?? ''),
          full_name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ') || r.full_name || '—',
          email: String(r.email ?? ''),
          position: String(r.position ?? ''),
          office: String(r.office ?? ''),
          status: String(r.status ?? ''),
          total_score: r.total_score != null ? Number(r.total_score) : null,
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

  // Group by position, sort by score desc
  const groups = Object.entries(
    applicants.reduce<Record<string, Applicant[]>>((acc, a) => {
      const pos = a.position || 'Unassigned';
      if (!acc[pos]) acc[pos] = [];
      acc[pos].push(a);
      return acc;
    }, {})
  )
    .map(([position, members]) => ({
      position,
      members: [...members].sort((a, b) => (b.total_score ?? -1) - (a.total_score ?? -1)),
    }))
    .sort((a, b) => a.position.localeCompare(b.position));

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleHire = async () => {
    if (selected.size === 0) return;
    setHiring(true);
    try {
      const toHire = applicants.filter((a) => selected.has(a.id));
      for (const a of toHire) {
        try {
          await hireApplicant(a.id);
        } catch {
          // fallback: update status in supabase directly
          await (supabase as any)
            .from('applicants')
            .update({ status: 'Hired' })
            .eq('id', a.id);
        }
      }
      setSelected(new Set());
      setToast(`${toHire.length} applicant(s) marked as Hired.`);
      window.dispatchEvent(new Event('cictrix:applicants-updated'));
    } finally {
      setHiring(false);
      setTimeout(() => setToast(''), 3500);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />
            <div className="flex items-center justify-center p-12 text-slate-500">Loading ranking data…</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Print styles injected inline ─────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ranking-print-area, #ranking-print-area * { visibility: visible; }
          #ranking-print-area {
            position: absolute; inset: 0;
            padding: 24px;
            font-family: Arial, sans-serif;
            color: #000;
            background: #fff;
          }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #000; padding: 6px 10px; font-size: 11pt; }
          th { background: #e0e0e0; font-weight: 700; text-align: left; }
          .rank-badge { display: inline-block; border: 1px solid #000; padding: 1px 6px; border-radius: 3px; }
          .section-heading { font-size: 13pt; font-weight: 700; margin: 16px 0 6px; border-bottom: 2px solid #000; padding-bottom: 4px; }
          .print-title { font-size: 16pt; font-weight: 700; text-align: center; margin-bottom: 4px; }
          .print-subtitle { font-size: 10pt; text-align: center; color: #444; margin-bottom: 16px; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="min-h-screen bg-[#f8f9fa]">
        <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
        <div className="admin-layout">
          <Sidebar activeModule="RSP" userRole="rsp" />
          <main className="admin-content bg-slate-50 !p-0">
            <ApplicantsTabBar />

            <div className="p-6" ref={printRef}>
              {/* ── Toolbar ─────────────────────────────────────────── */}
              <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Applicant Ranking</h1>
                  <p className="text-sm text-slate-500">Applicants ranked highest to lowest score per position</p>
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
                      {hiring ? 'Hiring…' : `Hire Selected (${selected.size})`}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Printer className="h-4 w-4" /> Print Ranking
                  </button>
                </div>
              </div>

              {/* ── Print header (hidden on screen) ─────────────────── */}
              <div id="ranking-print-area">
                <div className="print-only print-title">APPLICANT RANKING REPORT</div>
                <div className="print-only print-subtitle">
                  Office of the City Human Resource Management Officer — ABYAN HRIS
                  <br />Printed: {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>

                {groups.length === 0 && (
                  <div className="no-print flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
                    <Trophy className="mb-3 h-12 w-12 text-slate-300" />
                    <p className="font-semibold text-slate-500">No applicant data available yet.</p>
                    <p className="mt-1 text-sm text-slate-400">Scores appear once evaluations are completed.</p>
                  </div>
                )}

                {groups.map(({ position, members }) => (
                  <div key={position} className="mb-8">
                    {/* Section heading */}
                    <div className="no-print mb-3 flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-amber-500" />
                      <h2 className="text-lg font-bold text-slate-800">{position}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                        {members.length} applicant{members.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="print-only section-heading">{position}</div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white no-print">
                      <table className="w-full min-w-full">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="w-10 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                              <Users className="mx-auto h-4 w-4" />
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
                          {members.map((a, idx) => {
                            const rank = idx + 1;
                            const medal = medalColor(rank);
                            const isSelected = selected.has(a.id);
                            const isHired = a.status?.toLowerCase().includes('hired');
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
                                    className="h-4 w-4 rounded border-slate-300 accent-[#363EE8]"
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
                                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${(a.application_type ?? '').toLowerCase().includes('promot') ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {(a.application_type ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original'}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  <span className={`text-lg font-bold ${a.total_score !== null ? 'text-slate-900' : 'text-slate-400'}`}>
                                    {fmtScore(a.total_score)}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5 text-center">
                                  {isHired ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3" /> Hired
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                                      {a.status || 'Pending'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Print-only table (plain B&W) */}
                    <table className="print-only">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Applicant Name</th>
                          <th>Office</th>
                          <th>Type</th>
                          <th>Total Score</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((a, idx) => (
                          <tr key={a.id}>
                            <td style={{ textAlign: 'center' }}><span className="rank-badge">{idx + 1}</span></td>
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
                ))}
              </div>{/* /ranking-print-area */}
            </div>{/* /p-6 */}
          </main>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
};
