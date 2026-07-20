import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, Lock, Loader2, Star, ChevronDown, Edit3, X, Info } from 'lucide-react';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { type OfficeScope } from '../../../lib/api/officeScope';
import {
  listPendingRatingApprovals,
  saveRatings,
  returnPhase2ForRevision,
  adminEditRatings,
  openSelfRatingPeriod,
  closeSelfRatingPeriod,
  type RatingSheet,
  type Phase2Status,
} from '../../../lib/api/ipcrRatings';
import { createNotifications } from '../../../lib/api/employeeNotifications';

const FUNCTION_LABEL: Record<string, string> = {
  core: 'Core Functions',
  strategic: 'Strategic Functions',
  support: 'Support Functions',
};

const DIMENSIONS = [
  { key: 'quality', label: 'Q', full: 'Quality' },
  { key: 'efficiency', label: 'E', full: 'Efficiency' },
  { key: 'timeliness', label: 'T', full: 'Timeliness' },
] as const;

type LocalScore = { quality: number | null; efficiency: number | null; timeliness: number | null };

export const Phase2RatingPanel: React.FC<{
  currentEmployeeId: string | null;
  officeScope?: OfficeScope | null;
}> = ({ currentEmployeeId, officeScope }) => {
  const [submissions, setSubmissions] = useState<RatingSheet[]>([]);
  const [collapsedPositions, setCollapsedPositions] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);
  
  // Rating inputs state
  const [scores, setScores] = useState<Record<string, LocalScore>>({});
  
  // Edit mode state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMfo, setEditMfo] = useState<Record<string, string>>({}); // mfoId -> title
  const [editSi, setEditSi] = useState<Record<string, string>>({});   // siId -> description
  const [editAccomplishment, setEditAccomplishment] = useState<Record<string, string>>({}); // siId -> accomplishment
  const [savingEdits, setSavingEdits] = useState(false);

  // Return state
  const [returnDraftId, setReturnDraftId] = useState<string | null>(null);
  const [returnComment, setReturnComment] = useState('');

  const [saving, setSaving] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  // Which sheet the current notice came from. The panel-level banner sits at the
  // top, far above the action buttons once a few sheets are expanded, so a
  // failed approval read as the button doing nothing. This echoes the message
  // beside the buttons that produced it.
  const [noticeSheetId, setNoticeSheetId] = useState<string | null>(null);

  const togglePositionCollapse = (pos: string) => {
    setCollapsedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const refreshList = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingList(true);
    const res = await listPendingRatingApprovals(officeScope);
    if (!isSilent) setLoadingList(false);
    if (res.ok === false) {
      setNotice({ tone: 'err', text: res.error });
      return;
    }
    setSubmissions(res.data);

    // Initialize scores with what the employee self-rated
    const initScores: Record<string, LocalScore> = {};
    for (const sheet of res.data) {
      for (const m of sheet.mfos) {
        for (const si of m.indicators) {
          initScores[si.successIndicatorId] = {
            quality: si.quality,
            efficiency: si.efficiency,
            timeliness: si.timeliness
          };
        }
      }
    }
    setScores(prev => ({ ...initScores, ...prev })); // merge preserving local edits
  }, [officeScope]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useRealtimeRefresh({
    channel: 'pm-phase2-rating-panel-console',
    tables: ['target_settings', 'success_indicator_ratings', 'ipcr_workspace', 'ipcr_submissions'],
    onChange: useCallback(() => {
      void refreshList(true);
    }, [refreshList]),
  });

  const groupedSubmissions = useMemo(() => {
    const groups: Record<string, RatingSheet[]> = {};
    for (const s of submissions) {
      const pos = s.position || 'Other Positions';
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Other Positions') return 1;
      if (b === 'Other Positions') return -1;
      return a.localeCompare(b);
    });
  }, [submissions]);

  const setScore = (siId: string, dim: keyof LocalScore, value: number | null) => {
    setScores((prev) => ({
      ...prev,
      [siId]: { ...prev[siId], [dim]: value },
    }));
  };

  const handleApproveRating = async (sheet: RatingSheet) => {
    setApprovalBusyId(sheet.targetSettingId);
    setNotice(null);
    setNoticeSheetId(sheet.targetSettingId);

    const indicatorIds = sheet.mfos.flatMap(m => m.indicators.map(si => si.successIndicatorId));
    
    // Check if all scored
    const incomplete = indicatorIds.some(id => {
      const s = scores[id];
      return !s || s.quality == null || s.efficiency == null || s.timeliness == null;
    });

    if (incomplete) {
      alert('Please score every indicator on Quality, Efficiency, and Timeliness before completing.');
      setApprovalBusyId(null);
      return;
    }

    const res = await saveRatings({
      targetSettingId: sheet.targetSettingId,
      raterEmployeeId: currentEmployeeId,
      ratings: indicatorIds.map(id => ({
        successIndicatorId: id,
        quality: scores[id]?.quality ?? null,
        efficiency: scores[id]?.efficiency ?? null,
        timeliness: scores[id]?.timeliness ?? null,
      })),
      complete: true,
    });

    setApprovalBusyId(null);
    if (res.ok === false) {
      setNotice({ tone: 'err', text: res.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text: `Approved ratings and finalized IPCR for ${sheet.employeeName}. Overall Score: ${res.data.overallScore?.toFixed(2) ?? '—'}.`,
    });
    void refreshList();
  };

  const handleReturn = async (sheet: RatingSheet) => {
    setApprovalBusyId(sheet.targetSettingId);
    setNotice(null);
    const res = await returnPhase2ForRevision({
      targetSettingId: sheet.targetSettingId,
      approverEmployeeId: currentEmployeeId,
      submitterEmployeeId: sheet.employeeId,
      comment: returnComment,
    });
    setApprovalBusyId(null);
    if (res.ok === false) {
      setNotice({ tone: 'err', text: res.error });
      return;
    }
    setNotice({
      tone: 'ok',
      text: `Returned IPCR accomplishments of ${sheet.employeeName} for revision.`,
    });
    setReturnDraftId(null);
    setReturnComment('');
    void refreshList();
  };

  const startEdit = (sheet: RatingSheet) => {
    setEditingId(sheet.targetSettingId);
    
    const mfoTitles: Record<string, string> = {};
    const siDescs: Record<string, string> = {};
    const accomplishments: Record<string, string> = {};

    for (const m of sheet.mfos) {
      mfoTitles[m.id] = m.title;
      for (const si of m.indicators) {
        siDescs[si.successIndicatorId] = si.description;
        accomplishments[si.successIndicatorId] = si.accomplishment;
      }
    }

    setEditMfo(mfoTitles);
    setEditSi(siDescs);
    setEditAccomplishment(accomplishments);
  };

  const saveEdits = async (sheet: RatingSheet) => {
    setSavingEdits(true);
    setNotice(null);

    const res = await adminEditRatings({
      targetSettingId: sheet.targetSettingId,
      approverEmployeeId: currentEmployeeId,
      submitterEmployeeId: sheet.employeeId,
      mfos: sheet.mfos.map(m => ({ id: m.id, title: editMfo[m.id] ?? m.title })),
      indicators: sheet.mfos.flatMap(m => m.indicators.map(si => ({ id: si.successIndicatorId, description: editSi[si.successIndicatorId] ?? si.description }))),
      accomplishments: sheet.mfos.flatMap(m => m.indicators.map(si => ({ successIndicatorId: si.successIndicatorId, accomplishment: editAccomplishment[si.successIndicatorId] ?? si.accomplishment }))),
    });

    setSavingEdits(false);
    if (res.ok === false) {
      setNotice({ tone: 'err', text: res.error });
      return;
    }
    setNotice({ tone: 'ok', text: `Saved overrides to ${sheet.employeeName}'s IPCR.` });
    setEditingId(null);
    void refreshList();
  };

  const openWindow = async () => {
    if (!window.confirm('Open the self-rating period for ALL employees with locked, approved IPCRs? They will be notified and able to submit their Phase 2 self-ratings.')) return;
    setOpening(true);
    setNotice(null);
    const res = await openSelfRatingPeriod({ openedBy: currentEmployeeId ?? 'office_account' });
    if (res.ok === false) { setOpening(false); setNotice({ tone: 'err', text: res.error }); return; }
    const ids = res.data.employeeIds;
    if (ids.length) {
      await createNotifications(ids.map((id) => ({
        employeeId: id,
        type: 'phase2_open',
        title: 'Self-rating period is now open',
        message: 'The Accomplishments & Self-Ratings module is now available. Please encode your achievements and self-ratings for this rating period.',
        link: '/employee/ipcr-workspace',
      })));
    }
    setOpening(false);
    setNotice({ tone: 'ok', text: ids.length ? `Self-rating period opened for ${ids.length} employee(s); notifications sent.` : 'No locked records to open (all already open or submitted).' });
    void refreshList();
  };

  const closeWindow = async () => {
    if (!window.confirm('Close the self-rating period? Employees with open/in-progress ratings will switch to a read-only view of what they saved (unsubmitted work is preserved). They will be notified.')) return;
    setClosing(true);
    setNotice(null);
    const res = await closeSelfRatingPeriod({ closedBy: currentEmployeeId ?? 'office_account' });
    if (res.ok === false) { setClosing(false); setNotice({ tone: 'err', text: res.error }); return; }
    const ids = res.data.employeeIds;
    if (ids.length) {
      await createNotifications(ids.map((id) => ({
        employeeId: id,
        type: 'phase2_closed',
        title: 'Self-rating period has closed',
        message: 'The Accomplishments & Self-Ratings window has closed. Your saved ratings are now read-only for this rating period.',
        link: '/employee/ipcr-workspace',
      })));
    }
    setClosing(false);
    setNotice({ tone: 'ok', text: ids.length ? `Self-rating period closed for ${ids.length} employee(s); notifications sent.` : 'No open records to close.' });
    void refreshList();
  };

  const avgOf = (nums: Array<number | null>): number | null => {
    const f = nums.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
    return f.length ? Number((f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)) : null;
  };

  return (
    <div className="space-y-4">
      {/* Title block */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">IPCR Ratings & Accomplishments Awaiting Approval</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Review submitted accomplishments and self-ratings, enter supervisor scores (Quality, Efficiency, Timeliness), and approve or return for revision.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => void openWindow()}
            disabled={opening || closing}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Open Rating Period'}
          </button>
          <button
            onClick={() => void closeWindow()}
            disabled={opening || closing}
            className="rounded-lg border border-amber-300 bg-white hover:bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
          >
            {closing ? 'Closing…' : 'Close Rating Period'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-lg px-3 py-2 text-xs font-semibold ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
          {notice.text}
        </div>
      )}

      {loadingList ? (
        <p className="text-xs text-slate-500">Loading submissions…</p>
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-slate-600">No Phase 2 submissions are awaiting approval.</p>
          <p className="text-xs text-slate-400 mt-1">Submissions appear here once employees submit their accomplishments and self-ratings.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSubmissions.map(([pos, items]) => {
            const isCollapsed = collapsedPositions.has(pos);
            return (
              <div key={pos} className="space-y-3">
                <button
                  type="button"
                  onClick={() => togglePositionCollapse(pos)}
                  className="flex w-full items-center justify-between border-b border-slate-200 pb-2 text-left transition hover:opacity-85"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800 tracking-tight">{pos}</span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                      {items.length} pending
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>

                {!isCollapsed && (
                  <div className="space-y-4 pl-1">
                    {items.map((sheet) => {
                      const isOwn = !!currentEmployeeId && currentEmployeeId === sheet.employeeId;
                      const busy = approvalBusyId === sheet.targetSettingId;
                      const editing = editingId === sheet.targetSettingId;

                      return (
                        <div key={sheet.targetSettingId} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 bg-slate-50/40">
                            <div>
                              <p className="text-sm font-bold text-slate-800">{sheet.employeeName}</p>
                              <p className="text-[11px] text-slate-500">
                                {[sheet.position, sheet.department].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800">
                                Accomplishments Submitted
                              </span>
                            </div>
                          </div>

                          <div className="px-4 py-4 space-y-4">
                            {(['core', 'strategic', 'support'] as const).map((ft) => {
                              const group = sheet.mfos.filter((m) => m.functionType === ft);
                              if (group.length === 0) return null;
                              return (
                                <div key={ft} className="space-y-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">{FUNCTION_LABEL[ft]}</p>
                                  <div className="space-y-3">
                                    {group.map((m) => (
                                      <div key={m.id} className="rounded-lg bg-slate-50/50 border border-slate-100 p-3">
                                        {editing ? (
                                          <input
                                            value={editMfo[m.id] ?? ''}
                                            onChange={(e) => setEditMfo((prev) => ({ ...prev, [m.id]: e.target.value }))}
                                            className="w-full mb-2 rounded border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-slate-850 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                          />
                                        ) : (
                                          <p className="text-xs font-bold text-slate-800 mb-2">{m.title || '(untitled MFO)'}</p>
                                        )}

                                        <div className="space-y-2.5">
                                          {m.indicators.map((si) => {
                                            const selfAvg = avgOf([si.quality, si.efficiency, si.timeliness]);
                                            const supervisorScore = scores[si.successIndicatorId] ?? { quality: null, efficiency: null, timeliness: null };
                                            const supervisorAvg = avgOf([supervisorScore.quality, supervisorScore.efficiency, supervisorScore.timeliness]);

                                            return (
                                              <div key={si.successIndicatorId} className="bg-white rounded-lg border border-slate-150 p-3 text-xs space-y-2">
                                                {/* Target Indicator */}
                                                <div>
                                                  <span className="text-[10px] font-extrabold uppercase text-slate-400 block tracking-wider">Success Indicator (Phase 1 Target)</span>
                                                  {editing ? (
                                                    <input
                                                      value={editSi[si.successIndicatorId] ?? ''}
                                                      onChange={(e) => setEditSi((prev) => ({ ...prev, [si.successIndicatorId]: e.target.value }))}
                                                      className="w-full mt-1 rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-750 focus:outline-none"
                                                    />
                                                  ) : (
                                                    <p className="text-slate-800 font-medium mt-0.5">{si.description}</p>
                                                  )}
                                                </div>

                                                {/* Accomplishment */}
                                                <div>
                                                  <span className="text-[10px] font-extrabold uppercase text-indigo-500 block tracking-wider">Employee Achievement (Phase 2 Accomplishment)</span>
                                                  {editing ? (
                                                    <textarea
                                                      rows={2}
                                                      value={editAccomplishment[si.successIndicatorId] ?? ''}
                                                      onChange={(e) => setEditAccomplishment((prev) => ({ ...prev, [si.successIndicatorId]: e.target.value }))}
                                                      className="w-full mt-1 rounded border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-750 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                    />
                                                  ) : (
                                                    <p className="text-slate-700 italic mt-0.5 bg-slate-50 p-2 rounded border border-slate-100">
                                                      {si.accomplishment || 'No accomplishments encoded.'}
                                                    </p>
                                                  )}
                                                </div>

                                                {/* Ratings Section */}
                                                <div className="pt-1 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 mt-2">
                                                  {/* Employee Self-Ratings */}
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-400">Self-Rating:</span>
                                                    <div className="flex gap-2">
                                                      {DIMENSIONS.map((d) => (
                                                        <span key={d.key} className="text-[10px] text-slate-650 bg-slate-100 px-1.5 py-0.5 rounded font-semibold">
                                                          {d.label}: <strong className="text-slate-800">{si[d.key] ?? '—'}</strong>
                                                        </span>
                                                      ))}
                                                      <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-bold">
                                                        A: {selfAvg != null ? selfAvg.toFixed(2) : '—'}
                                                      </span>
                                                    </div>
                                                  </div>

                                                  {/* Supervisor Rating Selectors */}
                                                  <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold text-indigo-600">Final Rating:</span>
                                                    <div className="flex gap-2">
                                                      {DIMENSIONS.map((d) => (
                                                        <label key={d.key} className="flex items-center gap-1">
                                                          <span className="text-[10px] font-extrabold text-slate-500" title={d.full}>{d.label}</span>
                                                          <select
                                                            disabled={isOwn || editing}
                                                            value={supervisorScore[d.key] ?? ''}
                                                            onChange={(e) => setScore(si.successIndicatorId, d.key, e.target.value === '' ? null : Number(e.target.value))}
                                                            className="rounded border border-slate-300 px-1 py-0.5 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                                          >
                                                            <option value="">—</option>
                                                            {[1, 2, 3, 4, 5].map((n) => (<option key={n} value={n}>{n}</option>))}
                                                          </select>
                                                        </label>
                                                      ))}
                                                      <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded font-bold self-center">
                                                        Final A: {supervisorAvg != null ? supervisorAvg.toFixed(2) : '—'}
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Echo of the panel banner, next to the buttons that
                              produced it — the banner at the top of the panel is
                              off-screen by the time you reach these actions. */}
                          {notice && noticeSheetId === sheet.targetSettingId && (
                            <div
                              className={`mx-4 mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                                notice.tone === 'ok'
                                  ? 'border border-emerald-100 bg-emerald-50 text-emerald-800'
                                  : 'border border-rose-100 bg-rose-50 text-rose-700'
                              }`}
                            >
                              {notice.text}
                            </div>
                          )}

                          {/* Footer Actions */}
                          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 bg-slate-50/20">
                            {isOwn ? (
                              <p className="text-[11px] font-semibold text-slate-500">
                                This is your own IPCR — it must be rated by another Office Account.
                              </p>
                            ) : editing ? (
                              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-indigo-600">
                                  Editing Mode — modify MFO, indicator text, or accomplishments.
                                </span>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => void saveEdits(sheet)}
                                    disabled={savingEdits}
                                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                  >
                                    {savingEdits ? 'Saving…' : 'Save Edits'}
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    disabled={savingEdits}
                                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : returnDraftId === sheet.targetSettingId ? (
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <input
                                  type="text"
                                  value={returnComment}
                                  onChange={(e) => setReturnComment(e.target.value)}
                                  placeholder="Reason for returning accomplishments for revision (optional)"
                                  className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                                <button
                                  onClick={() => void handleReturn(sheet)}
                                  disabled={busy}
                                  className="rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  Confirm Return
                                </button>
                                <button
                                  onClick={() => { setReturnDraftId(null); setReturnComment(''); }}
                                  disabled={busy}
                                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => void handleApproveRating(sheet)}
                                  disabled={busy}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  {busy ? 'Working…' : 'Approve & Complete Rating'}
                                </button>
                                <button
                                  onClick={() => startEdit(sheet)}
                                  disabled={busy}
                                  className="rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50"
                                >
                                  Edit / Override
                                </button>
                                <button
                                  onClick={() => { setReturnDraftId(sheet.targetSettingId); setReturnComment(''); }}
                                  disabled={busy}
                                  className="rounded-lg border border-amber-300 bg-white hover:bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                                >
                                  Return for Revision
                                </button>
                              </>
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
        </div>
      )}
    </div>
  );
};
