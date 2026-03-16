import {
  CheckCircle2,
  Download,
  PenLine,
  Plus,
  Search,
  Shield,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPreferredDataSourceMode } from '../lib/dataSourceMode';
import { mockDatabase } from '../lib/mockDatabase';
import { getAuthoritativeJobPostings } from '../lib/recruitmentData';
import { isMockModeEnabled, supabase } from '../lib/supabase';
import { RaterManagementNavigationGuide } from './RaterManagementNavigationGuide';
import { Sidebar } from './Sidebar';

type RaterStatus = 'Active' | 'Inactive';
type ClientSource = 'preferred' | 'fallback';

interface ProfileAccountRow {
  userId: string;
  email: string;
  name: string;
  role: string;
}

interface RaterAccountOption {
  email: string;
  name: string;
  designation: string;
  department: string;
  existingRaterId?: string;
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

interface RaterFormState {
  selectedEmail: string;
  assignedPositions: string[];
  startDate: string;
  endDate: string;
}

const RATER_ASSIGNMENTS_KEY = 'cictrix_rater_assigned_positions';
const RATER_ACCESS_STATE_KEY = 'cictrix_rater_access_state_map';

const defaultFormState = (): RaterFormState => ({
  selectedEmail: '',
  assignedPositions: [],
  startDate: '',
  endDate: '',
});

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

const loadRaterAssignments = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(RATER_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string[]>;
  } catch {
    return {};
  }
};

const saveRaterAssignments = (assignments: Record<string, string[]>) => {
  try {
    localStorage.setItem(RATER_ASSIGNMENTS_KEY, JSON.stringify(assignments));
  } catch {
  }
};

const saveRaterAccessState = (email: string, isActive: boolean) => {
  try {
    const normalizedEmail = normalizeEmailKey(email);
    const raw = localStorage.getItem(RATER_ACCESS_STATE_KEY);
    const current = raw ? JSON.parse(raw) : {};
    const next = current && typeof current === 'object' ? { ...current } : {};
    next[normalizedEmail] = isActive;
    localStorage.setItem(RATER_ACCESS_STATE_KEY, JSON.stringify(next));
  } catch {
  }
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

const roleBadge = (role: string) => {
  return <span className="rounded-md bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600">{role}</span>;
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
  const [profileAccounts, setProfileAccounts] = useState<ProfileAccountRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [showGuide, setShowGuide] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [form, setForm] = useState<RaterFormState>(defaultFormState());
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualDepartment, setManualDepartment] = useState('Unassigned');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const loadRaters = async () => {
    const localAssignments = loadRaterAssignments();

    try {
      const responses = await Promise.all(
        getClientEntries().map(async ({ source, client }) => {
          const response = await client
            .from('raters')
            .select('*')
            .order('created_at', { ascending: false });

          return {
            source,
            rows: Array.isArray((response as any)?.data) ? (response as any).data : [],
          };
        })
      );

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
          const positionsFromRow = Array.isArray(row?.assigned_positions)
            ? row.assigned_positions.filter((value: unknown) => typeof value === 'string')
            : [];
          const positionsFromLocal = emailKey ? localAssignments[emailKey] ?? [] : [];
          const positionsFromDepartment = row?.department ? [String(row.department)] : ['Unassigned'];
          const assignedPositions = uniqueStrings(
            positionsFromRow.length > 0
              ? [...positionsFromRow, ...positionsFromLocal]
              : [...positionsFromLocal, ...positionsFromDepartment]
          );

          const nextRow: RaterSourceRow = {
            id: String(row?.id ?? crypto.randomUUID()),
            name: String(row?.name ?? 'Unknown Rater'),
            email,
            designation: String(row?.designation ?? row?.department ?? 'Rater'),
            department: String(row?.department ?? 'Unassigned'),
            assignedPositions,
            lastLogin: formatLastLogin(row?.last_login ?? row?.updated_at),
            status: Boolean(row?.is_active) ? 'Active' : 'Inactive',
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
    } catch {
      setRatersData([]);
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
        event.key === RATER_ASSIGNMENTS_KEY ||
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

  const selectedRater = useMemo(
    () => ratersData.find((rater) => normalizeEmailKey(rater.email) === normalizeEmailKey(form.selectedEmail)),
    [ratersData, form.selectedEmail]
  );

  const availableAccounts = useMemo(() => {
    const accounts = new Map<string, RaterAccountOption>();

    ratersData.forEach((rater) => {
      const emailKey = normalizeEmailKey(rater.email);
      if (!emailKey) return;
      accounts.set(emailKey, {
        email: rater.email,
        name: rater.name,
        designation: rater.designation,
        department: rater.department,
        existingRaterId: rater.id,
      });
    });

    profileAccounts.forEach((account) => {
      const emailKey = normalizeEmailKey(account.email);
      if (!emailKey || accounts.has(emailKey)) return;
      accounts.set(emailKey, {
        email: account.email,
        name: account.name,
        designation: account.role === 'RATER' ? 'Rater' : 'Interviewer',
        department: 'Unassigned',
      });
    });

    return Array.from(accounts.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [profileAccounts, ratersData]);

  const selectedAccount = useMemo(
    () => availableAccounts.find((account) => normalizeEmailKey(account.email) === normalizeEmailKey(form.selectedEmail)),
    [availableAccounts, form.selectedEmail]
  );

  const assignableJobPositions = useMemo(() => {
    return getAuthoritativeJobPostings()
      .filter((posting) => String(posting?.status ?? '').trim().toLowerCase() === 'active')
      .map((posting) => String(posting?.title ?? '').trim())
      .filter(Boolean)
      .filter((value, index, rows) => rows.indexOf(value) === index)
      .sort((left, right) => left.localeCompare(right));
  }, []);

  const filteredRaters = useMemo(() => {
    return ratersData.filter((rater) => {
      const matchesSearch =
        !search ||
        `${rater.name} ${rater.email} ${rater.designation} ${rater.assignedPositions.join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === 'All Status' ||
        (statusFilter === 'Active' && rater.status === 'Active') ||
        (statusFilter === 'Inactive' && rater.status === 'Inactive');

      return matchesSearch && matchesStatus;
    });
  }, [ratersData, search, statusFilter]);

  const totalRaters = ratersData.length;
  const activeRaters = ratersData.filter((rater) => rater.status === 'Active').length;
  const inactiveRaters = ratersData.filter((rater) => rater.status === 'Inactive').length;

  const openAssignModal = (rater?: RaterSourceRow) => {
    if (!rater) {
      setForm(defaultFormState());
      setShowAssignModal(true);
      return;
    }

    setForm({
      selectedEmail: rater.email,
      assignedPositions: [...rater.assignedPositions],
      startDate: '',
      endDate: '',
    });
    setShowAssignModal(true);
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
    setForm(defaultFormState());
    setManualName('');
    setManualEmail('');
    setManualDepartment('Unassigned');
  };

  const handleRaterSelection = (email: string) => {
    const nextSelected = ratersData.find((rater) => normalizeEmailKey(rater.email) === normalizeEmailKey(email));
    setForm((current) => ({
      ...current,
      selectedEmail: email,
      assignedPositions: nextSelected ? [...nextSelected.assignedPositions] : [],
    }));
  };

  const toggleAssignedPosition = (position: string) => {
    setForm((current) => ({
      ...current,
      assignedPositions: current.assignedPositions.includes(position)
        ? current.assignedPositions.filter((item) => item !== position)
        : [...current.assignedPositions, position],
    }));
  };

  const persistAssignmentsLocally = (email: string, positions: string[]) => {
    const assignmentKey = normalizeEmailKey(email);
    const currentAssignments = loadRaterAssignments();
    const nextAssignments = {
      ...currentAssignments,
      [assignmentKey]: uniqueStrings(positions),
    };
    saveRaterAssignments(nextAssignments);
  };

  const handleSaveRaterAccess = async () => {
    const fallbackEmail = normalizeEmailKey(manualEmail);
    const fallbackName = String(manualName || manualEmail).trim();
    const fallbackDepartment = String(manualDepartment || 'Unassigned').trim() || 'Unassigned';
    const accountToUse: RaterAccountOption | null = selectedAccount
      ? selectedAccount
      : fallbackEmail
        ? {
            email: manualEmail.trim(),
            name: fallbackName || manualEmail.trim(),
            designation: 'Interviewer',
            department: fallbackDepartment,
          }
        : null;

    if (!accountToUse || form.assignedPositions.length === 0) {
      setToast('Select a rater and assign at least one job position.');
      return;
    }

    const previousRows = ratersData;
    const nextAssignedPositions = uniqueStrings(form.assignedPositions);

    persistAssignmentsLocally(accountToUse.email, nextAssignedPositions);
    setRatersData((current) =>
      selectedRater
        ? current.map((rater) =>
            normalizeEmailKey(rater.email) === normalizeEmailKey(accountToUse.email)
              ? { ...rater, assignedPositions: nextAssignedPositions, status: 'Active' }
              : rater
          )
        : [
            {
              id: `pending-${normalizeEmailKey(accountToUse.email)}`,
              name: accountToUse.name,
              email: accountToUse.email,
              designation: accountToUse.designation,
              department: accountToUse.department,
              assignedPositions: nextAssignedPositions,
              lastLogin: 'N/A',
              status: 'Active',
              source: 'preferred',
            },
            ...current,
          ]
    );

    setSaving(true);

    try {
      const accessClient = getAccessClient();

      if (selectedRater) {
        await runRaterEmailUpdate(
          accessClient,
          {
            assigned_positions: nextAssignedPositions,
            is_active: true,
            designation: accountToUse.designation,
            department: accountToUse.department,
          },
          accountToUse.email,
          selectedRater.id
        );
      } else {
        const insertResult = await accessClient.from('raters').insert({
          name: accountToUse.name,
          email: accountToUse.email,
          designation: accountToUse.designation,
          department: accountToUse.department,
          assigned_positions: nextAssignedPositions,
          is_active: true,
          last_login: null,
        });

        if ((insertResult as any)?.error) {
          throw (insertResult as any).error;
        }
      }

      await verifyRaterAccessState(accessClient, accountToUse.email, true);
      saveRaterAccessState(accountToUse.email, true);
      closeAssignModal();
      setToast('Rater access updated.');
      await loadRaters();
    } catch {
      setRatersData(previousRows);
      setToast('Failed to save rater access.');
      await loadRaters();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRaterAccess = async (rater: RaterSourceRow) => {
    const nextIsActive = rater.status !== 'Active';
    const previousRows = ratersData;
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
    } catch {
      setRatersData(previousRows);
      setToast('Failed to update interviewer access.');
      await loadRaters();
    }
  };

  const handleDownloadRaters = () => {
    const csvRows = [
      ['Name', 'Email', 'Designation', 'Assigned Positions', 'Last Login', 'Status'],
      ...filteredRaters.map((rater) => [
        rater.name,
        rater.email,
        rater.designation,
        rater.assignedPositions.join('; '),
        rater.lastLogin,
        rater.status,
      ]),
    ];
    const csv = csvRows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rater-list.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-layout">
      <Sidebar activeModule="RSP" userRole="rsp" />
      <main className="admin-content bg-gray-50">
        <div className="min-h-screen bg-gray-50 p-6 md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex space-x-2">
              <span className="cursor-pointer text-blue-600">RSP</span>
              <span>/</span>
              <span className="cursor-pointer text-blue-600">Settings</span>
              <span>/</span>
              <span>Rater Management</span>
            </div>
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={() => setShowGuide(true)}
            >
              How to Navigate
            </button>
          </div>

          <div className="mb-8">
            <div className="mb-2 flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Shield className="h-5 w-5" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900">Rater Management &amp; Access Control</h1>
            </div>
            <p className="text-sm text-gray-500">
              Assign raters and define their evaluation access for specific job positions.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6">
              <div>
                <p className="text-sm text-gray-500">Total Raters</p>
                <p className="text-3xl font-bold text-gray-900">{totalRaters}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <UserPlus className="h-5 w-5" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6">
              <div>
                <p className="text-sm text-gray-500">Active Raters</p>
                <p className="text-3xl font-bold text-gray-900">{activeRaters}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 text-green-500">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6">
              <div>
                <p className="text-sm text-gray-500">Inactive Raters</p>
                <p className="text-3xl font-bold text-gray-900">{inactiveRaters}</p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <XCircle className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                onClick={() => openAssignModal()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add New Rater
              </button>
              <button
                type="button"
                className="flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handleDownloadRaters}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Rater List
              </button>
            </div>

            <div className="flex items-center space-x-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-64 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="Search raters..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <select
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All Status</option>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-gray-200 bg-white">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Rater Name</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Designation / Position</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Access Role</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Assigned Job Position(s)</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Last Login</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRaters.map((rater) => (
                  <tr key={`${rater.source}-${rater.id}-${rater.email}`} className="transition-colors hover:bg-gray-50">
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
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{rater.designation}</td>
                    <td className="whitespace-nowrap px-6 py-4">{roleBadge('Interviewer')}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        {rater.assignedPositions.map((position) => (
                          <span key={`${rater.email}-${position}`} className="mb-1 block text-sm text-blue-600 last:mb-0">
                            {position}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">{rater.lastLogin}</td>
                    <td className="whitespace-nowrap px-6 py-4">{statusBadge(rater.status)}</td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <button
                          type="button"
                          className="text-blue-500 hover:text-blue-700"
                          aria-label={`Edit ${rater.name}`}
                          onClick={() => openAssignModal(rater)}
                        >
                          <PenLine className="h-4 w-4" />
                        </button>
                        {rater.status === 'Active' ? (
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700"
                            aria-label={`Deactivate ${rater.name}`}
                            onClick={() => void handleToggleRaterAccess(rater)}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-green-500 hover:text-green-700"
                            aria-label={`Activate ${rater.name}`}
                            onClick={() => void handleToggleRaterAccess(rater)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRaters.length === 0 && (
                  <tr>
                    <td className="px-6 py-8 text-sm text-gray-500" colSpan={7}>
                      No raters found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <RaterManagementNavigationGuide open={showGuide} onClose={() => setShowGuide(false)} />

      {showAssignModal && (
        <div className="fixed inset-0 z-[120] bg-slate-900/70 p-4" onClick={closeAssignModal}>
          <div
            className="mx-auto mt-6 flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between bg-blue-700 px-6 py-4 text-white">
              <div>
                <h2 className="text-3xl font-bold">Assign Rater Access</h2>
                <p className="text-base text-blue-100">Grant access to interviewer portal</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1 text-white/90 hover:bg-white/10"
                onClick={closeAssignModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Select Rater <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
                  value={form.selectedEmail}
                  onChange={(event) => handleRaterSelection(event.target.value)}
                >
                  <option value="">Choose a rater...</option>
                  {availableAccounts.map((account) => (
                    <option key={account.email} value={account.email}>
                      {account.name} ({account.email})
                    </option>
                  ))}
                </select>
              </section>

              <section>
                <p className="mb-2 text-sm font-semibold text-slate-700">Cannot find the account above?</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
                    placeholder="Interviewer name"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
                    placeholder="Interviewer email"
                    value={manualEmail}
                    onChange={(event) => setManualEmail(event.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-300 px-4 py-3 text-sm"
                    placeholder="Department"
                    value={manualDepartment}
                    onChange={(event) => setManualDepartment(event.target.value)}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Use this when database visibility rules hide `profiles` rows from this page.
                </p>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">Designation / Role</label>
                <input
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg"
                  value={selectedAccount?.designation ?? ''}
                  placeholder="Auto-filled based on selected rater"
                  readOnly
                />
                <p className="mt-2 text-sm text-slate-500">Auto-filled based on selected rater</p>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Access Level <span className="text-red-500">*</span>
                </label>
                <select className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-lg" value="Interviewer" disabled>
                  <option value="Interviewer">Interviewer</option>
                </select>
              </section>

              <section>
                <label className="mb-2 block text-base font-semibold text-slate-700">
                  Assign Job Positions <span className="text-red-500">*</span>
                </label>
                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-300 p-4">
                  {assignableJobPositions.length === 0 ? (
                    <p className="text-sm text-slate-500">No active job postings are available. Post or activate a job first.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                      {assignableJobPositions.map((position) => {
                        const checked = form.assignedPositions.includes(position);
                        return (
                          <label key={position} className="flex items-center gap-3 text-lg text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssignedPosition(position)}
                              className="h-5 w-5 rounded"
                            />
                            <span>{position}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Selected: {form.assignedPositions.length} position{form.assignedPositions.length === 1 ? '' : 's'}
                </p>
              </section>

              <section>
                <h3 className="mb-3 text-2xl font-bold text-slate-800">Access Duration (Optional)</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">Start Date</label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
                      type="date"
                      value={form.startDate}
                      onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-base font-semibold text-slate-600">End Date</label>
                    <input
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
                      type="date"
                      value={form.endDate}
                      onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-4 py-2 text-lg"
                onClick={closeAssignModal}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-blue-300"
                onClick={() => void handleSaveRaterAccess()}
                disabled={saving || (!form.selectedEmail && !manualEmail.trim()) || form.assignedPositions.length === 0}
              >
                Save &amp; Generate Access
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};
