import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  History,
  Plus,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { supabase as supabaseClient } from '../../../lib/supabase';
import { listRequirements, type Requirement } from '../../../lib/api/competencyFramework';
import { getCurrentAdminEmail } from '../moduleUi';

const supabase = supabaseClient as any;

// ── Types ──────────────────────────────────────────────────────────────────────

type Stage =
  | 'Submitted'
  | 'Document Review'
  | 'Dept Head Endorsement'
  | 'PM Final Review'
  | 'Approved'
  | 'Denied';

interface PromoApp {
  id: string;
  employee_id: string | null;
  employee_name: string;
  current_position: string | null;
  target_position: string;
  department: string | null;
  stage: Stage;
  current_owner: string | null;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string;
  stage_updated_at: string | null;
}

interface PromoDoc {
  id: string;
  application_id: string;
  document_type: string;
  file_name: string | null;
  status: 'Pending' | 'Submitted' | 'Verified' | 'Rejected';
  notes: string | null;
  submitted_at: string | null;
}

interface PromoDecision {
  id: string;
  application_id: string;
  employee_name: string;
  target_position: string;
  decision: 'Approved' | 'Denied';
  decided_by: string;
  notes: string | null;
  decided_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STAGE_ORDER: Stage[] = [
  'Submitted',
  'Document Review',
  'Dept Head Endorsement',
  'PM Final Review',
  'Approved',
];

const STAGE_OWNERS: Record<Stage, string> = {
  'Submitted': 'HR Office',
  'Document Review': 'RSP Staff',
  'Dept Head Endorsement': 'Department Head',
  'PM Final Review': 'PM Admin',
  'Approved': '—',
  'Denied': '—',
};

const REQUIRED_DOCS = [
  'Updated Resume/CV',
  'IPCR History Printout (Last 3 Periods)',
  'Endorsement Letter',
  'Latest Performance Rating',
  'Position Description Form',
  'Certificate of Eligibility / CSC Rating',
];

const DEPARTMENTS = [
  'HR Department',
  'Health Office',
  'Treasury Department',
  'IT Division',
];

// ── Seed data (shown when Supabase tables are empty or unavailable) ─────────────

const SEED_APPS: PromoApp[] = [
  {
    id: 'seed-1',
    employee_id: null,
    employee_name: 'Maria Santos',
    current_position: 'Administrative Assistant II',
    target_position: 'Administrative Officer',
    department: 'HR Department',
    stage: 'Document Review',
    current_owner: 'RSP Staff',
    notes: null,
    submitted_by: 'Maria Santos',
    submitted_at: '2026-06-10T09:00:00Z',
    stage_updated_at: '2026-06-12T14:00:00Z',
  },
  {
    id: 'seed-2',
    employee_id: null,
    employee_name: 'Juan dela Cruz',
    current_position: 'IT Technician I',
    target_position: 'IT Specialist',
    department: 'IT Division',
    stage: 'Dept Head Endorsement',
    current_owner: 'Department Head',
    notes: 'Excellent IPCR scores for 3 consecutive periods.',
    submitted_by: 'Juan dela Cruz',
    submitted_at: '2026-06-05T10:30:00Z',
    stage_updated_at: '2026-06-15T11:00:00Z',
  },
  {
    id: 'seed-3',
    employee_id: null,
    employee_name: 'Lourdes Reyes',
    current_position: 'Accountant I',
    target_position: 'Accountant',
    department: 'Treasury Department',
    stage: 'PM Final Review',
    current_owner: 'PM Admin',
    notes: null,
    submitted_by: 'Lourdes Reyes',
    submitted_at: '2026-05-28T08:00:00Z',
    stage_updated_at: '2026-06-20T09:30:00Z',
  },
  {
    id: 'seed-4',
    employee_id: null,
    employee_name: 'Robert Bautista',
    current_position: 'Health Aide',
    target_position: 'Human Resource Specialist',
    department: 'Health Office',
    stage: 'Submitted',
    current_owner: 'HR Office',
    notes: null,
    submitted_by: 'Robert Bautista',
    submitted_at: '2026-07-01T07:45:00Z',
    stage_updated_at: null,
  },
  {
    id: 'seed-5',
    employee_id: null,
    employee_name: 'Ana Villanueva',
    current_position: 'Budget Officer I',
    target_position: 'Budget Officer',
    department: 'Treasury Department',
    stage: 'Approved',
    current_owner: '—',
    notes: 'All requirements met. Endorsed by Department Head.',
    submitted_by: 'Ana Villanueva',
    submitted_at: '2026-05-15T09:00:00Z',
    stage_updated_at: '2026-06-25T15:00:00Z',
  },
];

const SEED_DOCS: PromoDoc[] = SEED_APPS.flatMap((app) =>
  REQUIRED_DOCS.map((dt, i) => ({
    id: `seed-doc-${app.id}-${i}`,
    application_id: app.id,
    document_type: dt,
    file_name: app.stage !== 'Submitted' ? `${dt.replace(/\//g, '_').replace(/\s+/g, '_').toLowerCase()}.pdf` : null,
    status: (app.stage === 'Submitted'
      ? 'Pending'
      : app.stage === 'Document Review' && i > 3
      ? 'Pending'
      : app.stage === 'Approved'
      ? 'Verified'
      : 'Submitted') as PromoDoc['status'],
    notes: null,
    submitted_at: app.stage !== 'Submitted' ? app.submitted_at : null,
  }))
);

const SEED_DECISIONS: PromoDecision[] = [
  {
    id: 'seed-dec-1',
    application_id: 'seed-5',
    employee_name: 'Ana Villanueva',
    target_position: 'Budget Officer',
    decision: 'Approved',
    decided_by: 'PM Admin',
    notes: 'All competency and eligibility requirements fully satisfied.',
    decided_at: '2026-06-25T15:00:00Z',
  },
];

// ── Helper components ──────────────────────────────────────────────────────────

const STAGE_STYLE: Record<Stage, string> = {
  'Submitted': 'bg-slate-100 text-slate-600',
  'Document Review': 'bg-blue-100 text-blue-700',
  'Dept Head Endorsement': 'bg-amber-100 text-amber-700',
  'PM Final Review': 'bg-purple-100 text-purple-700',
  'Approved': 'bg-emerald-100 text-emerald-700',
  'Denied': 'bg-red-100 text-red-700',
};

const StageBadge = ({ stage }: { stage: Stage }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[stage] ?? 'bg-slate-100 text-slate-600'}`}>
    {stage}
  </span>
);

const DOC_STATUS_STYLE: Record<PromoDoc['status'], string> = {
  Pending: 'bg-slate-100 text-slate-500',
  Submitted: 'bg-blue-100 text-blue-700',
  Verified: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-700',
};

const DocStatusBadge = ({ status }: { status: PromoDoc['status'] }) => (
  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DOC_STATUS_STYLE[status]}`}>
    {status}
  </span>
);

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Main component ─────────────────────────────────────────────────────────────

type Subtab = 'new-applications' | 'status' | 'archive' | 'approval-history' | 'eligibility';

export function PMPromotionalApplications() {
  const [subtab, setSubtab] = useState<Subtab>('new-applications');
  const [apps, setApps] = useState<PromoApp[]>([]);
  const [docs, setDocs] = useState<PromoDoc[]>([]);
  const [decisions, setDecisions] = useState<PromoDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // New application modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newApp, setNewApp] = useState({ employee_name: '', current_position: '', target_position: '', department: DEPARTMENTS[0] });
  const [saving, setSaving] = useState(false);

  // Stage advance modal
  const [advancingApp, setAdvancingApp] = useState<PromoApp | null>(null);
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [advanceAction, setAdvanceAction] = useState<'advance' | 'deny'>('advance');

  // Eligibility check state
  const [eligibilityAppId, setEligibilityAppId] = useState('');
  const [positionReqs, setPositionReqs] = useState<Requirement[]>([]);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  // Load data
  useEffect(() => {
    void loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [appsRes, docsRes, decsRes] = await Promise.all([
        supabase.from('promotional_applications').select('*').order('submitted_at', { ascending: false }),
        supabase.from('promotional_application_docs').select('*'),
        supabase.from('promotional_decisions').select('*').order('decided_at', { ascending: false }),
      ]);
      const dbApps = Array.isArray(appsRes.data) ? (appsRes.data as PromoApp[]) : [];
      const dbDocs = Array.isArray(docsRes.data) ? (docsRes.data as PromoDoc[]) : [];
      const dbDecs = Array.isArray(decsRes.data) ? (decsRes.data as PromoDecision[]) : [];
      setApps(dbApps.length > 0 ? dbApps : SEED_APPS);
      setDocs(dbDocs.length > 0 ? dbDocs : SEED_DOCS);
      setDecisions(dbDecs.length > 0 ? dbDecs : SEED_DECISIONS);
    } catch {
      setApps(SEED_APPS);
      setDocs(SEED_DOCS);
      setDecisions(SEED_DECISIONS);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApp = async () => {
    if (!newApp.employee_name.trim() || !newApp.target_position.trim()) return;
    setSaving(true);
    try {
      const payload = {
        employee_name: newApp.employee_name.trim(),
        current_position: newApp.current_position.trim() || null,
        target_position: newApp.target_position.trim(),
        department: newApp.department,
        stage: 'Submitted' as Stage,
        current_owner: STAGE_OWNERS['Submitted'],
        submitted_by: getCurrentAdminEmail(),
        submitted_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('promotional_applications').insert([payload]).select().single();
      if (!error && data) {
        // Seed the required doc checklist rows
        const docRows = REQUIRED_DOCS.map((dt) => ({
          application_id: (data as PromoApp).id,
          document_type: dt,
          status: 'Pending',
        }));
        await supabase.from('promotional_application_docs').insert(docRows);
        await loadAll();
      } else {
        // Offline: add to local seed
        const localApp: PromoApp = { ...payload, id: `local-${Date.now()}`, employee_id: null, notes: null, stage_updated_at: null };
        const localDocs: PromoDoc[] = REQUIRED_DOCS.map((dt, i) => ({
          id: `local-doc-${Date.now()}-${i}`,
          application_id: localApp.id,
          document_type: dt,
          file_name: null,
          status: 'Pending',
          notes: null,
          submitted_at: null,
        }));
        setApps((prev) => [localApp, ...prev]);
        setDocs((prev) => [...prev, ...localDocs]);
      }
    } finally {
      setSaving(false);
      setShowNewModal(false);
      setNewApp({ employee_name: '', current_position: '', target_position: '', department: DEPARTMENTS[0] });
    }
  };

  const handleAdvanceStage = async () => {
    if (!advancingApp) return;
    const isFinal = advancingApp.stage === 'PM Final Review';
    let nextStage: Stage;
    if (advanceAction === 'deny') {
      nextStage = 'Denied';
    } else {
      const idx = STAGE_ORDER.indexOf(advancingApp.stage as Stage);
      nextStage = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
    }
    const adminEmail = getCurrentAdminEmail();
    const now = new Date().toISOString();

    try {
      await supabase.from('promotional_applications').update({
        stage: nextStage,
        current_owner: STAGE_OWNERS[nextStage],
        stage_updated_at: now,
        stage_updated_by: adminEmail,
        notes: advanceNotes.trim() || null,
        updated_at: now,
      }).eq('id', advancingApp.id);

      if (isFinal || nextStage === 'Denied') {
        await supabase.from('promotional_decisions').insert([{
          application_id: advancingApp.id,
          employee_name: advancingApp.employee_name,
          target_position: advancingApp.target_position,
          decision: nextStage === 'Approved' ? 'Approved' : 'Denied',
          decided_by: adminEmail,
          notes: advanceNotes.trim() || null,
          decided_at: now,
        }]);
      }
    } catch {
      // Offline: apply locally
      setApps((prev) => prev.map((a) => a.id === advancingApp.id
        ? { ...a, stage: nextStage, current_owner: STAGE_OWNERS[nextStage], stage_updated_at: now, notes: advanceNotes.trim() || null }
        : a
      ));
      if (isFinal || nextStage === 'Denied') {
        const dec: PromoDecision = {
          id: `local-dec-${Date.now()}`,
          application_id: advancingApp.id,
          employee_name: advancingApp.employee_name,
          target_position: advancingApp.target_position,
          decision: nextStage === 'Approved' ? 'Approved' : 'Denied',
          decided_by: adminEmail,
          notes: advanceNotes.trim() || null,
          decided_at: now,
        };
        setDecisions((prev) => [dec, ...prev]);
      }
    }

    await loadAll();
    setAdvancingApp(null);
    setAdvanceNotes('');
    setAdvanceAction('advance');
  };

  const handleDocStatusToggle = async (doc: PromoDoc) => {
    const cycle: PromoDoc['status'][] = ['Pending', 'Submitted', 'Verified'];
    const nextStatus = cycle[(cycle.indexOf(doc.status) + 1) % cycle.length];
    try {
      await supabase.from('promotional_application_docs').update({ status: nextStatus }).eq('id', doc.id);
    } catch { /* offline */ }
    setDocs((prev) => prev.map((d) => d.id === doc.id ? { ...d, status: nextStatus } : d));
  };

  const loadEligibilityCheck = async (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    setEligibilityLoading(true);
    const result = await listRequirements();
    const reqs = result.ok
      ? result.data.filter((r) => r.position === app.target_position && r.is_active)
      : [];
    setPositionReqs(reqs);
    setEligibilityLoading(false);
  };

  const filteredApps = apps.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.employee_name.toLowerCase().includes(q) ||
      a.target_position.toLowerCase().includes(q) ||
      (a.department ?? '').toLowerCase().includes(q) ||
      a.stage.toLowerCase().includes(q)
    );
  });

  const activeApps = apps.filter((a) => a.stage !== 'Approved' && a.stage !== 'Denied');
  const selectedEligApp = apps.find((a) => a.id === eligibilityAppId);

  const SUBTABS: { key: Subtab; label: string; icon: React.ElementType }[] = [
    { key: 'new-applications', label: 'New Applications', icon: Plus },
    { key: 'status', label: 'Application Status', icon: ClipboardList },
    { key: 'archive', label: 'Document Archive', icon: Archive },
    { key: 'approval-history', label: 'Approval History', icon: History },
    { key: 'eligibility', label: 'Eligibility Check', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-5" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Promotional Applications</h2>
        <p className="mt-0.5 text-sm text-slate-500">Module 4 — Manage employee promotional applications end-to-end</p>
      </div>

      {/* Subtab bar */}
      <div className="flex flex-wrap border-b border-slate-200 bg-white rounded-xl p-2 shadow-sm gap-2">
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubtab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-md transition ${
              subtab === key ? 'bg-[#363EE8] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">Loading…</div>
      ) : (
        <>
          {/* ── Subtab: New Applications ─────────────────────────────────────── */}
          {subtab === 'new-applications' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search applicant, position, department…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2e35d4] transition shadow"
                >
                  <Plus className="h-3.5 w-3.5" /> New Application
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['Submitted', 'Document Review', 'Dept Head Endorsement', 'PM Final Review'] as Stage[]).map((s) => (
                  <div key={s} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{s}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-800">{apps.filter((a) => a.stage === s).length}</p>
                  </div>
                ))}
              </div>

              {/* Applications table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                        <th className="px-4 py-3">Applicant</th>
                        <th className="px-4 py-3">Current Position</th>
                        <th className="px-4 py-3">Target Position</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Stage</th>
                        <th className="px-4 py-3">Documents</th>
                        <th className="px-4 py-3">Submitted</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredApps.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-10 text-center text-slate-400">No applications found.</td>
                        </tr>
                      ) : filteredApps.map((app) => {
                        const appDocs = docs.filter((d) => d.application_id === app.id);
                        const submitted = appDocs.filter((d) => d.status !== 'Pending').length;
                        const total = appDocs.length || REQUIRED_DOCS.length;
                        const isClosed = app.stage === 'Approved' || app.stage === 'Denied';
                        return (
                          <tr key={app.id} className="hover:bg-slate-50/50 text-slate-700">
                            <td className="px-4 py-3 font-semibold text-slate-800">{app.employee_name}</td>
                            <td className="px-4 py-3 text-slate-500">{app.current_position ?? '—'}</td>
                            <td className="px-4 py-3">{app.target_position}</td>
                            <td className="px-4 py-3 text-slate-500">{app.department ?? '—'}</td>
                            <td className="px-4 py-3"><StageBadge stage={app.stage} /></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-[#363EE8]"
                                    style={{ width: `${total === 0 ? 0 : Math.round((submitted / total) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-slate-500">{submitted}/{total}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{fmtDate(app.submitted_at)}</td>
                            <td className="px-4 py-3 text-right">
                              {!isClosed && (
                                <button
                                  type="button"
                                  onClick={() => { setAdvancingApp(app); setAdvanceAction('advance'); }}
                                  className="text-[#363EE8] hover:underline font-semibold"
                                >
                                  Advance
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Subtab: Application Status ──────────────────────────────────── */}
          {subtab === 'status' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Pipeline View</h3>
                <p className="text-xs text-slate-500 mt-0.5">Each application progresses through defined stages. The current owner is responsible for the next action.</p>
              </div>

              <div className="space-y-3">
                {STAGE_ORDER.map((stage) => {
                  const stageApps = apps.filter((a) => a.stage === stage);
                  const color = STAGE_STYLE[stage] ?? 'bg-slate-100 text-slate-600';
                  return (
                    <div key={stage} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className={`flex items-center justify-between px-4 py-3 border-b border-slate-100 ${color}`}>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">{stage}</span>
                          <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">{stageApps.length}</span>
                        </div>
                        <span className="text-[10px] opacity-75">Owner: {STAGE_OWNERS[stage]}</span>
                      </div>
                      {stageApps.length === 0 ? (
                        <div className="px-4 py-4 text-xs text-slate-400 italic">No applications at this stage.</div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {stageApps.map((app) => {
                            const appDocs = docs.filter((d) => d.application_id === app.id);
                            const pendingDocs = appDocs.filter((d) => d.status === 'Pending').length;
                            return (
                              <div key={app.id} className="flex items-start justify-between gap-3 px-4 py-3">
                                <div>
                                  <p className="text-xs font-semibold text-slate-800">{app.employee_name}</p>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {app.current_position ?? '—'} <ChevronRight className="inline h-3 w-3" /> {app.target_position}
                                  </p>
                                  <p className="text-[10px] text-slate-400 mt-0.5">{app.department ?? '—'}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-[10px] text-slate-400">Last updated {fmtDate(app.stage_updated_at ?? app.submitted_at)}</p>
                                  {pendingDocs > 0 && (
                                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      <AlertCircle className="h-2.5 w-2.5" /> {pendingDocs} doc{pendingDocs > 1 ? 's' : ''} pending
                                    </span>
                                  )}
                                  {app.stage !== 'Approved' && app.stage !== 'Denied' && (
                                    <div className="mt-1.5 flex justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => { setAdvancingApp(app); setAdvanceAction('advance'); }}
                                        className="text-[10px] font-bold text-[#363EE8] hover:underline"
                                      >
                                        Advance →
                                      </button>
                                      <span className="text-slate-300">|</span>
                                      <button
                                        type="button"
                                        onClick={() => { setAdvancingApp(app); setAdvanceAction('deny'); }}
                                        className="text-[10px] font-bold text-red-600 hover:underline"
                                      >
                                        Deny
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Closed applications */}
                {apps.filter((a) => a.stage === 'Approved' || a.stage === 'Denied').length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                      <span className="text-xs font-bold text-slate-600">Closed (Approved / Denied)</span>
                      <span className="text-[10px] text-slate-400">{apps.filter((a) => a.stage === 'Approved' || a.stage === 'Denied').length} total</span>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {apps.filter((a) => a.stage === 'Approved' || a.stage === 'Denied').map((app) => (
                        <div key={app.id} className="flex items-center justify-between px-4 py-3">
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{app.employee_name}</p>
                            <p className="text-[10px] text-slate-500">{app.target_position} · {app.department ?? '—'}</p>
                          </div>
                          <StageBadge stage={app.stage} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Subtab: Document Archive ─────────────────────────────────────── */}
          {subtab === 'archive' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Document Archive</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Per-applicant file storage. Documents are retained for audit purposes even after a decision is made.
                </p>
              </div>

              {apps.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">No applications on record.</div>
              ) : (
                apps.map((app) => {
                  const appDocs = docs.filter((d) => d.application_id === app.id);
                  return (
                    <div key={app.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{app.employee_name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{app.target_position} · {app.department ?? '—'} · Submitted {fmtDate(app.submitted_at)}</p>
                        </div>
                        <StageBadge stage={app.stage} />
                      </div>
                      <div className="divide-y divide-slate-50">
                        {appDocs.length === 0 ? (
                          REQUIRED_DOCS.map((dt) => (
                            <div key={dt} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <FileText className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                                <span className="text-xs text-slate-600">{dt}</span>
                              </div>
                              <DocStatusBadge status="Pending" />
                            </div>
                          ))
                        ) : (
                          appDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className={`h-3.5 w-3.5 shrink-0 ${doc.status === 'Verified' ? 'text-emerald-500' : doc.status === 'Submitted' ? 'text-blue-500' : 'text-slate-300'}`} />
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-700 truncate">{doc.document_type}</p>
                                  {doc.file_name && (
                                    <p className="text-[10px] text-slate-400 truncate">{doc.file_name}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-slate-400">{fmtDate(doc.submitted_at)}</span>
                                <button
                                  type="button"
                                  onClick={() => void handleDocStatusToggle(doc)}
                                  title="Click to cycle status"
                                >
                                  <DocStatusBadge status={doc.status} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Subtab: Approval History ─────────────────────────────────────── */}
          {subtab === 'approval-history' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Approval History</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Complete sign-off trail — who approved or denied each application, with timestamps and notes.
                </p>
              </div>

              {decisions.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-400 shadow-sm">
                  No decisions have been recorded yet.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Target Position</th>
                          <th className="px-4 py-3">Decision</th>
                          <th className="px-4 py-3">Decided By</th>
                          <th className="px-4 py-3">Date &amp; Time</th>
                          <th className="px-4 py-3">Notes / Justification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {decisions.map((dec) => (
                          <tr key={dec.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">{dec.employee_name}</td>
                            <td className="px-4 py-3 text-slate-600">{dec.target_position}</td>
                            <td className="px-4 py-3">
                              {dec.decision === 'Approved' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" /> Approved
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700">
                                  <XCircle className="h-3 w-3" /> Denied
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{dec.decided_by}</td>
                            <td className="px-4 py-3 text-slate-500">{fmtDateTime(dec.decided_at)}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-xs">{dec.notes ?? <span className="italic text-slate-300">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Stage transition log */}
              <div>
                <h3 className="text-sm font-bold text-slate-800 mt-2">Stage Transition Log</h3>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">All applications with recorded stage updates.</p>
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {apps.filter((a) => a.stage_updated_at).map((app) => (
                      <div key={app.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{app.employee_name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{app.target_position} · {app.department ?? '—'}</p>
                        </div>
                        <div className="text-right">
                          <StageBadge stage={app.stage} />
                          <p className="text-[10px] text-slate-400 mt-1">{fmtDateTime(app.stage_updated_at)}</p>
                        </div>
                      </div>
                    ))}
                    {apps.filter((a) => a.stage_updated_at).length === 0 && (
                      <div className="px-4 py-8 text-center text-xs text-slate-400">No stage transitions recorded yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Subtab: Eligibility Check ────────────────────────────────────── */}
          {subtab === 'eligibility' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Eligibility Check</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cross-references the applicant's competency profile against the Position Requirements (Module 3) for the role they're applying to, flagging gaps for reviewer attention.
                </p>
              </div>

              {/* Application selector */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">Select Application to Check</label>
                  <select
                    value={eligibilityAppId}
                    onChange={async (e) => {
                      setEligibilityAppId(e.target.value);
                      if (e.target.value) await loadEligibilityCheck(e.target.value);
                      else setPositionReqs([]);
                    }}
                    className="w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                  >
                    <option value="">— Select an application —</option>
                    {activeApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.employee_name} → {app.target_position} ({app.stage})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedEligApp && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 border-t border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Applicant</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-800">{selectedEligApp.employee_name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current Position</p>
                      <p className="mt-0.5 text-xs text-slate-600">{selectedEligApp.current_position ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Target Position</p>
                      <p className="mt-0.5 text-xs font-semibold text-[#363EE8]">{selectedEligApp.target_position}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Current Stage</p>
                      <p className="mt-0.5"><StageBadge stage={selectedEligApp.stage} /></p>
                    </div>
                  </div>
                )}
              </div>

              {eligibilityAppId && (
                eligibilityLoading ? (
                  <div className="py-10 text-center text-xs text-slate-400">Loading competency requirements…</div>
                ) : positionReqs.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-800">No Competency Requirements Defined</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                          No position requirements have been set for <strong>{selectedEligApp?.target_position}</strong> in Module 3 (Competency Framework).
                          Please define the competency map for this position before running an eligibility check.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Requirements</p>
                        <p className="text-lg font-bold text-emerald-800">{positionReqs.length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Assessed</p>
                        <p className="text-lg font-bold text-slate-700">—</p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Gaps Flagged</p>
                        <p className="text-lg font-bold text-amber-800">—</p>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                      <strong>Note:</strong> Competency requirements for <strong>{selectedEligApp?.target_position}</strong> are listed below (from Module 3).
                      Link the applicant's competency assessment records to this view to auto-populate gap analysis. Items marked <span className="font-bold text-amber-700">Gap</span> require reviewer attention before advancing.
                    </div>

                    {/* Requirements table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                              <th className="px-4 py-3">Competency</th>
                              <th className="px-4 py-3">Description</th>
                              <th className="px-4 py-3">Required Level</th>
                              <th className="px-4 py-3">Employee Level</th>
                              <th className="px-4 py-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {positionReqs.map((req) => (
                              <tr key={req.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-semibold text-slate-800">{req.competency_name}</td>
                                <td className="px-4 py-3 text-slate-500 max-w-xs">{req.description ?? '—'}</td>
                                <td className="px-4 py-3">
                                  <span className="inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold bg-[#363EE8]/10 text-[#363EE8]">
                                    {req.proficiency_level}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-400 italic text-[11px]">Not assessed</td>
                                <td className="px-4 py-3">
                                  <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-wide">
                                    Pending
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </>
      )}

      {/* ── New Application Modal ──────────────────────────────────────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">New Promotional Application</h3>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Employee Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newApp.employee_name}
                  onChange={(e) => setNewApp((p) => ({ ...p, employee_name: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Current Position</label>
                <input
                  type="text"
                  value={newApp.current_position}
                  onChange={(e) => setNewApp((p) => ({ ...p, current_position: e.target.value }))}
                  placeholder="e.g. Administrative Assistant II"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Target Position <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={newApp.target_position}
                  onChange={(e) => setNewApp((p) => ({ ...p, target_position: e.target.value }))}
                  placeholder="e.g. Administrative Officer"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Department / Office</label>
                <select
                  value={newApp.department}
                  onChange={(e) => setNewApp((p) => ({ ...p, department: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#363EE8]"
                >
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-700">
                <strong>Document checklist</strong> — the system will auto-create a checklist of {REQUIRED_DOCS.length} required documents for this application.
              </div>
            </div>
            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={handleCreateApp}
                disabled={saving || !newApp.employee_name.trim() || !newApp.target_position.trim()}
                className="rounded-lg bg-[#363EE8] px-4 py-2 text-white hover:bg-[#2e35d4] disabled:opacity-50 transition"
              >
                {saving ? 'Saving…' : 'Create Application'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stage Advance / Deny Modal ─────────────────────────────────────────── */}
      {advancingApp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">
                {advanceAction === 'deny' ? 'Deny Application' : 'Advance Application'}
              </h3>
              <button type="button" onClick={() => setAdvancingApp(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="text-xs space-y-3">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1">
                <p><span className="font-semibold text-slate-600">Applicant:</span> {advancingApp.employee_name}</p>
                <p><span className="font-semibold text-slate-600">Target:</span> {advancingApp.target_position}</p>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-600">Current stage:</span>
                  <StageBadge stage={advancingApp.stage} />
                </div>
                {advanceAction === 'advance' && (() => {
                  const idx = STAGE_ORDER.indexOf(advancingApp.stage);
                  const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
                  return (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-600">Next stage:</span>
                      <StageBadge stage={next} />
                    </div>
                  );
                })()}
              </div>
              {advancingApp.stage === 'PM Final Review' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAdvanceAction('advance')}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${advanceAction === 'advance' ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvanceAction('deny')}
                    className={`flex-1 rounded-lg border py-2 text-xs font-bold transition ${advanceAction === 'deny' ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Deny
                  </button>
                </div>
              )}
              <div className="space-y-1">
                <label className="block font-semibold text-slate-700">Notes / Remarks</label>
                <textarea
                  value={advanceNotes}
                  onChange={(e) => setAdvanceNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional remarks or justification…"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#363EE8] resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => void handleAdvanceStage()}
                className={`rounded-lg px-4 py-2 text-white transition ${advanceAction === 'deny' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#363EE8] hover:bg-[#2e35d4]'}`}
              >
                {advanceAction === 'deny' ? 'Deny Application' : 'Confirm Advance'}
              </button>
              <button
                type="button"
                onClick={() => setAdvancingApp(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
