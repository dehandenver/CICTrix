import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, KeyRound, Printer, Search, UserX, XCircle } from 'lucide-react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { revokeSlotReservation } from '../lib/plantillaSlots';
import {
  fetchReservedApplicants,
  generateEmployeeCredentials,
  printCredentialCards,
  type CredentialResult,
  type PromotionOutcome,
  type ReservedApplicant,
} from '../lib/hiringFlow';
import {
  formatDisplayDate,
  groupByDepartmentAndPosition,
  groupCheckState,
  isPastDate,
  localIsoDate,
  toggleGroup,
  toggleId,
  type CheckState,
} from '../lib/scheduleSelection';
import { ConfirmModal, Modal } from './modal';
import { ErrorBanner } from './ErrorBanner';
import { useFeedback } from './action-feedback';
import { describeActionFailure } from '../lib/friendlyErrors';

/**
 * Applicants selected on For Hiring wait here until they report for contract
 * signing. RSP ticks the ones who signed, across any departments, and
 * generates their credentials; or marks one "Did not report", which reopens
 * the plantilla for another selection.
 * Layout: docs/mockups/2026-10-21-hire-reservation-flow.html (step 3, layout B).
 */

type Row = ReservedApplicant & { office: string; positionLabel: string };

const PROMOTION_RESULT_COPY = 'Promotion completed. Your existing employee account is unchanged.';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Category chip (§10): a promotion is a kind of appointment, not a status. */
const PromotionChip = () => <span className="badge badge-tint">Promotion</span>;

const CHECKBOX_CLASS = 'h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--color-primary)]';

const GroupCheckbox = ({ state, label, onChange }: { state: CheckState; label: string; onChange: () => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={state === 'checked'} onChange={onChange} className={CHECKBOX_CLASS} />
  );
};

export const GenerateCredentialsPage = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<Row | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<CredentialResult[]>([]);
  const [promotions, setPromotions] = useState<PromotionOutcome[]>([]);
  const [failures, setFailures] = useState<string[]>([]);
  // A failed read is reported, not shown as "nobody is awaiting credentials".
  const [loadError, setLoadError] = useState<unknown>(null);
  const feedback = useFeedback();

  const load = useCallback(async () => {
    setLoading(true);
    let reserved: Awaited<ReturnType<typeof fetchReservedApplicants>>;
    try {
      reserved = await fetchReservedApplicants();
    } catch (err) {
      setLoadError(err);
      setLoading(false);
      return;
    }
    setLoadError(null);
    setRows(reserved.map((r) => ({
      ...r,
      office: r.department,
      positionLabel: r.plantilla ? `${r.position} · ${r.plantilla}` : r.position,
    })));
    // Keep only selections that still exist (another admin may have acted).
    setSelected((prev) => new Set([...prev].filter((id) => reserved.some((r) => r.id === id))));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener('cictrix:applicants-updated', load);
    return () => window.removeEventListener('cictrix:applicants-updated', load);
  }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.fullName, r.email, r.referenceNo, r.position, r.plantilla, r.department].some((v) => v.toLowerCase().includes(term)),
    );
  }, [rows, search]);

  const groups = useMemo(
    () => groupByDepartmentAndPosition(visible.map((r) => ({ ...r, position: r.positionLabel }))),
    [visible],
  );

  // Selection spans departments; the bar sums it per department.
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedByDept = useMemo(() => {
    const counts = new Map<string, number>();
    selectedRows.forEach((r) => counts.set(r.department, (counts.get(r.department) ?? 0) + 1));
    return Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [selectedRows]);

  const selectedPromotionCount = selectedRows.filter((r) => r.applicationType === 'promotion').length;
  const selectedCredentialCount = selectedRows.length - selectedPromotionCount;

  const today = localIsoDate();
  const visibleIds = visible.map((r) => r.id);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const outcome = await generateEmployeeCredentials(selectedRows);
      setConfirmGenerate(false);
      setSelected(new Set());
      setCredentials(outcome.credentials);
      setPromotions(outcome.promotions);
      setFailures(outcome.failures);
      // When every row failed, the result modal lists each reason, so no banner blames the connection.
      if (outcome.credentials.length === 0 && outcome.promotions.length === 0 && outcome.failures.length === 0) {
        setError("We couldn't generate any credentials. Check your connection and try again.");
      }
    } catch (err) {
      // Keep the selection so nothing has to be re-ticked; the reload below drops rows that were processed.
      setConfirmGenerate(false);
      const failure = describeActionFailure('generate the credentials', err);
      setError(`${failure.title} ${failure.message} ${failure.nextStep}`);
    } finally {
      setGenerating(false);
      void load();
    }
  };

  const closeResults = () => { setCredentials([]); setPromotions([]); setFailures([]); };
  // Every selected row failed: the modal only lists reasons and claims nothing was created or emailed.
  const nothingCompleted = credentials.length === 0 && promotions.length === 0;
  const resultTitle = nothingCompleted
    ? 'Nothing Was Completed'
    : credentials.length > 0 && promotions.length > 0
      ? 'Appointments Completed'
      : credentials.length === 0
        ? 'Promotions Completed'
        : 'Employee Records Created';
  const resultSubtitle = nothingCompleted
    ? 'None of the selected applicants were completed. Check the reasons below.'
    : [
      credentials.length > 0
        ? `${plural(credentials.length, 'account')} generated. Credentials were emailed where an address was on file.`
        : null,
      promotions.length > 0 ? `${plural(promotions.length, 'promotion')} completed.` : null,
    ].filter(Boolean).join(' ');

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const result = await revokeSlotReservation(revokeTarget.id);
    setRevoking(false);
    if (!result.ok) {
      const failure = describeActionFailure('revoke the selection', result.error);
      setError(`${failure.title} ${failure.message} ${failure.nextStep}`);
      return;
    }
    setRevokeTarget(null);
    window.dispatchEvent(new Event('cictrix:applicants-updated'));
  };

  return (
    <div className="rsp-ds min-h-screen bg-[var(--bg-page)]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar
            title="Generate Employee Credentials"
            subtitle="Selected applicants waiting for contract signing"
          />

          <div className="p-6">
            {/* §9.4 toolbar */}
            <div className="mb-3">
              <div className="mb-3">
                <h2 className="text-base font-semibold text-[var(--color-primary-900)]">Awaiting contract signing</h2>
                <p className="text-sm text-[var(--neutral-600)]">
                  {rows.length} selected applicant{rows.length === 1 ? '' : 's'} in {new Set(rows.map((r) => r.department)).size} department
                  {new Set(rows.map((r) => r.department)).size === 1 ? '' : 's'}. Tick the ones who reported and secured their slot.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-start gap-3">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={visibleIds.length === 0}
                  onClick={() => setSelected(toggleGroup(visibleIds, selected))}
                >
                  {groupCheckState(visibleIds, selected) === 'checked' ? 'Clear all' : 'Select all'}
                </button>
                <label className="relative">
                  <span className="sr-only">Search applicants</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neutral-400)]" aria-hidden="true" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, position, office…"
                    className="h-9 w-[260px] rounded-lg border border-[var(--neutral-200)] bg-white pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
                  />
                </label>
              </div>
            </div>

            {/* Selection bar: totals across every department, actions beside the count (primary first). */}
            <div className="sticky top-[57px] z-[5] mb-3 flex flex-wrap items-center justify-start gap-3 rounded-xl border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] px-4 py-2.5">
              <p className="text-sm text-[var(--color-primary-700)]" aria-live="polite">
                <b>{selected.size} selected</b>
                {selectedByDept.length > 0 && (
                  <>
                    {' '}across {selectedByDept.length} department{selectedByDept.length === 1 ? '' : 's'} ·{' '}
                    <span className="text-[var(--neutral-600)]">
                      {selectedByDept.map(([dept, n]) => `${dept} (${n})`).join(', ')}
                    </span>
                  </>
                )}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-md btn-primary" disabled={selected.size === 0} onClick={() => setConfirmGenerate(true)}>
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Generate{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
                <button type="button" className="btn btn-sm btn-secondary" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            </div>

            {loadError ? (
              <ErrorBanner error={loadError} action="load the applicants awaiting credentials" onRetry={() => void load()} className="mb-3" />
            ) : null}

            {error && (
              <div role="alert" className="mb-3 flex items-start gap-3 rounded-xl border-l-4 border-[var(--error-500)] bg-[var(--error-100)] p-4 text-sm text-[var(--neutral-800)]">
                <XCircle className="h-5 w-5 shrink-0 text-[var(--error-500)]" aria-hidden="true" />
                {error}
              </div>
            )}

            {loading && rows.length === 0 ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading selected applicants">
                {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-[var(--neutral-200)] bg-white" />)}
              </div>
            ) : loadError && rows.length === 0 ? null : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--neutral-200)] bg-white py-16 text-center">
                <KeyRound className="mb-3 h-8 w-8 text-[var(--neutral-400)]" aria-hidden="true" />
                <p className="text-base font-semibold text-[var(--color-primary-900)]">No one is waiting for contract signing</p>
                <p className="mt-1 text-sm text-[var(--neutral-600)]">Select an applicant on the For Hiring tab. They appear here until they sign.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((dept) => {
                  const deptIds = dept.positions.flatMap((p) => p.applicants.map((a) => a.id));
                  const deptSelected = deptIds.filter((id) => selected.has(id)).length;
                  return (
                    <section key={dept.department} className="overflow-hidden rounded-xl border border-[var(--neutral-200)] bg-white" aria-label={dept.department}>
                      <div className="flex items-center gap-3 border-b border-[var(--neutral-200)] px-4 py-3">
                        <GroupCheckbox
                          state={groupCheckState(deptIds, selected)}
                          label={`Select everyone in ${dept.department}`}
                          onChange={() => setSelected(toggleGroup(deptIds, selected))}
                        />
                        <h3 className="flex-1 text-sm font-semibold text-[var(--color-primary-900)]">{dept.department}</h3>
                        <span className={`badge ${deptSelected > 0 ? 'badge-tint' : 'badge-neutral'}`}>
                          {deptSelected} of {deptIds.length} selected
                        </span>
                      </div>
                      {dept.positions.map((position) => (
                        <div key={position.key} className="border-b border-[var(--neutral-200)] last:border-0">
                          <p className="px-4 pb-1 pt-2.5 text-xs font-semibold uppercase tracking-[0.4px] text-[var(--neutral-600)]">
                            {position.position}
                          </p>
                          {position.applicants.map((row) => {
                            const overdue = Boolean(row.signingDeadline && isPastDate(row.signingDeadline, today));
                            return (
                              <div
                                key={row.id}
                                className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${selected.has(row.id) ? 'bg-[var(--color-primary-50)]' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${row.fullName}`}
                                  checked={selected.has(row.id)}
                                  onChange={() => setSelected(toggleId(row.id, selected))}
                                  className={CHECKBOX_CLASS}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-[var(--color-primary-900)]" title={row.fullName}>{row.fullName}</p>
                                  <p className="text-xs text-[var(--neutral-600)]">
                                    {[
                                      row.referenceNo,
                                      row.applicationType === 'promotion' ? row.employeeNumber : null,
                                      `Report by ${formatDisplayDate(row.signingDeadline)}`,
                                    ].filter(Boolean).join(' · ')}
                                  </p>
                                </div>
                                {row.applicationType === 'promotion' && <PromotionChip />}
                                {/* §10: waiting = Warning, missed date = Error */}
                                {overdue ? (
                                  <span className="badge badge-error"><span className="badge-dot" aria-hidden="true" />Deadline passed</span>
                                ) : (
                                  <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />Awaiting signing</span>
                                )}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-secondary !border-[var(--error-500)] !text-[var(--error-700)] hover:!bg-[var(--error-100)]"
                                  onClick={() => setRevokeTarget(row)}
                                >
                                  <UserX className="h-4 w-4" aria-hidden="true" />
                                  Did not report
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Generate: confirm (§9.10) */}
      <ConfirmModal
        open={confirmGenerate}
        title={selectedPromotionCount > 0
          ? `Complete ${plural(selected.size, 'appointment')}?`
          : `Generate credentials for ${plural(selected.size, 'applicant')}?`}
        confirmLabel="Generate"
        loading={generating}
        onCancel={() => setConfirmGenerate(false)}
        onConfirm={() => { void handleGenerate(); }}
        message={(
          <p className="!mb-0">
            {selectedPromotionCount > 0 && (
              <>
                <b>{plural(selectedCredentialCount, 'credential')}, {plural(selectedPromotionCount, 'promotion')}.</b>{' '}
                Promotions keep the employee&apos;s existing account, so no credentials are generated for them.{' '}
              </>
            )}
            Each one is hired and their plantilla is marked filled. Everyone else who applied to those plantillas moves to
            Archives as Not Selected, and their status tracker shows the regret letter.
          </p>
        )}
      >
        <ul className="max-h-48 divide-y divide-[var(--neutral-200)] overflow-y-auto rounded-xl border border-[var(--neutral-200)] text-sm">
          {selectedRows.map((r) => (
            <li key={r.id} className="px-3 py-2">
              <p className="flex items-center gap-2 font-semibold text-[var(--color-primary-900)]">
                {r.fullName}
                {r.applicationType === 'promotion' && <PromotionChip />}
              </p>
              <p className="text-xs text-[var(--neutral-600)]">{r.positionLabel} · {r.department}</p>
            </li>
          ))}
        </ul>
      </ConfirmModal>

      {/* Did not report: destructive confirm (§9.1, §9.10) */}
      <ConfirmModal
        open={Boolean(revokeTarget)}
        title={revokeTarget ? `Revoke ${revokeTarget.fullName}'s selection?` : ''}
        tone="destructive"
        confirmLabel="Revoke Selection"
        loading={revoking}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={() => { void handleRevoke(); }}
        message={revokeTarget && (
          <p className="!mb-0">
            They did not report by {formatDisplayDate(revokeTarget.signingDeadline)}. {revokeTarget.positionLabel} reopens, and you
            can select another applicant on the For Hiring tab. Their application goes back to the For Hiring list.
          </p>
        )}
      />

      {/* Result: credentials + print (option A cut-out cards). Not dismissible:
          the temporary passwords are shown once, so closing is an explicit Done. */}
      <Modal
        open={credentials.length > 0 || promotions.length > 0 || failures.length > 0}
        onClose={closeResults}
        dismissible={false}
        size="lg"
        icon={nothingCompleted ? <XCircle strokeWidth={1.75} /> : <CheckCircle strokeWidth={1.75} />}
        title={resultTitle}
        subtitle={resultSubtitle}
        footer={(
          <>
            {!nothingCompleted && (
              <button
                type="button"
                className="btn btn-md btn-secondary"
                disabled={credentials.length === 0}
                title={credentials.length === 0 && promotions.length > 0 ? 'Promotions have no credentials to print.' : undefined}
                onClick={() => {
                  if (!printCredentialCards(credentials)) {
                    feedback.warning("The print window didn't open.", "Your browser blocked it. Allow pop-ups for this site, then click Print Credentials again.");
                  }
                }}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print Credentials
              </button>
            )}
            <button type="button" className="btn btn-md btn-primary" onClick={closeResults}>
              Done
            </button>
          </>
        )}
      >
        {failures.length > 0 && (
          <div role="alert" className="mb-4 rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-3 text-sm text-[var(--neutral-800)]">
            <p className="font-semibold">Some steps need attention:</p>
            <ul className="mt-1 list-disc pl-5">{failures.map((f) => <li key={f}>{f}</li>)}</ul>
          </div>
        )}
        {credentials.length > 0 && promotions.length > 0 && (
          <h3 className="mb-2 text-base font-semibold text-[var(--color-primary-900)]">New employee credentials</h3>
        )}
        {credentials.length > 0 && (
        <div className="abyan-table-wrap">
          <table className="abyan-table w-full">
            <thead>
              <tr className="border-b border-[var(--neutral-200)] text-left text-[13px] font-semibold text-[var(--color-primary-900)]">
                <th scope="col" className="pb-2">Name</th>
                <th scope="col" className="pb-2">Position / Office</th>
                <th scope="col" className="pb-2">Employee ID</th>
                <th scope="col" className="pb-2">Temporary Password</th>
                <th scope="col" className="pb-2">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--neutral-200)]">
              {credentials.map((c) => (
                <tr key={c.employeeId}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-[var(--color-primary-900)]">{c.fullName}</p>
                    <p className="text-xs text-[var(--neutral-600)]">{c.email || '—'}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <p>{c.position || '—'}{c.plantilla ? ` · ${c.plantilla}` : ''}</p>
                    <p className="text-xs text-[var(--neutral-600)]">{c.department || '—'}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono font-semibold text-[var(--color-primary-900)]">{c.employeeId}</td>
                  <td className="py-3 pr-4 font-mono">{c.tempPassword}</td>
                  <td className="py-3">
                    {!c.email ? (
                      <span className="text-xs text-[var(--neutral-600)]">No email</span>
                    ) : c.emailSent ? (
                      <span className="badge badge-success"><span className="badge-dot" aria-hidden="true" />Sent</span>
                    ) : (
                      <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />Not sent</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        {credentials.length > 0 && (
          <p className="mt-4 text-xs text-[var(--neutral-600)]">
            Employees must change their temporary password at first login. Keep this list confidential.
          </p>
        )}
        {promotions.length > 0 && (
          <div className={credentials.length > 0 ? 'mt-6' : undefined}>
            {credentials.length > 0 && (
              <h3 className="mb-2 text-base font-semibold text-[var(--color-primary-900)]">Promotions</h3>
            )}
            <div className="abyan-table-wrap">
              <table className="abyan-table w-full">
                <thead>
                  <tr className="border-b border-[var(--neutral-200)] text-left text-[13px] font-semibold text-[var(--color-primary-900)]">
                    <th scope="col" className="pb-2">Name</th>
                    <th scope="col" className="pb-2">Position / Office</th>
                    <th scope="col" className="pb-2">Employee ID</th>
                    <th scope="col" className="pb-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--neutral-200)]">
                  {promotions.map((p) => (
                    <tr key={p.applicantId}>
                      <td className="py-3 pr-4 font-semibold text-[var(--color-primary-900)]">{p.fullName}</td>
                      <td className="py-3 pr-4">
                        <p>{p.position || '—'}{p.plantilla ? ` · ${p.plantilla}` : ''}</p>
                        <p className="text-xs text-[var(--neutral-600)]">{p.department || '—'}</p>
                      </td>
                      <td className="py-3 pr-4 font-mono font-semibold text-[var(--color-primary-900)]">{p.employeeNumber}</td>
                      <td className="py-3 text-[var(--neutral-800)]">{PROMOTION_RESULT_COPY}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
