import React, { useState, useEffect, useMemo } from 'react';
import { supabase as supabaseClient } from '../lib/supabase';
import { PositionRequirementsV2 } from '../lib/api/successionScoringV2';
import {
  fetchSuccessionReviews,
  batchSaveSuccessionReviews,
  SaveEvidenceReviewInput,
  organizeReviewsByEmployee,
} from '../lib/api/successionReviews';

export interface CandidateEvidenceReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: { employeeId: string; name: string };
  criticalPosition: {
    id: string;
    title: string;
    requirements: PositionRequirementsV2;
  };
  onReviewSaved: () => void;
}

interface RawWork {
  id: string;
  position_title: string | null;
  company_name: string | null;
  from_date: string | null;
  to_date: string | null;
  is_present: boolean | null;
}

interface RawTraining {
  id: string;
  training_title: string | null;
  number_of_hours: number | null;
  from_date: string | null;
  to_date: string | null;
  conducted_by: string | null;
}

interface RawEducation {
  id: string;
  level: string | null;
  course: string | null;
  year_graduated: number | null;
}

interface RawEligibility {
  id: string;
  eligibility_type: string | null;
  validity_date: string | null;
}

export const CandidateEvidenceReviewModal: React.FC<CandidateEvidenceReviewModalProps> = ({
  isOpen,
  onClose,
  candidate,
  criticalPosition,
  onReviewSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workList, setWorkList] = useState<RawWork[]>([]);
  const [trainingList, setTrainingList] = useState<RawTraining[]>([]);
  const [educationList, setEducationList] = useState<RawEducation[]>([]);
  const [eligibilityList, setEligibilityList] = useState<RawEligibility[]>([]);

  // Local state for decisions: key = criterion:sourceId
  const [decisions, setDecisions] = useState<
    Record<
      string,
      {
        isRelevant: boolean | null;
        isCityHall: boolean | null;
        matchesRequirement: boolean | null;
      }
    >
  >({});

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadData() {
      try {
        const empId = candidate.employeeId;
        const [
          { data: work, error: workError },
          { data: training, error: trainingError },
          { data: education, error: educationError },
          { data: eligibility, error: eligibilityError },
          reviews,
        ] = await Promise.all([
          (supabaseClient as any)
            .from('employee_work_experience')
            .select('id, position_title, company_name, from_date, to_date, is_present')
            .eq('employee_id', empId),
          (supabaseClient as any)
            .from('employee_training')
            .select('id, training_title, number_of_hours, from_date, to_date, conducted_by')
            .eq('employee_id', empId),
          (supabaseClient as any)
            .from('employee_education')
            .select('id, level, course, year_graduated')
            .eq('employee_id', empId),
          (supabaseClient as any)
            .from('employee_eligibility')
            .select('id, eligibility_type, validity_date')
            .eq('employee_id', empId),
          fetchSuccessionReviews(criticalPosition.id, empId),
        ]);

        if (!isMounted) return;

        if (workError) throw new Error(`Failed to load work experience: ${workError.message}`);
        if (trainingError) throw new Error(`Failed to load training records: ${trainingError.message}`);
        if (educationError) throw new Error(`Failed to load education records: ${educationError.message}`);
        if (eligibilityError) throw new Error(`Failed to load eligibility records: ${eligibilityError.message}`);

        setWorkList(work ?? []);
        setTrainingList(training ?? []);
        setEducationList(education ?? []);
        setEligibilityList(eligibility ?? []);

        const initialDecisions: typeof decisions = {};
        const reviewMap = organizeReviewsByEmployee(reviews).get(empId);

        if (reviewMap) {
          for (const [key, rev] of reviewMap.entries()) {
            initialDecisions[key] = {
              isRelevant: rev.isRelevant,
              isCityHall: rev.isCityHall,
              matchesRequirement: rev.matchesRequirement,
            };
          }
        }

        setDecisions(initialDecisions);
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load candidate evidence');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, candidate.employeeId, criticalPosition.id]);

  const updateDecision = (
    criterion: string,
    sourceId: string,
    patch: Partial<{
      isRelevant: boolean | null;
      isCityHall: boolean | null;
      matchesRequirement: boolean | null;
    }>,
  ) => {
    const key = `${criterion}:${sourceId}`;
    setDecisions((prev) => ({
      ...prev,
      [key]: {
        isRelevant: prev[key]?.isRelevant ?? null,
        isCityHall: prev[key]?.isCityHall ?? null,
        matchesRequirement: prev[key]?.matchesRequirement ?? null,
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const reqSnapshot = criticalPosition.requirements as unknown as Record<string, unknown>;
      const inputs: SaveEvidenceReviewInput[] = [];

      // Work reviews
      for (const w of workList) {
        const key = `work:${w.id}`;
        const dec = decisions[key];
        if (dec && (dec.isRelevant !== null || dec.isCityHall !== null)) {
          inputs.push({
            criticalPositionId: criticalPosition.id,
            employeeId: candidate.employeeId,
            criterion: 'work',
            sourceRecordId: w.id,
            isRelevant: dec.isRelevant,
            isCityHall: dec.isCityHall,
            evidenceSnapshot: {
              from_date: w.from_date,
              to_date: w.to_date,
              is_present: w.is_present,
              position_title: w.position_title,
            },
            requirementsSnapshot: reqSnapshot,
          });
        }
      }

      // Training reviews
      for (const t of trainingList) {
        const key = `training:${t.id}`;
        const dec = decisions[key];
        if (dec && (dec.isRelevant !== null || dec.isCityHall !== null)) {
          inputs.push({
            criticalPositionId: criticalPosition.id,
            employeeId: candidate.employeeId,
            criterion: 'training',
            sourceRecordId: t.id,
            isRelevant: dec.isRelevant,
            isCityHall: dec.isCityHall,
            evidenceSnapshot: {
              title: t.training_title,
              hours: t.number_of_hours,
              from_date: t.from_date,
              to_date: t.to_date,
            },
            requirementsSnapshot: reqSnapshot,
          });
        }
      }

      // Education reviews
      for (const ed of educationList) {
        const key = `education:${ed.id}`;
        const dec = decisions[key];
        if (dec && (dec.isRelevant !== null || dec.matchesRequirement !== null)) {
          inputs.push({
            criticalPositionId: criticalPosition.id,
            employeeId: candidate.employeeId,
            criterion: 'education',
            sourceRecordId: ed.id,
            isRelevant: dec.isRelevant,
            matchesRequirement: dec.matchesRequirement,
            evidenceSnapshot: { level: ed.level, course: ed.course },
            requirementsSnapshot: reqSnapshot,
          });
        }
      }

      // Eligibility reviews
      for (const el of eligibilityList) {
        const key = `eligibility:${el.id}`;
        const dec = decisions[key];
        if (dec && (dec.isRelevant !== null || dec.matchesRequirement !== null)) {
          inputs.push({
            criticalPositionId: criticalPosition.id,
            employeeId: candidate.employeeId,
            criterion: 'eligibility',
            sourceRecordId: el.id,
            isRelevant: dec.isRelevant,
            matchesRequirement: dec.matchesRequirement,
            evidenceSnapshot: {
              eligibility_type: el.eligibility_type,
              validity_date: el.validity_date,
            },
            requirementsSnapshot: reqSnapshot,
          });
        }
      }

      if (inputs.length > 0) {
        await batchSaveSuccessionReviews(inputs);
      }

      onReviewSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save review decisions');
    } finally {
      setSaving(false);
    }
  };

  // Summary counts
  const totalRecords =
    workList.length + trainingList.length + educationList.length + eligibilityList.length;

  const reviewedRecords = useMemo(() => {
    let count = 0;
    for (const w of workList) {
      const d = decisions[`work:${w.id}`];
      if (d?.isRelevant !== null && d?.isCityHall !== null) count++;
    }
    for (const t of trainingList) {
      const d = decisions[`training:${t.id}`];
      if (d?.isRelevant !== null && d?.isCityHall !== null) count++;
    }
    for (const ed of educationList) {
      const d = decisions[`education:${ed.id}`];
      if (d?.isRelevant !== null && d?.matchesRequirement !== null) count++;
    }
    for (const el of eligibilityList) {
      const d = decisions[`eligibility:${el.id}`];
      if (d?.isRelevant !== null) count++;
    }
    return count;
  }, [workList, trainingList, educationList, eligibilityList, decisions]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="modal-title" className="text-xl font-bold text-[var(--p9,#040E6B)]">
              Evidence Relevance Review
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Candidate: <strong className="text-slate-800">{candidate.name}</strong> &middot; Target Position: <strong className="text-slate-800">{criticalPosition.title}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Requirements Banner */}
        <div className="border-b border-slate-100 bg-slate-50/75 px-6 py-2.5 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span>
              <strong>Exp Required:</strong> {criticalPosition.requirements.experienceYears ?? 0} yrs (Max 20 pts at {((criticalPosition.requirements.experienceYears ?? 0) * 2)} yrs)
            </span>
            <span>
              <strong>Training:</strong> {criticalPosition.requirements.trainingHours ?? 0} hrs (Max 20 pts at {((criticalPosition.requirements.trainingHours ?? 0) * 2)} hrs)
            </span>
            <span>
              <strong>Education:</strong> {criticalPosition.requirements.education?.minimum ?? 'None'} ({criticalPosition.requirements.education?.field ?? 'Any'})
            </span>
            <span>
              <strong>Eligibility:</strong> {criticalPosition.requirements.eligibility?.kind === 'required' ? criticalPosition.requirements.eligibility.key : 'None'}
            </span>
            <span className="ml-auto font-medium text-[var(--p,#363EE8)]">
              Reviewed: {reviewedRecords} / {totalRecords} items
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading evidence records...</div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : (
            <>
              {/* 1. Work Experience */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--p9,#040E6B)]">
                    1. Work Experience (20% Max &middot; City Hall Only)
                  </h3>
                  <span className="text-xs text-slate-400">{workList.length} record(s)</span>
                </div>
                {workList.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                    No work experience on file for this candidate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {workList.map((w) => {
                      const dec = decisions[`work:${w.id}`] ?? { isRelevant: null, isCityHall: null };
                      return (
                        <div
                          key={w.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 gap-3"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{w.position_title ?? 'Untitled Role'}</div>
                            <div className="text-xs text-slate-500">
                              {w.company_name || 'City Hall'} &middot;{' '}
                              {w.from_date ?? '?'} to {w.is_present ? 'Present' : w.to_date ?? '?'}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isRelevant === true}
                                onChange={(e) => updateDecision('work', w.id, { isRelevant: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Relevant to Position</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isCityHall === true}
                                onChange={(e) => updateDecision('work', w.id, { isCityHall: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>City Hall Service</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 2. Training */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--p9,#040E6B)]">
                    2. Relevant Training (20% Max &middot; Internal & External)
                  </h3>
                  <span className="text-xs text-slate-400">{trainingList.length} record(s)</span>
                </div>
                {trainingList.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                    No training records on file for this candidate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trainingList.map((t) => {
                      const dec = decisions[`training:${t.id}`] ?? { isRelevant: null, isCityHall: null };
                      return (
                        <div
                          key={t.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 gap-3"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{t.training_title ?? 'Untitled Training'}</div>
                            <div className="text-xs text-slate-500">
                              {t.number_of_hours ?? 0} hours &middot; Provider: {t.conducted_by || 'Unknown'} &middot;{' '}
                              {t.from_date ?? ''} to {t.to_date ?? ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isRelevant === true}
                                onChange={(e) => updateDecision('training', t.id, { isRelevant: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Relevant Training</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isCityHall === true}
                                onChange={(e) => updateDecision('training', t.id, { isCityHall: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Internal / City Hall</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 3. Education */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--p9,#040E6B)]">
                    3. Educational Attainment (15% Max &middot; 3/9/15 pts)
                  </h3>
                  <span className="text-xs text-slate-400">{educationList.length} record(s)</span>
                </div>
                {educationList.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                    No education records on file for this candidate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {educationList.map((ed) => {
                      const dec = decisions[`education:${ed.id}`] ?? { isRelevant: null, matchesRequirement: null };
                      return (
                        <div
                          key={ed.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 gap-3"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">{ed.course ?? 'General Degree'}</div>
                            <div className="text-xs text-slate-500">
                              Level: {ed.level || 'Degree'} {ed.year_graduated ? `· Graduated ${ed.year_graduated}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isRelevant === true}
                                onChange={(e) => updateDecision('education', ed.id, { isRelevant: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Relevant to Job</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.matchesRequirement === true}
                                onChange={(e) =>
                                  updateDecision('education', ed.id, { matchesRequirement: e.target.checked })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Matches Required Minimum</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 4. Eligibility */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--p9,#040E6B)]">
                    4. Eligibility (15% Max &middot; 0/7.5/15 pts)
                  </h3>
                  <span className="text-xs text-slate-400">{eligibilityList.length} record(s)</span>
                </div>
                {eligibilityList.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                    No civil service eligibility on file for this candidate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {eligibilityList.map((el) => {
                      const dec = decisions[`eligibility:${el.id}`] ?? { isRelevant: null, matchesRequirement: null };
                      return (
                        <div
                          key={el.id}
                          className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300 gap-3"
                        >
                          <div>
                            <div className="font-semibold text-slate-800 text-sm">
                              {el.eligibility_type || 'Civil Service Eligibility'}
                            </div>
                            <div className="text-xs text-slate-500">
                              Validity: {el.validity_date ? el.validity_date : 'Non-expiring / Lifetime'}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs font-medium shrink-0">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.isRelevant === true}
                                onChange={(e) => updateDecision('eligibility', el.id, { isRelevant: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Recognized &amp; Relevant</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={dec.matchesRequirement === true}
                                onChange={(e) =>
                                  updateDecision('eligibility', el.id, { matchesRequirement: e.target.checked })
                                }
                                className="h-4 w-4 rounded border-slate-300 text-[var(--p,#363EE8)] focus:ring-[var(--p,#363EE8)]"
                              />
                              <span>Matches Position Minimum</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50/50 rounded-b-2xl">
          <div className="text-xs text-slate-500">
            Decisions are saved per-position. Modifying source records later invalidates previous reviews.
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-lg bg-[var(--p,#363EE8)] px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[var(--p7,#191FA8)] disabled:opacity-50"
            >
              {saving ? 'Saving Decisions...' : 'Save Review'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
