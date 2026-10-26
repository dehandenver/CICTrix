import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Briefcase,
    CheckCircle2,
    CircleAlert,
    CircleCheck,
    CircleDashed,
    Copy,
    Eye,
    EyeOff,
    FileText,
    Info,
    Pencil,
    PencilLine,
    Search,
    Send,
    ShieldCheck,
    UserPlus,
    Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Dialog } from '../../components';
import { formatDivisionAndOffice, POSITION_TO_DEPARTMENT_MAP } from '../../constants/positions';
import {
    type EmployeePortalAccount,
    findEmployeePortalAccount,
    getEmployeePortalAccounts,
    findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail,
} from '../../lib/employeePortalData';
import { syncApplicantSubmissionToRecruitment, getAuthoritativeJobPostings, loadJobPostings } from '../../lib/recruitmentData';
import { fetchEmployeeApplicationProfile, type EmployeeApplicationProfile } from '../../lib/api/employeeApplicationProfile';
import {
  MONTHS_PER_YEAR,
  emptyWorkExperience,
  entryFromLegacy,
  formatDuration,
  keepShownErrors,
  toStoredWorkExperiences,
  totalExperienceYears,
  validateWorkExperiences,
  type WorkExperienceEntry,
} from '../../lib/workExperience';
import { describeActionFailure } from '../../lib/friendlyErrors';
import { linkApplicationToSlots } from '../../lib/plantillaSlots';
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase';
import { encryptApplicantFile } from '../../lib/crypto';
import '../../styles/wizard.css';
import type { ApplicantFormData, UploadedFile, ValidationErrors } from '../../types/applicant.types';
import type { JobPosting } from '../../types/recruitment.types';
import { validateApplicantForm, validateFiles } from '../../utils/validation';
import { duplicatePlantillaMessage, isDuplicatePlantillaApplication, normalizeApplicantEmail } from '../../lib/plantillaRules';
import { logErrorForAdmin } from '../../utils/errorLogger';
import { ApplicantAssessmentForm } from './ApplicantAssessmentForm';
import { AttachmentsUploadForm, REQUIRED_DOCUMENTS } from './AttachmentsUploadForm';
import {
    APPLY_STEPS,
    ConfirmModal,
    GENERAL_APPLY_STEPS,
    PublicTopBar,
    Stepper,
} from './flow/FlowUi';
import {
    GENERAL_KEY,
    choiceLabel,
    clearDrafts,
    draftHasData,

    loadDrafts,
    markApplied,
    saveDrafts,
    type ApplyDrafts,
    type PlantillaChoice,
} from './flow/applicationDrafts';
import { FORM_PAGES, FORM_PAGE_COUNT, clampFormPage, firstPageWithErrors, pageErrors } from './flow/formPages';

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';
const APPOINTMENT_TYPE_STORAGE_KEY = 'cictrix_rsp_score_setup';
const MAX_PREVIEWABLE_FILE_BYTES = 10 * 1024 * 1024;

type CachedPreviewFile = {
  applicantId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
};

type SyncedAttachment = {
  name: string;
  type: string;
  size: number;
  documentType?: string;
  filePath: string;
};

const INITIAL_FORM_DATA: ApplicantFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: '',
  address: '',
  contact_number: '',
  email: '',
  position: '',
  item_number: '',
  office: '',
  is_pwd: false,
  application_type: 'job',
  employee_id: '',
  current_position: '',
  current_department: '',
  current_division: '',
  employee_username: '',
  education_attainment: '',
  education_degree: '',
  education_school: '',
  work_experiences: [emptyWorkExperience()],
  gov_id_type: '',
  gov_id_expiration: '',
};

/** One isolated application: its own answers, its own files, its own errors. */
interface AppState {
  formData: ApplicantFormData;
  files: UploadedFile[];
  errors: ValidationErrors;
  fileError: string;
}

type SubmitOutcome =
  | { status: 'submitting' }
  | { status: 'ok'; referenceNo: string }
  | { status: 'already'; referenceNo?: string }
  | { status: 'failed'; error: string };

type TabStatus = 'new' | 'progress' | 'complete' | 'attention';

const TAB_STATUS: Record<TabStatus, { label: string; Icon: typeof CircleCheck }> = {
  new: { label: 'Not started', Icon: CircleDashed },
  progress: { label: 'In progress', Icon: PencilLine },
  complete: { label: 'Complete', Icon: CircleCheck },
  attention: { label: 'Needs attention', Icon: CircleAlert },
};

const blankApp = (formData: ApplicantFormData): AppState => ({ formData, files: [], errors: {}, fileError: '' });

/**
 * Entry 1 from an employee's record (their most recent work experience), each
 * field falling back to what is already in the form. Later entries are kept.
 */
const withProfileExperience = (
  current: WorkExperienceEntry[],
  profile: Pick<EmployeeApplicationProfile, 'workExperienceYears' | 'workExperienceMonths' | 'relevantExperiencePosition' | 'relevantExperienceCompany' | 'relevantExperienceDuties'> | null | undefined,
): WorkExperienceEntry[] => {
  const [first = emptyWorkExperience(), ...rest] = current;
  const fromProfile = entryFromLegacy({
    work_experience_years: profile?.workExperienceYears,
    work_experience_months: profile?.workExperienceMonths,
    relevant_experience_position: profile?.relevantExperiencePosition,
    relevant_experience_company: profile?.relevantExperienceCompany,
    relevant_experience_duties: profile?.relevantExperienceDuties,
  });
  return [
    {
      years: fromProfile.years || first.years,
      months: fromProfile.months || first.months,
      position: fromProfile.position || first.position,
      company: fromProfile.company || first.company,
      duties: fromProfile.duties || first.duties,
    },
    ...rest,
  ];
};

const normalizeAuthValue = (value: string) => String(value ?? '').trim().toLowerCase();

const saveApplicantAppointmentType = (applicantId: string, applicationType: 'job' | 'promotion') => {
  try {
    const raw = localStorage.getItem(APPOINTMENT_TYPE_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, 'original' | 'promotional'>) : {};
    parsed[applicantId] = applicationType === 'promotion' ? 'promotional' : 'original';
    localStorage.setItem(APPOINTMENT_TYPE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Best effort cache only.
  }
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

/** Validation is unchanged: the same two validators, run over the whole form. */
const validateApp = (app: AppState) => {
  const errors = validateApplicantForm(app.formData, 'all');
  const fileError =
    validateFiles(app.files.map((f) => f.file), app.files, app.formData.application_type === 'promotion' ? 'promotion' : 'job') ?? '';
  return { errors, fileError, count: Object.keys(errors).length + (fileError ? 1 : 0) };
};

export const ApplicantWizard: React.FC = () => {
  // Hydrate from sessionStorage so a refresh keeps the applicant on the same
  // step with the same answers for every plantilla.
  const persisted = useMemo(() => loadDrafts(), []);
  const location = useLocation();
  const navigate = useNavigate();

  const [entryMode, setEntryMode] = useState<'landing' | 'wizard'>(persisted.entryMode);
  const [step, setStep] = useState<'fill' | 'review'>(persisted.step);
  /** Page of Step 2 (flow/formPages.ts). Answers live in `apps`, so paging never loses data. */
  const [formPage, setFormPage] = useState(() => clampFormPage(persisted.formPage));
  const [posting, setPosting] = useState<ApplyDrafts['posting']>(persisted.posting);
  const [choices, setChoices] = useState<PlantillaChoice[]>(persisted.choices);
  const [lockedPosition, setLockedPosition] = useState(persisted.lockedPosition);
  const [apps, setApps] = useState<Record<string, AppState>>(() =>
    Object.fromEntries(Object.entries(persisted.drafts).map(([key, formData]) => [key, blankApp(formData)])),
  );
  const [activeKey, setActiveKey] = useState(persisted.activeKey);
  const [authenticatedEmployeeAccount, setAuthenticatedEmployeeAccount] = useState<EmployeePortalAccount | null>(
    persisted.authenticatedEmployeeAccount,
  );

  /** True after "Review Application" has been pressed once: tabs may then show "Needs attention". */
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const [validationSummary, setValidationSummary] = useState<Array<{ key: string; count: number }>>([]);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [pendingCopy, setPendingCopy] = useState<{ from: string; to: string } | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const [declared, setDeclared] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, SubmitOutcome>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completed, setCompleted] = useState<null | Array<{ key: string; label: string; outcome: SubmitOutcome }>>(null);

  // Since migration 20261021200000 one person keeps one Reference No. across every plantilla.
  // When this submission's numbers all agree, that is the person's number, and
  // any applications under it beyond the ones just listed were filed earlier.
  // Mixed numbers mean the migration has not been applied: keep per-row numbers.
  const sharedReferenceNo = useMemo(() => {
    if (!completed) return null;
    const refs = new Set(
      completed
        .map((entry) => ('referenceNo' in entry.outcome ? entry.outcome.referenceNo?.trim() : undefined))
        .filter((ref): ref is string => Boolean(ref)),
    );
    return refs.size === 1 ? [...refs][0] : null;
  }, [completed]);
  const [earlierApplicationCount, setEarlierApplicationCount] = useState(0);

  useEffect(() => {
    setEarlierApplicationCount(0);
    if (!sharedReferenceNo || !completed) return;
    let cancelled = false;
    void (async () => {
      const { count, error } = await (supabase as any)
        .from('applicant_tracker_view')
        .select('id', { count: 'exact', head: true })
        .eq('reference_no_normalized', sharedReferenceNo.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      // A failed count only hides the note; the submission itself succeeded.
      if (cancelled || error || typeof count !== 'number') return;
      setEarlierApplicationCount(Math.max(0, count - completed.length));
    })();
    return () => { cancelled = true; };
  }, [sharedReferenceNo, completed]);

  const [showEmployeeAuth, setShowEmployeeAuth] = useState(false);
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);
  const [employeeAuthError, setEmployeeAuthError] = useState('');
  // Explains that a promotional form was auto-filled from the employee's record (or why it wasn't).
  const [prefillNotice, setPrefillNotice] = useState<Record<string, string>>({});
  const [isLoadingPrefill, setIsLoadingPrefill] = useState(false);
  const lastPrefilledRef = useRef<Record<string, { employeeId: string; username: string }>>({});
  const [activeJobs, setActiveJobs] = useState<JobPosting[]>([]);
  const entryHandledRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusInvalidRef = useRef(false);

  /** The application keys in tab order. A general application has exactly one. */
  const keys = useMemo(() => (choices.length > 0 ? choices.map((c) => c.key) : [GENERAL_KEY]), [choices]);
  const choiceByKey = useMemo(() => new Map(choices.map((c) => [c.key, c])), [choices]);
  const currentKey = keys.includes(activeKey) ? activeKey : keys[0];
  const active: AppState | undefined = apps[currentKey];
  const isPostingFlow = Boolean(posting) && choices.length > 0;

  // ── Persist drafts (answers only; File objects can't be serialized) ───────
  useEffect(() => {
    if (completed) return;
    saveDrafts({
      version: 2,
      entryMode,
      step,
      posting,
      choices,
      drafts: Object.fromEntries(Object.entries(apps).map(([key, app]) => [key, app.formData])),
      activeKey: currentKey,
      authenticatedEmployeeAccount,
      lockedPosition,
      formPage,
    });
  }, [entryMode, step, formPage, posting, choices, apps, currentKey, authenticatedEmployeeAccount, lockedPosition, completed]);

  const hasUnsavedWork = useMemo(
    () => entryMode === 'wizard' && !completed && Object.values(apps).some((app) => draftHasData(app.formData) || app.files.length > 0),
    [entryMode, completed, apps],
  );

  // Warn before the tab closes or reloads with unsubmitted answers (uploads
  // in particular can't survive a reload).
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedWork]);

  // ── Entry: from Step 1, from an old deep link, or from query params ───────
  useEffect(() => {
    if (entryHandledRef.current) return;
    const state = location.state as {
      landingJob?: {
        title: string;
        itemNumber: string;
        department: string;
        jobPostingId?: string;
        selectedChoices?: PlantillaChoice[];
      };
    } | null;
    const landingJob = state?.landingJob;
    const searchParams = new URLSearchParams(location.search);
    const positionFromQuery = searchParams.get('position') || undefined;
    const itemNumberFromQuery = searchParams.get('itemNumber') || undefined;
    const officeFromQuery = searchParams.get('office') || undefined;

    if (landingJob) {
      entryHandledRef.current = true;
      const selected = landingJob.selectedChoices ?? [];

      // Vacancy cards used to jump straight into the form. Opening a posting
      // now always starts at Step 1, so send those arrivals there.
      if (selected.length === 0) {
        const target = landingJob.jobPostingId || landingJob.itemNumber;
        navigate(target ? `/job-details/${encodeURIComponent(target)}` : '/job-portal', {
          replace: true,
          state: { landingJob },
        });
        return;
      }

      const postingId = landingJob.jobPostingId || landingJob.itemNumber;
      const sameSelection =
        persisted.posting?.id === postingId &&
        persisted.entryMode === 'wizard' &&
        persisted.choices.map((c) => c.key).join('|') === selected.map((c) => c.key).join('|');
      if (sameSelection) return; // A refresh: keep the restored step and tab.

      // Keep answers already typed for items that are still selected; every
      // newly selected item starts from a blank copy.
      const previous = persisted.posting?.id === postingId ? persisted.drafts : {};
      const nextApps: Record<string, AppState> = {};
      selected.forEach((choice) => {
        const base = previous[choice.key] ?? { ...INITIAL_FORM_DATA, application_type: 'job' as const };
        nextApps[choice.key] = blankApp({
          ...base,
          position: landingJob.title,
          office: landingJob.department,
          item_number: choice.itemNumber,
        });
      });

      setPosting({ id: postingId, title: landingJob.title, department: landingJob.department });
      setChoices(selected);
      setApps(nextApps);
      setActiveKey(selected[0].key);
      setLockedPosition(true);
      setAuthenticatedEmployeeAccount(null);
      setEntryMode('wizard');
      setStep('fill');
      setFormPage(1);
      setOutcomes({});
      return;
    }

    if (positionFromQuery || itemNumberFromQuery) {
      entryHandledRef.current = true;
      // Query-param entry carries no slot data; resolve the posting by item
      // number first and title second, then start at Step 1 for it.
      const postings = getAuthoritativeJobPostings();
      const matched = itemNumberFromQuery
        ? postings.find((job) =>
            job.jobCode === itemNumberFromQuery ||
            (job.plantillaSlots ?? []).some((slot) => slot.itemNumber === itemNumberFromQuery))
        : postings.find((job) => job.title === positionFromQuery);
      if (matched) {
        navigate(`/job-details/${encodeURIComponent(matched.id)}`, { replace: true });
        return;
      }

      // No posting to choose from: a general application for that position.
      const existing = persisted.posting === null ? persisted.drafts[GENERAL_KEY] : undefined;
      setPosting(null);
      setChoices([]);
      setApps({
        [GENERAL_KEY]: blankApp({
          ...(existing ?? INITIAL_FORM_DATA),
          application_type: 'job',
          position: positionFromQuery || existing?.position || '',
          office: officeFromQuery || POSITION_TO_DEPARTMENT_MAP[positionFromQuery || ''] || existing?.office || '',
        }),
      });
      setActiveKey(GENERAL_KEY);
      setLockedPosition(true);
      setEntryMode('wizard');
      setStep('fill');
      setFormPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.search]);

  // ── Per-application state helpers ─────────────────────────────────────────
  const updateApp = useCallback((key: string, updater: (app: AppState) => AppState) => {
    setApps((prev) => {
      const current = prev[key] ?? blankApp({ ...INITIAL_FORM_DATA });
      return { ...prev, [key]: updater(current) };
    });
  }, []);

  const changeHandlers = useRef<Record<string, (field: keyof ApplicantFormData, value: ApplicantFormData[keyof ApplicantFormData]) => void>>({});
  /** A stable onChange per application, so child effects keyed on it don't loop. */
  const handleFormChangeFor = (key: string) => {
    if (!changeHandlers.current[key]) {
      changeHandlers.current[key] = (field, value) =>
        updateApp(key, (app) => {
          // Work experience errors are per entry: keep the ones still true, so a
          // fixed field clears while untouched entries keep their messages.
          if (field === 'work_experiences') {
            const entries = value as WorkExperienceEntry[];
            return {
              ...app,
              formData: { ...app.formData, work_experiences: entries },
              errors: { ...app.errors, work_experiences: keepShownErrors(app.errors.work_experiences, validateWorkExperiences(entries)) },
            };
          }
          return {
            ...app,
            formData: { ...app.formData, [field]: value },
            errors: app.errors[field as keyof ValidationErrors] ? { ...app.errors, [field]: undefined } : app.errors,
          };
        });
    }
    return changeHandlers.current[key];
  };

  const fileHandlers = useRef<Record<string, (files: UploadedFile[]) => void>>({});
  const handleFilesChangeFor = (key: string) => {
    if (!fileHandlers.current[key]) {
      fileHandlers.current[key] = (files) => updateApp(key, (app) => ({ ...app, files, fileError: '' }));
    }
    return fileHandlers.current[key];
  };

  // ── Promotional prefill: looks up the active form's Employee ID ───────────
  const activeFormData = active?.formData;
  useEffect(() => {
    const key = currentKey;
    if (!activeFormData || activeFormData.application_type !== 'promotion') {
      delete lastPrefilledRef.current[key];
      setIsLoadingPrefill(false);
      return;
    }

    const enteredId = String(activeFormData.employee_id || '').trim();
    const enteredUsername = String(activeFormData.employee_username || '').trim();

    // The Employee ID alone triggers the lookup. The portal username is
    // optional — when supplied it just tightens the account match.
    if (!enteredId) {
      delete lastPrefilledRef.current[key];
      setIsLoadingPrefill(false);
      return;
    }

    const last = lastPrefilledRef.current[key];
    if (
      last &&
      normalizeAuthValue(last.employeeId) === normalizeAuthValue(enteredId) &&
      normalizeAuthValue(last.username) === normalizeAuthValue(enteredUsername)
    ) {
      return;
    }

    const setNotice = (text: string) => setPrefillNotice((prev) => ({ ...prev, [key]: text }));

    const performPrefill = async () => {
      setIsLoadingPrefill(true);
      setNotice('Loading your employee records...');
      try {
        // Match the portal account by Employee ID alone. The username field is
        // an OUTPUT we auto-fill from the matched account — never a filter.
        let matchedAccount = getEmployeePortalAccounts().find(
          (account) =>
            normalizeAuthValue(String(account?.employee?.employeeId ?? '')) === normalizeAuthValue(enteredId),
        );

        if (!matchedAccount) {
          matchedAccount = await findEmployeePortalAccountFromSupabaseByEmployeeIdOrEmail(enteredId);
        }

        // The employees table is the authoritative source.
        const lookupEmail = matchedAccount?.employee?.email || activeFormData.email;
        const profile = await fetchEmployeeApplicationProfile(enteredId, lookupEmail);

        if (profile || matchedAccount) {
          const [accountFirstName, ...remainingParts] = String(matchedAccount?.employee?.fullName ?? '')
            .trim()
            .split(/\s+/);
          const accountLastName = remainingParts.length > 0 ? remainingParts[remainingParts.length - 1] : '';
          const accountMiddleName = remainingParts.length > 1 ? remainingParts.slice(0, -1).join(' ') : '';

          const currentDepartment = profile?.currentDepartment || matchedAccount?.employee?.currentDepartment || '';
          const currentDivision = profile?.currentDivision || matchedAccount?.employee?.currentDivision || '';
          const currentPosition = profile?.currentPosition || matchedAccount?.employee?.currentPosition || '';

          if (matchedAccount) setAuthenticatedEmployeeAccount(matchedAccount);
          updateApp(key, (app) => {
            const prev = app.formData;
            return {
              ...app,
              formData: {
                ...prev,
                employee_username: matchedAccount?.username || '',
                first_name: profile?.firstName || accountFirstName || prev.first_name,
                middle_name: profile?.middleName || accountMiddleName || prev.middle_name,
                last_name: profile?.lastName || accountLastName || prev.last_name,
                gender:
                  profile?.sex ||
                  (matchedAccount?.employee?.gender === 'Prefer not to say'
                    ? ''
                    : String(matchedAccount?.employee?.gender ?? '')) ||
                  prev.gender,
                address: profile?.address || matchedAccount?.employee?.homeAddress || prev.address,
                contact_number: profile?.contactNumber || matchedAccount?.employee?.mobileNumber || prev.contact_number,
                email: profile?.email || matchedAccount?.employee?.email || prev.email,
                current_position: currentPosition || prev.current_position,
                current_department: currentDepartment || prev.current_department,
                current_division: currentDivision || prev.current_division,
                // A posting fixes the department; only a general application takes the employee's own.
                office: lockedPosition ? prev.office : currentDepartment || prev.office,
                education_attainment: profile?.educationAttainment || prev.education_attainment,
                education_degree: profile?.educationDegree || prev.education_degree,
                education_school: profile?.educationSchool || prev.education_school,
                work_experiences: withProfileExperience(prev.work_experiences ?? [], profile),
              },
            };
          });

          // List what the record didn't have, so the applicant knows what to complete by hand.
          const resolvedGender =
            profile?.sex ||
            (matchedAccount?.employee?.gender === 'Prefer not to say'
              ? ''
              : String(matchedAccount?.employee?.gender ?? ''));
          const notOnFile: string[] = [];
          if (!resolvedGender) notOnFile.push('Gender');
          if (!(profile?.contactNumber || matchedAccount?.employee?.mobileNumber)) notOnFile.push('Contact Number');
          if (!(profile?.address || matchedAccount?.employee?.homeAddress)) notOnFile.push('Address');
          if (!profile?.educationAttainment) notOnFile.push('Highest Educational Attainment');
          if (!profile?.relevantExperiencePosition) notOnFile.push('Position Held');
          if (!profile?.relevantExperienceCompany) notOnFile.push('Company / Organization');
          if (!profile?.relevantExperienceDuties) notOnFile.push('Description of Duties');

          const baseNotice = profile
            ? 'We filled in your details from your employee record. Review each field and update anything that has changed.'
            : "We couldn't find your employee record, so please fill in your details manually.";
          const blanksNotice =
            notOnFile.length > 0
              ? ` These weren't on file in your record, so please fill them in manually: ${notOnFile.join(', ')}.`
              : '';
          setNotice(baseNotice + blanksNotice);
          lastPrefilledRef.current[key] = { employeeId: enteredId, username: matchedAccount?.username || '' };
        } else {
          setNotice("We couldn't find your employee record, so please fill in your details manually.");
          lastPrefilledRef.current[key] = { employeeId: enteredId, username: enteredUsername };
        }
      } catch (err) {
        console.error('Error prefilling employee record:', err);
        setNotice('Failed to load employee records. Please try entering details manually.');
      } finally {
        setIsLoadingPrefill(false);
      }
    };

    // Debounce: wait 700ms after the last keystroke before firing the lookup
    const timerId = setTimeout(performPrefill, 700);
    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey, activeFormData?.application_type, activeFormData?.employee_id, activeFormData?.employee_username]);

  const handleApplicationTypeChange = (key: string, next: 'job' | 'promotion') => {
    updateApp(key, (app) => ({
      ...app,
      formData:
        next === 'job'
          ? {
              ...app.formData,
              application_type: next,
              // Clear promotional-specific fields when switching to Original
              employee_id: '',
              employee_username: '',
              current_position: '',
              current_department: '',
              current_division: '',
            }
          : { ...app.formData, application_type: next },
    }));
    if (next === 'job') {
      setPrefillNotice((prev) => ({ ...prev, [key]: '' }));
      setAuthenticatedEmployeeAccount(null);
      delete lastPrefilledRef.current[key];
    }
  };

  // ── Tab status (text + icon, never colour alone) ──────────────────────────
  const tabStatus = (key: string): TabStatus => {
    const app = apps[key];
    if (!app) return 'new';
    const { count } = validateApp(app);
    if (count === 0) return 'complete';
    if (reviewAttempted && validationSummary.some((entry) => entry.key === key)) return 'attention';
    return draftHasData(app.formData) || app.files.length > 0 ? 'progress' : 'new';
  };

  const labelFor = (key: string): string => {
    const choice = choiceByKey.get(key);
    return choice ? choiceLabel(choice) : 'Your application';
  };

  // Move focus to the form heading when Step 2 (or a jumped-to tab) opens.
  const focusHeading = () => window.requestAnimationFrame(() => headingRef.current?.focus());
  useEffect(() => {
    if (entryMode === 'wizard' && !completed) focusHeading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryMode, step]);

  // After validation switches to a failing tab, focus its first invalid field.
  useEffect(() => {
    if (!focusInvalidRef.current) return;
    focusInvalidRef.current = false;
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      const target =
        panel?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
        panel?.querySelector<HTMLElement>('.af-doc[data-state="empty"] button') ??
        panel?.querySelector<HTMLElement>('.af-error');
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }, [currentKey, apps]);

  const selectTab = (key: string) => {
    setActiveKey(key);
    setCopyMenuOpen(false);
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % keys.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + keys.length) % keys.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = keys.length - 1;
    if (next < 0) return;
    event.preventDefault();
    selectTab(keys[next]);
    tabRefs.current[keys[next]]?.focus();
  };

  // ── Copy answers between plantilla forms ──────────────────────────────────
  const copyAnswers = (from: string, to: string) => {
    const source = apps[from];
    if (!source) return;
    updateApp(to, (target) => ({
      ...target,
      formData: {
        ...source.formData,
        // Each copy keeps its own plantilla identity.
        item_number: target.formData.item_number,
        position: target.formData.position,
        office: target.formData.office,
      },
      // Same File contents, separate entries: each application uploads its own copy.
      files: source.files.map((file) => ({
        ...file,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      })),
      errors: {},
      fileError: '',
    }));
    setCopyNotice(`Copied answers from ${labelFor(from)}. You can still edit this copy on its own.`);
    setPendingCopy(null);
    setCopyMenuOpen(false);
  };

  const requestCopy = (from: string) => {
    const target = apps[currentKey];
    if (target && (draftHasData(target.formData) || target.files.length > 0)) {
      setPendingCopy({ from, to: currentKey });
      setCopyMenuOpen(false);
      return;
    }
    copyAnswers(from, currentKey);
  };

  // ── Step 2 → Step 3 ───────────────────────────────────────────────────────
  const handleReview = () => {
    const summary: Array<{ key: string; count: number }> = [];
    const nextApps = { ...apps };
    keys.forEach((key) => {
      const app = nextApps[key] ?? blankApp({ ...INITIAL_FORM_DATA });
      const result = validateApp(app);
      nextApps[key] = { ...app, errors: result.errors, fileError: result.fileError };
      if (result.count > 0) summary.push({ key, count: result.count });
    });
    setApps(nextApps);
    setReviewAttempted(true);
    setValidationSummary(summary);
    setCopyNotice('');

    if (summary.length > 0) {
      logErrorForAdmin('Validation error in Applicant Wizard', summary, 'Form Validation');
      focusInvalidRef.current = true;
      setActiveKey(summary[0].key);
      const first = nextApps[summary[0].key];
      setFormPage(firstPageWithErrors(first.errors, first.fileError) ?? FORM_PAGE_COUNT);
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0 });
  };

  // ── Step 2 pages: Next validates only the fields on the current page ──────
  const handleNextPage = () => {
    const app = apps[currentKey] ?? blankApp({ ...INITIAL_FORM_DATA });
    const full = validateApp(app);
    const scoped = pageErrors(formPage, full.errors, full.fileError);
    // Show this page's errors; keep any already shown on other pages.
    updateApp(currentKey, (current) => ({
      ...current,
      errors: { ...current.errors, ...Object.fromEntries(FORM_PAGES[formPage - 1].fields.map((field) => [field, scoped.errors[field]])) },
      fileError: FORM_PAGES[formPage - 1].documents ? scoped.fileError : current.fileError,
    }));
    if (scoped.count > 0) {
      focusInvalidRef.current = true;
      return;
    }
    setFormPage((page) => Math.min(page + 1, FORM_PAGE_COUNT));
    window.scrollTo({ top: 0 });
    focusHeading();
  };

  const handleBackPage = () => {
    if (formPage > 1) {
      setFormPage(formPage - 1);
      window.scrollTo({ top: 0 });
      focusHeading();
      return;
    }
    handleBackFromFill();
  };

  // ── Submission: one application per plantilla ─────────────────────────────
  const uploadFiles = async (client: any, applicantId: string, files: UploadedFile[]): Promise<SyncedAttachment[]> => {
    const persistedFiles: SyncedAttachment[] = [];

    for (const uploadedFile of files) {
      const generatedPath = `${applicantId}/${Date.now()}-${uploadedFile.file.name}`;
      const storageBucket = client?.storage?.from?.(ATTACHMENTS_BUCKET);
      const hasUpload = typeof storageBucket?.upload === 'function';

      // Supabase is required for file storage
      if (!hasUpload) {
        logErrorForAdmin('Supabase storage client upload function not found', null, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      const filePath = generatedPath;
      const fileToUpload = await encryptApplicantFile(uploadedFile.file);
      try {
        const uploadResult = await storageBucket.upload(generatedPath, fileToUpload);
        const uploadError = (uploadResult as any).error;
        if (uploadError) {
          throw new Error(String(uploadError));
        }
      } catch (error) {
        logErrorForAdmin(`Failed to upload ${uploadedFile.file.name} to storage bucket`, error, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      const attachmentPayload = {
        applicant_id: applicantId,
        file_name: uploadedFile.file.name,
        file_path: filePath,
        file_type: uploadedFile.file.type,
        file_size: fileToUpload.size,
        document_type: (uploadedFile as any).documentType || 'other',
      };

      try {
        const insertResult = typeof client?.insertAttachment === 'function'
          ? await client.insertAttachment(attachmentPayload)
          : await client.from('applicant_attachments').insert(attachmentPayload);

        const insertError = (insertResult as any).error;
        if (insertError) {
          throw new Error(String(insertError));
        }
      } catch (error) {
        logErrorForAdmin(`Failed to insert attachment metadata for ${uploadedFile.file.name} to DB`, error, 'File Upload');
        throw new Error('File upload failed. Please check your internet connection and try again.');
      }

      persistedFiles.push({
        name: uploadedFile.file.name,
        type: uploadedFile.file.type,
        size: uploadedFile.file.size,
        documentType: (uploadedFile as any).documentType,
        filePath,
      });
    }

    return persistedFiles;
  };

  const toDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read file for preview cache'));
      reader.readAsDataURL(file);
    });

  const cachePreviewableFiles = async (applicantId: string, files: UploadedFile[]) => {
    const previewable = files.filter((entry) => entry.file.size <= MAX_PREVIEWABLE_FILE_BYTES);
    if (previewable.length === 0) return;

    const cacheRows: CachedPreviewFile[] = await Promise.all(
      previewable.map(async (entry) => ({
        applicantId,
        documentType: String((entry as any).documentType ?? 'other'),
        fileName: entry.file.name,
        mimeType: entry.file.type,
        dataUrl: await toDataUrl(entry.file),
        createdAt: new Date().toISOString(),
      }))
    );

    try {
      const existing = (() => {
        try {
          return JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
        } catch {
          return [];
        }
      })();

      const incomingKeys = new Set(cacheRows.map((row) => `${row.applicantId}:${row.documentType}`));
      const next = [
        ...existing.filter((row) => !incomingKeys.has(`${row.applicantId}:${row.documentType}`)),
        ...cacheRows,
      ];
      localStorage.setItem(ATTACHMENT_PREVIEW_CACHE_KEY, JSON.stringify(next));
    } catch {
      // Best effort cache only.
    }
  };

  /**
   * Has this email already applied to this plantilla? The public portal has no
   * applicant account, so this can only run once the email is known (submit
   * time). It only exists to answer early: the database's unique index
   * (uq_applicants_one_per_plantilla) is the real guarantee.
   */
  const findExistingApplication = async (
    email: string,
    plantillaSlotId: string | null,
    itemNumber: string,
  ): Promise<{ referenceNo?: string } | null> => {
    const normalizedEmail = normalizeApplicantEmail(email);
    if (!normalizedEmail) return null;
    const lookup = async (column: string, value: string) =>
      (supabase as any)
        .from('applicants')
        .select('id, reference_no')
        .eq('email', normalizedEmail)
        .eq(column, value)
        .limit(1);
    try {
      let result = plantillaSlotId ? await lookup('plantilla_slot_id', plantillaSlotId) : null;
      // Before migration 20260928 there is no plantilla_slot_id column; the
      // plantilla's internal key on the application is the next best match.
      if (!result || result.error) {
        if (!itemNumber || itemNumber === 'UNASSIGNED') return null;
        result = await lookup('item_number', itemNumber);
      }
      const { data, error } = result;
      if (error || !Array.isArray(data) || data.length === 0) return null;
      return { referenceNo: String(data[0].reference_no ?? '').trim() || undefined };
    } catch {
      return null; // Never block a submission on this check.
    }
  };

  const submitOne = async (key: string): Promise<SubmitOutcome> => {
    const app = apps[key];
    const formData = app.formData;
    const files = app.files;
    const choice = choiceByKey.get(key);
    const applicationType: 'job' | 'promotion' = formData.application_type === 'promotion' ? 'promotion' : 'job';

    // The plantilla's internal key (never shown). Applications still match
    // postings on it. The applicant's tracking code is not this: the database
    // issues `reference_no` on insert.
    const plantillaItemNo = choice?.itemNumber || formData.item_number || '';
    const safe = (val: string | null | undefined) => (val == null ? '' : String(val));

    const existing = await findExistingApplication(formData.email, choice?.slotId ?? null, plantillaItemNo);
    if (existing) return { status: 'already', referenceNo: existing.referenceNo };

    // Summed across entries: years_of_experience is what scoring and qualification checks read.
    const totalYears = totalExperienceYears(formData.work_experiences ?? []);
    const storedExperiences = toStoredWorkExperiences(formData.work_experiences ?? []);

    const applicantPayload: Record<string, any> = {
      first_name: formData.first_name.trim(),
      middle_name: safe(formData.middle_name).trim() || null,
      last_name: formData.last_name.trim(),
      gender: safe(formData.gender) || null,
      address: safe(formData.address).trim(),
      contact_number: safe(formData.contact_number).trim(),
      email: formData.email.trim().toLowerCase(),
      position: safe(formData.position).trim(),
      // Position code only. A general application that isn't tied to a posting
      // has none — the column is NOT NULL, so it takes the table's sentinel.
      item_number: plantillaItemNo || 'UNASSIGNED',
      office: safe(POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office).trim(),
      is_pwd: formData.is_pwd,
      application_type: applicationType,
      status: 'New Application',
      years_of_experience: totalYears > 0 ? totalYears : null,
      // Every entry (migration 20261026120100). Dropped on the retry below if
      // that migration hasn't reached this database yet.
      work_experiences: storedExperiences,
      education_level: formData.education_attainment || null,
      // Persist degree/course + school (migration 20260812). Stripped on the
      // retry below if that migration hasn't run, so submission never breaks.
      education_degree: safe(formData.education_degree).trim() || null,
      education_school: safe(formData.education_school).trim() || null,
    };

    // This application's own plantilla (migration 20260928). The database
    // rejects a second application from the same email to the same plantilla.
    if (choice?.slotId) applicantPayload.plantilla_slot_id = choice.slotId;

    if (applicationType === 'promotion') {
      if (formData.employee_id) applicantPayload.employee_id = formData.employee_id;
      if (formData.current_position) applicantPayload.current_position = formData.current_position;
      if (formData.current_department) applicantPayload.current_department = formData.current_department;
      if (formData.current_division) applicantPayload.current_division = formData.current_division;
      if (formData.employee_username) applicantPayload.employee_username = formData.employee_username;
    }

    let applicantData;
    try {
      // reference_no is assigned by a DB trigger, so it can only be read back —
      // never sent. Selecting it fails outright if migration 20260923 has not
      // been applied, hence the narrower retry below.
      const insertWith = async (columns: string) =>
        await (supabase as any)
          .from('applicants')
          .insert(applicantPayload)
          .select(columns)
          .single();

      const isMissingColumn = (err: any, ...names: string[]) => {
        if (!err) return false;
        const code = String(err?.code ?? '');
        if (code !== '42703' && code !== 'PGRST204' && code !== '42P10') return false;
        const text = String(err?.message ?? '').toLowerCase();
        return names.some((name) => text.includes(name));
      };

      let { data, error } = await insertWith('id, item_number, reference_no');

      // Migration 20260928 not applied yet: file without the direct link (the
      // link table below still records the plantilla).
      if (isMissingColumn(error, 'plantilla_slot_id')) {
        delete applicantPayload.plantilla_slot_id;
        ({ data, error } = await insertWith('id, item_number, reference_no'));
      }

      if (isMissingColumn(error, 'reference_no')) {
        ({ data, error } = await insertWith('id, item_number'));
      }

      // Optional columns whose migrations may not have reached this database:
      // drop whichever one the error names and retry, in any order.
      const optionalColumns = [['education_degree', 'education_school'], ['work_experiences']];
      for (let attempt = 0; attempt < optionalColumns.length; attempt += 1) {
        const missing = optionalColumns.find((columns) => isMissingColumn(error, ...columns));
        if (!missing) break;
        missing.forEach((column) => delete applicantPayload[column]);
        ({ data, error } = await insertWith('id, item_number, reference_no'));
        if (isMissingColumn(error, 'reference_no')) {
          ({ data, error } = await insertWith('id, item_number'));
        }
      }

      if (error || !data?.id) {
        throw error || new Error('Empty ID returned from database');
      }
      applicantData = data;
    } catch (dbErr: any) {
      // Same applicant, same plantilla: not a failure to retry, just already on
      // file (e.g. submitted from another tab since the pre-check ran).
      if (isDuplicatePlantillaApplication(dbErr)) {
        const onFile = await findExistingApplication(formData.email, choice?.slotId ?? null, plantillaItemNo);
        return { status: 'already', referenceNo: onFile?.referenceNo };
      }
      logErrorForAdmin('Database insertion error during applicant record creation', dbErr, 'Database Submission');

      // Classify the failure so the applicant sees a useful message.
      const rawMessage = String(dbErr?.message ?? dbErr ?? '');
      const code = String(dbErr?.code ?? '');
      const lower = rawMessage.toLowerCase();

      let userMessage: string;
      if (code === '23505' || lower.includes('duplicate')) {
        userMessage = duplicatePlantillaMessage(choice ? choiceLabel(choice) : 'this plantilla');
      } else if (code === '23502' || lower.includes('null value') || lower.includes('not-null')) {
        userMessage = 'A required field is missing. Please go back and review the form.';
      } else if (
        code === '42703' ||
        code === 'PGRST204' ||
        lower.includes("could not find the") ||
        lower.includes('column') && lower.includes('does not exist')
      ) {
        userMessage = `Your application form is newer than the database schema. Please contact HR. (Schema: ${rawMessage.slice(0, 140)})`;
      } else if (code === '42501' || lower.includes('row-level security') || lower.includes('permission denied')) {
        userMessage = 'Permission denied by database security policies. Please contact HR. (RLS)';
      } else if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        userMessage = 'Network connection lost. Please check your internet and try again.';
      } else {
        userMessage = `Submission failed: ${rawMessage.slice(0, 200)}. Please try again, or contact HR if this keeps happening.`;
      }

      throw new Error(userMessage);
    }

    saveApplicantAppointmentType(applicantData.id, applicationType);

    // This application links to exactly one plantilla item: its own.
    if (choice?.slotId) {
      const linkResult = await linkApplicationToSlots(applicantData.id, [choice.slotId]);
      if (!linkResult.ok) {
        // The application itself is saved; a failed link is an HR follow-up,
        // not a reason to tell the applicant they failed.
        logErrorForAdmin(
          'Applicant saved but plantilla slot link failed',
          { applicantId: applicantData.id, slotId: choice.slotId, error: linkResult.error },
          'Database Submission',
        );
      }
    }

    // Each application uploads its own copy of every file.
    const syncedAttachments = await uploadFiles(supabase, applicantData.id, files);
    await cachePreviewableFiles(applicantData.id, files);

    syncApplicantSubmissionToRecruitment({
      applicantId: applicantData.id,
      firstName: formData.first_name,
      middleName: formData.middle_name,
      lastName: formData.last_name,
      email: formData.email,
      phone: formData.contact_number,
      address: formData.address,
      position: formData.position,
      department: POSITION_TO_DEPARTMENT_MAP[formData.position] || formData.office,
      isPwd: formData.is_pwd,
      applicationType,
      internalApplication: applicationType === 'promotion' && formData.employee_id
        ? {
            employeeId: formData.employee_id,
            currentPosition: formData.current_position,
            currentDepartment: formData.current_department,
            currentDivision: formData.current_division,
            employeeUsername: formData.employee_username,
          }
        : undefined,
      submittedAt: new Date().toISOString(),
      attachments: syncedAttachments,
      educationAttainment: formData.education_attainment || undefined,
      educationDegree: formData.education_degree || undefined,
      educationSchool: formData.education_school || undefined,
      workExperienceYears: totalYears > 0 ? totalYears : undefined,
      workExperiences: storedExperiences,
    });

    // Before migration 20260923 there is no reference_no; fall back to the row
    // id — still unique, still lets them find themselves.
    const referenceNo = String(applicantData.reference_no ?? '').trim() || String(applicantData.id ?? '');
    return { status: 'ok', referenceNo };
  };

  /** Keys still to send: everything not yet submitted or already on file. */
  const pendingKeys = keys.filter((key) => {
    const outcome = outcomes[key];
    return !outcome || outcome.status === 'failed';
  });
  const failedKeys = keys.filter((key) => outcomes[key]?.status === 'failed');
  const isRetry = failedKeys.length > 0;

  const handleSubmitAll = async () => {
    const targets = pendingKeys;
    if (targets.length === 0) return;
    setIsSubmitting(true);
    setOutcomes((prev) => ({ ...prev, ...Object.fromEntries(targets.map((key) => [key, { status: 'submitting' } as SubmitOutcome])) }));

    // Sequential, so one bad network moment fails as few items as possible and
    // uploads don't compete for bandwidth.
    const results: Record<string, SubmitOutcome> = {};
    for (const key of targets) {
      try {
        const outcome = await submitOne(key);
        results[key] = outcome;
        if (outcome.status === 'ok') markApplied(key, outcome.referenceNo);
        if (outcome.status === 'already') markApplied(key, outcome.referenceNo ?? '');
      } catch (error) {
        console.error('Submission error:', error);
        results[key] = {
          status: 'failed',
          error: describeActionFailure('submit this application', error).message,
        };
      }
      setOutcomes((prev) => ({ ...prev, [key]: results[key] }));
    }

    setIsSubmitting(false);
    setConfirmSubmit(false);

    const merged = { ...outcomes, ...results };
    const anyFailed = keys.some((key) => merged[key]?.status === 'failed');
    if (anyFailed) {
      // After the confirm modal has closed and handed focus back to its opener,
      // so the failure alert is what the applicant (and screen reader) lands on.
      window.setTimeout(() => {
        alertRef.current?.focus();
        alertRef.current?.scrollIntoView({ block: 'center' });
      }, 80);
      return;
    }

    setCompleted(keys.map((key) => ({ key, label: choiceByKey.get(key) ? choiceLabel(choiceByKey.get(key)!) : 'Your application', outcome: merged[key] })));
    clearDrafts();
    window.scrollTo({ top: 0 });
  };

  // ── Landing actions ───────────────────────────────────────────────────────
  const startGeneralApplication = () => {
    // Resume an unfinished general application instead of wiping it.
    const existing = posting === null ? apps[GENERAL_KEY] : undefined;
    setPosting(null);
    setChoices([]);
    setApps({ [GENERAL_KEY]: existing ?? blankApp({ ...INITIAL_FORM_DATA, application_type: 'job' }) });
    setActiveKey(GENERAL_KEY);
    setLockedPosition(false);
    setAuthenticatedEmployeeAccount(null);
    setEntryMode('wizard');
    setStep('fill');
    setFormPage(1);
    setOutcomes({});
    setCompleted(null);
  };

  /** Every vacancy goes through Step 1 (choose plantilla) on its Job Details page. */
  const openPosting = (job: JobPosting) => navigate(`/job-details/${encodeURIComponent(job.id)}`);

  const handleBackFromFill = () => {
    if (posting) {
      // Answers are kept in the draft store; Step 1 restores the selection.
      navigate(`/job-details/${encodeURIComponent(posting.id)}`);
      return;
    }
    setEntryMode('landing');
  };

  const handleOpenEmployeeAuth = () => {
    setEmployeeAuthError('');
    setShowEmployeeAuth(true);
  };

  const handleCloseEmployeeAuth = () => {
    setShowEmployeeAuth(false);
    setEmployeeNumber('');
    setEmployeePassword('');
    setShowEmployeePassword(false);
    setEmployeeAuthError('');
  };

  const handleEmployeeAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const enteredIdentifier = employeeNumber.trim();
    const enteredPassword = employeePassword;

    if (!enteredIdentifier || !enteredPassword.trim()) {
      setEmployeeAuthError('Please enter your employee number and password.');
      return;
    }

    const matchedByUsername = findEmployeePortalAccount(enteredIdentifier, enteredPassword);
    const matchedByEmployeeId = getEmployeePortalAccounts().find((account) => {
      const accountEmployeeId = normalizeAuthValue(String(account?.employee?.employeeId ?? ''));
      return accountEmployeeId === normalizeAuthValue(enteredIdentifier) && account.password === enteredPassword;
    });

    if (!matchedByUsername && !matchedByEmployeeId) {
      setEmployeeAuthError('Invalid employee credentials. Use your Employee Portal account credentials.');
      return;
    }

    const matchedAccount = matchedByUsername || matchedByEmployeeId;
    if (!matchedAccount) {
      setEmployeeAuthError('Unable to resolve the employee account for this promotional application.');
      return;
    }

    const matchedEmployeeNumber = String(matchedAccount?.employee?.employeeId ?? '').trim();

    // The applicant is an existing employee, so pull the whole profile and
    // prefill the form instead of making them retype it.
    const profile = await fetchEmployeeApplicationProfile(matchedEmployeeNumber);

    const [accountFirstName, ...remainingParts] = String(matchedAccount?.employee?.fullName ?? '')
      .trim()
      .split(/\s+/);
    const accountLastName = remainingParts.length > 0 ? remainingParts[remainingParts.length - 1] : '';
    const accountMiddleName = remainingParts.length > 1 ? remainingParts.slice(0, -1).join(' ') : '';

    const currentDepartment = profile?.currentDepartment || matchedAccount?.employee?.currentDepartment || '';
    const currentDivision = profile?.currentDivision || matchedAccount?.employee?.currentDivision || '';
    const currentPosition = profile?.currentPosition || matchedAccount?.employee?.currentPosition || '';

    setAuthenticatedEmployeeAccount(matchedAccount);
    setPosting(null);
    setChoices([]);
    setLockedPosition(false);
    setActiveKey(GENERAL_KEY);
    setEntryMode('wizard');
    setStep('fill');
    setFormPage(1);
    setOutcomes({});
    setCompleted(null);
    // Mark the lookup as done so the debounced prefill doesn't redo it.
    lastPrefilledRef.current[GENERAL_KEY] = { employeeId: matchedEmployeeNumber, username: matchedAccount?.username || '' };
    setApps({
      [GENERAL_KEY]: blankApp({
        ...INITIAL_FORM_DATA,
        application_type: 'promotion',

        // Identity & contact
        first_name: profile?.firstName || accountFirstName || '',
        middle_name: profile?.middleName || accountMiddleName,
        last_name: profile?.lastName || accountLastName,
        gender:
          profile?.sex ||
          (matchedAccount?.employee?.gender === 'Prefer not to say'
            ? ''
            : String(matchedAccount?.employee?.gender ?? '')),
        address: profile?.address || matchedAccount?.employee?.homeAddress || '',
        contact_number: profile?.contactNumber || matchedAccount?.employee?.mobileNumber || '',
        email: profile?.email || matchedAccount?.employee?.email || '',

        // Employment
        employee_id: matchedEmployeeNumber,
        current_position: currentPosition,
        current_department: currentDepartment,
        current_division: currentDivision,
        employee_username: matchedAccount?.username || '',
        office: currentDepartment,

        // Educational background — from employee_education
        education_attainment: profile?.educationAttainment || '',
        education_degree: profile?.educationDegree || '',
        education_school: profile?.educationSchool || '',

        // Work experience — entry 1 from employee_work_experience
        work_experiences: withProfileExperience([emptyWorkExperience()], profile),
      }),
    });

    // Tell them what happened. Silence here reads as "the form is just blank".
    setPrefillNotice({
      [GENERAL_KEY]: profile
        ? 'We filled in your details from your employee record. Review each field and update anything that has changed.'
        : "We couldn't find your employee record, so please fill in your details manually.",
    });

    setShowEmployeeAuth(false);
    setEmployeeAuthError('');
  };

  useEffect(() => {
    if (entryMode === 'landing') {
      loadJobPostings().then(() => {
        const jobs = getAuthoritativeJobPostings().filter(job => job.status === 'Active');
        setActiveJobs(jobs);
      });
    }
  }, [entryMode]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const stepDefs = isPostingFlow ? APPLY_STEPS : GENERAL_APPLY_STEPS;
  const stepIndex = (isPostingFlow ? 1 : 0) + (step === 'review' ? 1 : 0);
  const stripTitle = posting?.title
    || (active?.formData.application_type === 'promotion' ? 'Promotional application' : 'General application');

  const captionFor = (key: string) => {
    const choice = choiceByKey.get(key);
    const formData = apps[key]?.formData;
    const parts = [formData?.position || posting?.title];
    if (choice) parts.push(choiceLabel(choice));
    if (choice?.salaryGrade != null) parts.push(`SG ${choice.salaryGrade}`);
    return parts.filter(Boolean).join(' · ');
  };

  const filesFor = (app: AppState) => {
    if (app.formData.application_type === 'promotion') {
      return app.files.map((entry) => ({ key: entry.id, label: entry.file.name, fileName: entry.file.name, fileSize: entry.file.size }));
    }
    return REQUIRED_DOCUMENTS.map((doc) => {
      const uploaded = (app.files as Array<UploadedFile & { documentType?: string }>).find((entry) => entry.documentType === doc.type);
      return { key: doc.type, label: doc.label, fileName: uploaded?.file.name, fileSize: uploaded?.file.size };
    }).filter((entry) => Boolean(entry.fileName));
  };

  // ── Landing view (unchanged behaviour; vacancies now open Step 1) ─────────
  if (entryMode === 'landing' && !completed) {
    return (
      <div className="applicant-shell">
        <PublicTopBar />
        <main className="portal-landing">
          <div className="portal-landing-header">
            <h2>Welcome to Abyan HRIS Applicant Portal</h2>
            <p>Please begin your application below</p>
          </div>

          <div className="application-entry-card">
            <div className="entry-icon-wrap" aria-hidden="true">
              <UserPlus size={46} />
            </div>
            <h3>Job Application</h3>
            <p>Apply for a general position or select from the vacancies below</p>
            <Button className="entry-primary-button" onClick={startGeneralApplication}>
              Start General Application
            </Button>
          </div>

          {activeJobs.length > 0 && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm border border-slate-200 w-full max-w-2xl mx-auto">
              <h3 className="text-xl font-bold mb-4 text-slate-800 text-center">Currently Vacant Jobs</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {activeJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-blue-300 hover:shadow-md transition-all flex flex-col h-full text-left">
                    <h4 className="font-bold text-slate-900 leading-tight mb-1">{job.title}</h4>
                    <p className="text-sm text-slate-600 flex-1">{formatDivisionAndOffice(job.department, job.division)}</p>
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="text-xs text-slate-500 mb-3">{(job.plantillaSlots ?? []).length > 1 ? `${(job.plantillaSlots ?? []).length} plantillas` : "1 plantilla"}</p>
                      <button
                        onClick={() => openPosting(job)}
                        className="w-full flex items-center justify-center gap-2 rounded-full bg-white py-2.5 px-4 font-bold text-blue-600 border-[1.5px] border-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                      >
                        <Briefcase size={18} />
                        Apply for a Job
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="employee-promotion-button mt-8" onClick={handleOpenEmployeeAuth}>
            <Users size={18} />
            <span>I'm a current employee applying for promotion</span>
          </button>

          <div className="employee-note-card">
            <p>
              <strong>Note:</strong> Current employees must authenticate using their employee credentials to apply
              for promotional positions.
            </p>
          </div>

          <a href="/track" className="track-application-link">
            <FileText size={16} />
            <span>Track your existing application</span>
          </a>
        </main>

        <Dialog open={showEmployeeAuth} onClose={handleCloseEmployeeAuth}>
          <div className="employee-auth-dialog">
            <div className="employee-auth-icon" aria-hidden="true">
              <ShieldCheck size={34} />
            </div>
            <h3>Employee Authentication</h3>
            <p>Please login with your employee credentials to proceed with your promotional application.</p>

            <form onSubmit={handleEmployeeAuthSubmit} className="employee-auth-form">
              <label htmlFor="employee-number">Employee Number</label>
              <input
                id="employee-number"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="e.g., EMP-2024-001"
              />

              <label htmlFor="employee-password">Password</label>
              <div className="relative">
                <input
                  id="employee-password"
                  type={showEmployeePassword ? 'text' : 'password'}
                  value={employeePassword}
                  onChange={(event) => setEmployeePassword(event.target.value)}
                  placeholder="Enter your employee password"
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowEmployeePassword((prev) => !prev)}
                  aria-label={showEmployeePassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showEmployeePassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="employee-auth-hint">
                <p>
                  <strong>Use your Employee Portal credentials:</strong>
                </p>
                <p>Enter your Employee Number (or username) and your Employee Portal password.</p>
              </div>

              {employeeAuthError && <p className="employee-auth-error">{employeeAuthError}</p>}

              <div className="employee-auth-actions">
                <Button type="button" variant="outline" onClick={handleCloseEmployeeAuth}>
                  Cancel
                </Button>
                <Button type="submit">Login</Button>
              </div>
            </form>
          </div>
        </Dialog>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (completed) {
    const firstRef = completed
      .map((entry) => ('referenceNo' in entry.outcome ? entry.outcome.referenceNo : undefined))
      .find(Boolean);
    const submittedCount = completed.filter((entry) => entry.outcome.status === 'ok').length;
    return (
      <div className="abyan-ds af">
        <PublicTopBar />
        <main className="af-main">
          <div className="af-container">
            <section className="af-card af-success" aria-labelledby="af-success-title">
              <span className="af-success-icon" aria-hidden="true"><CheckCircle2 size={36} strokeWidth={1.75} /></span>
              <h1 className="af-title-m" id="af-success-title" tabIndex={-1} ref={(el) => el?.focus()}>
                {submittedCount === 0
                  ? "You've already applied"
                  : submittedCount === 1
                    ? 'Application submitted'
                    : `${submittedCount} applications submitted`}
              </h1>
              {sharedReferenceNo ? (
                <>
                  <p className="af-text" style={{ marginTop: 8, color: 'var(--neutral-600)' }}>
                    Your Reference No. for all your applications
                  </p>
                  <p className="af-ref-no" style={{ marginTop: 4 }}>{sharedReferenceNo}</p>
                  <p className="af-body-s" style={{ marginTop: 8, color: 'var(--neutral-600)' }}>
                    It stays the same for every plantilla you apply to. Keep it; you can track all your applications with
                    it or with your email address.
                    {earlierApplicationCount > 0 &&
                      ` Your ${earlierApplicationCount} earlier application${earlierApplicationCount === 1 ? ' is' : 's are'} under this same Reference No.`}
                  </p>
                </>
              ) : (
                <p className="af-text" style={{ marginTop: 8, color: 'var(--neutral-600)' }}>
                  Each plantilla item has its own Reference No. Keep them; you can track each application with it or with
                  your email address.
                </p>
              )}

              <ul className="af-refs">
                {completed.map((entry) => (
                  <li key={entry.key} className="af-card af-ref" style={{ padding: 16 }}>
                    <div style={{ minWidth: 0 }}>
                      <p className="af-headline">{entry.label}</p>
                      {!sharedReferenceNo && (
                        <>
                          <p className="af-body-s" style={{ marginTop: 4 }}>
                            {entry.outcome.status === 'already' ? 'Reference No. from your earlier application' : 'Reference No.'}
                          </p>
                          <p className="af-ref-no">
                            {'referenceNo' in entry.outcome && entry.outcome.referenceNo ? entry.outcome.referenceNo : 'On file'}
                          </p>
                        </>
                      )}
                    </div>
                    {/* §10: Submitted / Received = Info */}
                    <span className="badge badge-info">
                      <span className="badge-dot" aria-hidden="true" />
                      {entry.outcome.status === 'already' ? 'Already applied' : 'Submitted'}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="af-modal-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="btn btn-md btn-secondary" onClick={() => navigate('/')}>
                  Back to Home
                </button>
                <button
                  type="button"
                  className="btn btn-md btn-primary"
                  onClick={() => navigate('/track', { state: { referenceNo: firstRef } })}
                >
                  <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                  Track Application
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  // ── Steps 2 and 3 ─────────────────────────────────────────────────────────
  const activeApp = active ?? blankApp({ ...INITIAL_FORM_DATA });
  const activeType: 'job' | 'promotion' = activeApp.formData.application_type === 'promotion' ? 'promotion' : 'job';
  const otherKeys = keys.filter((key) => key !== currentKey);
  const failedList = failedKeys.map((key) => ({ key, error: (outcomes[key] as { error: string }).error }));
  // Live counts: an item drops off the alert as soon as its answers are fixed.
  const liveSummary = validationSummary
    .map((entry) => ({ key: entry.key, count: apps[entry.key] ? validateApp(apps[entry.key]).count : 0 }))
    .filter((entry) => entry.count > 0);

  return (
    <div className="abyan-ds af">
      <PublicTopBar />

      <div className="af-strip">
        <div className="af-container">
          <div className="af-strip-top">
            <p className="af-strip-title">{stripTitle}</p>
            <Stepper steps={stepDefs} current={stepIndex} />
          </div>

          {step === 'fill' && isPostingFlow && (
            <div role="tablist" aria-label="Plantilla applications" className="af-tabs">
              {keys.map((key, index) => {
                const choice = choiceByKey.get(key)!;
                const status = tabStatus(key);
                const { label, Icon } = TAB_STATUS[status];
                const selected = key === currentKey;
                return (
                  <button
                    key={key}
                    ref={(el) => { tabRefs.current[key] = el; }}
                    type="button"
                    role="tab"
                    id={`af-tab-${index}`}
                    aria-selected={selected}
                    aria-controls="af-tabpanel"
                    tabIndex={selected ? 0 : -1}
                    className="af-tab"
                    onClick={() => selectTab(key)}
                    onKeyDown={(event) => onTabKeyDown(event, index)}
                  >
                    <span>{choiceLabel(choice)}</span>
                    <span className="af-tab-status" data-status={status}>
                      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <main className="af-main">
        <div className="af-container">
          {step === 'fill' ? (
            <>
              {liveSummary.length > 0 && (
                <div className="af-alert af-alert-error" role="alert" style={{ marginBottom: 24 }}>
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="af-alert-title">Some answers need your attention</p>
                    <div className="af-alert-body">
                      Fix these before you can review your application{keys.length > 1 ? 's' : ''}:
                      <ul>
                        {liveSummary.map((entry) => (
                          <li key={entry.key}>
                            <button type="button" className="af-textbtn" style={{ minHeight: 28, padding: 0 }} onClick={() => {
                              focusInvalidRef.current = true;
                              selectTab(entry.key);
                              const result = validateApp(apps[entry.key]);
                              setFormPage(firstPageWithErrors(result.errors, result.fileError) ?? formPage);
                            }}>
                              {choiceByKey.get(entry.key) ? choiceLabel(choiceByKey.get(entry.key)!) : 'Your application'}
                            </button>
                            {': '}
                            {entry.count} {entry.count === 1 ? 'issue' : 'issues'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div
                role={isPostingFlow ? 'tabpanel' : undefined}
                id="af-tabpanel"
                aria-labelledby={isPostingFlow ? `af-tab-${keys.indexOf(currentKey)}` : undefined}
                ref={panelRef}
              >
                <div className="af-form-head">
                  <div style={{ minWidth: 0 }}>
                    <h2 className="af-title-m" tabIndex={-1} ref={headingRef}>
                      {isPostingFlow ? `Application for ${labelFor(currentKey)}` : 'Your application'}
                    </h2>
                    <p className="af-caption">{captionFor(currentKey)}</p>
                  </div>

                  {otherKeys.length > 0 && (
                    <div className="af-menu-wrap">
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        aria-haspopup="menu"
                        aria-expanded={copyMenuOpen}
                        onClick={() => setCopyMenuOpen((open) => !open)}
                      >
                        <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
                        Copy Answers From…
                      </button>
                      {copyMenuOpen && (
                        <ul className="af-menu" role="menu" onKeyDown={(event) => { if (event.key === 'Escape') setCopyMenuOpen(false); }}>
                          {otherKeys.map((key) => (
                            <li key={key} role="none">
                              <button type="button" role="menuitem" onClick={() => requestCopy(key)} autoFocus={key === otherKeys[0]}>
                                {choiceLabel(choiceByKey.get(key)!)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                <div aria-live="polite">
                  {copyNotice && (
                    <div className="af-alert af-alert-success" style={{ marginBottom: 24 }}>
                      <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />
                      <p className="af-alert-body">{copyNotice}</p>
                    </div>
                  )}
                  {prefillNotice[currentKey] && activeType === 'promotion' && (
                    <div className="af-alert af-alert-info" role="status" style={{ marginBottom: 24 }}>
                      <Info size={20} strokeWidth={1.75} aria-hidden="true" />
                      <p className="af-alert-body">{prefillNotice[currentKey]}</p>
                    </div>
                  )}
                </div>

                {/* One independent form per plantilla. `key` remounts the
                    sections on tab switch; the answers live in `apps`, so
                    switching tabs never loses data. */}
                <div className="af-pages" aria-live="polite">
                  <p className="af-caption">
                    <span className="af-pages-count">Page {formPage} of {FORM_PAGE_COUNT}</span>
                    {' · '}
                    {FORM_PAGES[formPage - 1].title}
                  </p>
                  <div
                    className="af-progress"
                    role="progressbar"
                    aria-label="Application pages"
                    aria-valuemin={1}
                    aria-valuemax={FORM_PAGE_COUNT}
                    aria-valuenow={formPage}
                  >
                    <span style={{ width: `${(formPage / FORM_PAGE_COUNT) * 100}%` }} />
                  </div>
                </div>

                <div className="af-form-grid" key={`${currentKey}-${formPage}`}>
                  {formPage < FORM_PAGE_COUNT && (
                  <ApplicantAssessmentForm
                    page={formPage}
                    idPrefix={`af-${keys.indexOf(currentKey)}`}
                    formData={activeApp.formData}
                    errors={activeApp.errors}
                    onChange={handleFormChangeFor(currentKey)}
                    applicationType={activeType}
                    isEmployee={Boolean(authenticatedEmployeeAccount?.employee?.employeeId)}
                    isLoadingPrefill={isLoadingPrefill}
                    onApplicationTypeChange={(next) => handleApplicationTypeChange(currentKey, next)}
                    lockedPosition={lockedPosition}
                    plantillaName={choiceByKey.get(currentKey) ? choiceLabel(choiceByKey.get(currentKey)!) : ""}
                    afterEducation={
                      <AttachmentsUploadForm
                        part="govId"
                        idPrefix={`af-${keys.indexOf(currentKey)}`}
                        files={activeApp.files}
                        onFilesChange={handleFilesChangeFor(currentKey)}
                        applicationType={activeType}
                        formData={activeApp.formData}
                        onChange={handleFormChangeFor(currentKey)}
                        errors={activeApp.errors}
                      />
                    }
                  />
                  )}
                  {formPage === FORM_PAGE_COUNT && (
                  <AttachmentsUploadForm
                    part="documents"
                    idPrefix={`af-${keys.indexOf(currentKey)}`}
                    files={activeApp.files}
                    onFilesChange={handleFilesChangeFor(currentKey)}
                    error={activeApp.fileError}
                    plantillaName={choiceByKey.get(currentKey) ? choiceLabel(choiceByKey.get(currentKey)!) : ""}
                    applicationType={activeType}
                    formData={activeApp.formData}
                    onChange={handleFormChangeFor(currentKey)}
                    errors={activeApp.errors}
                  />
                  )}
                </div>
              </div>

              <div className="af-actionbar">
                <button type="button" className="btn btn-md btn-secondary" onClick={handleBackPage}>
                  <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                  Back
                </button>
                {formPage < FORM_PAGE_COUNT ? (
                  <button type="button" className="btn btn-md btn-primary" onClick={handleNextPage}>
                    Next
                    <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : (
                  <button type="button" className="btn btn-md btn-primary" onClick={handleReview}>
                    Continue to Review
                    <ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="af-form-head">
                <div>
                  <h2 className="af-title-m" tabIndex={-1} ref={headingRef}>
                    Review your application{keys.length > 1 ? 's' : ''}
                  </h2>
                  <p className="af-caption">
                    Check each application before you submit. Use Edit to change anything.
                  </p>
                </div>
              </div>

              {failedList.length > 0 && !isSubmitting && (
                <div className="af-alert af-alert-error" role="alert" tabIndex={-1} ref={alertRef} style={{ marginBottom: 24 }}>
                  <AlertCircle size={20} strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <p className="af-alert-title">
                      {failedList.length === 1 ? '1 application was not submitted' : `${failedList.length} applications were not submitted`}
                    </p>
                    <div className="af-alert-body">
                      The others went through. Your details are still here. Fix the cause below, then retry only the failed ones:
                      <ul>
                        {failedList.map((entry) => (
                          <li key={entry.key}><strong>{labelFor(entry.key)}:</strong> {entry.error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="af-review">
                {keys.map((key) => {
                  const app = apps[key] ?? blankApp({ ...INITIAL_FORM_DATA });
                  const fd = app.formData;
                  const outcome = outcomes[key];
                  const docs = filesFor(app);
                  const choice = choiceByKey.get(key);
                  return (
                    <details key={key} className="af-card af-review-card" open>
                      <summary>
                        <div style={{ minWidth: 0 }}>
                          <p className="af-title-s">
                            {isPostingFlow ? `Application for ${labelFor(key)}` : 'Your application'}
                          </p>
                          <p className="af-caption">{captionFor(key)}</p>
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          {outcome?.status === 'submitting' && (
                            <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />Submitting</span>
                          )}
                          {outcome?.status === 'ok' && (
                            <span className="badge badge-info"><span className="badge-dot" aria-hidden="true" />Submitted · {outcome.referenceNo}</span>
                          )}
                          {outcome?.status === 'already' && (
                            <span className="badge badge-info"><span className="badge-dot" aria-hidden="true" />Already applied</span>
                          )}
                          {outcome?.status === 'failed' && (
                            <span className="badge badge-error"><span className="badge-dot" aria-hidden="true" />Not submitted</span>
                          )}
                          {(!outcome || outcome.status === 'failed') && (
                            <button
                              type="button"
                              className="btn btn-sm btn-secondary"
                              disabled={isSubmitting}
                              onClick={(event) => {
                                event.preventDefault();
                                setActiveKey(key);
                                setStep('fill');
                                setFormPage(1);
                                window.scrollTo({ top: 0 });
                              }}
                              aria-label={`Edit ${isPostingFlow ? labelFor(key) : 'your application'}`}
                            >
                              <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                              Edit
                            </button>
                          )}
                        </span>
                      </summary>
                      <div className="af-review-body">
                        <dl className="af-kv">
                          {fd.application_type === 'promotion' && (
                            <>
                              <div><dt>Employee ID</dt><dd>{fd.employee_id || '-'}</dd></div>
                              <div><dt>Current Position</dt><dd>{fd.current_position || '-'}</dd></div>
                              <div><dt>Current Department</dt><dd>{fd.current_department || '-'}</dd></div>
                            </>
                          )}
                          <div><dt>Application Type</dt><dd>{fd.application_type === 'promotion' ? 'Promotional' : 'Original'}</dd></div>
                          <div><dt>Name</dt><dd>{[fd.first_name, fd.middle_name, fd.last_name].filter(Boolean).join(' ') || '-'}</dd></div>
                          <div><dt>Gender</dt><dd>{fd.gender || '-'}</dd></div>
                          <div><dt>Email Address</dt><dd>{fd.email || '-'}</dd></div>
                          <div><dt>Contact Number</dt><dd>{fd.contact_number || '-'}</dd></div>
                          <div><dt>Address</dt><dd>{fd.address || '-'}</dd></div>
                          <div><dt>Position Applied For</dt><dd>{fd.position || '-'}</dd></div>
                          <div><dt>Department</dt><dd>{fd.office || '-'}</dd></div>
                          <div><dt>Plantilla</dt><dd>{choice ? choiceLabel(choice) : 'Not tied to a plantilla'}</dd></div>
                          <div><dt>PWD Status</dt><dd>{fd.is_pwd ? 'Yes' : 'No'}</dd></div>
                          <div>
                            <dt>Educational Background</dt>
                            <dd>{[fd.education_attainment, fd.education_degree].filter(Boolean).join(', ') || '-'}</dd>
                          </div>
                          <div>
                            <dt>Relevant Work Experience</dt>
                            <dd>
                              {(() => {
                                const entries = toStoredWorkExperiences(fd.work_experiences ?? []);
                                if (entries.length === 0) return '-';
                                const total = Math.round(totalExperienceYears(fd.work_experiences) * MONTHS_PER_YEAR);
                                return (
                                  <>
                                    {entries.map((e, i) => (
                                      <span key={i} className="af-review-line">
                                        {entries.length > 1 && `${i + 1}. `}
                                        {formatDuration(e.years, e.months)}
                                        {e.position ? ` · ${e.position}` : ''}
                                        {e.company ? `, ${e.company}` : ''}
                                      </span>
                                    ))}
                                    {entries.length > 1 && (
                                      <span className="af-review-line af-review-total">
                                        Total {formatDuration(Math.floor(total / MONTHS_PER_YEAR), total % MONTHS_PER_YEAR)}
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </dd>
                          </div>
                          {fd.gov_id_type && (
                            <div>
                              <dt>Government Issued ID Type</dt>
                              <dd>{fd.gov_id_type}{fd.gov_id_expiration ? ` (expires ${new Date(fd.gov_id_expiration).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })})` : ''}</dd>
                            </div>
                          )}
                          <div><dt>Reference No.</dt><dd>{outcome?.status === 'ok' ? outcome.referenceNo : 'Assigned when you submit'}</dd></div>
                          {fd.application_type === 'promotion' && authenticatedEmployeeAccount && (
                            <div><dt>Linked Employee Account</dt><dd>{authenticatedEmployeeAccount.employee.fullName} ({authenticatedEmployeeAccount.username})</dd></div>
                          )}
                        </dl>

                        <p className="af-caps" style={{ marginTop: 20 }}>Attached files ({docs.length})</p>
                        {docs.length > 0 ? (
                          <ul className="af-list">
                            {docs.map((doc) => (
                              <li key={doc.key}>
                                <CircleCheck size={16} strokeWidth={1.75} aria-hidden="true" />
                                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                                  {doc.label !== doc.fileName ? `${doc.label}: ` : ''}{doc.fileName}
                                  <span className="af-body-s" style={{ display: 'inline', marginLeft: 6 }}>{formatFileSize(doc.fileSize)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="af-body-m">No documents uploaded yet.</p>
                        )}
                      </div>
                    </details>
                  );
                })}

                <section className="af-card" aria-labelledby="af-declaration-title">
                  <h3 className="af-title-s" id="af-declaration-title" style={{ marginBottom: 12 }}>Declaration</h3>
                  <label className="af-declaration">
                    <input
                      type="checkbox"
                      checked={declared}
                      onChange={(event) => setDeclared(event.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="af-text">
                      I hereby certify that all information provided in {keys.length > 1 ? 'these applications' : 'this application'} is
                      true and correct to the best of my knowledge. I understand that any false statement may result in the
                      rejection of my application or termination of employment if discovered after hiring.
                    </span>
                  </label>
                </section>
              </div>

              <div className="af-actionbar">
                <button type="button" className="btn btn-md btn-secondary" onClick={() => setStep('fill')} disabled={isSubmitting}>
                  <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-md btn-primary"
                  onClick={() => setConfirmSubmit(true)}
                  disabled={!declared || isSubmitting || pendingKeys.length === 0}
                  aria-describedby={!declared ? 'af-declaration-title' : undefined}
                >
                  <Send size={18} strokeWidth={1.75} aria-hidden="true" />
                  {isRetry
                    ? `Retry ${failedKeys.length} Failed`
                    : pendingKeys.length === 1
                      ? 'Submit Application'
                      : `Submit ${pendingKeys.length} Applications`}
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <ConfirmModal
        open={confirmSubmit}
        title={
          isRetry
            ? `Retry ${failedKeys.length} application${failedKeys.length === 1 ? '' : 's'}?`
            : pendingKeys.length === 1
              ? 'Submit application?'
              : `Submit ${pendingKeys.length} applications?`
        }
        confirmLabel={isRetry ? 'Retry' : 'Submit'}
        busy={isSubmitting}
        onConfirm={() => void handleSubmitAll()}
        onCancel={() => setConfirmSubmit(false)}
      >
        {pendingKeys.length === 1
          ? 'Your application will be sent to HR. You can’t edit it after submitting.'
          : `Each plantilla item is filed as its own application, all under one Reference No. You can’t edit them after submitting.`}
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(pendingCopy)}
        title={pendingCopy ? `Replace your answers for ${labelFor(pendingCopy.to)}?` : ''}
        confirmLabel="Replace Answers"
        onConfirm={() => pendingCopy && copyAnswers(pendingCopy.from, pendingCopy.to)}
        onCancel={() => setPendingCopy(null)}
      >
        {pendingCopy
          ? `This copies every answer and uploaded file from ${labelFor(pendingCopy.from)} into ${labelFor(pendingCopy.to)}, overwriting what you've entered there. The two applications stay separate afterwards.`
          : null}
      </ConfirmModal>
    </div>
  );
};
