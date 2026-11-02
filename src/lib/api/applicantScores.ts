/**
 * Applicant category and written exam scores service layer.
 *
 * Centralizes remote Supabase queries for `public.applicant_category_scores`,
 * with client-side scoring calculations and localStorage cache fallback.
 */

import { supabase as supabaseClient } from '../supabase';
import {
  DEFAULT_WRITTEN_EXAM_TOTAL,
  convertExamScore,
} from '../examTotalPoints';

const supabase = supabaseClient as any;

export const CAT_SCORES_KEY = 'cictrix_category_scores';
export const EXAM_SCORES_KEY = 'cictrix_exam_scores';
export const CATEGORY_SCORES_UPDATED_EVENT = 'cictrix:category-scores-updated';

export const MAX_TOTAL = 130;

export interface ScoringCategory {
  initialScore: number;
  finalScore: number | null;
  remarks: string;
}

export interface ApplicantCategoryScores {
  education: ScoringCategory;
  experience: ScoringCategory;
  performance: ScoringCategory;
  pcpt: ScoringCategory;
  potential: ScoringCategory;
  writtenExam: ScoringCategory;
  oralExam: ScoringCategory;
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
}

/** Persisted score state used to rank and finalize an applicant by UUID. */
export interface ApplicantScoreSummary {
  applicantId: string;
  appointmentType: 'original' | 'promotional';
  assessmentTotal: number | null;
  writtenExamRawScore: number | null;
  isFinalized: boolean;
}

export type ScoringCategoryKey =
  | 'education'
  | 'experience'
  | 'performance'
  | 'pcpt'
  | 'potential'
  | 'writtenExam'
  | 'oralExam';

export type BaseCategoryKey =
  | 'education'
  | 'experience'
  | 'performance'
  | 'pcpt'
  | 'potential';

export const BASE_CATS: readonly BaseCategoryKey[] = [
  'education',
  'experience',
  'performance',
  'pcpt',
  'potential',
] as const;

// Assessment categories the modal requires for each appointment type. Written
// exam stays outside the assessment total and is summarized separately.
const ORIGINAL_ASSESSMENT_CATEGORIES: readonly ScoringCategoryKey[] = [
  'education',
  'experience',
  'oralExam',
];

const PROMOTIONAL_ASSESSMENT_CATEGORIES: readonly ScoringCategoryKey[] = [
  'education',
  'experience',
  'performance',
  'potential',
  'pcpt',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Returns true if the string is a valid UUID format. */
export function isUuid(id: string): boolean {
  if (typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Effective score for a category badge or calculation:
 * finalScore -> initialScore -> 0.
 */
export function eff(cat?: { finalScore: number | null; initialScore: number }): number {
  return cat?.finalScore ?? cat?.initialScore ?? 0;
}

/**
 * Calculates modal score:
 * - Promotional: education + experience + performance + potential + pcpt
 * - Original: education + experience + oralExam
 */
export function calcModalScore(
  scores: ApplicantCategoryScores,
  apptType: 'original' | 'promotional',
): number {
  if (!scores) return 0;
  if (apptType === 'promotional') {
    const sum =
      eff(scores.education) +
      eff(scores.experience) +
      eff(scores.performance) +
      eff(scores.potential) +
      eff(scores.pcpt);
    return Math.round(sum * 100) / 100;
  }
  const sum =
    eff(scores.education) +
    eff(scores.experience) +
    eff(scores.oralExam);
  return Math.round(sum * 100) / 100;
}

/**
 * Overall score out of 130:
 * Returns null if any base category or written exam does not have a finalScore.
 */
export function calcOverallScore(
  scores: ApplicantCategoryScores,
  examTotal: number = DEFAULT_WRITTEN_EXAM_TOTAL,
): { value: number | null; pct: string | null } {
  if (!scores) return { value: null, pct: null };
  for (const k of BASE_CATS) {
    if ((scores[k]?.finalScore ?? null) === null) {
      return { value: null, pct: null };
    }
  }
  if ((scores.writtenExam?.finalScore ?? null) === null) {
    return { value: null, pct: null };
  }
  const base = BASE_CATS.reduce((s, k) => s + (scores[k]?.finalScore ?? 0), 0);
  const examPoints = convertExamScore(scores.writtenExam?.finalScore ?? 0, examTotal).points;
  const val = +(base + examPoints).toFixed(2);
  return { value: val, pct: ((val / MAX_TOTAL) * 100).toFixed(1) };
}

export function educationLevelToPoints(level: string | null | undefined): number | null {
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
}

export function experienceYearsToPoints(years: number | null | undefined): number | null {
  if (years == null || isNaN(Number(years))) return null;
  const y = Number(years);
  if (y >= 21) return 25;
  if (y >= 16) return 18;
  if (y >= 11) return 16;
  if (y >= 6) return 14;
  if (y >= 1) return 12;
  return 0;
}

export function pcptRawToConvertedScore(raw: number): number {
  if (raw >= 35) return 20;
  if (raw >= 32) return 18;
  if (raw >= 29) return 16;
  if (raw >= 26) return 14;
  if (raw >= 23) return 12;
  if (raw >= 20) return 10;
  return +Math.max(0, Math.min(20, (raw / 30) * 20)).toFixed(1);
}

export function oralRawToConvertedScore(raw: number): number {
  return +Math.min(20, Math.max(0, (raw / 5) * 20)).toFixed(2);
}

export function normalizeApplicationType(value: string | null | undefined): 'original' | 'promotional' {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'promotion' || normalized === 'promotional' ? 'promotional' : 'original';
}

/**
 * Derives default category scores from applicant profile, saved scores,
 * interviewer evaluation snapshot, and position exam score.
 */
export function deriveDefaultCategoryScores(
  applicant: any,
  saved?: Record<string, ApplicantCategoryScores> | Map<string, ApplicantCategoryScores>,
  evalSnapshot?: any,
  posExamScore?: string,
): ApplicantCategoryScores {
  const pct = (Number(applicant?.total_score) || 0) / 100;
  const autoEdu = educationLevelToPoints(applicant?.education_level);
  const autoExp = experienceYearsToPoints(applicant?.years_of_experience);

  const pcptRaw = typeof evalSnapshot?.pcptRawScore === 'number' ? evalSnapshot.pcptRawScore : null;
  const writtenRaw = typeof evalSnapshot?.writtenExamRawScore === 'number'
    ? evalSnapshot.writtenExamRawScore
    : (posExamScore && !isNaN(Number(posExamScore)) ? Number(posExamScore) : null);
  const oralRaw = typeof evalSnapshot?.oralRawScore === 'number' ? evalSnapshot.oralRawScore : null;

  const fresh: ApplicantCategoryScores = {
    education: { initialScore: autoEdu ?? +((pct * 20).toFixed(1)), finalScore: autoEdu, remarks: '' },
    experience: { initialScore: autoExp ?? +((pct * 25).toFixed(1)), finalScore: autoExp, remarks: '' },
    performance: { initialScore: +((pct * 20).toFixed(1)), finalScore: null, remarks: '' },
    pcpt: {
      initialScore: pcptRaw ?? +((pct * 20).toFixed(1)),
      finalScore: pcptRaw === null ? null : pcptRawToConvertedScore(pcptRaw),
      remarks: '',
    },
    potential: { initialScore: +((pct * 25).toFixed(1)), finalScore: null, remarks: '' },
    writtenExam: { initialScore: writtenRaw ?? 0, finalScore: writtenRaw, remarks: '' },
    oralExam: {
      initialScore: oralRaw ?? 0,
      finalScore: oralRaw === null ? null : oralRawToConvertedScore(oralRaw),
      remarks: '',
    },
    appointmentType: normalizeApplicationType(applicant?.application_type),
    positionType: 'rank-and-file',
  };

  const applicantId = applicant?.id;
  const savedScores = applicantId && saved
    ? (saved instanceof Map ? saved.get(applicantId) : saved[applicantId])
    : undefined;

  if (!savedScores) return fresh;

  return {
    ...fresh,
    ...savedScores,
    writtenExam: savedScores.writtenExam?.finalScore != null ? savedScores.writtenExam : fresh.writtenExam,
    oralExam: savedScores.oralExam?.finalScore != null ? savedScores.oralExam : fresh.oralExam,
    pcpt: savedScores.pcpt?.finalScore != null ? savedScores.pcpt : fresh.pcpt,
  };
}

/**
 * Determines whether category scores are finalized:
 * checks is_finalized flag, any finalScore present, or appointmentType/positionType metadata.
 */
export function hasFinalizedCategoryScores(entry?: ApplicantCategoryScores | any): boolean {
  if (!entry) return false;
  if (entry.is_finalized === true || entry.isFinalized === true) return true;

  const categories: Array<ScoringCategory | undefined> = [
    entry.education,
    entry.experience,
    entry.performance,
    entry.pcpt,
    entry.potential,
    entry.writtenExam,
    entry.oralExam,
  ];

  const hasAnyFinalScore = categories.some((category) => typeof category?.finalScore === 'number');
  if (hasAnyFinalScore) return true;

  return Boolean(entry.appointmentType || entry.positionType);
}

/**
 * Maps a database row from `public.applicant_category_scores` to ApplicantCategoryScores.
 */
export function rowToCategoryScores(row: any): ApplicantCategoryScores {
  return {
    education: row.education ?? { initialScore: 0, finalScore: null, remarks: '' },
    experience: row.experience ?? { initialScore: 0, finalScore: null, remarks: '' },
    performance: row.performance ?? { initialScore: 0, finalScore: null, remarks: '' },
    pcpt: row.pcpt ?? { initialScore: 0, finalScore: null, remarks: '' },
    potential: row.potential ?? { initialScore: 0, finalScore: null, remarks: '' },
    writtenExam: row.written_exam ?? row.writtenExam ?? { initialScore: 0, finalScore: null, remarks: '' },
    oralExam: row.oral_exam ?? row.oralExam ?? { initialScore: 0, finalScore: null, remarks: '' },
    appointmentType: row.appointment_type ?? row.appointmentType ?? 'original',
    positionType: row.position_type ?? row.positionType ?? 'rank-and-file',
  };
}

const readLocalStorageCache = (): Record<string, ApplicantCategoryScores> => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CAT_SCORES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

/**
 * Reads category scores from Supabase `public.applicant_category_scores`.
 * Filters applicantIds by valid UUIDs.
 * Falls back to localStorage cache if remote fetch fails or is offline.
 * Synchronizes successfully fetched rows into the local cache.
 */
export async function fetchApplicantCategoryScores(
  applicantIds?: string[],
): Promise<{ ok: boolean; data: Map<string, ApplicantCategoryScores>; error?: unknown }> {
  const validUuids = applicantIds ? applicantIds.filter(isUuid) : undefined;

  // If specific applicantIds were passed and NONE are valid UUIDs (e.g. test string IDs),
  // return matching entries directly from localStorage cache.
  if (applicantIds && applicantIds.length > 0 && validUuids && validUuids.length === 0) {
    const localCache = readLocalStorageCache();
    const map = new Map<string, ApplicantCategoryScores>();
    for (const id of applicantIds) {
      if (localCache[id]) {
        map.set(id, localCache[id]);
      }
    }
    return { ok: true, data: map };
  }

  try {
    let query = supabase.from('applicant_category_scores').select('*');
    if (validUuids && validUuids.length > 0) {
      query = query.in('applicant_id', validUuids);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }

    const resultMap = new Map<string, ApplicantCategoryScores>();
    const localCache = readLocalStorageCache();
    let cacheModified = false;

    if (Array.isArray(data)) {
      for (const row of data) {
        const id = String(row.applicant_id ?? row.id ?? '');
        if (!id) continue;
        const parsed = rowToCategoryScores(row);
        resultMap.set(id, parsed);
        localCache[id] = parsed;
        cacheModified = true;
      }
    }

    // Include requested IDs from local cache if missing from remote result
    if (applicantIds) {
      for (const id of applicantIds) {
        if (!resultMap.has(id) && localCache[id]) {
          resultMap.set(id, localCache[id]);
        }
      }
    }

    if (cacheModified) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CAT_SCORES_KEY, JSON.stringify(localCache));
        }
      } catch {
        // ignore localStorage errors
      }
    }

    return { ok: true, data: resultMap };
  } catch (error) {
    console.warn('[applicantScores] fetch from Supabase failed, falling back to localStorage:', error);
    const localCache = readLocalStorageCache();
    const fallbackMap = new Map<string, ApplicantCategoryScores>();
    if (applicantIds && applicantIds.length > 0) {
      for (const id of applicantIds) {
        if (localCache[id]) {
          fallbackMap.set(id, localCache[id]);
        }
      }
    } else {
      for (const [id, scores] of Object.entries(localCache)) {
        fallbackMap.set(id, scores);
      }
    }
    return { ok: false, data: fallbackMap, error };
  }
}

/**
 * Reads durable, applicant-keyed score summaries from
 * `public.applicant_category_scores`. Only requested valid UUIDs are queried.
 *
 * Remote rows are the only source: browser storage is never consulted, and a
 * failed read returns `ok: false` with an empty map instead of a successful
 * empty ranking. Assessment totals use the existing appointment-specific modal
 * formulas and are null until every required category has a finite final score.
 */
export async function fetchApplicantScoreSummaries(
  applicantIds: string[],
): Promise<{ ok: boolean; data: Map<string, ApplicantScoreSummary>; error?: unknown }> {
  const requested = Array.isArray(applicantIds) ? applicantIds : [];
  const validUuids = Array.from(new Set(requested.filter(isUuid)));
  if (validUuids.length === 0) {
    return { ok: true, data: new Map<string, ApplicantScoreSummary>() };
  }

  try {
    const { data, error } = await supabase
      .from('applicant_category_scores')
      .select(
        'applicant_id, appointment_type, is_finalized, education, experience, performance, potential, pcpt, written_exam, oral_exam, written_exam_raw_score',
      )
      .in('applicant_id', validUuids);

    if (error) throw error;

    const requestedIds = new Set(validUuids);
    const summaries = new Map<string, ApplicantScoreSummary>();
    if (Array.isArray(data)) {
      for (const row of data) {
        const applicantId = String(row?.applicant_id ?? '').trim();
        if (!applicantId || !requestedIds.has(applicantId)) continue;

        const scores = rowToCategoryScores(row);
        const appointmentType = normalizeApplicationType(row?.appointment_type);
        summaries.set(applicantId, {
          applicantId,
          appointmentType,
          assessmentTotal: assessmentTotalForScores(scores, appointmentType),
          writtenExamRawScore: writtenExamRawScoreFromRow(row),
          isFinalized: row?.is_finalized === true,
        });
      }
    }
    return { ok: true, data: summaries };
  } catch (error) {
    console.warn('[applicantScores] score summary fetch failed:', error);
    return { ok: false, data: new Map<string, ApplicantScoreSummary>(), error };
  }
}

/** A finite number, including zero, or null for missing/NaN/Infinity values. */
const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Existing modal formula for the appointment track, but only when every
 * required category has a persisted final score. Zero counts as complete.
 */
const assessmentTotalForScores = (
  scores: ApplicantCategoryScores,
  appointmentType: 'original' | 'promotional',
): number | null => {
  const requiredCategories = appointmentType === 'promotional'
    ? PROMOTIONAL_ASSESSMENT_CATEGORIES
    : ORIGINAL_ASSESSMENT_CATEGORIES;

  for (const key of requiredCategories) {
    if (finiteNumberOrNull(scores[key]?.finalScore) === null) return null;
  }
  return calcModalScore(scores, appointmentType);
};

/** Written exam raw score from persisted columns; never from `applicants`. */
const writtenExamRawScoreFromRow = (row: any): number | null => {
  const persisted = finiteNumberOrNull(row?.written_exam_raw_score);
  if (persisted !== null) return persisted;

  const writtenExam = row?.written_exam ?? row?.writtenExam;
  return finiteNumberOrNull(writtenExam?.finalScore);
};

/**
 * Upserts category scores to Supabase `public.applicant_category_scores`,
 * calculates rollup scores (written_exam_raw_score, total_score, interview_score, is_finalized),
 * then publishes the localStorage cache and update event after the save succeeds.
 *
 * Non-UUID test/demo IDs have no remote row and deliberately keep local-only
 * behavior. For a real UUID, a failed remote save publishes nothing.
 */
export async function saveApplicantCategoryScores(
  applicantId: string,
  scores: ApplicantCategoryScores,
  isFinalized?: boolean,
): Promise<{ ok: boolean; error?: unknown }> {
  // Rollups
  const writtenRaw =
    scores.writtenExam?.finalScore ??
    (scores.writtenExam?.initialScore != null ? scores.writtenExam.initialScore : null);
  const interviewScore =
    scores.oralExam?.finalScore ??
    (scores.oralExam?.initialScore != null ? scores.oralExam.initialScore : null);
  const overall = calcOverallScore(scores);
  const totalScore = overall.value ?? calcModalScore(scores, scores.appointmentType ?? 'original');
  const finalized = typeof isFinalized === 'boolean' ? isFinalized : hasFinalizedCategoryScores(scores);

  const publishLocalCache = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CAT_SCORES_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        cache[applicantId] = scores;
        localStorage.setItem(CAT_SCORES_KEY, JSON.stringify(cache));
      }
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent(CATEGORY_SCORES_UPDATED_EVENT));
      }
    } catch (err) {
      console.warn('[applicantScores] failed to update localStorage cache:', err);
    }
  };

  // Non-UUID (e.g. test harness id): there is no Postgres row to save.
  if (!isUuid(applicantId)) {
    publishLocalCache();
    return { ok: true };
  }

  const payload = {
    applicant_id: applicantId,
    education: scores.education,
    experience: scores.experience,
    performance: scores.performance,
    pcpt: scores.pcpt,
    potential: scores.potential,
    written_exam: scores.writtenExam,
    oral_exam: scores.oralExam,
    appointment_type: scores.appointmentType ?? 'original',
    position_type: scores.positionType ?? 'rank-and-file',
    written_exam_raw_score: typeof writtenRaw === 'number' && Number.isFinite(writtenRaw) ? writtenRaw : null,
    total_score: typeof totalScore === 'number' && Number.isFinite(totalScore) ? totalScore : null,
    interview_score: typeof interviewScore === 'number' && Number.isFinite(interviewScore) ? interviewScore : null,
    is_finalized: finalized,
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from('applicant_category_scores')
      .upsert(payload, { onConflict: 'applicant_id' });

    if (error) {
      console.error('[applicantScores] save to Supabase failed:', error);
      return { ok: false, error };
    }
  } catch (error) {
    console.error('[applicantScores] save exception:', error);
    return { ok: false, error };
  }

  publishLocalCache();
  return { ok: true };
}

/**
 * Batch updates/upserts written exam scores for applicants into Supabase applicant_category_scores,
 * updates localStorage `cictrix_exam_scores`, and updates writtenExam on `cictrix_category_scores`.
 */
export async function savePositionWrittenExamScores(
  position: string,
  scoresByApplicantId: Record<string, number>,
  _jobPostingId?: string,
): Promise<{ ok: boolean; error?: unknown }> {
  let localCatScores: Record<string, ApplicantCategoryScores> = {};

  try {
    if (typeof localStorage !== 'undefined') {
      // 1. Update cictrix_exam_scores
      const rawExam = localStorage.getItem(EXAM_SCORES_KEY);
      const examCache = rawExam ? JSON.parse(rawExam) : {};
      const stringScores: Record<string, string> = {};
      for (const [id, val] of Object.entries(scoresByApplicantId)) {
        if (val != null && !isNaN(Number(val))) {
          stringScores[id] = String(val);
        }
      }
      examCache[position] = { ...(examCache[position] ?? {}), ...stringScores };
      localStorage.setItem(EXAM_SCORES_KEY, JSON.stringify(examCache));

      // 2. Update cictrix_category_scores
      const rawCat = localStorage.getItem(CAT_SCORES_KEY);
      localCatScores = rawCat ? JSON.parse(rawCat) : {};
      for (const [id, val] of Object.entries(scoresByApplicantId)) {
        const num = Number(val);
        if (isNaN(num)) continue;
        const existing = localCatScores[id];
        if (existing) {
          localCatScores[id] = {
            ...existing,
            writtenExam: {
              initialScore: num,
              finalScore: existing.writtenExam?.finalScore ?? num,
              remarks: existing.writtenExam?.remarks ?? '',
            },
          };
        } else {
          localCatScores[id] = {
            education: { initialScore: 0, finalScore: null, remarks: '' },
            experience: { initialScore: 0, finalScore: null, remarks: '' },
            performance: { initialScore: 0, finalScore: null, remarks: '' },
            pcpt: { initialScore: 0, finalScore: null, remarks: '' },
            potential: { initialScore: 0, finalScore: null, remarks: '' },
            writtenExam: { initialScore: num, finalScore: num, remarks: '' },
            oralExam: { initialScore: 0, finalScore: null, remarks: '' },
            appointmentType: 'original',
            positionType: 'rank-and-file',
          };
        }
      }
      localStorage.setItem(CAT_SCORES_KEY, JSON.stringify(localCatScores));
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(CATEGORY_SCORES_UPDATED_EVENT));
    }
  } catch (err) {
    console.warn('[applicantScores] localStorage update in savePositionWrittenExamScores failed:', err);
  }

  const validEntries = Object.entries(scoresByApplicantId)
    .filter(([id, val]) => isUuid(id) && val != null && !isNaN(Number(val)))
    .map(([id, val]) => [id, Number(val)] as const);

  if (validEntries.length === 0) {
    return { ok: true };
  }

  try {
    const ids = validEntries.map(([id]) => id);
    const { data: existingRows, error: fetchErr } = await supabase
      .from('applicant_category_scores')
      .select('*')
      .in('applicant_id', ids);

    if (fetchErr) {
      console.warn('[applicantScores] failed to query existing rows for batch update:', fetchErr);
    }

    const existingMap = new Map<string, any>();
    if (Array.isArray(existingRows)) {
      for (const row of existingRows) {
        const rid = row.applicant_id ?? row.id;
        if (rid) existingMap.set(rid, row);
      }
    }

    const upsertRows = validEntries.map(([applicantId, scoreNum]) => {
      const existingRow = existingMap.get(applicantId);
      const existingCat = existingRow ? rowToCategoryScores(existingRow) : localCatScores[applicantId];

      const updatedCat: ApplicantCategoryScores = existingCat
        ? {
            ...existingCat,
            writtenExam: {
              initialScore: scoreNum,
              finalScore: existingCat.writtenExam?.finalScore ?? scoreNum,
              remarks: existingCat.writtenExam?.remarks ?? '',
            },
          }
        : {
            education: { initialScore: 0, finalScore: null, remarks: '' },
            experience: { initialScore: 0, finalScore: null, remarks: '' },
            performance: { initialScore: 0, finalScore: null, remarks: '' },
            pcpt: { initialScore: 0, finalScore: null, remarks: '' },
            potential: { initialScore: 0, finalScore: null, remarks: '' },
            writtenExam: { initialScore: scoreNum, finalScore: scoreNum, remarks: '' },
            oralExam: { initialScore: 0, finalScore: null, remarks: '' },
            appointmentType: 'original',
            positionType: 'rank-and-file',
          };

      const overall = calcOverallScore(updatedCat);
      const totalScore = overall.value ?? calcModalScore(updatedCat, updatedCat.appointmentType ?? 'original');
      const interviewScore =
        updatedCat.oralExam?.finalScore ??
        (updatedCat.oralExam?.initialScore != null ? updatedCat.oralExam.initialScore : null);
      const finalized = existingRow?.is_finalized ?? hasFinalizedCategoryScores(updatedCat);

      return {
        applicant_id: applicantId,
        education: updatedCat.education,
        experience: updatedCat.experience,
        performance: updatedCat.performance,
        pcpt: updatedCat.pcpt,
        potential: updatedCat.potential,
        written_exam: updatedCat.writtenExam,
        oral_exam: updatedCat.oralExam,
        appointment_type: updatedCat.appointmentType ?? 'original',
        position_type: updatedCat.positionType ?? 'rank-and-file',
        written_exam_raw_score: scoreNum,
        total_score: typeof totalScore === 'number' && Number.isFinite(totalScore) ? totalScore : null,
        interview_score: typeof interviewScore === 'number' && Number.isFinite(interviewScore) ? interviewScore : null,
        is_finalized: finalized,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: upsertErr } = await supabase
      .from('applicant_category_scores')
      .upsert(upsertRows, { onConflict: 'applicant_id' });

    if (upsertErr) {
      console.error('[applicantScores] batch upsert failed:', upsertErr);
      return { ok: false, error: upsertErr };
    }

    return { ok: true };
  } catch (error) {
    console.error('[applicantScores] batch upsert exception:', error);
    return { ok: false, error };
  }
}
