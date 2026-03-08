import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/interviewer.css';

const RUNTIME_DATA_VERSION_KEY = 'cictrix_runtime_data_version';
const RUNTIME_DATA_VERSION = '2026-03-08-job-sync-v3';

const runOneTimeRuntimeMigration = (): boolean => {
  try {
    const current = localStorage.getItem(RUNTIME_DATA_VERSION_KEY);
    if (current === RUNTIME_DATA_VERSION) {
      return false;
    }

    const authoritativeRaw = localStorage.getItem('cictrix_authoritative_job_postings');
    const postingsRaw = localStorage.getItem('cictrix_job_postings');
    const sourceRaw = authoritativeRaw ?? postingsRaw ?? '[]';

    let normalizedRaw = '[]';
    try {
      const parsed = JSON.parse(sourceRaw);
      normalizedRaw = Array.isArray(parsed) ? JSON.stringify(parsed) : '[]';
    } catch {
      normalizedRaw = '[]';
    }

    // Normalize canonical keys and clear derived keys that can hold stale options.
    localStorage.setItem('cictrix_job_postings', normalizedRaw);
    localStorage.setItem('cictrix_authoritative_job_postings', normalizedRaw);
    localStorage.removeItem('cictrix_applicant_position_options');
    localStorage.removeItem('cictrix_jobs');
    localStorage.setItem(RUNTIME_DATA_VERSION_KEY, RUNTIME_DATA_VERSION);

    return true;
  } catch {
    return false;
  }
};

// Avoid split browser storage between localhost and 127.0.0.1 during local dev.
const shouldRedirectToCanonicalHost = window.location.hostname === 'localhost';
if (shouldRedirectToCanonicalHost) {
  const url = new URL(window.location.href);
  url.hostname = '127.0.0.1';
  window.location.replace(url.toString());
}

const migrationApplied = !shouldRedirectToCanonicalHost && runOneTimeRuntimeMigration();

if (migrationApplied) {
  window.location.reload();
}

if (!shouldRedirectToCanonicalHost && !migrationApplied) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
