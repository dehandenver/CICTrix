import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Eye,
  FolderOpen,
  Info,
  Lock,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { useBackClosesView } from '../hooks/useHistoryBack';
import { supabase } from '../lib/supabase';
import { applicantAttachmentDocument, listApplicantDocumentAttachments, type ViewerDocument } from '../lib/documentViewing';
import { BackButton } from './BackButton';
import { DocumentCollectionModal } from './DocumentCollectionModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import {
  fetchLatestEvaluationForApplicantOrEmailAnySource,
  subscribeToEvaluationChanges,
  type EvaluationSnapshot,
} from '../lib/evaluationScores';
import { Modal } from './modal';
import { TableStateRows, TopScorerBadge, topScorerIds, topScorerRowClass } from './data-table';
import { getAdminRole } from '../lib/adminSession';
import { fetchWrittenExamTotals, saveWrittenExamTotal, type SaveExamTotalResult } from '../lib/api/examTotalPoints';
import {
  CATEGORY_SCORES_UPDATED_EVENT,
  fetchApplicantCategoryScores,
  fetchApplicantScoreSummaries,
  isUuid,
  saveApplicantCategoryScores,
  savePositionWrittenExamScores,
  type ApplicantCategoryScores,
  type ApplicantScoreSummary,
} from '../lib/api/applicantScores';
import {
  DEFAULT_WRITTEN_EXAM_TOTAL,
  WRITTEN_EXAM_SHARE,
  canEditExamTotal,
  convertExamScore,
  describeBlockedTotal,
  findScoresAboveTotal,
  formatScoreOverTotal,
  totalForPosition,
  validateExamScore,
  validateTotalPoints,
  type ScoredApplicant,
} from '../lib/examTotalPoints';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ApplicantRecord {
  id: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  /** Last change to the row; the closest available stand-in for when the applicant qualified. */
  updated_at?: string | null;
  total_score: number | null;
  /** 'promotion' = applicant is a current employee (verified via wizard auth);
      'job' / null = new applicant. Drives appointment-type lock in scoring modal. */
  application_type?: string | null;
  /** Application tracking code (migration 20260923). */
  reference_no?: string | null;
  // Schedule + interviewer assignment (migration 007). Drives the Pending
  // Assignment subtab → Applicant Score subtab progression.
  exam_date?: string | null;
  exam_time?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  assigned_interviewer_email?: string | null;
  /** Educational attainment from the application form (raw string). Used to auto-fill Education score. */
  education_level?: string | null;
  /** Years of experience from the application form. Used to auto-fill Experience score. */
  years_of_experience?: number | null;
}


type ExamStatus      = 'pending' | 'in-progress' | 'completed';
type CatKey          = 'education' | 'experience' | 'performance' | 'pcpt' | 'potential' | 'writtenExam' | 'oralExam';
type AppointmentType = 'original' | 'promotional';
type PositionType    = 'rank-and-file' | 'executive';

interface PositionFolder {
  position:   string;
  office:     string;
  count:      number;
  examStatus: ExamStatus;
  applicants: ApplicantRecord[];
}

interface AttachmentRow {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string;
  document_type?: string;
  created_at?: string;
  file_size?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_META: Record<CatKey, {
  roman: string; label: string;
  maxOriginal: number; maxPromotional: number;
  color: string; bg: string; border: string; badgeBg: string;
  rspOwned: boolean; guide: string;
}> = {
  education:   {
    roman: 'I',   label: 'Education',         maxOriginal: 20, maxPromotional: 20,
    color: '#363EE8', bg: '#EEF0FD', border: '#C8D1FF', badgeBg: '#EEF0FD', rspOwned: true,
    guide: "Can Read/Write = 3 | Elem Undergrad = 5 | Elem Graduate = 7 | HS Undergrad = 9 | HS Graduate = 11 | Vocational = 13 | College Undergrad = 14 | College Graduate = 15 | Master's = 18 | Doctorate = 20",
  },
  experience:  {
    roman: 'II',  label: 'Experience',         maxOriginal: 20, maxPromotional: 20,
    color: '#040E6B', bg: '#E8EBF9', border: '#A5ACEE', badgeBg: '#E8EBF9', rspOwned: true,
    guide: '1-5 yrs = 12 pts | 6-10 yrs = 14 pts | 11-15 yrs = 16 pts | 16-20 yrs = 18 pts | 21+ yrs = 20 pts',
  },
  performance: {
    roman: 'III', label: 'Performance Rating', maxOriginal: 0,  maxPromotional: 20,
    color: '#5B65F0', bg: '#ECEEFF', border: '#C8D1FF', badgeBg: '#ECEEFF', rspOwned: true,
    guide: 'Outstanding = 14 pts (Equiv 70) | Very Satisfactory = 12 pts (Equiv 60)',
  },
  pcpt:        {
    roman: 'IV',  label: 'PCPT',               maxOriginal: 20, maxPromotional: 10,
    color: '#363EE8', bg: '#EEF0FD', border: '#C8D1FF', badgeBg: '#EEF0FD', rspOwned: false,
    guide: '20-22 = 10 pts | 23-25 = 12 pts | 26-28 = 14 pts | 29-31 = 16 pts | 32-34 = 18 pts | 35 = 20 pts',
  },
  potential:   {
    roman: 'V',   label: 'Potential',           maxOriginal: 0,  maxPromotional: 20,
    color: '#2A31C4', bg: '#E8EAF5', border: '#B5BCEC', badgeBg: '#E8EAF5', rspOwned: false,
    guide: '51-60 = 12 pts | 61-70 = 14 pts | 71-80 = 16 pts | 81-90 = 18 pts | 91-100 = 20 pts',
  },
  writtenExam: {
    roman: '—',   label: 'Written Exam',        maxOriginal: DEFAULT_WRITTEN_EXAM_TOTAL, maxPromotional: DEFAULT_WRITTEN_EXAM_TOTAL,
    color: '#0E1789', bg: '#E5E7F5', border: '#9DA5E0', badgeBg: '#E5E7F5', rspOwned: false,
    guide: `Raw score from 0 to the exam's total points. Contributes ${WRITTEN_EXAM_SHARE} points to the overall score.`,
  },
  oralExam: {
    roman: 'V',   label: 'Oral Examination',    maxOriginal: 20,  maxPromotional: 0,
    color: '#5B65F0', bg: '#ECEEFF', border: '#C8D1FF', badgeBg: '#ECEEFF', rspOwned: false,
    guide: 'Overall impression score from interviewer panel. Converted to 20-point scale.',
  },
};

const ADJECTIVAL_RANGES = [
  { min: 90, max: 100, label: 'Excellent',     color: 'var(--score-excellent-text)', bg: 'var(--score-excellent-bg)' },
  { min: 77, max: 89,  label: 'Very Good',     color: 'var(--score-very-good-text)', bg: 'var(--score-very-good-bg)' },
  { min: 64, max: 76,  label: 'Good',          color: 'var(--score-good-text)', bg: 'var(--score-good-bg)' },
  { min: 51, max: 63,  label: 'Average',       color: 'var(--score-average-text)', bg: 'var(--score-average-bg)' },
  { min: 0,  max: 50,  label: 'Below Average', color: 'var(--score-below-average-text)', bg: 'var(--score-below-average-bg)' },
];

const BASE_CATS: CatKey[] = ['education', 'experience', 'performance', 'pcpt', 'potential'];
const MAX_TOTAL = 130;

const DOC_TYPE_MAP: Record<CatKey, string[]> = {
  education:   ['transcript_of_records', 'tor'],
  experience:  ['previous_employer_certificate', 'service_record', 'curriculum_vitae'],
  performance: ['performance_evaluation', 'performance_rating'],
  pcpt:        ['pcpt', 'psychometric'],
  potential:   ['potential_assessment', 'potential'],
  writtenExam: ['written_exam', 'exam_sheet'],
  oralExam:    ['oral_exam', 'oral', 'interview_assessment'],
};

// ─── Storage ──────────────────────────────────────────────────────────────────

// ─── Education / Experience auto-fill helpers ─────────────────────────────────

const educationLevelToPoints = (level: string | null | undefined): number | null => {
  if (!level) return null;
  const l = level.toLowerCase().trim();
  if (l.includes('graduate school') || l.includes('doctoral') || l.includes('doctorate') || l.includes('phd')) return 20;
  if (l.includes('masteral') || l.includes('master')) return 18;
  if (l.includes('college graduate') || l.includes('bachelor') || l.includes('college grad')) return 16;
  if (l.includes('college level') || l.includes('college undergraduate') || l.includes('college undergrad')) return 14;
  if (l.includes('high school graduate') || l.includes('senior high') || l.includes('secondary graduate')) return 13;
  if (l.includes('high school level') || l.includes('high school') || l.includes('secondary')) return 12;
  if (l.includes('elementary graduate') || l.includes('elem graduate') || l.includes('primary graduate')) return 11;
  if (l.includes('elementary level') || l.includes('elementary') || l.includes('primary') || l.includes('elem')) return 10;
  return null;
};

const experienceYearsToPoints = (years: number | null | undefined): number | null => {
  if (years == null || isNaN(Number(years))) return null;
  const y = Number(years);
  if (y >= 21) return 25;
  if (y >= 16) return 18;
  if (y >= 11) return 16;
  if (y >= 6)  return 14;
  if (y >= 1)  return 12;
  return 0;
};

const EXAM_KEY = 'cictrix_exam_scores';
const CAT_KEY  = 'cictrix_category_scores';

const loadExamScores = (): Record<string, Record<string, string>> => {
  try { return JSON.parse(localStorage.getItem(EXAM_KEY) ?? '{}'); } catch { return {}; }
};

const loadCatScores = (): Record<string, ApplicantCategoryScores> => {
  try { return JSON.parse(localStorage.getItem(CAT_KEY) ?? '{}'); } catch { return {}; }
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const normalizeApplicationType = (value: string | null | undefined): AppointmentType => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'promotion' || normalized === 'promotional' ? 'promotional' : 'original';
};

const deriveInitial = (
  applicant: ApplicantRecord,
  saved: Record<string, ApplicantCategoryScores>,
  evalSnapshot?: EvaluationSnapshot | null,
  posExamScore?: string,
): ApplicantCategoryScores => {
  const pct = (applicant.total_score ?? 0) / 100;
  const autoEdu = educationLevelToPoints(applicant.education_level);
  const autoExp = experienceYearsToPoints(applicant.years_of_experience);

  const pcptRaw = typeof evalSnapshot?.pcptRawScore === 'number' ? evalSnapshot.pcptRawScore : null;
  const writtenRaw = typeof evalSnapshot?.writtenExamRawScore === 'number'
    ? evalSnapshot.writtenExamRawScore
    : (posExamScore && !isNaN(Number(posExamScore)) ? Number(posExamScore) : null);
  const oralRaw = typeof evalSnapshot?.oralRawScore === 'number' ? evalSnapshot.oralRawScore : null;

  // Full template with every category present — the reader (calcOverall, sv,
  // the score grid) assumes all seven keys exist.
  const fresh: ApplicantCategoryScores = {
    education:   { initialScore: autoEdu ?? +((pct * 20).toFixed(1)),  finalScore: autoEdu,  remarks: '' },
    experience:  { initialScore: autoExp ?? +((pct * 25).toFixed(1)),  finalScore: autoExp,  remarks: '' },
    performance: { initialScore: +((pct * 20).toFixed(1)),             finalScore: null,     remarks: '' },
    pcpt:        { initialScore: pcptRaw ?? +((pct * 20).toFixed(1)),  finalScore: pcptRaw === null ? null : pcptRawToConvertedScore(pcptRaw), remarks: '' },
    potential:   { initialScore: +((pct * 25).toFixed(1)),             finalScore: null,     remarks: '' },
    writtenExam: { initialScore: writtenRaw ?? 0,                      finalScore: writtenRaw, remarks: '' },
    oralExam:    { initialScore: oralRaw ?? 0,                         finalScore: oralRaw === null ? null : oralRawToConvertedScore(oralRaw), remarks: '' },
    appointmentType: normalizeApplicationType(applicant.application_type),
    positionType: 'rank-and-file',
  };
  // Merge any saved scores OVER the full template rather than returning them
  // verbatim: a partial or older-format saved object (missing e.g. performance
  // or writtenExam) would otherwise leave a category undefined and crash the
  // reader with "Cannot read properties of undefined (reading 'finalScore')".
  const savedScores = saved[applicant.id];
  if (!savedScores) return fresh;

  return {
    ...fresh,
    ...savedScores,
    writtenExam: savedScores.writtenExam?.finalScore != null ? savedScores.writtenExam : fresh.writtenExam,
    oralExam: savedScores.oralExam?.finalScore != null ? savedScores.oralExam : fresh.oralExam,
    pcpt: savedScores.pcpt?.finalScore != null ? savedScores.pcpt : fresh.pcpt,
  };
};

const calcOverall = (
  scores: ApplicantCategoryScores,
  examTotal: number = DEFAULT_WRITTEN_EXAM_TOTAL,
): { value: number | null; pct: string | null } => {
  for (const k of BASE_CATS) if ((scores[k]?.finalScore ?? null) === null) return { value: null, pct: null };
  if ((scores.writtenExam?.finalScore ?? null) === null) return { value: null, pct: null };
  const base = BASE_CATS.reduce((s, k) => s + (scores[k]?.finalScore ?? 0), 0);
  const val = +(base + writtenExamRawToConvertedScore(scores.writtenExam?.finalScore ?? 0, examTotal)).toFixed(2);
  return { value: val, pct: ((val / MAX_TOTAL) * 100).toFixed(1) };
};

// Effective score for a category: the value the user can see on its badge.
// Falls back from finalScore → initialScore → 0 so interviewer-owned
// categories (PCPT, Written Exam) still contribute to the total even though
// RSP never sets a finalScore for them — they come in as initialScore via the
// interviewer's saved evaluation snapshot.
const eff = (cat: { finalScore: number | null; initialScore: number }): number =>
  cat.finalScore ?? cat.initialScore ?? 0;

const calcModalScore = (
  scores: ApplicantCategoryScores,
  apptType: AppointmentType,
): number => {
  if (apptType === 'promotional') {
    return eff(scores.education) +
           eff(scores.experience) +
           eff(scores.performance) +
           eff(scores.potential) +
           eff(scores.pcpt);
  }
  // Original: oral exam (20pts) replaces pcpt + written exam contribution
  return eff(scores.education) +
         eff(scores.experience) +
         eff(scores.oralExam);
};

const pcptRawToConvertedScore = (raw: number) => {
  if (raw >= 35) return 20;
  if (raw >= 32) return 18;
  if (raw >= 29) return 16;
  if (raw >= 26) return 14;
  if (raw >= 23) return 12;
  if (raw >= 20) return 10;
  return +Math.max(0, Math.min(20, (raw / 30) * 20)).toFixed(1);
};

// Capped at the 30-point share: a saved score above the current total (e.g.
// entered in another browser) never yields more than WRITTEN_EXAM_SHARE.
const writtenExamRawToConvertedScore = (raw: number, examTotal: number) => convertExamScore(raw, examTotal).points;

const oralRawToConvertedScore = (raw: number) => +Math.min(20, Math.max(0, (raw / 5) * 20)).toFixed(2);

const getAdjectival = (score: number) =>
  ADJECTIVAL_RANGES.find(r => score >= r.min && score <= r.max) ?? ADJECTIVAL_RANGES[4];

const fmtDate = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

const fmtSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

/** A scoring file with its size and upload date, as the old file list showed them. */
const scoringFileDocument = (row: AttachmentRow): ViewerDocument => ({
  ...applicantAttachmentDocument(row),
  subtitle: [fmtSize(row.file_size), row.created_at ? fmtDate(row.created_at) : ''].filter(Boolean).join(' · ') || undefined,
});

/** "Oct 5, 2026 · 5:07 PM" from a date plus an optional "HH:mm[:ss]" time. */
const fmtSchedule = (iso: string, time?: string | null) => {
  const date = fmtDate(iso);
  const [h, m] = (time ?? '').split(':');
  const hour = Number.parseInt(h, 10);
  if (!m || Number.isNaN(hour)) return date;
  return `${date} · ${hour % 12 === 0 ? 12 : hour % 12}:${m.slice(0, 2)} ${hour >= 12 ? 'PM' : 'AM'}`;
};

// True when a schedule date is still upcoming (strictly after today), so the
// Applicant Score table can show "scheduled but not yet happened" in a muted
// secondary colour vs an already-completed (past/today) date in solid navy.
const isUpcoming = (iso?: string | null): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
};

// ─── ExamScoresModal ─────────────────────────────────────────────────────────

interface ExamScoresModalProps {
  folder:         PositionFolder;
  existingScores: Record<string, string>;
  /** Written exam scores saved outside this modal (interviewer evaluations), checked before lowering the total. */
  knownScores:    ScoredApplicant[];
  total:          number;
  canEditTotal:   boolean;
  onSaveTotal:    (total: number) => Promise<SaveExamTotalResult>;
  onClose:        () => void;
  onSave:         (scores: Record<string, string>) => void;
}

const ExamScoresModal = ({ folder, existingScores, knownScores, total, canEditTotal, onSaveTotal, onClose, onSave }: ExamScoresModalProps) => {
  const [scores, setScores] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(folder.applicants.map((a) => [a.id, ''])),
    ...existingScores,
  }));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [totalInput,  setTotalInput]  = useState(String(total));
  const [totalError,  setTotalError]  = useState<string | null>(null);
  const [savingTotal, setSavingTotal] = useState(false);
  const [totalSaved,  setTotalSaved]  = useState(false);

  useEffect(() => { setTotalInput(String(total)); }, [total]);

  const scoreError = (v: string) => validateExamScore(v, total);
  const allFilled = folder.applicants.every((a) => {
    const v = scores[a.id] ?? '';
    return v !== '' && !scoreError(v);
  });
  const totalChanged = totalInput.trim() !== String(total);

  // Lowering the total below a score already entered is blocked (plan D4), so
  // no saved score is ever left above its exam's total by this screen.
  const handleSaveTotal = async () => {
    const invalid = validateTotalPoints(totalInput);
    if (invalid) { setTotalError(invalid); return; }
    const next = Number(totalInput);
    const entered: ScoredApplicant[] = folder.applicants.map((a) => {
      const v = scores[a.id] ?? '';
      return { id: a.id, name: a.full_name, score: v !== '' && !isNaN(Number(v)) ? Number(v) : null };
    });
    const enteredIds = new Set(entered.filter((e) => e.score !== null).map((e) => e.id));
    const affected = findScoresAboveTotal([...entered, ...knownScores.filter((k) => !enteredIds.has(k.id))], next);
    const blocked = describeBlockedTotal(affected, next);
    if (blocked) { setTotalError(blocked); return; }

    setTotalError(null);
    setSavingTotal(true);
    const result = await onSaveTotal(next);
    setSavingTotal(false);
    if (!result.ok) {
      setTotalError(result.columnMissing
        ? "We couldn't save the total points because the database hasn't been updated for this feature yet. The total was not changed. Contact the HR administrator."
        : "We couldn't save the total points. The total was not changed. Check your connection and try again.");
      return;
    }
    setTotalSaved(true);
  };

  const ranked = useMemo(() =>
    [...folder.applicants].sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0)),
    [folder.applicants],
  );

  const handleSave = () => {
    if (!allFilled) return;
    setSaving(true);
    setTimeout(() => {
      onSave(scores);
      setSaving(false);
      setSaved(true);
      setTimeout(onClose, 800);
    }, 300);
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      icon={<Pencil strokeWidth={1.75} />}
      title="Written Examination Scores"
      subtitle={folder.position}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-md btn-secondary">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!allFilled || saving || saved}
            aria-busy={saving || undefined}
            className={`btn btn-md btn-primary${saving ? ' is-loading' : ''}`}
          >
            {!saving && <Save size={15} aria-hidden="true" />}
            Save Scores
          </button>
        </>
      )}
    >
        <div style={{ marginBottom: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Total points
              <input
                type="number" min={1} step={1}
                value={totalInput}
                readOnly={!canEditTotal}
                aria-invalid={totalError ? true : undefined}
                aria-describedby="exam-total-help"
                onChange={(e) => { setTotalInput(e.target.value); setTotalError(null); setTotalSaved(false); }}
                style={{ width: 110, border: `1.5px solid ${totalError ? 'var(--status-error)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.95rem', outline: 'none', background: canEditTotal ? 'var(--bg-control)' : 'var(--bg-sidebar)', textAlign: 'right', color: 'var(--text-primary)' }}
              />
            </label>
            {canEditTotal && (
              <button type="button" onClick={handleSaveTotal} disabled={!totalChanged || savingTotal} className="btn btn-sm btn-secondary">
                {savingTotal ? 'Saving…' : 'Update Total'}
              </button>
            )}
          </div>
          <p id="exam-total-help" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {canEditTotal
              ? `Enter the written examination score (0–${total}) for each applicant.`
              : `Total points are set by RSP. Scores run from 0 to ${total}.`}
          </p>
          {totalError && (
            <p role="alert" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--status-error)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" /> {totalError}
            </p>
          )}
          {totalSaved && !totalChanged && (
            <p role="status" style={{ margin: 0, fontSize: '0.875rem', color: 'var(--status-success)' }}>
              Total points updated to {total}.
            </p>
          )}
        </div>
        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {ranked.map((a, i) => {
            const val = scores[a.id] ?? '';
            const error = scoreError(val);
            const valid = !error;
            const prev = existingScores[a.id];
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', background: 'var(--bg-sidebar)', border: `1px solid var(--border-subtle)`, borderRadius: 10, padding: '0.8rem 1rem' }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-control)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  #{i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name}</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Eval score: {typeof a.total_score === 'number' ? `${a.total_score.toFixed(0)}/100` : '—'}
                  </p>
                  {error && (
                    <p id={`exam-score-error-${a.id}`} role="alert" style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--status-error)' }}>
                      {error}
                    </p>
                  )}
                </div>
                {prev && prev !== '' && (
                  <span style={{ background: 'var(--status-pending-light)', color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.875rem', padding: '0.2rem 0.7rem', borderRadius: 999, flexShrink: 0 }}>
                    {formatScoreOverTotal(Number(prev), total)}
                  </span>
                )}
                <input
                  type="number" min={0} max={total} step={1}
                  value={val}
                  onChange={(e) => setScores(p => ({ ...p, [a.id]: e.target.value }))}
                  aria-label={`Written exam score for ${a.full_name}, out of ${total}`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `exam-score-error-${a.id}` : undefined}
                  placeholder="Score"
                  style={{ width: 85, border: `1.5px solid ${val !== '' && !valid ? 'var(--status-error)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.95rem', outline: 'none', background: val !== '' && !valid ? 'var(--status-error-light)' : 'var(--bg-control)', textAlign: 'right', flexShrink: 0, color: 'var(--text-primary)' }}
                />
              </div>
            );
          })}
        </div>
    </Modal>
  );
};

// ─── ApplicantScoringModal ─────────────────────────────────────────────────────
// Styled to the Create New Job Position modal (DESIGN_IDENTITY §9.3, §9.10).
// It renders inside `.rsp-ds`, so the design tokens resolve here.

const SM_CARD: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--neutral-200)', borderRadius: 12, padding: 16 };
const SM_TINT: React.CSSProperties = { background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: 8, padding: '8px 12px' };
const SM_TITLE: React.CSSProperties = { margin: '0 0 12px', fontWeight: 700, fontSize: 16, lineHeight: '24px', color: 'var(--color-primary-900)', display: 'flex', alignItems: 'center', gap: 8 };
const SM_LABEL: React.CSSProperties = { margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--color-primary-900)' };
const SM_NOTE: React.CSSProperties = { margin: 0, fontSize: 12, lineHeight: '16px', color: 'var(--neutral-600)' };
const SM_CHIP: React.CSSProperties = { width: 28, height: 28, borderRadius: 'var(--radius-chip)', background: 'var(--color-primary-50)', color: 'var(--color-primary)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
const SM_FIELD = 'mb-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#28343D] focus:border-[#363EE8] focus:outline-none focus:ring-[3px] focus:ring-[#363EE8]/15 disabled:bg-slate-100 disabled:text-slate-400 read-only:bg-slate-50';

interface ApplicantScoringModalProps {
  applicant:    ApplicantRecord;
  savedScores:  Record<string, ApplicantCategoryScores>;
  allApplicants: ApplicantRecord[];
  evaluation?:  EvaluationSnapshot | null;
  /** Written Exam total points for this applicant's position. */
  examTotal:    number;
  /** Remote `is_finalized` for this UUID; local cache alone is not durable. */
  durablyFinalized?: boolean;
  onClose:      () => void;
  onSave:       (applicantId: string, scores: ApplicantCategoryScores) => Promise<{ ok: boolean; error?: unknown }>;
}

const ApplicantScoringModal = ({ applicant, savedScores, allApplicants, evaluation, examTotal, durablyFinalized, onClose, onSave }: ApplicantScoringModalProps) => {
  // Current employees (verified at wizard time via employee auth) submit with
  // application_type === 'promotion'. Their evaluation must be locked to a
  // Promotional Appointment — Original is invalid for an existing employee.
  const isCurrentEmployee = String(applicant.application_type ?? '').toLowerCase() === 'promotion';

  // hasPersistedScores must mean *complete* prior save — otherwise a partial entry
  // (or stale localStorage from earlier testing) would put the modal in view-only
  // mode before the RSP has filled in the required RSP-owned categories.
  const previouslySaved = savedScores[applicant.id];
  const previouslySavedApptType: AppointmentType =
    previouslySaved?.appointmentType ?? (isCurrentEmployee ? 'promotional' : 'original');
  // Promotional applicants (existing employees applying for a higher role)
  // get evaluated on Performance + Potential in addition to Education +
  // Experience. Original applicants (new external hires) only need
  // Education + Experience — they have no past LGU performance record.
  const requiredRspKeysForApptType = (t: AppointmentType): CatKey[] =>
    t === 'promotional'
      ? ['education', 'experience', 'performance', 'potential']
      : ['education', 'experience'];
  const isFullySaved = (saved: ApplicantCategoryScores | undefined, t: AppointmentType): boolean => {
    if (!saved) return false;
    return requiredRspKeysForApptType(t).every((k) => {
      const v = saved[k]?.finalScore;
      return typeof v === 'number';
    });
  };
  const hasPersistedScores = isFullySaved(previouslySaved, previouslySavedApptType);
  // Build initial scores from saved/derived values, then overlay the interviewer's
  // saved evaluation so PCPT (and any other interviewer-owned fields) reflect what
  // they actually entered in the interviewer portal — not the rough percentage guess.
  const [scores, setScores] = useState<ApplicantCategoryScores>(() => {
    const base = deriveInitial(applicant, savedScores);
    const pcptRaw = typeof evaluation?.pcptRawScore === 'number' ? evaluation.pcptRawScore : null;
    const writtenRaw = typeof evaluation?.writtenExamRawScore === 'number' ? evaluation.writtenExamRawScore : null;
    const oralRaw = typeof evaluation?.oralRawScore === 'number' ? evaluation.oralRawScore : null;
    return {
      ...base,
      pcpt:        { ...base.pcpt,        initialScore: pcptRaw   ?? base.pcpt.initialScore,    finalScore: pcptRaw   === null ? base.pcpt.finalScore    : pcptRawToConvertedScore(pcptRaw) },
      writtenExam: { ...base.writtenExam, initialScore: writtenRaw ?? base.writtenExam.initialScore, finalScore: writtenRaw ?? base.writtenExam.finalScore },
      oralExam:    { ...base.oralExam,    initialScore: oralRaw   ?? 0,                          finalScore: oralRaw   === null ? null                     : oralRawToConvertedScore(oralRaw) },
    };
  });
  const [expYearsInput, setExpYearsInput] = useState<string>(() =>
    applicant.years_of_experience != null ? String(applicant.years_of_experience) : '',
  );
  const [apptType,  setApptType]  = useState<AppointmentType>(
    isCurrentEmployee ? 'promotional' : (savedScores[applicant.id]?.appointmentType ?? 'original'),
  );
  const [posType,   setPosType]   = useState<PositionType>(savedScores[applicant.id]?.positionType ?? 'rank-and-file');
  const [savedThisSession, setSavedThisSession] = useState(false);
  // For a real persisted applicant, only the remote summary can confirm
  // finalization. Non-UUID demo/test IDs keep the local-only behavior.
  const isFinalized = (isUuid(applicant.id) ? durablyFinalized === true : hasPersistedScores)
    || savedThisSession;
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');
  const [filesModal, setFilesModal] = useState<{ catKey: CatKey; files: AttachmentRow[] } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [previewFile, setPreviewFile] = useState<ViewerDocument | null>(null);
  const [liveEvaluation, setLiveEvaluation] = useState<EvaluationSnapshot | null>(evaluation ?? null);

  useEffect(() => {
    setLiveEvaluation(evaluation ?? null);
  }, [evaluation]);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      const latest = await fetchLatestEvaluationForApplicantOrEmailAnySource(applicant.id, applicant.email, supabase);
      if (!disposed && latest) {
        setLiveEvaluation(latest);
      }
    };

    void refresh();
    const unsubscribe = subscribeToEvaluationChanges(() => {
      void refresh();
    });
    const onApplicantsUpdated = () => {
      void refresh();
    };
    window.addEventListener('cictrix:applicants-updated', onApplicantsUpdated as EventListener);

    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener('cictrix:applicants-updated', onApplicantsUpdated as EventListener);
    };
  }, [applicant.id, applicant.email]);

  useEffect(() => {
    const base = deriveInitial(applicant, savedScores);
    const pcptRaw    = typeof liveEvaluation?.pcptRawScore        === 'number' ? liveEvaluation.pcptRawScore        : null;
    const writtenRaw = typeof liveEvaluation?.writtenExamRawScore === 'number' ? liveEvaluation.writtenExamRawScore : null;
    const oralRaw    = typeof liveEvaluation?.oralRawScore        === 'number' ? liveEvaluation.oralRawScore        : null;

    setScores((current) => ({
      ...current,
      ...base,
      pcpt: {
        ...base.pcpt,
        initialScore: pcptRaw ?? current.pcpt.initialScore,
        finalScore: pcptRaw === null ? current.pcpt.finalScore : pcptRawToConvertedScore(pcptRaw),
      },
      writtenExam: {
        ...base.writtenExam,
        initialScore: writtenRaw ?? current.writtenExam.initialScore,
        finalScore: writtenRaw ?? current.writtenExam.finalScore,
      },
      oralExam: {
        ...base.oralExam,
        initialScore: oralRaw ?? current.oralExam?.initialScore ?? 0,
        finalScore: oralRaw === null ? (current.oralExam?.finalScore ?? null) : oralRawToConvertedScore(oralRaw),
      },
    }));
    // Keyed by applicant id; the object itself changes identity on parent re-renders
    // and would reset scores the interviewer is still editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant.id, liveEvaluation?.applicantId, liveEvaluation?.pcptRawScore, liveEvaluation?.writtenExamRawScore, liveEvaluation?.oralRawScore, savedScores]);

  // Load attachments for this applicant
  useEffect(() => {
    let disposed = false;
    const fetchAttachments = async () => {
      setLoadingFiles(true);
      setFilesError('');
      try {
        const rows = await listApplicantDocumentAttachments(applicant.id);
        if (!disposed) setAttachments(rows);
      } catch (error) {
        if (!disposed) {
          setAttachments([]);
          setFilesError(error instanceof Error ? error.message : 'Could not load documents. Close the scores and try again.');
        }
      } finally {
        if (!disposed) setLoadingFiles(false);
      }
    };
    void fetchAttachments();
    return () => { disposed = true; };
  }, [applicant.id]);

  const getFilesForCat = (catKey: CatKey): AttachmentRow[] => {
    const keywords = DOC_TYPE_MAP[catKey];
    return attachments.filter(a => {
      const docType = (a.document_type ?? '').toLowerCase();
      const fileName = (a.file_name ?? '').toLowerCase();
      return keywords.some(kw => docType.includes(kw) || fileName.includes(kw));
    });
  };

  const setFinal = (key: CatKey, raw: string) => {
    setScores(prev => ({ ...prev, [key]: { ...prev[key], finalScore: raw === '' ? null : parseFloat(raw) } }));
  };

  const totalScore = calcModalScore(scores, apptType);
  const adjRating  = getAdjectival(totalScore);

  const rspCategories: CatKey[] = apptType === 'promotional'
    ? ['education', 'experience', 'performance', 'potential']
    : ['education', 'experience'];

  // Original applicants: only oral exam from interviewer.
  // Promotional applicants: only PCPT from interviewer.
  const interviewerCategories: CatKey[] = apptType === 'promotional'
    ? ['pcpt']
    : ['oralExam'];

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const merged: ApplicantCategoryScores = { ...scores, appointmentType: apptType, positionType: posType };
      const result = await onSave(applicant.id, merged);
      if (result?.ok) {
        setSavedThisSession(true);
      } else {
        setSaveError('Scores were not saved. Your entries are still here; check your connection and try again.');
      }
    } catch {
      setSaveError('Scores were not saved. Your entries are still here; check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  void allApplicants;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Applicant Evaluation & Scoring"
        subtitle={<>{applicant.full_name} &mdash; {applicant.position}</>}
        footer={(
          <>
            <button type="button" onClick={onClose} className="btn btn-md btn-secondary">
              Cancel
            </button>
            {!isFinalized && (() => {
              const requiredKeys = requiredRspKeysForApptType(apptType);
              const missing = requiredKeys.filter((k) => typeof scores[k]?.finalScore !== 'number');
              const allRspCategoriesFilled = missing.length === 0;
              const disabled = saving || !allRspCategoriesFilled;
              return (
                <button
                  type="button" onClick={handleSave} disabled={disabled}
                  aria-busy={saving || undefined}
                  title={!allRspCategoriesFilled ? `Fill required fields: ${missing.join(', ')}` : undefined}
                  className={`btn btn-md btn-primary${saving ? ' is-loading' : ''}`}
                >
                  {!saving && <Save size={15} aria-hidden="true" />}
                  {allRspCategoriesFilled ? 'Save Scores' : 'Fill Required Fields'}
                </button>
              );
            })()}
          </>
        )}
      >
          <div className="flex flex-col gap-4">

            {/* Score finalized banner (info alert, §9.9) */}
            {isFinalized && (
              <div style={{ background: 'var(--info-100)', borderLeft: '4px solid var(--info-500)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--info-500)', flexShrink: 0 }} />
                <div>
                  <p style={SM_LABEL}>Score Finalized — View Only Mode</p>
                  <p style={{ ...SM_NOTE, color: 'var(--neutral-800)' }}>This applicant's evaluation has been finalized. Fields are read-only.</p>
                </div>
              </div>
            )}

            {saveError && (
              <div role="alert" style={{ background: 'var(--error-100)', borderLeft: '4px solid var(--error-500)', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={18} style={{ color: 'var(--error-500)', flexShrink: 0 }} aria-hidden="true" />
                <div>
                  <p style={{ ...SM_LABEL, color: 'var(--error-700)' }}>Scores not saved</p>
                  <p style={{ ...SM_NOTE, color: 'var(--neutral-800)' }}>{saveError}</p>
                </div>
              </div>
            )}

            {/* Appointment Type */}
            <section style={SM_CARD}>
              <h3 style={SM_TITLE}>
                <RefreshCw size={16} style={{ color: 'var(--color-primary)' }} /> Select Appointment Type
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {(['original', 'promotional'] as AppointmentType[]).map(t => {
                  const isLockedOriginal    = isCurrentEmployee && t === 'original';
                  const isLockedPromotional = !isCurrentEmployee && t === 'promotional';
                  const buttonDisabled = isFinalized || isLockedOriginal || isLockedPromotional;
                  const isActive = apptType === t;
                  const isLocked = isLockedOriginal || isLockedPromotional;
                  // Three distinct states: selected (brand outline + tint),
                  // available (neutral border), locked (gray fill, lock icon).
                  return (
                    <button
                      key={t} type="button" disabled={buttonDisabled}
                      aria-pressed={isActive}
                      onClick={() => { if (!buttonDisabled) setApptType(t); }}
                      title={
                        isLockedOriginal    ? 'Locked: applicant is a current employee' :
                        isLockedPromotional ? 'Locked: applicant is a new/original applicant' :
                        undefined
                      }
                      style={{
                        border: isActive ? '1.5px solid var(--color-primary)' : '1px solid var(--neutral-200)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                        background: isLocked ? 'var(--neutral-100)' : isActive ? 'var(--color-primary-50)' : 'var(--bg-surface)',
                        textAlign: 'left',
                        transition: 'background 150ms, border-color 150ms',
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, lineHeight: '20px', display: 'flex', alignItems: 'center', gap: 6, color: isLocked ? 'var(--neutral-400)' : 'var(--color-primary-900)' }}>
                        {isLocked ? <Lock size={14} /> : isActive ? <CheckCircle2 size={14} style={{ color: 'var(--color-primary)' }} /> : null}
                        {t === 'original' ? 'Original Appointment' : 'Promotional Appointment'}
                      </p>
                      <p style={{ ...SM_NOTE, marginTop: 2, color: isLocked ? 'var(--neutral-400)' : 'var(--neutral-600)' }}>
                        {t === 'original'
                          ? 'Education • Experience • Oral Exam*'
                          : 'Education • Experience • Performance • PCPT* • Potential'}
                      </p>
                      <p style={{ ...SM_NOTE, color: 'var(--neutral-400)' }}>*Interviewer-provided</p>
                      {isLockedOriginal && (
                        <p style={{ ...SM_NOTE, marginTop: 6, color: 'var(--error-700)', fontWeight: 600 }}>
                          Locked — applicant is a current employee
                        </p>
                      )}
                      {isLockedPromotional && (
                        <p style={{ ...SM_NOTE, marginTop: 6, color: 'var(--error-700)', fontWeight: 600 }}>
                          Locked — applicant is a new/original applicant
                        </p>
                      )}
                      {isCurrentEmployee && t === 'promotional' && (
                        <p style={{ ...SM_NOTE, marginTop: 6, color: 'var(--color-primary)', fontWeight: 600 }}>
                          Auto-set: applicant is a current employee
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Position type: segmented control (Original only) */}
              {apptType === 'original' && (
                <div style={{ marginTop: 16 }}>
                  <p style={{ ...SM_LABEL, marginBottom: 6 }}>Position Type (for Written Exam scoring)</p>
                  <div role="group" aria-label="Position type" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, background: 'var(--neutral-100)', borderRadius: 10 }}>
                    {(['rank-and-file', 'executive'] as PositionType[]).map(pt => {
                      const selected = posType === pt;
                      return (
                        <button
                          key={pt} type="button" disabled={isFinalized}
                          aria-pressed={selected}
                          onClick={() => setPosType(pt)}
                          style={{
                            height: 36, border: 'none', borderRadius: 8,
                            cursor: isFinalized ? 'default' : 'pointer',
                            background: selected ? 'var(--color-primary)' : 'transparent',
                            color: selected ? 'var(--color-white)' : 'var(--neutral-800)',
                            fontWeight: 600, fontSize: 14, transition: 'background 150ms, color 150ms',
                          }}
                        >
                          {pt === 'rank-and-file' ? 'Rank and File' : 'Executive / Managerial'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Final Numerical Score — compact summary */}
            <div style={{ ...SM_CARD, background: 'var(--color-primary-50)', borderColor: 'var(--color-primary-200)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ ...SM_CHIP, width: 36, height: 36, background: 'var(--bg-surface)' }}>
                  <Calculator size={18} />
                </div>
                <div>
                  <p style={SM_NOTE}>Final Numerical Score</p>
                  <p style={{ margin: 0, fontSize: 24, lineHeight: '32px', fontWeight: 700, color: 'var(--color-primary-900)' }}>{totalScore.toFixed(2)}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={SM_NOTE}>Adjectival Rating</p>
                <p style={{ margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 700, color: 'var(--color-primary-700)' }}>{adjRating.label}</p>
              </div>
            </div>

            {/* Scoring Responsibility */}
            <div style={{ ...SM_TINT, padding: '12px 16px' }}>
              <p style={SM_LABEL}>Scoring Responsibility</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--neutral-800)' }}>
                <strong style={{ color: 'var(--color-primary-900)' }}>RSP enters:</strong>{' '}
                {apptType === 'promotional'
                  ? 'Education, Experience, Performance Rating, Potential'
                  : 'Education, Experience'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--neutral-800)' }}>
                <strong style={{ color: 'var(--color-primary-900)' }}>Interviewer provides:</strong>{' '}
                {apptType === 'promotional'
                  ? 'PCPT (Physical Characteristics & Personality Traits)'
                  : 'Oral Examination'}
              </p>
            </div>

            {/* Historical oral scores (read-only) for promotional applicants */}
            {apptType === 'promotional' && typeof liveEvaluation?.oralRawScore === 'number' && (
              <section style={SM_CARD}>
                <h3 style={SM_TITLE}>
                  <Lock size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  Previous Original Appointment — Oral Examination Score (Read-Only)
                </h3>
                <div style={{ ...SM_TINT, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--neutral-800)' }}>Oral Exam Score (from original appointment):</span>
                  {/* Average of the six interview criteria, so round for display
                      rather than showing a raw 4.6667. */}
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
                    {liveEvaluation.oralRawScore.toFixed(2)} <span style={{ fontWeight: 500, color: 'var(--neutral-600)' }}>/ 5</span>
                  </span>
                </div>
                <p style={{ ...SM_NOTE, marginTop: 6 }}>
                  This score reflects the original appointment evaluation. It is read-only and cannot be edited.
                </p>
              </section>
            )}

            {/* RSP-entered categories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {rspCategories.map((catKey) => {
                const meta = CAT_META[catKey];
                const cat  = scores[catKey];
                const catFiles = getFilesForCat(catKey);
                const rawVal = cat.finalScore === null ? '' : String(cat.finalScore);
                const percentLabel = catKey === 'education' ? '20%' : catKey === 'experience' ? '25%' : catKey === 'performance' ? '20%' : '25%';

                // Per-category semantic input
                let inputEl: JSX.Element;
                if (catKey === 'education') {
                  const autoFilled = applicant.education_level && educationLevelToPoints(applicant.education_level) !== null;
                  inputEl = (
                    <>
                      {autoFilled && (
                        <div style={{ ...SM_TINT, marginBottom: 8, fontSize: 12, color: 'var(--color-primary-700)', fontWeight: 600 }}>
                          Auto-filled from application: {applicant.education_level}
                        </div>
                      )}
                      <select
                        disabled={isFinalized}
                        value={rawVal}
                        onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                        className={SM_FIELD}
                      >
                        <option value="">Select Educational Attainment</option>
                        <option value="10">Elementary Level (10 pts)</option>
                        <option value="11">Elementary Graduate (11 pts)</option>
                        <option value="12">High School Level (12 pts)</option>
                        <option value="13">High School Graduate (13 pts)</option>
                        <option value="14">College Level (14 pts)</option>
                        <option value="16">College Graduate (16 pts)</option>
                        <option value="18">Masteral Units (18 pts)</option>
                        <option value="20">Graduate School (20 pts)</option>
                      </select>
                    </>
                  );
                } else if (catKey === 'experience') {
                  const yearsToPoints = (y: number) => {
                    if (y >= 21) return 20;
                    if (y >= 16) return 18;
                    if (y >= 11) return 16;
                    if (y >= 6)  return 14;
                    if (y >= 1)  return 12;
                    return 0;
                  };
                  const autoFilled = applicant.years_of_experience != null;
                  inputEl = (
                    <>
                      {autoFilled && (
                        <div style={{ ...SM_TINT, marginBottom: 8, fontSize: 12, color: 'var(--color-primary-700)', fontWeight: 600 }}>
                          Auto-filled from application: {applicant.years_of_experience} year(s)
                        </div>
                      )}
                      <input
                        type="number" min={0} step={1}
                        placeholder="Enter years of experience"
                        value={expYearsInput}
                        readOnly={isFinalized}
                        onChange={(e) => {
                          if (isFinalized) return;
                          setExpYearsInput(e.target.value);
                          const y = parseFloat(e.target.value);
                          if (isNaN(y)) { setFinal(catKey, ''); return; }
                          setFinal(catKey, String(yearsToPoints(y)));
                        }}
                        className={SM_FIELD}
                      />
                    </>
                  );
                } else if (catKey === 'performance') {
                  inputEl = (
                    <select
                      disabled={isFinalized}
                      value={rawVal}
                      onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                      className={SM_FIELD}
                    >
                      <option value="">Select Performance Rating</option>
                      <option value="14">Outstanding — Equiv 70 (14 pts)</option>
                      <option value="12">Very Satisfactory — Equiv 60 (12 pts)</option>
                    </select>
                  );
                } else {
                  // potential: raw score 51-100 → converted
                  const rawToPoints = (r: number) => {
                    if (r >= 91) return 20;
                    if (r >= 81) return 18;
                    if (r >= 71) return 16;
                    if (r >= 61) return 14;
                    if (r >= 51) return 12;
                    return 0;
                  };
                  inputEl = (
                    <input
                      type="number" min={0} max={100} step={1}
                      placeholder="Enter raw score (51–100)"
                      readOnly={isFinalized}
                      onChange={(e) => {
                        if (isFinalized) return;
                        const r = parseFloat(e.target.value);
                        if (isNaN(r)) { setFinal(catKey, ''); return; }
                        setFinal(catKey, String(rawToPoints(r)));
                      }}
                      className={SM_FIELD}
                    />
                  );
                }

                return (
                  <div key={catKey} style={SM_CARD}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={SM_CHIP}>
                        {meta.roman}
                      </span>
                      <p style={SM_LABEL}>
                        {meta.label} ({percentLabel})
                      </p>
                    </div>

                    {/* Initial score row */}
                    <div style={{ background: 'var(--neutral-100)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--neutral-600)' }}>Initial {meta.label} Score:</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary-900)' }}>{cat.initialScore}</span>
                      <span style={{ fontSize: 12, color: 'var(--neutral-400)', fontStyle: 'italic' }}>previously saved</span>
                    </div>

                    {/* Potential auto-fill banner */}
                    {catKey === 'potential' && cat.initialScore > 0 && !isFinalized && (
                      <div style={{ ...SM_TINT, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>Auto-Fill Available</p>
                          <p style={SM_NOTE}>Last Original Appointment Score: {cat.initialScore}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFinal(catKey, String(cat.initialScore))}
                          className="btn btn-sm btn-primary" style={{ flexShrink: 0, height: 28, fontSize: 12, padding: '0 12px' }}
                        >
                          Use This Score
                        </button>
                      </div>
                    )}

                    {/* Score input */}
                    {inputEl}

                    {/* Guide */}
                    <p style={{ ...SM_NOTE, marginBottom: 6 }}>{meta.guide}</p>

                    {/* Score display */}
                    <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--color-primary-900)', fontWeight: 700 }}>
                      Score: {cat.finalScore ?? 0}
                    </p>

                    {/* Experience opens the CV straight in the viewer; the rest list their files. */}
                    <button
                      type="button"
                      onClick={() => {
                        const cvRow = catKey === 'experience'
                          ? attachments.find(a => (a.document_type ?? '').includes('curriculum_vitae')) ?? catFiles[0]
                          : undefined;
                        if (cvRow) setPreviewFile(scoringFileDocument(cvRow));
                        else setFilesModal({ catKey, files: catFiles });
                      }}
                      disabled={loadingFiles || Boolean(filesError)}
                      aria-label={`View ${meta.label} documents`}
                      className="btn btn-secondary btn-sm"
                    >
                      <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                      View documents ({loadingFiles ? '…' : catFiles.length})
                    </button>
                    {filesError && <p role="alert" className="text-body-s text-[var(--error-700)]">{filesError}</p>}
                  </div>
                );
              })}
            </div>

            {/* Interviewer-Provided Scores */}
            <section style={SM_CARD}>
              <h3 style={SM_TITLE}>
                <Users size={16} style={{ color: 'var(--color-primary)' }} />
                Interviewer-Provided Scores (Auto-Generated by System)
              </h3>

              {/* Locked notice */}
              <div style={{ ...SM_TINT, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Lock size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={SM_LABEL}>RSP Cannot Edit These Scores</p>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--neutral-800)' }}>
                    The following scores are automatically provided by the interview panel and cannot be manually entered by RSP staff.
                  </p>
                </div>
              </div>

              {/* Interviewer categories */}
              <div style={{ display: 'grid', gridTemplateColumns: interviewerCategories.length > 1 ? '1fr 1fr' : '1fr', gap: 12 }}>
                {interviewerCategories.map((catKey) => {
                  const meta = CAT_META[catKey];
                  const cat  = scores[catKey];
                  const max  = apptType === 'promotional' ? meta.maxPromotional : meta.maxOriginal;
                  const catFiles = getFilesForCat(catKey);
                  const interviewerRaw =
                    catKey === 'pcpt'     ? (typeof liveEvaluation?.pcptRawScore        === 'number' ? liveEvaluation.pcptRawScore        : null) :
                    catKey === 'oralExam' ? (typeof liveEvaluation?.oralRawScore         === 'number' ? liveEvaluation.oralRawScore         : null) :
                                           (typeof liveEvaluation?.writtenExamRawScore  === 'number' ? liveEvaluation.writtenExamRawScore  : null);
                  const rawVal = interviewerRaw !== null
                    ? String(interviewerRaw)
                    : (cat.initialScore === 0 ? '' : String(cat.initialScore));
                  const convertedScore =
                    catKey === 'pcpt'     ? (typeof cat.finalScore === 'number' ? cat.finalScore : 0) :
                    catKey === 'oralExam' ? (typeof cat.finalScore === 'number' ? cat.finalScore : oralRawToConvertedScore(cat.initialScore ?? 0)) :
                                           writtenExamRawToConvertedScore(typeof cat.finalScore === 'number' ? cat.finalScore : 0, examTotal);
                  const convertedMax = catKey === 'writtenExam' ? WRITTEN_EXAM_SHARE : max;
                  const exceedsTotal = catKey === 'writtenExam' && convertExamScore(cat.finalScore, examTotal).exceedsTotal;
                  return (
                    <div key={catKey} style={{ ...SM_CARD, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={SM_CHIP}>
                          {meta.roman}
                        </span>
                        <p style={SM_LABEL}>{meta.label} (20%)</p>
                      </div>

                      <div style={{ background: 'var(--neutral-100)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, color: 'var(--neutral-600)' }}>Initial {meta.label} Score:</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-primary-900)', fontSize: 14 }}>{cat.initialScore}</span>
                        <span style={{ fontSize: 12, color: 'var(--neutral-400)', fontStyle: 'italic' }}>previously saved</span>
                      </div>

                      <div style={{ ...SM_TINT, marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, color: 'var(--neutral-800)' }}>Raw Score:</span>
                          <input
                            type="number" min={0} max={100} step={1}
                            value={rawVal}
                            readOnly={true}
                            placeholder="—"
                            style={{ width: 70, border: 'none', background: 'transparent', textAlign: 'right', fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', outline: 'none', fontFamily: 'var(--font-sans)' }}
                          />
                        </div>
                      </div>

                      <p style={{ ...SM_NOTE, marginBottom: 6 }}>{meta.guide}</p>
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--color-primary-900)', fontWeight: 700 }}>
                        Converted Score: {convertedScore}/{convertedMax}
                      </p>
                      {exceedsTotal && (
                        <p role="alert" style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--error-700)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={12} aria-hidden="true" /> Score exceeds total ({examTotal}). Counted as {WRITTEN_EXAM_SHARE} points.
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => setFilesModal({ catKey, files: catFiles })}
                        disabled={loadingFiles || Boolean(filesError)}
                        aria-label={`View ${meta.label} assessment files`}
                        className="btn btn-secondary btn-sm"
                      >
                        <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                        View documents ({loadingFiles ? '…' : catFiles.length})
                      </button>
                      {filesError && <p role="alert" className="text-body-s text-[var(--error-700)]">{filesError}</p>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Adjectival Rating Reference */}
            <section style={SM_CARD}>
              <h3 style={SM_TITLE}>
                <Info size={16} style={{ color: 'var(--color-primary)' }} /> Adjectival Rating Reference
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                {ADJECTIVAL_RANGES.map(r => (
                  <div key={r.label} style={{ ...SM_TINT, padding: '8px 6px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{r.min} - {r.max}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--color-primary-900)', fontWeight: 600 }}>{r.label}</p>
                  </div>
                ))}
              </div>
            </section>

          </div>
      </Modal>

      {filesModal && (
        <DocumentCollectionModal
          title={`${CAT_META[filesModal.catKey].label} Files`}
          subtitle={applicant.full_name}
          files={filesModal.files.map(scoringFileDocument)}
          onClose={() => setFilesModal(null)}
        />
      )}
      {previewFile && (
        <DocumentPreviewModal
          open
          viewFirst
          fileUrl={previewFile.url}
          fileName={previewFile.fileName}
          fileType={previewFile.fileType}
          storageBucket={previewFile.bucket}
          title={previewFile.fileName}
          subtitle={applicant.full_name}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </>
  );
};

// ─── ApplicantsListView (inline) ──────────────────────────────────────────────

interface ApplicantsListViewProps {
  folder:                 PositionFolder;
  onBack:                 () => void;
  completedEvaluationIds: Set<string>;
  savedCatScores:         Record<string, ApplicantCategoryScores>;
  scoreSummaries:         Record<string, ApplicantScoreSummary>;
  summariesLoadFailed:    boolean;
  evaluationsByApplicant?: Record<string, EvaluationSnapshot>;
  examScores?:            Record<string, Record<string, string>>;
  /** Written Exam total points for this folder's position. */
  examTotal:              number;
  onUpdateScores:         (applicant: ApplicantRecord) => void;
}

// Score columns per appointment track. Original and Promotional applicants are
// judged against different qualification sets, so each tab shows only its own.
// The Written column's label is completed with the configured total at render.
type ScoreCol = { key: CatKey; label: string };
const ORIGINAL_SCORE_COLS: ScoreCol[] = [
  { key: 'education',   label: 'Educ /20' },
  { key: 'experience',  label: 'Exp /25' },
  { key: 'writtenExam', label: 'Written' },
  { key: 'oralExam',    label: 'Oral /20' },
];
const PROMOTIONAL_SCORE_COLS: ScoreCol[] = [
  { key: 'education',   label: 'Educ /20' },
  { key: 'experience',  label: 'Exp /25' },
  { key: 'performance', label: 'Perf /20' },
  { key: 'potential',   label: 'Potential /25' },
  { key: 'pcpt',        label: 'PCPT /20' },
];

const ApplicantsListView = ({
  folder,
  onBack,
  completedEvaluationIds,
  savedCatScores,
  scoreSummaries,
  summariesLoadFailed,
  evaluationsByApplicant,
  examScores,
  examTotal,
  onUpdateScores,
}: ApplicantsListViewProps) => {
  const [search, setSearch] = useState('');
  const [scoreTab, setScoreTab] = useState<AppointmentType>('original');

  // Derive scores + appointment type once, so we can both route each row into
  // the Original / Promotional tab and count each track independently.
  const typed = useMemo(() =>
    folder.applicants.map(a => {
      const evalSnapshot = evaluationsByApplicant?.[a.id]
        ?? (a.email ? evaluationsByApplicant?.[`email:${a.email.toLowerCase().trim()}`] : null)
        ?? (a.full_name ? evaluationsByApplicant?.[`name:${a.full_name.toLowerCase().trim()}`] : null)
        ?? null;
      const posExam = examScores?.[folder.position]?.[a.id];
      const cs = deriveInitial(a, savedCatScores, evalSnapshot, posExam);
      const apptType: AppointmentType = cs.appointmentType ?? 'original';
      return { ...a, overallScore: calcModalScore(cs, apptType) ?? calcOverall(cs, examTotal).value, catScores: cs, apptType };
    }),
    [folder.applicants, folder.position, savedCatScores, evaluationsByApplicant, examScores, examTotal],
  );

  const originalCount = useMemo(() => typed.filter(t => t.apptType !== 'promotional').length, [typed]);
  const promotionalCount = useMemo(() => typed.filter(t => t.apptType === 'promotional').length, [typed]);
  const activeCount = scoreTab === 'promotional' ? promotionalCount : originalCount;
  const scoreCols = scoreTab === 'promotional' ? PROMOTIONAL_SCORE_COLS : ORIGINAL_SCORE_COLS;

  // The whole track is the comparison group, so the search filter never
  // changes who is top (Task 5).
  const trackRows = useMemo(() =>
    typed.filter(t => (scoreTab === 'promotional' ? t.apptType === 'promotional' : t.apptType !== 'promotional')),
    [typed, scoreTab],
  );
  const topScorers = useMemo(
    () => topScorerIds(trackRows, { idOf: (t) => t.id, scoreOf: (t) => t.overallScore }),
    [trackRows],
  );
  const ranked = useMemo(() =>
    trackRows
      .filter(a => !search || a.full_name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1)),
    [trackRows, search],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <BackButton onBack={onBack} />
      <div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{folder.position}</h2>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          {folder.office} &middot; {activeCount} {scoreTab === 'promotional' ? 'Promotional' : 'Original'} qualified applicant{activeCount !== 1 ? 's' : ''} &middot; Written exam total: {examTotal} points
        </p>
      </div>

      {/* Track toggle (Original / Promotional) + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 10, padding: 3 }}>
          {([
            { key: 'original', label: 'Original', count: originalCount },
            { key: 'promotional', label: 'Promotional', count: promotionalCount },
          ] as const).map(t => {
            const active = scoreTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setScoreTab(t.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontWeight: 700,
                  background: active ? '#fff' : 'transparent',
                  color: active ? '#040E6B' : '#64748b',
                  boxShadow: active ? '0 1px 3px rgba(15,23,42,0.12)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {t.label}
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 800, background: active ? '#e0e7ff' : '#e2e8f0', color: active ? '#3730a3' : '#64748b' }}>{t.count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search applicants by name…"
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.6rem 0.75rem 0.6rem 2.25rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
          />
        </div>
      </div>

      {summariesLoadFailed && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-4 text-sm text-[var(--neutral-800)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warning-700)]" aria-hidden="true" />
          <span>We couldn't load saved score status. Finalized labels are unavailable until this read succeeds; reload the page to try again.</span>
        </div>
      )}

      {/* Table: shared .abyan-table layer, top scorer per track (Task 5) */}
      <div className="abyan-table-wrap">
        <table className="abyan-table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th className="is-center" style={{ width: 64 }}>#</th>
              <th>Applicant Name</th>
              <th>Exam Schedule</th>
              <th>Interview Schedule</th>
              {scoreCols.map(c => (
                <th key={c.key} className="is-center">{c.key === 'writtenExam' ? `${c.label} /${examTotal}` : c.label}</th>
              ))}
              <th className="is-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((a, i) => {
              const summary = scoreSummaries[a.id];
              const durableTrack = isUuid(a.id);
              // Local cache and completed evaluations can label demo/test IDs;
              // a real applicant is finalized only by the remote summary.
              const isFinalized = durableTrack
                ? summary?.isFinalized === true
                : (!!savedCatScores[a.id] || completedEvaluationIds.has(a.id));
              const finalizationUnavailable = durableTrack && !summary && summariesLoadFailed;
              const isTop = topScorers.has(a.id);
              const cs = a.catScores;
              const sv = (key: CatKey): string => {
                const v = cs[key]?.finalScore ?? cs[key]?.initialScore;
                return typeof v === 'number' && Number.isFinite(v) ? String(v) : '—';
              };
              const schedule = (date?: string | null, time?: string | null) => date ? (
                <span
                  title={isUpcoming(date) ? 'Scheduled — not yet held' : 'Completed / past date'}
                  style={{ whiteSpace: 'nowrap', fontWeight: 600, fontStyle: isUpcoming(date) ? 'italic' : 'normal' }}
                  className={isUpcoming(date) ? 'abyan-cell-secondary' : 'abyan-cell-primary'}
                >
                  {fmtSchedule(date, time)}
                </span>
              ) : <span className="abyan-cell-secondary">—</span>;
              return (
                <tr
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open scores for ${a.full_name}${isTop ? ', top scorer' : ''}`}
                  onClick={() => onUpdateScores(a)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onUpdateScores(a); }
                  }}
                  className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#363EE8] ${topScorerRowClass(isTop)}`}
                >
                  <td className="is-center">
                    <span style={{ display: 'inline-flex', width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'var(--color-primary-50)', color: 'var(--color-primary-700)', fontWeight: 700, fontSize: 12 }}>{i + 1}</span>
                  </td>
                  <td>
                    <span className="abyan-cell-primary" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {a.full_name}
                      {isTop && <TopScorerBadge />}
                    </span>
                    <span className="abyan-cell-secondary">Qualified: {fmtDate(a.created_at)}</span>
                  </td>
                  <td>{schedule(a.exam_date, a.exam_time)}</td>
                  <td>{schedule(a.interview_date, a.interview_time)}</td>
                  {scoreCols.map(c => {
                    if (c.key !== 'writtenExam') {
                      return <td key={c.key} className="is-center" style={{ fontWeight: 600 }}>{sv(c.key)}</td>;
                    }
                    const raw = cs.writtenExam?.finalScore ?? cs.writtenExam?.initialScore;
                    const hasWrittenScore = typeof raw === 'number' && Number.isFinite(raw);
                    const { exceedsTotal } = hasWrittenScore
                      ? convertExamScore(raw, examTotal)
                      : { exceedsTotal: false };
                    return (
                      <td key={c.key} className="is-center" style={{ fontWeight: 600 }}>
                        {hasWrittenScore ? formatScoreOverTotal(raw, examTotal) : '—'}
                        {exceedsTotal && (
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 2, fontSize: 14, fontWeight: 700, color: 'var(--error-700)', whiteSpace: 'nowrap' }}>
                            <AlertTriangle size={12} aria-hidden="true" /> Score exceeds total
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="is-center">
                    {finalizationUnavailable ? (
                      <span className="badge badge-neutral">
                        <span className="badge-dot" aria-hidden="true" />
                        Status unavailable
                      </span>
                    ) : (
                      <span className={`badge ${isFinalized ? 'badge-success' : 'badge-warning'}`}>
                        {isFinalized ? <CheckCircle2 size={12} aria-hidden="true" /> : <span className="badge-dot" aria-hidden="true" />}
                        {isFinalized ? 'Finalized' : 'Pending'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <TableStateRows
              view={ranked.length === 0 ? 'empty' : 'rows'}
              columns={scoreCols.length + 5}
              emptyTitle={`No ${scoreTab === 'promotional' ? 'promotional' : 'original'} applicants found`}
              emptyMessage={search ? 'Clear the search to see every applicant in this track.' : 'Applicants in this track appear here once they are scheduled.'}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Exam status style map ────────────────────────────────────────────────────

const EXAM_STYLES: Record<ExamStatus, { bg: string; text: string; dot: string; label: string }> = {
  pending:       { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400',   label: 'Pending' },
  'in-progress': { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-400',    label: 'In Progress' },
  completed:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface QualifiedApplicantsSectionProps {
  applicants:             ApplicantRecord[];
  completedEvaluationIds: Set<string>;
  /** Interviewer-saved evaluation rows keyed by applicant id. Optional for backwards
      compatibility — when absent, the modal falls back to the previous percentage
      derivation, but the PCPT raw score will read 0 (which is what users were seeing). */
  evaluationsByApplicant?: Record<string, EvaluationSnapshot>;
  /** True while the parent's first fetch is in flight; shows skeleton rows. */
  loading?: boolean;
}

export const QualifiedApplicantsSection = ({ applicants, completedEvaluationIds, evaluationsByApplicant, loading = false }: QualifiedApplicantsSectionProps) => {
  const folderLoad = useTableLoading(loading, applicants.length > 0);
  const [search,      setSearch]      = useState('');
  const [posFilter,   setPosFilter]   = useState('all');
  const [offFilter,   setOffFilter]   = useState('all');
  const [examFilter,  setExamFilter]  = useState<'all' | ExamStatus>('all');

  const [examModal,   setExamModal]   = useState<PositionFolder | null>(null);
  const [openFolder,  setOpenFolder]  = useState<PositionFolder | null>(null);
  const [scoresCtx,   setScoresCtx]   = useState<{ applicant: ApplicantRecord; folder: PositionFolder } | null>(null);

  const [examScores,  setExamScores]  = useState<Record<string, Record<string, string>>>(loadExamScores);
  const [catScores,   setCatScores]   = useState<Record<string, ApplicantCategoryScores>>(loadCatScores);
  const [scoreSummaries, setScoreSummaries] = useState<Record<string, ApplicantScoreSummary>>({});
  const [summariesLoadFailed, setSummariesLoadFailed] = useState(false);
  const [examTotals,  setExamTotals]  = useState<Record<string, number>>({});
  const [examTotalsLoadFailed, setExamTotalsLoadFailed] = useState(false);
  const canEditTotal = canEditExamTotal(getAdminRole());

  useEffect(() => {
    let cancelled = false;
    void fetchWrittenExamTotals().then((result) => {
      if (cancelled) return;
      setExamTotals(result.totals);
      setExamTotalsLoadFailed(!result.ok);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadScores = () => {
      void fetchApplicantCategoryScores().then((result) => {
        if (cancelled) return;
        if (result.data && result.data.size > 0) {
          const remoteScores: Record<string, ApplicantCategoryScores> = {};
          for (const [id, scoreObj] of result.data.entries()) {
            remoteScores[id] = scoreObj;
          }
          setCatScores((prev) => ({ ...prev, ...remoteScores }));
        }
        setExamScores(loadExamScores());
      });
    };
    loadScores();
    window.addEventListener('cictrix:category-scores-updated', loadScores);
    return () => {
      cancelled = true;
      window.removeEventListener('cictrix:category-scores-updated', loadScores);
    };
  }, []);

  const applicantIdsKey = useMemo(
    () => [...new Set(applicants.map((a) => a.id))].join('|'),
    [applicants],
  );

  useEffect(() => {
    let cancelled = false;
    const ids = applicantIdsKey ? applicantIdsKey.split('|') : [];
    const loadSummaries = () => {
      void fetchApplicantScoreSummaries(ids).then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setSummariesLoadFailed(true);
          return;
        }
        const next: Record<string, ApplicantScoreSummary> = {};
        for (const [id, summary] of result.data) {
          next[id] = summary;
        }
        setScoreSummaries(next);
        setSummariesLoadFailed(false);
      });
    };
    loadSummaries();
    window.addEventListener(CATEGORY_SCORES_UPDATED_EVENT, loadSummaries);
    return () => {
      cancelled = true;
      window.removeEventListener(CATEGORY_SCORES_UPDATED_EVENT, loadSummaries);
    };
  }, [applicantIdsKey]);

  const handleSaveExamTotal = useCallback(async (position: string, total: number) => {
    const result = await saveWrittenExamTotal(position, total);
    if (result.ok) setExamTotals((prev) => ({ ...prev, [position]: total }));
    return result;
  }, []);

  // Written exam scores the interviewer saved, so lowering a total also checks them.
  const knownExamScoresFor = useCallback((folder: PositionFolder): ScoredApplicant[] =>
    folder.applicants.map((a) => {
      const snap = evaluationsByApplicant?.[a.id];
      return { id: a.id, name: a.full_name, score: typeof snap?.writtenExamRawScore === 'number' ? snap.writtenExamRawScore : null };
    }),
    [evaluationsByApplicant],
  );

  const qualifiedBase = useMemo(() =>
    applicants.filter(a => {
      const s = a.status.toLowerCase();
      // Exclude disqualified/rejected — they are removed from all list views.
      if (s.includes('not qualified') || s.includes('disqualif') || s.includes('reject')) return false;
      // Exclude applicants who have finished the pipeline.
      if (s.includes('accepted') || s.includes('hired')) return false;
      // Once an applicant has a scheduled exam/interview they belong here to be
      // scored — regardless of their status label. Scheduling doesn't move an
      // applicant off "Qualified"/"Recommended for Hiring", so keying inclusion
      // on status alone hid every scheduled applicant from scoring (e.g. an
      // Engineer II applicant scheduled from the Qualified Applicants tab never
      // appeared here).
      if (a.exam_date || a.interview_date) return true;
      // Not yet scheduled: keep the original behaviour — fully qualified /
      // recommended applicants wait in the Qualified Applicants tab; everyone in
      // the interview/evaluation pipeline shows here.
      if (s === 'qualified' || s.includes('recommended for hiring')) return false;
      return s.includes('shortlist') || s.includes('interview') || s.includes('review') || completedEvaluationIds.has(a.id);
    }),
    [applicants, completedEvaluationIds],
  );

  const folders = useMemo((): PositionFolder[] => {
    const map = new Map<string, PositionFolder>();
    qualifiedBase.forEach(a => {
      const pos = a.position || 'Unassigned';
      if (!map.has(pos)) map.set(pos, { position: pos, office: a.office || '—', count: 0, examStatus: 'pending', applicants: [] });
      const f = map.get(pos)!;
      f.applicants.push(a);
      f.count++;
    });
    return Array.from(map.values()).map(f => {
      const posExam = examScores[f.position] ?? {};
      const withScore = f.applicants.filter(a => posExam[a.id] !== undefined && posExam[a.id] !== '').length;
      const examStatus: ExamStatus = withScore === 0 ? 'pending' : withScore < f.applicants.length ? 'in-progress' : 'completed';
      return { ...f, examStatus };
    });
  }, [qualifiedBase, examScores]);

  const positions = useMemo(() => [...new Set(folders.map(f => f.position))].sort(), [folders]);
  const offices   = useMemo(() => [...new Set(folders.map(f => f.office))].sort(),   [folders]);

  const filteredFolders = useMemo(() =>
    folders.filter(f => {
      if (posFilter  !== 'all' && f.position   !== posFilter)  return false;
      if (offFilter  !== 'all' && f.office     !== offFilter)  return false;
      if (examFilter !== 'all' && f.examStatus !== examFilter) return false;
      if (search) {
        const t = search.toLowerCase();
        return f.position.toLowerCase().includes(t) || f.office.toLowerCase().includes(t) || f.applicants.some(a => a.full_name.toLowerCase().includes(t));
      }
      return true;
    }),
    [folders, posFilter, offFilter, examFilter, search],
  );

  const handleSaveExam = useCallback((position: string, scores: Record<string, string>) => {
    const updated = { ...examScores, [position]: scores };
    setExamScores(updated);

    const scoresNumeric: Record<string, number> = {};
    Object.entries(scores).forEach(([id, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        scoresNumeric[id] = num;
      }
    });

    const updatedCat = { ...catScores };
    const posApplicants = folders.find(f => f.position === position)?.applicants ?? [];
    Object.entries(scores).forEach(([id, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        const applicant = posApplicants.find(a => a.id === id);
        if (applicant) {
          const existing = deriveInitial(applicant, updatedCat);
          updatedCat[id] = { ...existing, writtenExam: { ...existing.writtenExam, initialScore: num } };
        }
      }
    });
    setCatScores(updatedCat);

    void savePositionWrittenExamScores(position, scoresNumeric);
  }, [examScores, catScores, folders]);

  const handleSaveCatScores = useCallback(async (applicantId: string, scores: ApplicantCategoryScores) => {
    const result = await saveApplicantCategoryScores(applicantId, scores);
    if (result.ok) {
      setCatScores((prev) => ({ ...prev, [applicantId]: scores }));
    }
    return result;
  }, []);

  // Browser Back closes one level: an open modal first, then the folder.
  useBackClosesView(openFolder !== null, () => setOpenFolder(null), 'score-folder');
  useBackClosesView(scoresCtx !== null, () => setScoresCtx(null), 'score-modal');
  useBackClosesView(examModal !== null, () => setExamModal(null), 'exam-modal');

  // Keep openFolder in sync if folders list changes
  const liveOpenFolder = useMemo(
    () => (openFolder ? folders.find(f => f.position === openFolder.position) ?? null : null),
    [openFolder, folders],
  );

  return (
    <>
      {liveOpenFolder ? (
        <ApplicantsListView
          folder={liveOpenFolder}
          onBack={() => setOpenFolder(null)}
          completedEvaluationIds={completedEvaluationIds}
          savedCatScores={catScores}
          scoreSummaries={scoreSummaries}
          summariesLoadFailed={summariesLoadFailed}
          evaluationsByApplicant={evaluationsByApplicant}
          examScores={examScores}
          examTotal={totalForPosition(examTotals, liveOpenFolder.position)}
          onUpdateScores={(a) => setScoresCtx({ applicant: a, folder: liveOpenFolder })}
        />
      ) : (
        <>
          {examTotalsLoadFailed && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-4 text-sm text-[var(--neutral-800)]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--warning-700)]" aria-hidden="true" />
              <span>We couldn't load the written exam total points, so scores show out of {DEFAULT_WRITTEN_EXAM_TOTAL} for now. Reload the page to try again.</span>
            </div>
          )}
          {/* Stats row */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="!mb-2 text-sm text-[var(--text-secondary)]">Total Qualified Applicants</p>
                  <p className="!mb-0 text-3xl font-bold">{qualifiedBase.length}</p>
                </div>
                <div className="rounded-2xl bg-blue-100 p-4 text-blue-600"><Users size={28} /></div>
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--border-color)] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="!mb-2 text-sm text-[var(--text-secondary)]">Total Job Positions</p>
                  <p className="!mb-0 text-3xl font-bold">{folders.length}</p>
                </div>
                <div className="rounded-2xl bg-indigo-100 p-4 text-indigo-600"><FolderOpen size={28} /></div>
              </div>
            </article>
          </section>

          {/* Filters */}
          <section className="rounded-2xl border border-[var(--border-color)] bg-white p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="relative sm:col-span-2 xl:col-span-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search positions or applicants…" className="w-full rounded-xl border border-[var(--border-color)] py-2.5 pl-9 pr-4 text-sm" />
              </div>
              <select value={posFilter} onChange={e => setPosFilter(e.target.value)} className="rounded-xl border border-[var(--border-color)] p-2.5 text-sm">
                <option value="all">All Positions</option>
                {positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={offFilter} onChange={e => setOffFilter(e.target.value)} className="rounded-xl border border-[var(--border-color)] p-2.5 text-sm">
                <option value="all">All Offices</option>
                {offices.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <select value={examFilter} onChange={e => setExamFilter(e.target.value as 'all' | ExamStatus)} className="rounded-xl border border-[var(--border-color)] p-2.5 text-sm">
                <option value="all">All Exam Statuses</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </section>

          {/* Folder table */}
          <div className="abyan-table-wrap">
            <table className="abyan-table w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Written Exam</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Total Points</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  <th className="w-8 px-3 py-3" />
                </tr>
              </thead>
              <tbody className={tableBodyClass(false)}>
                {folderLoad.initialLoading && (
                  <TableSkeletonRows show={folderLoad.showSkeleton}
                    columns={['text', 'text', 'text', 'badge', 'text', 'text', 'button', 'text']} label="Loading applicant folders…" />
                )}
                {!folderLoad.initialLoading && filteredFolders.map(folder => {
                  const es = EXAM_STYLES[folder.examStatus];
                  const posExam = examScores[folder.position] ?? {};
                  const scored  = folder.applicants.filter(a => posExam[a.id] && posExam[a.id] !== '').length;
                  const pct     = folder.count > 0 ? (scored / folder.count) * 100 : 0;
                  return (
                    <tr
                      key={folder.position}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 cursor-pointer group"
                      onClick={() => setOpenFolder(folder)}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="shrink-0 rounded-lg bg-amber-100 p-1.5 text-amber-600"><FolderOpen size={15} /></div>
                          <span className="font-semibold text-sm text-slate-800">{folder.position}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">{folder.office}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="font-bold text-slate-900 text-sm">{folder.count}</span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${es.bg} ${es.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${es.dot}`} />
                          {es.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${scored === folder.count && folder.count > 0 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold whitespace-nowrap ${scored < folder.count ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {scored}/{folder.count}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center text-sm font-semibold text-slate-800">
                        {totalForPosition(examTotals, folder.position)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExamModal(folder); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
                        >
                          <Pencil size={12} /> Exam Score
                        </button>
                      </td>
                      <td className="w-8 px-3 py-4 text-slate-400 group-hover:text-blue-600 transition-colors">
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })}
                {!folderLoad.initialLoading && filteredFolders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                      <FolderOpen size={40} className="mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold">No qualified applicant folders found</p>
                      <p className="mt-1 text-xs text-slate-400">Applicants appear here once their status is marked Qualified or Shortlisted.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modals */}
      {examModal && (
        <ExamScoresModal
          folder={examModal}
          existingScores={examScores[examModal.position] ?? {}}
          knownScores={knownExamScoresFor(examModal)}
          total={totalForPosition(examTotals, examModal.position)}
          canEditTotal={canEditTotal}
          onSaveTotal={(total) => handleSaveExamTotal(examModal.position, total)}
          onClose={() => setExamModal(null)}
          onSave={scores => { handleSaveExam(examModal.position, scores); }}
        />
      )}

      {scoresCtx && (
        <ApplicantScoringModal
          key={scoresCtx.applicant.id}
          applicant={scoresCtx.applicant}
          allApplicants={scoresCtx.folder.applicants}
          savedScores={catScores}
          evaluation={evaluationsByApplicant?.[scoresCtx.applicant.id]}
          examTotal={totalForPosition(examTotals, scoresCtx.folder.position)}
          durablyFinalized={scoreSummaries[scoresCtx.applicant.id]?.isFinalized === true}
          onClose={() => setScoresCtx(null)}
          onSave={handleSaveCatScores}
        />
      )}
    </>
  );
};
