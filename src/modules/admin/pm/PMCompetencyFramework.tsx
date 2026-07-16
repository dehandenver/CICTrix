import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Grid3x3, Loader2, RefreshCw } from 'lucide-react';

import {
  listAllRequirements,
  listCompetencyStandards,
  listPositions,
  listRequirementsForPosition,
  removeRequirement,
  saveRequirement,
  PROFICIENCY_CODE,
  PROFICIENCY_LEVELS,
  type CompetencyStandard,
  type PositionRequirement,
  type ProficiencyLevel,
} from '../../../lib/api/pmCompetency';
import { getCurrentAdminEmail } from '../moduleUi';

type Subtab = 'requirements' | 'map';

const SUBTABS: { key: Subtab; label: string; icon: React.ElementType }[] = [
  { key: 'requirements', label: 'Position Requirements', icon: BookOpen },
  { key: 'map', label: 'Competency Map', icon: Grid3x3 },
];

/**
 * Column headers for the Competency Map, keyed by competency_standards.id
 * (1..12). The grid needs a short header per column — the full names are far too
 * wide — and each cell's tooltip carries the full name + stream.
 */
const COMPETENCY_ABBREVIATIONS: Record<number, string> = {
  1: 'KLG',
  2: 'PAP',
  3: 'CES',
  4: 'PMP',
  5: 'FMB',
  6: 'TAP',
  7: 'DRR',
  8: 'DLG',
  9: 'ECS',
  10: 'TWG',
  11: 'DRM',
  12: 'PCS',
};

const STREAM_STYLE: Record<string, string> = {
  LEADERSHIP: 'bg-indigo-50 text-indigo-700',
  'EMPLOYEE DEVELOPMENT': 'bg-emerald-50 text-emerald-700',
  TECHNICAL: 'bg-sky-50 text-sky-700',
  'CULTURAL TRANSFORMATION': 'bg-amber-50 text-amber-700',
};

// ── Subtab 1: Position Requirements ──────────────────────────────────────────

const PositionRequirementsPanel = ({
  standards,
  positions,
  onSaved,
}: {
  standards: CompetencyStandard[];
  positions: string[];
  onSaved: () => void;
}) => {
  const [position, setPosition] = useState('');
  const [requirements, setRequirements] = useState<PositionRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Per-row working state, so an unsaved level change never looks saved.
  const [draftLevels, setDraftLevels] = useState<Record<number, ProficiencyLevel>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const loadRequirements = useCallback(async (title: string) => {
    if (!title) {
      setRequirements([]);
      return;
    }
    setLoading(true);
    setError('');
    const res = await listRequirementsForPosition(title);
    if (res.ok) setRequirements(res.data);
    else setError(res.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRequirements(position);
    setDraftLevels({});
    setSavedId(null);
  }, [position, loadRequirements]);

  const requirementByCompetency = useMemo(() => {
    const map = new Map<number, PositionRequirement>();
    requirements.forEach((r) => map.set(r.competency_id, r));
    return map;
  }, [requirements]);

  const levelFor = (competencyId: number): ProficiencyLevel =>
    draftLevels[competencyId] ??
    requirementByCompetency.get(competencyId)?.proficiency_level ??
    'Basic';

  const flashSaved = (competencyId: number) => {
    setSavedId(competencyId);
    window.setTimeout(() => {
      setSavedId((current) => (current === competencyId ? null : current));
    }, 2000);
  };

  const handleSave = async (competencyId: number) => {
    if (!position) return;
    setSavingId(competencyId);
    setError('');
    const res = await saveRequirement({
      positionTitle: position,
      competencyId,
      proficiencyLevel: levelFor(competencyId),
      updatedBy: getCurrentAdminEmail(),
    });
    setSavingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadRequirements(position);
    setDraftLevels((prev) => {
      const next = { ...prev };
      delete next[competencyId];
      return next;
    });
    flashSaved(competencyId);
    onSaved();
  };

  const handleRemove = async (competencyId: number) => {
    if (!position) return;
    setSavingId(competencyId);
    setError('');
    const res = await removeRequirement({ positionTitle: position, competencyId });
    setSavingId(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadRequirements(position);
    flashSaved(competencyId);
    onSaved();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[280px]">
          <label htmlFor="position-select" className="mb-1.5 block text-sm font-medium text-slate-700">
            Select Position
          </label>
          <select
            id="position-select"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
          >
            <option value="">Select a position…</option>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {position && (
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{requirements.length}</span> of {standards.length}{' '}
            competencies required for this position
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!position ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-400">
          <BookOpen size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">Select a position to set its competency requirements.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="w-12 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Competency Standard</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Training Stream</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Required</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Proficiency Level</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400">Loading requirements…</td>
                  </tr>
                ) : (
                  standards.map((standard) => {
                    const existing = requirementByCompetency.get(standard.id);
                    const isRequired = Boolean(existing);
                    const isBusy = savingId === standard.id;
                    const justSaved = savedId === standard.id;

                    return (
                      <tr key={standard.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 text-slate-400">{standard.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{standard.competency_name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              STREAM_STYLE[standard.training_stream] ?? 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {standard.training_stream}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isRequired ? (
                            <span className="text-xs font-semibold text-emerald-700">✅ Yes</span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">❌ No</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isRequired ? (
                            <select
                              value={levelFor(standard.id)}
                              onChange={(e) =>
                                setDraftLevels((prev) => ({
                                  ...prev,
                                  [standard.id]: e.target.value as ProficiencyLevel,
                                }))
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
                            >
                              {PROFICIENCY_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  {lvl}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {justSaved && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                                <Check size={14} /> Saved
                              </span>
                            )}
                            {isBusy && <Loader2 size={14} className="animate-spin text-slate-400" />}
                            {isRequired ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleSave(standard.id)}
                                  className="rounded-lg bg-[#363EE8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2d34c4] disabled:opacity-50 transition"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleRemove(standard.id)}
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSave(standard.id)}
                                className="rounded-lg border border-[#363EE8] px-3 py-1.5 text-xs font-semibold text-[#363EE8] hover:bg-[#363EE8]/5 disabled:opacity-50 transition"
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Subtab 2: Competency Map ─────────────────────────────────────────────────

const CompetencyMapPanel = ({
  standards,
  requirements,
  loading,
}: {
  standards: CompetencyStandard[];
  requirements: PositionRequirement[];
  loading: boolean;
}) => {
  // Only positions that actually have requirements: a row per job title in the
  // agency, nearly all empty, would bury the real data.
  const rows = useMemo(() => {
    const byPosition = new Map<string, Map<number, ProficiencyLevel>>();
    requirements.forEach((r) => {
      if (!byPosition.has(r.position_title)) byPosition.set(r.position_title, new Map());
      byPosition.get(r.position_title)!.set(r.competency_id, r.proficiency_level);
    });
    return Array.from(byPosition.entries())
      .map(([positionTitle, levels]) => ({ positionTitle, levels }))
      .sort((a, b) => a.positionTitle.localeCompare(b.positionTitle));
  }, [requirements]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        All positions against the 12 competency standards. Read-only — set requirements under Position
        Requirements. Hover any cell for the full competency name.
      </p>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-400">
          Loading competency map…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-400">
          <Grid3x3 size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No requirements set yet. Add them under Position Requirements.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Position
                  </th>
                  {standards.map((s) => (
                    <th
                      key={s.id}
                      title={`${s.competency_name} — ${s.training_stream}`}
                      className="w-12 cursor-help border-l border-slate-100 px-2 py-3 text-center text-[11px] font-bold text-slate-500"
                    >
                      {COMPETENCY_ABBREVIATIONS[s.id] ?? String(s.id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.positionTitle} className="hover:bg-slate-50/60 transition-colors">
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-slate-800">
                      {row.positionTitle}
                    </td>
                    {standards.map((s) => {
                      const level = row.levels.get(s.id);
                      return (
                        <td
                          key={s.id}
                          title={`${s.competency_name} — ${s.training_stream}\n${
                            level ? `Required: ${level}` : 'Not Required'
                          }`}
                          className="cursor-help border-l border-slate-100 px-2 py-3 text-center"
                        >
                          {level ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#363EE8]/10 text-xs font-bold text-[#363EE8]">
                              {PROFICIENCY_CODE[level]}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Legend:</span>
        <span><strong className="text-[#363EE8]">B</strong> = Basic</span>
        <span><strong className="text-[#363EE8]">I</strong> = Intermediate</span>
        <span><strong className="text-[#363EE8]">A</strong> = Advanced</span>
        <span><strong className="text-slate-400">—</strong> = Not Required</span>
      </div>
    </div>
  );
};

// ── Module shell ─────────────────────────────────────────────────────────────

export const PMCompetencyFramework = () => {
  const [subtab, setSubtab] = useState<Subtab>('requirements');
  const [standards, setStandards] = useState<CompetencyStandard[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [allRequirements, setAllRequirements] = useState<PositionRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [standardsRes, positionsRes, requirementsRes] = await Promise.all([
      listCompetencyStandards(),
      listPositions(),
      listAllRequirements(),
    ]);
    if (standardsRes.ok) setStandards(standardsRes.data);
    else setError(standardsRes.error);
    if (positionsRes.ok) setPositions(positionsRes.data);
    if (requirementsRes.ok) setAllRequirements(requirementsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Competency Framework</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Module 3 — the 12 LGU competency standards, and which each position requires.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubtab(key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              subtab === key ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {subtab === 'requirements' && (
        <PositionRequirementsPanel standards={standards} positions={positions} onSaved={() => void load()} />
      )}
      {subtab === 'map' && (
        <CompetencyMapPanel standards={standards} requirements={allRequirements} loading={loading} />
      )}
    </div>
  );
};

export default PMCompetencyFramework;
