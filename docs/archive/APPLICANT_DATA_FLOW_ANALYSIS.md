# Applicant Data Flow Analysis - CICTrix HRIS

## Executive Summary

This document outlines how applicants are submitted, stored, and retrieved across the CICTrix system, with specific focus on RSP (Recruitment and Selection Process) integration.

---

## 1. Applicant Submission Flow

### 1.1 Frontend Submission Process

**Component:** [src/modules/applicant/ApplicantWizard.tsx](src/modules/applicant/ApplicantWizard.tsx)

#### Submission Steps:
1. **Step 1 - Personal Information:** User fills form with:
   - `first_name`, `middle_name`, `last_name`
   - `gender`, `email`, `contact_number`
   - `address`, `position`, `office`
   - `is_pwd` (Person with Disability flag)
   - `application_type`: 'job' or 'promotion'

2. **Step 2 - File Attachments:** User uploads required documents
   - For job applications: Transcript of Records, Resume, Birth Certificate, etc.
   - For promotion: Can upload any files

3. **Step 3 - Review & Submit:** Final confirmation

#### Applicant Payload Structure:
```javascript
{
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: string | null;
  address: string;
  contact_number: string;
  email: string;
  position: string;
  item_number: string; // Generated: ITEM-YYYY-NNNN
  office: string; // Derived from POSITION_TO_DEPARTMENT_MAP
  is_pwd: boolean;
  application_type: 'job' | 'promotion';
  status: 'New Application'; // Initial status
  
  // Promotion-specific fields
  employee_id?: string;
  current_position?: string;
  current_department?: string;
  current_division?: string;
  employee_username?: string;
}
```

### 1.2 Backend Storage - Supabase

**Table:** `applicants`

**Submission Process:**
1. Frontend inserts directly to Supabase via `supabase.from('applicants').insert(applicantPayload).select('id, item_number')`
2. **No direct backend API call** - Supabase client is used directly
3. Attachments stored in Supabase Storage bucket: `ATTACHMENTS_BUCKET`

**Stored Fields (from applicants.py):**
```python
class ApplicantBase(BaseModel):
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    gender: Optional[str] = None
    address: Optional[str] = None
    contact_number: Optional[str] = None
    email: str
    position: Optional[str] = None
    item_number: Optional[str] = None
    office: Optional[str] = None
    is_pwd: bool = False
    application_type: str = 'job'
    employee_id: Optional[str] = None
    current_position: Optional[str] = None
    current_department: Optional[str] = None
    current_division: Optional[str] = None
    employee_username: Optional[str] = None
```

### 1.3 Applicant Attachments Table

**Table:** `applicant_attachments`

**Fields:**
```python
{
  applicant_id: string;
  file_name: string;
  file_path: string;
  file_type: string; // MIME type
  file_size: number;
  document_type: string; // 'transcript_of_records', 'resume', etc.
  created_at: timestamp;
}
```

---

## 2. Backend API Endpoints

### 2.1 Applicant Endpoints

**Base Route:** `/api/applicants`

#### POST `/api/applicants/`
- **Purpose:** Create new applicant (disabled for testing)
- **Role Access:** ADMIN, PM, RSP, LND
- **Request Body:** `ApplicantCreate` model
- **Response:** `ApplicantResponse` with `id`, `status`, `created_at`
- **Error Handling:** Handles NOT NULL constraints with safe defaults

**NOT NULL Field Defaults:**
```python
not_null_fields = {
    'address': 'Not provided',
    'contact_number': 'N/A',
    'middle_name': '',
    'item_number': 'UNASSIGNED',
    'office': 'Unassigned',
    'employee_id': '',
    'current_position': '',
    'current_department': '',
    'current_division': '',
    'employee_username': '',
}
```

#### GET `/api/applicants/`
- **Purpose:** List all applicants with role-based filtering
- **Parameters:**
  - `skip`: Pagination offset (default: 0)
  - `limit`: Records per page (default: 10, max: 100)
- **Role Access:**
  - ADMIN/PM/RSP/LND: See all applicants
  - APPLICANT: See only their own profile
  - INTERVIEWER: See assigned applicants only (TODO)
- **Response:** `List[ApplicantResponse]`

#### GET `/api/applicants/{applicant_id}`
- **Purpose:** Get specific applicant
- **Role Access:** Via access control checks
- **Response:** `ApplicantResponse`

#### PUT `/api/applicants/{applicant_id}`
- **Purpose:** Update applicant
- **Role Access:** ADMIN, PM, RSP, LND
- **Request Body:** `ApplicantUpdate` model
- **Response:** Updated `ApplicantResponse`

#### PATCH `/api/applicants/{applicant_id}/status`
- **Purpose:** Update applicant evaluation status
- **Role Access:** ADMIN, PM, RSP, LND
- **Request Body:**
  ```python
  {
    status: "shortlisted" | "qualified" | "disqualified" | "hired",
    disqualification_reason: string; // Required if status == "disqualified"
  }
  ```
- **Status Mapping:**
  - `"shortlisted"` → Status: "Shortlisted"
  - `"qualified"` → Status: "Recommended for Hiring"
  - `"disqualified"` → Status: "Not Qualified"
  - `"hired"` → Status: "Hired"

### 2.2 Evaluation Endpoints

**Base Route:** `/api/evaluations`

#### GET `/api/evaluations/`
- **Purpose:** List evaluations
- **Query Parameters:**
  - `applicant_id?: string` - Filter by specific applicant
- **Role Access:**
  - ADMIN/PM/RSP/LND: See all evaluations
  - RATER/INTERVIEWER: See only their own evaluations
- **Response:** `List[EvaluationResponse]`

#### POST `/api/evaluations/`
- **Purpose:** Create evaluation
- **Role Access:** RATER, INTERVIEWER
- **Request Body:**
  ```python
  {
    applicant_id: str,
    score: float,
    comments?: str;
  }
  ```
- **Response:** `EvaluationResponse`

---

## 3. RSP (Recruitment & Selection Process) Data Retrieval

### 3.1 RSP Component Structure

**Main Component:** [src/modules/admin/RSPDashboard.tsx](src/modules/admin/RSPDashboard.tsx)

**Key Interface:**
```typescript
interface ApplicantRecord {
  id: string;
  employeeId?: string;
  full_name: string;
  email: string;
  contact_number: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  total_score: number | null;
}
```

### 3.2 RSP Data Fetching - QualifiedApplicantsRSPPage

**Component:** [src/components/QualifiedApplicantsRSPPage.tsx](src/components/QualifiedApplicantsRSPPage.tsx)

#### Fetch Flow:
```typescript
useEffect(() => {
  const loadData = async () => {
    const [applicantsResult, evaluationsResult] = await Promise.all([
      runSingleFlight('qualified-page:applicants', async () =>
        supabase.from('applicants').select('*').order('created_at', { ascending: false })
      ),
      runSingleFlight('qualified-page:evaluations', async () =>
        supabase.from('evaluations').select('*')
      ),
    ]);
    // ... mapping and state management
  };
}, []);
```

#### Key Features:
- **Direct Supabase Query:** Bypasses backend API
- **Single Flight Caching:** Prevents duplicate concurrent requests
- **Data Mapping:** Raw DB records → `ApplicantRecord` interface
- **Evaluation Tracking:** Tracks completed evaluations by applicant ID

#### Mapped Data Fields:
```typescript
{
  id: String(row?.id || ''),
  full_name: String(row?.full_name || ''),
  email: String(row?.email || ''),
  contact_number: String(row?.contact_number || ''),
  position: String(row?.position || ''),
  office: String(row?.office || ''),
  status: String(row?.status || ''),
  created_at: String(row?.created_at || ''),
  total_score: row?.total_score ? Number(row.total_score) : null,
}
```

### 3.3 QualifiedApplicantsSection - Display & Scoring

**Component:** [src/components/QualifiedApplicantsSection.tsx](src/components/QualifiedApplicantsSection.tsx)

#### Scoring Categories (CAT):
The system uses a sophisticated categorization scoring system:

| Category | Roman | Max (Original) | Max (Promotional) | Owned By | Description |
|----------|-------|----------------|-------------------|----------|-------------|
| Education | I | 20 | 20 | RSP | Bachelor's/Master's/Doctorate |
| Experience | II | 25 | 25 | RSP | Years of relevant experience |
| Performance | III | 0 | 20 | RSP | Performance rating (promo only) |
| PCPT | IV | 20 | 10 | Non-RSP | Civil Service exam score |
| Potential | V | 0 | 25 | Non-RSP | Leadership potential (promo only) |
| Written Exam | — | 100 | 100 | Non-RSP | Civil Service written exam |

#### Data Storage Keys:
- `EXAM_KEY`: `'cictrix_exam_scores'` - Stores written exam scores
- `CAT_KEY`: `'cictrix_category_scores'` - Stores category scores and remarks

#### Category Score Structure:
```typescript
interface ScoringCat {
  initialScore: number;
  finalScore: number | null;
  remarks: string;
}

interface ApplicantCategoryScores {
  education: ScoringCat;
  experience: ScoringCat;
  performance: ScoringCat;
  pcpt: ScoringCat;
  potential: ScoringCat;
  writtenExam: ScoringCat;
  appointmentType?: 'original' | 'promotional';
  positionType?: 'rank-and-file' | 'executive';
}
```

---

## 4. Data Retrieval and Transformation Layers

### 4.1 Frontend Data Layer - recruitmentData.ts

**Key Functions:**

#### `getApplicantsFromSupabase()`
```typescript
export const getApplicantsFromSupabase = async (): Promise<Applicant[]> => {
  const { data, error } = await supabase.from('applicants').select('*');
  
  // Transform to Applicant type
  return data.map((row: any) => ({
    id: row.id,
    personalInfo: {
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      middleName: row.middle_name || '',
      email: row.email || '',
      phone: row.contact_number || '',
      address: row.address || '',
      gender: row.gender || '',
      itemNumber: row.item_number || '',
    },
    position: row.position || '',
    jobPostingId: row.job_posting_id || 'unposted',
    applicationType: row.application_type || 'job',
    status: row.status || 'Pending',
    applicationDate: row.created_at || new Date().toISOString(),
    qualificationScore: 0, // Not populated from DB
    isPwd: row.is_pwd || false,
    internalApplication: row.employee_id ? {
      employeeId: row.employee_id,
      currentPosition: row.current_position,
      currentDepartment: row.current_department,
      currentDivision: row.current_division,
      employeeUsername: row.employee_username,
    } : undefined,
    // ... other fields
  }));
};
```

#### `getApplicants()`
- Returns from localStorage: `'cictrix_qualified_applicants'`
- **Note:** CRITICAL - Do NOT save applicants to localStorage
- localStorage has 5-10MB quota, would be exceeded with many applicants

### 4.2 Data Source Mode Selection

**Library:** [src/lib/dataSourceMode.ts](src/lib/dataSourceMode.ts)

The system can operate in different data source modes:
- **Mock Mode:** Uses seeded test data
- **Supabase Mode:** Fetches from live Supabase database
- **Mixed Mode:** Can combine both sources

---

## 5. Database Schema Mapping

### applicants Table
```sql
CREATE TABLE applicants (
  id: UUID PRIMARY KEY,
  first_name: VARCHAR NOT NULL,
  middle_name: VARCHAR,
  last_name: VARCHAR NOT NULL,
  gender: VARCHAR,
  address: VARCHAR NOT NULL DEFAULT 'Not provided',
  contact_number: VARCHAR NOT NULL DEFAULT 'N/A',
  email: VARCHAR NOT NULL,
  position: VARCHAR,
  item_number: VARCHAR NOT NULL DEFAULT 'UNASSIGNED',
  office: VARCHAR NOT NULL DEFAULT 'Unassigned',
  is_pwd: BOOLEAN DEFAULT FALSE,
  application_type: VARCHAR DEFAULT 'job',
  status: VARCHAR DEFAULT 'New Application',
  
  -- Promotion fields
  employee_id: VARCHAR,
  current_position: VARCHAR,
  current_department: VARCHAR,
  current_division: VARCHAR,
  employee_username: VARCHAR,
  
  -- Scoring fields
  total_score: NUMERIC,
  disqualification_reason: VARCHAR,
  
  -- Timestamps
  created_at: TIMESTAMP DEFAULT NOW(),
  updated_at: TIMESTAMP DEFAULT NOW(),
}
```

### applicant_attachments Table
```sql
CREATE TABLE applicant_attachments (
  id: UUID PRIMARY KEY,
  applicant_id: UUID REFERENCES applicants(id),
  file_name: VARCHAR NOT NULL,
  file_path: VARCHAR NOT NULL,
  file_type: VARCHAR,
  file_size: INTEGER,
  document_type: VARCHAR,
  created_at: TIMESTAMP DEFAULT NOW(),
}
```

### evaluations Table
```sql
CREATE TABLE evaluations (
  id: UUID PRIMARY KEY,
  applicant_id: UUID REFERENCES applicants(id),
  evaluator_id: VARCHAR,
  score: FLOAT,
  comments: VARCHAR,
  status: VARCHAR, -- 'completed', etc.
  
  -- Timestamps
  created_at: TIMESTAMP DEFAULT NOW(),
  updated_at: TIMESTAMP DEFAULT NOW(),
}
```

---

## 6. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    APPLICANT SUBMISSION FLOW                     │
└─────────────────────────────────────────────────────────────────┘

ApplicantWizard (Frontend)
    │
    ├─► Step 1: Form Data Input
    │       • Personal Info (name, email, position, etc.)
    │       • Application Type (job/promotion)
    │
    ├─► Step 2: File Upload
    │       • Resume, Transcripts, Certificates
    │       • Stored in Supabase Storage
    │
    └─► Step 3: Submission
            │
            └─► Supabase Insert
                    │
                    ├─► applicants table (INSERT)
                    │
                    ├─► applicant_attachments table (INSERT)
                    │
                    └─► syncApplicantSubmissionToRecruitment()
                            │
                            └─► Update localStorage for mock data


┌─────────────────────────────────────────────────────────────────┐
│              RSP APPLICANT RETRIEVAL & EVALUATION FLOW            │
└─────────────────────────────────────────────────────────────────┘

QualifiedApplicantsRSPPage (RSP Dashboard)
    │
    └─► useEffect: loadData()
            │
            ├─► runSingleFlight('qualified-page:applicants')
            │       │
            │       └─► supabase.from('applicants')
            │           .select('*')
            │           .order('created_at', { ascending: false })
            │
            ├─► runSingleFlight('qualified-page:evaluations')
            │       │
            │       └─► supabase.from('evaluations')
            │           .select('*')
            │
            └─► Data Mapping & State Management
                    │
                    ├─► Map to ApplicantRecord[]
                    │
                    ├─► Track completedEvaluationIds
                    │
                    └─► Render QualifiedApplicantsSection


QualifiedApplicantsSection (Display & Scoring)
    │
    ├─► Load category scores from localStorage (CAT_KEY)
    │
    ├─► Display applicants grouped by position/office
    │
    ├─► Scoring Interface
    │       ├─► Education (I) - RSP owned
    │       ├─► Experience (II) - RSP owned
    │       ├─► Performance (III) - RSP owned (promo only)
    │       ├─► PCPT (IV) - Non-RSP owned
    │       ├─► Potential (V) - Non-RSP owned (promo only)
    │       └─► Written Exam - Non-RSP owned
    │
    └─► Calculate overall scores
            ├─► Modal Score (sum of relevant categories)
            └─► Percentage score


┌─────────────────────────────────────────────────────────────────┐
│         STATUS UPDATE & EVALUATION RECORDING FLOW                 │
└─────────────────────────────────────────────────────────────────┘

RSP User Action (Status Update)
    │
    └─► PATCH /api/applicants/{id}/status
            │
            ├─► Validate status transition
            │
            ├─► Update Supabase applicants table
            │       • status: "Shortlisted" | "Recommended for Hiring" 
            │         | "Not Qualified" | "Hired"
            │       • disqualification_reason (if applicable)
            │
            └─► Response: Updated ApplicantResponse


Rater/Interviewer Action (Evaluation)
    │
    └─► POST /api/evaluations/
            │
            ├─► Validate applicant assignment
            │
            ├─► Insert to evaluations table
            │       • applicant_id
            │       • evaluator_id
            │       • score
            │       • comments
            │       • status: 'completed'
            │
            └─► Response: EvaluationResponse
```

---

## 7. Identified Connections and Potential Issues

### ✅ Working Connections

1. **Applicant Submission Pipeline**
   - Frontend form submission → Supabase insert → Attachment storage
   - Item number generation works correctly
   - Status initialized as "New Application"

2. **RSP Applicant Retrieval**
   - Direct Supabase query from RSP dashboard works
   - Single-flight caching prevents duplicate requests
   - Evaluation tracking links evaluations to applicants via `applicant_id`

3. **Scoring System Integration**
   - Category scores stored in localStorage with applicant ID as key
   - Supports both original and promotional appointment types
   - Modal score calculation based on appointment type

4. **Status Management**
   - Backend endpoint supports all required status transitions
   - Disqualification reason persisted when applicable
   - Status labels properly mapped

### ⚠️ Potential Issues & Gaps

#### Issue 1: **Missing `full_name` Field in Applicants Table**
- **Problem:** 
  - QualifiedApplicantsRSPPage expects `full_name` field
  - Applicants table stores `first_name`, `middle_name`, `last_name` separately
  - Backend doesn't concatenate these into `full_name` for retrieval
- **Impact:** RSP dashboard may display empty names or require extra processing
- **Solution:** Either:
  - Add computed `full_name` column to Supabase view, OR
  - Frontend should concatenate: `${first_name} ${middle_name} ${last_name}`
  - OR Backend POST endpoint should compute and store `full_name`

#### Issue 2: **Backend API Not Used for Applicant Retrieval**
- **Problem:**
  - QualifiedApplicantsRSPPage queries Supabase directly
  - ApplicantWizard queries Supabase directly for submission
  - Backend `/api/applicants/` endpoints exist but not used for RSP
- **Impact:**
  - No centralized data transformation layer
  - Security: Direct Supabase queries bypass role-based API layer
  - Inconsistent data retrieval logic (frontend vs backend)
- **Solution:**
  - Migrate RSP dashboard to use backend API: `GET /api/applicants/`
  - Implement proper authentication middleware for backend calls

#### Issue 3: **Qualification Score Not Populated from Supabase**
- **Problem:**
  - `getApplicantsFromSupabase()` sets `qualificationScore: 0`
  - Total score should come from `applicants.total_score` field
- **Impact:**
  - RSP dashboard may show `null` or incorrect scores
  - QualifiedApplicantsSection relies on `total_score` for calculations
- **Solution:** 
  - Update transformation: `qualificationScore: row.total_score ?? 0`
  - Ensure `total_score` is calculated and stored when evaluations complete

#### Issue 4: **Missing Field: `job_posting_id` in Frontend**
- **Problem:**
  - Frontend doesn't capture or store `job_posting_id` during submission
  - Applicants table has `job_posting_id` field but it's set to 'unposted'
  - RSP can't filter applicants by specific job posting
- **Impact:**
  - Can't track which job posting each applicant applied for
  - RSP job posting view can't show filtered applicants
- **Solution:**
  - Add job posting selection to ApplicantWizard
  - Capture and store `job_posting_id` with submission

#### Issue 5: **Missing `evaluator_id` Field in Frontend**
- **Problem:**
  - Evaluations table stores `evaluator_id` but no endpoint to identify current user
  - Backend requires role-based authentication to capture evaluator
- **Impact:**
  - Evaluations not attributed to specific raters
  - Can't track who performed evaluation
- **Solution:**
  - Ensure backend auth context properly extracts `user_id` from JWT
  - Implement user identification in evaluations POST endpoint

#### Issue 6: **No Status History/Audit Trail**
- **Problem:**
  - Status updates overwrite previous status
  - No record of when/who changed status
  - Only one `updated_at` timestamp for entire record
- **Impact:**
  - Can't track applicant progression through pipeline
  - No accountability for status changes
- **Solution:**
  - Add `status_changes` JSON array or separate audit table
  - Store: `{ status, changed_by, changed_at, reason }`

#### Issue 7: **Inconsistent Data Between Supabase and localStorage**
- **Problem:**
  - Mock data in localStorage (recruitment module)
  - Real data in Supabase (applicant submissions)
  - Frontend doesn't have clear strategy for which source of truth to use
- **Impact:**
  - RSP may show stale mock data instead of real applicants
  - Confusion about which data is authoritative
- **Solution:**
  - Remove localStorage fallback from `getApplicantsFromSupabase()`
  - Always use Supabase as source of truth
  - Clear deprecation of mock data in production

#### Issue 8: **Missing Applicant Attachment Integration**
- **Problem:**
  - QualifiedApplicantsSection can view attachments (FilesViewerModal)
  - But applicant records don't include attachment data
  - Attachment query not included in RSP data load
- **Impact:**
  - RSP can't easily access applicant documents without separate query
  - Inefficient data loading
- **Solution:**
  - Include applicant_attachments in RSP data load
  - Fetch as related records in Supabase query with `.match('applicant_id')`

---

## 8. Recommended Data Flow Architecture

### Current State (Frontend-Heavy)
```
Frontend (Direct Supabase)
  ├─► ApplicantWizard → Supabase (Submission)
  ├─► QualifiedApplicantsRSPPage → Supabase (Retrieval)
  └─► QualifiedApplicantsSection → localStorage (Scoring)

Backend (Bypass)
  └─► API endpoints exist but unused
```

### Recommended State (Backend-Heavy)
```
Frontend (API Only)
  ├─► ApplicantWizard → POST /api/applicants (Submission)
  ├─► QualifiedApplicantsRSPPage → GET /api/applicants (Retrieval)
  └─► QualifiedApplicantsSection → PUT /api/applicants/{id}/status (Update)

Backend (Central Control)
  ├─► Validate all data
  ├─► Transform Supabase → API models
  ├─► Enforce role-based access control
  └─► Maintain audit trail

Database (Source of Truth)
  └─► Supabase (normalized tables)
```

---

## 9. Data Field Mapping Reference

### Applicant Submission Form → Supabase Storage
| Form Field | Supabase Field | Type | Notes |
|------------|---|---|---|
| first_name | first_name | string | Required |
| middle_name | middle_name | string | Optional |
| last_name | last_name | string | Required |
| gender | gender | string | Optional, CHECK constraint |
| address | address | string | NOT NULL, default: 'Not provided' |
| contact_number | contact_number | string | NOT NULL, default: 'N/A' |
| email | email | string | Required |
| position | position | string | From job postings |
| item_number | item_number | string | Auto-generated: ITEM-YYYY-NNNN |
| office | office | string | Derived from POSITION_TO_DEPARTMENT_MAP |
| is_pwd | is_pwd | boolean | Default: false |
| application_type | application_type | string | 'job' or 'promotion' |
| — | status | string | 'New Application' (initial) |
| employee_id | employee_id | string | Promotion only |
| current_position | current_position | string | Promotion only |
| current_department | current_department | string | Promotion only |
| current_division | current_division | string | Promotion only |
| employee_username | employee_username | string | Promotion only |

### Supabase → RSP Display
| Supabase Field | RSP Interface | Type | Transformation |
|---|---|---|---|
| first_name + middle_name + last_name | full_name | string | Concatenate (MISSING - Issue #1) |
| email | email | string | Direct |
| contact_number | contact_number | string | Direct |
| position | position | string | Direct |
| office | office | string | Direct |
| status | status | string | Direct |
| created_at | created_at | string | Direct |
| total_score | total_score | number | Direct (Issue #3 - set to 0) |

---

## 10. API Sequence Diagram - Complete Applicant Lifecycle

```
Applicant                ApplicantWizard           Supabase            RSP Dashboard        Backend API
    │                         │                       │                    │                     │
    │─ Fill Form ─────────────>│                       │                    │                     │
    │                         │                       │                    │                     │
    │─ Upload Docs ──────────>│                       │                    │                     │
    │                         │                       │                    │                     │
    │─ Submit Form ──────────>│                       │                    │                     │
    │                         │                       │                    │                     │
    │                         │─ INSERT applicant ───>│                    │                     │
    │                         │<─ applicant ID ───────│                    │                     │
    │                         │                       │                    │                     │
    │                         │─ Upload files ───────>│                    │                     │
    │                         │<─ file paths ─────────│                    │                     │
    │                         │                       │                    │                     │
    │                         │─ INSERT attachments ─>│                    │                     │
    │                         │<─ success ────────────│                    │                     │
    │                         │                       │                    │                     │
    │                         │─ syncToRecruitment ──────────────────────>│                     │
    │                         │                       │                    │                     │
    │<─ Success ──────────────│                       │                    │                     │
    │                         │                       │                    │                     │
    │                         │                       │  SELECT applicants │                     │
    │                         │                       │<──────────────────┤                     │
    │                         │                       │ applicants data ──>│                     │
    │                         │                       │                    │                     │
    │                         │                       │  SELECT evaluations│                     │
    │                         │                       │<──────────────────┤                     │
    │                         │                       │ evaluations data ─>│                     │
    │                         │                       │                    │                     │
    │                         │                       │                    │─ Calculate scores  │
    │                         │                       │                    │   Store in localStorage
    │                         │                       │                    │                     │
    │                         │                       │                    │─ RSP Reviews ─────>│
    │                         │                       │                    │                     │
    │                         │                       │                    │ PATCH status ─────>│
    │                         │                       │                    │                     │
    │                         │                       │                    │              UPDATE│
    │                         │                       │                    │              applicants
    │                         │                       │                    │              table
    │                         │                       │                    │              <─────│
```

---

## 11. Testing & Validation Checklist

- [ ] Applicant submission stores all required fields correctly
- [ ] Item numbers are unique and properly formatted
- [ ] Attachments are properly associated with applicants
- [ ] RSP dashboard displays `full_name` correctly (concatenated from parts)
- [ ] Status updates properly reflect in RSP dashboard (real-time or refresh)
- [ ] Evaluation scores properly linked to applicants
- [ ] Total score calculation includes all evaluation categories
- [ ] Job posting filtering works (when job_posting_id is captured)
- [ ] Disqualification reason persists and displays
- [ ] Promotion application fields properly captured and stored
- [ ] Backend API role-based access control enforced
- [ ] No stale mock data displayed in production

---

## 12. File Reference Guide

| File | Purpose | Key Functions |
|------|---------|---|
| `src/modules/applicant/ApplicantWizard.tsx` | Applicant submission form | Form handling, file upload, Supabase insert |
| `src/components/QualifiedApplicantsRSPPage.tsx` | RSP applicant list page | Fetch applicants & evaluations from Supabase |
| `src/components/QualifiedApplicantsSection.tsx` | RSP scoring interface | Category scoring, modal calculation |
| `backend/app/routes/applicants.py` | Backend API for applicants | CRUD operations, status management |
| `backend/app/routes/evaluations.py` | Backend API for evaluations | Create/read evaluations |
| `src/lib/recruitmentData.ts` | Frontend data layer | Mock data, Supabase queries, data transforms |
| `backend/app/models/applicant.py` | Data models | Pydantic schemas for requests/responses |
| `src/types/applicant.types.ts` | Frontend types | TypeScript interfaces |

