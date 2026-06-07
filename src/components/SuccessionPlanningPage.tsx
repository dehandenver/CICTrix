import { useEffect, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Plus,
  Users,
  AlertTriangle,
  CalendarClock,
  Award,
  Clock,
  BookOpen,
  Upload,
  Settings,
  FileText,
  UserCheck,
  CheckCircle2,
  XCircle,
  X,
  User,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Check,
} from 'lucide-react';
import { Button } from './Button';

type TabKey = 'planning' | 'critical' | 'registry';

type Competency = { name: string; required: number };

type CriticalPosition = {
  id: string;
  title: string;
  department: string;
  incumbent: string;
  incumbentStatus: 'Active' | 'On Leave' | 'Retiring';
  incumbentStatusDetail: string;
  experienceYears: number;
  trainingHours: number;
  eligibility: string;
  courses: string[];
  competencies: Competency[];
  footer: string;
};

type PositionForm = {
  title: string;
  department: string;
  incumbent: string;
  incumbentStatus: 'Active' | 'On Leave' | 'Retiring';
  statusDetail: string;
  yearsExperience: string;
  trainingHours: string;
  civilServiceEligibility: string;
  courses: string;
  includeInPlanning: boolean;
};

const blankPositionForm = (): PositionForm => ({
  title: 'New Position',
  department: 'Administration',
  incumbent: 'Vacant',
  incumbentStatus: 'Active',
  statusDetail: 'Newly created',
  yearsExperience: '3',
  trainingHours: '40',
  civilServiceEligibility: 'Career Service Professional (R.A. 1080)',
  courses: 'BS Psychology\nBS Human Resource Development Management',
  includeInPlanning: true,
});

const DEPARTMENTS = [
  'Human Resources',
  'Administration',
  'Information Technology',
  'Finance',
  'Operations',
];

const INITIAL_POSITIONS: CriticalPosition[] = [
  {
    id: 'hr-officer-iv',
    title: 'HR Officer IV',
    department: 'Human Resources',
    incumbent: 'Atty. Elena R. Mercado',
    incumbentStatus: 'Retiring',
    incumbentStatusDetail: 'Retirement effective 2026-08-31',
    experienceYears: 3,
    trainingHours: 80,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Psychology', 'BS Human Resource Development Management', 'AB Behavioral Science'],
    competencies: [
      { name: 'Public Administration Principles', required: 85 },
      { name: 'Ethical Conduct & Public Service', required: 85 },
      { name: 'Transparency and Accountability', required: 80 },
      { name: 'Public Communication Skills', required: 80 },
      { name: 'Data and Records Management', required: 75 },
    ],
    footer: 'Retirement effective 2026-08-31',
  },
  {
    id: 'municipal-administrator',
    title: 'Municipal Administrator',
    department: 'Administration',
    incumbent: 'Mr. Roberto S. Lim',
    incumbentStatus: 'Active',
    incumbentStatusDetail: 'Currently in role',
    experienceYears: 5,
    trainingHours: 120,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['Master in Public Administration', 'MA Local Governance', 'MS Public Management'],
    competencies: [
      { name: 'Public Administration', required: 90 },
      { name: 'Budget Management', required: 85 },
      { name: 'Policy Analysis', required: 80 },
    ],
    footer: 'Currently in role',
  },
  {
    id: 'it-division-chief',
    title: 'IT Division Chief',
    department: 'Information Technology',
    incumbent: 'Engr. Roberto P. Aquino',
    incumbentStatus: 'On Leave',
    incumbentStatusDetail: 'Medical leave until 2026-06-15',
    experienceYears: 8,
    trainingHours: 100,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Computer Science', 'BS Information Technology', 'BS Information Systems'],
    competencies: [
      { name: 'Digital Literacy for Gov Services', required: 90 },
      { name: 'Project Management in Public Setting', required: 85 },
      { name: 'Data and Records Management', required: 80 },
      { name: 'Technical Writing for Gov Docs', required: 70 },
    ],
    footer: 'Medical leave until 2026-06-15',
  },
  {
    id: 'finance-director',
    title: 'Finance Director',
    department: 'Finance',
    incumbent: 'Mr. Antonio V. delos Reyes',
    incumbentStatus: 'Retiring',
    incumbentStatusDetail: 'Retirement effective 2027-01-15',
    experienceYears: 10,
    trainingHours: 140,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Accountancy', 'BS Management Accounting', 'CPA'],
    competencies: [
      { name: 'Government Accounting', required: 90 },
      { name: 'Audit & Compliance', required: 85 },
      { name: 'Budget Forecasting', required: 80 },
    ],
    footer: 'Retirement effective 2027-01-15',
  },
  {
    id: 'drrm-officer',
    title: 'DRRM Officer',
    department: 'Operations',
    incumbent: 'Mr. Felipe S. Garcia',
    incumbentStatus: 'Active',
    incumbentStatusDetail: 'Currently in role',
    experienceYears: 5,
    trainingHours: 80,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: ['BS Disaster Risk Management', 'BS Environmental Science', 'BS Geology'],
    competencies: [
      { name: 'Disaster Risk Assessment', required: 85 },
      { name: 'Emergency Operations', required: 80 },
      { name: 'Community Coordination', required: 75 },
    ],
    footer: 'Currently in role',
  },
  {
    id: 'new-position-1',
    title: 'New Position',
    department: 'Administration',
    incumbent: 'Vacant',
    incumbentStatus: 'Active',
    incumbentStatusDetail: 'Newly created',
    experienceYears: 3,
    trainingHours: 40,
    eligibility: 'Career Service Professional (R.A. 1080)',
    courses: [],
    competencies: [],
    footer: 'Newly created',
  },
];

type SuccessorStatus = 'designated' | 'promoted' | 'vacated';

type Successor = {
  id: string;
  name: string;
  initials: string;
  currentPosition: string;
  targetPositionId: string;
  readinessScore: number;
  readiness: string;
  status: SuccessorStatus;
  assignedDate: string;
};

const INITIAL_SUCCESSORS: Successor[] = [
  {
    id: 's-hr',
    name: 'Maria Elena Santos',
    initials: 'MS',
    currentPosition: 'Senior HR Specialist',
    targetPositionId: 'hr-officer-iv',
    readinessScore: 89,
    readiness: 'Ready Soon',
    status: 'designated',
    assignedDate: '2026-05-20',
  },
];

type CandidateLevel = 'Ready Soon' | 'Developing' | 'Not Ready';

type Candidate = {
  id: string;
  rank: number;
  positionId: string;
  name: string;
  initials: string;
  currentPosition: string;
  department: string;
  course: string;
  matchPercent: number;
  yearsExperience: number;
  ipcr: number;
  scorePercent: number;
  level: CandidateLevel;
  missingNotes?: string[];
  competencyScores: Record<string, number>;
  readinessBreakdown: {
    competencyGap: { current: number; max: number };
    trainingAlignment: { current: number; max: number };
    yearsExperience: { current: number; max: number };
    ipcrPerformance: { current: number; max: number };
  };
  eligibilityCheck: {
    trainings: { current: number; required: number; pass: boolean };
    trainingHours: { current: number; required: number; pass: boolean };
    experience: { current: number; required: number; pass: boolean };
    eligibility: { value: string; pass: boolean };
  };
  recommendations: string[];
};

const blankAnalysis = {
  competencyScores: {},
  readinessBreakdown: {
    competencyGap: { current: 0, max: 40 },
    trainingAlignment: { current: 0, max: 20 },
    yearsExperience: { current: 0, max: 15 },
    ipcrPerformance: { current: 0, max: 25 },
  },
  eligibilityCheck: {
    trainings: { current: 0, required: 1, pass: false },
    trainingHours: { current: 0, required: 80, pass: false },
    experience: { current: 0, required: 3, pass: false },
    eligibility: { value: '—', pass: false },
  },
  recommendations: [] as string[],
};

const CANDIDATES: Candidate[] = [
  // === HR Officer IV — the Figma example ===
  {
    id: 'c-hr-1',
    rank: 1,
    positionId: 'hr-officer-iv',
    name: 'Maria Elena Santos',
    initials: 'MS',
    currentPosition: 'Senior HR Specialist',
    department: 'Human Resources',
    course: 'Master in Public Administration',
    matchPercent: 100,
    yearsExperience: 12,
    ipcr: 4.6,
    scorePercent: 89,
    level: 'Ready Soon',
    competencyScores: {
      'Public Administration Principles': 92,
      'Ethical Conduct & Public Service': 88,
      'Transparency and Accountability': 82,
      'Public Communication Skills': 78,
      'Data and Records Management': 80,
    },
    readinessBreakdown: {
      competencyGap: { current: 35, max: 40 },
      trainingAlignment: { current: 16, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 23, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 1, required: 1, pass: true },
      trainingHours: { current: 104, required: 80, pass: true },
      experience: { current: 12, required: 3, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['All standards met. Ready for advancement.'],
  },
  {
    id: 'c-hr-2',
    rank: 2,
    positionId: 'hr-officer-iv',
    name: 'Patricia Bautista',
    initials: 'PB',
    currentPosition: 'Senior Budget Officer',
    department: 'Finance',
    course: 'MS Accountancy',
    matchPercent: 58,
    yearsExperience: 11,
    ipcr: 4.6,
    scorePercent: 71,
    level: 'Developing',
    ...blankAnalysis,
  },
  {
    id: 'c-hr-3',
    rank: 3,
    positionId: 'hr-officer-iv',
    name: 'Carlos Domingo',
    initials: 'CD',
    currentPosition: 'Senior Administrative Officer',
    department: 'Administration',
    course: 'Master in Public Administration',
    matchPercent: 60,
    yearsExperience: 13,
    ipcr: 4.5,
    scorePercent: 68,
    level: 'Developing',
    ...blankAnalysis,
  },
  {
    id: 'c-hr-4',
    rank: 4,
    positionId: 'hr-officer-iv',
    name: 'Miguel Antonio Tan',
    initials: 'MT',
    currentPosition: 'Senior IT Specialist',
    department: 'Information Technology',
    course: 'MS Information Technology',
    matchPercent: 19,
    yearsExperience: 10,
    ipcr: 4.7,
    scorePercent: 55,
    level: 'Not Ready',
    ...blankAnalysis,
  },
  {
    id: 'c-hr-5',
    rank: 5,
    positionId: 'hr-officer-iv',
    name: 'Rosa Mae Villanueva',
    initials: 'RV',
    currentPosition: 'HR Officer II',
    department: 'Human Resources',
    course: 'BS Psychology',
    matchPercent: 94,
    yearsExperience: 7,
    ipcr: 4.3,
    scorePercent: 81,
    level: 'Ready Soon',
    missingNotes: ['Needs 80 training hours (has 64)'],
    competencyScores: {
      'Public Administration Principles': 86,
      'Ethical Conduct & Public Service': 84,
      'Transparency and Accountability': 80,
      'Public Communication Skills': 79,
      'Data and Records Management': 77,
    },
    readinessBreakdown: {
      competencyGap: { current: 32, max: 40 },
      trainingAlignment: { current: 13, max: 20 },
      yearsExperience: { current: 14, max: 15 },
      ipcrPerformance: { current: 21, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 1, required: 1, pass: true },
      trainingHours: { current: 64, required: 80, pass: false },
      experience: { current: 7, required: 3, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['Complete 16 more training hours to meet the 80-hour requirement.'],
  },
  {
    id: 'c-hr-6',
    rank: 6,
    positionId: 'hr-officer-iv',
    name: 'Sarah Bernardo',
    initials: 'SB',
    currentPosition: 'Records Officer',
    department: 'Human Resources',
    course: 'BS Business Administration',
    matchPercent: 83,
    yearsExperience: 4,
    ipcr: 4.1,
    scorePercent: 73,
    level: 'Developing',
    missingNotes: ['Missing required training(s): LEAD-101', 'Needs 80 training hours (has 40)'],
    ...blankAnalysis,
  },
  {
    id: 'c-hr-7',
    rank: 7,
    positionId: 'hr-officer-iv',
    name: 'Ramon F. Aguilar',
    initials: 'RA',
    currentPosition: 'HR Specialist',
    department: 'Human Resources',
    course: 'BS Human Resource Development Management',
    matchPercent: 85,
    yearsExperience: 5,
    ipcr: 4.0,
    scorePercent: 72,
    level: 'Developing',
    missingNotes: ['Missing required training(s): LEAD-101', 'Needs 80 training hours (has 24)'],
    ...blankAnalysis,
  },
  {
    id: 'c-hr-8',
    rank: 8,
    positionId: 'hr-officer-iv',
    name: 'Jocelyn Marasigan',
    initials: 'JM',
    currentPosition: 'HR Officer III',
    department: 'Human Resources',
    course: 'BS Psychology',
    matchPercent: 91,
    yearsExperience: 9,
    ipcr: 4.4,
    scorePercent: 84,
    level: 'Ready Soon',
    competencyScores: {
      'Public Administration Principles': 88,
      'Ethical Conduct & Public Service': 86,
      'Transparency and Accountability': 81,
      'Public Communication Skills': 80,
      'Data and Records Management': 78,
    },
    readinessBreakdown: {
      competencyGap: { current: 33, max: 40 },
      trainingAlignment: { current: 17, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 22, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 1, required: 1, pass: true },
      trainingHours: { current: 88, required: 80, pass: true },
      experience: { current: 9, required: 3, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['All standards met. Ready for advancement.'],
  },
  {
    id: 'c-hr-9',
    rank: 9,
    positionId: 'hr-officer-iv',
    name: 'Andres Villanueva',
    initials: 'AV',
    currentPosition: 'Administrative Officer V',
    department: 'Administration',
    course: 'BS Public Administration',
    matchPercent: 88,
    yearsExperience: 8,
    ipcr: 4.2,
    scorePercent: 80,
    level: 'Ready Soon',
    missingNotes: ['Needs 80 training hours (has 72)'],
    competencyScores: {
      'Public Administration Principles': 85,
      'Ethical Conduct & Public Service': 83,
      'Transparency and Accountability': 80,
      'Public Communication Skills': 77,
      'Data and Records Management': 76,
    },
    readinessBreakdown: {
      competencyGap: { current: 31, max: 40 },
      trainingAlignment: { current: 14, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 20, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 1, required: 1, pass: true },
      trainingHours: { current: 72, required: 80, pass: false },
      experience: { current: 8, required: 3, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['Complete 8 more training hours to meet the 80-hour requirement.'],
  },
  {
    id: 'c-hr-10',
    rank: 10,
    positionId: 'hr-officer-iv',
    name: 'Teresa Aquino',
    initials: 'TA',
    currentPosition: 'Training Officer',
    department: 'Human Resources',
    course: 'BS Behavioral Science',
    matchPercent: 47,
    yearsExperience: 6,
    ipcr: 4.2,
    scorePercent: 58,
    level: 'Developing',
    missingNotes: ['Missing required training(s): LEAD-101, DIGI-GOV'],
    ...blankAnalysis,
  },
  {
    id: 'c-hr-11',
    rank: 11,
    positionId: 'hr-officer-iv',
    name: 'Noel Castillo',
    initials: 'NC',
    currentPosition: 'Administrative Assistant III',
    department: 'Administration',
    course: 'BS Office Administration',
    matchPercent: 33,
    yearsExperience: 8,
    ipcr: 4.1,
    scorePercent: 52,
    level: 'Developing',
    missingNotes: ['Missing required training(s): LEAD-101, DIGI-GOV', 'Needs 80 training hours (has 48)'],
    ...blankAnalysis,
  },
  {
    id: 'c-hr-12',
    rank: 12,
    positionId: 'hr-officer-iv',
    name: 'Liza M. Torres',
    initials: 'LT',
    currentPosition: 'Operations Officer',
    department: 'Operations',
    course: 'Master in Public Administration',
    matchPercent: 19,
    yearsExperience: 7,
    ipcr: 4.4,
    scorePercent: 45,
    level: 'Not Ready',
    missingNotes: ['Missing required training(s): LEAD-101', 'Needs 80 training hours (has 56)'],
    ...blankAnalysis,
  },

  // === IT Division Chief — smaller list ===
  {
    id: 'c-it-1',
    rank: 1,
    positionId: 'it-division-chief',
    name: 'Miguel Antonio Tan',
    initials: 'MT',
    currentPosition: 'Senior IT Specialist',
    department: 'Information Technology',
    course: 'MS Information Technology',
    matchPercent: 100,
    yearsExperience: 10,
    ipcr: 4.7,
    scorePercent: 94,
    level: 'Ready Soon',
    competencyScores: {
      'Digital Literacy for Gov Services': 92,
      'Project Management in Public Setting': 88,
      'Data and Records Management': 82,
      'Technical Writing for Gov Docs': 75,
    },
    readinessBreakdown: {
      competencyGap: { current: 35, max: 40 },
      trainingAlignment: { current: 20, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 24, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 2, required: 2, pass: true },
      trainingHours: { current: 136, required: 100, pass: true },
      experience: { current: 10, required: 8, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['All standards met. Ready for advancement.'],
  },
  {
    id: 'c-it-2',
    rank: 2,
    positionId: 'it-division-chief',
    name: 'Juan Carlos Reyes',
    initials: 'JR',
    currentPosition: 'IT Officer III',
    department: 'Information Technology',
    course: 'BS Computer Science',
    matchPercent: 76,
    yearsExperience: 8,
    ipcr: 4.2,
    scorePercent: 70,
    level: 'Developing',
    missingNotes: ['Needs 100 training hours (has 96)'],
    ...blankAnalysis,
  },

  // === Municipal Administrator ===
  {
    id: 'c-ma-1',
    rank: 1,
    positionId: 'municipal-administrator',
    name: 'Carmela Reyes',
    initials: 'CR',
    currentPosition: 'Assistant Administrator',
    department: 'Administration',
    course: 'Master in Public Administration',
    matchPercent: 96,
    yearsExperience: 9,
    ipcr: 4.5,
    scorePercent: 88,
    level: 'Ready Soon',
    competencyScores: {
      'Public Administration': 92,
      'Budget Management': 88,
      'Policy Analysis': 84,
    },
    readinessBreakdown: {
      competencyGap: { current: 33, max: 40 },
      trainingAlignment: { current: 20, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 22, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 3, required: 2, pass: true },
      trainingHours: { current: 144, required: 120, pass: true },
      experience: { current: 9, required: 5, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['All standards met. Ready for advancement.'],
  },

  // === Finance Director ===
  {
    id: 'c-fd-1',
    rank: 1,
    positionId: 'finance-director',
    name: 'Daniel Lim',
    initials: 'DL',
    currentPosition: 'Budget Officer',
    department: 'Finance',
    course: 'BS Accountancy',
    matchPercent: 80,
    yearsExperience: 7,
    ipcr: 4.3,
    scorePercent: 74,
    level: 'Developing',
    missingNotes: ['Needs 10 yrs (has 7)'],
    ...blankAnalysis,
  },

  // === DRRM Officer ===
  {
    id: 'c-drrm-1',
    rank: 1,
    positionId: 'drrm-officer',
    name: 'Ramon Cruz',
    initials: 'RC',
    currentPosition: 'Emergency Response Lead',
    department: 'Operations',
    course: 'BS Disaster Risk Management',
    matchPercent: 96,
    yearsExperience: 7,
    ipcr: 4.6,
    scorePercent: 91,
    level: 'Ready Soon',
    competencyScores: {
      'Disaster Risk Assessment': 90,
      'Emergency Operations': 86,
      'Community Coordination': 82,
    },
    readinessBreakdown: {
      competencyGap: { current: 34, max: 40 },
      trainingAlignment: { current: 20, max: 20 },
      yearsExperience: { current: 15, max: 15 },
      ipcrPerformance: { current: 23, max: 25 },
    },
    eligibilityCheck: {
      trainings: { current: 2, required: 2, pass: true },
      trainingHours: { current: 96, required: 80, pass: true },
      experience: { current: 7, required: 5, pass: true },
      eligibility: { value: 'Career Service Professional (R.A. 1080)', pass: true },
    },
    recommendations: ['All standards met. Ready for advancement.'],
  },
];

export const SuccessionPlanningPage = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('planning');
  const [replacementType, setReplacementType] = useState<'permanent' | 'temporary'>('permanent');
  const [department, setDepartment] = useState<string>('');
  const [criticalPosition, setCriticalPosition] = useState<string>('');
  const [positions, setPositions] = useState<CriticalPosition[]>(INITIAL_POSITIONS);
  const [successors, setSuccessors] = useState<Successor[]>(INITIAL_SUCCESSORS);
  const [registryFilter, setRegistryFilter] = useState<'all' | SuccessorStatus>('all');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const selectedPositionObj = positions.find(p => p.title === criticalPosition);
  const candidatesForSelected = selectedPositionObj
    ? CANDIDATES.filter(c => c.positionId === selectedPositionObj.id).sort((a, b) => a.rank - b.rank)
    : [];
  const eligibleCount = candidatesForSelected.filter(c => c.level === 'Ready Soon').length;
  const notQualifiedCount = candidatesForSelected.filter(c => c.level !== 'Ready Soon').length;

  useEffect(() => {
    if (!selectedPositionObj) {
      setSelectedCandidateId(null);
      return;
    }
    const topEligible = candidatesForSelected.find(c => c.level === 'Ready Soon') ?? candidatesForSelected[0];
    setSelectedCandidateId(topEligible?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPositionObj?.id]);

  const selectedCandidate = candidatesForSelected.find(c => c.id === selectedCandidateId) ?? null;

  const designatedCount = successors.filter(s => s.status === 'designated').length;
  const promotedCount = successors.filter(s => s.status === 'promoted').length;
  const vacatedCount = successors.filter(s => s.status === 'vacated').length;
  const retiringSoonCount = positions.filter(p => /retirement/i.test(p.footer)).length;
  const readyNowCount = CANDIDATES.filter(c => c.level === 'Ready Soon' && c.scorePercent >= 88).length;
  const successorPoolCount = CANDIDATES.filter(c => c.level === 'Ready Soon').length;

  const filteredRegistry = registryFilter === 'all'
    ? successors
    : successors.filter(s => s.status === registryFilter);

  const promoteSuccessor = (id: string) => {
    setSuccessors(prev => prev.map(s => s.id === id ? { ...s, status: 'promoted' } : s));
  };
  const removeSuccessor = (id: string) => {
    setSuccessors(prev => prev.map(s => s.id === id ? { ...s, status: 'vacated' } : s));
  };

  const [addPositionOpen, setAddPositionOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [positionForm, setPositionForm] = useState<PositionForm>(blankPositionForm());

  const positionTitlesInDept = positions
    .filter(p => !department || p.department === department)
    .map(p => p.title);

  const openAddPosition = () => {
    setEditingId(null);
    setPositionForm(blankPositionForm());
    setAddPositionOpen(true);
  };

  const openEditPosition = (id: string) => {
    const p = positions.find(x => x.id === id);
    if (!p) return;
    setEditingId(id);
    setPositionForm({
      title: p.title,
      department: p.department,
      incumbent: p.incumbent,
      incumbentStatus: p.incumbentStatus,
      statusDetail: p.incumbentStatusDetail,
      yearsExperience: String(p.experienceYears),
      trainingHours: String(p.trainingHours),
      civilServiceEligibility: p.eligibility,
      courses: p.courses.join('\n'),
      includeInPlanning: true,
    });
    setAddPositionOpen(true);
  };

  const closeAddPosition = () => setAddPositionOpen(false);

  const updateForm = <K extends keyof PositionForm>(key: K, value: PositionForm[K]) => {
    setPositionForm(prev => ({ ...prev, [key]: value }));
  };

  const savePosition = () => {
    const courses = positionForm.courses
      .split('\n')
      .map(c => c.trim())
      .filter(Boolean);

    const existing = editingId ? positions.find(p => p.id === editingId) : null;
    const next: CriticalPosition = {
      id: editingId ?? `pos-${Date.now()}`,
      title: positionForm.title || 'New Position',
      department: positionForm.department,
      incumbent: positionForm.incumbent,
      incumbentStatus: positionForm.incumbentStatus,
      incumbentStatusDetail: positionForm.statusDetail,
      experienceYears: Number(positionForm.yearsExperience) || 0,
      trainingHours: Number(positionForm.trainingHours) || 0,
      eligibility: positionForm.civilServiceEligibility,
      courses,
      competencies: existing?.competencies ?? [],
      footer: positionForm.statusDetail,
    };

    setPositions(prev => {
      if (editingId) return prev.map(p => (p.id === editingId ? next : p));
      return [...prev, next];
    });
    setAddPositionOpen(false);
  };

  const deletePosition = () => {
    if (!editingId) return;
    setPositions(prev => prev.filter(p => p.id !== editingId));
    setAddPositionOpen(false);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'planning', label: 'Succession Planning' },
    { key: 'critical', label: 'Critical Positions' },
    { key: 'registry', label: 'Successor Registry' },
  ];

  return (
    <div className="space-y-6">
      {/* Page header with right-aligned tab pills */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Succession Planning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Dynamic competency-based system. Standards come from the Critical Position table.
          </p>
        </div>
        <div className="inline-flex bg-gray-100 rounded-lg p-1 self-start">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'planning' && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<AlertTriangle size={18} />}
              iconBg="bg-red-50 text-red-500"
              tag="Active standards"
              value={positions.length}
              label="Critical Positions"
            />
            <StatCard
              icon={<CalendarClock size={18} />}
              iconBg="bg-orange-50 text-orange-500"
              tag="From standards"
              value={retiringSoonCount}
              label="Retiring Soon"
            />
            <StatCard
              icon={<Award size={18} />}
              iconBg="bg-green-50 text-green-600"
              tag="Score ≥ 88"
              value={readyNowCount}
              label="Ready Now"
            />
            <StatCard
              icon={<Users size={18} />}
              iconBg="bg-blue-50 text-blue-600"
              tag="Eligible pool"
              value={successorPoolCount}
              label="Successor Pool"
            />
          </div>

          {/* Replacement selector card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {replacementType === 'permanent' ? 'Permanent Replacement' : 'Temporary Replacement'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                  {replacementType === 'permanent'
                    ? 'Cross-department · Non-negotiables: required trainings, years of experience, and civil service eligibility.'
                    : 'Within-department · Interim coverage while the incumbent is on leave or detail.'}
                </p>
              </div>
              <div className="inline-flex bg-gray-50 border border-gray-200 rounded-lg p-1 shrink-0">
                <button
                  onClick={() => setReplacementType('permanent')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                    replacementType === 'permanent'
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Permanent
                </button>
                <button
                  onClick={() => setReplacementType('temporary')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                    replacementType === 'temporary'
                      ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Temporary
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Briefcase size={14} /> Department
                </label>
                <select
                  value={department}
                  onChange={(e) => { setDepartment(e.target.value); setCriticalPosition(''); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  <Briefcase size={14} /> Critical Position
                </label>
                <select
                  value={criticalPosition}
                  onChange={(e) => setCriticalPosition(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 bg-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select critical position...</option>
                  {positionTitlesInDept.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Position detail + candidate analysis */}
          {criticalPosition && selectedPositionObj ? (
            <>
              <PositionDetailCard position={selectedPositionObj} />

              <EligibleCandidatesTable
                candidates={candidatesForSelected}
                eligibleCount={eligibleCount}
                notQualifiedCount={notQualifiedCount}
                selectedId={selectedCandidateId}
                onSelect={setSelectedCandidateId}
              />

              {selectedCandidate && (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
                    <CompetencyGapCard
                      competencies={selectedPositionObj.competencies}
                      scores={selectedCandidate.competencyScores}
                    />
                    <ReadinessRingCard candidate={selectedCandidate} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ReadinessBreakdownCard candidate={selectedCandidate} />
                    <DevelopmentRecommendationsCard candidate={selectedCandidate} />
                  </div>

                  <EligibilityCheckCard candidate={selectedCandidate} />
                </>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 text-gray-400 mb-3">
                <Briefcase size={22} />
              </div>
              <p className="text-sm text-gray-500">
                Select a department and critical position to view successor candidates.
              </p>
            </div>
          )}
        </>
      )}

      {activeTab === 'critical' && (
        <>
          {/* Management header card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Critical Position Management</h3>
              <p className="text-sm text-gray-500 mt-1">
                Define qualification standards. Only positions marked critical appear in succession planning.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" className="flex items-center gap-2">
                <Upload size={16} /> Import Standards
              </Button>
              <Button onClick={openAddPosition} className="flex items-center gap-2">
                <Plus size={16} /> Add Position
              </Button>
            </div>
          </div>

          {/* Critical positions table */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Position Title</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Department / Incumbent</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Experience</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Eligibility</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Training Hrs</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Required Courses</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors last:border-0">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900">{p.title}</span>
                        <span className="bg-red-50 text-red-600 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">Critical</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-700">{p.department}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Incumbent: {p.incumbent}</p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm text-gray-700 font-medium">{p.experienceYears} yrs</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm text-gray-700">{p.eligibility}</span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="text-sm text-gray-700 font-medium">{p.trainingHours} hrs</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {p.courses.length === 0
                          ? <span className="text-xs text-gray-400 italic">None</span>
                          : p.courses.map(c => (
                              <span key={c} className="text-xs text-gray-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">{c}</span>
                            ))
                        }
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditPosition(p.id)}
                          className="rounded-lg border border-gray-200 p-1.5 text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Settings size={14} />
                        </button>
                        <button
                          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                          title="Unmark critical"
                        >
                          Unmark
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {positions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-500">
                      No critical positions defined yet. Click "Add Position" to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'registry' && (
        <>
          {/* Registry header */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Successor Registry</h3>
              <p className="text-sm text-gray-500 mt-1">
                Repository of designated successors. Promote when the incumbent retires, resigns, or vacates the post.
              </p>
            </div>
            <Button variant="secondary" className="flex items-center gap-2 shrink-0">
              <FileText size={16} /> Print / Export
            </Button>
          </div>

          {/* Registry stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<UserCheck size={18} />}
              iconBg="bg-blue-50 text-blue-600"
              tag="Awaiting vacancy"
              value={designatedCount}
              label="Designated"
            />
            <StatCard
              icon={<CheckCircle2 size={18} />}
              iconBg="bg-green-50 text-green-600"
              tag="Already filled"
              value={promotedCount}
              label="Promoted"
            />
            <StatCard
              icon={<XCircle size={18} />}
              iconBg="bg-red-50 text-red-500"
              tag="Superseded / removed"
              value={vacatedCount}
              label="Vacated"
            />
          </div>

          {/* Filter pills */}
          <div className="flex gap-2">
            {(['all', 'designated', 'promoted', 'vacated'] as const).map(f => (
              <button
                key={f}
                onClick={() => setRegistryFilter(f)}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${
                  registryFilter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* Registry table */}
          {filteredRegistry.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white py-16 px-6 text-center text-sm text-gray-500">
              No successors in this category.
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Position</th>
                    <th className="px-5 py-3 font-semibold">Incumbent</th>
                    <th className="px-5 py-3 font-semibold">Designated Successor</th>
                    <th className="px-5 py-3 font-semibold">Readiness</th>
                    <th className="px-5 py-3 font-semibold">Assigned</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRegistry.map(s => {
                    const target = positions.find(p => p.id === s.targetPositionId);
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-900">{target?.title ?? '—'}</p>
                          <p className="text-xs text-gray-500">{target?.department ?? ''}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-gray-900">{target?.incumbent ?? '—'}</p>
                          <p className="text-xs text-gray-500">{target?.incumbentStatus ?? ''}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.currentPosition}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className={`text-sm font-semibold ${
                            s.readinessScore >= 90 ? 'text-green-700'
                            : s.readinessScore >= 75 ? 'text-blue-700'
                            : 'text-yellow-700'
                          }`}>
                            {s.readiness}
                          </p>
                          <p className="text-xs text-gray-500">{s.readinessScore}%</p>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{s.assignedDate}</td>
                        <td className="px-5 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            {s.status === 'designated' ? (
                              <>
                                <button
                                  onClick={() => promoteSuccessor(s.id)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md"
                                >
                                  <TrendingUp size={13} /> Promote
                                </button>
                                <button
                                  onClick={() => removeSuccessor(s.id)}
                                  className="text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-md"
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {addPositionOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeAddPosition}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-6 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingId ? 'Edit Critical Position' : 'Add Critical Position'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Update qualification standards. Changes apply immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAddPosition}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-6 pb-4 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Position Title">
                  <input
                    type="text"
                    value={positionForm.title}
                    onChange={(e) => updateForm('title', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Department">
                  <input
                    type="text"
                    value={positionForm.department}
                    onChange={(e) => updateForm('department', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Incumbent">
                  <input
                    type="text"
                    value={positionForm.incumbent}
                    onChange={(e) => updateForm('incumbent', e.target.value)}
                    className="form-input"
                  />
                </FormField>
                <FormField label="Incumbent Status">
                  <select
                    value={positionForm.incumbentStatus}
                    onChange={(e) => updateForm('incumbentStatus', e.target.value as PositionForm['incumbentStatus'])}
                    className="form-input bg-white"
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Retiring">Retiring</option>
                  </select>
                </FormField>
              </div>

              <FormField label="Status Detail">
                <input
                  type="text"
                  value={positionForm.statusDetail}
                  onChange={(e) => updateForm('statusDetail', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Years of Experience">
                <input
                  type="number"
                  min={0}
                  value={positionForm.yearsExperience}
                  onChange={(e) => updateForm('yearsExperience', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Training Hours">
                <input
                  type="number"
                  min={0}
                  value={positionForm.trainingHours}
                  onChange={(e) => updateForm('trainingHours', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Civil Service Eligibility">
                <input
                  type="text"
                  value={positionForm.civilServiceEligibility}
                  onChange={(e) => updateForm('civilServiceEligibility', e.target.value)}
                  className="form-input"
                />
              </FormField>

              <FormField label="Required Courses (one per line)">
                <textarea
                  rows={4}
                  value={positionForm.courses}
                  onChange={(e) => updateForm('courses', e.target.value)}
                  className="form-input font-mono text-sm resize-y"
                />
              </FormField>

              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
                  Critical Status
                </p>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={positionForm.includeInPlanning}
                    onChange={(e) => updateForm('includeInPlanning', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    Include this position in succession planning
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
              {editingId ? (
                <button
                  type="button"
                  onClick={deletePosition}
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Delete position
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={closeAddPosition}>Cancel</Button>
                <Button onClick={savePosition}>Save changes</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #d1d5db;
          padding: 0.5rem 0.75rem;
          outline: none;
        }
        .form-input:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }
      `}</style>
    </div>
  );
};

type StatCardProps = {
  icon: ReactNode;
  iconBg: string;
  tag: string;
  value: number | string;
  label: string;
};

const StatCard = ({ icon, iconBg, tag, value, label }: StatCardProps) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex items-start justify-between mb-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <span className="text-xs text-gray-500">{tag}</span>
    </div>
    <p className="text-3xl font-bold text-gray-900 leading-tight">{value}</p>
    <p className="text-sm text-gray-500 mt-1">{label}</p>
  </div>
);

type PositionCardProps = {
  position: CriticalPosition;
  onEdit: () => void;
};

const PositionCard = ({ position, onEdit }: PositionCardProps) => (
  <div className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex items-start justify-between mb-1">
      <div className="flex items-center gap-2">
        <h4 className="text-base font-bold text-gray-900">{position.title}</h4>
        <span className="bg-red-50 text-red-600 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
          Critical
        </span>
      </div>
      <button className="text-xs font-medium text-gray-600 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50">
        Unmark
      </button>
    </div>
    <p className="text-sm text-gray-500 mb-4">
      {position.department} · Incumbent: {position.incumbent}
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
      <InfoPill icon={<Clock size={14} />} label="Experience:" value={`${position.experienceYears} yrs`} />
      <InfoPill icon={<Award size={14} />} label="Eligibility:" value={position.eligibility} />
      <InfoPill icon={<BookOpen size={14} />} label="Training Hours:" value={`${position.trainingHours} hrs`} />
    </div>

    <div className="mb-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        <BookOpen size={13} /> Required Course
      </div>
      <div className="flex flex-wrap gap-2">
        {position.courses.length === 0 ? (
          <span className="text-xs text-gray-400 italic">No courses specified</span>
        ) : (
          position.courses.map(c => (
            <span key={c} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-md">
              {c}
            </span>
          ))
        )}
      </div>
    </div>

    <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
      <span className="text-gray-500">{position.footer}</span>
      <button
        onClick={onEdit}
        className="flex items-center gap-1 text-blue-600 font-medium hover:text-blue-700"
      >
        <Settings size={12} /> Click to edit
      </button>
    </div>
  </div>
);

type InfoPillProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

const InfoPill = ({ icon, label, value }: InfoPillProps) => (
  <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 text-xs">
    <span className="text-gray-400 mt-0.5">{icon}</span>
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 font-medium">{value}</span>
  </div>
);

type FormFieldProps = {
  label: string;
  children: ReactNode;
};

const FormField = ({ label, children }: FormFieldProps) => (
  <div>
    <label className="block text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const incumbentBadge = (status: CriticalPosition['incumbentStatus']) => {
  switch (status) {
    case 'Active': return 'bg-green-100 text-green-700';
    case 'On Leave': return 'bg-yellow-100 text-yellow-700';
    case 'Retiring': return 'bg-orange-100 text-orange-700';
  }
};

const PositionDetailCard = ({ position }: { position: CriticalPosition }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
    <div className="flex items-start justify-between">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <User size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900 leading-tight">{position.incumbent}</h3>
          <p className="text-sm text-gray-500">Current Incumbent · {position.incumbentStatusDetail}</p>
        </div>
      </div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${incumbentBadge(position.incumbentStatus)}`}>
        {position.incumbentStatus}
      </span>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <DetailPill icon={<Clock size={14} />} label="Min Experience:" value={`${position.experienceYears} yrs`} />
      <DetailPill icon={<Briefcase size={14} />} label="Department:" value={position.department} />
      <DetailPill icon={<Award size={14} />} label="Required Eligibility:" value={position.eligibility} />
      <DetailPill icon={<BookOpen size={14} />} label="Min Training Hours:" value={`${position.trainingHours} hrs`} />
    </div>

    {position.courses.length > 0 && (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Required Courses</p>
        <div className="flex flex-wrap gap-2">
          {position.courses.map(c => (
            <span key={c} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
              {c}
            </span>
          ))}
        </div>
      </div>
    )}

    {position.competencies.length > 0 && (
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Required Competencies</p>
        <div className="flex flex-wrap gap-2">
          {position.competencies.map(c => (
            <span key={c.name} className="text-xs text-gray-700 bg-gray-50 border border-gray-200 px-3 py-1 rounded-full">
              {c.name} · {c.required}
            </span>
          ))}
        </div>
      </div>
    )}
  </div>
);

const DetailPill = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 text-xs">
    <span className="text-gray-400">{icon}</span>
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 font-medium truncate">{value}</span>
  </div>
);

const levelStyle = (level: CandidateLevel) => {
  switch (level) {
    case 'Ready Soon': return 'bg-blue-50 text-blue-700';
    case 'Developing': return 'bg-amber-50 text-amber-700';
    case 'Not Ready': return 'bg-red-50 text-red-700';
  }
};

type EligibleCandidatesTableProps = {
  candidates: Candidate[];
  eligibleCount: number;
  notQualifiedCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const EligibleCandidatesTable = ({
  candidates,
  eligibleCount,
  notQualifiedCount,
  selectedId,
  onSelect,
}: EligibleCandidatesTableProps) => (
  <div className="rounded-xl border border-gray-200 bg-white">
    <div className="flex items-start justify-between p-6 pb-4">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Eligible Candidates</h3>
        <p className="text-sm text-gray-500 mt-1">
          {eligibleCount} eligible · {notQualifiedCount} not qualified
        </p>
      </div>
      <button
        disabled
        className="text-xs font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-3 py-1.5 cursor-not-allowed flex items-center gap-1.5"
      >
        <CheckCircle2 size={14} /> Assign as Successor (0)
      </button>
    </div>
    {candidates.length === 0 ? (
      <div className="px-6 py-10 text-center text-sm text-gray-500">
        No candidates evaluated for this position yet.
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-y border-gray-200 text-xs text-gray-600 uppercase">
            <tr>
              <th className="px-5 py-3 font-semibold w-10"></th>
              <th className="px-2 py-3 font-semibold w-10">#</th>
              <th className="px-2 py-3 font-semibold">Employee</th>
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-3 py-3 font-semibold">Match</th>
              <th className="px-3 py-3 font-semibold">Yrs</th>
              <th className="px-3 py-3 font-semibold">IPCR</th>
              <th className="px-3 py-3 font-semibold">Score</th>
              <th className="px-4 py-3 font-semibold">Level</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {candidates.map(c => {
              const isSelected = c.id === selectedId;
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-5 py-3">
                    <input type="checkbox" readOnly checked={false} className="h-4 w-4 rounded border-gray-300" />
                  </td>
                  <td className="px-2 py-3 text-gray-500 font-medium">#{c.rank}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {c.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 leading-tight">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.currentPosition} · {c.department}</p>
                        {c.missingNotes && c.missingNotes.length > 0 && (
                          <p className="text-xs text-red-600 mt-0.5">{c.missingNotes.join(' · ')}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{c.course}</td>
                  <td className="px-3 py-3 text-gray-900 font-medium">{c.matchPercent}%</td>
                  <td className="px-3 py-3 text-gray-700">{c.yearsExperience}</td>
                  <td className="px-3 py-3 text-gray-700">{c.ipcr.toFixed(1)}</td>
                  <td className="px-3 py-3 text-gray-900 font-medium">{c.scorePercent}%</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelStyle(c.level)}`}>
                      {c.level}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

type CompetencyGapCardProps = {
  competencies: Competency[];
  scores: Record<string, number>;
};

const competencyBadge = (current: number, required: number) => {
  const delta = current - required;
  const sign = delta >= 0 ? `+${delta}` : `${delta}`;
  if (delta >= 5) return { label: `Above (${sign})`, color: 'bg-green-100 text-green-700', bar: 'bg-green-500' };
  if (delta >= -4) return { label: `Meets (${sign})`, color: 'bg-orange-100 text-orange-700', bar: 'bg-orange-400' };
  return { label: `Needs Dev (${sign})`, color: 'bg-pink-100 text-pink-700', bar: 'bg-pink-500' };
};

const CompetencyGapCard = ({ competencies, scores }: CompetencyGapCardProps) => (
  <div className="rounded-xl border border-gray-200 bg-white p-6">
    <div className="flex items-center gap-2 mb-4">
      <Sparkles size={16} className="text-blue-600" />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Competency Gap Analysis</h3>
    </div>
    {competencies.length === 0 ? (
      <p className="text-sm text-gray-500">No competencies defined for this position.</p>
    ) : (
      <div className="space-y-4">
        {competencies.map(c => {
          const current = scores[c.name] ?? 0;
          const badge = competencyBadge(current, c.required);
          const pct = Math.min(100, (current / c.required) * 100);
          return (
            <div key={c.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-900">{c.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${badge.bar}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Current: {current}</span>
                <span>Required: {c.required}</span>
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-4 pt-2 text-xs">
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Above
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="h-2 w-2 rounded-full bg-orange-400" /> Meets
          </span>
          <span className="flex items-center gap-1.5 text-gray-600">
            <span className="h-2 w-2 rounded-full bg-pink-500" /> Needs Dev
          </span>
        </div>
      </div>
    )}
  </div>
);

const ReadinessRingCard = ({ candidate }: { candidate: Candidate }) => {
  const pct = candidate.scorePercent;
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference * (1 - pct / 100);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col items-center text-center">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide self-start">Readiness</h3>
      <div className="relative my-4">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="54" fill="none" stroke="#e5e7eb" strokeWidth="12" />
          <circle
            cx="70" cy="70" r="54" fill="none" stroke="#3b82f6" strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 70 70)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900">{pct}%</span>
          <span className="text-xs text-gray-500">overall</span>
        </div>
      </div>
      <span className={`text-xs font-semibold px-3 py-1 rounded-full ${levelStyle(candidate.level)}`}>
        {candidate.level}
      </span>
      <p className="text-sm text-gray-600 mt-3">{candidate.name}</p>
    </div>
  );
};

const ReadinessBreakdownCard = ({ candidate }: { candidate: Candidate }) => {
  const rows: { label: string; current: number; max: number }[] = [
    { label: 'Competency Gap Score', ...candidate.readinessBreakdown.competencyGap },
    { label: 'Training Alignment', ...candidate.readinessBreakdown.trainingAlignment },
    { label: 'Years of Experience', ...candidate.readinessBreakdown.yearsExperience },
    { label: 'IPCR Performance', ...candidate.readinessBreakdown.ipcrPerformance },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Readiness Breakdown
      </h3>
      <div className="space-y-4">
        {rows.map(r => {
          const pct = r.max === 0 ? 0 : Math.min(100, (r.current / r.max) * 100);
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-700">{r.label}</span>
                <span className="text-sm font-semibold text-gray-900">
                  {r.current}<span className="text-gray-400">/{r.max}</span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-200">
        <span className="text-sm font-semibold text-gray-900">Total</span>
        <span className="text-sm font-bold text-gray-900">{candidate.scorePercent}%</span>
      </div>
    </div>
  );
};

const DevelopmentRecommendationsCard = ({ candidate }: { candidate: Candidate }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-6">
    <div className="flex items-center gap-2 mb-4">
      <TrendingUp size={16} className="text-blue-600" />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Development Recommendations
      </h3>
    </div>
    {candidate.recommendations.length === 0 ? (
      <p className="text-sm text-gray-500">No recommendations available.</p>
    ) : (
      <ul className="space-y-2">
        {candidate.recommendations.map((r, i) => (
          <li key={i} className="flex items-start gap-2 bg-blue-50 text-blue-900 text-sm px-3 py-2 rounded-md">
            <Clock size={14} className="mt-0.5 shrink-0 text-blue-600" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const EligibilityCheckCard = ({ candidate }: { candidate: Candidate }) => {
  const e = candidate.eligibilityCheck;
  const items: { label: string; value: string; pass: boolean; icon: ReactNode }[] = [
    { label: 'Trainings', value: `${e.trainings.current} / ${e.trainings.required}`, pass: e.trainings.pass, icon: <GraduationCap size={14} /> },
    { label: 'Training Hours', value: `${e.trainingHours.current} / ${e.trainingHours.required} hrs`, pass: e.trainingHours.pass, icon: <BookOpen size={14} /> },
    { label: 'Experience', value: `${e.experience.current} / ${e.experience.required} yrs`, pass: e.experience.pass, icon: <Clock size={14} /> },
    { label: 'Eligibility', value: e.eligibility.value, pass: e.eligibility.pass, icon: <Award size={14} /> },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Eligibility Check
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map(it => (
          <div key={it.label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                {it.icon} {it.label}
              </span>
              {it.pass ? (
                <Check size={16} className="text-green-600" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const StatusBadge = ({ status }: { status: SuccessorStatus }) => {
  const map: Record<SuccessorStatus, { label: string; cls: string }> = {
    designated: { label: 'Designated', cls: 'bg-blue-100 text-blue-700' },
    promoted: { label: 'Promoted', cls: 'bg-green-100 text-green-700' },
    vacated: { label: 'Vacated', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
  );
};
