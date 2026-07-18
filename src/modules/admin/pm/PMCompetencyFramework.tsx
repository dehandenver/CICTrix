import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ErrorBanner } from '../../../components/ErrorBanner';
import { BookOpen, Check, Grid3x3, Loader2, RefreshCw, Search, Trash2, X } from 'lucide-react';

import { Dialog } from '../../../components/Dialog';
import {
  listAllRequirements,
  listCompetencyStandards,
  listPositionDepartments,
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

const STREAM_STYLE: Record<string, string> = {
  LEADERSHIP: 'bg-indigo-50 text-indigo-700',
  'EMPLOYEE DEVELOPMENT': 'bg-emerald-50 text-emerald-700',
  TECHNICAL: 'bg-sky-50 text-sky-700',
  'CULTURAL TRANSFORMATION': 'bg-amber-50 text-amber-700',
};

// ── Position search ──────────────────────────────────────────────────────────

/**
 * Type-ahead for choosing a position.
 *
 * Only positions that already exist in the system are selectable: free text is
 * never committed, so a typo can't create requirements against a position that
 * doesn't exist. Typed text that matches nothing simply reverts on blur/Escape.
 */
const PositionSearchInput = ({
  positions,
  value,
  onChange,
}: {
  positions: string[];
  value: string;
  onChange: (position: string) => void;
}) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Track a selection changed from outside (e.g. cleared).
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // An empty query lists everything, so the field is browsable as well as
    // searchable — it replaces a dropdown, after all.
    const list = q ? positions.filter((p) => p.toLowerCase().includes(q)) : positions;
    return list.slice(0, 50);
  }, [positions, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value); // Discard uncommitted text — only real positions stick.
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, value]);

  const commit = (position: string) => {
    onChange(position);
    setQuery(position);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(matches.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && matches[highlight]) commit(matches[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(value);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="position-search" className="mb-1.5 block text-sm font-medium text-slate-700">
        Select Position
      </label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id="position-search"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder="Search a position…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
        />
        {(query || value) && (
          <button
            type="button"
            aria-label="Clear position"
            onClick={() => {
              onChange('');
              setQuery('');
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">
              No position matches “{query.trim()}”.
            </li>
          ) : (
            matches.map((p, index) => (
              <li key={p}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p === value}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => commit(p)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                    index === highlight ? 'bg-[#363EE8]/8 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{p}</span>
                  {p === value && <Check size={14} className="text-[#363EE8]" />}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
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
        <div className="w-full min-w-[280px] sm:w-80">
          <PositionSearchInput positions={positions} value={position} onChange={setPosition} />
        </div>
        {position && (
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{requirements.length}</span> of {standards.length}{' '}
            competencies required for this position
          </p>
        )}
      </div>

      <ErrorBanner error={error} context="server" />

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

interface MapRow {
  requirementId: string;
  positionTitle: string;
  departments: string[];
  competencyId: number;
  competencyName: string;
  trainingStream: string;
  level: ProficiencyLevel;
}

const CompetencyMapPanel = ({
  standards,
  requirements,
  positionDepartments,
  loading,
  onChanged,
}: {
  standards: CompetencyStandard[];
  requirements: PositionRequirement[];
  positionDepartments: Record<string, string[]>;
  loading: boolean;
  onChanged: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [streamFilter, setStreamFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MapRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const standardById = useMemo(() => {
    const map = new Map<number, CompetencyStandard>();
    standards.forEach((s) => map.set(s.id, s));
    return map;
  }, [standards]);

  // One row per requirement — the grid couldn't carry a department, a full
  // competency name, or a per-record delete.
  const allRows = useMemo<MapRow[]>(
    () =>
      requirements
        .map((r) => {
          const standard = standardById.get(r.competency_id);
          return {
            requirementId: r.id,
            positionTitle: r.position_title,
            departments: positionDepartments[r.position_title] ?? [],
            competencyId: r.competency_id,
            competencyName: standard?.competency_name ?? `Competency ${r.competency_id}`,
            trainingStream: standard?.training_stream ?? '',
            level: r.proficiency_level,
          };
        })
        .sort(
          (a, b) =>
            a.positionTitle.localeCompare(b.positionTitle) || a.competencyId - b.competencyId,
        ),
    [requirements, standardById, positionDepartments],
  );

  const departmentOptions = useMemo(
    () => Array.from(new Set(allRows.flatMap((r) => r.departments))).sort((a, b) => a.localeCompare(b)),
    [allRows],
  );
  const positionOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.positionTitle))).sort((a, b) => a.localeCompare(b)),
    [allRows],
  );
  const streamOptions = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.trainingStream).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [allRows],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesSearch =
        !q ||
        row.positionTitle.toLowerCase().includes(q) ||
        row.competencyName.toLowerCase().includes(q) ||
        row.trainingStream.toLowerCase().includes(q) ||
        row.departments.some((d) => d.toLowerCase().includes(q));
      // A position held in two offices matches either — the requirement really
      // does apply in both.
      const matchesDepartment = !departmentFilter || row.departments.includes(departmentFilter);
      const matchesPosition = !positionFilter || row.positionTitle === positionFilter;
      const matchesStream = !streamFilter || row.trainingStream === streamFilter;
      return matchesSearch && matchesDepartment && matchesPosition && matchesStream;
    });
  }, [allRows, search, departmentFilter, positionFilter, streamFilter]);

  const hasFilters = Boolean(search || departmentFilter || positionFilter || streamFilter);
  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('');
    setPositionFilter('');
    setStreamFilter('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    const res = await removeRequirement({
      positionTitle: pendingDelete.positionTitle,
      competencyId: pendingDelete.competencyId,
    });
    setDeleting(false);
    if (!res.ok) {
      setError(res.error ?? 'Failed to delete the record.');
      return;
    }
    setPendingDelete(null);
    onChanged();
  };

  const selectClass =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30';

  // Group filtered rows by position for the consolidated view
  const groupedByPosition = useMemo(() => {
    const map = new Map<string, MapRow[]>();
    rows.forEach((row) => {
      const existing = map.get(row.positionTitle);
      if (existing) existing.push(row);
      else map.set(row.positionTitle, [row]);
    });
    return Array.from(map.entries()); // [positionTitle, MapRow[]][]
  }, [rows]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Every competency requirement across all positions. Deleting a record here removes that
        requirement from the position — the same record shown under Position Requirements.
      </p>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search position, competency, department…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
          />
        </div>

        <select
          aria-label="Filter by department"
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Departments</option>
          {departmentOptions.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          aria-label="Filter by position"
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Positions</option>
          {positionOptions.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          aria-label="Filter by training stream"
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All Categories</option>
          {streamOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="whitespace-nowrap px-3 py-2 text-sm font-medium text-[#363EE8] hover:underline"
          >
            Clear Filters
          </button>
        )}
      </div>

      <ErrorBanner error={error} context="server" />

      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{groupedByPosition.length}</span> position
        {groupedByPosition.length === 1 ? '' : 's'}{' '}
        <span className="text-slate-400">({rows.length} competency record{rows.length === 1 ? '' : 's'})</span>
      </p>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-400">
          Loading competency map…
        </div>
      ) : allRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-400">
          <Grid3x3 size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No requirements set yet. Add them under Position Requirements.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-400">
          <Grid3x3 size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No records match your filters.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-[200px]">Position</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 w-[180px]">Department</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Competency Standards</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedByPosition.map(([posTitle, posRows]) => (
                  <tr key={posTitle} className="hover:bg-slate-50/60 transition-colors align-top">
                    <td className="px-4 py-3 font-medium text-slate-800">{posTitle}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {posRows[0].departments.length > 0
                        ? posRows[0].departments.join(', ')
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="space-y-1">
                        {posRows.map((row) => (
                          <div
                            key={row.requirementId}
                            className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-slate-100 bg-slate-50/50 px-2.5 py-1.5"
                            style={{ fontSize: '12px' }}
                          >
                            <span className="font-semibold text-slate-800 mr-1">{row.competencyName}</span>
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                STREAM_STYLE[row.trainingStream] ?? 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.trainingStream || '—'}
                            </span>
                            <span className="inline-flex items-center gap-1 text-slate-700">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#363EE8]/10 text-[10px] font-bold text-[#363EE8]">
                                {PROFICIENCY_CODE[row.level]}
                              </span>
                              <span className="text-[11px]">{row.level}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(row)}
                              aria-label={`Delete ${row.competencyName} from ${row.positionTitle}`}
                              className="ml-auto inline-flex items-center gap-0.5 rounded border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-50 transition"
                            >
                              <Trash2 size={10} /> Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deleting drops a real requirement, so confirm rather than fire on click. */}
      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)}>
        <div className="w-[400px] max-w-full space-y-3 p-1">
          <h3 className="text-lg font-bold text-slate-900">Delete competency record?</h3>
          <p className="text-sm text-slate-600">
            <strong>{pendingDelete?.competencyName}</strong> will no longer be required for{' '}
            <strong>{pendingDelete?.positionTitle}</strong>. This also removes it from that position's
            requirements and from any eligibility check that uses them.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
            </button>
          </div>
        </div>
      </Dialog>

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Legend:</span>
        <span><strong className="text-[#363EE8]">B</strong> = Basic</span>
        <span><strong className="text-[#363EE8]">I</strong> = Intermediate</span>
        <span><strong className="text-[#363EE8]">A</strong> = Advanced</span>
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
  const [positionDepartments, setPositionDepartments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [standardsRes, positionsRes, requirementsRes, departmentsRes] = await Promise.all([
      listCompetencyStandards(),
      listPositions(),
      listAllRequirements(),
      listPositionDepartments(),
    ]);
    if (standardsRes.ok) setStandards(standardsRes.data);
    else setError(standardsRes.error);
    if (positionsRes.ok) setPositions(positionsRes.data);
    if (requirementsRes.ok) setAllRequirements(requirementsRes.data);
    if (departmentsRes.ok) setPositionDepartments(departmentsRes.data ?? {});
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

      <ErrorBanner error={error} context="server" />

      {subtab === 'requirements' && (
        <PositionRequirementsPanel standards={standards} positions={positions} onSaved={() => void load()} />
      )}
      {subtab === 'map' && (
        <CompetencyMapPanel
          standards={standards}
          requirements={allRequirements}
          positionDepartments={positionDepartments}
          loading={loading}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};

export default PMCompetencyFramework;
