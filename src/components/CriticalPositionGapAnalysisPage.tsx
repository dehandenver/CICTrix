import { useEffect, useMemo, useState } from 'react';
import { Search, Briefcase, User, CheckCircle2, XCircle, Info, Sparkles, GraduationCap } from 'lucide-react';
import { getDepartmentById } from '../lib/api/departments';
import {
  listCriticalPositions,
  listEmployeeOptions,
  type CriticalPosition,
  type EmployeeOption,
} from '../lib/api/succession';
import {
  getEmployeeQualificationProfile,
  getPositionRequirements,
  compareQualifications,
  getQualificationSummaries,
  type EmployeeQualificationProfile,
  type GapAnalysisResult,
  type QualificationSummary,
} from '../lib/api/criticalPositionGapAnalysis';
import { IPCR_RATING_OPTIONS } from './CriticalPositionPage';

interface CriticalPositionGapAnalysisPageProps {
  officeId: string;
  officeName: string;
}

const statusTone = (satisfied: boolean | null) => {
  if (satisfied === true) return 'bg-green-50 text-green-700 border-green-200';
  if (satisfied === false) return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const statusLabel = (satisfied: boolean | null) => (satisfied === true ? 'Met' : satisfied === false ? 'Gap' : 'Informational');

const statusIcon = (satisfied: boolean | null) => {
  if (satisfied === true) return <CheckCircle2 size={13} />;
  if (satisfied === false) return <XCircle size={13} />;
  return <Info size={13} />;
};

const emptyFilters = { department: '', education: '', eligibility: '', minExperience: '', ipcrRating: '' };

export const CriticalPositionGapAnalysisPage = ({ officeId, officeName }: CriticalPositionGapAnalysisPageProps) => {
  const [departmentName, setDepartmentName] = useState<string>(officeName);
  const [positions, setPositions] = useState<CriticalPosition[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [summaries, setSummaries] = useState<Map<string, QualificationSummary>>(new Map());
  const [loading, setLoading] = useState(true);

  const [positionSearch, setPositionSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [profile, setProfile] = useState<EmployeeQualificationProfile | null>(null);
  const [comparison, setComparison] = useState<GapAnalysisResult | null>(null);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    if (!officeId) return;
    (async () => {
      const deptRes = await getDepartmentById(officeId);
      const name = deptRes.success ? deptRes.data.name : officeName;
      setDepartmentName(name);
      const [posRes, emps] = await Promise.all([listCriticalPositions(officeId), listEmployeeOptions()]);
      if (posRes.ok) setPositions(posRes.data);
      setEmployees(emps);
      setSummaries(await getQualificationSummaries(emps.map((e) => e.id)));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  const departmentOptions = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter((d): d is string => !!d))].sort((a, b) => a.localeCompare(b)),
    [employees],
  );

  const filteredPositions = useMemo(() => {
    const q = positionSearch.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((p) => p.title.toLowerCase().includes(q));
  }, [positions, positionSearch]);

  const filteredEmployees = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    const norm = (s: string | null) => (s ?? '').trim().toLowerCase();
    const minExperience = filters.minExperience ? Number(filters.minExperience) : null;
    return employees
      .filter((e) => !q || norm(e.fullName).includes(q) || norm(e.position).includes(q) || norm(e.department).includes(q))
      .filter((e) => !filters.department || norm(e.department) === norm(filters.department))
      .filter((e) => {
        const s = summaries.get(e.id);
        if (filters.education && norm(s?.educationAttainment ?? null) !== norm(filters.education)) return false;
        if (filters.eligibility && !norm(s?.eligibility ?? null).includes(norm(filters.eligibility))) return false;
        if (minExperience != null && (s?.yearsOfExperience ?? 0) < minExperience) return false;
        if (filters.ipcrRating && s?.adjectival !== filters.ipcrRating) return false;
        return true;
      })
      .sort((a, b) => {
        const aSame = norm(a.department) === norm(departmentName) ? 0 : 1;
        const bSame = norm(b.department) === norm(departmentName) ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return a.fullName.localeCompare(b.fullName);
      })
      .slice(0, 60);
  }, [employees, employeeSearch, departmentName, filters, summaries]);

  const educationOptions = useMemo(
    () => [...new Set([...summaries.values()].map((s) => s.educationAttainment).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)),
    [summaries],
  );

  const selectedPosition = positions.find((p) => p.id === selectedPositionId) ?? null;

  useEffect(() => {
    if (!selectedPositionId || !selectedEmployeeId || !selectedPosition) {
      setProfile(null);
      setComparison(null);
      return;
    }
    let cancelled = false;
    setLoadingComparison(true);
    (async () => {
      const [reqs, prof] = await Promise.all([
        getPositionRequirements(selectedPositionId, selectedPosition),
        getEmployeeQualificationProfile(selectedEmployeeId),
      ]);
      if (cancelled) return;
      setProfile(prof);
      setComparison(prof ? compareQualifications(prof, reqs) : null);
      setLoadingComparison(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPositionId, selectedEmployeeId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="!mb-1 text-2xl font-bold text-[var(--text-primary)]">Qualification Gap Analysis</h1>
        <p className="!mb-0 text-sm text-[var(--text-secondary)]">
          Compare an employee's on-file qualifications against a critical position's requirements to identify
          strengths and gaps before considering them for succession.
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
        <h3 className="!mb-2 text-sm font-semibold text-[var(--text-primary)]">Filters</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} className="ga-input bg-white">
            <option value="">All departments</option>
            {departmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filters.education} onChange={(e) => setFilters((f) => ({ ...f, education: e.target.value }))} className="ga-input bg-white">
            <option value="">Any education</option>
            {educationOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input
            type="text"
            value={filters.eligibility}
            onChange={(e) => setFilters((f) => ({ ...f, eligibility: e.target.value }))}
            placeholder="Eligibility contains…"
            className="ga-input"
          />
          <input
            type="number"
            min={0}
            value={filters.minExperience}
            onChange={(e) => setFilters((f) => ({ ...f, minExperience: e.target.value }))}
            placeholder="Min. years experience"
            className="ga-input"
          />
          <select value={filters.ipcrRating} onChange={(e) => setFilters((f) => ({ ...f, ipcrRating: e.target.value }))} className="ga-input bg-white">
            <option value="">Any IPCR rating</option>
            {IPCR_RATING_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {(filters.department || filters.education || filters.eligibility || filters.minExperience || filters.ipcrRating) && (
          <button onClick={() => setFilters(emptyFilters)} className="mt-2 text-xs font-medium text-indigo-600 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Critical position panel */}
        <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
          <h3 className="!mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <Briefcase size={15} /> Critical Position
          </h3>
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={positionSearch}
              onChange={(e) => setPositionSearch(e.target.value)}
              placeholder={`Search critical positions in ${departmentName}`}
              className="ga-input !pl-9"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border-color)]">
            {loading && <p className="px-3 py-4 text-center text-sm text-[var(--text-secondary)]">Loading…</p>}
            {!loading && filteredPositions.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-secondary)]">No critical positions found.</p>
            )}
            {filteredPositions.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPositionId(p.id)}
                className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${
                  selectedPositionId === p.id ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{p.title}</span>
                  <span className="block truncate text-xs text-[var(--text-secondary)]">
                    {p.incumbentName ? `Incumbent: ${p.incumbentName}` : 'Vacant'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Employee panel */}
        <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
          <h3 className="!mb-2 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
            <User size={15} /> Employee
          </h3>
          <div className="relative mb-2">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={`Search — ${departmentName} shown first, or search anyone`}
              className="ga-input !pl-9"
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border-color)]">
            {filteredEmployees.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-[var(--text-secondary)]">No matching employees.</p>
            )}
            {filteredEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedEmployeeId(e.id)}
                className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${
                  selectedEmployeeId === e.id ? 'bg-indigo-50' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{e.fullName}</span>
                  <span className="block truncate text-xs text-[var(--text-secondary)]">
                    {e.position ?? '—'}{e.department ? ` · ${e.department}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {!selectedPosition || !selectedEmployeeId ? (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-white px-5 py-10 text-center">
          <p className="!mb-1 text-sm font-medium text-[var(--text-primary)]">Select a critical position and an employee</p>
          <p className="!mb-0 text-sm text-[var(--text-secondary)]">The comparison will be generated automatically once both are picked.</p>
        </div>
      ) : loadingComparison ? (
        <div className="rounded-xl border border-[var(--border-color)] bg-white px-5 py-10 text-center text-sm text-[var(--text-secondary)]">
          Comparing qualifications…
        </div>
      ) : profile && comparison ? (
        <div className="space-y-5">
          {/* Employee profile summary */}
          <div className="rounded-xl border border-[var(--border-color)] bg-white p-4">
            <h3 className="!mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <GraduationCap size={15} /> {profile.fullName} — Profile
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><span className="text-[var(--text-secondary)]">Current position</span><p className="!mb-0 font-medium">{profile.currentPosition ?? '—'}</p></div>
              <div><span className="text-[var(--text-secondary)]">Department</span><p className="!mb-0 font-medium">{profile.department ?? '—'}</p></div>
              <div><span className="text-[var(--text-secondary)]">Education</span><p className="!mb-0 font-medium">{profile.educationAttainment ?? 'Not on record'}</p></div>
              <div><span className="text-[var(--text-secondary)]">Eligibility</span><p className="!mb-0 font-medium">{profile.eligibility ?? 'Not on record'}</p></div>
              <div><span className="text-[var(--text-secondary)]">Experience</span><p className="!mb-0 font-medium">{profile.yearsOfExperience} year(s)</p></div>
              <div><span className="text-[var(--text-secondary)]">Latest IPCR</span><p className="!mb-0 font-medium">{profile.adjectival ? `${profile.adjectival} (${profile.overallScore?.toFixed(2)})` : 'Not yet rated'}</p></div>
            </div>
          </div>

          {/* Comparison table */}
          <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-color)] bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                  <th className="px-4 py-2.5">Requirement</th>
                  <th className="px-4 py-2.5">Position Requirement</th>
                  <th className="px-4 py-2.5">Employee Qualification</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-[var(--text-secondary)]">This position has no qualification requirements configured yet.</td></tr>
                )}
                {comparison.rows.map((r, i) => (
                  <tr key={`${r.kind}-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{r.label}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{r.requirement}</td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{r.employeeHas}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(r.satisfied)}`}>
                        {statusIcon(r.satisfied)} {statusLabel(r.satisfied)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gap summary */}
          {comparison.gaps.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <h3 className="!mb-2 text-sm font-semibold text-red-700">Qualification Gaps</h3>
              <ul className="!mb-0 list-disc space-y-1 pl-5 text-sm text-red-800">
                {comparison.gaps.map((g, i) => (
                  <li key={i}>
                    <span className="font-medium">{g.label}:</span> requires {g.requirement}, has {g.employeeHas}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {comparison.recommendations.length > 0 && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <h3 className="!mb-2 flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                <Sparkles size={15} /> Development Recommendations
              </h3>
              <ul className="!mb-0 list-disc space-y-1 pl-5 text-sm text-indigo-900">
                {comparison.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {comparison.gaps.length === 0 && comparison.rows.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50/50 px-4 py-3 text-sm font-medium text-green-700">
              This employee meets all configured qualification requirements for this position.
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] bg-white px-5 py-10 text-center text-sm text-[var(--text-secondary)]">
          Could not load this employee's profile.
        </div>
      )}

      <style>{`
        .ga-input {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid var(--border-color, #d1d5db);
          padding: 0.55rem 0.75rem;
          font-size: 0.9rem;
          outline: none;
        }
        .ga-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
      `}</style>
    </div>
  );
};
