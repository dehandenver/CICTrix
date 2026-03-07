import { ClipboardCheck, Search, UserCheck, UserPlus, Workflow, X } from 'lucide-react';

interface RecruitmentNavigationGuideProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    title: 'Step 1: Create A Job Posting',
    description: 'Use + New Job Post to create, save draft, or publish opportunities per office requirement.',
    icon: ClipboardCheck,
  },
  {
    title: 'Step 2: Review Applications',
    description: 'Filter applicants by status, score, and posting, then update status and schedule interviews.',
    icon: Search,
  },
  {
    title: 'Step 3: Move Qualified Applicants',
    description: 'Promote Recommended for Hiring profiles into Newly Hired with one-click conversion.',
    icon: UserCheck,
  },
  {
    title: 'Step 4: Manage Onboarding Checklist',
    description: 'Track day-by-day onboarding requirements with progress indicators and completion logs.',
    icon: Workflow,
  },
  {
    title: 'Step 5: Deploy To Department',
    description: 'Finalize deployment details and sync new employees to downstream PM and rater assignment flow.',
    icon: UserPlus,
  },
];

export const RecruitmentNavigationGuide = ({ open, onClose }: RecruitmentNavigationGuideProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 p-4" onClick={onClose}>
      <div
        className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Recruitment Navigation Guide</h2>
            <p className="text-sm text-slate-500">Follow this flow to manage recruitment lifecycle end-to-end.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
