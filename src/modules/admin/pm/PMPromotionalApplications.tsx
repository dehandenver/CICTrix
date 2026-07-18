import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from '../../../components/ErrorBanner';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardList,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';

import { Dialog } from '../../../components/Dialog';
import {
  createApplication,
  decideApplication,
  IPCR_DOCUMENT_LABEL,
  listApplicationDocuments,
  listApplications,
  listEmployeesForApplication,
  runEligibilityCheck,
  setDocumentStatus,
  type ApplicationDocument,
  type ApplicationRow,
  type EligibilityReport,
} from '../../../lib/api/promotionalApplications';
import { listPositions } from '../../../lib/api/pmCompetency';
import { getCurrentAdminEmail } from '../moduleUi';

type Subtab = 'applications' | 'eligibility';

const SUBTABS: { key: Subtab; label: string; icon: React.ElementType }[] = [
  { key: 'applications', label: 'Applications', icon: ClipboardList },
  { key: 'eligibility', label: 'Eligibility Check', icon: ShieldCheck },
];

const fmtDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const STATUS_STYLE: Record<string, string> = {
  submitted: 'bg-slate-100 text-slate-700',
  under_review: 'bg-blue-50 text-blue-700',
  endorsed: 'bg-indigo-50 text-indigo-700',
  approved: 'bg-emerald-50 text-emerald-700',
  denied: 'bg-red-50 text-red-700',
};

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  endorsed: 'Endorsed',
  approved: 'Approved',
  denied: 'Denied',
};

const StatusPill = ({ status }: { status: string }) => (
  <span
    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-700'
    }`}
  >
    {STATUS_LABEL[status] ?? status}
  </span>
);

// ── Eligibility panel (also embedded in the detail page) ─────────────────────

const EligibilityPanel = ({
  application,
  report,
  loading,
}: {
  application: ApplicationRow | null;
  report: EligibilityReport | null;
  loading: boolean;
}) => {
  if (!application) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white py-16 text-slate-400">
        <ShieldCheck size={28} className="mb-2 text-slate-300" />
        <p className="text-sm">Open an application and choose Run Eligibility Check.</p>
      </div>
    );
  }

  if (loading || !report) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-400">
        Running eligibility check…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">ELIGIBILITY CHECK — {application.employee_name}</h3>
        <p className="text-sm text-slate-500">Applying For: {application.position_applied_for}</p>
      </div>

      {report.missingRequirements ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No competency requirements are set for <strong>{application.position_applied_for}</strong>. Set them
          under Competency Framework → Position Requirements, then run this check again.
        </div>
      ) : (
        <>
          {!report.hasClosedIpcr && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>No closed IPCR results for this employee yet.</strong> Scores are computed from a closed
              IPCR, so they can't be shown until this employee's IPCR is verified and forwarded to PM. The
              required levels below still apply.
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Competency Standard</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Required Level</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">IPCR-Based Score</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.map((row) => (
                    <tr key={row.competencyId} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-medium text-slate-800" title={row.trainingStream}>
                        {row.competencyName}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.requiredLevel}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.score == null ? <span className="text-slate-300">—</span> : row.score.toFixed(1)}
                      </td>
                      <td className="px-4 py-3">
                        {row.result === 'Met' && (
                          <span className="text-xs font-semibold text-emerald-700">✅ Met</span>
                        )}
                        {row.result === 'Gap' && (
                          <span className="text-xs font-semibold text-amber-700">⚠ Gap</span>
                        )}
                        {row.result === 'Pending' && (
                          <span className="text-xs font-semibold text-slate-400">Awaiting IPCR</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="!mb-0 font-semibold text-slate-800">
              RESULT: {report.metCount} Met — {report.gapCount} Gap{report.gapCount === 1 ? '' : 's'}
              {report.pendingCount > 0 && ` — ${report.pendingCount} awaiting IPCR`}
            </p>
            <p className="!mb-0 mt-0.5 text-xs text-slate-500">
              Scores are read-only, computed from the closed IPCR. PM may proceed or note gaps in remarks
              before deciding.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

// ── Application detail ───────────────────────────────────────────────────────

const ApplicationDetail = ({
  application,
  onBack,
  onChanged,
  onRunEligibility,
}: {
  application: ApplicationRow;
  onBack: () => void;
  onChanged: () => void;
  onRunEligibility: (app: ApplicationRow) => void;
}) => {
  const [documents, setDocuments] = useState<ApplicationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState(application.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const res = await listApplicationDocuments(application.id);
    if (res.ok) setDocuments(res.data ?? []);
    else setError(res.error ?? '');
    setLoading(false);
  }, [application.id]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const toggleDoc = async (doc: ApplicationDocument) => {
    setBusy(true);
    setError('');
    const res = await setDocumentStatus({
      documentId: doc.id,
      status: doc.status === 'submitted' ? 'missing' : 'submitted',
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? '');
      return;
    }
    await loadDocs();
    onChanged();
  };

  const decide = async (status: 'approved' | 'denied' | 'under_review' | 'endorsed') => {
    setError('');
    // Approve/Deny must carry a reason — blocked here as well as in the API.
    if ((status === 'approved' || status === 'denied') && !remarks.trim()) {
      setError('Remarks are required before approving or denying.');
      return;
    }
    setBusy(true);
    const res = await decideApplication({
      applicationId: application.id,
      status,
      remarks,
      decidedBy: getCurrentAdminEmail(),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? '');
      return;
    }
    setSaved(`Application ${STATUS_LABEL[status]?.toLowerCase()}.`);
    onChanged();
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-[#363EE8] hover:underline"
      >
        <ArrowLeft size={14} /> Applications
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              PROMOTIONAL APPLICATION — {application.employee_name}
            </h3>
            <p className="!mb-0 mt-1 text-sm text-slate-600">
              Current Position: <span className="font-medium">{application.current_position || '—'}</span>
            </p>
            <p className="!mb-0 text-sm text-slate-600">
              Applying For: <span className="font-medium">{application.position_applied_for}</span>
            </p>
          </div>
          <StatusPill status={application.status} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Documents
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {/* Auto-linked from the closed IPCR — never uploaded, so no toggle. */}
            <tr className="bg-slate-50/40">
              <td className="px-4 py-3 font-medium text-slate-800">
                <span className="inline-flex items-center gap-1.5">
                  <Link2 size={13} className="text-slate-400" /> {IPCR_DOCUMENT_LABEL}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {application.ipcrLinked ? (
                  <span className="text-xs font-semibold text-emerald-700">✅ Linked</span>
                ) : (
                  <span className="text-xs font-semibold text-amber-700" title="No closed IPCR for this employee yet">
                    ⚠ No closed IPCR
                  </span>
                )}
              </td>
            </tr>
            {loading ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">Loading documents…</td>
              </tr>
            ) : (
              documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">{doc.document_type}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleDoc(doc)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                      title="Toggle submitted / missing"
                    >
                      {doc.status === 'submitted' ? (
                        <span className="text-emerald-700">✅ Submitted</span>
                      ) : (
                        <span className="text-amber-700">⚠ Missing</span>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label htmlFor="remarks" className="block text-sm font-medium text-slate-700">
          Remarks <span className="text-slate-400">(required to approve or deny)</span>
        </label>
        <textarea
          id="remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          placeholder="Basis for the decision, or gaps noted from the eligibility check…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#363EE8]/30"
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        {saved && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <Check size={14} /> {saved}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRunEligibility(application)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#363EE8] px-4 py-2 text-sm font-semibold text-[#363EE8] hover:bg-[#363EE8]/5 disabled:opacity-50 transition"
          >
            <ShieldCheck size={15} /> Run Eligibility Check
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('approved')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide('denied')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            <X size={15} /> Deny
          </button>
        </div>
      </div>
    </div>
  );
};

// ── New application modal ────────────────────────────────────────────────────

const NewApplicationModal = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) => {
  const [employees, setEmployees] = useState<Array<{ id: string; employeeId: string; name: string; position: string }>>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [employeeKey, setEmployeeKey] = useState('');
  const [positionAppliedFor, setPositionAppliedFor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const [empRes, posRes] = await Promise.all([listEmployeesForApplication(), listPositions()]);
      if (empRes.ok) setEmployees(empRes.data ?? []);
      if (posRes.ok) setPositions(posRes.data ?? []);
    })();
  }, [open]);

  const selected = employees.find((e) => e.id === employeeKey) ?? null;

  const submit = async () => {
    setError('');
    if (!selected || !positionAppliedFor) {
      setError('Select an employee and the position being applied for.');
      return;
    }
    setBusy(true);
    // employee_id stores employees.id (uuid) — the same key ipcr_submissions
    // uses, so the Latest IPCR can auto-link.
    const res = await createApplication({
      employeeId: selected.id,
      employeeName: selected.name,
      currentPosition: selected.position,
      positionAppliedFor,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? '');
      return;
    }
    setEmployeeKey('');
    setPositionAppliedFor('');
    onCreated();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="w-[420px] max-w-full space-y-3 p-1">
        <h3 className="text-lg font-bold text-slate-900">New Promotional Application</h3>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Employee</label>
          <select
            value={employeeKey}
            onChange={(e) => setEmployeeKey(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {e.position || 'No position'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Current Position</label>
          <input
            value={selected?.position ?? ''}
            readOnly
            placeholder="Select an employee first"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Applying For</label>
          <select
            value={positionAppliedFor}
            onChange={(e) => setPositionAppliedFor(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a position…</option>
            {positions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-[#363EE8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2d34c4] disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create Application'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Module shell ─────────────────────────────────────────────────────────────

export function PMPromotionalApplications() {
  const [subtab, setSubtab] = useState<Subtab>('applications');
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ApplicationRow | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [eligibilityFor, setEligibilityFor] = useState<ApplicationRow | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityReport | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await listApplications();
    if (res.ok) setRows(res.data ?? []);
    else setError(res.error ?? '');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the open detail in sync with refreshed rows.
  const selectedFresh = useMemo(
    () => (selected ? rows.find((r) => r.id === selected.id) ?? selected : null),
    [rows, selected],
  );

  const handleRunEligibility = async (app: ApplicationRow) => {
    setEligibilityFor(app);
    setSubtab('eligibility');
    setEligibilityLoading(true);
    setEligibility(null);
    const res = await runEligibilityCheck({
      employeeId: app.employee_id,
      positionAppliedFor: app.position_applied_for,
    });
    setEligibilityLoading(false);
    if (res.ok) setEligibility(res.data ?? null);
    else setError(res.error ?? '');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Promotional Applications</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Module 4 — review promotion requests and check them against position requirements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-3 py-2 text-sm font-semibold text-white hover:bg-[#2d34c4] transition"
          >
            <Plus size={14} /> New Application
          </button>
        </div>
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

      {subtab === 'applications' &&
        (selectedFresh ? (
          <ApplicationDetail
            application={selectedFresh}
            onBack={() => setSelected(null)}
            onChanged={() => void load()}
            onRunEligibility={(app) => void handleRunEligibility(app)}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left">
                    {['Applicant', 'Current Position', 'Applying For', 'Date Applied', 'Documents', 'Status', 'Action'].map(
                      (h) => (
                        <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">Loading applications…</td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                        <ClipboardList size={28} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-sm">No promotional applications yet. Use New Application to raise one.</p>
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const complete = row.documentsSubmitted === row.documentsTotal;
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{row.employee_name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.current_position || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{row.position_applied_for}</td>
                          <td className="px-4 py-3 text-slate-600">{fmtDate(row.date_applied)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                complete ? 'text-emerald-700' : 'text-amber-700'
                              }`}
                            >
                              {row.documentsSubmitted}/{row.documentsTotal}
                              {!complete && <AlertTriangle size={12} />}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setSelected(row)}
                              className="rounded-lg bg-[#363EE8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2d34c4] transition"
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {subtab === 'eligibility' && (
        <EligibilityPanel application={eligibilityFor} report={eligibility} loading={eligibilityLoading} />
      )}

      <NewApplicationModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => void load()} />
    </div>
  );
}

export default PMPromotionalApplications;
