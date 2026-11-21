/**
 * Super Admin → Salary Grades.
 *
 * The official CSC salary schedule, SG 1–33. Step 1 is the hiring rate every
 * job post uses; steps 2–8 are the rest of the schedule.
 *
 * Editing a Step 1 amount rewrites the salary on every job post and plantilla
 * item at that grade, including published ones (decision D1 of the salary
 * grade table plan). So the table is read-only, and each grade is edited in a
 * side drawer that shows how many postings a Step 1 change will rewrite next
 * to the Save button. A mistyped digit can no longer save itself on blur.
 *
 * Layout: Option A of docs/mockups/2026-10-15-salary-grades-drawer.html, plan
 * docs/plans/2026-10-15-salary-grades-drawer.md. DESIGN_IDENTITY.md §9.1,
 * §9.3–9.6, §9.10.
 */

import { failureText } from '../lib/friendlyErrors';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Pencil, Search, Wallet, X } from 'lucide-react';
import { supabase as supabaseClient } from '../lib/supabase';
import { useBackClosesView } from '../hooks/useHistoryBack';
import { AdminHeader } from './AdminHeader';
import { Sidebar } from './Sidebar';
import { SkeletonList, useDelayedLoading } from './table-loading';
import '../styles/admin.css';
import {
  HIRING_STEP,
  MAX_STEP,
  addSalaryStep,
  deleteSalaryStep,
  formatSalary,
  listSalaryGrades,
  updateSalaryStep,
  type SalaryGradeRow,
} from '../lib/api/salaryGrades';

const supabase = supabaseClient as any;

const STEPS = Array.from({ length: MAX_STEP }, (_, i) => i + 1);

/** Grades shown per page of the schedule table. */
const PAGE_SIZE = 10;

/** How long a success or error message stays up, in ms. */
const TOAST_MS = 5000;

/** Draft amounts in the drawer, keyed by step, as typed. */
type Draft = Record<number, string>;

/** One write the drawer's Save will make. */
type Change =
  | { kind: 'update'; step: number; amount: number }
  | { kind: 'add'; step: number; amount: number }
  | { kind: 'delete'; step: number };

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
};

const stepOf = (row: SalaryGradeRow, step: number) => row.steps.find((s) => s.step === step);

const draftFor = (row: SalaryGradeRow): Draft =>
  Object.fromEntries(STEPS.map((n) => [n, stepOf(row, n) ? String(stepOf(row, n)!.monthlySalary) : '']));

/**
 * Compare the draft with the stored schedule.
 *
 * An empty Step 2–8 field removes that step and an empty Step 1 is an error,
 * because every job post at the grade reads its salary from Step 1.
 */
function diffDraft(row: SalaryGradeRow, draft: Draft): { changes: Change[]; errors: Record<number, string> } {
  const changes: Change[] = [];
  const errors: Record<number, string> = {};
  for (const n of STEPS) {
    const current = stepOf(row, n)?.monthlySalary;
    const raw = (draft[n] ?? '').trim();
    if (raw === '') {
      if (n === HIRING_STEP) errors[n] = 'Step 1 is required. Job posts read their salary from it.';
      else if (current != null) changes.push({ kind: 'delete', step: n });
      continue;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors[n] = 'Enter an amount greater than zero.';
      continue;
    }
    if (current == null) changes.push({ kind: 'add', step: n, amount });
    else if (amount !== current) changes.push({ kind: 'update', step: n, amount });
  }
  return { changes, errors };
}

export const SalaryGradesPage = () => {
  const [rows, setRows] = useState<SalaryGradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useDelayedLoading(loading);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  /** Grade open in the drawer. Kept as a number so a reload refreshes its row. */
  const [editingGrade, setEditingGrade] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await listSalaryGrades();
    if (res.ok === false) {
      setError(failureText('load the salary schedule', res.error, { mode: 'load' }));
      setLoading(false);
      return;
    }
    setRows(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flash = (tone: 'ok' | 'err', text: string) => {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), TOAST_MS);
  };

  const filtered = useMemo(() => {
    const digits = query.replace(/\D/g, '');
    if (!digits) return rows;
    return rows.filter((r) => String(r.salaryGrade).startsWith(digits));
  }, [rows, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped so a reload or a search that returns fewer rows never strands the view on an empty page.
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const editingRow = editingGrade == null ? null : rows.find((r) => r.salaryGrade === editingGrade) ?? null;

  return (
    <div className="min-h-screen bg-[#F1F5F9]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="abyan-ds space-y-5">
            <div className="flex items-center gap-2.5">
              <Wallet className="h-6 w-6 text-[var(--color-primary)]" />
              <div>
                <h2 className="!mb-0 text-2xl font-bold text-[var(--color-primary-900)]">Salary Grades</h2>
                <p className="!mb-0 text-sm text-[var(--neutral-600)]">
                  The official CSC salary schedule. Every salary in the system is read from here.
                </p>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] px-4 py-3 text-sm text-[var(--error-700)]">
                {error}
              </div>
            )}

            {toast && (
              <div
                role="status"
                className={`rounded-xl border px-4 py-3 text-sm ${
                  toast.tone === 'ok'
                    ? 'border-[var(--success-300)] bg-[var(--success-100)] text-[var(--success-700)]'
                    : 'border-[var(--error-300)] bg-[var(--error-100)] text-[var(--error-700)]'
                }`}
              >
                {toast.text}
              </div>
            )}

            {loading || showLoader ? (
              <div className="overflow-hidden rounded-xl border border-[var(--neutral-200)] bg-white" aria-busy="true">
                <SkeletonList show={showLoader} rows={8} label="Loading the salary schedule…" />
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-[var(--neutral-200)] bg-white px-5 py-6 text-sm text-[var(--neutral-600)]">
                <p className="!mb-1 font-semibold text-[var(--neutral-800)]">No salary schedule loaded.</p>
                <p className="!mb-0">Run migration 20261013 to seed SG 1–33, then edit the amounts here.</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="relative">
                    <span className="sr-only">Find a salary grade</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neutral-400)]" />
                    <input
                      type="search"
                      inputMode="numeric"
                      value={query}
                      onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                      placeholder="Find SG…"
                      className="h-10 w-56 rounded-lg border border-[var(--neutral-200)] bg-white pl-9 pr-3 text-sm"
                    />
                  </label>
                  <p className="!mb-0 ml-auto inline-flex items-center gap-1.5 text-xs text-[var(--neutral-600)]">
                    <Info className="h-3.5 w-3.5" /> Step 1 is the hiring rate used by job posts.
                  </p>
                </div>

                <div className="abyan-table-wrap">
                  <table className="abyan-table w-full min-w-[960px]">
                    <thead>
                      <tr className="bg-[var(--bg-page)] text-[13px] font-semibold text-[var(--color-primary-900)]">
                        <th scope="col" className="px-4 py-2.5 text-left">SG</th>
                        {STEPS.map((n) => (
                          <th key={n} scope="col" className="whitespace-nowrap px-4 py-2.5 text-right">
                            Step {n}
                            {n === HIRING_STEP && <span className="badge badge-info ml-1.5 align-middle">Hiring</span>}
                          </th>
                        ))}
                        <th scope="col" className="px-4 py-2.5 text-left">Last updated</th>
                        <th scope="col" className="px-4 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={STEPS.length + 3} className="px-4 py-8 text-center text-[var(--neutral-600)]">
                            No grade matches "{query}". Grades run from SG 1 to SG 33.
                          </td>
                        </tr>
                      ) : (
                        pageRows.map((row) => (
                          <tr key={row.salaryGrade} className="border-t border-[var(--neutral-200)] hover:bg-[var(--bg-row-hover)]">
                            <th scope="row" className="px-4 py-3 text-left font-semibold text-[var(--color-primary-900)]">
                              SG {row.salaryGrade}
                            </th>
                            {STEPS.map((n) => {
                              const cell = stepOf(row, n);
                              return (
                                <td
                                  key={n}
                                  className={`whitespace-nowrap px-4 py-3 text-right tabular-nums ${
                                    n === HIRING_STEP
                                      ? 'bg-[var(--bg-row-hover)] font-semibold text-[var(--color-primary-900)]'
                                      : cell
                                        ? 'text-[var(--neutral-800)]'
                                        : 'text-[var(--neutral-500)]'
                                  }`}
                                >
                                  {cell ? formatSalary(cell.monthlySalary) : <span aria-label="Not set">—</span>}
                                </td>
                              );
                            })}
                            <td className="whitespace-nowrap px-4 py-3 text-[var(--neutral-600)]">{formatDate(row.lastUpdated)}</td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => setEditingGrade(row.salaryGrade)}
                                aria-label={`Edit SG ${row.salaryGrade}`}
                                className="btn btn-secondary btn-sm"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {pageCount > 1 && (
                    <nav
                      aria-label="Salary grade pages"
                      className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--neutral-200)] px-4 py-3"
                    >
                      <p className="!mb-0 text-xs text-[var(--neutral-600)]">
                        Showing {pageStart + 1}–{pageStart + pageRows.length} of {filtered.length} entries
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPage(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--neutral-200)] bg-white px-4 text-sm font-medium text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:border-[var(--neutral-200)] disabled:bg-[var(--bg-disabled)] disabled:text-[var(--neutral-400)]"
                        >
                          <ChevronLeft className="h-4 w-4" /> Previous
                        </button>
                        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setPage(n)}
                            aria-label={`Page ${n}`}
                            aria-current={n === currentPage ? 'page' : undefined}
                            className={`h-10 w-10 rounded-lg text-sm font-medium ${
                              n === currentPage
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'border border-[var(--neutral-200)] bg-white text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)]'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setPage(currentPage + 1)}
                          disabled={currentPage === pageCount}
                          className="inline-flex h-10 items-center gap-1 rounded-lg border border-[var(--neutral-200)] bg-white px-4 text-sm font-medium text-[var(--neutral-800)] hover:border-[var(--color-primary-200)] hover:bg-[var(--color-primary-50)] disabled:cursor-not-allowed disabled:border-[var(--neutral-200)] disabled:bg-[var(--bg-disabled)] disabled:text-[var(--neutral-400)]"
                        >
                          Next <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </nav>
                  )}
                </div>
              </>
            )}

            {editingRow && (
              <GradeDrawer
                row={editingRow}
                reload={load}
                onClose={() => setEditingGrade(null)}
                onSaved={(text) => { setEditingGrade(null); flash('ok', text); }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

interface GradeDrawerProps {
  row: SalaryGradeRow;
  reload: () => Promise<void>;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Side drawer editing every step of one grade. */
function GradeDrawer({ row, reload, onClose, onSaved }: GradeDrawerProps) {
  const grade = row.salaryGrade;
  const [draft, setDraft] = useState<Draft>(() => draftFor(row));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Postings a Step 1 change would rewrite; null while counting or if the count failed. */
  const [affected, setAffected] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => { if (!saving) onClose(); }, [saving, onClose]);
  useBackClosesView(true, onClose, 'salary-grade-drawer', { fromMount: true });

  // Focus the first field on open; hand focus back to the Edit button on close.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => openerRef.current?.focus?.();
  }, []);

  /**
   * Counted when the drawer opens, read-only, so the number describes the
   * database now rather than when the page loaded.
   */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [jobs, slots] = await Promise.all([
          supabase.from('job_postings').select('id', { count: 'exact', head: true }).eq('salary_grade', grade),
          supabase.from('plantilla_slots').select('id', { count: 'exact', head: true }).eq('salary_grade', grade),
        ]);
        if (live) setAffected((jobs.count ?? 0) + (slots.count ?? 0));
      } catch {
        // Left null: the warning then says the count is unavailable rather than
        // claiming zero, which would read as "this changes nothing".
      }
    })();
    return () => { live = false; };
  }, [grade]);

  const { changes, errors } = useMemo(() => diffDraft(row, draft), [row, draft]);
  const hiringChange = changes.find(
    (c): c is Extract<Change, { kind: 'update' }> => c.step === HIRING_STEP && c.kind === 'update',
  );
  const canSave = changes.length > 0 && Object.keys(errors).length === 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    for (const c of changes) {
      const res =
        c.kind === 'update'
          ? await updateSalaryStep(grade, c.step, c.amount)
          : c.kind === 'add'
            ? await addSalaryStep(grade, c.step, c.amount)
            : await deleteSalaryStep(grade, c.step);
      if (res.ok === false) {
        // Earlier steps may already be saved. Reload so the diff is recomputed
        // against what is actually stored, and say which step stopped it.
        // Earlier steps are saved; name the one that stopped it.
        setSaveError(`Step ${c.step} was not saved, so it and the steps after it are unchanged. ${failureText('save the salary step', res.error)}`);
        setSaving(false);
        await reload();
        return;
      }
    }
    await reload();
    setSaving(false);
    onSaved(`SG ${grade} saved.`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    // Keep Tab inside the drawer while it is open.
    const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[var(--overlay)]" onClick={close}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-drawer-title"
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-white shadow-[shadow:var(--shadow-3)] sm:max-w-[480px]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--neutral-200)] px-6 py-5">
          <div>
            <h3 id="grade-drawer-title" className="!mb-0 text-lg font-semibold text-[var(--color-primary-900)]">
              Edit SG {grade}
            </h3>
            <p className="!mb-0 text-xs text-[var(--neutral-600)]">Leave Steps 2–8 empty to remove them.</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[var(--neutral-600)] hover:bg-[var(--bg-page)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {STEPS.map((n) => {
            const id = `grade-${grade}-step-${n}`;
            return (
              <div key={n} className="border-b border-[var(--neutral-200)] py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor={id} className="text-sm font-medium text-[var(--neutral-800)]">
                    Step {n}
                    {n === HIRING_STEP && (
                      <>
                        <span className="text-[var(--error-500)]"> *</span>
                        <span className="badge badge-info ml-2">Hiring</span>
                      </>
                    )}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--neutral-600)]">₱</span>
                    <input
                      id={id}
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={draft[n]}
                      placeholder="Not set"
                      onChange={(e) => setDraft((d) => ({ ...d, [n]: e.target.value }))}
                      aria-invalid={errors[n] ? true : undefined}
                      aria-describedby={errors[n] ? `${id}-error` : undefined}
                      className={`h-10 w-40 rounded-lg border bg-white pl-7 pr-3 text-right text-sm tabular-nums ${
                        errors[n] ? 'border-[var(--error-500)]' : 'border-[var(--neutral-200)]'
                      }`}
                    />
                  </div>
                </div>
                {errors[n] && (
                  <p id={`${id}-error`} className="!mb-0 mt-1 text-right text-xs text-[var(--error-700)]">{errors[n]}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-[var(--neutral-200)] px-6 py-4">
          {hiringChange && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-[var(--warning-300)] bg-[var(--warning-100)] px-3 py-2.5 text-xs text-[var(--warning-700)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-500)]" />
              <p className="!mb-0">
                {affected === null
                  ? `Saving updates every job post and plantilla item at SG ${grade} to ${formatSalary(hiringChange.amount)}, including published ones. (The number of affected postings could not be counted.)`
                  : `Saving updates ${affected} job post${affected === 1 ? '' : 's'} and plantilla item${affected === 1 ? '' : 's'} at SG ${grade} to ${formatSalary(hiringChange.amount)}, including published ones.`}
              </p>
            </div>
          )}
          {saveError && (
            <p role="alert" className="!mb-3 rounded-xl border border-[var(--error-300)] bg-[var(--error-100)] px-3 py-2.5 text-xs text-[var(--error-700)]">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} disabled={saving} className="btn btn-secondary btn-md">
              Cancel
            </button>
            <button type="button" onClick={() => void save()} disabled={!canSave} className="btn btn-primary btn-md">
              {saving ? 'Saving…' : `Save SG ${grade}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SalaryGradesPage;
