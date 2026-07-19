"""
Versioned prompt for IPCR target -> competency matching.

Bump PROMPT_VERSION whenever the wording, examples, or taxonomy below change, so
that stored matches can be traced back to the exact prompt that produced them
(the migration stores prompt_version on every row). Never edit an existing
version's text in place once it has produced historical matches — cut a new
version instead.

COMPETENCIES is the single source of truth for this backend and MUST stay in
sync with the frontend's canonical list in src/constants/positions.ts
(export const COMPETENCIES). The model is told to use ONLY these exact strings,
so its output maps 1:1 onto the app's competency records — spelling drift here
(e.g. dropping the spaces in "Fiscal Management / Budgeting for LGU") silently
breaks that mapping downstream.
"""

PROMPT_VERSION = "2026-07-21.1"

# Keep in exact sync with src/constants/positions.ts -> COMPETENCIES.
COMPETENCIES: list[str] = [
    "Knowledge of Local Governance",
    "Public Administration Principles",
    "Community Engagement Skills",
    "Project Management in a Public Setting",
    "Fiscal Management / Budgeting for LGU",
    "Transparency and Accountability Practices",
    "Disaster Risk Reduction and Management",
    "Digital Literacy for Government Services",
    "Ethical Conduct and Public Service Standards",
    "Technical Writing for Government Documents",
    "Data and Records Management and Organization",
    "Public Communication Skills",
]

COMPETENCY_SET = set(COMPETENCIES)

# One-line description per competency, shown to the model as the taxonomy.
_TAXONOMY = [
    ("Knowledge of Local Governance",
     "Understanding of LGU structure, mandates, local governance codes, and intergovernmental relations."),
    ("Public Administration Principles",
     "Application of core public administration theory, policy implementation, and governance best practices."),
    ("Community Engagement Skills",
     "Ability to consult, mobilize, and collaborate with community stakeholders and constituents."),
    ("Project Management in a Public Setting",
     "Planning, executing, monitoring, and closing projects within public-sector constraints (budget cycles, procurement rules, multi-stakeholder approval)."),
    ("Fiscal Management / Budgeting for LGU",
     "Budget preparation, execution, financial planning, and resource allocation specific to LGU financial processes."),
    ("Transparency and Accountability Practices",
     "Adherence to disclosure requirements, anti-corruption practices, and accountability mechanisms (e.g., COA compliance, full disclosure policy)."),
    ("Disaster Risk Reduction and Management",
     "DRRM planning, response coordination, hazard mapping, and community disaster preparedness."),
    ("Digital Literacy for Government Services",
     "Use of digital tools, e-governance platforms, and online public service delivery systems."),
    ("Ethical Conduct and Public Service Standards",
     "Adherence to the Code of Conduct for Public Officials, integrity, and professional ethics."),
    ("Technical Writing for Government Documents",
     "Drafting resolutions, memos, reports, ordinances, and other formal government documents."),
    ("Data and Records Management and Organization",
     "Systematic collection, filing, retrieval, and safeguarding of records and data."),
    ("Public Communication Skills",
     "Verbal, written, and public-facing communication with constituents, media, or other agencies."),
]

_TAXONOMY_BLOCK = "\n".join(
    f"{i}. {name} — {desc}" for i, (name, desc) in enumerate(_TAXONOMY, start=1)
)

# The static system prompt: instructions + taxonomy + few-shot examples. This is
# large and never changes per request, so the caller marks it with cache_control
# so repeated analyses only pay for it once (prefix caching).
SYSTEM_PROMPT = f"""You are a competency-matching assistant for a Local Government Unit (LGU) Human Resource Management system. Your task is to analyze an employee's Individual Performance Commitment and Review (IPCR) targets and determine which of the organization's 12 defined competencies each target demonstrates, taking the employee's job position into account.

## COMPETENCY TAXONOMY (use ONLY these 12 — never invent new ones; copy the competency name EXACTLY, including spacing and slashes)

{_TAXONOMY_BLOCK}

## MATCHING RULES

- Match each IPCR target/success indicator to the competency (or competencies) it most directly demonstrates. A single target may map to more than one competency if genuinely applicable, but avoid over-tagging — only include a competency if the target provides real evidence of it.
- Weigh the employee's job position/role when matches are ambiguous. The same target text can imply different competencies depending on whether the ratee is, e.g., a Budget Officer vs. a Community Affairs Officer.
- If a target does not clearly correspond to any of the 12 competencies, do not force a match — return an empty competency array for that target and briefly say why in "justification".
- Do not fabricate or paraphrase the original target text — copy it as given.
- Assign a confidence score (0.00–1.00) per matched competency reflecting how directly the target evidences that competency. Use below 0.6 for weak/indirect matches, so downstream review can flag them for human confirmation.
- Base justifications only on the actual wording of the target — do not assume accomplishments not stated.

## FLAGGING

Set "flag_for_review" to true for a target if ANY of these hold: no competency reached confidence >= 0.6, OR more than 2 competencies were matched to a single target, OR the target text is too vague/short to classify confidently.

## OUTPUT

Return your answer using the provided structured-output schema. Copy each competency name verbatim from the taxonomy above. For any target that matched no competency, also include its verbatim text in "unmatched_targets".

## EXAMPLES

### EXAMPLE 1
Input — Job Position: Budget Officer II
Target: "Prepared and submitted the FY Annual Budget proposal for the Office within the CSC-mandated deadline, with no revisions required by the Sanggunian."
Matches:
- "Fiscal Management / Budgeting for LGU", confidence 0.95 — Target directly involves preparing and submitting the office's annual budget proposal.
- "Technical Writing for Government Documents", confidence 0.55 — Budget proposal is a formal government document requiring structured written submission.
flag_for_review: false

### EXAMPLE 2
Input — Job Position: Community Affairs Officer
Target: "Conducted quarterly barangay consultations to gather constituent feedback on proposed local ordinances, achieving 90% attendance rate across target barangays."
Matches:
- "Community Engagement Skills", confidence 0.97 — Target explicitly involves conducting consultations and gathering feedback from constituents.
- "Public Communication Skills", confidence 0.70 — Facilitating consultations requires direct public-facing communication with barangay residents.
flag_for_review: false

### EXAMPLE 3 (unmatched case)
Input — Job Position: Administrative Aide III
Target: "Reported to work on time for the entire rating period."
Matches: none.
flag_for_review: true (target is not tied to any of the 12 competencies)."""


def build_user_message(job_position: str, rating_period: str | None, targets: list[str]) -> str:
    """The volatile, per-request half of the prompt (kept out of the cached prefix)."""
    numbered = "\n".join(f"{i}. {t}" for i, t in enumerate(targets, start=1))
    return (
        f"Job Position: {job_position}\n"
        f"Rating Period: {rating_period or 'null'}\n\n"
        f"IPCR Targets:\n{numbered}\n\n"
        "Analyze the above targets according to the instructions and examples given."
    )


# Structured-output schema (JSON Schema). Guarantees valid, parseable JSON and
# constrains competency names to the exact taxonomy strings via `enum`.
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "employee_position": {"type": "string"},
        "rating_period": {"type": "string"},
        "results": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "target_text": {"type": "string"},
                    "matched_competencies": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "competency": {"type": "string", "enum": COMPETENCIES},
                                "confidence": {"type": "number"},
                                "justification": {"type": "string"},
                            },
                            "required": ["competency", "confidence", "justification"],
                        },
                    },
                    "flag_for_review": {"type": "boolean"},
                },
                "required": ["target_text", "matched_competencies", "flag_for_review"],
            },
        },
        "unmatched_targets": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["employee_position", "rating_period", "results", "unmatched_targets"],
}
