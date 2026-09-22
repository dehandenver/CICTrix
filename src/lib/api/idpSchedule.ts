/**
 * Individual Development Plan — form link and its open/close window.
 *
 * Deliberately separate from `phaseSchedules.ts`. That module drives the IPCR
 * Target-Setting and Rating phases, which belong to Performance Management on a
 * different cycle; the IDP is L&D's and has no reason to move when an IPCR
 * phase does. Sharing the table would have meant two teams editing the same
 * rows and one quietly rescheduling the other.
 */

import { supabase as supabaseClient } from '../supabase';

const supabase = supabaseClient as any;

export type IdpMode = 'Auto' | 'Open' | 'Closed';
export type IdpState = 'Open' | 'Closed';

export interface IdpFormConfig {
  id?: string;
  scope: string;
  formUrl: string;
  responsesUrl: string;
  instructions: string;
  mode: IdpMode;
  opensAt: string | null;
  closesAt: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export type IdpResult<T> = { ok: true; data: T } | { ok: false; error: string };

const todayIso = () => new Date().toISOString().slice(0, 10);

export const EMPTY_IDP_CONFIG: IdpFormConfig = {
  scope: 'system',
  formUrl: '',
  responsesUrl: '',
  instructions: '',
  mode: 'Closed',
  opensAt: null,
  closesAt: null,
};

/**
 * Open or closed right now.
 *
 * 'Auto' needs both dates: a window with only one end is not a window, and
 * treating a missing date as "forever" is how a form silently stays open after
 * the cycle ends. Closed is the safe default in every ambiguous case.
 */
export function effectiveIdpState(
  config: Pick<IdpFormConfig, 'mode' | 'opensAt' | 'closesAt'> | null,
  on: string = todayIso(),
): IdpState {
  if (!config) return 'Closed';
  if (config.mode === 'Open') return 'Open';
  if (config.mode === 'Closed') return 'Closed';
  if (!config.opensAt || !config.closesAt) return 'Closed';
  return on >= config.opensAt && on <= config.closesAt ? 'Open' : 'Closed';
}

/**
 * A Google Form URL in the shape an iframe will accept.
 *
 * L&D will paste whatever the Google "Send" dialog gave them — a /viewform
 * link, an edit link, or the short forms.gle form. Only /viewform renders
 * embedded, and it needs embedded=true, so normalise rather than expecting a
 * particular paste. Returns null when the URL is not a usable form link, so the
 * page can say so instead of rendering a broken frame.
 */
export function toEmbeddableFormUrl(raw: string): string | null {
  const url = (raw ?? '').trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const isGoogleForm =
    /(^|\.)docs\.google\.com$/.test(parsed.hostname) && parsed.pathname.includes('/forms/');
  const isShortLink = /(^|\.)forms\.gle$/.test(parsed.hostname);

  // A Drive folder is not a form. It is an easy link to reach for, and it
  // renders as a blank frame rather than an error, so reject it explicitly.
  if (!isGoogleForm && !isShortLink) return null;

  if (isShortLink) return parsed.toString();

  // An edit link embeds as the editor, which employees cannot open. Point it at
  // the response view instead.
  const viewPath = parsed.pathname.replace(/\/(edit|viewanalytics)\/?$/, '/viewform');
  const normalised = new URL(parsed.toString());
  normalised.pathname = viewPath.includes('/viewform') ? viewPath : `${viewPath.replace(/\/$/, '')}/viewform`;
  normalised.searchParams.set('embedded', 'true');
  return normalised.toString();
}

function mapRow(row: any): IdpFormConfig {
  return {
    id: row.id,
    scope: row.scope ?? 'system',
    formUrl: row.form_url ?? '',
    responsesUrl: row.responses_url ?? '',
    instructions: row.instructions ?? '',
    mode: (row.mode as IdpMode) ?? 'Closed',
    opensAt: row.opens_at ?? null,
    closesAt: row.closes_at ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getIdpConfig(): Promise<IdpResult<IdpFormConfig>> {
  try {
    const { data, error } = await supabase
      .from('idp_form_config')
      .select('*')
      .eq('scope', 'system')
      .maybeSingle();

    if (error) throw error;
    // No row yet is not an error: the page renders as closed and the L&D screen
    // creates the row on first save.
    return { ok: true, data: data ? mapRow(data) : { ...EMPTY_IDP_CONFIG } };
  } catch (err: any) {
    console.error('[idpSchedule] getIdpConfig error:', err);
    return { ok: false, error: err?.message ?? 'Failed to load the IDP schedule.' };
  }
}

export async function saveIdpConfig(
  config: IdpFormConfig,
  updatedBy?: string,
): Promise<IdpResult<IdpFormConfig>> {
  const row = {
    scope: 'system',
    form_url: config.formUrl?.trim() || null,
    responses_url: config.responsesUrl?.trim() || null,
    instructions: config.instructions?.trim() || null,
    mode: config.mode,
    opens_at: config.opensAt || null,
    closes_at: config.closesAt || null,
    updated_by: updatedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('idp_form_config')
      .upsert(row, { onConflict: 'scope' })
      .select()
      .single();

    if (error) throw error;
    return { ok: true, data: mapRow(data) };
  } catch (err: any) {
    console.error('[idpSchedule] saveIdpConfig error:', err);
    return { ok: false, error: err?.message ?? 'Failed to save the IDP schedule.' };
  }
}

/** Human-readable reason the form is not available, for the employee page. */
export function closedReason(config: IdpFormConfig, on: string = todayIso()): string {
  if (config.mode === 'Closed') return 'The IDP form is currently closed by Learning & Development.';
  if (config.mode === 'Open') return '';
  if (!config.opensAt || !config.closesAt) {
    return 'Learning & Development has not scheduled this cycle’s IDP window yet.';
  }
  if (on < config.opensAt) return `The IDP form opens on ${config.opensAt}.`;
  if (on > config.closesAt) return `The IDP window closed on ${config.closesAt}.`;
  return '';
}
