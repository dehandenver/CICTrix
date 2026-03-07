import { CalendarClock, Network, UserCog, X } from 'lucide-react';

interface RaterManagementNavigationGuideProps {
  open: boolean;
  onClose: () => void;
}

const steps = [
  {
    title: 'Step 1: Understand Hierarchies',
    description: 'Review immediate supervisor, department head, optional additional rater, and PMD final reviewer levels.',
    icon: Network,
  },
  {
    title: 'Step 2: Assign Raters',
    description: 'Assign raters individually or in bulk per department and employee grouping.',
    icon: UserCog,
  },
  {
    title: 'Step 3: Configure Evaluation Period',
    description: 'Set active cycle dates and rater submission deadlines for consistent review windows.',
    icon: CalendarClock,
  },
  {
    title: 'Step 4: Track Completion',
    description: 'Monitor pending and completed rating submissions and follow up with reminders as needed.',
    icon: CalendarClock,
  },
];

export const RaterManagementNavigationGuide = ({ open, onClose }: RaterManagementNavigationGuideProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 p-4" onClick={onClose}>
      <div
        className="mx-auto mt-8 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rater Management Guide</h2>
            <p className="text-sm text-slate-500">Configure rater assignments and monitor evaluation workflows.</p>
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
                    <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
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
