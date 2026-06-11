import { Link, useLocation } from 'react-router-dom';

const TABS = [
  { label: 'Applications',        path: '/admin/rsp/applications' },
  { label: 'Qualified Applicants', path: '/admin/rsp/qualified' },
  { label: 'Applicant Score',      path: '/admin/rsp/applicant-score' },
  { label: 'Applicant Ranking',    path: '/admin/rsp/applicant-ranking' },
  { label: 'For Hiring',           path: '/admin/rsp/for-hiring' },
] as const;

export const ApplicantsTabBar = () => {
  const { pathname } = useLocation();

  const isActive = (path: string) =>
    pathname === path ||
    (path === '/admin/rsp/applications' && pathname === '/admin/rsp/jobs');

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
      <nav className="flex px-6 overflow-x-auto" aria-label="Applicants tabs">
        {TABS.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`relative px-6 py-4 text-base font-bold transition-colors whitespace-nowrap border-b-2 -mb-px ${
              isActive(tab.path)
                ? 'border-[#363EE8] text-[#363EE8]'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  );
};
