import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  ChevronDown,
  Info,
  ListChecks,
  Lock,
  Pencil,
  XCircle,
} from 'lucide-react';
import { CloseVacancyDialog } from './CloseVacancyDialog';
import { closeVacancy, type CloseReason } from '../lib/vacancies';
import { isOpenVacancy } from '../lib/vacancySearch';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useHistoryBack } from '../hooks/useHistoryBack';
import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { getJobPostings, getJobPostingsLoadError, loadJobPostings } from '../lib/recruitmentData';
import { ErrorBanner } from './ErrorBanner';
import { failureText } from '../lib/friendlyErrors';
import { useSalarySchedule } from '../hooks/useSalarySchedule';
import { formatSalaryRange, stepRangeFor } from '../lib/api/salaryGrades';
import { supabase } from '../lib/supabase';
import { JobPosting } from '../types/recruitment.types';
import { fetchSlotApplicantCounts } from '../lib/plantillaSlots';
import { plantillaLabel } from '../lib/plantillaRules';
import { isCurriculumVitae } from '../lib/applicationDocuments';
import {
  APPLY_STEPS,
  PublicTopBar,
  StatusBadge,
  Stepper,
} from '../modules/applicant/flow/FlowUi';
import {
  buildPlantillaChoices,
  choiceLabel,
  formatShortDate,
  isSelectable,
  type PlantillaChoice,
} from '../modules/applicant/flow/applicationDrafts';

interface LandingJobData {
  id: number;
  title: string;
  department: string;
  itemNumber: string;
  postingDate: string;
  closingDate: string;
  type: string;
  /** The plantilla this vacancy row stands for; the landing table lists one per row. */
  plantillaSlotId?: string;
}

const DISABLED_REASON: Record<string, string> = {
  filled: 'This item has been filled. Choose another item.',
  closed: 'This item is closed. Choose another item.',
};

/** Shown on every public job details page, above Continue to Application. */
const SUBMISSION_INSTRUCTION =
  'Please review your application carefully before submission. Ensure that all required fields are completed and all supporting documents are accurate, complete, valid, and readable. The completeness and quality of your submission may be considered during the evaluation of your application.';

const formatPeso =(value: number) =>
  `Php ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One line of the summary list. An unstated value reads as muted italic text, never a made-up value. */
const Row = ({ label, value, emptyText = 'Not specified' }: { label: string; value: ReactNode; emptyText?: string }) => (
  <div className="af-row">
    <dt>{label}</dt>
    <dd className={value ? '' : 'is-empty'}>{value || emptyText}</dd>
  </div>
);

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

export const JobDetailsPage = () => {
  const navigate = useNavigate();
  const { jobId } = useParams();
  const location = useLocation();
  const isAdminView = location.pathname.startsWith('/admin');
  // Previous page when there is one; otherwise the listing this page belongs to.
  const goBack = useHistoryBack(isAdminView ? '/admin/rsp' : '/');
  // Lazy initializer reads location.state immediately, preventing "not found" flash
  const [landingJob] = useState<LandingJobData | null>(() => location.state?.landingJob ?? null);
  const salarySchedule = useSalarySchedule();
  const [job, setJob] = useState<JobPosting | null>(
    // The Job Portal navigates by item number and hands us the posting it
    // already loaded. Seed from it so the qualifications render on that path too.
    () => (location.state?.landingJob?.originalJob as JobPosting | undefined) ?? null,
  );
  /** False until the postings cache has been checked, so a direct link shows a skeleton, not "not found". */
  const [loaded, setLoaded] = useState(() => Boolean(location.state?.landingJob?.originalJob));
  /** Name of the applicant placed in each filled slot, for the admin view. */
  const [hireNamesBySlotId, setHireNamesBySlotId] = useState<Record<string, string>>({});
  /** Applicants per plantilla, for the admin view ("3 applicants"). */
  const [slotApplicantCounts, setSlotApplicantCounts] = useState<Map<string, number>>(new Map());
  /** RSP: the Close Vacancy confirmation, and why the last attempt failed. */
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');

  const confirmClose = async (reason: CloseReason, remarks: string) => {
    if (!job) return false;
    const result = await closeVacancy(job.id, reason, remarks);
    if (!result.ok) {
      setCloseError(failureText('close this vacancy', result.error));
      return false;
    }
    const fresh = await loadJobPostings();
    setJob((current) => fresh.find((j) => j.id === current?.id) ?? current);
    setClosing(false);
    return true;
  };

  useEffect(() => {
    let cancelled = false;
    // The route param is the item number on the portal path and the id on
    // the admin path — accept either.
    const find = (jobs: JobPosting[]) => jobs.find((j) => j.id === jobId || j.jobCode === jobId) ?? null;

    const cached = getJobPostings();
    setJob((current) => current ?? find(cached));
    if (find(cached)) setLoaded(true);

    // A direct link or refresh can arrive before the cache is warm.
    void loadJobPostings()
      .then((fresh) => {
        if (cancelled) return;
        const jobs = fresh.length > 0 ? fresh : getJobPostings();
        // Prefer the fresh row: its plantilla slot statuses are current.
        const match = find(jobs);
        if (match) setJob(match);
      })
      .catch((error) => { console.error('[JobDetailsPage] postings failed to load:', error); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [jobId]);

  // Applicants per plantilla — RSP view only.
  useEffect(() => {
    if (!isAdminView || !job?.id) return;
    let cancelled = false;
    void fetchSlotApplicantCounts(job.id).then((counts) => {
      if (!cancelled) setSlotApplicantCounts(counts);
    });
    return () => { cancelled = true; };
  }, [isAdminView, job?.id]);

  // Who was placed in each filled slot. Admin view only — applicants have no
  // business seeing who took the other plantilla items.
  useEffect(() => {
    const filled = (job?.plantillaSlots ?? []).filter((slot) => slot.filledByApplicantId);
    if (!isAdminView || filled.length === 0) {
      setHireNamesBySlotId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await (supabase as any)
        .from('applicants')
        .select('id, first_name, last_name')
        .in('id', filled.map((slot) => slot.filledByApplicantId));
      if (cancelled || error || !Array.isArray(data)) return;

      const nameById = new Map<string, string>(
        data.map((row: any) => [
          String(row.id),
          [row.first_name, row.last_name].filter(Boolean).join(' ').trim(),
        ]),
      );
      setHireNamesBySlotId(
        Object.fromEntries(
          filled
            .map((slot) => [slot.id, nameById.get(String(slot.filledByApplicantId)) ?? ''])
            .filter(([, name]) => Boolean(name)),
        ),
      );
    })();
    return () => { cancelled = true; };
  }, [job?.id, job?.plantillaSlots, isAdminView]);

  // ── Step 1 state: which plantilla items the applicant is applying for ─────
  const choices: PlantillaChoice[] = useMemo(() => {
    if (job) return buildPlantillaChoices(job);
    // Arrived from a vacancy card whose posting row isn't loaded (or no longer
    // matches): it still advertises exactly one item, its own item number.
    if (landingJob && loaded) {
      return buildPlantillaChoices({
        id: String(landingJob.id),
        jobCode: landingJob.itemNumber,
        status: 'Active',
        applicationDeadline: landingJob.closingDate,
      } as JobPosting);
    }
    return [];
  }, [job, landingJob, loaded]);
  const selectable = useMemo(() => choices.filter(isSelectable), [choices]);
  // Each vacancy is one plantilla, so there is nothing to choose: the row the
  // applicant clicked names it (via route state or `?slot=`), else the posting's first open one.
  const slotFromQuery = new URLSearchParams(location.search).get('slot') || undefined;
  const requestedSlotId = landingJob?.plantillaSlotId || slotFromQuery;
  const target: PlantillaChoice | null =
    choices.find((choice) => choice.key === requestedSlotId) ?? selectable[0] ?? choices[0] ?? null;
  const [summaryOpen, setSummaryOpen] = useState(isDesktop);

  const postingKey = job?.id ?? (landingJob ? String(landingJob.id) : '');

  // The summary is collapsible on mobile only; on desktop it is always open.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const sync = () => { if (mql.matches) setSummaryOpen(true); };
    mql.addEventListener?.('change', sync);
    return () => mql.removeEventListener?.('change', sync);
  }, []);

  if (!job && !landingJob) {
    return (
      <div className="abyan-ds af">
        {!isAdminView && <PublicTopBar />}
        <main className="af-main">
          <div className="af-container">
            {!loaded ? (
              <div className="af-two-col" aria-busy="true" aria-label="Loading job posting">
                <div className="af-card af-stack">
                  <div className="af-skel" style={{ height: 32, width: '60%' }} />
                  <div className="af-skel" style={{ height: 120 }} />
                  <div className="af-skel" style={{ height: 200 }} />
                </div>
                <div className="af-card af-stack">
                  <div className="af-skel" style={{ height: 24, width: '50%' }} />
                  <div className="af-skel" style={{ height: 72 }} />
                  <div className="af-skel" style={{ height: 72 }} />
                </div>
              </div>
            ) : getJobPostingsLoadError() ? (
              // The postings didn't load, so "not found" would be a guess.
              <ErrorBanner
                error={getJobPostingsLoadError()}
                action="load this job posting"
                onRetry={() => window.location.reload()}
              />
            ) : (
              <div className="af-card af-empty">
                <Briefcase size={32} strokeWidth={1.75} aria-hidden="true" />
                <h1 className="af-title-s">Job posting not found</h1>
                <p className="af-body-m">It may have been closed or removed. Browse the current vacancies instead.</p>
                <button type="button" onClick={goBack} className="btn btn-md btn-primary">
                  <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                  Go Back
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const title = landingJob?.title || job?.title || '';
  const itemNo = landingJob?.itemNumber || job?.jobCode || '';
  const department = job?.department || landingJob?.department || '';
  const postingDate = landingJob?.postingDate || job?.postedDate || '';
  const closingDate = landingJob?.closingDate || job?.applicationDeadline || '';

  // A posting can advertise several identical vacancies, each with its own
  // plantilla item number. `itemNo` above is only the first one.
  const slots = job?.plantillaSlots ?? [];
  const isMultiSlot = slots.length > 1;
  const openSlots = slots.filter((slot) => slot.status === 'open');
  // Plantillas merged from separate postings keep their own summary and
  // duties; when any has them, those sections list each plantilla in turn.
  // Applicants see only their plantilla's text; RSP sees every plantilla's.
  const orderedSlots = [...slots]
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .filter((slot) => isAdminView || !target?.slotId || slot.id === target.key);
  const slotsWithSummary = orderedSlots.filter((slot) => slot.summary);
  const slotsWithDuties = orderedSlots.filter((slot) => (slot.responsibilities ?? []).length > 0);
  const slotHeading = (slot: (typeof slots)[number]) =>
    slot.division ? `${plantillaLabel(slot)} · ${slot.division}` : plantillaLabel(slot);
  const selectedChoices = target && isSelectable(target) ? [target] : [];
  const canContinue = selectedChoices.length > 0;
  const shownChoices = isAdminView ? choices : target ? [target] : [];

  // Salary grade can live on the posting or on each plantilla item. Show the
  // posting's, else the items' ("SG 10", or a range when they differ).
  const monthlySalaryText = (() => {
    const grades = job?.salaryGrade != null
      ? [job.salaryGrade]
      : Array.from(new Set(shownChoices.map((c) => c.salaryGrade).filter((g): g is number => g != null)));
    const amounts: number[] = [];
    for (const g of grades) {
      const range = stepRangeFor(g, salarySchedule);
      if (range) amounts.push(range.min, range.max);
    }
    if (amounts.length > 0) return formatSalaryRange(Math.min(...amounts), Math.max(...amounts));
    return job?.monthlySalary != null ? formatPeso(job.monthlySalary) : '';
  })();

  const salaryGradeText = (() => {
    if (job?.salaryGrade != null) return `SG ${job.salaryGrade}`;
    const grades = Array.from(new Set(shownChoices.map((c) => c.salaryGrade).filter((g): g is number => g != null))).sort((a, b) => a - b);
    if (grades.length === 0) return 'Not specified';
    return grades.length === 1 ? `SG ${grades[0]}` : `SG ${grades[0]}–${grades[grades.length - 1]}`;
  })();

  const handleContinue = () => {
    if (!canContinue || !postingKey) return;
    navigate('/apply', {
      state: {
        landingJob: {
          title,
          department,
          itemNumber: itemNo,
          jobPostingId: postingKey,
          plantillaSlots: slots,
          // Step 2 opens one form tab per item chosen here.
          selectedChoices,
        },
      },
    });
  };

  // Curriculum Vitae is no longer required; older postings may still list it.
  const requiredDocs = (job && !landingJob
    ? job.requiredDocuments || ['Application Letter']
    : [
        'Personal Data Sheet (PDS) with Work Experience Sheet',
        'Application Letter',
        'Proof of eligibility/rating/license',
        'Transcript of Records',
      ]).filter((doc) => !isCurriculumVitae(doc));
  const deadlineText = closingDate ? formatShortDate(closingDate) : 'the closing date';

  const summaryCard = (
    <details
      className="af-card af-collapse"
      open={summaryOpen}
      onToggle={(event) => setSummaryOpen((event.currentTarget as HTMLDetailsElement).open)}
      style={{ gridArea: 'summary' }}
    >
      <summary>
        <span className="af-chip" aria-hidden="true"><Briefcase size={20} strokeWidth={1.75} /></span>
        <span className="af-card-head-text">
          <span className="af-title-s" style={{ display: 'block' }}>Posting summary</span>
          <span className="af-caption" style={{ display: 'block' }}>{department || 'Department not specified'}</span>
        </span>
        <ChevronDown className="af-collapse-icon" size={20} strokeWidth={1.75} aria-hidden="true" />
      </summary>

      <dl className="af-rows">
        <Row label="Place of assignment" value={department} />
        <Row label="Salary grade" value={salaryGradeText} />
        {/* The grade's pay range across its steps, not just the Step 1 hiring
            rate — that is the least the post pays, not what it pays. Falls
            back to the stored figure when the grade is not in the schedule. */}
        {monthlySalaryText && <Row label="Monthly salary" value={monthlySalaryText} />}
        <Row label="Posted" value={formatShortDate(postingDate)} />
        <Row label="Application closes" value={formatShortDate(closingDate)} />
      </dl>

      {slotsWithSummary.length > 0 ? (
        <>
          <p className="af-caps af-rows-title">Position summary</p>
          {slotsWithSummary.map((slot) => (
            <div key={slot.id} style={{ marginBottom: 12 }}>
              <p className="af-body-s"><strong>{slotHeading(slot)}</strong></p>
              <p className="af-text">{slot.summary}</p>
            </div>
          ))}
        </>
      ) : job?.summary && (
        <>
          <p className="af-caps af-rows-title">Position summary</p>
          <p className="af-text">{job.summary}</p>
        </>
      )}

      {job && (
        <>
          <p className="af-caps af-rows-title">Qualification standards</p>
          <p className="af-body-s">Anything marked "Not specified" has no stated requirement.</p>
          <dl className="af-rows">
            <Row
              label="Education"
              value={
                job.qualifications.education
                  ? `${job.qualifications.education}${job.qualifications.educationField ? ` in ${job.qualifications.educationField}` : ' (any field)'}`
                  : ''
              }
            />
            <Row
              label="Experience"
              value={(() => {
                const total = Number(job.qualifications.experience.years || 0);
                const field = job.qualifications.experience.field;
                if (total <= 0) {
                  // Years may be 0 while a domain of experience is still required.
                  return field ? `Relevant experience in ${field}` : '';
                }
                const years = Math.floor(total);
                const months = Math.round((total - years) * 12);
                const parts: string[] = [];
                if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
                if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
                const duration = parts.join(' ');
                return field ? `${duration} in ${field}` : duration;
              })()}
              emptyText="None required"
            />
            <Row label="Training" value={job.training ?? ''} emptyText="None required" />
            <Row label="Eligibility" value={job.eligibility ?? ''} />
            <Row label="Competency" value={job.competency ?? ''} />
          </dl>

          {job.qualifications.skills.length > 0 && (
            <>
              <p className="af-caps af-rows-title">Required skills</p>
              <div className="af-tags">
                {job.qualifications.skills.map((skill) => (
                  <span key={skill} className="badge badge-tint">{skill}</span>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <section aria-labelledby="jd-docs">
        <h2 className="af-caps af-rows-title" id="jd-docs">Required documents</h2>
        <p className="af-body-s">Submit these before {deadlineText} as part of your application.</p>
        <ol className="af-rows af-rows-numbered">
          {requiredDocs.map((doc, idx) => (
            <li key={idx}>{doc}</li>
          ))}
        </ol>
        <p className="af-body-s" style={{ marginTop: 8 }}>
          Address your application letter to the head of office and attach the required documents listed above.
          Applications received after {deadlineText} may not be considered.
        </p>
      </section>
    </details>
  );

  const moreCards = (
    <div className="af-stack" style={{ gridArea: 'more' }}>
      {slotsWithDuties.length > 0 ? (
        <section className="af-card" aria-labelledby="jd-resp">
          <div className="af-card-head">
            <span className="af-chip" aria-hidden="true"><ListChecks size={20} strokeWidth={1.75} /></span>
            <h2 className="af-title-s" id="jd-resp">Responsibilities</h2>
          </div>
          {slotsWithDuties.map((slot) => (
            <div key={slot.id}>
              <p className="af-caps af-rows-title">{slotHeading(slot)}</p>
              <ul className="af-list">
                {(slot.responsibilities ?? []).map((resp, idx) => (
                  <li key={idx}><CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />{resp}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : job && !landingJob && job.responsibilities && job.responsibilities.filter((r) => r.trim()).length > 0 && (
        <section className="af-card" aria-labelledby="jd-resp">
          <div className="af-card-head">
            <span className="af-chip" aria-hidden="true"><ListChecks size={20} strokeWidth={1.75} /></span>
            <h2 className="af-title-s" id="jd-resp">Responsibilities</h2>
          </div>
          <ul className="af-list">
            {job.responsibilities.filter((r) => r.trim()).map((resp, idx) => (
              <li key={idx}><CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" />{resp}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  // ── Right column: the applicant's plantilla (public) or the slot breakdown (RSP) ──
  // No chooser: each vacancy is one plantilla, named here with the way forward.
  // No card: the submission instruction, then the way forward (the hero names the plantilla).
  const chooser = (
    <div className="af-stack" style={{ gap: 16 }}>
      <div className="af-alert af-alert-info" role="note">
        <Info size={20} strokeWidth={1.75} aria-hidden="true" />
        <p className="af-alert-body">{SUBMISSION_INSTRUCTION}</p>
      </div>

      {!loaded && !target ? (
        <div className="af-skel" aria-busy="true" aria-label="Loading plantilla" style={{ height: 44 }} />
      ) : !target || !isSelectable(target) ? (
        <div className="af-alert af-alert-warning" role="status">
          <Lock size={20} strokeWidth={1.75} aria-hidden="true" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 className="af-alert-title">This plantilla is no longer open</h2>
            <p className="af-alert-body">
              {target ? DISABLED_REASON[target.status]?.replace(' Choose another item.', '') : 'It has been filled or closed.'}
            </p>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigate('/job-portal')} style={{ marginTop: 12 }}>
              Back to Vacancies
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-md btn-primary btn-block af-desktop-only"
          onClick={handleContinue}
        >
          Continue to Application
          <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const adminSlots = (
    <section className="af-card" aria-labelledby="jd-slots">
      <div className="af-card-head">
        <span className="af-chip" aria-hidden="true"><Building2 size={20} strokeWidth={1.75} /></span>
        <div className="af-card-head-text">
          <h2 className="af-title-s" id="jd-slots">Plantilla items ({choices.length})</h2>
          <p className="af-caption">
            {openSlots.length} open · {slots.filter((slot) => slot.status === 'filled').length} filled ·{' '}
            {slots.filter((slot) => slot.status === 'closed').length} closed
          </p>
        </div>
      </div>
      <ul className="af-choices" style={{ marginBottom: 0 }}>
        {choices.map((choice) => (
          <li key={choice.key} className="af-choice" style={{ cursor: 'default' }}>
            <div className="af-choice-body">
              <div className="af-choice-row">
                <span className="af-choice-name">{choiceLabel(choice)}</span>
                <StatusBadge status={choice.status === 'applied' || choice.status === 'closing' ? 'open' : choice.status} />
              </div>
              <p className="af-choice-meta">
                {(() => {
                  const count = slotApplicantCounts.get(choice.key) ?? 0;
                  return `${count} applicant${count === 1 ? '' : 's'}`;
                })()}
                {choice.salaryGrade != null ? ` · SG ${choice.salaryGrade}` : ''}
              </p>
              {hireNamesBySlotId[choice.key] && (
                <p className="af-choice-meta">Filled by {hireNamesBySlotId[choice.key]}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="abyan-ds af">
      {!isAdminView && <PublicTopBar />}

      <section className="af-hero">
        <div className="af-container">
          <button type="button" onClick={goBack} className="btn btn-sm btn-ghost-white af-hero-back">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back
          </button>
          <div className="af-hero-head">
            <div>
              <h1>{title}</h1>
              <p className="af-hero-sub">
                <Briefcase size={18} strokeWidth={1.75} aria-hidden="true" />
                {!isAdminView && target
                  ? choiceLabel(target)
                  : isMultiSlot
                    ? `${slots.length} Plantillas · ${openSlots.length} open`
                    : slots[0] ? plantillaLabel(slots[0]) : 'Plantilla 1'}
                {department ? ` · ${department}` : ''}
              </p>
            </div>
            {/* RSP only (docs/mockups/2026-10-18-job-edit-entry.html, option B). Opens the Job posts edit form. */}
            {isAdminView && job && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {isOpenVacancy(job) && (
                  <button type="button" className="btn btn-md btn-ghost-white" onClick={() => { setCloseError(''); setClosing(true); }}>
                    <XCircle size={18} strokeWidth={1.75} aria-hidden="true" />
                    Close Vacancy
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-md btn-white"
                  onClick={() => navigate('/admin/rsp/jobs?tab=positions', { state: { editJobId: job.id } })}
                >
                  <Pencil size={18} strokeWidth={1.75} aria-hidden="true" />
                  Edit Posting
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {!isAdminView && (
        <div className="af-stepper-wrap">
          <div className="af-container">
            <Stepper steps={APPLY_STEPS} current={0} />
          </div>
        </div>
      )}

      <main className="af-main">
        <div className="af-container">
          <div className="af-step1">
            {summaryCard}
            <div className="af-sticky-col" style={{ gridArea: 'chooser' }}>
              {isAdminView ? adminSlots : chooser}
            </div>
            {moreCards}
          </div>
        </div>
      </main>

      {closing && job && (
        <CloseVacancyDialog job={job} error={closeError} onCancel={() => setClosing(false)} onConfirm={confirmClose} />
      )}

      {!isAdminView && canContinue && (
        <div className="af-actionbar af-mobile-only">
          <button type="button" className="btn btn-md btn-primary" onClick={handleContinue} disabled={!canContinue}>
            Continue to Application
            <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
