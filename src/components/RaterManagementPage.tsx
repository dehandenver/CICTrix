import {
  CheckCircle2,
  Plus,
  UserPlus,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { mockDatabase } from '../lib/mockDatabase';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import {
  listRaterCandidates,
  matchRaterAccount,
  matchRaterAccountByName,
  notifyRaterAdded,
  type RaterCandidate,
} from '../lib/api/raterAccounts';
import { RaterManagementNavigationGuide } from './RaterManagementNavigationGuide';
import { AdminHeader } from './AdminHeader';
import { Sidebar } from './Sidebar';
import { ConfirmModal } from './modal';
import { TableStateRows } from './data-table';
import { useFeedback } from './action-feedback';
import { describeActionFailure, failureText } from '../lib/friendlyErrors';

type RaterStatus = 'Active' | 'Inactive';
type ClientSource = 'preferred' | 'fallback';

interface ProfileAccountRow {
  userId: string;
  email: string;
  name: string;
  role: string;
}

interface RaterSourceRow {
  id: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  assignedPositions: string[];
  lastLogin: string;
  status: RaterStatus;
  source: ClientSource;
}

const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const getPreferredClient = () => {
  const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
  return preferredMode === 'local' ? (mockDatabase as any) : supabase;
};

const getFallbackClient = () => {
  const preferredMode = isMockModeEnabled ? 'local' : getPreferredDataSourceMode();
  return preferredMode === 'local' ? supabase : (mockDatabase as any);
};

const getAccessClient = () => {
  return isMockModeEnabled ? (mockDatabase as any) : supabase;
};

const normalizeEmailKey = (email: string) => String(email ?? '').trim().toLowerCase();

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const saveRaterAccessState = (email: string, isActive: boolean) => {
  try {
    const normalizedEmail = normalizeEmailKey(email);
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = current && typeof current === 'object' ? { ...current } : {};
    next[normalizedEmail] = isActive;
    localStorage.setItem(RATER_ACCESS_STATE_KEY, JSON.stringify(next));
  } catch { /* localStorage unavailable (private mode or quota); persisting here is best-effort. */ }
};

const toInitials = (name: string) => {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '--';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
};

const formatLastLogin = (value: unknown) => {
  if (!value) return 'N/A';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

/**
 * The busy marker for this page's buttons (§9.1). Tailwind here rather than
 * .btn.is-loading, because these buttons are plain Tailwind like the rest of
 * the page; converting them to the .btn system is its own change.
 */
const Spinner = () => (
  <span
    aria-hidden
    className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:opacity-60"
  />
);

const statusBadge = (status: RaterStatus) => {
  if (status === 'Active') {
    return (
      <div className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
        Active
      </div>
    );
  }

  return (
    <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700">
      <XCircle className="mr-1 h-3.5 w-3.5" />
      Inactive
    </div>
  );
};

const runRaterEmailUpdate = async (
  client: any,
  updates: Record<string, unknown>,
  email: string,
  anchorId?: string
) => {
  const normalizedEmail = normalizeEmailKey(email);
  const { data, error } = await client.from('raters').select('id,email');
  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const matchedIds = rows
    .filter((row: any) => normalizeEmailKey(String(row?.email ?? '')) === normalizedEmail)
    .map((row: any) => String(row?.id ?? '').trim())
    .filter(Boolean);

  const normalizedAnchorId = String(anchorId ?? '').trim();
  if (normalizedAnchorId && !matchedIds.includes(normalizedAnchorId)) {
    matchedIds.push(normalizedAnchorId);
  }

  if (matchedIds.length === 0) {
    throw new Error('No matching rater account found for update.');
  }

  const updateResults = await Promise.all(
    matchedIds.map((id) => client.from('raters').update(updates).eq('id', id))
  );

  const allFailed = updateResults.every((result: any) => Boolean(result?.error));
  if (allFailed) {
    throw new Error('Failed to persist rater access update.');
  }
};

const verifyRaterAccessState = async (client: any, email: string, expectedIsActive: boolean) => {
  const normalizedEmail = normalizeEmailKey(email);
  const { data, error } = await client.from('raters').select('id,email,is_active');
  if (error) {
    throw error;
  }

  const rows = (Array.isArray(data) ? data : []).filter(
    (row: any) => normalizeEmailKey(String(row?.email ?? '')) === normalizedEmail
  );

  if (rows.length === 0) {
    throw new Error('No matching rater account found after update.');
  }

  const mismatch = rows.some((row: any) => Boolean(row?.is_active) !== expectedIsActive);
  if (mismatch) {
    throw new Error('Rater access update did not persist for all matching rows.');
  }
};

const getClientEntries = () => {
  const preferredClient = getPreferredClient();
  const fallbackClient = getFallbackClient();
  const entries: Array<{ source: ClientSource; client: any }> = [{ source: 'preferred', client: preferredClient }];

  if (fallbackClient !== preferredClient) {
    entries.push({ source: 'fallback', client: fallbackClient });
  }

  return entries;
};

export const RaterManagementPage = () => {
  const [ratersData, setRatersData] = useState<RaterSourceRow[]>([]);
  // First load only; focus and storage-event refetches stay silent.
  const [initialLoad, setInitialLoad] = useState(true);
  const ratersLoad = useTableLoading(initialLoad, ratersData.length > 0);
  const [, setProfileAccounts] = useState<ProfileAccountRow[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');
  // The rater list failed to load; never shown as "No raters found".
  const [loadError, setLoadError] = useState<unknown>(null);
  const feedback = useFeedback();
  const [adding, setAdding] = useState(false);
  /** Active employees, for the suggestions and the account check. */
  const [candidates, setCandidates] = useState<RaterCandidate[]>([]);
  const [toast, setToast] = useState('');
  /** Email of the rater whose access change is in flight, for the button label. */
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  /** The rater the "Are you sure?" dialog is open for. */
  const [pendingRemoval, setPendingRemoval] = useState<RaterSourceRow | null>(null);
  /**
   * A removal waiting out its undo window. The row is already hidden, but
   * nothing has been deleted yet — see scheduleRemoval.
   */
  const [undoRemoval, setUndoRemoval] = useState<{ rater: RaterSourceRow; secondsLeft: number } | null>(null);
  const removalTimer = useRef<number | null>(null);

  const loadRaters = async () => {
    // Assignments come from Supabase raters.assigned_positions only.
    // No localStorage cache — see the project-wide "Supabase only" rule.

    try {
      const responses = await Promise.all(
        getClientEntries().map(async ({ source, client }) => {
          const response = await client
            .from('raters')
            .select('*')
            .order('created_at', { ascending: false });

          return {
            source,
            error: (response as any)?.error ?? null,
            rows: Array.isArray((response as any)?.data) ? (response as any).data : [],
          };
        })
      );
      // The preferred source is the one this page writes to; if it can't be
      // read, the list would be a guess.
      const preferredResponse = responses.find((r) => r.source === 'preferred') ?? responses[0];
      if (preferredResponse?.error) throw preferredResponse.error;

      if (!isMockModeEnabled) {
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id,email,role,name');

        if (!profilesError) {
          const normalizedProfiles = (Array.isArray(profilesData) ? profilesData : [])
            .filter((row: any) => String(row?.email ?? '').trim())
            .filter((row: any) => {
              const normalizedRole = String(row?.role ?? '').trim().toLowerCase();
              // Accept common role variants seen across schemas.
              return (
                normalizedRole.includes('interviewer') ||
                normalizedRole.includes('rater') ||
                normalizedRole === 'interview' ||
                normalizedRole === 'rate'
              );
            })
            .map((row: any) => ({
              userId: String(row?.user_id ?? ''),
              email: String(row?.email ?? '').trim(),
              name: String(row?.name ?? row?.email ?? 'Interviewer').trim(),
              role: String(row?.role ?? 'INTERVIEWER').trim(),
            }));

          setProfileAccounts(normalizedProfiles);
        } else {
          setProfileAccounts([]);
        }
      } else {
        setProfileAccounts([]);
      }

      const merged = new Map<string, RaterSourceRow>();

      responses.forEach(({ source, rows }) => {
        rows.forEach((row: any) => {
          const email = String(row?.email ?? '').trim();
          const emailKey = normalizeEmailKey(email);
          const mapKey = emailKey || `id:${String(row?.id ?? crypto.randomUUID())}`;
          // Only real job-title strings belong here. Department names and the
          // sentinel 'Unassigned' must not pollute this list — they were silently
          // poisoning the interviewer's filter (no job title matches 'Unassigned'
          // so ALL jobs vanished from the interviewer dashboard after assignment).
          const assignedPositions = uniqueStrings(
            Array.isArray(row?.assigned_positions)
              ? row.assigned_positions
                  .filter((value: unknown): value is string => typeof value === 'string')
                  .filter((value: string) => {
                    // Strip leftover RLS test sentinels that were never real positions.
                    const normalized = value.trim().toLowerCase();
                    return normalized !== 'rls_test' && normalized !== 'rls test';
                  })
              : [],
          );

          const nextRow: RaterSourceRow = {
            id: String(row?.id ?? crypto.randomUUID()),
            name: String(row?.name ?? 'Unknown Rater'),
            email,
            designation: String(row?.designation ?? row?.department ?? 'Rater'),
            department: String(row?.department ?? 'Unassigned'),
            assignedPositions,
            lastLogin: formatLastLogin(row?.last_login ?? row?.updated_at),
            status: row?.is_active ? 'Active' : 'Inactive',
            source,
          };

          const existing = merged.get(mapKey);
          if (!existing) {
            merged.set(mapKey, nextRow);
            return;
          }

          merged.set(mapKey, {
            ...existing,
            ...(existing.source === 'preferred' ? {} : nextRow),
            assignedPositions: uniqueStrings([...existing.assignedPositions, ...nextRow.assignedPositions]),
          });
        });
      });

      setRatersData(
        Array.from(merged.values()).sort((left, right) => left.name.localeCompare(right.name))
      );
      setLoadError(null);
    } catch (error) {
      console.error('[RaterManagementPage] raters failed to load:', error);
      setLoadError(error);
    } finally {
      setInitialLoad(false);
    }
  };

  useEffect(() => {
    void loadRaters();

    const syncRaters = () => {
      void loadRaters();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadRaters();
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === 'cictrix_raters' ||
        event.key === 'cictrix_data_source_mode'
      ) {
        void loadRaters();
      }
    };

    window.addEventListener('focus', syncRaters);
    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('cictrix:route-activated', syncRaters as EventListener);

    return () => {
      window.removeEventListener('focus', syncRaters);
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('cictrix:route-activated', syncRaters as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /**
   * The table shows every rater except one waiting out its undo window. It is
   * hidden here rather than removed from ratersData, because loadRaters runs on
   * focus, visibility and route changes — mutating the list would let the row
   * reappear mid-countdown.
   */
  const filteredRaters = useMemo(
    () => (undoRemoval ? ratersData.filter((item) => item.id !== undoRemoval.rater.id) : ratersData),
    [ratersData, undoRemoval],
  );

  useEffect(() => {
    if (!showAddForm || candidates.length > 0) return;
    let cancelled = false;
    void listRaterCandidates().then((rows) => {
      if (!cancelled) setCandidates(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showAddForm, candidates.length]);

  /**
   * The employee this rater is, if any. An empty candidate list means the
   * employee read failed, so the panel says nothing rather than claiming the
   * account does not exist.
   */
  const matchedAccount = useMemo(
    () => matchRaterAccount(newEmail, candidates),
    [newEmail, candidates],
  );
  const accountCheckable = candidates.length > 0 && newEmail.trim().length > 0;

  const resetAddForm = () => {
    setNewName('');
    setNewEmail('');
    setAddError('');
  };

  /**
   * A rater is created with name, email and access only. Positions are not
   * asked for here: interviewerAccess derives them from the applicants actually
   * assigned to this interviewer in Pending Assignment.
   */
  const addRater = async () => {
    const trimmedName = newName.trim();
    const trimmedEmail = newEmail.trim().toLowerCase();
    if (!trimmedName) {
      setAddError('Name is required.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setAddError('A valid email is required.');
      return;
    }
    if (ratersData.some((rater) => normalizeEmailKey(rater.email) === normalizeEmailKey(trimmedEmail))) {
      setAddError('A rater with this email already exists.');
      return;
    }

    setAddError('');
    setAdding(true);
    try {
      const { error } = await (supabase as any)
        .from('raters')
        .insert({ name: trimmedName, email: trimmedEmail, is_active: true });
      if (error) {
        console.error('[RaterManagementPage] add failed', error);
        setAddError(failureText('add the rater', error));
        return;
      }
      await loadRaters();
      // Lets the assignment dropdown pick up a freshly added active rater.
      window.dispatchEvent(new CustomEvent('cictrix:raters-updated'));

      // Best-effort: the rater exists by now, so a failed notification must not
      // read as a failed add. An unmatched rater has no inbox to write to.
      const account = matchRaterAccount(trimmedEmail, candidates);
      const notified = account ? await notifyRaterAdded(account) : false;

      resetAddForm();
      setShowAddForm(false);
      setToast(notified ? `${trimmedName} added and notified.` : `${trimmedName} added.`);
    } catch (err) {
      console.error('[RaterManagementPage] add threw', err);
      setAddError(failureText('add the rater', err));
    } finally {
      setAdding(false);
    }
  };

  /**
   * Remove a rater, with ten seconds to take it back.
   *
   * Nothing is deleted until the window closes: the row is hidden locally and
   * the delete runs on the timer. Deleting first and re-inserting on undo would
   * mean a failed re-insert loses the rater for good, and the restored row
   * would carry a new id. Not deleting is recoverable; deleting wrongly is not.
   *
   * The cost of that choice: leaving the page inside the window cancels the
   * removal, and the rater is still there on return.
   */
  const UNDO_SECONDS = 10;

  const finalizeRemoval = async (rater: RaterSourceRow) => {
    try {
      const client = getAccessClient();
      const { error } = await client.from('raters').delete().eq('id', rater.id);
      if (error) throw error;
      window.dispatchEvent(new CustomEvent('cictrix:raters-updated'));
      setToast(`${rater.name} removed.`);
    } catch (err) {
      console.error('[RaterManagementPage] remove failed', err);
      const failure = describeActionFailure(`remove ${rater.name}`, err);
      feedback.error(failure.title, `${rater.name} is still a rater. ${failure.nextStep}`);
    } finally {
      await loadRaters();
    }
  };

  const scheduleRemoval = (rater: RaterSourceRow) => {
    // One pending removal at a time: a second one commits the first, so an
    // earlier rater cannot be silently kept by starting another removal.
    if (removalTimer.current !== null) {
      window.clearInterval(removalTimer.current);
      removalTimer.current = null;
      if (undoRemoval) void finalizeRemoval(undoRemoval.rater);
    }

    setUndoRemoval({ rater, secondsLeft: UNDO_SECONDS });

    removalTimer.current = window.setInterval(() => {
      setUndoRemoval((current) => {
        if (!current) return null;
        if (current.secondsLeft > 1) return { ...current, secondsLeft: current.secondsLeft - 1 };
        if (removalTimer.current !== null) {
          window.clearInterval(removalTimer.current);
          removalTimer.current = null;
        }
        void finalizeRemoval(current.rater);
        return null;
      });
    }, 1000);
  };

  const undoScheduledRemoval = () => {
    if (removalTimer.current !== null) {
      window.clearInterval(removalTimer.current);
      removalTimer.current = null;
    }
    const restored = undoRemoval?.rater;
    setUndoRemoval(null);
    if (restored) setToast(`${restored.name} kept.`);
  };

  // Leaving the page cancels a pending removal rather than committing it.
  useEffect(() => () => {
    if (removalTimer.current !== null) window.clearInterval(removalTimer.current);
  }, []);

  const handleToggleRaterAccess = async (rater: RaterSourceRow) => {
    const nextIsActive = rater.status !== 'Active';
    const previousRows = ratersData;
    setTogglingEmail(rater.email);
    setRatersData((current) =>
      current.map((item) =>
        normalizeEmailKey(item.email) === normalizeEmailKey(rater.email)
          ? { ...item, status: nextIsActive ? 'Active' : 'Inactive' }
          : item
      )
    );

    try {
      const accessClient = getAccessClient();
      await runRaterEmailUpdate(accessClient, { is_active: nextIsActive }, rater.email, rater.id);
      await verifyRaterAccessState(accessClient, rater.email, nextIsActive);
      saveRaterAccessState(rater.email, nextIsActive);
      setToast(nextIsActive ? 'Interviewer access granted.' : 'Interviewer access revoked.');
      await loadRaters();
    } catch (error) {
      setRatersData(previousRows);
      const failure = describeActionFailure("update this interviewer's access", error);
      feedback.error(failure.title, `${rater.name}'s access is unchanged. ${failure.nextStep}`);
      await loadRaters();
    } finally {
      setTogglingEmail(null);
    }
  };


  return (
    <div className="rsp-ds min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-slate-50 !p-0">
        <div className="sticky top-14 z-30 sm:top-16 border-b border-slate-200 bg-white px-8 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="!mb-1 !text-2xl font-bold">Rater Management</h1>
            <p className="!mb-0 text-base text-slate-500">Assign raters and define their evaluation access for specific job positions.</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            onClick={() => setShowGuide(true)}
          >
            How to Navigate
          </button>
        </div>
        <div className="p-6 md:p-8">

          <div className="mb-6 flex items-center">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              onClick={() => {
                if (showAddForm) {
                  setShowAddForm(false);
                  resetAddForm();
                } else {
                  setShowAddForm(true);
                }
              }}
            >
              {showAddForm ? (
                <>
                  <X className="h-4 w-4" /> Cancel
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Add New Rater
                </>
              )}
            </button>
          </div>

          {showAddForm && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-blue-700" />
                <p className="!mb-0 text-sm font-semibold text-slate-900">Add a new rater</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    list="rater-name-options"
                    value={newName}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNewName(value);
                      // Picking a suggestion fills the other field, so the admin
                      // types one thing and gets a matched account.
                      const picked = matchRaterAccountByName(value, candidates);
                      if (picked && !newEmail.trim()) setNewEmail(picked.email);
                    }}
                    placeholder="e.g. Melchor U. Tan"
                    className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  />
                  <datalist id="rater-name-options">
                    {candidates.map((employee) => (
                      <option key={`name-${employee.id}`} value={employee.name}>
                        {employee.position || employee.department}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    list="rater-email-options"
                    value={newEmail}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNewEmail(value);
                      const picked = matchRaterAccount(value, candidates);
                      if (picked && !newName.trim()) setNewName(picked.name);
                    }}
                    placeholder="e.g. interviewer@cictrix.gov.ph"
                    className="w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
                  />
                  <datalist id="rater-email-options">
                    {candidates.map((employee) => (
                      <option key={`email-${employee.id}`} value={employee.email}>
                        {employee.name}
                      </option>
                    ))}
                  </datalist>
                  {accountCheckable && matchedAccount && (
                    <p className="!mb-0 mt-1.5 text-xs font-medium text-green-700">
                      Account found: {matchedAccount.name}
                      {matchedAccount.position ? ` · ${matchedAccount.position}` : ''}
                      {matchedAccount.department ? ` · ${matchedAccount.department}` : ''}
                    </p>
                  )}
                  {accountCheckable && !matchedAccount && (
                    <p className="!mb-0 mt-1.5 text-xs font-medium text-rose-600">
                      Account not found. This rater has no employee account and won't be notified.
                    </p>
                  )}
                </div>
              </div>

              {addError && <p className="!mb-0 mt-2 text-xs font-medium text-rose-600">{addError}</p>}

              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    resetAddForm();
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void addRater()}
                  disabled={adding}
                  aria-busy={adding || undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 ${adding ? 'cursor-progress opacity-70' : ''}`}
                >
                  {adding ? <Spinner /> : <UserPlus className="h-3.5 w-3.5" />}
                  Add Rater
                </button>
              </div>
            </div>
          )}

          <div className="abyan-table-wrap">
            <table className="abyan-table w-full text-left">
              <thead className="border-b border-gray-200 bg-white">
                <tr>
                  {/* Rater Name takes the slack; the other two hug their
                      content, so Status and the access button sit together at
                      the right instead of stranded mid-table. */}
                  <th className="w-full px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Rater Name</th>
                  <th className="whitespace-nowrap px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="whitespace-nowrap px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-gray-100 ${tableBodyClass(false)}`}>
                {ratersLoad.initialLoading && (
                  <TableSkeletonRows show={ratersLoad.showSkeleton}
                    columns={['two-line', 'badge', 'button']} label="Loading raters…" />
                )}
                {!ratersLoad.initialLoading && filteredRaters.map((rater) => (
                  <tr
                    key={`${rater.source}-${rater.id}-${rater.email}`}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div className="mr-3 flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-sm font-bold text-blue-600">
                          {toInitials(rater.name)}
                        </div>
                        <div>
                          <span className="block text-sm font-semibold text-gray-900">{rater.name}</span>
                          <span className="block text-xs text-gray-500">{rater.email || 'No email'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">{statusBadge(rater.status)}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Labelled rather than a bare tick or cross. This
                            control grants or removes access to the interviewer
                            portal, and an unlabelled icon leaves the admin to
                            infer which way round it is. Carried over from the
                            Qualified Applicants subtab this page replaces. */}
                        {(() => {
                          const isPending = togglingEmail === rater.email;
                          const isActive = rater.status === 'Active';
                          return (
                            <button
                              type="button"
                              onClick={() => void handleToggleRaterAccess(rater)}
                              disabled={isPending}
                              aria-busy={isPending || undefined}
                              aria-label={`${isActive ? 'Revoke' : 'Grant'} access for ${rater.name}`}
                              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                isActive
                                  ? 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800'
                                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                              } ${isPending ? 'cursor-progress opacity-70' : ''}`}
                            >
                              {isPending ? <Spinner /> : isActive ? (
                                <ShieldOff className="h-3.5 w-3.5" />
                              ) : (
                                <ShieldCheck className="h-3.5 w-3.5" />
                              )}
                              {isActive ? 'Revoke Access' : 'Grant Access'}
                            </button>
                          );
                        })()}
                        <button
                          type="button"
                          onClick={() => setPendingRemoval(rater)}
                          aria-label={`Remove ${rater.name}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border-[1.5px] border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 active:bg-rose-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!ratersLoad.initialLoading && filteredRaters.length === 0 && (
                  <TableStateRows
                    view={loadError && ratersData.length === 0 ? 'error' : 'empty'}
                    columns={3}
                    error={loadError}
                    errorAction="load the raters"
                    onRetry={() => void loadRaters()}
                    emptyTitle="No raters found"
                    emptyMessage="Add a rater above, or clear the search."
                  />
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <RaterManagementNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {/* Are you sure? (§9.10, destructive) */}
      <ConfirmModal
        open={Boolean(pendingRemoval)}
        icon={<Trash2 strokeWidth={1.75} />}
        title="Are you sure?"
        tone="destructive"
        confirmLabel="Remove"
        message={pendingRemoval && (
          <p className="!mb-0">
            Remove <span className="font-semibold text-slate-900">{pendingRemoval.name}</span> from the rater
            list. You will have {UNDO_SECONDS} seconds to undo this.
          </p>
        )}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => { const target = pendingRemoval; setPendingRemoval(null); if (target) scheduleRemoval(target); }}
      />

      {/* Undo window. It counts down so the ten seconds are visible rather
          than something the admin has to race. */}
      {undoRemoval && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[1200] flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {/* Colour set on the span itself: globals.css colours every <span>
              directly, so it would not inherit the toast's white (§17 item 8). */}
          <span style={{ color: '#FFFFFF' }}>
            {undoRemoval.rater.name} removed · {undoRemoval.secondsLeft}s
          </span>
          <button
            type="button"
            onClick={undoScheduledRemoval}
            style={{ color: '#FFFFFF' }}
            className="rounded-full border border-white/40 px-3 py-1 text-xs font-semibold transition hover:bg-white/15"
          >
            Undo
          </button>
        </div>
      )}

      {toast && !undoRemoval && (
        <div role="status" className="fixed bottom-6 right-6 z-[1200] rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
    </div>
  );
};
