/**
 * The Individual Development Plan questionnaire — CY 2026.
 *
 * Static on purpose. The questions, their order and their wording are fixed by
 * the printed form L&D issues each year, so they live in code where a change
 * shows up in a diff, rather than in a table where a mistyped question would
 * silently alter what everyone is answering.
 *
 * Bilingual prompts are reproduced as they appear on the form: the Hiligaynon
 * in brackets is part of the question, not a translation aid, and a number of
 * respondents will read only that half.
 */

/** Item 2 on the form — the office dropdown, in the order the form lists it. */
export const IDP_OFFICES = [
  'OFFICE OF THE CITY MAYOR',
  'OFFICE OF THE CITY POPULATION OFFICER',
  'OFFICE OF THE CITY HUMAN RESOURCE MANAGEMENT OFFICER',
  'OFFICE OF THE CITY BUDGET OFFICER',
  'OFFICE OF THE CITY PLANNING AND DEVELOPMENT COORDINATOR',
  'OFFICE OF THE SANGGUNIANG PANLUNGSOD',
  'OFFICE OF THE CITY TREASURER',
  'LOCAL ECONOMIC ENTERPRISE OFFICE',
  'OFFICE OF THE CITY ASSESSOR',
  'OFFICE OF THE CITY GENERAL SERVICES OFFICER',
  'OFFICE OF THE CITY ACCOUNTANT',
  'OFFICE OF THE CITY SOCIAL WELFARE AND DEVELOPMENT OFFICER',
  'OFFICE OF THE CITY VETERINARIAN',
  'OFFICE OF THE CITY CIVIL REGISTRAR',
  'OFFICE OF THE CITY TOURISM AND DEVELOPMENT OFFICER',
  'OFFICE OF THE CITY ENVIRONMENT AND NATURAL RESOURCES OFFICER',
  'PUBLIC ORDER AND SAFETY MANAGEMENT OFFICER',
  'OFFICE OF THE CITY ARCHITECT',
  'OFFICE OF THE BUILDING OFFICIAL',
  'OFFICE OF THE CITY HEALTH OFFICER',
  'TECHNICAL INSTITUTE OF ILOILO CITY',
  'ILOILO CITY COMMUNITY COLLEGE',
  'OFFICE OF THE CITY AGRICULTURIST',
  'OFFICE OF THE CITY DISASTER RISK REDUCTION AND MANAGEMENT OFFICER',
  'OFFICE OF THE CITY ENGINEER',
  'ILOILO CITY LOCAL HOUSING OFFICE',
  'OFFICE OF THE CITY LEGAL OFFICER',
  'LOCAL ECONOMIC DEVELOPMENT AND INVESTMENT PROMOTIONS OFFICE',
  'DATA ASSESSMENT AND SYSTEMS MANAGEMENT OFFICE',
  'OFFICE OF THE CITY INTERNAL AUDIT SERVICE OFFICER',
  'OFFICE OF THE CITY ADMINISTRATOR',
] as const;

export const IDP_GENDERS = ['Male', 'Female', 'Other'] as const;

/** The explanatory block printed above the Career Development checkboxes. */
export const CAREER_DEVELOPMENT_BLURB = {
  intro:
    'This section focuses on the technical and professional growth of employees within the local government unit. It encompasses the specialized knowledge, leadership abilities, and digital tools necessary to perform specific job functions efficiently while upholding the values of ethical public service.',
  items: [
    {
      label: 'Job Specific Training',
      text: 'Specialized instruction on the technical procedures and statutory requirements unique to local department roles. (Real property appraisal, business permit processing, social welfare case management)',
    },
    {
      label: 'Leadership Training',
      text: 'Development of administrative and strategic skills for officials to effectively manage public offices and community initiatives. (Barangay governance, public policy formulation, disaster risk management)',
    },
    {
      label: 'Computer Literacy',
      text: 'Training on digital tools and software used to modernize public service delivery and record-keeping. (E-governance portal usage, digital archiving, basic office productivity tools)',
    },
    {
      label: 'Cultural Transformation',
      text: 'Programs aimed at fostering a culture of integrity, transparency, and public-first service standards within the agency. (Ethics and accountability, gender and development, citizen-centric service)',
    },
  ],
} as const;

/** The explanatory block printed above the Personal Development checkboxes. */
export const PERSONAL_DEVELOPMENT_BLURB = {
  intro:
    'This section addresses the holistic well-being and soft skills of the individual employee. It covers financial health, physical and mental wellness, and the interpersonal communication habits that build personal resilience and foster professional trust within the community.',
  items: [
    {
      label: 'Financial Literacy',
      text: 'Understanding how to handle both public budgets and personal money responsibly. (Public procurement laws, government auditing standards, personal investment for civil servants)',
    },
    {
      label: 'General Health and Wellness',
      text: 'Activities that help employees stay physically and mentally healthy to do their best work. (Work-life balance workshops, mental health awareness, workplace ergonomics)',
    },
    {
      label: 'Communication Skills',
      text: 'Practicing how to speak and write clearly when dealing with the public and colleagues. (Technical report writing, public consultation facilitation, frontline service etiquette)',
    },
    {
      label: 'Personality Development',
      text: 'Improving personal habits and professional behavior to build better trust with the community. (Values-based professionalism, time management, protocol and social graces)',
    },
  ],
} as const;

/**
 * The Career Development checkbox options, exactly as offered on the form.
 *
 * These are NOT the same set as the Personal Development options below, and
 * neither set lines up with the six rows of L&D's annual report — that
 * discrepancy is unresolved and is why the reporting screen is not built yet.
 */
export const CAREER_NEED_OPTIONS = [
  'JOB SPECIFIC TRAINING',
  'LEADERSHIP AND SUPERVISORY TRAINING',
  'COMPUTER LITERACY',
] as const;

export const PERSONAL_GOAL_OPTIONS = [
  'FINANCIAL LITERACY',
  'GENERAL HEALTH AND WELLNESS',
  'COMMUNICATION SKILLS',
  'PERSONAL DEVELOPMENT',
] as const;

export type CareerNeed = (typeof CAREER_NEED_OPTIONS)[number];
export type PersonalGoal = (typeof PERSONAL_GOAL_OPTIONS)[number];

/** Question wording, kept out of the component so the form reads as a form. */
export const IDP_QUESTIONS = {
  skillsToDevelop:
    'WHAT SPECIFIC SKILLS OR KNOWLEDGE DO YOU NEED TO DEVELOP IN THE PERFORMANCE OF YOUR DUTIES? (Ano nga ihibalo kag ikasarang ang luyag nimo pauswagon agud mas maayo ang imo pag-obra?)',
  strengthsToUtilize:
    'WHAT STRENGTHS WOULD YOU LIKE TO UTILIZE THAT ARE NOT CURRENTLY A PART OF YOUR POSITION DESCRIPTION? (Ano nga ikasarang ukon abilidad ang gusto nimo gamiton apang indi bahin sang imo job description?)',
  worksOutside:
    'ARE YOU PERFORMING WORK TASKS OUTSIDE YOUR JOB DESCRIPTION? (Nagaubra ka bala sang mga ulubrahon nga indi kabahin sang imo job description?)',
  outsideTasks: 'IF YES, WHAT ARE THOSE TASKS? (KON HUO, ANO NGA MGA BULUHATON?)',
  careerNeeds:
    'WHAT LEARNING AND DEVELOPMENT NEEDS WOULD HELP YOU IMPROVE YOUR JOB? (Ano nga mga tulun-an kag kinahanglanon sa pag-uswag ang makabulig sa imo nga mapaayo pa gid ang imo pag-ubra?)',
  careerSpecifics:
    'SPECIFIC TRAINING NEEDS BASED ON CHOICES ABOVE (Espesipiko nga mga paghanas base sa mga piliian sa ibabaw)',
  personalGoals:
    'WHAT PERSONAL DEVELOPMENT GOALS WOULD YOU WANT TO ENHANCE? (Ano nga mga tuyo sa personal nga pag-uswag ang gusto mo nga panamion?)',
  personalSpecifics:
    'SPECIFIC TRAINING NEEDS BASED ON CHOICES ABOVE (Espesipiko nga mga paghanas base sa mga piliian sa ibabaw)',
  otherTopics:
    'COULD YOU SUGGEST OTHER TOPICS FOR YOUR PERSONAL AND CAREER ADVANCEMENT NOT MENTIONED ABOVE? (May panugyan ka bala nga topiko para sa imo personal kag padayon nga pag-uswag sa karera nga wala malakip sa babaw?)',
} as const;

export const IDP_CONFIDENTIALITY_NOTE =
  'The confidentiality of this document and its attachments may be safeguarded by legal privilege. It is strictly prohibited to disclose, copy, distribute, or use this document or any of its attachments if you are not the intended recipient. Please notify the Office of the City Human Resource Management Officer - Iloilo City Government and return the document immediately, if you have received it incorrectly. Your cooperation is appreciated.';
