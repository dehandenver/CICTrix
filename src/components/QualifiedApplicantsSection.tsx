import {
  Calculator,
  CheckCircle2,
  ChevronRight,
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
  oralExam:    ScoringCat;
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
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
    roman: 'II',  label: 'Experience',         maxOriginal: 25, maxPromotional: 25,
    color: '#040E6B', bg: '#E8EBF9', border: '#A5ACEE', badgeBg: '#E8EBF9', rspOwned: true,
    guide: '1-5 yrs = 12 pts | 6-10 yrs = 14 pts | 11-15 yrs = 16 pts | 16-20 yrs = 18 pts | 21+ yrs = 25 pts',
  },
  performance: {
    roman: 'III', label: 'Performance Rating', maxOriginal: 0,  maxPromotional: 20,
    color: '#5B65F0', bg: '#ECEEFF', border: '#C8D1FF', badgeBg: '#ECEEFF', rspOwned: true,
    guide: 'Outstanding = 20 pts | Very Satisfactory = 18 pts | Satisfactory = 15 pts | Unsatisfactory = 0 pts',
  },
  pcpt:        {
    roman: 'IV',  label: 'PCPT',               maxOriginal: 20, maxPromotional: 10,
    color: '#363EE8', bg: '#EEF0FD', border: '#C8D1FF', badgeBg: '#EEF0FD', rspOwned: false,
    guide: '20-22 = 10 pts | 23-25 = 12 pts | 26-28 = 14 pts | 29-31 = 16 pts | 32-34 = 18 pts | 35 = 20 pts',
  },
  potential:   {
    roman: 'V',   label: 'Potential',           maxOriginal: 0,  maxPromotional: 25,
    color: '#2A31C4', bg: '#E8EAF5', border: '#B5BCEC', badgeBg: '#E8EAF5', rspOwned: false,
    guide: '51-60 = 12 pts | 61-70 = 14 pts | 71-80 = 16 pts | 81-90 = 18 pts | 91-100 = 25 pts',
  },
  writtenExam: {
    roman: '—',   label: 'Written Exam',        maxOriginal: 100, maxPromotional: 100,
    color: '#0E1789', bg: '#E5E7F5', border: '#9DA5E0', badgeBg: '#E5E7F5', rspOwned: false,
    guide: 'Raw score 0–100. Contributes 30% to overall score.',
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
  experience:  ['previous_employer_certificate', 'service_record'],
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

const deriveInitial = (
  applicant: ApplicantRecord,
  saved: Record<string, ApplicantCategoryScores>,
): ApplicantCategoryScores => {
  if (saved[applicant.id]) return saved[applicant.id];
  const pct = (applicant.total_score ?? 0) / 100;
  const autoEdu = educationLevelToPoints(applicant.education_level);
  const autoExp = experienceYearsToPoints(applicant.years_of_experience);
  return {
    education:   { initialScore: autoEdu ?? +((pct * 20).toFixed(1)),  finalScore: autoEdu,  remarks: '' },
    experience:  { initialScore: autoExp ?? +((pct * 25).toFixed(1)),  finalScore: autoExp,  remarks: '' },
    performance: { initialScore: +((pct * 20).toFixed(1)),             finalScore: null,     remarks: '' },
    pcpt:        { initialScore: +((pct * 20).toFixed(1)),             finalScore: null,     remarks: '' },
    potential:   { initialScore: +((pct * 25).toFixed(1)),             finalScore: null,     remarks: '' },
    writtenExam: { initialScore: 0,                                    finalScore: null,     remarks: '' },
    oralExam:    { initialScore: 0,                                    finalScore: null,     remarks: '' },
  };
};

const calcOverall = (scores: ApplicantCategoryScores): { value: number | null; pct: string | null } => {
  for (const k of BASE_CATS) if (scores[k].finalScore === null) return { value: null, pct: null };
  if (scores.writtenExam.finalScore === null) return { value: null, pct: null };
  const base = BASE_CATS.reduce((s, k) => s + (scores[k].finalScore ?? 0), 0);
  const val = +(base + (scores.writtenExam.finalScore ?? 0) * 0.30).toFixed(2);
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

const writtenExamRawToConvertedScore = (raw: number) => +((raw || 0) * 0.30).toFixed(2);

const oralRawToConvertedScore = (raw: number) => +Math.min(20, Math.max(0, (raw / 100) * 20)).toFixed(2);

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
  }, [applicant.id, liveEvaluation?.applicantId, liveEvaluation?.pcptRawScore, liveEvaluation?.writtenExamRawScore, liveEvaluation?.oralRawScore, savedScores]);

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

  // Original applicants: only oral exam from interviewer.
  // Promotional applicants: only PCPT from interviewer.
  const interviewerCategories: CatKey[] = apptType === 'promotional'
    ? ['pcpt']
    : ['oralExam'];

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
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,14,107,0.55)', padding: '1rem', fontFamily: "'Poppins', sans-serif" }}>
        <div style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 24px 80px rgba(54,62,232,0.22)', width: '100%', maxWidth: 760, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Poppins', sans-serif" }}>

          {/* Branded header */}
          <div style={{ background: 'linear-gradient(135deg, #5B65F0 0%, #363EE8 100%)', padding: '1.35rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', textShadow: '0 1px 4px rgba(4,14,107,0.25)' }}>Applicant Evaluation &amp; Scoring</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', marginTop: 3 }}>
                {applicant.full_name} &mdash; {applicant.position}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#ffffff', padding: '0.35rem', display: 'flex', transition: 'background 0.15s' }}>
              <X size={18} />
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#F7F8FE' }}>

            {/* Score finalized banner */}
            {isFinalized && (
              <div style={{ background: '#EEF0FD', border: '1.5px solid #363EE8', borderRadius: 10, padding: '0.85rem 1rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <CheckCircle2 size={18} style={{ color: '#363EE8', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.93rem' }}>Score Finalized — View Only Mode</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#5B65F0' }}>This applicant's evaluation has been finalized. Fields are read-only.</p>
                </div>
              </div>
            )}

            {/* Appointment Type */}
            <div style={{ background: '#ffffff', border: '1.5px solid #C8D1FF', borderRadius: 14, padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 700, color: '#040E6B', fontSize: '0.93rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <RefreshCw size={15} style={{ color: '#363EE8' }} /> Select Appointment Type
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {(['original', 'promotional'] as AppointmentType[]).map(t => {
                  const isLockedOriginal    = isCurrentEmployee && t === 'original';
                  const isLockedPromotional = !isCurrentEmployee && t === 'promotional';
                  const buttonDisabled = isFinalized || isLockedOriginal || isLockedPromotional;
                  const isActive = apptType === t;
                  return (
                    <button
                      key={t} type="button" disabled={buttonDisabled}
                      onClick={() => { if (!buttonDisabled) setApptType(t); }}
                      title={
                        isLockedOriginal    ? 'Locked: applicant is a current employee' :
                        isLockedPromotional ? 'Locked: applicant is a new/original applicant' :
                        undefined
                      }
                      style={{
                        border: `2px solid ${isActive ? '#363EE8' : '#C8D1FF'}`,
                        borderRadius: 10,
                        padding: '0.9rem 1rem',
                        cursor: buttonDisabled ? 'not-allowed' : 'pointer',
                        background: isActive ? 'linear-gradient(135deg, #EEF0FD 0%, #DDE1FC 100%)' : '#ffffff',
                        textAlign: 'left',
                        opacity: (isLockedOriginal || isLockedPromotional) ? 0.45 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <p style={{ margin: 0, fontWeight: 700, color: isActive ? '#040E6B' : '#363EE8', fontSize: '0.88rem' }}>
                        {t === 'original' ? 'Original Appointment' : 'Promotional Appointment'}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: '#5B65F0' }}>
                        {t === 'original'
                          ? 'Education • Experience • Oral Exam*'
                          : 'Education • Experience • Performance • PCPT* • Potential'}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.71rem', color: '#A5ACEE' }}>*Interviewer-provided</p>
                      {isLockedOriginal && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.71rem', color: '#E53E3E', fontWeight: 600 }}>
                          Locked — applicant is a current employee
                        </p>
                      )}
                      {isLockedPromotional && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.71rem', color: '#E53E3E', fontWeight: 600 }}>
                          Locked — applicant is a new/original applicant
                        </p>
                      )}
                      {isCurrentEmployee && t === 'promotional' && (
                        <p style={{ margin: '0.35rem 0 0', fontSize: '0.71rem', color: '#363EE8', fontWeight: 600 }}>
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
                  <p style={{ margin: '0 0 0.45rem', fontSize: '0.8rem', fontWeight: 600, color: '#040E6B', gridColumn: '1/-1' }}>
                    Position Type (for Written Exam scoring)
                  </p>
                  {(['rank-and-file', 'executive'] as PositionType[]).map(pt => (
                    <button
                      key={pt} type="button" disabled={isFinalized}
                      onClick={() => setPosType(pt)}
                      style={{
                        border: `2px solid ${posType === pt ? '#363EE8' : '#C8D1FF'}`,
                        borderRadius: 8, padding: '0.6rem',
                        cursor: isFinalized ? 'default' : 'pointer',
                        background: posType === pt ? '#363EE8' : '#ffffff',
                        color: posType === pt ? '#ffffff' : '#040E6B',
                        fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.15s',
                      }}
                    >
                      {pt === 'rank-and-file' ? 'Rank and File' : 'Executive / Managerial'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Final Numerical Score */}
            <div style={{ background: 'linear-gradient(135deg, #5B65F0 0%, #363EE8 100%)', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '0.5rem', display: 'flex' }}>
                  <Calculator size={22} style={{ color: '#C8D1FF' }} />
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#C8D1FF', fontWeight: 500 }}>Final Numerical Score</p>
                  <p style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: '#ffffff', lineHeight: 1 }}>{totalScore.toFixed(2)}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#C8D1FF' }}>Adjectival Rating</p>
                <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#ffffff' }}>{adjRating.label}</p>
              </div>
            </div>

            {/* Scoring Responsibility */}
            <div style={{ background: '#EEF0FD', border: '1.5px solid #C8D1FF', borderRadius: 10, padding: '0.85rem 1rem' }}>
              <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.875rem' }}>Scoring Responsibility:</p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#363EE8' }}>
                <strong>RSP enters:</strong>{' '}
                {apptType === 'promotional'
                  ? 'Education, Experience, Performance Rating, Potential'
                  : 'Education, Experience'}
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.82rem', color: '#363EE8' }}>
                <strong>Interviewer provides:</strong>{' '}
                {apptType === 'promotional'
                  ? 'PCPT (Physical Characteristics & Personality Traits)'
                  : 'Oral Examination'}
              </p>
            </div>

            {/* Historical oral scores (read-only) for promotional applicants */}
            {apptType === 'promotional' && typeof liveEvaluation?.oralRawScore === 'number' && (
              <div style={{ background: '#EEF0FD', border: '1.5px solid #C8D1FF', borderRadius: 12, padding: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.6rem' }}>
                  <Lock size={16} style={{ color: '#363EE8', flexShrink: 0 }} />
                  <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.875rem' }}>
                    Previous Original Appointment — Oral Examination Score (Read-Only)
                  </p>
                </div>
                <div style={{ background: '#ffffff', border: '1px solid #C8D1FF', borderRadius: 8, padding: '0.65rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.82rem', color: '#5B65F0' }}>Oral Exam Score (from original appointment):</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#363EE8' }}>{liveEvaluation.oralRawScore}</span>
                </div>
                <p style={{ margin: '0.4rem 0 0', fontSize: '0.73rem', color: '#A5ACEE' }}>
                  This score reflects the original appointment evaluation. It is read-only and cannot be edited.
                </p>
              </div>
            )}

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
                  const autoFilled = applicant.education_level && educationLevelToPoints(applicant.education_level) !== null;
                  inputEl = (
                    <>
                      {autoFilled && (
                        <div style={{ background: '#EEF0FD', border: '1px solid #C8D1FF', borderRadius: 8, padding: '0.45rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#363EE8', fontWeight: 600 }}>
                          Auto-filled from application: {applicant.education_level}
                        </div>
                      )}
                      <select
                        disabled={isFinalized}
                        value={rawVal}
                        onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                        style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.9rem', outline: 'none', background: isFinalized ? '#F7F8FE' : '#ffffff', color: '#040E6B', boxSizing: 'border-box', marginBottom: '0.45rem', fontFamily: "'Poppins', sans-serif" }}
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
                    if (y >= 21) return 25;
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
                        <div style={{ background: '#E8EBF9', border: '1px solid #A5ACEE', borderRadius: 8, padding: '0.45rem 0.75rem', marginBottom: '0.5rem', fontSize: '0.75rem', color: '#040E6B', fontWeight: 600 }}>
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
                        style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.9rem', outline: 'none', background: isFinalized ? '#F7F8FE' : '#ffffff', color: '#040E6B', boxSizing: 'border-box', marginBottom: '0.45rem', fontFamily: "'Poppins', sans-serif" }}
                      />
                    </>
                  );
                } else if (catKey === 'performance') {
                  inputEl = (
                    <select
                      disabled={isFinalized}
                      value={rawVal}
                      onChange={(e) => !isFinalized && setFinal(catKey, e.target.value)}
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.9rem', outline: 'none', background: isFinalized ? '#F7F8FE' : '#ffffff', color: '#040E6B', boxSizing: 'border-box', marginBottom: '0.45rem', fontFamily: "'Poppins', sans-serif" }}
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
                      style={{ width: '100%', border: `1.5px solid ${meta.border}`, borderRadius: 8, padding: '0.6rem 0.75rem', fontSize: '0.9rem', outline: 'none', background: isFinalized ? '#F7F8FE' : '#ffffff', color: '#040E6B', boxSizing: 'border-box', marginBottom: '0.45rem', fontFamily: "'Poppins', sans-serif" }}
                    />
                  );
                }

                return (
                  <div key={catKey} style={{ background: '#ffffff', border: `1.5px solid ${meta.border}`, borderRadius: 14, padding: '1rem', boxShadow: `0 2px 8px ${meta.color}18` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, ${meta.color} 0%, #040E6B 100%)`, color: '#fff', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {meta.roman}
                      </span>
                      <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.88rem' }}>
                        {meta.label} ({percentLabel})
                      </p>
                    </div>

                    {/* Initial score row */}
                    <div style={{ background: meta.bg, borderRadius: 8, padding: '0.45rem 0.75rem', marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.78rem', color: '#5B65F0' }}>Initial {meta.label} Score:</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: meta.color }}>{cat.initialScore}</span>
                      <span style={{ fontSize: '0.72rem', color: '#A5ACEE', fontStyle: 'italic' }}>previously saved</span>
                    </div>

                    {/* Potential auto-fill banner */}
                    {catKey === 'potential' && cat.initialScore > 0 && !isFinalized && (
                      <div style={{ background: '#EEF0FD', border: '1px solid #C8D1FF', borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#363EE8' }}>Auto-Fill Available</p>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: '#5B65F0' }}>Last Original Appointment Score: {cat.initialScore}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFinal(catKey, String(cat.initialScore))}
                          style={{ background: 'linear-gradient(135deg, #363EE8, #040E6B)', color: '#fff', border: 'none', borderRadius: 6, padding: '0.35rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                        >
                          Use This Score
                        </button>
                      </div>
                    )}

                    {/* Score input */}
                    {inputEl}

                    {/* Guide */}
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.71rem', color: '#A5ACEE', lineHeight: 1.5 }}>{meta.guide}</p>

                    {/* Score display */}
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: meta.color, fontWeight: 700 }}>
                      Score: {cat.finalScore ?? 0}
                    </p>

                    {/* View files */}
                    <button
                      type="button"
                      onClick={() => setFilesModal({ catKey, files: catFiles })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: meta.color, fontSize: '0.78rem', fontWeight: 600, padding: 0 }}
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
            <div style={{ background: '#EEF0FD', border: '1.5px solid #C8D1FF', borderRadius: 14, padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
                <Users size={18} style={{ color: '#363EE8' }} />
                <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.93rem' }}>
                  Interviewer-Provided Scores (Auto-Generated by System)
                </p>
              </div>

              {/* Locked notice */}
              <div style={{ background: '#ffffff', border: '1px solid #C8D1FF', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                <Lock size={16} style={{ color: '#363EE8', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.875rem' }}>RSP Cannot Edit These Scores</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#5B65F0' }}>
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
                    catKey === 'oralExam' ? oralRawToConvertedScore(typeof cat.finalScore === 'number' ? cat.finalScore : (cat.initialScore ?? 0)) :
                                           writtenExamRawToConvertedScore(typeof cat.finalScore === 'number' ? cat.finalScore : 0);
                  const convertedMax = catKey === 'writtenExam' ? 30 : max;
                  return (
                    <div key={catKey} style={{ background: '#ffffff', border: `1.5px solid ${meta.border}`, borderRadius: 10, padding: '0.85rem', boxShadow: `0 2px 6px ${meta.color}14` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.65rem' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, ${meta.color} 0%, #040E6B 100%)`, color: '#fff', fontWeight: 800, fontSize: '0.73rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {meta.roman}
                        </span>
                        <p style={{ margin: 0, fontWeight: 700, color: '#040E6B', fontSize: '0.85rem' }}>{meta.label} (20%)</p>
                      </div>

                      <div style={{ background: meta.bg, borderRadius: 7, padding: '0.35rem 0.65rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.76rem', color: '#5B65F0' }}>Initial {meta.label} Score:</span>
                        <span style={{ fontWeight: 700, color: meta.color, fontSize: '0.85rem' }}>{cat.initialScore}</span>
                        <span style={{ fontSize: '0.7rem', color: '#A5ACEE', fontStyle: 'italic' }}>previously saved</span>
                      </div>

                      <div style={{ background: meta.badgeBg, border: `1px solid ${meta.border}`, borderRadius: 8, padding: '0.5rem 0.75rem', marginBottom: '0.45rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.78rem', color: '#5B65F0' }}>Raw Score:</span>
                          <input
                            type="number" min={0} max={100} step={1}
                            value={rawVal}
                            readOnly={true}
                            placeholder="—"
                            style={{ width: 70, border: 'none', background: 'transparent', textAlign: 'right', fontSize: '1rem', fontWeight: 700, color: meta.color, outline: 'none', fontFamily: "'Poppins', sans-serif" }}
                          />
                        </div>
                      </div>

                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.7rem', color: '#A5ACEE', lineHeight: 1.5 }}>{meta.guide}</p>
                      <p style={{ margin: '0 0 0.4rem', fontSize: '0.8rem', color: '#363EE8', fontWeight: 700 }}>
                        Converted Score: {convertedScore}/{convertedMax}
                      </p>

                      <button
                        type="button"
                        onClick={() => setFilesModal({ catKey, files: catFiles })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: meta.color, fontSize: '0.76rem', fontWeight: 600, padding: 0 }}
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
            <div style={{ background: '#ffffff', border: '1.5px solid #C8D1FF', borderRadius: 14, padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 700, color: '#040E6B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={14} style={{ color: '#363EE8' }} /> Adjectival Rating Reference
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                {ADJECTIVAL_RANGES.map(r => (
                  <div key={r.label} style={{ background: '#EEF0FD', border: '1px solid #C8D1FF', borderRadius: 8, padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: '#363EE8' }}>{r.min} - {r.max}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#040E6B', fontWeight: 600 }}>{r.label}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div style={{ padding: '0.9rem 1.5rem', borderTop: '1.5px solid #C8D1FF', background: '#F7F8FE', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{ padding: '0.6rem 1.25rem', background: '#ffffff', border: '1.5px solid #C8D1FF', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', color: '#040E6B', cursor: 'pointer', fontFamily: "'Poppins', sans-serif" }}>
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
                  title={!allRspCategoriesFilled ? `Fill required fields: ${missing.join(', ')}` : undefined}
                  style={{
                    padding: '0.6rem 1.5rem',
                    background: disabled ? '#C8D1FF' : 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    color: '#ffffff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontFamily: "'Poppins', sans-serif",
                    boxShadow: disabled ? 'none' : '0 4px 14px rgba(54,62,232,0.35)',
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Breadcrumb */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', fontSize: '0.875rem' }}>
          <button
            type="button"
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb', fontWeight: 600, padding: 0 }}
          >
            <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} /> Applicant Score
          </button>
          <ChevronRight size={13} style={{ color: '#94a3b8' }} />
          <span style={{ fontWeight: 500, color: '#334155' }}>{folder.position}</span>
        </div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{folder.position}</h2>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
          {folder.office} &middot; {folder.count} qualified applicant{folder.count !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search applicants by name…"
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, padding: '0.6rem 0.75rem 0.6rem 2.25rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box', background: '#fff' }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff' }}>
        <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', width: 48 }}>#</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Applicant Name</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Type</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Exam Schedule</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Interview Schedule</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Educ /20</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Exp /25</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Perf /20</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Written /100</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Potential /25</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>PCPT /20</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Oral /20</th>
              <th style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Status</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((a, i) => {
              const isFinalized = !!savedCatScores[a.id] || completedEvaluationIds.has(a.id);
              const cs = a.catScores;
              const apptType: AppointmentType = cs.appointmentType ?? 'original';
              const isPromotional = apptType === 'promotional';
              const sv = (key: CatKey): string => {
                const v = cs[key].finalScore ?? cs[key].initialScore;
                return v > 0 ? String(v) : '—';
              };
              return (
                <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    {i < 3 ? (
                      <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? '#fbbf24' : i === 1 ? '#c0c0c0' : '#cd7f32' }}>
                        <Medal size={14} style={{ color: '#fff' }} />
                      </div>
                    ) : (
                      <span style={{ display: 'inline-flex', width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#e0e7ff', color: '#3730a3', fontWeight: 800, fontSize: '0.75rem' }}>#{i + 1}</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>{a.full_name}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#94a3b8' }}>Qualified: {fmtDate(a.created_at)}</p>
                  </td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: isPromotional ? '#f3e8ff' : '#eff6ff', color: isPromotional ? '#7c3aed' : '#1d4ed8' }}>
                      {isPromotional ? 'Promotional' : 'Original'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 0.75rem' }}>
                    {a.exam_date ? (
                      <div>
                        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#040E6B' }}>{fmtDate(a.exam_date)}</p>
                        {a.exam_time && <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{a.exam_time}</p>}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0.75rem' }}>
                    {a.interview_date ? (
                      <div>
                        <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: '#040E6B' }}>{fmtDate(a.interview_date)}</p>
                        {a.interview_time && <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{a.interview_time}</p>}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>{sv('education')}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>{sv('experience')}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: isPromotional ? '#334155' : '#cbd5e1' }}>{isPromotional ? sv('performance') : '—'}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>{sv('writtenExam')}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: isPromotional ? '#334155' : '#cbd5e1' }}>{isPromotional ? sv('potential') : '—'}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: !isPromotional ? '#334155' : '#cbd5e1' }}>{!isPromotional ? sv('pcpt') : '—'}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center', fontSize: '0.85rem', fontWeight: 600, color: !isPromotional ? '#334155' : '#cbd5e1' }}>{!isPromotional ? sv('oralExam') : '—'}</td>
                  <td style={{ padding: '0.75rem 0.75rem', textAlign: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, background: isFinalized ? '#dcfce7' : '#fef3c7', color: isFinalized ? '#15803d' : '#92400e', border: `1px solid ${isFinalized ? '#bbf7d0' : '#fde68a'}` }}>
                      {isFinalized && <CheckCircle2 size={11} />}
                      {isFinalized ? 'Finalized' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <button
                      type="button" onClick={() => onUpdateScores(a)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.85rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Pencil size={12} /> Edit Scores
                    </button>
                  </td>
                </tr>
              );
            })}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={14} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  <FolderOpen size={40} style={{ display: 'block', margin: '0 auto 0.75rem', opacity: 0.3 }} />
                  <p style={{ fontWeight: 600, margin: 0 }}>No applicants found</p>
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
      // Exclude disqualified/rejected — they are removed from all list views.
      if (s.includes('not qualified') || s.includes('disqualif') || s.includes('reject')) return false;
      // Exclude fully qualified applicants — they belong in the Qualified Applicants tab.
      if (s === 'qualified' || s.includes('recommended for hiring') || s.includes('accepted') || s.includes('hired')) return false;
      // Include shortlisted and applicants in the interview/evaluation pipeline.
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
          <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Written Exam</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  <th className="w-8 px-3 py-3" />
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
                      <td className="px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setExamModal(folder); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors whitespace-nowrap"
                        >
                          <Pencil size={12} /> Edit Total Score
                        </button>
                      </td>
                      <td className="w-8 px-3 py-4 text-slate-400 group-hover:text-blue-600 transition-colors">
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })}
                {filteredFolders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
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
