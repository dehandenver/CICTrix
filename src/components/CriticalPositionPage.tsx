import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Eye,
  X,
  Search,
  ListChecks,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { Button } from './Button';
import { getDepartmentById } from '../lib/api/departments';
import { getCompetencyLibrary, type Competency } from '../lib/api/pmCompetencyFramework';
import {
  listCriticalPositions,
  createCriticalPosition,
  updateCriticalPosition,
  deleteCriticalPosition,
  listEmployeeOptions,
  listPositionTitlesForDepartment,
  listCompetencyRequirements,
  saveCompetencyRequirement,
  removeCompetencyRequirement,
  listTrainingRequirements,
  saveTrainingRequirement,
  removeTrainingRequirement,
  getIncumbentStatuses,
  type CriticalPosition,
  type EmployeeOption,
  type CompetencyRequirement,
  type TrainingRequirement,
} from '../lib/api/succession';

export const IPCR_RATING_OPTIONS = ['Outstanding', 'Very Satisfactory', 'Satisfactory', 'Unsatisfactory', 'Poor'] as const;

interface CriticalPositionPageProps {
  officeId: string;
  officeName: string;
  currentUserName: string;
}

type ModalMode = 'add' | 'edit' | 'view';

type CompetencyDraftRow = { competencyId: string; requiredLevel: number };

type PositionFormState = {
  title: string;
  incumbentEmployeeId: string;
  positionDescription: string;
  criticalityReason: string;
  requiredSuccessorsCount: string;
  minYearsExperience: string;
  minIpcrRating: string;
  requiredEducation: string;
  requiredEligibility: string;
  requiredCertifications: string[];
  certificationDraft: string;
  competencyDrafts: CompetencyDraftRow[];
  trainingDrafts: string[];
  trainingDraft: string;
};

const emptyForm: PositionFormState = {
  title: '',
  incumbentEmployeeId: '',
  positionDescription: '',
  criticalityReason: '',
  requiredSuccessorsCount: '1',
  minYearsExperience: '',
  minIpcrRating: '',
  requiredEducation: '',
  requiredEligibility: '',
  requiredCertifications: [],
  certificationDraft: '',
  competencyDrafts: [],
  trainingDrafts: [],
  trainingDraft: '',
};

export const CriticalPositionPage = ({ officeId, officeName, currentUserName }: CriticalPositionPageProps) => {
  const [departmentName, setDepartmentName] = useState<string>(officeName);
  const [positions, setPositions] = useState<CriticalPosition[]>([]);
  const [incumbentStatuses, setIncumbentStatuses] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [positionTitleOptions, setPositionTitleOptions] = useState<string[]>([]);
  const [competencyCatalog, setCompetencyCatalog] = useState<Competency[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [modal, setModal] = useState<{ mode: ModalMode; position: CriticalPosition | null } | null>(null);
  const [form, setForm] = useState<PositionFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Bulk picker: tick several of the office's positions at once. The detailed
  // modal still exists for the per-position requirements (successor count, min
  // IPCR, competencies) — those can't be captured from a checkbox, so this
  // flags them fast and each one is enriched afterwards via Edit.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');

  const readOnly = modal?.mode === 'view';

  const loadPositions = async () => {
    if (!officeId) return;
    setLoading(true);
    const res = await listCriticalPositions(officeId);
    if (res.ok === false) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setPositions(res.data);
    const ids = res.data.map((p) => p.incumbentEmployeeId).filter((id): id is string => !!id);
    setIncumbentStatuses(await getIncumbentStatuses(ids));
    setLoading(false);
  };

  useEffect(() => {
    if (!officeId) return;
    (async () => {
      const deptRes = await getDepartmentById(officeId);
      const name = deptRes.success ? deptRes.data.name : officeName;
      setDepartmentName(name);
      const [titles, compRes, emps] = await Promise.all([
        listPositionTitlesForDepartment(name),
        getCompetencyLibrary(),
        listEmployeeOptions(),
      ]);
      setPositionTitleOptions(titles);
      if (compRes.success) setCompetencyCatalog(compRes.data ?? []);
      setEmployees(emps.filter((e) => (e.department ?? '').trim().toLowerCase() === name.trim().toLowerCase()));
    })();
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return positions;
    return positions.filter((p) => p.title.toLowerCase().includes(q) || (p.incumbentName ?? '').toLowerCase().includes(q));
  }, [positions, search]);

  // ── Modal open/close ────────────────────────────────────────────────────
  // Titles already flagged, compared case-insensitively and trimmed so a
  // differently-cased duplicate can't be created from the picker.
  const flaggedTitles = useMemo(
    () => new Set(positions.map((p) => p.title.trim().toLowerCase())),
    [positions],
  );

  // The dropdown is restricted to the office's real positions, but an existing
  // record may hold a title that predates that list (or whose employee has since
  // left). Union it in so editing that position doesn't silently blank its title.
  const titleDropdownOptions = useMemo(() => {
    const current = form.title.trim();
    if (!current || positionTitleOptions.some((t) => t.trim().toLowerCase() === current.toLowerCase())) {
      return positionTitleOptions;
    }
    return [current, ...positionTitleOptions];
  }, [positionTitleOptions, form.title]);

  const openBulk = () => {
    setBulkSelected(new Set());
    setBulkError('');
    setBulkOpen(true);
  };

  const toggleBulk = (title: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  const saveBulk = async () => {
    const titles = Array.from(bulkSelected);
    if (titles.length === 0) return;
    setBulkSaving(true);
    setBulkError('');

    const failures: string[] = [];
    for (const title of titles) {
      const res = await createCriticalPosition({
        departmentId: officeId,
        title,
        createdBy: currentUserName,
      });
      if (res.ok === false) failures.push(`${title}: ${res.error}`);
    }

    setBulkSaving(false);
    if (failures.length > 0) {
      // Partial success is possible, so refresh either way rather than
      // leaving the table showing a stale list.
      await loadPositions();
      setBulkError(`Some positions could not be added — ${failures.join('; ')}`);
      return;
    }
    setBulkOpen(false);
    await loadPositions();
  };

  const openAdd = () => {
    setForm(emptyForm);
    setModal({ mode: 'add', position: null });
  };

  const openFor = async (mode: 'edit' | 'view', position: CriticalPosition) => {
    setForm({
      title: position.title,
      incumbentEmployeeId: position.incumbentEmployeeId ?? '',
      positionDescription: position.positionDescription ?? '',
      criticalityReason: position.criticalityReason ?? '',
      requiredSuccessorsCount: String(position.requiredSuccessorsCount ?? 1),
      minYearsExperience: position.minYearsExperience != null ? String(position.minYearsExperience) : '',
      minIpcrRating: position.minIpcrRating ?? '',
      requiredEducation: position.requiredEducation ?? '',
      requiredEligibility: position.requiredEligibility ?? '',
      requiredCertifications: position.requiredCertifications ?? [],
      certificationDraft: '',
      competencyDrafts: [],
      trainingDrafts: [],
      trainingDraft: '',
    });
    setModal({ mode, position });

    const [compRes, trainRes] = await Promise.all([
      listCompetencyRequirements(position.id),
      listTrainingRequirements(position.id),
    ]);
    setForm((f) => ({
      ...f,
      competencyDrafts: compRes.ok ? compRes.data.map((c) => ({ competencyId: c.competencyId, requiredLevel: c.requiredLevel })) : [],
      trainingDrafts: trainRes.ok ? trainRes.data.map((t) => t.trainingTitle) : [],
    }));
  };

  const closeModal = () => setModal(null);

  // ── Save ─────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!modal || readOnly) return;
    setSaving(true);

    const payload = {
      positionDescription: form.positionDescription || null,
      requiredSuccessorsCount: Number(form.requiredSuccessorsCount) || 1,
      minYearsExperience: form.minYearsExperience ? Number(form.minYearsExperience) : null,
      minIpcrRating: form.minIpcrRating || null,
      requiredEducation: form.requiredEducation || null,
      requiredEligibility: form.requiredEligibility || null,
      requiredCertifications: form.requiredCertifications,
    };

    const res =
      modal.mode === 'add'
        ? await createCriticalPosition({
            departmentId: officeId,
            title: form.title,
            incumbentEmployeeId: form.incumbentEmployeeId || null,
            criticalityReason: form.criticalityReason || null,
            createdBy: currentUserName,
            ...payload,
          })
        : await updateCriticalPosition(modal.position!.id, {
            title: form.title,
            incumbentEmployeeId: form.incumbentEmployeeId || null,
            criticalityReason: form.criticalityReason || null,
            ...payload,
          });

    if (res.ok === false) {
      setSaving(false);
      setError(res.error);
      return;
    }

    const positionId = modal.mode === 'add' ? (res as { ok: true; data: CriticalPosition }).data.id : modal.position!.id;

    // Diff competency requirements against what's persisted.
    const existingComp = modal.mode === 'edit' ? await listCompetencyRequirements(positionId) : { ok: true as const, data: [] as CompetencyRequirement[] };
    const existingCompRows = existingComp.ok ? existingComp.data : [];
    const draftCompIds = new Set(form.competencyDrafts.map((d) => d.competencyId));
    await Promise.all([
      ...form.competencyDrafts.map((d) =>
        saveCompetencyRequirement({ criticalPositionId: positionId, competencyId: d.competencyId, requiredLevel: d.requiredLevel }),
      ),
      ...existingCompRows.filter((r) => !draftCompIds.has(r.competencyId)).map((r) =>
        removeCompetencyRequirement({ criticalPositionId: positionId, competencyId: r.competencyId }),
      ),
    ]);

    // Diff training requirements.
    const existingTrain = modal.mode === 'edit' ? await listTrainingRequirements(positionId) : { ok: true as const, data: [] as TrainingRequirement[] };
    const existingTrainRows = existingTrain.ok ? existingTrain.data : [];
    const draftTitles = new Set(form.trainingDrafts.map((t) => t.trim().toLowerCase()));
    await Promise.all([
      ...form.trainingDrafts.map((title) => saveTrainingRequirement({ criticalPositionId: positionId, trainingTitle: title })),
      ...existingTrainRows.filter((r) => !draftTitles.has(r.trainingTitle.trim().toLowerCase())).map((r) => removeTrainingRequirement(r.id)),
    ]);

    setSaving(false);
    setModal(null);
    await loadPositions();
  };

  const confirmDelete = async (position: CriticalPosition) => {
    if (!window.confirm(`Remove critical position "${position.title}"? Its requirements and candidate list will be removed too.`)) return;
    const res = await deleteCriticalPosition(position.id);
    if (res.ok === false) {
      setError(res.error);
      return;
    }
    await loadPositions();
  };

  const addCertification = () => {
    const value = form.certificationDraft.trim();
    if (!value || form.requiredCertifications.includes(value)) return;
    setForm((f) => ({ ...f, requiredCertifications: [...f.requiredCertifications, value], certificationDraft: '' }));
  };

  const addTraining = () => {
    const value = form.trainingDraft.trim();
    if (!value || form.trainingDrafts.some((t) => t.trim().toLowerCase() === value.toLowerCase())) return;
    setForm((f) => ({ ...f, trainingDrafts: [...f.trainingDrafts, value], trainingDraft: '' }));
  };

  const addCompetencyRow = () => {
    const available = competencyCatalog.find((c) => !form.competencyDrafts.some((d) => d.competencyId === c.id));
    if (!available) return;
    setForm((f) => ({ ...f, competencyDrafts: [...f.competencyDrafts, { competencyId: available.id, requiredLevel: 3 }] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="!mb-1 text-2xl font-bold text-[var(--text-primary)]">Critical Positions</h1>
        <p className="!mb-0 text-sm text-[var(--text-secondary)]">
          Positions in {departmentName} flagged as requiring a succession &amp; readiness plan, with qualification
          requirements that feed directly into the Succession Planning module.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or incumbent"
            className="cp-input !pl-9"
          />
        </div>
        <Button variant="secondary" onClick={openBulk} className="flex items-center gap-1.5">
          <ListChecks size={14} /> Select Positions
        </Button>
        <Button onClick={openAdd} className="flex items-center gap-1.5">
          <Plus size={14} /> Add Critical Position
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              <th className="px-4 py-3">Position Title</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Current Incumbent</th>
              <th className="px-4 py-3">Employment Status</th>
              <th className="px-4 py-3">Date Assigned</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-secondary)]">Loading critical positions…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center">
                  <ShieldAlert size={22} className="mx-auto mb-2 text-[var(--text-muted)]" />
                  <p className="!mb-0 text-sm font-medium text-[var(--text-primary)]">No critical positions yet</p>
                  <p className="!mb-0 text-sm text-[var(--text-secondary)]">Mark a position critical to start configuring its requirements.</p>
                </td>
              </tr>
            )}
            {!loading && filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                  <span className="flex items-center gap-1.5"><Briefcase size={14} className="text-[var(--text-muted)]" />{p.title}</span>
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{departmentName}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{p.incumbentName ?? <span className="italic text-slate-400">Vacant</span>}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {p.incumbentEmployeeId ? incumbentStatuses.get(p.incumbentEmployeeId) ?? '—' : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{new Date(p.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{new Date(p.updatedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => openFor('view', p)} className="rounded-lg border border-[var(--border-color)] p-1.5 text-slate-600 hover:bg-slate-100" title="View">
                      <Eye size={14} />
                    </button>
                    <button onClick={() => openFor('edit', p)} className="rounded-lg border border-[var(--border-color)] p-1.5 text-blue-600 hover:bg-blue-50" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => confirmDelete(p)} className="rounded-lg border border-[var(--border-color)] p-1.5 text-red-500 hover:bg-red-50" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bulkOpen && (
        <Modal
          title="Select Critical Positions"
          subtitle={`${departmentName} · tick the positions in your office that are critical`}
          onClose={() => setBulkOpen(false)}
        >
          <div className="space-y-4">
            {bulkError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{bulkError}</div>
            )}

            {positionTitleOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--border-color)] px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                No positions found for {departmentName}. Positions come from the employees assigned to this office.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <p className="!mb-0 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{bulkSelected.size}</span> selected
                  </p>
                  {bulkSelected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkSelected(new Set())}
                      className="text-sm font-medium text-[#363EE8] hover:underline"
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                <ul className="max-h-[45vh] divide-y divide-[var(--border-color)] overflow-y-auto rounded-lg border border-[var(--border-color)]">
                  {positionTitleOptions.map((title) => {
                    const already = flaggedTitles.has(title.trim().toLowerCase());
                    const checked = already || bulkSelected.has(title);
                    return (
                      <li key={title}>
                        <label
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                            already ? 'cursor-not-allowed bg-slate-50' : 'cursor-pointer hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={already || bulkSaving}
                            onChange={() => toggleBulk(title)}
                            className="h-4 w-4 shrink-0"
                          />
                          <span className={already ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}>{title}</span>
                          {already && (
                            <span className="ml-auto shrink-0 text-xs font-semibold text-emerald-700">Already critical</span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>

                <p className="!mb-0 text-xs text-[var(--text-muted)]">
                  Selected positions are flagged for {departmentName} and appear immediately under RSP → Succession
                  Planning. Use Edit afterwards to set successor count, minimum IPCR rating and competency requirements.
                </p>
              </>
            )}

            <div className="flex justify-end gap-2 border-t border-[var(--border-color)] pt-4">
              <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
              <Button onClick={saveBulk} loading={bulkSaving} disabled={bulkSelected.size === 0}>
                Add {bulkSelected.size > 0 ? `${bulkSelected.size} ` : ''}Position{bulkSelected.size === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {modal && (
        <Modal
          title={modal.mode === 'add' ? 'Add Critical Position' : modal.mode === 'edit' ? 'Edit Critical Position' : form.title}
          subtitle={`${departmentName}${readOnly ? '' : ' · marking a position critical is a deliberate action'}`}
          onClose={closeModal}
        >
          <div className="space-y-5">
            <div>
              <h3 className="!mb-2 text-sm font-semibold text-[var(--text-primary)]">Position Information</h3>
              <div className="space-y-4">
                <Field label="Position title *">
                  {readOnly ? (
                    <p className="cp-static">{form.title || '—'}</p>
                  ) : (
                    <>
                      <select
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        className="cp-input"
                      >
                        <option value="">Select a position…</option>
                        {titleDropdownOptions.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      {positionTitleOptions.length === 0 && (
                        <p className="!mb-0 mt-1.5 text-xs text-[var(--text-muted)]">
                          No positions found for {departmentName}. Positions come from the employees assigned to
                          this office and from its job postings.
                        </p>
                      )}
                    </>
                  )}
                </Field>
                <Field label="Current incumbent (optional)">
                  {readOnly ? (
                    <p className="cp-static">{form.incumbentEmployeeId ? employees.find((e) => e.id === form.incumbentEmployeeId)?.fullName ?? '—' : 'Vacant'}</p>
                  ) : (
                    <select
                      value={form.incumbentEmployeeId}
                      onChange={(e) => setForm((f) => ({ ...f, incumbentEmployeeId: e.target.value }))}
                      className="cp-input bg-white"
                    >
                      <option value="">Vacant / not linked</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>{e.fullName}{e.position ? ` — ${e.position}` : ''}</option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Position description (optional)">
                  {readOnly ? (
                    <p className="cp-static">{form.positionDescription || '—'}</p>
                  ) : (
                    <textarea rows={2} value={form.positionDescription} onChange={(e) => setForm((f) => ({ ...f, positionDescription: e.target.value }))} className="cp-input resize-y" />
                  )}
                </Field>
                <Field label="Reason for classification as critical (optional)">
                  {readOnly ? (
                    <p className="cp-static">{form.criticalityReason || '—'}</p>
                  ) : (
                    <textarea rows={2} value={form.criticalityReason} onChange={(e) => setForm((f) => ({ ...f, criticalityReason: e.target.value }))} className="cp-input resize-y" />
                  )}
                </Field>
                <Field label="Number of required successors (optional)">
                  {readOnly ? (
                    <p className="cp-static">{form.requiredSuccessorsCount}</p>
                  ) : (
                    <input type="number" min={1} value={form.requiredSuccessorsCount} onChange={(e) => setForm((f) => ({ ...f, requiredSuccessorsCount: e.target.value }))} className="cp-input" />
                  )}
                </Field>
              </div>
            </div>

            <div className="border-t border-[var(--border-color)] pt-4">
              <h3 className="!mb-2 text-sm font-semibold text-[var(--text-primary)]">Qualification Requirements</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Min. years of relevant experience">
                    {readOnly ? <p className="cp-static">{form.minYearsExperience || '—'}</p> : (
                      <input type="number" step="0.5" min={0} value={form.minYearsExperience} onChange={(e) => setForm((f) => ({ ...f, minYearsExperience: e.target.value }))} className="cp-input" />
                    )}
                  </Field>
                  <Field label="Min. IPCR rating">
                    {readOnly ? <p className="cp-static">{form.minIpcrRating || '—'}</p> : (
                      <select value={form.minIpcrRating} onChange={(e) => setForm((f) => ({ ...f, minIpcrRating: e.target.value }))} className="cp-input bg-white">
                        <option value="">Not required</option>
                        {IPCR_RATING_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </Field>
                </div>
                <Field label="Required educational attainment (optional)">
                  {readOnly ? <p className="cp-static">{form.requiredEducation || '—'}</p> : (
                    <input type="text" value={form.requiredEducation} onChange={(e) => setForm((f) => ({ ...f, requiredEducation: e.target.value }))} placeholder="e.g. Bachelor's Degree, Master's Degree" className="cp-input" />
                  )}
                </Field>
                <Field label="Required eligibility (if applicable)">
                  {readOnly ? <p className="cp-static">{form.requiredEligibility || '—'}</p> : (
                    <input type="text" value={form.requiredEligibility} onChange={(e) => setForm((f) => ({ ...f, requiredEligibility: e.target.value }))} placeholder="e.g. CSC Professional" className="cp-input" />
                  )}
                </Field>

                <Field label="Required certifications (if available)">
                  <div className="flex flex-wrap gap-2">
                    {form.requiredCertifications.map((c) => (
                      <span key={c} className="flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-slate-50 px-2.5 py-1 text-xs text-[var(--text-primary)]">
                        {c}
                        {!readOnly && (
                          <button onClick={() => setForm((f) => ({ ...f, requiredCertifications: f.requiredCertifications.filter((x) => x !== c) }))} className="text-slate-400 hover:text-red-500">
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                    {form.requiredCertifications.length === 0 && <span className="text-sm text-[var(--text-secondary)]">None specified.</span>}
                  </div>
                  {!readOnly && (
                    <div className="mt-2 flex gap-2">
                      <input type="text" value={form.certificationDraft} onChange={(e) => setForm((f) => ({ ...f, certificationDraft: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCertification())} placeholder="e.g. Project Management Professional" className="cp-input" />
                      <Button variant="secondary" onClick={addCertification} type="button">Add</Button>
                    </div>
                  )}
                </Field>

                <Field label="Required competencies">
                  <div className="space-y-2">
                    {form.competencyDrafts.map((row, idx) => (
                      <div key={row.competencyId} className="flex items-center gap-2">
                        {readOnly ? (
                          <span className="flex-1 text-sm text-[var(--text-primary)]">
                            {competencyCatalog.find((c) => c.id === row.competencyId)?.name ?? 'Unknown'}
                          </span>
                        ) : (
                          <select
                            value={row.competencyId}
                            onChange={(e) => setForm((f) => ({ ...f, competencyDrafts: f.competencyDrafts.map((d, i) => (i === idx ? { ...d, competencyId: e.target.value } : d)) }))}
                            className="cp-input flex-1 bg-white"
                          >
                            {competencyCatalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                        {readOnly ? (
                          <span className="text-sm text-[var(--text-secondary)]">Level {row.requiredLevel}</span>
                        ) : (
                          <select
                            value={row.requiredLevel}
                            onChange={(e) => setForm((f) => ({ ...f, competencyDrafts: f.competencyDrafts.map((d, i) => (i === idx ? { ...d, requiredLevel: Number(e.target.value) } : d)) }))}
                            className="cp-input w-28 bg-white"
                          >
                            {[1, 2, 3, 4, 5].map((lvl) => <option key={lvl} value={lvl}>Level {lvl}</option>)}
                          </select>
                        )}
                        {!readOnly && (
                          <button onClick={() => setForm((f) => ({ ...f, competencyDrafts: f.competencyDrafts.filter((_, i) => i !== idx) }))} className="text-slate-400 hover:text-red-500">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {form.competencyDrafts.length === 0 && <span className="text-sm text-[var(--text-secondary)]">None specified.</span>}
                    {!readOnly && (
                      <Button variant="secondary" size="sm" onClick={addCompetencyRow} className="flex items-center gap-1.5" type="button">
                        <Plus size={13} /> Add competency
                      </Button>
                    )}
                  </div>
                </Field>

                <Field label="Required trainings">
                  <div className="flex flex-wrap gap-2">
                    {form.trainingDrafts.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-slate-50 px-2.5 py-1 text-xs text-[var(--text-primary)]">
                        {t}
                        {!readOnly && (
                          <button onClick={() => setForm((f) => ({ ...f, trainingDrafts: f.trainingDrafts.filter((x) => x !== t) }))} className="text-slate-400 hover:text-red-500">
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                    {form.trainingDrafts.length === 0 && <span className="text-sm text-[var(--text-secondary)]">None specified.</span>}
                  </div>
                  {!readOnly && (
                    <div className="mt-2 flex gap-2">
                      <input type="text" value={form.trainingDraft} onChange={(e) => setForm((f) => ({ ...f, trainingDraft: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTraining())} placeholder="e.g. Leadership Development Program" className="cp-input" />
                      <Button variant="secondary" onClick={addTraining} type="button">Add</Button>
                    </div>
                  )}
                </Field>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={closeModal}>{readOnly ? 'Close' : 'Cancel'}</Button>
            {!readOnly && (
              <Button onClick={save} loading={saving} disabled={!form.title.trim()}>
                {modal.mode === 'add' ? 'Add position' : 'Save changes'}
              </Button>
            )}
          </div>
        </Modal>
      )}

      <style>{`
        .cp-input {
          width: 100%;
          border-radius: 0.6rem;
          border: 1px solid var(--border-color, #d1d5db);
          padding: 0.55rem 0.75rem;
          font-size: 0.9rem;
          outline: none;
        }
        .cp-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
        .cp-static { font-size: 0.9rem; color: var(--text-primary); margin: 0; }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits (mirrors SuccessionPlanningPage.tsx's local Modal/Field)
// ─────────────────────────────────────────────────────────────────────────────

const Modal = ({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div
      className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] px-6 py-4">
        <div>
          <h2 className="!mb-0 text-lg font-bold text-[var(--text-primary)]">{title}</h2>
          {subtitle && <p className="!mb-0 mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto px-6 py-5">{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium text-[var(--text-primary)]">{label}</label>
    {children}
  </div>
);
