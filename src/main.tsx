import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadJobPostings } from './lib/recruitmentData';
import { syncHiredApplicantStatus } from './lib/hiredApplicantSync';
import { initTheme } from './lib/theme';
import './styles/interviewer.css';

// Apply persisted theme + accent before first render so we don't flash light mode.
initTheme();

const RUNTIME_DATA_VERSION_KEY = 'cictrix_runtime_data_version';
const RUNTIME_DATA_VERSION = '2026-05-11-supabase-job-postings';

const purgeLegacyJobPostingLocalStorage = (): void => {
  try {
    const current = localStorage.getItem(RUNTIME_DATA_VERSION_KEY);
    if (current === RUNTIME_DATA_VERSION) return;

    // Job postings now live exclusively in Supabase. Clear any legacy local copies
    // so a returning browser does not show stale or duplicated entries.
    localStorage.removeItem('cictrix_job_postings');
    localStorage.removeItem('cictrix_authoritative_job_postings');
    localStorage.removeItem('cictrix_applicant_position_options');
    localStorage.removeItem('cictrix_jobs');
    localStorage.setItem(RUNTIME_DATA_VERSION_KEY, RUNTIME_DATA_VERSION);
  } catch {
    // localStorage may be unavailable in some sandboxes; nothing to do.
  }
};

// Always render the app immediately so the page is never blank.
purgeLegacyJobPostingLocalStorage();
void loadJobPostings();
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// After mount, redirect localhost → 127.0.0.1 to keep localStorage consistent
// across both hostnames in local dev. The app is already painted so no blank flash.
if (window.location.hostname === 'localhost') {
  const url = new URL(window.location.href);
  url.hostname = '127.0.0.1';
  window.location.replace(url.toString());
}

if (!shouldRedirectToCanonicalHost) {
  purgeLegacyJobPostingLocalStorage();

  const renderApp = () => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  };

  // Kick off the Supabase fetch but do not block first paint — pages listen
  // for the 'cictrix:job-postings-updated' event and re-render when ready.
  void loadJobPostings();

  // One-shot backfill: flip applicants.status to 'Hired' for anyone who has
  // a newly_hired row but stale status. Fixes orphans from before the
  // Supabase status-flip fallback landed. Gated to once per tab session so
  // it doesn't run on every navigation.
  void syncHiredApplicantStatus();

  renderApp();
}
