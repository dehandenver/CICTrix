import { supabase } from './supabase';
import { hireApplicant } from './api/employeesApi';
import { normalizeApplicationType } from './api/applicantScores';
import { completePromotionalAppointment, PromotionalAppointmentError } from './api/promotionalHiring';
import type { PromotionalAppointmentResult } from './api/promotionalHiring';
import { getApplicants, saveApplicants, saveNewlyHired } from './recruitmentData';
import { assignApplicantToSlot, fetchApplicantSlotLinks, fetchSlotsByJobPosting } from './plantillaSlots';
import { plantillaLabel, normalizeApplicantEmail } from './plantillaRules';
import { createPassword, upsertEmployeePortalAccount } from './employeePortalData';
import { sendEmail } from './email';
import { isTerminal, normalizeStatus } from './api/applicantStatus';
import { formatDisplayDate } from './scheduleSelection';
import { describeActionFailure } from './friendlyErrors';
import type { NewlyHired, PlantillaSlot } from '../types/recruitment.types';

/**
 * The For Hiring → contract signing → credentials flow
 * (docs/plans/2026-10-21-hire-reservation-and-credentials.md).
 *
 * Selecting reserves a plantilla (plantillaSlots.reserveSlotForApplicant).
 * This module reads who is reserved or archived, and turns a reserved
 * applicant into an employee once they have signed.
 */

const client = supabase as any;

export const isUuid = (id: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const RESERVED_STATUS = 'For Contract Signing';

/** Default time an applicant gets to report for contract signing. */
export const SIGNING_WINDOW_DAYS = 7;

export const DEFAULT_SIGNING_INSTRUCTIONS =
  'Please report to the Office of the City Human Resource Management Officer (CHRMO), Iloilo City Hall, '
  + 'Monday to Friday, 8:00 AM–5:00 PM, for contract signing and verification of your documents. '
  + 'Bring a valid government-issued ID and the original copies of the documents you submitted.';

const fullNameOf = (row: any): string =>
  [row?.first_name, row?.middle_name, row?.last_name].filter(Boolean).join(' ').trim()
  || String(row?.full_name ?? '').trim()
  || String(row?.email ?? '').split('@')[0]
  || '—';

const slotIndex = async (): Promise<Map<string, PlantillaSlot>> => {
  const index = new Map<string, PlantillaSlot>();
  (await fetchSlotsByJobPosting()).forEach((slots) => slots.forEach((slot) => index.set(slot.id, slot)));
  return index;
};

// ─── Other applications of the same person ─────────────────────────────────

export interface OtherApplication {
  id: string;
  position: string;
  office: string;
  plantilla: string;
  status: string;
}

/**
 * The person's other applications that are still open, for the "also applied
 * to other positions" notice. Identity is the normalised email, as everywhere
 * else in recruitment.
 */
export const fetchOtherOpenApplications = async (
  email: string,
  excludeApplicantId: string,
): Promise<OtherApplication[] | null> => {
  const normalized = normalizeApplicantEmail(email);
  if (!normalized) return [];
  try {
    const [{ data, error }, slots] = await Promise.all([
      client
        .from('applicants')
        .select('id, position, office, status, plantilla_slot_id, deleted_at')
        .ilike('email', normalized),
      slotIndex(),
    ]);
    if (error) throw error;
    return (data ?? [])
      .filter((row: any) => String(row.id) !== excludeApplicantId && !row.deleted_at)
      .filter((row: any) => {
        const status = normalizeStatus(row.status);
        return status ? !isTerminal(status) : true;
      })
      .map((row: any) => {
        const slot = row.plantilla_slot_id ? slots.get(String(row.plantilla_slot_id)) : undefined;
        return {
          id: String(row.id),
          position: String(row.position ?? '—'),
          office: String(row.office || row.department || '—'),
          plantilla: slot ? plantillaLabel(slot) : '',
          status: String(row.status ?? ''),
        };
      });
  } catch (err) {
    console.warn('[hiringFlow] other applications lookup failed:', err);
    // null, not []: "couldn't check" must not read as "has no other applications".
    return null;
  }
};

// ─── For Hiring: which plantilla each application is for ───────────────────

export interface HiringContext {
  ok: boolean;
  /** The plantilla each application is for, by applicant id. */
  slotByApplicant: Map<string, PlantillaSlot>;
  /** When RSP last revoked this applicant's selection ("did not report"). */
  revokedAt: Map<string, string>;
  error?: unknown;
}

export const fetchHiringContext = async (applicantIds: string[]): Promise<HiringContext> => {
  const slotByApplicant = new Map<string, PlantillaSlot>();
  const revokedAt = new Map<string, string>();
  if (applicantIds.length === 0) return { ok: true, slotByApplicant, revokedAt };
  try {
    const validUuids = applicantIds.filter(isUuid);
    const applicantQuery = validUuids.length > 0
      ? client.from('applicants').select('id, plantilla_slot_id, selection_revoked_at').in('id', validUuids)
      : Promise.resolve({ data: [], error: null });

    const [slots, links, applicantsRes] = await Promise.all([
      slotIndex(),
      fetchApplicantSlotLinks(validUuids),
      applicantQuery,
    ]);

    if (applicantsRes.error) throw applicantsRes.error;

    (applicantsRes.data ?? []).forEach((row: any) => {
      const id = String(row.id);
      if (row.selection_revoked_at) revokedAt.set(id, String(row.selection_revoked_at));
      const own = row.plantilla_slot_id ? slots.get(String(row.plantilla_slot_id)) : undefined;
      // Older applications only have the link table.
      const linked = (links.get(id) ?? []).map((link) => slots.get(link.slotId)).find(Boolean);
      const slot = own ?? linked;
      if (slot) slotByApplicant.set(id, slot);
    });
    return { ok: true, slotByApplicant, revokedAt };
  } catch (err) {
    console.warn('[hiringFlow] hiring context lookup failed:', err);
    return { ok: false, slotByApplicant, revokedAt, error: err };
  }
};

// ─── Reserved: waiting for contract signing ────────────────────────────────

export interface ReservedApplicant {
  id: string;
  fullName: string;
  email: string;
  referenceNo: string;
  position: string;
  department: string;
  slotId: string | null;
  plantilla: string;
  /** Recorded on the Newly Hired row so reports name the exact item. */
  slotItemNumber?: string;
  slotNumber?: number;
  signingDeadline: string | null;
  interviewScore: number | null;
  applicationType: 'job' | 'promotion';
  /** The applicant's existing employee number for promotions; null for external applicants. */
  employeeNumber: string | null;
}

/** Reserved applicants awaiting credentials. Throws when the read fails, so the page can say so instead of showing "none". */
export const fetchReservedApplicants = async (): Promise<ReservedApplicant[]> => {
  try {
    const [{ data, error }, slots] = await Promise.all([
      client
        .from('applicants')
        // Only columns public.applicants actually has. Naming one it lacks
        // makes PostgREST reject the whole select with 42703, which is how
        // this page came to show "The server couldn't return this data" —
        // full_name, department and total_score are not columns of this
        // table. fullNameOf already builds the name from the parts, and
        // `office` carries the department.
        .select('id, first_name, middle_name, last_name, email, reference_no, position, office, plantilla_slot_id, signing_deadline, application_type, employee_id, deleted_at')
        .eq('status', RESERVED_STATUS),
      slotIndex(),
    ]);
    if (error) throw error;
    // A plantilla knows who it is held for even when the application row
    // predates plantilla_slot_id.
    const slotByHolder = new Map<string, PlantillaSlot>();
    slots.forEach((slot) => { if (slot.reservedByApplicantId) slotByHolder.set(slot.reservedByApplicantId, slot); });

    return (data ?? [])
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => {
        const id = String(row.id);
        const slot = slotByHolder.get(id) ?? (row.plantilla_slot_id ? slots.get(String(row.plantilla_slot_id)) : undefined);
        const isPromotion = normalizeApplicationType(row.application_type) === 'promotional';
        return {
          id,
          fullName: fullNameOf(row),
          email: String(row.email ?? ''),
          referenceNo: String(row.reference_no ?? ''),
          position: String(row.position ?? ''),
          department: String(row.office || row.department || 'No Department'),
          slotId: slot?.id ?? null,
          plantilla: slot ? plantillaLabel(slot) : '',
          slotItemNumber: slot?.itemNumber,
          slotNumber: slot?.slotNumber,
          signingDeadline: row.signing_deadline ? String(row.signing_deadline) : slot?.signingDeadline ?? null,
          // Not on this table. The interview score lives with the evaluation,
          // and ForHiringPage resolves it from the score snapshot; this page
          // only lists who is awaiting credentials, so it does not read it.
          interviewScore: null,
          applicationType: isPromotion ? 'promotion' as const : 'job' as const,
          employeeNumber: isPromotion ? String(row.employee_id ?? '').trim() || null : null,
        };
      });
  } catch (err) {
    console.warn('[hiringFlow] reserved applicants lookup failed:', err);
    throw err;
  }
};

// ─── Archived: the plantilla went to someone else ──────────────────────────

export interface ArchivedApplicant {
  id: string;
  fullName: string;
  email: string;
  referenceNo: string;
  position: string;
  department: string;
  plantilla: string;
  archivedAt: string;
}

export const fetchArchivedApplicants = async (): Promise<ArchivedApplicant[]> => {
  try {
    const [{ data, error }, slots] = await Promise.all([
      client
        .from('applicants')
        .select('id, first_name, middle_name, last_name, email, reference_no, position, office, plantilla_slot_id, archived_at, deleted_at')
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false }),
      slotIndex(),
    ]);
    if (error) throw error;
    return (data ?? [])
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => {
        const slot = row.plantilla_slot_id ? slots.get(String(row.plantilla_slot_id)) : undefined;
        return {
          id: String(row.id),
          fullName: fullNameOf(row),
          email: String(row.email ?? ''),
          referenceNo: String(row.reference_no ?? ''),
          position: String(row.position ?? ''),
          department: String(row.office || row.department || '—'),
          plantilla: slot ? plantillaLabel(slot) : '',
          archivedAt: String(row.archived_at),
        };
      });
  } catch (err) {
    console.warn('[hiringFlow] archived applicants lookup failed:', err);
    return [];
  }
};

// ─── Generate: hire, fill, issue credentials ───────────────────────────────

export interface CredentialResult {
  fullName: string;
  employeeId: string;
  tempPassword: string;
  email: string;
  emailSent: boolean;
  position: string;
  department: string;
  plantilla: string;
}

/** A promotion the database completed. The employee keeps their account, so there is no password. */
export interface PromotionOutcome extends PromotionalAppointmentResult {
  fullName: string;
  position: string;
  department: string;
  plantilla: string;
}

export interface GenerateOutcome {
  /** Only newly issued external credentials. */
  credentials: CredentialResult[];
  /** Completed promotions, including replays of ones already completed. */
  promotions: PromotionOutcome[];
  /** "<name>: <reason>" for each applicant that could not be fully processed. */
  failures: string[];
}

/** Plain next step for a promotion that did not complete. */
const promotionFailureMessage = (fullName: string, err: unknown): string => {
  if (err instanceof PromotionalAppointmentError) {
    const nextStep = err.retryable ? ' It is safe to try again; a repeat will not promote them twice.' : '';
    return `${fullName}: not promoted. ${err.message}${nextStep}`;
  }
  return `${fullName}: not promoted. Something went wrong before the promotion finished. It is safe to try again; a repeat will not promote them twice.`;
};

/**
 * Process each signed applicant.
 *
 * External applicants are hired: employee record, plantilla filled (which
 * archives everyone else on it in the database), portal account, Newly Hired
 * row and the credentials email.
 *
 * Promotions go through one database transaction (completePromotionalAppointment)
 * that moves the employee into the plantilla and fills it. They get no new
 * account, password, email or Newly Hired row, so the employee's original hire
 * information and sign-in stay as they were. A promotion failure is reported
 * per row and never retried here.
 */
export const generateEmployeeCredentials = async (rows: ReservedApplicant[]): Promise<GenerateOutcome> => {
  const credentials: CredentialResult[] = [];
  const promotions: PromotionOutcome[] = [];
  const failures: string[] = [];
  const newlyHiredRecords: NewlyHired[] = [];
  const hiredAt = new Date().toISOString();

  for (const row of rows) {
    if (row.applicationType === 'promotion') {
      try {
        const result = await completePromotionalAppointment(row.id);
        promotions.push({
          ...result,
          fullName: row.fullName,
          position: row.position,
          department: row.department,
          plantilla: row.plantilla,
        });
      } catch (err) {
        console.error(`[hiringFlow] promotion failed for ${row.id}:`, err);
        failures.push(promotionFailureMessage(row.fullName, err));
        continue;
      }
      // The transaction already marked it Hired; this only keeps the local cache
      // in step, so a cache failure must not report the promotion as failed.
      try {
        saveApplicants(getApplicants().map((a) => (a.id === row.id ? { ...a, status: 'Hired' as any } : a)));
      } catch (err) {
        console.warn(`[hiringFlow] applicants cache update failed for ${row.id}:`, err);
      }
      continue;
    }

    let employeeId = '';
    try {
      const employeeRow = await hireApplicant(row.id);
      employeeId = employeeRow?.employee_id || '';
    } catch (err: any) {
      console.error(`[hiringFlow] hire failed for ${row.id}:`, err);
      const failure = describeActionFailure('hire this applicant', err);
      failures.push(`${row.fullName}: not hired. ${failure.message} ${failure.nextStep}`);
      continue;
    }

    // Filling the plantilla closes it and archives the other applicants on it.
    // Reported but not fatal: the employee record already exists.
    if (row.slotId) {
      const placement = await assignApplicantToSlot(row.slotId, row.id);
      if (!placement.ok) {
        console.error(`[hiringFlow] plantilla fill failed for ${row.id}:`, placement.error);
        failures.push(`${row.fullName}: hired, but the plantilla was not marked filled. Mark it filled from the job post.`);
      }
    } else {
      failures.push(`${row.fullName}: hired, but the application is not linked to a plantilla, so none was filled`);
    }

    const tempPassword = createPassword();
    const account = await upsertEmployeePortalAccount({
      id: `portal-${employeeId}`,
      username: employeeId,
      password: tempPassword,
      mustChangePassword: true,
      employee: {
        employeeId,
        fullName: row.fullName,
        email: row.email,
        position: row.position,
        department: row.department,
        status: 'Active',
        hireDate: hiredAt.split('T')[0],
      } as any,
    });
    if (!account.ok) {
      failures.push(`${row.fullName}: hired, but the sign-in account was not saved, so these credentials won't work yet. Reset their password from Accounts to create it.`);
    }

    saveApplicants(getApplicants().map((a) => (a.id === row.id ? { ...a, status: 'Hired' as any } : a)));

    // The hire itself carries DATE HIRED for the Office Directory and the
    // Newly Hired page; created_at on the application is when they applied.
    const [firstName = '', ...restName] = row.fullName.trim().split(/\s+/);
    newlyHiredRecords.push({
      id: `nh-${employeeId}`,
      applicantId: row.id,
      rankingRank: 0,
      rankingScore: row.interviewScore ?? 0,
      employeeInfo: {
        firstName,
        lastName: restName.join(' '),
        email: row.email,
        phone: '',
        emergencyContact: { name: '', relationship: '', phone: '' },
        governmentIds: {},
      },
      position: row.position,
      department: row.department,
      plantillaItemNumber: row.slotItemNumber,
      plantillaSlotNumber: row.slotNumber,
      employmentType: 'Permanent',
      dateHired: hiredAt,
      expectedStartDate: hiredAt,
      status: 'Pending Onboarding',
      onboardingProgress: 0,
      onboardingChecklist: [],
      documents: [],
      notes: [],
      timeline: [],
      employeeId,
    } as NewlyHired);

    let emailSent = false;
    const recipient = row.email.trim();
    if (recipient) {
      try {
        await sendEmail({
          to: recipient,
          subject: 'Your ABYAN HRIS account is ready',
          body:
            `Hello ${row.fullName},\n\n` +
            `Your employee account has been created in the ABYAN HRIS.\n\n` +
            `Position  : ${row.position || '—'}\n` +
            `Department: ${row.department || '—'}\n\n` +
            `Employee ID       : ${employeeId}\n` +
            `Temporary password: ${tempPassword}\n\n` +
            `Please log in to the Employee Portal and change your password before accessing any module.\n` +
            `\nIf you did not expect this email, please contact HR immediately.\n`,
          employeeId,
          template: 'employee_credentials',
        });
        emailSent = true;
      } catch (err) {
        // Shown on the result as "Print instead"; the RSP can hand them over on paper.
        console.warn(`[hiringFlow] credentials email failed for ${row.id}:`, err);
      }
    }

    credentials.push({
      fullName: row.fullName,
      employeeId,
      tempPassword,
      email: recipient,
      emailSent,
      position: row.position,
      department: row.department,
      plantilla: row.plantilla,
    });
  }

  if (newlyHiredRecords.length > 0) {
    // Credentials are already issued; only the Newly Hired listing is behind.
    const saved = await saveNewlyHired(newlyHiredRecords);
    if (!saved.ok) {
      failures.push(`${saved.failed} newly hired record${saved.failed === 1 ? '' : 's'} didn't save, so the Newly Hired page may not list ${saved.failed === 1 ? 'it' : 'them'} yet. The credentials above still work.`);
    }
  }

  window.dispatchEvent(new Event('cictrix:applicants-updated'));
  return { credentials, promotions, failures };
};

// ─── Printout: cut-out cards (option A, docs/mockups/2026-10-21-hire-reservation-flow.html) ───

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

/** The print window is its own document, so the §14.1 tokens are restated here. */
const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
  :root {
    --color-primary-900: #040E6B; --neutral-800: #28343D; --neutral-600: #515F69;
    --neutral-300: #CBD5E1; --neutral-200: #E2E8F0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Poppins', system-ui, sans-serif; color: var(--neutral-800); padding: 24px; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid var(--color-primary-900); padding-bottom: 10px; margin-bottom: 16px; }
  .head img { width: 36px; height: 36px; border-radius: 8px; }
  .head .org { flex: 1; }
  .head .org b { display: block; color: var(--color-primary-900); font-size: 16px; }
  .head .meta { text-align: right; color: var(--neutral-600); }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .card { border: 1.5px dashed var(--neutral-300); border-radius: 12px; overflow: hidden; break-inside: avoid; }
  .card-name { background: var(--color-primary-900); color: #FFFFFF; padding: 8px 12px; font-weight: 600; font-size: 14px; }
  .card-body { padding: 10px 12px; }
  .role { color: var(--neutral-600); margin-bottom: 10px; line-height: 1.4; }
  .creds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cred { border: 1px solid var(--neutral-200); border-radius: 8px; padding: 6px 8px; }
  .cred-label { font-size: 9px; font-weight: 600; letter-spacing: .4px; text-transform: uppercase; color: var(--neutral-600); }
  .cred-value { font-family: 'Courier New', monospace; font-weight: 700; font-size: 14px; letter-spacing: .06em; color: var(--color-primary-900); }
  .note { margin-top: 8px; border-top: 1px dashed var(--neutral-300); padding-top: 6px; color: var(--neutral-600); font-size: 10px; }
  @media print { body { padding: 12px; } }
`;

/** Returns false when the browser blocked the print window, so the page can say so. */
export const printCredentialCards = (results: CredentialResult[]): boolean => {
  const win = window.open('', '_blank', 'width=820,height=700');
  if (!win) return false;

  const issued = formatDisplayDate(new Date().toISOString());
  const cards = results.map((c) => `
    <div class="card">
      <div class="card-name">${escapeHtml(c.fullName)}</div>
      <div class="card-body">
        <div class="role">${escapeHtml(c.position || '—')} · ${escapeHtml(c.department || '—')}${c.plantilla ? `<br>${escapeHtml(c.plantilla)}` : ''}</div>
        <div class="creds">
          <div class="cred"><div class="cred-label">Employee ID</div><div class="cred-value">${escapeHtml(c.employeeId)}</div></div>
          <div class="cred"><div class="cred-label">Temporary password</div><div class="cred-value">${escapeHtml(c.tempPassword)}</div></div>
        </div>
        <div class="note">✂ Cut along the border. Change your password when you first log in to the Employee Portal. Keep this slip confidential.</div>
      </div>
    </div>`).join('');

  win.document.head.innerHTML = `<title>Employee Credentials</title><style>${PRINT_STYLES}</style>`;
  win.document.body.innerHTML = `
    <div class="head">
      <img src="${window.location.origin}/favicon-blue-512.png" alt="ABYAN">
      <div class="org"><b>ABYAN HRIS</b>City Government of Iloilo · CHRMO</div>
      <div class="meta">Employee Credentials<br>Issued ${issued}</div>
    </div>
    <div class="grid">${cards}</div>`;

  win.focus();
  // Give the logo and font a moment to load before the print dialog opens.
  win.setTimeout(() => win.print(), 300);
  return true;
};
