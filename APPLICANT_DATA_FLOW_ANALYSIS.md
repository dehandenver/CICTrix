import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Info,
  Lock,
  Medal,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ATTACHMENTS_BUCKET, supabase } from '../lib/supabase';
import {
  fetchLatestEvaluationForApplicantOrEmailAnySource,
  subscribeToEvaluationChanges,
  type EvaluationSnapshot,
} from '../lib/evaluationScores';

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
  total_score: number | null;
  /** 'promotion' = applicant is a current employee (verified via wizard auth);
      'job' / null = new applicant. Drives appointment-type lock in scoring modal. */
  application_type?: string | null;
}

interface ScoringCat {
  initialScore: number;
  finalScore: number | null;
  remarks: string;
}

interface ApplicantCategoryScores {
  education:   ScoringCat;
  experience:  ScoringCat;
  performance: ScoringCat;
  pcpt:        ScoringCat;
  potential:   ScoringCat;
  writtenExam: ScoringCat;
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
}

type ExamStatus      = 'pending' | 'in-progress' | 'completed';
type CatKey          = 'education' | 'experience' | 'performance' | 'pcpt' | 'potential' | 'writtenExam';
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
    color: 'var(--accent-blue)', bg: 'var(--score-very-good-bg)', border: 'var(--accent-blue)', badgeBg: 'var(--score-very-good-bg)', rspOwned: true,
    guide: "Bachelor's Degree = 15 pts | Master's Degree = 18 pts | Doctorate = 20 pts",
  },
  experience:  {
    roman: 'II',  label: 'Experience',         maxOriginal: 25, maxPromotional: 25,
    color: 'var(--accent-orange)', bg: 'var(--status-warning-light)', border: 'var(--accent-orange)', badgeBg: 'var(--status-warning-light)', rspOwned: true,
    guide: '1-5 yrs = 12 pts | 6-10 yrs = 14 pts | 11-15 yrs = 16 pts | 16-20 yrs = 18 pts | 21+ yrs = 25 pts',
  },
  performance: {
    roman: 'III', label: 'Performance Rating', maxOriginal: 0,  maxPromotional: 20,
    color: 'var(--status-warning)', bg: 'var(--score-average-bg)', border: 'var(--status-warning)', badgeBg: 'var(--score-average-bg)', rspOwned: true,
    guide: 'Outstanding = 20 pts | Very Satisfactory = 18 pts | Satisfactory = 15 pts | Unsatisfactory = 0 pts',
  },
  pcpt:        {
    roman: 'IV',  label: 'PCPT',               maxOriginal: 20, maxPromotional: 10,
    color: 'var(--accent-purple)', bg: 'var(--score-good-bg)', border: 'var(--accent-purple)', badgeBg: 'var(--score-good-bg)', rspOwned: false,
    guide: '20-22 = 10 pts | 23-25 = 12 pts | 26-28 = 14 pts | 29-31 = 16 pts | 32-34 = 18 pts | 35 = 20 pts',
  },
  potential:   {
    roman: 'V',   label: 'Potential',           maxOriginal: 0,  maxPromotional: 25,
    color: 'var(--status-success)', bg: 'var(--score-excellent-bg)', border: 'var(--status-success)', badgeBg: 'var(--score-excellent-bg)', rspOwned: false,
    guide: '51-60 = 12 pts | 61-70 = 14 pts | 71-80 = 16 pts | 81-90 = 18 pts | 91-100 = 25 pts',
  },
  writtenExam: {
    roman: '—',   label: 'Written Exam',        maxOriginal: 100, maxPromotional: 100,
    color: 'var(--status-success)', bg: 'var(--score-excellent-bg)', border: 'var(--status-success)', badgeBg: 'var(--score-excellent-bg)', rspOwned: false,
    guide: 'Raw score 0–100. Contributes 30% to overall score.',
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
  experience:  ['previous_employer_certificate', 'service_record'],
  performance: ['performance_evaluation', 'performance_rating'],
  pcpt:        ['pcpt', 'psychometric'],
  potential:   ['potential_assessment', 'potential'],
  writtenExam: ['written_exam', 'exam_sheet'],
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const EXAM_KEY = 'cictrix_exam_scores';
const CAT_KEY  = 'cictrix_category_scores';

const loadExamScores = (): Record<string, Record<string, string>> => {
  try { return JSON.parse(localStorage.getItem(EXAM_KEY) ?? '{}'); } catch { return {}; }
};

const loadCatScores = (): Record<string, ApplicantCategoryScores> => {
  try { return JSON.parse(localStorage.getItem(CAT_KEY) ?? '{}'); } catch { return {}; }
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const deriveInitial = (
  applicant: ApplicantRecord,
  saved: Record<string, ApplicantCategoryScores>,
): ApplicantCategoryScores => {
  if (saved[applicant.id]) return saved[applicant.id];
  const pct = (applicant.total_score ?? 0) / 100;
  return {
    education:   { initialScore: +((pct * 20).toFixed(1)),  finalScore: null, remarks: '' },
    experience:  { initialScore: +((pct * 25).toFixed(1)),  finalScore: null, remarks: '' },
    performance: { initialScore: +((pct * 20).toFixed(1)),  finalScore: null, remarks: '' },
    pcpt:        { initialScore: +((pct * 20).toFixed(1)),  finalScore: null, remarks: '' },
    potential:   { initialScore: +((pct * 25).toFixed(1)),  finalScore: null, remarks: '' },
    writtenExam: { initialScore: 0,                          finalScore: null, remarks: '' },
  };
};

const calcOverall = (scores: ApplicantCategoryScores): { value: number | null; pct: string | null } => {
  for (const k of BASE_CATS) if (scores[k].finalScore === null) return { value: null, pct: null };
  if (scores.writtenExam.finalScore === null) return { value: null, pct: null };
  const base = BASE_CATS.reduce((s, k) => s + (scores[k].finalScore ?? 0), 0);
  const val = +(base + (scores.writtenExam.finalScore ?? 0) * 0.30).toFixed(2);
  return { value: val, pct: ((val / MAX_TOTAL) * 100).toFixed(1) };
};

const calcModalScore = (
  scores: ApplicantCategoryScores,
  apptType: AppointmentType,
): number => {
  if (apptType === 'promotional') {
    return (scores.education.finalScore   ?? 0) +
           (scores.experience.finalScore  ?? 0) +
           (scores.performance.finalScore ?? 0) +
           (scores.potential.finalScore   ?? 0) +
           (scores.pcpt.finalScore        ?? 0);
  }
  return (scores.education.finalScore  ?? 0) +
         (scores.experience.finalScore ?? 0) +
         (scores.writtenExam.finalScore ?? 0) * 0.30 +
         (scores.pcpt.finalScore       ?? 0);
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

const writtenExamRawToConvertedScore = (raw: number) => +((raw || 0) * 0.30).toFixed(2);

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

// ─── FilesViewerModal ─────────────────────────────────────────────────────────

interface FilesViewerModalProps {
  title: string;
  files: AttachmentRow[];
  onClose: () => void;
}

const FilesViewerModal = ({ title, files, onClose }: FilesViewerModalProps) => {
  const openFile = async (row: AttachmentRow) => {
    try {
      const { data } = await (supabase as any).storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrl(row.file_path, 300);
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      window.open(row.file_path, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
      <div style={{ background: 'var(--bg-control)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 520 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid var(--border-subtle)`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--status-error-light)', color: 'var(--status-error)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={16} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {files.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem 0', fontSize: '0.9rem' }}>
              No files uploaded for this category.
            </p>
          ) : (
            files.map((f) => (
              <div
                key={f.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: 'var(--bg-sidebar)', border: `1px solid var(--border-subtle)`, borderRadius: 10, padding: '0.75rem 1rem' }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--status-error-light)', color: 'var(--status-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {fmtSize(f.file_size)}{f.created_at ? ` · ${fmtDate(f.created_at)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: 'var(--accent-blue)', border: 'none', borderRadius: 6, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', flexShrink: 0 }}
                >
                  <Download size={13} /> Open
                </button>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '0.85rem 1.5rem', borderTop: `1px solid var(--border-subtle)`, textAlign: 'right' }}>
          <button type="button" onClick={onClose} style={{ padding: '0.55rem 1.25rem', background: 'none', border: `1px solid var(--border-subtle)`, borderRadius: 8, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ExamScoresModal ─────────────────────────────────────────────────────────

interface ExamScoresModalProps {
  folder:         PositionFolder;
  existingScores: Record<string, string>;
  onClose:        () => void;
  onSave:         (scores: Record<string, string>) => void;
}

const ExamScoresModal = ({ folder, existingScores, onClose, onSave }: ExamScoresModalProps) => {
  const [scores, setScores] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(folder.applicants.map((a) => [a.id, ''])),
    ...existingScores,
  }));
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const isValid = (v: string) => v === '' || (!isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100);
  const allFilled = folder.applicants.every((a) => {
    const v = scores[a.id] ?? '';
    return v !== '' && isValid(v);
  });

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
      <div style={{ background: 'var(--bg-control)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid var(--border-subtle)`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Pencil size={20} style={{ color: 'var(--accent-primary)' }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Written Examination Scores</h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{folder.position}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>
        {/* Instructions */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: `1px solid var(--border-subtle)` }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Enter the written examination score (0–100) for each applicant.
          </p>
        </div>
        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {ranked.map((a, i) => {
            const val = scores[a.id] ?? '';
            const valid = isValid(val);
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
                </div>
                {prev && prev !== '' && (
                  <span style={{ background: 'var(--status-pending-light)', color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.875rem', padding: '0.2rem 0.7rem', borderRadius: 999, flexShrink: 0 }}>
                    {prev}
                  </span>
                )}
                <input
                  type="number" min={0} max={100} step={1}
                  value={val}
                  onChange={(e) => setScores(p => ({ ...p, [a.id]: e.target.value }))}
                  placeholder="Score"
                  style={{ width: 85, border: `1.5px solid ${val !== '' && !valid ? 'var(--status-error)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '0.45rem 0.65rem', fontSize: '0.95rem', outline: 'none', background: val !== '' && !valid ? 'var(--status-error-light)' : 'var(--bg-control)', textAlign: 'right', flexShrink: 0, color: 'var(--text-primary)' }}
                />
              </div>
            );
          })}
        </div>
        {/* Footer */}
        <div style={{ padding: '0.9rem 1.5rem', borderTop: `1px solid var(--border-subtle)`, display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
          <button type="button" onClick={onClose} style={{ padding: '0.55rem 1.25rem', background: 'none', border: `1px solid var(--border-subtle)`, borderRadius: 8, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button" onClick={handleSave} disabled={!allFilled || saving || saved}
            style={{ padding: '0.55rem 1.5rem', background: saved ? 'var(--status-success)' : allFilled ? 'var(--accent-blue)' : 'var(--accent-blue-light)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', cursor: !allFilled || saving || saved ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Save size={15} />
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Scores'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── ApplicantScoringModal ─────────────────────────────────────────────────────

interface ApplicantScoringModalProps {
  applicant:    ApplicantRecord;
  savedScores:  Record<string, ApplicantCategoryScores>;
  allApplicants: ApplicantRecord[];
  evaluation?:  EvaluationSnapshot | null;
  onClose:      () => void;
  onSave:       (applicantId: string, scores: ApplicantCategoryScores) => void;
}

const ApplicantScoringModal = ({ applicant, savedScores, allApplicants, evaluation, onClose, onSave }: ApplicantScoringModalProps) => {
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
    const pcptRaw = typeof evaluation?.pcptRawScore === 'number'
      ? evaluation.pcptRawScore
        : null;
    const writtenRaw = typeof evaluation?.writtenExamRawScore === 'number'
      ? evaluation.writtenExamRawScore
      : null;
    return {
      ...base,
      pcpt: { ...base.pcpt, initialScore: pcptRaw ?? base.pcpt.initialScore, finalScore: pcptRaw === null ? base.pcpt.finalScore : pcptRawToConvertedScore(pcptRaw) },
      writtenExam: { ...base.writtenExam, initialScore: writtenRaw ?? base.writtenExam.initialScore, finalScore: writtenRaw ?? base.writtenExam.finalScore },
    };
  });
  const [apptType,  setApptType]  = useState<AppointmentType>(
    isCurrentEmployee ? 'promotional' : (savedScores[applicant.id]?.appointmentType ?? 'original'),
  );
  const [posType,   setPosType]   = useState<PositionType>(savedScores[applicant.id]?.positionType ?? 'rank-and-file');
  const [isFinalized, setIsFinalized] = useState(hasPersistedScores);
  const [saving,    setSaving]    = useState(false);
  const [filesModal, setFilesModal] = useState<{ catKey: CatKey; files: AttachmentRow[] } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [liveEvaluation, setLiveEvaluation] = useState<EvaluationSnapshot | null>(evaluation ?? null);

  useEffect(() => {
    setLiveEvaluation(evaluation ?? null);
  }, [evaluation]);

  useEffect(() => {
    const saved = savedScores[applicant.id];
    const t: AppointmentType = saved?.appointmentType ?? (isCurrentEmployee ? 'promotional' : 'original');
    setIsFinalized(isFullySaved(saved, t));
    // isFullySaved is referentially stable per render; including it in deps would
    // cause needless re-runs without changing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant.id, savedScores, isCurrentEmployee]);

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
    const pcptRaw = typeof liveEvaluation?.pcptRawScore === 'number'
      ? liveEvaluation.pcptRawScore
        : null;
    const writtenRaw = typeof liveEvaluation?.writtenExamRawScore === 'number'
      ? liveEvaluation.writtenExamRawScore
      : null;

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
    }));
  }, [applicant.id, liveEvaluation?.applicantId, liveEvaluation?.pcptRawScore, liveEvaluation?.writtenExamRawScore, savedScores]);

  // Load attachments for this applicant
  useEffect(() => {
    const fetchAttachments = async () => {
      setLoadingFiles(true);
      try {
        const { data } = await (supabase as any)
          .from('applicant_attachments')
          .select('id, file_name, file_path, file_type, document_type, created_at, file_size')
          .eq('applicant_id', applicant.id);
        setAttachments(data ?? []);
      } catch {
        setAttachments([]);
      } finally {
        setLoadingFiles(false);
      }
    };
    void fetchAttachments();
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

  const interviewerCategories: CatKey[] = apptType === 'promotional'
    ? ['pcpt']
    : ['pcpt', 'writtenExam'];

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      const merged: ApplicantCategoryScores = { ...scores, appointmentType: apptType, positionType: posType };
      onSave(applicant.id, merged);
      setSaving(false);
      setIsFinalized(true);
    }, 300);
  };

  void allApplicants;

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem' }}>
        <div style={{ background: 'var(--bg-control)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', width: '100%', maxWidth: 760, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Blue header */}
          <div style={{ background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-blue) 100%)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Applicant Evaluation &amp; Scoring</h2>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {applicant.full_name} &mdash; {applicant.position}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary)', padding: '0.35rem', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

            {/* Score finalized banner */}
            {isFinalized && (
              <div style={{ background: 'var(--status-success-light)', border: `1px solid var(--status-success)`, borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <CheckCircle2 size={18} style={{ color: 'var(--status-success)', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--status-success)', fontSize: '0.95rem' }}>Score Finalized — View Only Mode</p>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>This applicant's evaluation has been finalized. Fields are read-only.</p>
                </div>
              </div>
            )}

            {/* Appointment Type */}
            <div style={{ background: 'var(--bg-sidebar)', border: `1px solid var(--border-subtle)`, borderRadius: 12, padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <RefreshCw size={15} style={{ color: 'var(--accent-blue)' }} /> Select Appointment Type
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {(['original', 'promotional'] as AppointmentType[]).map(t => {
                  // Lock the Original button when applicant is a current employee.
                  const isLockedOriginal = isCurrentEmployee && t === 'original';
                  const buttonDisabled = isFinalized || isLockedOriginal;
                  return (
                    <button
                      key={t} type="button" disabled={buttonDisabled}
                      onClick={() => { if (!buttonDisabled) setApptType(t); }}
                      title={isLockedOriginal ? 'Locked: applicant is a current employee' : undefined}
                      style={{
                        border: `2px solid ${apptType === t ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                        borderRadius: 10,
                        padding: '0.9rem 1rem',
                        cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                        background: apptType === t ? 'var(--accent-blue-light)' : 'var(--bg-control)',
                        textAlign: 'left',
                        opacity: isLockedOriginal ? 0.45 : 1,
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {t === 'original' ? 'Original Appointment' : 'Promotional Appointment'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {t === 'original'
                          ? 'Education • Experience • Written Exam • Oral Exam* • PCPT*'
                          : 'Education • Experience • Performance • PCPT* • Potential'}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>*Interviewer-provided</p>
                      {isLockedOriginal && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--status-error)', fontWeight: 600 }}>
                          Locked — applicant is a current employee
                        </p>
                      )}
                      {isCurrentEmployee && t === 'promotional' && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
                          Auto-set: applicant is a current employee
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Position type toggle (Original only) */}
              {apptType === 'original' && (
                <div style={{ marginTop: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <p style={{ margin: '0 0 0.45rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', gridColumn: '1/-1' }}>
                    Position Type (for Written Exam scoring)
                  </p>
                  {(['rank-and-file', 'executive'] as PositionType[]).map(pt => (
                    <button
                      key={pt} type="button" disabled={isFinalized}
                      onClick={() => setPosType(pt)}
                      style={{ border: `2px solid ${posType === pt ? 'var(--accent-blue)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '0.6rem', cursor: isFinalized ? 'default' : 'pointer', background: posType === pt ? 'var(--accent-blue)' : 'var(--bg-control)', color: posType === pt ? 'var(--text-primary)' : 'var(--text-primary)', fontWeight: 700, fontSize: '0.875rem' }}
                    >
                      {pt === 'rank-and-file' ? 'Rank and File' : 'Executive / Managerial'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Final Numerical Score */}
            <div style={{ background: 'var(--status-success-light)', border: `1px solid var(--status-success)`, borderRadius: 12, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Calculator size={24} style={{ color: 'var(--status-success)' }} />
                <div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Final Numerical Score</p>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{totalScore.toFixed(2)}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#4b5563' }}>Adjectival Rating</p>
                <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: adjRating.color }}>{adjRating.label}</p>
              </div>
            </div>

            {/* Scoring Responsibility */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.85rem 1rem' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#92400e', fontSize: '0.875rem' }}>Scoring Responsibility:</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#78350f' }}>
                <strong>RSP enters:</strong>{' '}
                {apptType === 'promotional'
                  ? 'Education, Experience, Performance Rating, Potential'
                  : 'Education, Experience, Written Examination'}
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#78350f' }}>
                <strong>Interviewer provides:</strong>{' '}
                {apptType === 'promotional'
                  ? 'PCPT (Physical Characteristics & Personality Traits)'
                  : 'PCPT, Oral Examination'}
              </p>
            </div>

            {/* RSP-entered categories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
              {rspCategories.map((catKey) => {
                const meta = CAT_META[catKey];
                const cat  = scores[catKey];
                const max  = apptType === 'promotional' ? meta.maxPromotional : meta.maxOriginal;
                const catFiles = getFilesForCat(catKey);
                const rawVal = cat.finalScore === null ? '' : String(cat.finalScore);
                const percentLabel = catKey === 'education' ? '20%' : catKey === 'experience' ? '25%' : catKey === 'performance' ? '20%' : '25%';

                // Per-category semantic input
                let inputEl: JSX.Element;
                if (catKey === 'education') {
                  inputEl = (
                    <select
                      disabled={isFinalized}
                      value={rawVal}
                      onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.95rem', outline: 'none', background: isFinalized ? '#f8fafc' : '#fff', color: '#0f172a', boxSizing: 'border-box', marginBottom: '0.45rem' }}
                    >
                      <option value="">Select Educational Attainment</option>
                      <option value="15">Bachelor's Degree (15 pts)</option>
                      <option value="18">Master's Degree (18 pts)</option>
                      <option value="20">Doctorate (20 pts)</option>
                    </select>
                  );
                } else if (catKey === 'experience') {
                  const yearsToPoints = (y: number) => {
                    if (y >= 21) return 25;
                    if (y >= 16) return 18;
                    if (y >= 11) return 16;
                    if (y >= 6)  return 14;
                    if (y >= 1)  return 12;
                    return 0;
                  };
                  inputEl = (
                    <input
                      type="number" min={0} step={1}
                      placeholder="Enter years of experience"
                      readOnly={isFinalized}
                      onChange={(e) => {
                        if (isFinalized) return;
                        const y = parseFloat(e.target.value);
                        if (isNaN(y)) { setFinal(catKey, ''); return; }
                        setFinal(catKey, String(yearsToPoints(y)));
                      }}
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.95rem', outline: 'none', background: isFinalized ? '#f8fafc' : '#fff', color: '#0f172a', boxSizing: 'border-box', marginBottom: '0.45rem' }}
                    />
                  );
                } else if (catKey === 'performance') {
                  inputEl = (
                    <select
                      disabled={isFinalized}
                      value={rawVal}
                      onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.95rem', outline: 'none', background: isFinalized ? '#f8fafc' : '#fff', color: '#0f172a', boxSizing: 'border-box', marginBottom: '0.45rem' }}
                    >
                      <option value="">Select Performance Rating</option>
                      <option value="20">Outstanding (20 pts)</option>
                      <option value="18">Very Satisfactory (18 pts)</option>
                      <option value="15">Satisfactory (15 pts)</option>
                      <option value="0">Unsatisfactory (0 pts)</option>
                    </select>
                  );
                } else {
                  // potential: raw score 51-100 → converted
                  const rawToPoints = (r: number) => {
                    if (r >= 91) return 25;
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
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.95rem', outline: 'none', background: isFinalized ? '#f8fafc' : '#fff', color: '#0f172a', boxSizing: 'border-box', marginBottom: '0.45rem' }}
                    />
                  );
                }

                return (
                  <div key={catKey} style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 12, padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      <span style={{ width: 28, height: 28, borderRadius: '50%', background: meta.color, color: '#fff', fontWeight: 800, fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {meta.roman}
                      </span>
                      <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
                        {meta.label} ({percentLabel})
                      </p>
                    </div>

                    {/* Initial score row */}
                    <div style={{ background: '#fff', borderRadius: 8, padding: '0.45rem 0.75rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Initial {meta.label} Score:</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: meta.color }}>{cat.initialScore}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>previously saved</span>
                    </div>

                    {/* Potential auto-fill banner */}
                    {catKey === 'potential' && cat.initialScore > 0 && !isFinalized && (
                      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#1d4ed8' }}>Auto-Fill Available</p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#1e40af' }}>Last Original Appointment Score: {cat.initialScore}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFinal(catKey, String(cat.initialScore))}
                          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '0.35rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                        >
                          Use This Score
                        </button>
                      </div>
                    )}

                    {/* Score input */}
                    {inputEl}

                    {/* Guide */}
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.73rem', color: '#64748b', lineHeight: 1.5 }}>{meta.guide}</p>

                    {/* Score display */}
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: meta.color, fontWeight: 600 }}>
                      Score: {cat.finalScore ?? 0}
                    </p>

                    {/* View files */}
                    <button
                      type="button"
                      onClick={() => setFilesModal({ catKey, files: catFiles })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: meta.color, fontSize: '0.8rem', fontWeight: 600, padding: 0 }}
                    >
                      <FileText size={13} />
                      View {meta.label} Documents ({loadingFiles ? '…' : catFiles.length} files)
                      <ExternalLink size={11} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Interviewer-Provided Scores */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
                <Users size={18} style={{ color: '#7c3aed' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                  Interviewer-Provided Scores (Auto-Generated by System)
                </p>
              </div>

              {/* Locked notice */}
              <div style={{ background: '#fff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <Lock size={16} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>RSP Cannot Edit These Scores</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#475569' }}>
                    The following scores are automatically provided by the interview panel and cannot be manually entered by RSP staff.
                  </p>
                </div>
              </div>

              {/* Interviewer categories */}
              <div style={{ display: 'grid', gridTemplateColumns: interviewerCategories.length > 1 ? '1fr 1fr' : '1fr', gap: '0.75rem' }}>
                {interviewerCategories.map((catKey) => {
                  const meta = CAT_META[catKey];
                  const cat  = scores[catKey];
                  const max  = apptType === 'promotional' ? meta.maxPromotional : meta.maxOriginal;
                  const convertedMax = catKey === 'writtenExam' ? 30 : max;
                  const catFiles = getFilesForCat(catKey);
                  const interviewerRaw = catKey === 'pcpt'
                    ? (typeof liveEvaluation?.pcptRawScore === 'number' ? liveEvaluation.pcptRawScore : null)
                    : (typeof liveEvaluation?.writtenExamRawScore === 'number' ? liveEvaluation.writtenExamRawScore : null);
                  const rawVal = interviewerRaw !== null
                    ? String(interviewerRaw)
                    : (cat.initialScore === 0 ? '' : String(cat.initialScore));
                  const convertedScore = catKey === 'pcpt'
                    ? (typeof cat.finalScore === 'number' ? cat.finalScore : 0)
                    : writtenExamRawToConvertedScore(typeof cat.finalScore === 'number' ? cat.finalScore : 0);
                  return (
                    <div key={catKey} style={{ background: '#fff', border: `1px solid ${meta.border}`, borderRadius: 10, padding: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: meta.color, color: '#fff', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {meta.roman}
                        </span>
                        <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.875rem' }}>{meta.label} (20%)</p>
                      </div>

                      <div style={{ background: '#f8fafc', borderRadius: 7, padding: '0.35rem 0.65rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Initial {meta.label} Score:</span>
                        <span style={{ fontWeight: 700, color: meta.color, fontSize: '0.85rem' }}>{cat.initialScore}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>previously saved</span>
                      </div>

                      <div style={{ background: meta.badgeBg, border: `1px solid ${meta.border}`, borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.45rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', color: '#475569' }}>Raw Score:</span>
                          <input
                            type="number" min={0} max={100} step={1}
                            value={rawVal}
                            readOnly={true}
                            placeholder="—"
                            style={{ width: 70, border: 'none', background: 'transparent', textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: meta.color, outline: 'none' }}
                          />
                        </div>
                      </div>

                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.72rem', color: '#64748b', lineHeight: 1.5 }}>{meta.guide}</p>
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: '#7c3aed', fontWeight: 600 }}>
                        Converted Score: {convertedScore}/{convertedMax}
                      </p>

                      <button
                        type="button"
                        onClick={() => setFilesModal({ catKey, files: catFiles })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: meta.color, fontSize: '0.78rem', fontWeight: 600, padding: 0 }}
                      >
                        <FileText size={12} />
                        View {meta.label} Assessment Files ({loadingFiles ? '…' : catFiles.length} files)
                        <ExternalLink size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Adjectival Rating Reference */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 700, color: '#0f172a', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={14} /> Adjectival Rating Reference
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                {ADJECTIVAL_RANGES.slice(0, 4).map(r => (
                  <div key={r.label} style={{ background: r.bg, border: `1px solid ${r.color}30`, borderRadius: 8, padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: r.color }}>{r.min} - {r.max}</p>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569' }}>{r.label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, fontWeight: 600, fontSize: '0.9rem', color: '#475569', cursor: 'pointer' }}>
              Cancel
            </button>
            {!isFinalized && (() => {
              // RSP must fill every category they own for the chosen appointment
              // type before saving. Save stays disabled until each has a numeric
              // finalScore. (PCPT is interviewer-owned; not gated here.)
              const requiredKeys = requiredRspKeysForApptType(apptType);
              const missing = requiredKeys.filter((k) => typeof scores[k]?.finalScore !== 'number');
              const allRspCategoriesFilled = missing.length === 0;
              const disabled = saving || !allRspCategoriesFilled;
              return (
                <button
                  type="button" onClick={handleSave} disabled={disabled}
                  title={!allRspCategoriesFilled ? `Fill required fields: ${missing.join(', ')}` : undefined}
                  style={{
                    padding: '0.6rem 1.5rem',
                    background: '#2563eb',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    color: '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  <Save size={15} />
                  {saving ? 'Saving…' : allRspCategoriesFilled ? 'Save Scores' : 'Fill Required Fields'}
                </button>
              );
            })()}
          </div>
        </div>
      </div>

      {filesModal && (
        <FilesViewerModal
          title={`${CAT_META[filesModal.catKey].label} Files`}
          files={filesModal.files}
          onClose={() => setFilesModal(null)}
        />
      )}
    </>
  );
};

// ─── ApplicantsListView (inline) ──────────────────────────────────────────────

interface ApplicantsListViewProps {
  folder:                 PositionFolder;
  completedEvaluationIds: Set<string>;
  savedCatScores:         Record<string, ApplicantCategoryScores>;
  onBack:                 () => void;
  onUpdateScores:         (applicant: ApplicantRecord) => void;
}

const ApplicantsListView = ({ folder, completedEvaluationIds, savedCatScores, onBack, onUpdateScores }: ApplicantsListViewProps) => {
  const [search, setSearch] = useState('');

  const ranked = useMemo(() =>
    folder.applicants
      .filter(a => !search || a.full_name.toLowerCase().includes(search.toLowerCase()))
      .map(a => {
        const cs = deriveInitial(a, savedCatScores);
        return { ...a, overallScore: calcOverall(cs).value, catScores: cs };
      })
      .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1)),
    [folder.applicants, search, savedCatScores],
  );

  const SCORE_BADGES = [
    { key: 'education' as CatKey,   label: 'Education',    max: 20  },
    { key: 'experience' as CatKey,  label: 'Experience',   max: 25  },
    { key: 'performance' as CatKey, label: 'Performance',  max: 20  },
    { key: 'pcpt' as CatKey,        label: 'PCPT',         max: 20  },
    { key: 'potential' as CatKey,   label: 'Potential',    max: 25  },
    { key: 'writtenExam' as CatKey, label: 'Written Exam', max: 100 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#64748b' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, padding: 0 }}>RSP</button>
        <span>/</span>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontWeight: 600, padding: 0 }}>Qualified Applicants</button>
        <span>&gt;</span>
        <span style={{ color: '#0f172a', fontWeight: 700 }}>{folder.position}</span>
      </div>

      {/* Header with back arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.1rem 1.25rem' }}>
        <button type="button" onClick={onBack} style={{ background: '#f1f5f9', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#334155', display: 'flex', padding: '0.55rem' }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{folder.position}</h2>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            {folder.office} &middot; {folder.count} qualified applicant{folder.count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Search */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '0.85rem 1.25rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search applicants…"
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.6rem 0.75rem 0.6rem 2.25rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* Applicant table */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[#F8FAFC] text-[#040E6B] text-left text-xs uppercase tracking-wider font-bold border-b border-[#E2E8F0]">
            <tr>
              <th className="px-5 py-4 w-16 text-center">RANK</th>
              <th className="px-5 py-4">APPLICANT</th>
              <th className="px-5 py-4 text-center">STATUS</th>
              <th className="px-5 py-4 text-right">SCORE</th>
              <th className="px-5 py-4 text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((a, i) => {
              const isFinalized = !!savedCatScores[a.id] || completedEvaluationIds.has(a.id);
              const cs = a.catScores;
              const apptType: AppointmentType = cs.appointmentType ?? 'original';
              const evalTotal = calcModalScore(cs, apptType);
              const adj = getAdjectival(evalTotal);
              return (
                <tr key={a.id} className="border-b border-[#E2E8F0] align-middle hover:bg-slate-50/50 transition-colors text-slate-700">
                  <td className="px-5 py-4 text-center">
                    {i < 3 ? (
                      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full" style={{
                        background: i === 0 ? '#fbbf24' : i === 1 ? '#c0c0c0' : '#cd7f32',
                        color: 'white'
                      }}>
                        <Medal size={16} />
                      </div>
                    ) : (
                      <span className="font-bold text-slate-500">#{i + 1}</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-bold text-[#363EE8]">{a.full_name}</p>
                    <p className="text-xs text-slate-500">Qualified: {fmtDate(a.created_at)}</p>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${isFinalized ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                      {isFinalized && <CheckCircle2 size={14} />}
                      {isFinalized ? 'Finalized' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-bold" style={{ color: adj.color }}>{evalTotal.toFixed(2)} / 100</span>
                    <p className="text-xs font-semibold text-text-secondary">{adj.label}</p>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button" onClick={() => onUpdateScores(a)}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
                    >
                      <Pencil size={14} /> Update
                    </button>
                  </td>
                </tr>
              );
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-text-secondary">
                  No applicants found
                </td>
              </tr>
            )}
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
}

export const QualifiedApplicantsSection = ({ applicants, completedEvaluationIds, evaluationsByApplicant }: QualifiedApplicantsSectionProps) => {
  const [search,      setSearch]      = useState('');
  const [posFilter,   setPosFilter]   = useState('all');
  const [offFilter,   setOffFilter]   = useState('all');
  const [examFilter,  setExamFilter]  = useState<'all' | ExamStatus>('all');

  const [examModal,   setExamModal]   = useState<PositionFolder | null>(null);
  const [openFolder,  setOpenFolder]  = useState<PositionFolder | null>(null);
  const [scoresCtx,   setScoresCtx]   = useState<{ applicant: ApplicantRecord; folder: PositionFolder } | null>(null);

  const [examScores,  setExamScores]  = useState<Record<string, Record<string, string>>>(loadExamScores);
  const [catScores,   setCatScores]   = useState<Record<string, ApplicantCategoryScores>>(loadCatScores);

  const qualifiedBase = useMemo(() =>
    applicants.filter(a => {
      const s = a.status.toLowerCase();
      // Match both database status ("qualified", "shortlist") and recruitment UI status ("recommended for hiring", "shortlisted")
      return s.includes('qualified') || s.includes('shortlist') || s.includes('recommended') || completedEvaluationIds.has(a.id);
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
    localStorage.setItem(EXAM_KEY, JSON.stringify(updated));

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
    localStorage.setItem(CAT_KEY, JSON.stringify(updatedCat));
  }, [examScores, catScores, folders]);

  const handleSaveCatScores = useCallback((applicantId: string, scores: ApplicantCategoryScores) => {
    const updated = { ...catScores, [applicantId]: scores };
    setCatScores(updated);
    localStorage.setItem(CAT_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('cictrix:category-scores-updated'));
  }, [catScores]);

  // Keep openFolder in sync if folders list changes
  const liveOpenFolder = useMemo(
    () => (openFolder ? folders.find(f => f.position === openFolder.position) ?? null : null),
    [openFolder, folders],
  );

  return (
    <>
      {/* Page header */}
      <section style={{ background: '#fff', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#363EE8' }}>Qualified Applicants</h2>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          List of applicants who passed the evaluation, organized by job position.
        </p>
      </section>

      {liveOpenFolder ? (
        <ApplicantsListView
          folder={liveOpenFolder}
          completedEvaluationIds={completedEvaluationIds}
          savedCatScores={catScores}
          onBack={() => setOpenFolder(null)}
          onUpdateScores={(a) => setScoresCtx({ applicant: a, folder: liveOpenFolder })}
        />
      ) : (
        <>
          {/* Stats row */}
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <article className="rounded-2xl p-6 shadow-soft hover:shadow-float transition-shadow duration-300" style={{ background: 'linear-gradient(135deg, #C8D1FF 0%, #363EE8 100%)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#040E6B]">Total Qualified</p>
                  <p className="text-3xl font-bold text-white mt-2">{qualifiedBase.length}</p>
                </div>
                <div className="h-12 w-12 rounded-[18px] bg-white/20 flex items-center justify-center">
                  <Users className="text-white" size={24} strokeWidth={1.5} />
                </div>
              </div>
            </article>
            <article className="rounded-2xl p-6 shadow-soft hover:shadow-float transition-shadow duration-300" style={{ background: 'linear-gradient(135deg, #C8D1FF 0%, #363EE8 100%)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#040E6B]">Job Positions</p>
                  <p className="text-3xl font-bold text-white mt-2">{folders.length}</p>
                </div>
                <div className="h-12 w-12 rounded-[18px] bg-white/20 flex items-center justify-center">
                  <FolderOpen className="text-white" size={24} strokeWidth={1.5} />
                </div>
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

          {/* Section label */}
          {filteredFolders.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              JOB POSITION FOLDERS — CLICK TO OPEN
            </p>
          )}

          {/* Folder grid */}
          {/* Folder Table */}
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-[#F8FAFC] text-[#040E6B] text-left text-xs uppercase tracking-wider font-bold border-b border-[#E2E8F0]">
                <tr>
                  <th className="px-5 py-4 w-16 text-center"></th>
                  <th className="px-5 py-4">POSITION</th>
                  <th className="px-5 py-4 text-center">QUALIFIED APPLICANTS</th>
                  <th className="px-5 py-4 text-center">EXAM STATUS</th>
                  <th className="px-5 py-4 text-right">PROGRESS</th>
                  <th className="px-5 py-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredFolders.map(folder => {
                  const es = EXAM_STYLES[folder.examStatus];
                  const posExam = examScores[folder.position] ?? {};
                  const scored  = folder.applicants.filter(a => posExam[a.id] && posExam[a.id] !== '').length;
                  const pct     = folder.count > 0 ? (scored / folder.count) * 100 : 0;

                  return (
                    <tr
                      key={folder.position}
                      onClick={() => setOpenFolder(folder)}
                      className="border-b border-[#E2E8F0] align-middle hover:bg-slate-50/50 transition-colors text-slate-700 cursor-pointer"
                    >
                      <td className="px-5 py-4 text-center">
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                          <FolderOpen size={20} />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <h3 className="font-bold text-[#363EE8] whitespace-nowrap">{folder.position}</h3>
                        <p className="text-xs text-slate-500">{folder.office}</p>
                      </td>
                      <td className="px-5 py-4 text-center font-bold">
                        {folder.count}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${es.bg} ${es.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${es.dot}`} />
                          {es.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 w-48 text-right">
                        <div className="flex flex-col items-end">
                           <span className={`text-xs font-semibold mb-1 ${scored < folder.count ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {scored} / {folder.count} encoded
                           </span>
                           <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                             <div
                               className={`h-full rounded-full transition-all ${scored === folder.count && folder.count > 0 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                               style={{ width: `${pct}%` }}
                             />
                           </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExamModal(folder); }}
                          className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 flex items-center gap-1.5 ml-auto"
                        >
                          <Pencil size={14} /> Enter Scores
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredFolders.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <FolderOpen size={48} className="mb-4 text-slate-300" />
                        <p className="font-semibold text-slate-500">No qualified applicant folders found</p>
                        <p className="mt-1 text-sm text-slate-400">Applicants appear here once their status is marked as Qualified or Shortlisted.</p>
                      </div>
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
          onClose={() => setExamModal(null)}
          onSave={scores => { handleSaveExam(examModal.position, scores); }}
        />
      )}

      {scoresCtx && (
        <ApplicantScoringModal
          applicant={scoresCtx.applicant}
          allApplicants={scoresCtx.folder.applicants}
          savedScores={catScores}
          evaluation={evaluationsByApplicant?.[scoresCtx.applicant.id]}
          onClose={() => setScoresCtx(null)}
          onSave={handleSaveCatScores}
        />
      )}
    </>
  );
};
