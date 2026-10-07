-- demo-rebuild.sql: additive catch-up of the demo public schema to production's.
-- No DROP/TRUNCATE/DELETE/UPDATE, no ALTER COLUMN TYPE, no data inserts. Re-runnable.
BEGIN;
SET LOCAL search_path = public, extensions;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS hypopg WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS index_advisor WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 2. SEQUENCES
CREATE SEQUENCE IF NOT EXISTS public.applicant_attachments_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.jobs_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.raters_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.policy_audit_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.trainings_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.evaluation_cycles_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.performance_cycles_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 NO CYCLE;
CREATE SEQUENCE IF NOT EXISTS public.ipcr_performance_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;

-- 3. NEW TABLES
-- 3a. RECREATE employees FROM PROD (user-approved deviation: demo table was empty and a different shape)
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM public.employees) THEN
    RAISE EXCEPTION 'employees is not empty; refusing to recreate';
  END IF;
END $do$;
DROP TABLE public.employees;
CREATE TABLE IF NOT EXISTS public."employees" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_number" character varying(50) NOT NULL,
  "qualified_applicant_id" uuid,
  "application_id" uuid,
  "first_name" character varying(100) NOT NULL,
  "last_name" character varying(100) NOT NULL,
  "middle_name" character varying(100),
  "suffix" character varying(20),
  "email" character varying(200),
  "phone" character varying(20),
  "alternate_phone" character varying(20),
  "current_address_street" character varying(200),
  "current_address_barangay" character varying(100),
  "current_address_city" character varying(100),
  "current_address_province" character varying(100),
  "current_address_zipcode" character varying(10),
  "permanent_address_street" character varying(200),
  "permanent_address_barangay" character varying(100),
  "permanent_address_city" character varying(100),
  "permanent_address_province" character varying(100),
  "permanent_address_zipcode" character varying(10),
  "date_of_birth" date,
  "place_of_birth" character varying(200),
  "sex" character varying(20),
  "civil_status" character varying(20),
  "nationality" character varying(100) DEFAULT 'Filipino'::character varying,
  "tin_number" character varying(50),
  "sss_number" character varying(50),
  "philhealth_number" character varying(50),
  "pagibig_number" character varying(50),
  "gsis_number" character varying(50),
  "emergency_contact_name" character varying(200),
  "emergency_contact_relationship" character varying(100),
  "emergency_contact_phone" character varying(20),
  "emergency_contact_address" text,
  "department" character varying(100) NOT NULL,
  "position" character varying(200) NOT NULL,
  "employment_status" character varying(50) DEFAULT 'Probationary'::character varying NOT NULL,
  "plantilla_num" character varying(50),
  "date_hired" date,
  "date_regularized" date,
  "date_separated" date,
  "office_location" character varying(200),
  "work_schedule" character varying(100),
  "reports_to" uuid,
  "status" character varying(50) DEFAULT 'Active'::character varying,
  "separation_reason" character varying(100),
  "separation_remarks" text,
  "user_account_id" uuid,
  "user_role" character varying(50) DEFAULT 'employee'::character varying,
  "account_status" character varying(50) DEFAULT 'Pending'::character varying,
  "last_login" timestamp with time zone,
  "photo_url" character varying(500),
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "modified_by" uuid,
  "modified_at" timestamp with time zone DEFAULT now(),
  "personal_details_finalized" boolean DEFAULT false NOT NULL,
  "position_id" numeric,
  "division" character varying(200),
  "highest_educational_attainment" character varying(100),
  "eligibility" character varying(200),
  "height_m" numeric(4,2),
  "weight_kg" numeric(5,2),
  "blood_type" text,
  "umid_number" text,
  "philsys_number" text,
  "citizenship" text,
  "citizenship_basis" text,
  "dual_citizenship_country" text,
  "telephone_number" text,
  "mobile_number" text,
  "residential_house_lot" text,
  "residential_street" text,
  "residential_subdivision" text,
  "residential_barangay" text,
  "residential_city" text,
  "residential_province" text,
  "residential_zip" text,
  "permanent_house_lot" text,
  "permanent_street" text,
  "permanent_subdivision" text,
  "permanent_barangay" text,
  "permanent_city" text,
  "permanent_province" text,
  "permanent_zip" text,
  "spouse_surname" text,
  "spouse_first_name" text,
  "spouse_middle_name" text,
  "spouse_suffix" text,
  "spouse_occupation" text,
  "spouse_employer" text,
  "spouse_business_address" text,
  "spouse_telephone" text,
  "father_surname" text,
  "father_first_name" text,
  "father_middle_name" text,
  "father_suffix" text,
  "mother_surname" text,
  "mother_first_name" text,
  "mother_middle_name" text,
  "pds_signed_at" timestamp with time zone,
  "pds_updated_at" timestamp with time zone,
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."access_change_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "role" text,
  "office_name" text,
  "employee_name" text,
  "successor_name" text,
  "performed_by" text,
  "details" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "access_change_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."accounts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "full_name" text NOT NULL,
  "employee_code" text,
  "role" text NOT NULL,
  "office" text,
  "position_title" text,
  "date_hired" date,
  "status" text DEFAULT 'Active'::text NOT NULL,
  "created_by_pm" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."applicant_attachments" (
  "id" bigint DEFAULT nextval('applicant_attachments_id_seq'::regclass) NOT NULL,
  "file_name" character varying(255) NOT NULL,
  "file_path" text NOT NULL,
  "file_type" character varying(100) NOT NULL,
  "file_size" integer NOT NULL,
  "document_type" character varying(100) DEFAULT 'other'::character varying,
  "created_at" timestamp with time zone DEFAULT now(),
  "applicant_id" uuid NOT NULL,
  CONSTRAINT "applicant_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."applicants" (
  "address" text NOT NULL,
  "contact_number" character varying(50) NOT NULL,
  "email" character varying(255) NOT NULL,
  "position" character varying(255) NOT NULL,
  "item_number" character varying(100) NOT NULL,
  "office" character varying(255) NOT NULL,
  "is_pwd" boolean DEFAULT false,
  "status" character varying(50) DEFAULT 'Pending'::character varying,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "first_name" character varying(255) NOT NULL,
  "middle_name" character varying(255),
  "last_name" character varying(255) NOT NULL,
  "gender" character varying(10),
  "application_type" text,
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" character varying,
  "current_position" character varying,
  "current_department" character varying,
  "current_division" character varying,
  "employee_username" character varying,
  "exam_date" date,
  "exam_time" time without time zone,
  "interview_date" date,
  "interview_time" time without time zone,
  "assigned_interviewer_email" text,
  "education_level" text,
  "years_of_experience" numeric,
  "oral_exam_date" date,
  "oral_exam_time" time without time zone,
  "venue" text,
  "schedule_instructions" text,
  "disqualified_at" timestamp with time zone,
  "disqualification_reason" text,
  "disqualification_reason_category" text,
  "disqualification_message" text,
  "disqualification_message_visible" boolean DEFAULT false NOT NULL,
  "disqualified_by" uuid,
  "is_final" boolean DEFAULT false NOT NULL,
  "education_degree" text,
  "education_school" text,
  "needs_slot_reassignment" boolean DEFAULT false NOT NULL,
  "reference_no" text,
  "reference_no_normalized" text GENERATED ALWAYS AS (upper(regexp_replace(COALESCE(reference_no, ''::text), '[^A-Za-z0-9]'::text, ''::text, 'g'::text))) STORED,
  "missed_activity_type" text,
  "missed_activity_date" date,
  "missed_activity_time" time without time zone,
  CONSTRAINT "applicants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."application_activity_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_label" text NOT NULL,
  "event_description" text,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "visible_to_applicant" boolean DEFAULT true NOT NULL,
  CONSTRAINT "application_activity_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."application_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "application_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "status" text DEFAULT 'missing'::text NOT NULL,
  "uploaded_at" timestamp with time zone,
  CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."application_plantilla_slots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "applicant_id" uuid NOT NULL,
  "plantilla_slot_id" uuid NOT NULL,
  "status" text DEFAULT 'applied'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "application_plantilla_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evaluator_id" uuid NOT NULL,
  "assignment_type" character varying(50) NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now(),
  "applicant_id" uuid NOT NULL,
  CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."competencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."competency_change_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "position" text,
  "competency_name" text,
  "summary" text,
  "approved_by" text,
  "source" text DEFAULT 'direct'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competency_change_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."competency_dictionary" (
  "competency_id" bigint NOT NULL,
  "competency_standard" jsonb,
  "training_stream" text,
  CONSTRAINT "Competency Dictionary_pkey" PRIMARY KEY ("competency_id")
);

CREATE TABLE IF NOT EXISTS public."competency_requirement_proposals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "position" text NOT NULL,
  "competency_name" text NOT NULL,
  "description" text,
  "proficiency_level" text,
  "target_requirement_id" uuid,
  "rsp_input" boolean DEFAULT false NOT NULL,
  "submitted_by" text,
  "status" text DEFAULT 'Pending'::text NOT NULL,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "competency_requirement_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."competency_standards" (
  "id" integer NOT NULL,
  "competency_name" text NOT NULL,
  "training_stream" text NOT NULL,
  CONSTRAINT "competency_standards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."critical_position_competency_requirements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "critical_position_id" uuid NOT NULL,
  "competency_id" uuid NOT NULL,
  "required_level" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "critical_position_competency_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."critical_position_training_requirements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "critical_position_id" uuid NOT NULL,
  "training_title" text NOT NULL,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "critical_position_training_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."critical_positions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid NOT NULL,
  "title" text NOT NULL,
  "incumbent_employee_id" uuid,
  "criticality_reason" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "position_description" text,
  "required_successors_count" integer DEFAULT 1 NOT NULL,
  "min_years_experience" numeric(4,1),
  "min_ipcr_rating" text,
  "required_education" text,
  "required_eligibility" text,
  "required_certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required_training_hours" numeric(6,1),
  "required_training_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "succession_weights" jsonb,
  "incumbent_leaving_date" date,
  CONSTRAINT "critical_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."cycle_compilations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid,
  "office_name" text,
  "period" text,
  "kind" text NOT NULL,
  "group_name" text,
  "compiled_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cycle_compilations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."cycle_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "stage" text,
  "action" text,
  "performed_by" uuid,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text,
  CONSTRAINT "cycle_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."demo_offices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "demo_offices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."demo_settings" (
  "id" integer DEFAULT 1 NOT NULL,
  "simulated_date" date,
  "offset_days" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "demo_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."department_weighting_configs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department_id" uuid NOT NULL,
  "schema_option_id" uuid NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "set_by_employee_id" uuid,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "department_weighting_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."departments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" character varying(20) NOT NULL,
  "name" character varying(100) NOT NULL,
  "head_employee_id" uuid,
  "parent_department_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."departments_backfill_audit" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "legacy_value" character varying(200),
  "resolved_to" character varying(100),
  "resolution" character varying(20) NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "departments_backfill_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."eligibility_types" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "points" numeric(6,2) DEFAULT 0 NOT NULL,
  "points_for_full_marks" numeric(6,2) DEFAULT 100 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "eligibility_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_children" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "full_name" text NOT NULL,
  "date_of_birth" date,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_children_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_competencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "competency_id" uuid NOT NULL,
  "proficiency_level" integer,
  "required_level" integer,
  "assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "assessed_by" text,
  "cycle_id" integer,
  CONSTRAINT "employee_competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_competency_summaries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "cycle_id" integer,
  "strengths" text NOT NULL,
  "improvements" text NOT NULL,
  "recommendations" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_competency_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "document_type" character varying(100) NOT NULL,
  "status" character varying(20) DEFAULT 'Pending'::character varying,
  "file_type" character varying(120),
  "file_url" character varying(500),
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "document_name" character varying(200),
  "file_name" character varying(200),
  "file_size" integer,
  "category" character varying(20) DEFAULT 'compliance'::character varying NOT NULL,
  "due_date" date,
  "requested_by" character varying(160),
  "description" text,
  "request_source" character varying(10) DEFAULT 'HR'::character varying,
  CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_education" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "level" character varying(50) NOT NULL,
  "school_name" character varying(200) NOT NULL,
  "course" character varying(200),
  "year_graduated" integer,
  "units_earned" integer,
  "year_attended_from" integer,
  "year_attended_to" integer,
  "honors_awards" character varying(200),
  "created_at" timestamp with time zone DEFAULT now(),
  "period_from" text,
  "period_to" text,
  "highest_level_units" text,
  "scholarship_honors" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "employee_education_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_eligibility" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "eligibility_type" character varying(200) NOT NULL,
  "rating" numeric(5,2),
  "date_of_exam" date,
  "place_of_examination" character varying(200),
  "license_number" character varying(100),
  "validity_date" date,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "employee_eligibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_history" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "action" character varying(50) NOT NULL,
  "field_changed" character varying(100),
  "old_value" text,
  "new_value" text,
  "effective_date" date,
  "reason" text,
  "remarks" text,
  "performed_by" uuid NOT NULL,
  "performed_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "employee_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_leave_balances" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "year" integer NOT NULL,
  "vacation_leave_balance" numeric(5,2) DEFAULT 15.00,
  "vacation_leave_earned" numeric(5,2) DEFAULT 0,
  "vacation_leave_used" numeric(5,2) DEFAULT 0,
  "sick_leave_balance" numeric(5,2) DEFAULT 15.00,
  "sick_leave_earned" numeric(5,2) DEFAULT 0,
  "sick_leave_used" numeric(5,2) DEFAULT 0,
  "maternity_leave_balance" numeric(5,2) DEFAULT 105.00,
  "maternity_leave_used" numeric(5,2) DEFAULT 0,
  "paternity_leave_balance" numeric(5,2) DEFAULT 7.00,
  "paternity_leave_used" numeric(5,2) DEFAULT 0,
  "special_leave_balance" numeric(5,2) DEFAULT 3.00,
  "special_leave_used" numeric(5,2) DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "employee_leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "period" text,
  "link" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "email_notifications_enabled" boolean DEFAULT true,
  "notification_frequency" character varying(50) DEFAULT 'daily'::character varying,
  "profile_visibility" character varying(50) DEFAULT 'private'::character varying,
  "preferred_language" character varying(20) DEFAULT 'en'::character varying,
  "timezone" character varying(50) DEFAULT 'Asia/Manila'::character varying,
  "work_mode" character varying(50),
  "emergency_contact_verified" boolean DEFAULT false,
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "employee_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_training" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "training_title" character varying(200) NOT NULL,
  "training_type" character varying(50),
  "conducted_by" character varying(200),
  "sponsor" character varying(200),
  "from_date" date NOT NULL,
  "to_date" date NOT NULL,
  "number_of_hours" numeric(5,2),
  "certificate_number" character varying(100),
  "created_at" timestamp with time zone DEFAULT now(),
  "attendance_percentage" numeric(5,2),
  "enrollment_id" uuid,
  CONSTRAINT "employee_training_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_training_competencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_training_id" uuid NOT NULL,
  "competency_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employee_training_competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."employee_work_experience" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "position_title" character varying(200) NOT NULL,
  "company_name" character varying(200) NOT NULL,
  "from_date" date NOT NULL,
  "to_date" date,
  "is_present" boolean DEFAULT false,
  "is_government_service" boolean DEFAULT false,
  "duties_responsibilities" text,
  "separation_reason" character varying(200),
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "employee_work_experience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."evaluation_cycles" (
  "id" integer DEFAULT nextval('evaluation_cycles_id_seq'::regclass) NOT NULL,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text,
  "created_at" timestamp without time zone DEFAULT now(),
  CONSTRAINT "evaluation_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evaluator_id" uuid,
  "score" numeric(5,2),
  "comments" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "communication_skills_score" integer,
  "confidence_score" integer,
  "comprehension_score" integer,
  "personality_score" integer,
  "job_knowledge_score" integer,
  "overall_impression_score" numeric,
  "communication_skills_remarks" text,
  "confidence_remarks" text,
  "comprehension_remarks" text,
  "personality_remarks" text,
  "job_knowledge_remarks" text,
  "overall_impression_remarks" text,
  "interview_notes" text,
  "interviewer_name" character varying(255),
  "recommendation" character varying(50),
  "applicant_id" uuid NOT NULL,
  "job_posting_id" uuid,
  "email" character varying(200),
  CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."fgd_notes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "department" text NOT NULL,
  "session_date" date NOT NULL,
  "facilitator" text,
  "participants" text[],
  "training_need" text NOT NULL,
  "category" text,
  "competency_name" text,
  "notes" text,
  "source_label" text DEFAULT 'FGD'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fgd_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."idp_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "goal_title" text NOT NULL,
  "competency_name" text,
  "target_date" date,
  "current_level" integer,
  "target_level" integer,
  "status" text DEFAULT 'In Progress'::text NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "idp_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_accomplishments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "actual_accomplishment" text,
  "q_rating" integer,
  "e_rating" integer,
  "t_rating" integer,
  "original_accomplishment" text,
  "revised_accomplishment" text,
  "is_revised" boolean DEFAULT false NOT NULL,
  "revised_by" uuid,
  "revision_remarks" text,
  "submitted_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  CONSTRAINT "ipcr_accomplishments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_audit_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_setting_id" uuid NOT NULL,
  "action" text NOT NULL,
  "field_changed" text,
  "old_value" text,
  "new_value" text,
  "performed_by" uuid,
  "performed_by_role" text,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_competency_matches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_position" text NOT NULL,
  "rating_period" text,
  "target_text" text NOT NULL,
  "competency" text,
  "confidence" numeric(3,2),
  "justification" text,
  "flag_for_review" boolean DEFAULT false NOT NULL,
  "prompt_version" text NOT NULL,
  "model" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "success_indicator_id" uuid,
  CONSTRAINT "ipcr_competency_matches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_designated_approvers" (
  "employee_id" uuid NOT NULL,
  "approver_employee_id" uuid,
  "approver_source" text DEFAULT 'unassigned'::text NOT NULL,
  "is_dual_role" boolean DEFAULT false NOT NULL,
  "office_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_designated_approvers_pkey" PRIMARY KEY ("employee_id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "phase" text NOT NULL,
  "office_id" uuid,
  "office_name" text,
  "period" text,
  "employee_count" integer DEFAULT 0 NOT NULL,
  "message" text,
  "triggered_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_performance" (
  "id" bigint DEFAULT nextval('ipcr_performance_id_seq'::regclass) NOT NULL,
  "ipcr_id" character varying,
  "ipcr_row_id" character varying,
  "employee_num" character varying,
  "position_id" integer,
  "position" text,
  "plantilla_num" integer,
  "rating_period" text,
  "function_type" text,
  "target_text" text,
  "accomplishment_text" text,
  "q_rating" integer,
  "e_rating" integer,
  "t_rating" integer,
  "ave_rating" numeric(5,2),
  "competency_id" bigint,
  "mapped_competency_standard" text,
  CONSTRAINT "ipcr_performance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_rating_scale" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "rating" smallint NOT NULL,
  "label" text NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_rating_scale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_schedules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "cycle_type" text DEFAULT 'Regular'::text NOT NULL,
  "phase" integer DEFAULT 1 NOT NULL,
  "phase_start_date" date,
  "phase_due_date" date,
  "status" text DEFAULT 'Not Started'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_name" text,
  "office_id" uuid,
  "office_name" text,
  "period" text NOT NULL,
  "phase" text NOT NULL,
  "stage" text DEFAULT 'Not Started'::text NOT NULL,
  "forwarded_at" timestamp with time zone,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_targets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "schedule_id" uuid,
  "mfo_pap" text,
  "success_indicator" text,
  "category" text,
  "item_weight_pct" numeric(6,2),
  "category_weight_pct" numeric(6,2),
  "original_mfo_pap" text,
  "original_success_indicator" text,
  "revised_mfo_pap" text,
  "revised_success_indicator" text,
  "is_revised" boolean DEFAULT false NOT NULL,
  "revised_by" uuid,
  "revision_remarks" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ipcr_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."ipcr_workspace" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_num" text,
  "employee_name" text,
  "office_id" uuid,
  "office_name" text,
  "period" text NOT NULL,
  "status" text DEFAULT 'Draft Targets'::text NOT NULL,
  "core_target" text,
  "strategic_target" text,
  "support_target" text,
  "targets_submitted_at" timestamp with time zone,
  "core_accomplishment" text,
  "strategic_accomplishment" text,
  "support_accomplishment" text,
  "core_rating" numeric(4,2),
  "strategic_rating" numeric(4,2),
  "support_rating" numeric(4,2),
  "accomplishments_submitted_at" timestamp with time zone,
  "overall_score" numeric(4,2),
  "adjectival" text,
  "pdf_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "core_quality" numeric(4,2),
  "core_efficiency" numeric(4,2),
  "core_timeliness" numeric(4,2),
  "core_weight" numeric(5,2),
  "strategic_quality" numeric(4,2),
  "strategic_efficiency" numeric(4,2),
  "strategic_timeliness" numeric(4,2),
  "strategic_weight" numeric(5,2),
  "support_quality" numeric(4,2),
  "support_efficiency" numeric(4,2),
  "support_timeliness" numeric(4,2),
  "support_weight" numeric(5,2),
  CONSTRAINT "ipcr_workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."jobs" (
  "id" bigint DEFAULT nextval('jobs_id_seq'::regclass) NOT NULL,
  "title" character varying(255) NOT NULL,
  "item_number" character varying(100) NOT NULL,
  "department" character varying(255) NOT NULL,
  "description" text,
  "status" character varying(50) DEFAULT 'Open'::character varying,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."locked_targets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_name" text,
  "office_id" uuid,
  "office_name" text,
  "period" text,
  "targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "verified_by" text,
  "verified_at" timestamp with time zone,
  "locked_by" text,
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "locked_targets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."mfos" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "target_setting_id" uuid NOT NULL,
  "function_type" text NOT NULL,
  "title" text DEFAULT ''::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mfos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."new_entrant_onboarding" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_name" text,
  "office_id" uuid,
  "office_name" text,
  "start_date" date,
  "orientation_date" date,
  "target_setting_deadline" date,
  "orientation_conducted_by" text,
  "orientation_completed_date" date,
  "initial_target_stage" text DEFAULT 'Not Started'::text NOT NULL,
  "notes" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "new_entrant_onboarding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."newly_hired" (
  "id" text NOT NULL,
  "applicant_id" text,
  "first_name" text,
  "last_name" text,
  "email" text,
  "phone" text,
  "position" text,
  "department" text,
  "division" text,
  "employment_type" text,
  "salary_grade" text,
  "date_hired" timestamp without time zone,
  "expected_start_date" timestamp without time zone,
  "supervisor" text,
  "status" text,
  "onboarding_progress" integer,
  "deployed_date" timestamp without time zone,
  "employee_id" text,
  "plantilla_item_number" text,
  "plantilla_slot_number" integer,
  CONSTRAINT "newly_hired_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recipient_role" text,
  "recipient_id" uuid,
  "message" text NOT NULL,
  "type" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."office_cycle_closeouts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "office_id" uuid,
  "office_name" text,
  "period" text,
  "ipcr_verified" integer DEFAULT 0 NOT NULL,
  "ipcr_total" integer DEFAULT 0 NOT NULL,
  "dpcr_count" integer DEFAULT 0 NOT NULL,
  "opcr_count" integer DEFAULT 0 NOT NULL,
  "archived" boolean DEFAULT true NOT NULL,
  "closed_by" text,
  "closed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "office_cycle_closeouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."office_role_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "employee_name" text,
  "office_id" uuid,
  "office_name" text,
  "role" text NOT NULL,
  "account_username" text,
  "account_password" text,
  "must_change_password" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'Active'::text NOT NULL,
  "assigned_by" text,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_by" text,
  "revoked_at" timestamp with time zone,
  "revoke_reason" text,
  "successor_employee_id" uuid,
  "successor_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "office_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."performance_cycles" (
  "id" integer DEFAULT nextval('performance_cycles_id_seq'::regclass) NOT NULL,
  "title" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text DEFAULT 'Planned'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "performance_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."performance_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "cycle_id" integer,
  "status" text DEFAULT 'Planning'::text NOT NULL,
  "final_score" numeric(4,2),
  "period" text,
  "supervisor_id" uuid,
  "submitted_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "rejection_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "performance_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."phase_schedules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "scope" text DEFAULT 'system'::text NOT NULL,
  "office_id" uuid,
  "office_name" text,
  "phase" text NOT NULL,
  "mode" text DEFAULT 'Auto'::text NOT NULL,
  "start_date" date,
  "deadline_date" date,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "phase_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."plantilla_slots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "job_posting_id" uuid NOT NULL,
  "slot_number" integer NOT NULL,
  "item_number" text NOT NULL,
  "salary_grade" integer,
  "monthly_salary" numeric(12,2),
  "status" text DEFAULT 'open'::text NOT NULL,
  "filled_by_applicant_id" uuid,
  "filled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "plantilla_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."policy_audit" (
  "id" bigint DEFAULT nextval('policy_audit_id_seq'::regclass) NOT NULL,
  "changed_at" timestamp with time zone DEFAULT now(),
  "table_schema" text,
  "table_name" text,
  "policy_name" text,
  "action" text,
  "details" jsonb,
  CONSTRAINT "policy_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."position_competencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "position_id" uuid NOT NULL,
  "competency_id" uuid NOT NULL,
  "required_level" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "position_competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."position_competency_requirements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "position_title" text NOT NULL,
  "competency_id" integer NOT NULL,
  "proficiency_level" text NOT NULL,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source" text DEFAULT 'manual'::text NOT NULL,
  CONSTRAINT "position_competency_requirements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."probationary_ipcr_schedules" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "period_label" text NOT NULL,
  "hired_month" text NOT NULL,
  "target_start" date NOT NULL,
  "target_end" date NOT NULL,
  "accomplishment_start" date NOT NULL,
  "accomplishment_end" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "probationary_ipcr_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."promotional_applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" text NOT NULL,
  "employee_name" text NOT NULL,
  "current_position" text,
  "position_applied_for" text NOT NULL,
  "date_applied" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "remarks" text,
  "decided_by" text,
  "decided_at" timestamp with time zone,
  CONSTRAINT "promotional_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."qualification_standards" (
  "competency_id" bigint NOT NULL,
  "position_id" integer NOT NULL,
  "position" text,
  "plantilla_num" integer,
  "department" text,
  "competency_standard_title" text,
  "function_type" text,
  "required_proficiency_level" numeric(5,2),
  CONSTRAINT "qualification_standards_pkey" PRIMARY KEY ("competency_id", "position_id")
);

CREATE TABLE IF NOT EXISTS public."raters" (
  "id" bigint DEFAULT nextval('raters_id_seq'::regclass) NOT NULL,
  "name" character varying(255) NOT NULL,
  "email" character varying(255) NOT NULL,
  "department" character varying(255),
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "assigned_positions" text[] DEFAULT '{}'::text[] NOT NULL,
  CONSTRAINT "raters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."semester_transition_state" (
  "id" integer DEFAULT 1 NOT NULL,
  "current_cycle_id" integer,
  "new_cycle_id" integer,
  "completion_status" text DEFAULT 'in_progress'::text NOT NULL,
  "completed_count" integer DEFAULT 0 NOT NULL,
  "expected_count" integer DEFAULT 0 NOT NULL,
  "confirmed_by" text,
  "confirmed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "semester_transition_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."seminar_batches" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sent_by" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "returned_at" timestamp with time zone,
  "returned_by" text,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seminar_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."seminar_recommendation_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recommendation_id" uuid,
  "session_id" uuid,
  "employee_id" uuid,
  "action" text NOT NULL,
  "reason" text,
  "actor" text,
  "actor_department" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "seminar_recommendation_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."success_indicator_ratings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "success_indicator_id" uuid NOT NULL,
  "quality" integer,
  "efficiency" integer,
  "timeliness" integer,
  "rated_by" uuid,
  "overridden_by" uuid,
  "overridden_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "accomplishment" text,
  CONSTRAINT "success_indicator_ratings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."success_indicators" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "mfo_id" uuid NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "success_indicators_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."succession_candidate_remarks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "critical_position_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "remarks" text,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "succession_candidate_remarks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."succession_candidates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "critical_position_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "note" text,
  "added_by" text,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "succession_candidates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."supervisor_password_resets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "supervisor_id" text,
  "supervisor_username" text,
  "reset_by" text,
  "action" text DEFAULT 'temporary'::text NOT NULL,
  "note" text,
  "reset_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supervisor_password_resets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."supervisors" (
  "id" text NOT NULL,
  "full_name" text NOT NULL,
  "department" text,
  "position" text,
  "username" text NOT NULL,
  "password" text NOT NULL,
  "account_status" text DEFAULT 'Active'::text NOT NULL,
  "must_change_password" boolean DEFAULT false NOT NULL,
  "is_default_password" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supervisors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."target_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "cycle_id" integer NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "submitted_at" timestamp with time zone,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "returned_at" timestamp with time zone,
  "phase2_status" text DEFAULT 'not_started'::text NOT NULL,
  "phase2_completed_at" timestamp with time zone,
  "phase2_open_target_date" date,
  "phase2_opened_at" timestamp with time zone,
  "phase2_opened_by" text,
  "phase2_submitted_at" timestamp with time zone,
  "phase2_closed_at" timestamp with time zone,
  "phase2_closed_by" text,
  "phase2_approved_at" timestamp with time zone,
  "phase2_approved_by" uuid,
  CONSTRAINT "target_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_attendance_days" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enrollment_id" uuid NOT NULL,
  "day_date" date NOT NULL,
  "status" text,
  "excuse_note" text,
  "updated_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "session" text NOT NULL,
  CONSTRAINT "training_attendance_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_competencies" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "competency_id" uuid NOT NULL,
  "weight" smallint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_competency_tags" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "name_key" text NOT NULL,
  "category" text,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_competency_tags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_course_draft_member_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "draft_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "action" text NOT NULL,
  "reason" text NOT NULL,
  "actor_role" text NOT NULL,
  "actor_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_course_draft_member_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_course_draft_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "draft_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "state" text DEFAULT 'Included'::text NOT NULL,
  "reason" text NOT NULL,
  "actor_role" text NOT NULL,
  "actor_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_course_draft_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_course_drafts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "objectives" text[] DEFAULT '{}'::text[] NOT NULL,
  "instructor_name" text,
  "instructor_title" text,
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone,
  "location" text,
  "capacity" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'Draft'::text NOT NULL,
  "return_note" text,
  "sent_at" timestamp with time zone,
  "returned_at" timestamp with time zone,
  "finalized_at" timestamp with time zone,
  "session_id" uuid,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "target_department_id" uuid NOT NULL,
  CONSTRAINT "training_course_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_enrollments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "status" text DEFAULT 'Enrolled'::text NOT NULL,
  "completed_at" timestamp with time zone,
  "score" numeric,
  "created_at" timestamp with time zone DEFAULT now(),
  "enrollment_status" text DEFAULT 'Confirmed'::text NOT NULL,
  "added_by" text,
  "added_by_role" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "removed_reason" text,
  "removed_by_role" text,
  "removed_at" timestamp with time zone,
  "attendance_status" text,
  "pre_test_score" numeric,
  "post_test_score" numeric,
  "evaluation_type" text DEFAULT 'quiz_score'::text NOT NULL,
  "submission_file_path" text,
  CONSTRAINT "training_enrollments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "enrollment_id" uuid NOT NULL,
  "assessment_mode" text DEFAULT 'test'::text NOT NULL,
  "pre_test_score" numeric(5,2),
  "post_test_score" numeric(5,2),
  "submission_url" text,
  "submission_name" text,
  "submission_notes" text,
  "review_status" text DEFAULT 'Pending'::text NOT NULL,
  "lnd_notes" text,
  "updated_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_plan_entries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "plan_year" integer NOT NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "tentative_start_date" timestamp with time zone NOT NULL,
  "tentative_end_date" timestamp with time zone,
  "instructor_name" text,
  "location" text,
  "objectives" text[] DEFAULT '{}'::text[] NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "target_department_id" uuid,
  "plan_status" text DEFAULT 'Proposed'::text NOT NULL,
  "recommended_from" text DEFAULT 'LND Planning'::text NOT NULL,
  "source_request_id" uuid,
  "promoted_draft_id" uuid,
  "promoted_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_plan_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_programs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'Active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "training_programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_recommendations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "competency" text NOT NULL,
  "source_cycle_id" integer,
  "trigger_score" numeric,
  "gap_type" text DEFAULT 'LOW_SCORE'::text NOT NULL,
  "gap_detail" text,
  "priority" text DEFAULT 'MEDIUM'::text NOT NULL,
  "status" text DEFAULT 'SUGGESTED'::text NOT NULL,
  "admin_remark" text,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "office_actor" text,
  "batch_id" uuid,
  "source" text DEFAULT 'ai_recommended'::text NOT NULL,
  "finalized_at" timestamp with time zone,
  "published_at" timestamp with time zone,
  CONSTRAINT "training_recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_report_notes" (
  "session_id" uuid NOT NULL,
  "recommendations" text,
  "prepared_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "training_report_notes_pkey" PRIMARY KEY ("session_id")
);

CREATE TABLE IF NOT EXISTS public."training_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid,
  "program_id" uuid,
  "title" text NOT NULL,
  "justification" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now(),
  "decided_at" timestamp with time zone,
  "decided_by" uuid,
  "category" text,
  "competency" text,
  "rationales" text[],
  "current_proficiency" integer,
  "desired_proficiency" integer,
  "after_training_metric" text,
  "post_training_proficiency" integer,
  "plan_dismissed_at" timestamp with time zone,
  "plan_dismissed_by" text,
  "plan_dismiss_reason" text,
  "requesting_office" text,
  "requested_by" text,
  CONSTRAINT "training_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."training_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid,
  "title" text NOT NULL,
  "scheduled_date" timestamp with time zone NOT NULL,
  "capacity" integer DEFAULT 0 NOT NULL,
  "location" text,
  "status" text DEFAULT 'Scheduled'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "category" text,
  "end_date" timestamp with time zone,
  "objectives" text[] DEFAULT '{}'::text[] NOT NULL,
  "roster_finalized_at" timestamp with time zone,
  "source_draft_id" uuid,
  "roster_status" text DEFAULT 'Draft'::text NOT NULL,
  "roster_sent_at" timestamp with time zone,
  "roster_confirmed_at" timestamp with time zone,
  "roster_approved_at" timestamp with time zone,
  "instructor_name" text,
  "is_internal" boolean DEFAULT true NOT NULL,
  "plan_status" text,
  "source_request_id" uuid,
  "description" text,
  "materials" text,
  "prerequisites" text,
  "updated_at" timestamp with time zone,
  "last_viewed_by_office" timestamp with time zone,
  "roster_published_at" timestamp with time zone,
  CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."trainings" (
  "id" integer DEFAULT nextval('trainings_id_seq'::regclass) NOT NULL,
  "title" text NOT NULL,
  "date" date NOT NULL,
  "speaker" text,
  "venue" text,
  "status" text,
  "created_at" timestamp without time zone DEFAULT now(),
  CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."weighting_schema_options" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "strategic_weight" numeric NOT NULL,
  "core_weight" numeric NOT NULL,
  "support_weight" numeric NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weighting_schema_options_pkey" PRIMARY KEY ("id")
);

-- 4. NEW COLUMNS ON EXISTING TABLES
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "qualified_applicant_id" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "application_id" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "middle_name" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "suffix" character varying(20);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "phone" character varying(20);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "alternate_phone" character varying(20);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "current_address_street" character varying(200);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "current_address_barangay" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "current_address_city" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "current_address_province" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "current_address_zipcode" character varying(10);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_address_street" character varying(200);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_address_barangay" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_address_city" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_address_province" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_address_zipcode" character varying(10);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "sex" character varying(20);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "gsis_number" character varying(50);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "emergency_contact_relationship" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "emergency_contact_phone" character varying(20);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "emergency_contact_address" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "employment_status" character varying(50) DEFAULT 'Probationary'::character varying NOT NULL;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "plantilla_num" character varying(50);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "date_hired" date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "date_regularized" date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "date_separated" date;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "office_location" character varying(200);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "work_schedule" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "reports_to" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "separation_reason" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "separation_remarks" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "user_account_id" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "user_role" character varying(50) DEFAULT 'employee'::character varying;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "account_status" character varying(50) DEFAULT 'Pending'::character varying;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "last_login" timestamp with time zone;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "photo_url" character varying(500);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "created_by" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "modified_by" uuid;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "modified_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "position_id" numeric;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "division" character varying(200);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "highest_educational_attainment" character varying(100);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "eligibility" character varying(200);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "height_m" numeric(4,2);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "weight_kg" numeric(5,2);
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "blood_type" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "umid_number" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "philsys_number" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "citizenship" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "citizenship_basis" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "dual_citizenship_country" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "telephone_number" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_house_lot" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_street" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_subdivision" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_barangay" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_city" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_province" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "residential_zip" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_house_lot" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_street" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_subdivision" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_barangay" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_city" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_province" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "permanent_zip" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_surname" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_first_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_middle_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_suffix" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_occupation" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_employer" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_business_address" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "spouse_telephone" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "father_surname" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "father_first_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "father_middle_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "father_suffix" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "mother_surname" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "mother_first_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "mother_middle_name" text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "pds_signed_at" timestamp with time zone;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "pds_updated_at" timestamp with time zone;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "office" character varying(255);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "item_number" character varying(100);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "status" character varying(50) DEFAULT 'Open'::character varying;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "division" character varying(120);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "position_type" character varying(60);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "position_level" character varying(60);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "employment_status" character varying(60);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "number_of_positions" integer DEFAULT 1;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "monthly_salary" numeric(12,2);
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "experience_field" text;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "competency" text;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "preferred_qualifications" text;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "responsibilities" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "required_skills" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "certifications" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "required_documents" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "application_deadline" date;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "expected_start_date" date;
ALTER TABLE public.job_postings ADD COLUMN IF NOT EXISTS "posted_by" character varying(120);
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employees) THEN
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "employee_number" character varying(50) NOT NULL;
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "first_name" character varying(100) NOT NULL;
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "last_name" character varying(100) NOT NULL;
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "department" character varying(100) NOT NULL;
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "position" character varying(200) NOT NULL;
  ELSE
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "employee_number" character varying(50);
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "first_name" character varying(100);
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "last_name" character varying(100);
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "department" character varying(100);
    ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "position" character varying(200);
    RAISE NOTICE 'employees was not empty: NOT NULL columns added as nullable';
  END IF;
END $do$;

-- 5. SEQUENCE OWNERSHIP
ALTER SEQUENCE public.applicant_attachments_id_seq OWNED BY public.applicant_attachments.id;
ALTER SEQUENCE public.jobs_id_seq OWNED BY public.jobs.id;
ALTER SEQUENCE public.raters_id_seq OWNED BY public.raters.id;
ALTER SEQUENCE public.policy_audit_id_seq OWNED BY public.policy_audit.id;
ALTER SEQUENCE public.trainings_id_seq OWNED BY public.trainings.id;
ALTER SEQUENCE public.evaluation_cycles_id_seq OWNED BY public.evaluation_cycles.id;
ALTER SEQUENCE public.performance_cycles_id_seq OWNED BY public.performance_cycles.id;
ALTER SEQUENCE public.ipcr_performance_id_seq OWNED BY public.ipcr_performance.id;

-- 6. UNIQUE / CHECK CONSTRAINTS
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'access_change_audit_action_check' AND conrelid = 'public.access_change_audit'::regclass) THEN
    ALTER TABLE ONLY public.access_change_audit ADD CONSTRAINT access_change_audit_action_check CHECK ((action = ANY (ARRAY['assign'::text, 'revoke'::text, 'transfer'::text, 'reroute'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_email_key' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_email_key UNIQUE (email);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_employee_code_key' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_employee_code_key UNIQUE (employee_code);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_role_check' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_role_check CHECK ((role = ANY (ARRAY['Employee'::text, 'Supervisor'::text, 'DeptHead'::text, 'PMAdmin'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_status_check' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Inactive'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_gender_check' AND conrelid = 'public.applicants'::regclass) THEN
    ALTER TABLE ONLY public.applicants ADD CONSTRAINT applicants_gender_check CHECK (((gender)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_documents_application_id_document_type_key' AND conrelid = 'public.application_documents'::regclass) THEN
    ALTER TABLE ONLY public.application_documents ADD CONSTRAINT application_documents_application_id_document_type_key UNIQUE (application_id, document_type);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_documents_status_check' AND conrelid = 'public.application_documents'::regclass) THEN
    ALTER TABLE ONLY public.application_documents ADD CONSTRAINT application_documents_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'missing'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_plantilla_slots_status_check' AND conrelid = 'public.application_plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.application_plantilla_slots ADD CONSTRAINT application_plantilla_slots_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'shortlisted'::text, 'not_selected'::text, 'hired'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_assignment_type_check' AND conrelid = 'public.assignments'::regclass) THEN
    ALTER TABLE ONLY public.assignments ADD CONSTRAINT assignments_assignment_type_check CHECK (((assignment_type)::text = ANY ((ARRAY['INTERVIEWER'::character varying, 'RATER'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competencies_name_key' AND conrelid = 'public.competencies'::regclass) THEN
    ALTER TABLE ONLY public.competencies ADD CONSTRAINT competencies_name_key UNIQUE (name);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_change_log_action_check' AND conrelid = 'public.competency_change_log'::regclass) THEN
    ALTER TABLE ONLY public.competency_change_log ADD CONSTRAINT competency_change_log_action_check CHECK ((action = ANY (ARRAY['add'::text, 'revise'::text, 'remove'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_change_log_source_check' AND conrelid = 'public.competency_change_log'::regclass) THEN
    ALTER TABLE ONLY public.competency_change_log ADD CONSTRAINT competency_change_log_source_check CHECK ((source = ANY (ARRAY['direct'::text, 'review-queue'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_requirement_proposals_action_check' AND conrelid = 'public.competency_requirement_proposals'::regclass) THEN
    ALTER TABLE ONLY public.competency_requirement_proposals ADD CONSTRAINT competency_requirement_proposals_action_check CHECK ((action = ANY (ARRAY['add'::text, 'revise'::text, 'remove'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_requirement_proposals_proficiency_level_check' AND conrelid = 'public.competency_requirement_proposals'::regclass) THEN
    ALTER TABLE ONLY public.competency_requirement_proposals ADD CONSTRAINT competency_requirement_proposals_proficiency_level_check CHECK ((proficiency_level = ANY (ARRAY['Basic'::text, 'Intermediate'::text, 'Advanced'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_requirement_proposals_status_check' AND conrelid = 'public.competency_requirement_proposals'::regclass) THEN
    ALTER TABLE ONLY public.competency_requirement_proposals ADD CONSTRAINT competency_requirement_proposals_status_check CHECK ((status = ANY (ARRAY['Pending'::text, 'Approved'::text, 'Rejected'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_standards_competency_name_key' AND conrelid = 'public.competency_standards'::regclass) THEN
    ALTER TABLE ONLY public.competency_standards ADD CONSTRAINT competency_standards_competency_name_key UNIQUE (competency_name);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'competency_standards_training_stream_check' AND conrelid = 'public.competency_standards'::regclass) THEN
    ALTER TABLE ONLY public.competency_standards ADD CONSTRAINT competency_standards_training_stream_check CHECK ((training_stream = ANY (ARRAY['LEADERSHIP'::text, 'EMPLOYEE DEVELOPMENT'::text, 'TECHNICAL'::text, 'CULTURAL TRANSFORMATION'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_competency_requirements_required_level_check' AND conrelid = 'public.critical_position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_competency_requirements ADD CONSTRAINT critical_position_competency_requirements_required_level_check CHECK (((required_level >= 1) AND (required_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_competency_requirements_unique' AND conrelid = 'public.critical_position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_competency_requirements ADD CONSTRAINT critical_position_competency_requirements_unique UNIQUE (critical_position_id, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_training_requirements_unique' AND conrelid = 'public.critical_position_training_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_training_requirements ADD CONSTRAINT critical_position_training_requirements_unique UNIQUE (critical_position_id, training_title);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_positions_min_ipcr_rating_check' AND conrelid = 'public.critical_positions'::regclass) THEN
    ALTER TABLE ONLY public.critical_positions ADD CONSTRAINT critical_positions_min_ipcr_rating_check CHECK (((min_ipcr_rating IS NULL) OR (min_ipcr_rating = ANY (ARRAY['Outstanding'::text, 'Very Satisfactory'::text, 'Satisfactory'::text, 'Unsatisfactory'::text, 'Poor'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_positions_successors_count_check' AND conrelid = 'public.critical_positions'::regclass) THEN
    ALTER TABLE ONLY public.critical_positions ADD CONSTRAINT critical_positions_successors_count_check CHECK ((required_successors_count >= 1));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_compilations_kind_check' AND conrelid = 'public.cycle_compilations'::regclass) THEN
    ALTER TABLE ONLY public.cycle_compilations ADD CONSTRAINT cycle_compilations_kind_check CHECK ((kind = ANY (ARRAY['DPCR'::text, 'OPCR'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_offices_name_key' AND conrelid = 'public.demo_offices'::regclass) THEN
    ALTER TABLE ONLY public.demo_offices ADD CONSTRAINT demo_offices_name_key UNIQUE (name);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'demo_settings_id_check' AND conrelid = 'public.demo_settings'::regclass) THEN
    ALTER TABLE ONLY public.demo_settings ADD CONSTRAINT demo_settings_id_check CHECK ((id = 1));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dwc_deactivated_at_matches_is_active' AND conrelid = 'public.department_weighting_configs'::regclass) THEN
    ALTER TABLE ONLY public.department_weighting_configs ADD CONSTRAINT dwc_deactivated_at_matches_is_active CHECK (((is_active AND (deactivated_at IS NULL)) OR ((NOT is_active) AND (deactivated_at IS NOT NULL))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_code_key' AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE ONLY public.departments ADD CONSTRAINT departments_code_key UNIQUE (code);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_name_key' AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE ONLY public.departments ADD CONSTRAINT departments_name_key UNIQUE (name);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_resolution' AND conrelid = 'public.departments_backfill_audit'::regclass) THEN
    ALTER TABLE ONLY public.departments_backfill_audit ADD CONSTRAINT valid_resolution CHECK (((resolution)::text = ANY ((ARRAY['exact'::character varying, 'legacy_map'::character varying, 'fallback'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_employee_id_competency_id_key' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_employee_id_competency_id_key UNIQUE (employee_id, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_proficiency_level_check' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_proficiency_level_check CHECK (((proficiency_level >= 1) AND (proficiency_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_required_level_check' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_required_level_check CHECK (((required_level >= 1) AND (required_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competency_summaries_cycle_unique' AND conrelid = 'public.employee_competency_summaries'::regclass) THEN
    ALTER TABLE ONLY public.employee_competency_summaries ADD CONSTRAINT employee_competency_summaries_cycle_unique UNIQUE (employee_id, cycle_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_document_category' AND conrelid = 'public.employee_documents'::regclass) THEN
    ALTER TABLE ONLY public.employee_documents ADD CONSTRAINT valid_document_category CHECK (((category)::text = ANY ((ARRAY['application'::character varying, 'compliance'::character varying, 'hr_request'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_document_status' AND conrelid = 'public.employee_documents'::regclass) THEN
    ALTER TABLE ONLY public.employee_documents ADD CONSTRAINT valid_document_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'Submitted'::character varying, 'Approved'::character varying, 'Rejected'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_document_type' AND conrelid = 'public.employee_documents'::regclass) THEN
    ALTER TABLE ONLY public.employee_documents ADD CONSTRAINT valid_document_type CHECK (((document_type)::text = ANY ((ARRAY['Resume / Curriculum Vitae'::character varying, 'Application Letter'::character varying, 'Transcript of Records'::character varying, 'Other Relevant Documents'::character varying, 'NBI Clearance'::character varying, 'Medical Certificate'::character varying, 'SALN'::character varying, 'Certificate of Training'::character varying, 'Performance Evaluation Form'::character varying, 'Updated Resume/CV'::character varying, 'Resume'::character varying, 'Birth Certificate'::character varying, 'Marriage Certificate'::character varying, 'Diploma'::character varying, 'Civil Service Eligibility'::character varying, 'License'::character varying, 'Government ID'::character varying, 'Tax Documents'::character varying, 'Appointment Letter'::character varying, 'Previous Employment Certificate'::character varying, 'Employment Certificate'::character varying, 'Other'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_request_source' AND conrelid = 'public.employee_documents'::regclass) THEN
    ALTER TABLE ONLY public.employee_documents ADD CONSTRAINT valid_request_source CHECK (((request_source)::text = ANY ((ARRAY['HR'::character varying, 'PM'::character varying, 'LND'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_education_level' AND conrelid = 'public.employee_education'::regclass) THEN
    ALTER TABLE ONLY public.employee_education ADD CONSTRAINT valid_education_level CHECK (((level)::text = ANY ((ARRAY['Elementary'::character varying, 'Secondary'::character varying, 'Vocational'::character varying, 'College'::character varying, 'Graduate Studies'::character varying, 'Doctorate'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_action' AND conrelid = 'public.employee_history'::regclass) THEN
    ALTER TABLE ONLY public.employee_history ADD CONSTRAINT valid_action CHECK (((action)::text = ANY ((ARRAY['created'::character varying, 'hired'::character varying, 'regularized'::character varying, 'promoted'::character varying, 'transferred'::character varying, 'suspended'::character varying, 'reactivated'::character varying, 'role_changed'::character varying, 'updated'::character varying, 'separated'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_leave_balances_employee_id_year_key' AND conrelid = 'public.employee_leave_balances'::regclass) THEN
    ALTER TABLE ONLY public.employee_leave_balances ADD CONSTRAINT employee_leave_balances_employee_id_year_key UNIQUE (employee_id, year);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_portal_accounts_username_key' AND conrelid = 'public.employee_portal_accounts'::regclass) THEN
    ALTER TABLE ONLY public.employee_portal_accounts ADD CONSTRAINT employee_portal_accounts_username_key UNIQUE (username);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_settings_employee_id_key' AND conrelid = 'public.employee_settings'::regclass) THEN
    ALTER TABLE ONLY public.employee_settings ADD CONSTRAINT employee_settings_employee_id_key UNIQUE (employee_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_attendance_percentage_check' AND conrelid = 'public.employee_training'::regclass) THEN
    ALTER TABLE ONLY public.employee_training ADD CONSTRAINT employee_training_attendance_percentage_check CHECK (((attendance_percentage >= (0)::numeric) AND (attendance_percentage <= (100)::numeric)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_training_type' AND conrelid = 'public.employee_training'::regclass) THEN
    ALTER TABLE ONLY public.employee_training ADD CONSTRAINT valid_training_type CHECK (((training_type)::text = ANY ((ARRAY['Orientation'::character varying, 'Technical'::character varying, 'Leadership'::character varying, 'Compliance'::character varying, 'Other'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_competencie_employee_training_id_competen_key' AND conrelid = 'public.employee_training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_training_competencies ADD CONSTRAINT employee_training_competencie_employee_training_id_competen_key UNIQUE (employee_training_id, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_employee_number_key' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_employee_number_key UNIQUE (employee_number);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_account_status' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT valid_account_status CHECK (((account_status)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying, 'Locked'::character varying, 'Pending'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_civil_status' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT valid_civil_status CHECK (((civil_status)::text = ANY ((ARRAY['Single'::character varying, 'Married'::character varying, 'Widowed'::character varying, 'Separated'::character varying, 'Divorced'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_employment_status' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT valid_employment_status CHECK (((employment_status)::text = ANY ((ARRAY['Regular'::character varying, 'Probationary'::character varying, 'Casual'::character varying, 'Contractual'::character varying, 'Co-terminus'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_sex' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT valid_sex CHECK (((sex)::text = ANY ((ARRAY['Male'::character varying, 'Female'::character varying, 'Other'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'valid_status' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'On Leave'::character varying, 'Suspended'::character varying, 'Separated'::character varying, 'Retired'::character varying, 'Deceased'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluation_cycles_status_check' AND conrelid = 'public.evaluation_cycles'::regclass) THEN
    ALTER TABLE ONLY public.evaluation_cycles ADD CONSTRAINT evaluation_cycles_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Completed'::text, 'Planned'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_recommendation_check' AND conrelid = 'public.evaluations'::regclass) THEN
    ALTER TABLE ONLY public.evaluations ADD CONSTRAINT evaluations_recommendation_check CHECK (((recommendation)::text = ANY ((ARRAY['Highly Recommended'::character varying, 'Recommended'::character varying, 'Not Recommended'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_score_check' AND conrelid = 'public.evaluations'::regclass) THEN
    ALTER TABLE ONLY public.evaluations ADD CONSTRAINT evaluations_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fgd_notes_category_check' AND conrelid = 'public.fgd_notes'::regclass) THEN
    ALTER TABLE ONLY public.fgd_notes ADD CONSTRAINT fgd_notes_category_check CHECK ((category = ANY (ARRAY['Cultural Transformation'::text, 'Employee Development'::text, 'Leadership'::text, 'Technical'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_entries_current_level_check' AND conrelid = 'public.idp_entries'::regclass) THEN
    ALTER TABLE ONLY public.idp_entries ADD CONSTRAINT idp_entries_current_level_check CHECK (((current_level >= 1) AND (current_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_entries_status_check' AND conrelid = 'public.idp_entries'::regclass) THEN
    ALTER TABLE ONLY public.idp_entries ADD CONSTRAINT idp_entries_status_check CHECK ((status = ANY (ARRAY['In Progress'::text, 'Completed'::text, 'Deferred'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_entries_target_level_check' AND conrelid = 'public.idp_entries'::regclass) THEN
    ALTER TABLE ONLY public.idp_entries ADD CONSTRAINT idp_entries_target_level_check CHECK (((target_level >= 1) AND (target_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_form_config_mode_check' AND conrelid = 'public.idp_form_config'::regclass) THEN
    ALTER TABLE ONLY public.idp_form_config ADD CONSTRAINT idp_form_config_mode_check CHECK ((mode = ANY (ARRAY['Auto'::text, 'Open'::text, 'Closed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_form_config_scope_unique' AND conrelid = 'public.idp_form_config'::regclass) THEN
    ALTER TABLE ONLY public.idp_form_config ADD CONSTRAINT idp_form_config_scope_unique UNIQUE (scope);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_submissions_employee_cycle_unique' AND conrelid = 'public.idp_submissions'::regclass) THEN
    ALTER TABLE ONLY public.idp_submissions ADD CONSTRAINT idp_submissions_employee_cycle_unique UNIQUE (employee_id, cycle_year);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_e_rating_check' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_e_rating_check CHECK (((e_rating >= 1) AND (e_rating <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_q_rating_check' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_q_rating_check CHECK (((q_rating >= 1) AND (q_rating <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_t_rating_check' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_t_rating_check CHECK (((t_rating >= 1) AND (t_rating <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_target_id_key' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_target_id_key UNIQUE (target_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_competency_matches_confidence_range' AND conrelid = 'public.ipcr_competency_matches'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_competency_matches ADD CONSTRAINT ipcr_competency_matches_confidence_range CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_competency_matches_pairing' AND conrelid = 'public.ipcr_competency_matches'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_competency_matches ADD CONSTRAINT ipcr_competency_matches_pairing CHECK ((((competency IS NULL) AND (confidence IS NULL)) OR ((competency IS NOT NULL) AND (confidence IS NOT NULL))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_designated_approvers_approver_source_check' AND conrelid = 'public.ipcr_designated_approvers'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_designated_approvers ADD CONSTRAINT ipcr_designated_approvers_approver_source_check CHECK ((approver_source = ANY (ARRAY['reports_to'::text, 'office_dept_head'::text, 'unassigned'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_designated_approvers_not_self' AND conrelid = 'public.ipcr_designated_approvers'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_designated_approvers ADD CONSTRAINT ipcr_designated_approvers_not_self CHECK (((approver_employee_id IS NULL) OR (approver_employee_id <> employee_id)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_notifications_phase_check' AND conrelid = 'public.ipcr_notifications'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_notifications ADD CONSTRAINT ipcr_notifications_phase_check CHECK ((phase = ANY (ARRAY['target'::text, 'rating'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_rating_scale_rating_check' AND conrelid = 'public.ipcr_rating_scale'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_rating_scale ADD CONSTRAINT ipcr_rating_scale_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_rating_scale_rating_key' AND conrelid = 'public.ipcr_rating_scale'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_rating_scale ADD CONSTRAINT ipcr_rating_scale_rating_key UNIQUE (rating);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_schedules_cycle_type_check' AND conrelid = 'public.ipcr_schedules'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_schedules ADD CONSTRAINT ipcr_schedules_cycle_type_check CHECK ((cycle_type = ANY (ARRAY['Regular'::text, 'Probationary'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_schedules_phase_check' AND conrelid = 'public.ipcr_schedules'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_schedules ADD CONSTRAINT ipcr_schedules_phase_check CHECK ((phase = ANY (ARRAY[1, 2])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_submissions_employee_id_period_phase_key' AND conrelid = 'public.ipcr_submissions'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_submissions ADD CONSTRAINT ipcr_submissions_employee_id_period_phase_key UNIQUE (employee_id, period, phase);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_submissions_phase_check' AND conrelid = 'public.ipcr_submissions'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_submissions ADD CONSTRAINT ipcr_submissions_phase_check CHECK ((phase = ANY (ARRAY['target'::text, 'rating'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_submissions_stage_check' AND conrelid = 'public.ipcr_submissions'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_submissions ADD CONSTRAINT ipcr_submissions_stage_check CHECK ((stage = ANY (ARRAY['Not Started'::text, 'In Draft'::text, 'Submitted to Office'::text, 'Returned for Revision'::text, 'Verified'::text, 'Forwarded to PM'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_targets_category_check' AND conrelid = 'public.ipcr_targets'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_targets ADD CONSTRAINT ipcr_targets_category_check CHECK ((category = ANY (ARRAY['Core Function'::text, 'Support Function'::text, 'Strategic Priority'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_workspace_employee_id_period_key' AND conrelid = 'public.ipcr_workspace'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_workspace ADD CONSTRAINT ipcr_workspace_employee_id_period_key UNIQUE (employee_id, period);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_workspace_status_check' AND conrelid = 'public.ipcr_workspace'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_workspace ADD CONSTRAINT ipcr_workspace_status_check CHECK ((status = ANY (ARRAY['Draft Targets'::text, 'Targets Submitted'::text, 'Accomplishments Submitted'::text, 'Completed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_postings_status_check' AND conrelid = 'public.job_postings'::regclass) THEN
    ALTER TABLE ONLY public.job_postings ADD CONSTRAINT job_postings_status_check CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Closed'::character varying, 'On Hold'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_status_check' AND conrelid = 'public.jobs'::regclass) THEN
    ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_status_check CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Closed'::character varying, 'On Hold'::character varying])::text[])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfos_function_type_check' AND conrelid = 'public.mfos'::regclass) THEN
    ALTER TABLE ONLY public.mfos ADD CONSTRAINT mfos_function_type_check CHECK ((function_type = ANY (ARRAY['core'::text, 'strategic'::text, 'support'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'new_entrant_onboarding_initial_target_stage_check' AND conrelid = 'public.new_entrant_onboarding'::regclass) THEN
    ALTER TABLE ONLY public.new_entrant_onboarding ADD CONSTRAINT new_entrant_onboarding_initial_target_stage_check CHECK ((initial_target_stage = ANY (ARRAY['Not Started'::text, 'In Draft'::text, 'Submitted to Office'::text, 'Returned for Revision'::text, 'Verified'::text, 'Forwarded to PM'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_cycle_closeouts_office_id_period_key' AND conrelid = 'public.office_cycle_closeouts'::regclass) THEN
    ALTER TABLE ONLY public.office_cycle_closeouts ADD CONSTRAINT office_cycle_closeouts_office_id_period_key UNIQUE (office_id, period);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_role_assignments_role_check' AND conrelid = 'public.office_role_assignments'::regclass) THEN
    ALTER TABLE ONLY public.office_role_assignments ADD CONSTRAINT office_role_assignments_role_check CHECK ((role = 'DeptHead'::text));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_role_assignments_status_check' AND conrelid = 'public.office_role_assignments'::regclass) THEN
    ALTER TABLE ONLY public.office_role_assignments ADD CONSTRAINT office_role_assignments_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Revoked'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_cycles_status_check' AND conrelid = 'public.performance_cycles'::regclass) THEN
    ALTER TABLE ONLY public.performance_cycles ADD CONSTRAINT performance_cycles_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Completed'::text, 'Planned'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_employee_id_cycle_id_key' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_employee_id_cycle_id_key UNIQUE (employee_id, cycle_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_final_score_check' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_final_score_check CHECK (((final_score IS NULL) OR ((final_score >= (0)::numeric) AND (final_score <= (5)::numeric))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_status_check' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_status_check CHECK ((status = ANY (ARRAY['Planning'::text, 'Self Evaluation'::text, 'Supervisor Review'::text, 'Approved'::text, 'Rejected'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_schedules_mode_check' AND conrelid = 'public.phase_schedules'::regclass) THEN
    ALTER TABLE ONLY public.phase_schedules ADD CONSTRAINT phase_schedules_mode_check CHECK ((mode = ANY (ARRAY['Auto'::text, 'Open'::text, 'Closed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_schedules_phase_check' AND conrelid = 'public.phase_schedules'::regclass) THEN
    ALTER TABLE ONLY public.phase_schedules ADD CONSTRAINT phase_schedules_phase_check CHECK ((phase = ANY (ARRAY['target_setting'::text, 'rating'::text, 'training_planning'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_schedules_scope_check' AND conrelid = 'public.phase_schedules'::regclass) THEN
    ALTER TABLE ONLY public.phase_schedules ADD CONSTRAINT phase_schedules_scope_check CHECK ((scope = ANY (ARRAY['system'::text, 'office'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'plantilla_slots_status_check' AND conrelid = 'public.plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.plantilla_slots ADD CONSTRAINT plantilla_slots_status_check CHECK ((status = ANY (ARRAY['open'::text, 'filled'::text, 'closed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pm_lnd_reports_status_check' AND conrelid = 'public.pm_lnd_reports'::regclass) THEN
    ALTER TABLE ONLY public.pm_lnd_reports ADD CONSTRAINT pm_lnd_reports_status_check CHECK ((status = ANY (ARRAY['Pending Review'::text, 'Reviewed'::text, 'Actioned'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competencies_position_id_competency_id_key' AND conrelid = 'public.position_competencies'::regclass) THEN
    ALTER TABLE ONLY public.position_competencies ADD CONSTRAINT position_competencies_position_id_competency_id_key UNIQUE (position_id, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competencies_required_level_check' AND conrelid = 'public.position_competencies'::regclass) THEN
    ALTER TABLE ONLY public.position_competencies ADD CONSTRAINT position_competencies_required_level_check CHECK (((required_level >= 1) AND (required_level <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competency_requiremen_position_title_competency_id_key' AND conrelid = 'public.position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.position_competency_requirements ADD CONSTRAINT position_competency_requiremen_position_title_competency_id_key UNIQUE (position_title, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competency_requirements_proficiency_level_check' AND conrelid = 'public.position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.position_competency_requirements ADD CONSTRAINT position_competency_requirements_proficiency_level_check CHECK ((proficiency_level = ANY (ARRAY['Basic'::text, 'Intermediate'::text, 'Advanced'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competency_requirements_source_check' AND conrelid = 'public.position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.position_competency_requirements ADD CONSTRAINT position_competency_requirements_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'auto-synced'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_name_department_key' AND conrelid = 'public.positions'::regclass) THEN
    ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_name_department_key UNIQUE (name, department);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_no_self_parent' AND conrelid = 'public.positions'::regclass) THEN
    ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_no_self_parent CHECK (((parent_position_id IS NULL) OR (parent_position_id <> id)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_salary_grade_range' AND conrelid = 'public.positions'::regclass) THEN
    ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_salary_grade_range CHECK (((salary_grade IS NULL) OR ((salary_grade >= 1) AND (salary_grade <= 33))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotional_applications_status_check' AND conrelid = 'public.promotional_applications'::regclass) THEN
    ALTER TABLE ONLY public.promotional_applications ADD CONSTRAINT promotional_applications_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'under_review'::text, 'endorsed'::text, 'approved'::text, 'denied'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'raters_email_key' AND conrelid = 'public.raters'::regclass) THEN
    ALTER TABLE ONLY public.raters ADD CONSTRAINT raters_email_key UNIQUE (email);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'semester_transition_state_completion_status_check' AND conrelid = 'public.semester_transition_state'::regclass) THEN
    ALTER TABLE ONLY public.semester_transition_state ADD CONSTRAINT semester_transition_state_completion_status_check CHECK ((completion_status = ANY (ARRAY['in_progress'::text, 'ready'::text, 'complete'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'semester_transition_state_id_check' AND conrelid = 'public.semester_transition_state'::regclass) THEN
    ALTER TABLE ONLY public.semester_transition_state ADD CONSTRAINT semester_transition_state_id_check CHECK ((id = 1));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seminar_rec_events_removal_reason_check' AND conrelid = 'public.seminar_recommendation_events'::regclass) THEN
    ALTER TABLE ONLY public.seminar_recommendation_events ADD CONSTRAINT seminar_rec_events_removal_reason_check CHECK (((action <> 'removed'::text) OR (COALESCE(btrim(reason), ''::text) <> ''::text)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seminar_recommendation_events_action_check' AND conrelid = 'public.seminar_recommendation_events'::regclass) THEN
    ALTER TABLE ONLY public.seminar_recommendation_events ADD CONSTRAINT seminar_recommendation_events_action_check CHECK ((action = ANY (ARRAY['added'::text, 'removed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_efficiency_check' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_efficiency_check CHECK (((efficiency >= 1) AND (efficiency <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_quality_check' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_quality_check CHECK (((quality >= 1) AND (quality <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_success_indicator_id_key' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_success_indicator_id_key UNIQUE (success_indicator_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_timeliness_check' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_timeliness_check CHECK (((timeliness >= 1) AND (timeliness <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidate_remarks_critical_position_id_employee__key' AND conrelid = 'public.succession_candidate_remarks'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidate_remarks ADD CONSTRAINT succession_candidate_remarks_critical_position_id_employee__key UNIQUE (critical_position_id, employee_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidates_unique' AND conrelid = 'public.succession_candidates'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidates ADD CONSTRAINT succession_candidates_unique UNIQUE (critical_position_id, employee_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisor_password_resets_action_check' AND conrelid = 'public.supervisor_password_resets'::regclass) THEN
    ALTER TABLE ONLY public.supervisor_password_resets ADD CONSTRAINT supervisor_password_resets_action_check CHECK ((action = ANY (ARRAY['temporary'::text, 'default'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisors_account_status_check' AND conrelid = 'public.supervisors'::regclass) THEN
    ALTER TABLE ONLY public.supervisors ADD CONSTRAINT supervisors_account_status_check CHECK ((account_status = ANY (ARRAY['Active'::text, 'Inactive'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisors_username_key' AND conrelid = 'public.supervisors'::regclass) THEN
    ALTER TABLE ONLY public.supervisors ADD CONSTRAINT supervisors_username_key UNIQUE (username);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_employee_cycle_uniq' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_employee_cycle_uniq UNIQUE (employee_id, cycle_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_no_self_approval' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_no_self_approval CHECK (((approved_by IS NULL) OR (approved_by <> employee_id)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_phase2_status_check' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_phase2_status_check CHECK ((phase2_status = ANY (ARRAY['not_started'::text, 'locked'::text, 'open'::text, 'in_progress'::text, 'completed'::text, 'closed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_status_check' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted_for_approval'::text, 'returned_for_revision'::text, 'approved'::text, 'submitted'::text, 'rejected'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_submitted_at_present' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_submitted_at_present CHECK (((status = 'draft'::text) OR (submitted_at IS NOT NULL)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_days_session_check' AND conrelid = 'public.training_attendance_days'::regclass) THEN
    ALTER TABLE ONLY public.training_attendance_days ADD CONSTRAINT training_attendance_days_session_check CHECK ((session = ANY (ARRAY['AM'::text, 'PM'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_days_status_check' AND conrelid = 'public.training_attendance_days'::regclass) THEN
    ALTER TABLE ONLY public.training_attendance_days ADD CONSTRAINT training_attendance_days_status_check CHECK ((status = ANY (ARRAY['Present'::text, 'Absent'::text, 'Excused'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_excuse_note' AND conrelid = 'public.training_attendance_days'::regclass) THEN
    ALTER TABLE ONLY public.training_attendance_days ADD CONSTRAINT training_attendance_excuse_note CHECK (((status IS DISTINCT FROM 'Excused'::text) OR ((excuse_note IS NOT NULL) AND (length(btrim(excuse_note)) > 0))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_competencies_session_id_competency_id_key' AND conrelid = 'public.training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.training_competencies ADD CONSTRAINT training_competencies_session_id_competency_id_key UNIQUE (session_id, competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_competencies_weight_check' AND conrelid = 'public.training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.training_competencies ADD CONSTRAINT training_competencies_weight_check CHECK (((weight >= 1) AND (weight <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_competency_tags_name_key_key' AND conrelid = 'public.training_competency_tags'::regclass) THEN
    ALTER TABLE ONLY public.training_competency_tags ADD CONSTRAINT training_competency_tags_name_key_key UNIQUE (name_key);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_action_check' AND conrelid = 'public.training_course_draft_member_events'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_member_events ADD CONSTRAINT training_course_draft_member_events_action_check CHECK ((action = ANY (ARRAY['Added'::text, 'Removed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_actor_check' AND conrelid = 'public.training_course_draft_member_events'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_member_events ADD CONSTRAINT training_course_draft_member_events_actor_check CHECK ((actor_role = ANY (ARRAY['LND'::text, 'DeptHead'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_reason_check' AND conrelid = 'public.training_course_draft_member_events'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_member_events ADD CONSTRAINT training_course_draft_member_events_reason_check CHECK ((btrim(reason) <> ''::text));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_actor_check' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_actor_check CHECK ((actor_role = ANY (ARRAY['LND'::text, 'DeptHead'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_draft_id_employee_id_key' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_draft_id_employee_id_key UNIQUE (draft_id, employee_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_reason_check' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_reason_check CHECK ((btrim(reason) <> ''::text));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_state_check' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_state_check CHECK ((state = ANY (ARRAY['Included'::text, 'Excluded'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_category_check' AND conrelid = 'public.training_course_drafts'::regclass) THEN
    ALTER TABLE ONLY public.training_course_drafts ADD CONSTRAINT training_course_drafts_category_check CHECK ((category = ANY (ARRAY['Cultural Transformation'::text, 'Employee Development'::text, 'Leadership'::text, 'Technical'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_date_range_check' AND conrelid = 'public.training_course_drafts'::regclass) THEN
    ALTER TABLE ONLY public.training_course_drafts ADD CONSTRAINT training_course_drafts_date_range_check CHECK (((end_date IS NULL) OR (start_date IS NULL) OR (end_date >= start_date)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_status_check' AND conrelid = 'public.training_course_drafts'::regclass) THEN
    ALTER TABLE ONLY public.training_course_drafts ADD CONSTRAINT training_course_drafts_status_check CHECK ((status = ANY (ARRAY['Draft'::text, 'Sent to Dept Head'::text, 'Returned'::text, 'Finalized'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_added_by_role_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_added_by_role_check CHECK (((added_by_role IS NULL) OR (added_by_role = ANY (ARRAY['LND'::text, 'DeptHead'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_attendance_status_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_attendance_status_check CHECK ((attendance_status = ANY (ARRAY['Present'::text, 'Absent'::text, 'Excused'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_employee_id_session_id_key' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_employee_id_session_id_key UNIQUE (employee_id, session_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_enrollment_status_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_enrollment_status_check CHECK ((enrollment_status = ANY (ARRAY['Confirmed'::text, 'Pending'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_evaluation_type_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_evaluation_type_check CHECK ((evaluation_type = ANY (ARRAY['quiz_score'::text, 'file_submission'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_removed_by_role_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_removed_by_role_check CHECK (((removed_by_role IS NULL) OR (removed_by_role = ANY (ARRAY['LND'::text, 'DeptHead'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_status_check' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_status_check CHECK ((status = ANY (ARRAY['Enrolled'::text, 'Completed'::text, 'Dropped'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_assessment_mode_check' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_assessment_mode_check CHECK ((assessment_mode = ANY (ARRAY['test'::text, 'output'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_enrollment_id_key' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_enrollment_id_key UNIQUE (enrollment_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_post_test_score_check' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_post_test_score_check CHECK (((post_test_score IS NULL) OR ((post_test_score >= (0)::numeric) AND (post_test_score <= (100)::numeric))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_pre_test_score_check' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_pre_test_score_check CHECK (((pre_test_score IS NULL) OR ((pre_test_score >= (0)::numeric) AND (pre_test_score <= (100)::numeric))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_review_status_check' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_review_status_check CHECK ((review_status = ANY (ARRAY['Pending'::text, 'Reviewed'::text, 'Verified'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_category_check' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_category_check CHECK ((category = ANY (ARRAY['Cultural Transformation'::text, 'Employee Development'::text, 'Leadership'::text, 'Technical'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_date_range_check' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_date_range_check CHECK (((tentative_end_date IS NULL) OR (tentative_end_date >= tentative_start_date)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_provenance_check' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_provenance_check CHECK (((recommended_from <> 'Training Request'::text) OR (source_request_id IS NOT NULL)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_source_check' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_source_check CHECK ((recommended_from = ANY (ARRAY['Training Request'::text, 'Rating Suggestion'::text, 'LND Planning'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_status_check' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_status_check CHECK ((plan_status = ANY (ARRAY['Proposed'::text, 'Approved'::text, 'Needs Budget'::text, 'Confirmed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_programs_category_check' AND conrelid = 'public.training_programs'::regclass) THEN
    ALTER TABLE ONLY public.training_programs ADD CONSTRAINT training_programs_category_check CHECK ((category = ANY (ARRAY['Leadership'::text, 'Technical'::text, 'Soft Skills'::text, 'Compliance'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_programs_status_check' AND conrelid = 'public.training_programs'::regclass) THEN
    ALTER TABLE ONLY public.training_programs ADD CONSTRAINT training_programs_status_check CHECK ((status = ANY (ARRAY['Active'::text, 'Draft'::text, 'Archived'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_gap_type_check' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_gap_type_check CHECK ((gap_type = ANY (ARRAY['LOW_SCORE'::text, 'DECLINING_TREND'::text, 'KRA_ALIGNED'::text, 'COMPETENCY_GAP'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_priority_check' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_priority_check CHECK ((priority = ANY (ARRAY['HIGH'::text, 'MEDIUM'::text, 'LOW'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_source_check' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_source_check CHECK ((source = ANY (ARRAY['ai_recommended'::text, 'office_account_added'::text, 'lnd_manual'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_status_check' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_status_check CHECK ((status = ANY (ARRAY['SUGGESTED'::text, 'LND_APPROVED'::text, 'OFFICE_ADDED'::text, 'OFFICE_FINALIZED'::text, 'ENROLLED'::text, 'DISMISSED'::text, 'ACCEPTED'::text, 'FINALIZED'::text, 'PUBLISHED'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_uniq' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_uniq UNIQUE NULLS NOT DISTINCT (employee_id, session_id, source_cycle_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_category_check' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_category_check CHECK ((category = ANY (ARRAY['Cultural Transformation'::text, 'Employee Development'::text, 'Leadership'::text, 'Technical'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_current_proficiency_check' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_current_proficiency_check CHECK (((current_proficiency >= 1) AND (current_proficiency <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_desired_proficiency_check' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_desired_proficiency_check CHECK (((desired_proficiency >= 1) AND (desired_proficiency <= 5)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_status_check' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_category_check' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_category_check CHECK (((category IS NULL) OR (category = ANY (ARRAY['Cultural Transformation'::text, 'Employee Development'::text, 'Leadership'::text, 'Technical'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_date_range_check' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_date_range_check CHECK (((end_date IS NULL) OR (end_date >= scheduled_date)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_plan_status_check' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_plan_status_check CHECK ((plan_status = ANY (ARRAY['Proposed'::text, 'Approved'::text, 'Needs Budget'::text, 'Confirmed'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_roster_status_check' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_roster_status_check CHECK ((roster_status = ANY (ARRAY['Draft'::text, 'Sent to Dept Head'::text, 'Dept Head Confirmed'::text, 'Pending Final Approval'::text, 'Approved'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_status_check' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_status_check CHECK ((status = ANY (ARRAY['Scheduled'::text, 'Ongoing'::text, 'Completed'::text, 'Cancelled'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trainings_status_check' AND conrelid = 'public.trainings'::regclass) THEN
    ALTER TABLE ONLY public.trainings ADD CONSTRAINT trainings_status_check CHECK ((status = ANY (ARRAY['Scheduled'::text, 'Completed'::text, 'Cancelled'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_email_key' AND conrelid = 'public.user_roles'::regclass) THEN
    ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_email_key UNIQUE (email);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_check' AND conrelid = 'public.user_roles'::regclass) THEN
    ALTER TABLE ONLY public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'PM'::character varying, 'RSP'::character varying, 'LND'::character varying, 'RATER'::character varying, 'INTERVIEWER'::character varying, 'APPLICANT'::character varying])::text[])));
  END IF;
END $do$;
-- skipped user_roles_user_id_key: demo already has equivalent user_roles_user_id_unique
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighting_schema_options_code_check' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weighting_schema_options_code_check CHECK ((code = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighting_schema_options_code_key' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weighting_schema_options_code_key UNIQUE (code);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighting_schema_options_core_weight_check' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weighting_schema_options_core_weight_check CHECK (((core_weight >= (0)::numeric) AND (core_weight <= (100)::numeric)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighting_schema_options_strategic_weight_check' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weighting_schema_options_strategic_weight_check CHECK (((strategic_weight >= (0)::numeric) AND (strategic_weight <= (100)::numeric)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weighting_schema_options_support_weight_check' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weighting_schema_options_support_weight_check CHECK (((support_weight >= (0)::numeric) AND (support_weight <= (100)::numeric)));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weights_sum_100' AND conrelid = 'public.weighting_schema_options'::regclass) THEN
    ALTER TABLE ONLY public.weighting_schema_options ADD CONSTRAINT weights_sum_100 CHECK ((((strategic_weight + core_weight) + support_weight) = (100)::numeric));
  END IF;
END $do$;

-- 7. FOREIGN KEYS (NOT VALID on pre-existing tables)
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_created_by_pm_fkey' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE ONLY public.accounts ADD CONSTRAINT accounts_created_by_pm_fkey FOREIGN KEY (created_by_pm) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicant_attachments_applicant_id_fkey' AND conrelid = 'public.applicant_attachments'::regclass) THEN
    ALTER TABLE ONLY public.applicant_attachments ADD CONSTRAINT applicant_attachments_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applicants_disqualified_by_fkey' AND conrelid = 'public.applicants'::regclass) THEN
    ALTER TABLE ONLY public.applicants ADD CONSTRAINT applicants_disqualified_by_fkey FOREIGN KEY (disqualified_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_activity_log_application_id_fkey' AND conrelid = 'public.application_activity_log'::regclass) THEN
    ALTER TABLE ONLY public.application_activity_log ADD CONSTRAINT application_activity_log_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.applicants(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_activity_log_created_by_fkey' AND conrelid = 'public.application_activity_log'::regclass) THEN
    ALTER TABLE ONLY public.application_activity_log ADD CONSTRAINT application_activity_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'application_documents_application_id_fkey' AND conrelid = 'public.application_documents'::regclass) THEN
    ALTER TABLE ONLY public.application_documents ADD CONSTRAINT application_documents_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.promotional_applications(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_plantilla_applicant' AND conrelid = 'public.application_plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.application_plantilla_slots ADD CONSTRAINT fk_app_plantilla_applicant FOREIGN KEY (applicant_id) REFERENCES public.applicants(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_app_plantilla_slot' AND conrelid = 'public.application_plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.application_plantilla_slots ADD CONSTRAINT fk_app_plantilla_slot FOREIGN KEY (plantilla_slot_id) REFERENCES public.plantilla_slots(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_applicant_id_fkey' AND conrelid = 'public.assignments'::regclass) THEN
    ALTER TABLE ONLY public.assignments ADD CONSTRAINT assignments_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignments_evaluator_id_fkey' AND conrelid = 'public.assignments'::regclass) THEN
    ALTER TABLE ONLY public.assignments ADD CONSTRAINT assignments_evaluator_id_fkey FOREIGN KEY (evaluator_id) REFERENCES public.user_roles(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_competency_requirem_critical_position_id_fkey' AND conrelid = 'public.critical_position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_competency_requirements ADD CONSTRAINT critical_position_competency_requirem_critical_position_id_fkey FOREIGN KEY (critical_position_id) REFERENCES public.critical_positions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_competency_requirements_competency_id_fkey' AND conrelid = 'public.critical_position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_competency_requirements ADD CONSTRAINT critical_position_competency_requirements_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_position_training_requiremen_critical_position_id_fkey' AND conrelid = 'public.critical_position_training_requirements'::regclass) THEN
    ALTER TABLE ONLY public.critical_position_training_requirements ADD CONSTRAINT critical_position_training_requiremen_critical_position_id_fkey FOREIGN KEY (critical_position_id) REFERENCES public.critical_positions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_positions_department_id_fkey' AND conrelid = 'public.critical_positions'::regclass) THEN
    ALTER TABLE ONLY public.critical_positions ADD CONSTRAINT critical_positions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'critical_positions_incumbent_employee_id_fkey' AND conrelid = 'public.critical_positions'::regclass) THEN
    ALTER TABLE ONLY public.critical_positions ADD CONSTRAINT critical_positions_incumbent_employee_id_fkey FOREIGN KEY (incumbent_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_compilations_office_id_fkey' AND conrelid = 'public.cycle_compilations'::regclass) THEN
    ALTER TABLE ONLY public.cycle_compilations ADD CONSTRAINT cycle_compilations_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_log_employee_id_fkey' AND conrelid = 'public.cycle_log'::regclass) THEN
    ALTER TABLE ONLY public.cycle_log ADD CONSTRAINT cycle_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cycle_log_performed_by_fkey' AND conrelid = 'public.cycle_log'::regclass) THEN
    ALTER TABLE ONLY public.cycle_log ADD CONSTRAINT cycle_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'department_weighting_configs_department_id_fkey' AND conrelid = 'public.department_weighting_configs'::regclass) THEN
    ALTER TABLE ONLY public.department_weighting_configs ADD CONSTRAINT department_weighting_configs_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'department_weighting_configs_schema_option_id_fkey' AND conrelid = 'public.department_weighting_configs'::regclass) THEN
    ALTER TABLE ONLY public.department_weighting_configs ADD CONSTRAINT department_weighting_configs_schema_option_id_fkey FOREIGN KEY (schema_option_id) REFERENCES public.weighting_schema_options(id) ON DELETE RESTRICT;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'department_weighting_configs_set_by_employee_id_fkey' AND conrelid = 'public.department_weighting_configs'::regclass) THEN
    ALTER TABLE ONLY public.department_weighting_configs ADD CONSTRAINT department_weighting_configs_set_by_employee_id_fkey FOREIGN KEY (set_by_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_parent_department_id_fkey' AND conrelid = 'public.departments'::regclass) THEN
    ALTER TABLE ONLY public.departments ADD CONSTRAINT departments_parent_department_id_fkey FOREIGN KEY (parent_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_children_employee_id_fkey' AND conrelid = 'public.employee_children'::regclass) THEN
    ALTER TABLE ONLY public.employee_children ADD CONSTRAINT employee_children_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_competency_id_fkey' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_cycle_id_fkey' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competencies_employee_id_fkey' AND conrelid = 'public.employee_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_competencies ADD CONSTRAINT employee_competencies_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competency_summaries_cycle_id_fkey' AND conrelid = 'public.employee_competency_summaries'::regclass) THEN
    ALTER TABLE ONLY public.employee_competency_summaries ADD CONSTRAINT employee_competency_summaries_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_competency_summaries_employee_id_fkey' AND conrelid = 'public.employee_competency_summaries'::regclass) THEN
    ALTER TABLE ONLY public.employee_competency_summaries ADD CONSTRAINT employee_competency_summaries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_education_employee_id_fkey' AND conrelid = 'public.employee_education'::regclass) THEN
    ALTER TABLE ONLY public.employee_education ADD CONSTRAINT employee_education_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_eligibility_employee_id_fkey' AND conrelid = 'public.employee_eligibility'::regclass) THEN
    ALTER TABLE ONLY public.employee_eligibility ADD CONSTRAINT employee_eligibility_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_history_employee_id_fkey' AND conrelid = 'public.employee_history'::regclass) THEN
    ALTER TABLE ONLY public.employee_history ADD CONSTRAINT employee_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_leave_balances_employee_id_fkey' AND conrelid = 'public.employee_leave_balances'::regclass) THEN
    ALTER TABLE ONLY public.employee_leave_balances ADD CONSTRAINT employee_leave_balances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_notifications_employee_id_fkey' AND conrelid = 'public.employee_notifications'::regclass) THEN
    ALTER TABLE ONLY public.employee_notifications ADD CONSTRAINT employee_notifications_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_settings_employee_id_fkey' AND conrelid = 'public.employee_settings'::regclass) THEN
    ALTER TABLE ONLY public.employee_settings ADD CONSTRAINT employee_settings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_employee_id_fkey' AND conrelid = 'public.employee_training'::regclass) THEN
    ALTER TABLE ONLY public.employee_training ADD CONSTRAINT employee_training_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_enrollment_id_fkey' AND conrelid = 'public.employee_training'::regclass) THEN
    ALTER TABLE ONLY public.employee_training ADD CONSTRAINT employee_training_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.training_enrollments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_competencies_competency_id_fkey' AND conrelid = 'public.employee_training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_training_competencies ADD CONSTRAINT employee_training_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_training_competencies_employee_training_id_fkey' AND conrelid = 'public.employee_training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.employee_training_competencies ADD CONSTRAINT employee_training_competencies_employee_training_id_fkey FOREIGN KEY (employee_training_id) REFERENCES public.employee_training(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_work_experience_employee_id_fkey' AND conrelid = 'public.employee_work_experience'::regclass) THEN
    ALTER TABLE ONLY public.employee_work_experience ADD CONSTRAINT employee_work_experience_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_reports_to_fkey' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE ONLY public.employees ADD CONSTRAINT employees_reports_to_fkey FOREIGN KEY (reports_to) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_applicant_id_fkey' AND conrelid = 'public.evaluations'::regclass) THEN
    ALTER TABLE ONLY public.evaluations ADD CONSTRAINT evaluations_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES public.applicants(id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evaluations_evaluator_id_fkey' AND conrelid = 'public.evaluations'::regclass) THEN
    ALTER TABLE ONLY public.evaluations ADD CONSTRAINT evaluations_evaluator_id_fkey FOREIGN KEY (evaluator_id) REFERENCES public.user_roles(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idp_entries_employee_id_fkey' AND conrelid = 'public.idp_entries'::regclass) THEN
    ALTER TABLE ONLY public.idp_entries ADD CONSTRAINT idp_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_employee_id_fkey' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_revised_by_fkey' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_revised_by_fkey FOREIGN KEY (revised_by) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_target_id_fkey' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.ipcr_targets(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_accomplishments_verified_by_fkey' AND conrelid = 'public.ipcr_accomplishments'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_accomplishments ADD CONSTRAINT ipcr_accomplishments_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_audit_log_performed_by_fkey' AND conrelid = 'public.ipcr_audit_log'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_audit_log ADD CONSTRAINT ipcr_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_audit_log_target_setting_id_fkey' AND conrelid = 'public.ipcr_audit_log'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_audit_log ADD CONSTRAINT ipcr_audit_log_target_setting_id_fkey FOREIGN KEY (target_setting_id) REFERENCES public.target_settings(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_competency_matches_employee_id_fkey' AND conrelid = 'public.ipcr_competency_matches'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_competency_matches ADD CONSTRAINT ipcr_competency_matches_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_designated_approvers_approver_employee_id_fkey' AND conrelid = 'public.ipcr_designated_approvers'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_designated_approvers ADD CONSTRAINT ipcr_designated_approvers_approver_employee_id_fkey FOREIGN KEY (approver_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_designated_approvers_employee_id_fkey' AND conrelid = 'public.ipcr_designated_approvers'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_designated_approvers ADD CONSTRAINT ipcr_designated_approvers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_designated_approvers_office_id_fkey' AND conrelid = 'public.ipcr_designated_approvers'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_designated_approvers ADD CONSTRAINT ipcr_designated_approvers_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_notifications_office_id_fkey' AND conrelid = 'public.ipcr_notifications'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_notifications ADD CONSTRAINT ipcr_notifications_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ipcr_competency' AND conrelid = 'public.ipcr_performance'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_performance ADD CONSTRAINT fk_ipcr_competency FOREIGN KEY (competency_id) REFERENCES public.competency_dictionary(competency_id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ipcr_employee' AND conrelid = 'public.ipcr_performance'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_performance ADD CONSTRAINT fk_ipcr_employee FOREIGN KEY (employee_num) REFERENCES public.employees(employee_number) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_schedules_employee_id_fkey' AND conrelid = 'public.ipcr_schedules'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_schedules ADD CONSTRAINT ipcr_schedules_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_submissions_employee_id_fkey' AND conrelid = 'public.ipcr_submissions'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_submissions ADD CONSTRAINT ipcr_submissions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_submissions_office_id_fkey' AND conrelid = 'public.ipcr_submissions'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_submissions ADD CONSTRAINT ipcr_submissions_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_targets_employee_id_fkey' AND conrelid = 'public.ipcr_targets'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_targets ADD CONSTRAINT ipcr_targets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_targets_revised_by_fkey' AND conrelid = 'public.ipcr_targets'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_targets ADD CONSTRAINT ipcr_targets_revised_by_fkey FOREIGN KEY (revised_by) REFERENCES public.accounts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_targets_schedule_id_fkey' AND conrelid = 'public.ipcr_targets'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_targets ADD CONSTRAINT ipcr_targets_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.ipcr_schedules(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_workspace_employee_id_fkey' AND conrelid = 'public.ipcr_workspace'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_workspace ADD CONSTRAINT ipcr_workspace_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ipcr_workspace_office_id_fkey' AND conrelid = 'public.ipcr_workspace'::regclass) THEN
    ALTER TABLE ONLY public.ipcr_workspace ADD CONSTRAINT ipcr_workspace_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locked_targets_employee_id_fkey' AND conrelid = 'public.locked_targets'::regclass) THEN
    ALTER TABLE ONLY public.locked_targets ADD CONSTRAINT locked_targets_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locked_targets_office_id_fkey' AND conrelid = 'public.locked_targets'::regclass) THEN
    ALTER TABLE ONLY public.locked_targets ADD CONSTRAINT locked_targets_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mfos_target_setting_id_fkey' AND conrelid = 'public.mfos'::regclass) THEN
    ALTER TABLE ONLY public.mfos ADD CONSTRAINT mfos_target_setting_id_fkey FOREIGN KEY (target_setting_id) REFERENCES public.target_settings(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'new_entrant_onboarding_employee_id_fkey' AND conrelid = 'public.new_entrant_onboarding'::regclass) THEN
    ALTER TABLE ONLY public.new_entrant_onboarding ADD CONSTRAINT new_entrant_onboarding_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'new_entrant_onboarding_office_id_fkey' AND conrelid = 'public.new_entrant_onboarding'::regclass) THEN
    ALTER TABLE ONLY public.new_entrant_onboarding ADD CONSTRAINT new_entrant_onboarding_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_recipient_id_fkey' AND conrelid = 'public.notifications'::regclass) THEN
    ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.accounts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_cycle_closeouts_office_id_fkey' AND conrelid = 'public.office_cycle_closeouts'::regclass) THEN
    ALTER TABLE ONLY public.office_cycle_closeouts ADD CONSTRAINT office_cycle_closeouts_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_role_assignments_employee_id_fkey' AND conrelid = 'public.office_role_assignments'::regclass) THEN
    ALTER TABLE ONLY public.office_role_assignments ADD CONSTRAINT office_role_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_role_assignments_office_id_fkey' AND conrelid = 'public.office_role_assignments'::regclass) THEN
    ALTER TABLE ONLY public.office_role_assignments ADD CONSTRAINT office_role_assignments_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'office_role_assignments_successor_employee_id_fkey' AND conrelid = 'public.office_role_assignments'::regclass) THEN
    ALTER TABLE ONLY public.office_role_assignments ADD CONSTRAINT office_role_assignments_successor_employee_id_fkey FOREIGN KEY (successor_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_cycle_id_fkey' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_employee_id_fkey' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'performance_evaluations_supervisor_id_fkey' AND conrelid = 'public.performance_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.performance_evaluations ADD CONSTRAINT performance_evaluations_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_schedules_office_id_fkey' AND conrelid = 'public.phase_schedules'::regclass) THEN
    ALTER TABLE ONLY public.phase_schedules ADD CONSTRAINT phase_schedules_office_id_fkey FOREIGN KEY (office_id) REFERENCES public.departments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plantilla_slots_filled_by' AND conrelid = 'public.plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.plantilla_slots ADD CONSTRAINT fk_plantilla_slots_filled_by FOREIGN KEY (filled_by_applicant_id) REFERENCES public.applicants(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_plantilla_slots_posting' AND conrelid = 'public.plantilla_slots'::regclass) THEN
    ALTER TABLE ONLY public.plantilla_slots ADD CONSTRAINT fk_plantilla_slots_posting FOREIGN KEY (job_posting_id) REFERENCES public.job_postings(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competencies_competency_id_fkey' AND conrelid = 'public.position_competencies'::regclass) THEN
    ALTER TABLE ONLY public.position_competencies ADD CONSTRAINT position_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competencies(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competencies_position_id_fkey' AND conrelid = 'public.position_competencies'::regclass) THEN
    ALTER TABLE ONLY public.position_competencies ADD CONSTRAINT position_competencies_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'position_competency_requirements_competency_id_fkey' AND conrelid = 'public.position_competency_requirements'::regclass) THEN
    ALTER TABLE ONLY public.position_competency_requirements ADD CONSTRAINT position_competency_requirements_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_standards(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_parent_position_id_fkey' AND conrelid = 'public.positions'::regclass) THEN
    ALTER TABLE ONLY public.positions ADD CONSTRAINT positions_parent_position_id_fkey FOREIGN KEY (parent_position_id) REFERENCES public.positions(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qualification_standards_competency_id_fkey' AND conrelid = 'public.qualification_standards'::regclass) THEN
    ALTER TABLE ONLY public.qualification_standards ADD CONSTRAINT qualification_standards_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.competency_dictionary(competency_id);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'semester_transition_state_current_cycle_id_fkey' AND conrelid = 'public.semester_transition_state'::regclass) THEN
    ALTER TABLE ONLY public.semester_transition_state ADD CONSTRAINT semester_transition_state_current_cycle_id_fkey FOREIGN KEY (current_cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'semester_transition_state_new_cycle_id_fkey' AND conrelid = 'public.semester_transition_state'::regclass) THEN
    ALTER TABLE ONLY public.semester_transition_state ADD CONSTRAINT semester_transition_state_new_cycle_id_fkey FOREIGN KEY (new_cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seminar_recommendation_events_employee_id_fkey' AND conrelid = 'public.seminar_recommendation_events'::regclass) THEN
    ALTER TABLE ONLY public.seminar_recommendation_events ADD CONSTRAINT seminar_recommendation_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seminar_recommendation_events_recommendation_id_fkey' AND conrelid = 'public.seminar_recommendation_events'::regclass) THEN
    ALTER TABLE ONLY public.seminar_recommendation_events ADD CONSTRAINT seminar_recommendation_events_recommendation_id_fkey FOREIGN KEY (recommendation_id) REFERENCES public.training_recommendations(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seminar_recommendation_events_session_id_fkey' AND conrelid = 'public.seminar_recommendation_events'::regclass) THEN
    ALTER TABLE ONLY public.seminar_recommendation_events ADD CONSTRAINT seminar_recommendation_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_overridden_by_fkey' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_rated_by_fkey' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicator_ratings_success_indicator_id_fkey' AND conrelid = 'public.success_indicator_ratings'::regclass) THEN
    ALTER TABLE ONLY public.success_indicator_ratings ADD CONSTRAINT success_indicator_ratings_success_indicator_id_fkey FOREIGN KEY (success_indicator_id) REFERENCES public.success_indicators(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'success_indicators_mfo_id_fkey' AND conrelid = 'public.success_indicators'::regclass) THEN
    ALTER TABLE ONLY public.success_indicators ADD CONSTRAINT success_indicators_mfo_id_fkey FOREIGN KEY (mfo_id) REFERENCES public.mfos(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidate_remarks_critical_position_id_fkey' AND conrelid = 'public.succession_candidate_remarks'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidate_remarks ADD CONSTRAINT succession_candidate_remarks_critical_position_id_fkey FOREIGN KEY (critical_position_id) REFERENCES public.critical_positions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidate_remarks_employee_id_fkey' AND conrelid = 'public.succession_candidate_remarks'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidate_remarks ADD CONSTRAINT succession_candidate_remarks_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidates_critical_position_id_fkey' AND conrelid = 'public.succession_candidates'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidates ADD CONSTRAINT succession_candidates_critical_position_id_fkey FOREIGN KEY (critical_position_id) REFERENCES public.critical_positions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'succession_candidates_employee_id_fkey' AND conrelid = 'public.succession_candidates'::regclass) THEN
    ALTER TABLE ONLY public.succession_candidates ADD CONSTRAINT succession_candidates_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supervisor_password_resets_supervisor_id_fkey' AND conrelid = 'public.supervisor_password_resets'::regclass) THEN
    ALTER TABLE ONLY public.supervisor_password_resets ADD CONSTRAINT supervisor_password_resets_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.supervisors(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_approved_by_fkey' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_cycle_id_fkey' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.performance_cycles(id) ON DELETE RESTRICT;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_employee_id_fkey' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'target_settings_reviewed_by_fkey' AND conrelid = 'public.target_settings'::regclass) THEN
    ALTER TABLE ONLY public.target_settings ADD CONSTRAINT target_settings_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.employees(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_attendance_days_enrollment_id_fkey' AND conrelid = 'public.training_attendance_days'::regclass) THEN
    ALTER TABLE ONLY public.training_attendance_days ADD CONSTRAINT training_attendance_days_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.training_enrollments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_competencies_competency_id_fkey' AND conrelid = 'public.training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.training_competencies ADD CONSTRAINT training_competencies_competency_id_fkey FOREIGN KEY (competency_id) REFERENCES public.training_competency_tags(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_competencies_session_id_fkey' AND conrelid = 'public.training_competencies'::regclass) THEN
    ALTER TABLE ONLY public.training_competencies ADD CONSTRAINT training_competencies_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_member_events_draft_id_fkey' AND conrelid = 'public.training_course_draft_member_events'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_member_events ADD CONSTRAINT training_course_draft_member_events_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.training_course_drafts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_draft_id_fkey' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_draft_id_fkey FOREIGN KEY (draft_id) REFERENCES public.training_course_drafts(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_draft_members_employee_id_fkey' AND conrelid = 'public.training_course_draft_members'::regclass) THEN
    ALTER TABLE ONLY public.training_course_draft_members ADD CONSTRAINT training_course_draft_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_session_id_fkey' AND conrelid = 'public.training_course_drafts'::regclass) THEN
    ALTER TABLE ONLY public.training_course_drafts ADD CONSTRAINT training_course_drafts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_course_drafts_target_department_id_fkey' AND conrelid = 'public.training_course_drafts'::regclass) THEN
    ALTER TABLE ONLY public.training_course_drafts ADD CONSTRAINT training_course_drafts_target_department_id_fkey FOREIGN KEY (target_department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_employee_id_fkey' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_enrollments_session_id_fkey' AND conrelid = 'public.training_enrollments'::regclass) THEN
    ALTER TABLE ONLY public.training_enrollments ADD CONSTRAINT training_enrollments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_evaluations_enrollment_id_fkey' AND conrelid = 'public.training_evaluations'::regclass) THEN
    ALTER TABLE ONLY public.training_evaluations ADD CONSTRAINT training_evaluations_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.training_enrollments(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_promoted_draft_id_fkey' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_promoted_draft_id_fkey FOREIGN KEY (promoted_draft_id) REFERENCES public.training_course_drafts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_source_request_id_fkey' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.training_requests(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_entries_target_department_id_fkey' AND conrelid = 'public.training_plan_entries'::regclass) THEN
    ALTER TABLE ONLY public.training_plan_entries ADD CONSTRAINT training_plan_entries_target_department_id_fkey FOREIGN KEY (target_department_id) REFERENCES public.departments(id) ON DELETE RESTRICT;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_batch_id_fkey' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.seminar_batches(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_employee_id_fkey' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_session_id_fkey' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_recommendations_source_cycle_id_fkey' AND conrelid = 'public.training_recommendations'::regclass) THEN
    ALTER TABLE ONLY public.training_recommendations ADD CONSTRAINT training_recommendations_source_cycle_id_fkey FOREIGN KEY (source_cycle_id) REFERENCES public.performance_cycles(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_report_notes_session_id_fkey' AND conrelid = 'public.training_report_notes'::regclass) THEN
    ALTER TABLE ONLY public.training_report_notes ADD CONSTRAINT training_report_notes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.training_sessions(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_decided_by_fkey' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_employee_id_fkey' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_requests_program_id_fkey' AND conrelid = 'public.training_requests'::regclass) THEN
    ALTER TABLE ONLY public.training_requests ADD CONSTRAINT training_requests_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_program_id_fkey' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.training_programs(id) ON DELETE CASCADE;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_source_draft_id_fkey' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_source_draft_id_fkey FOREIGN KEY (source_draft_id) REFERENCES public.training_course_drafts(id) ON DELETE SET NULL;
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_sessions_source_request_id_fkey' AND conrelid = 'public.training_sessions'::regclass) THEN
    ALTER TABLE ONLY public.training_sessions ADD CONSTRAINT training_sessions_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.training_requests(id) ON DELETE SET NULL;
  END IF;
END $do$;

-- 8. INDEXES
CREATE INDEX IF NOT EXISTS idx_access_change_audit_created_at ON public.access_change_audit USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS accounts_office_idx ON public.accounts USING btree (office);
CREATE INDEX IF NOT EXISTS accounts_role_idx ON public.accounts USING btree (role);
CREATE INDEX IF NOT EXISTS applicants_missed_activity_date_idx ON public.applicants USING btree (missed_activity_date) WHERE (missed_activity_date IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_applicants_created_at ON public.applicants USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_applicants_reference_no_normalized ON public.applicants USING btree (reference_no_normalized) WHERE ((reference_no IS NOT NULL) AND (btrim(reference_no) <> ''::text));
CREATE INDEX IF NOT EXISTS application_activity_log_application_idx ON public.application_activity_log USING btree (application_id);
CREATE INDEX IF NOT EXISTS application_activity_log_visible_idx ON public.application_activity_log USING btree (application_id, visible_to_applicant);
CREATE INDEX IF NOT EXISTS idx_app_docs_application ON public.application_documents USING btree (application_id);
CREATE INDEX IF NOT EXISTS idx_application_plantilla_applicant ON public.application_plantilla_slots USING btree (applicant_id);
CREATE INDEX IF NOT EXISTS idx_application_plantilla_slot ON public.application_plantilla_slots USING btree (plantilla_slot_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_application_plantilla_pair ON public.application_plantilla_slots USING btree (applicant_id, plantilla_slot_id);
CREATE INDEX IF NOT EXISTS idx_assignments_evaluator_id ON public.assignments USING btree (evaluator_id);
CREATE INDEX IF NOT EXISTS idx_ccl_created ON public.competency_change_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crp_status ON public.competency_requirement_proposals USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS cpcr_position_idx ON public.critical_position_competency_requirements USING btree (critical_position_id);
CREATE INDEX IF NOT EXISTS cptr_position_idx ON public.critical_position_training_requirements USING btree (critical_position_id);
CREATE INDEX IF NOT EXISTS critical_positions_dept_idx ON public.critical_positions USING btree (department_id);
CREATE INDEX IF NOT EXISTS idx_cycle_compilations_kind ON public.cycle_compilations USING btree (kind);
CREATE INDEX IF NOT EXISTS idx_cycle_compilations_office_period ON public.cycle_compilations USING btree (office_id, period);
CREATE INDEX IF NOT EXISTS cycle_log_employee_idx ON public.cycle_log USING btree (employee_id);
CREATE INDEX IF NOT EXISTS department_weighting_configs_department_idx ON public.department_weighting_configs USING btree (department_id, effective_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS department_weighting_configs_one_active_idx ON public.department_weighting_configs USING btree (department_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_departments_code ON public.departments USING btree (code);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON public.departments USING btree (parent_department_id);
CREATE INDEX IF NOT EXISTS eligibility_types_active_idx ON public.eligibility_types USING btree (is_active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS eligibility_types_name_uq ON public.eligibility_types USING btree (lower(name));
CREATE INDEX IF NOT EXISTS employee_children_employee_idx ON public.employee_children USING btree (employee_id, sort_order);
CREATE INDEX IF NOT EXISTS employee_competencies_competency_idx ON public.employee_competencies USING btree (competency_id);
CREATE INDEX IF NOT EXISTS employee_competencies_cycle_idx ON public.employee_competencies USING btree (cycle_id);
CREATE INDEX IF NOT EXISTS employee_competencies_employee_idx ON public.employee_competencies USING btree (employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS employee_competency_summaries_cycle_null_idx ON public.employee_competency_summaries USING btree (employee_id) WHERE (cycle_id IS NULL);
CREATE INDEX IF NOT EXISTS idx_employee_documents_category_source ON public.employee_documents USING btree (category, request_source);
CREATE INDEX IF NOT EXISTS idx_employee_documents_document_type ON public.employee_documents USING btree (document_type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_category ON public.employee_documents USING btree (employee_id, category, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee_id ON public.employee_documents USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type_uploaded_at ON public.employee_documents USING btree (document_type, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_education_employee_id ON public.employee_education USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_eligibility_employee_id ON public.employee_eligibility USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_history_action ON public.employee_history USING btree (action);
CREATE INDEX IF NOT EXISTS idx_employee_history_employee_id ON public.employee_history USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_history_performed_at ON public.employee_history USING btree (performed_at);
CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_employee_id ON public.employee_leave_balances USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_leave_balances_year ON public.employee_leave_balances USING btree (year);
CREATE INDEX IF NOT EXISTS employee_notifications_emp_idx ON public.employee_notifications USING btree (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employee_notifications_unread_idx ON public.employee_notifications USING btree (employee_id) WHERE (NOT is_read);
CREATE INDEX IF NOT EXISTS idx_employee_portal_accounts_employee_id ON public.employee_portal_accounts USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_portal_accounts_username_lower ON public.employee_portal_accounts USING btree (lower(username));
CREATE INDEX IF NOT EXISTS idx_employee_settings_employee_id ON public.employee_settings USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_training_employee_id ON public.employee_training USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_training_enrollment ON public.employee_training USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_etc_competency ON public.employee_training_competencies USING btree (competency_id);
CREATE INDEX IF NOT EXISTS idx_etc_training ON public.employee_training_competencies USING btree (employee_training_id);
CREATE INDEX IF NOT EXISTS idx_employee_work_experience_employee_id ON public.employee_work_experience USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_employees_date_hired ON public.employees USING btree (date_hired);
CREATE INDEX IF NOT EXISTS idx_employees_department ON public.employees USING btree (department);
CREATE INDEX IF NOT EXISTS idx_employees_email ON public.employees USING btree (email);
CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON public.employees USING btree (employee_number);
CREATE INDEX IF NOT EXISTS idx_employees_employment_status ON public.employees USING btree (employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON public.employees USING btree (reports_to);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees USING btree (status);
CREATE INDEX IF NOT EXISTS idx_evaluations_evaluator_id ON public.evaluations USING btree (evaluator_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_job_posting_id ON public.evaluations USING btree (job_posting_id);
CREATE INDEX IF NOT EXISTS idp_submissions_cycle_office_idx ON public.idp_submissions USING btree (cycle_year, office);
CREATE INDEX IF NOT EXISTS idp_submissions_employee_idx ON public.idp_submissions USING btree (employee_id, cycle_year);
CREATE INDEX IF NOT EXISTS ipcr_accomplishments_employee_idx ON public.ipcr_accomplishments USING btree (employee_id);
CREATE INDEX IF NOT EXISTS ipcr_audit_log_target_idx ON public.ipcr_audit_log USING btree (target_setting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_competency_idx ON public.ipcr_competency_matches USING btree (competency);
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_employee_idx ON public.ipcr_competency_matches USING btree (employee_id);
CREATE INDEX IF NOT EXISTS ipcr_competency_matches_review_idx ON public.ipcr_competency_matches USING btree (flag_for_review) WHERE flag_for_review;
CREATE INDEX IF NOT EXISTS ipcr_designated_approvers_approver_idx ON public.ipcr_designated_approvers USING btree (approver_employee_id);
CREATE INDEX IF NOT EXISTS ipcr_designated_approvers_dual_role_idx ON public.ipcr_designated_approvers USING btree (is_dual_role) WHERE is_dual_role;
CREATE INDEX IF NOT EXISTS idx_ipcr_notifications_phase_created ON public.ipcr_notifications USING btree (phase, created_at DESC);
CREATE INDEX IF NOT EXISTS ipcr_performance_competency_id_idx ON public.ipcr_performance USING btree (competency_id);
CREATE INDEX IF NOT EXISTS ipcr_schedules_employee_idx ON public.ipcr_schedules USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_ipcr_submissions_period_phase ON public.ipcr_submissions USING btree (period, phase);
CREATE INDEX IF NOT EXISTS idx_ipcr_submissions_stage ON public.ipcr_submissions USING btree (stage);
CREATE INDEX IF NOT EXISTS ipcr_targets_employee_idx ON public.ipcr_targets USING btree (employee_id);
CREATE INDEX IF NOT EXISTS ipcr_targets_schedule_idx ON public.ipcr_targets USING btree (schedule_id);
CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_employee ON public.ipcr_workspace USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_period ON public.ipcr_workspace USING btree (period);
CREATE INDEX IF NOT EXISTS idx_ipcr_workspace_status ON public.ipcr_workspace USING btree (status);
CREATE INDEX IF NOT EXISTS idx_job_postings_dept_grade ON public.job_postings USING btree (department, salary_grade DESC);
CREATE INDEX IF NOT EXISTS idx_job_postings_status ON public.job_postings USING btree (status);
CREATE INDEX IF NOT EXISTS idx_job_postings_title ON public.job_postings USING btree (title);
CREATE INDEX IF NOT EXISTS idx_jobs_department ON public.jobs USING btree (department);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs USING btree (status);
CREATE INDEX IF NOT EXISTS idx_locked_targets_employee ON public.locked_targets USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_locked_targets_office ON public.locked_targets USING btree (office_id);
CREATE INDEX IF NOT EXISTS idx_locked_targets_period ON public.locked_targets USING btree (period);
CREATE INDEX IF NOT EXISTS mfos_target_setting_idx ON public.mfos USING btree (target_setting_id, function_type, sort_order);
CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_employee ON public.new_entrant_onboarding USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_office ON public.new_entrant_onboarding USING btree (office_id);
CREATE INDEX IF NOT EXISTS idx_new_entrant_onboarding_stage ON public.new_entrant_onboarding USING btree (initial_target_stage);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON public.notifications USING btree (recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_office_cycle_closeouts_period ON public.office_cycle_closeouts USING btree (period);
CREATE INDEX IF NOT EXISTS idx_office_role_assignments_employee ON public.office_role_assignments USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_office_role_assignments_office ON public.office_role_assignments USING btree (office_id);
CREATE INDEX IF NOT EXISTS idx_office_role_assignments_status ON public.office_role_assignments USING btree (status);
CREATE INDEX IF NOT EXISTS office_role_assignments_employee_active_idx ON public.office_role_assignments USING btree (employee_id, status);
CREATE INDEX IF NOT EXISTS performance_cycles_status_idx ON public.performance_cycles USING btree (status);
CREATE INDEX IF NOT EXISTS performance_evaluations_cycle_idx ON public.performance_evaluations USING btree (cycle_id);
CREATE INDEX IF NOT EXISTS performance_evaluations_employee_idx ON public.performance_evaluations USING btree (employee_id);
CREATE INDEX IF NOT EXISTS performance_evaluations_status_idx ON public.performance_evaluations USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS phase_schedules_office_uq ON public.phase_schedules USING btree (office_id, phase) WHERE (scope = 'office'::text);
CREATE UNIQUE INDEX IF NOT EXISTS phase_schedules_system_uq ON public.phase_schedules USING btree (phase) WHERE (scope = 'system'::text);
CREATE INDEX IF NOT EXISTS idx_plantilla_slots_posting ON public.plantilla_slots USING btree (job_posting_id);
CREATE INDEX IF NOT EXISTS idx_plantilla_slots_status ON public.plantilla_slots USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_item_number ON public.plantilla_slots USING btree (lower(btrim(item_number)));
CREATE UNIQUE INDEX IF NOT EXISTS uq_plantilla_slots_posting_ordinal ON public.plantilla_slots USING btree (job_posting_id, slot_number);
CREATE INDEX IF NOT EXISTS pm_lnd_reports_status_created_idx ON public.pm_lnd_reports USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS position_competencies_competency_idx ON public.position_competencies USING btree (competency_id);
CREATE INDEX IF NOT EXISTS position_competencies_position_idx ON public.position_competencies USING btree (position_id);
CREATE INDEX IF NOT EXISTS idx_pcr_competency_id ON public.position_competency_requirements USING btree (competency_id);
CREATE INDEX IF NOT EXISTS idx_pcr_position_title ON public.position_competency_requirements USING btree (position_title);
CREATE INDEX IF NOT EXISTS idx_pcr_source ON public.position_competency_requirements USING btree (source);
CREATE INDEX IF NOT EXISTS positions_department_idx ON public.positions USING btree (department);
CREATE INDEX IF NOT EXISTS positions_name_lower_idx ON public.positions USING btree (lower(name));
CREATE INDEX IF NOT EXISTS positions_parent_idx ON public.positions USING btree (parent_position_id);
CREATE INDEX IF NOT EXISTS positions_salary_grade_idx ON public.positions USING btree (salary_grade);
CREATE INDEX IF NOT EXISTS idx_promo_apps_employee ON public.promotional_applications USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_promo_apps_status ON public.promotional_applications USING btree (status);
CREATE INDEX IF NOT EXISTS qualification_standards_competency_id_idx ON public.qualification_standards USING btree (competency_id);
CREATE INDEX IF NOT EXISTS idx_raters_email ON public.raters USING btree (email);
CREATE INDEX IF NOT EXISTS idx_raters_is_active ON public.raters USING btree (is_active);
CREATE INDEX IF NOT EXISTS idx_seminar_rec_events_session ON public.seminar_recommendation_events USING btree (session_id);
CREATE INDEX IF NOT EXISTS success_indicator_ratings_si_idx ON public.success_indicator_ratings USING btree (success_indicator_id);
CREATE INDEX IF NOT EXISTS success_indicators_mfo_idx ON public.success_indicators USING btree (mfo_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_scr_position ON public.succession_candidate_remarks USING btree (critical_position_id);
CREATE INDEX IF NOT EXISTS succession_candidates_position_idx ON public.succession_candidates USING btree (critical_position_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_password_resets_supervisor_id ON public.supervisor_password_resets USING btree (supervisor_id);
CREATE INDEX IF NOT EXISTS idx_supervisors_username_lower ON public.supervisors USING btree (lower(username));
CREATE INDEX IF NOT EXISTS target_settings_employee_cycle_idx ON public.target_settings USING btree (employee_id, cycle_id);
CREATE INDEX IF NOT EXISTS target_settings_phase2_approved_at_idx ON public.target_settings USING btree (phase2_approved_at);
CREATE UNIQUE INDEX IF NOT EXISTS training_attendance_days_enrollment_day_session_idx ON public.training_attendance_days USING btree (enrollment_id, day_date, session);
CREATE INDEX IF NOT EXISTS training_attendance_days_enrollment_idx ON public.training_attendance_days USING btree (enrollment_id);
CREATE INDEX IF NOT EXISTS training_course_draft_member_events_draft_id_idx ON public.training_course_draft_member_events USING btree (draft_id, created_at DESC);
CREATE INDEX IF NOT EXISTS training_course_draft_members_draft_id_idx ON public.training_course_draft_members USING btree (draft_id);
CREATE INDEX IF NOT EXISTS training_course_drafts_target_department_id_idx ON public.training_course_drafts USING btree (target_department_id, status);
CREATE INDEX IF NOT EXISTS training_enrollments_session_id_idx ON public.training_enrollments USING btree (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS training_plan_entries_source_request_uniq ON public.training_plan_entries USING btree (source_request_id) WHERE (source_request_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS training_plan_entries_year_idx ON public.training_plan_entries USING btree (plan_year, tentative_start_date);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_batch ON public.training_recommendations USING btree (batch_id);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_status ON public.training_recommendations USING btree (status);
CREATE INDEX IF NOT EXISTS training_recommendations_employee_idx ON public.training_recommendations USING btree (employee_id);
CREATE INDEX IF NOT EXISTS training_recommendations_session_idx ON public.training_recommendations USING btree (session_id);
CREATE INDEX IF NOT EXISTS training_recommendations_status_idx ON public.training_recommendations USING btree (status);
CREATE INDEX IF NOT EXISTS idx_training_requests_requesting_office ON public.training_requests USING btree (requesting_office);
CREATE INDEX IF NOT EXISTS idx_training_sessions_roster_published ON public.training_sessions USING btree (roster_published_at);
CREATE INDEX IF NOT EXISTS training_sessions_scheduled_date_idx ON public.training_sessions USING btree (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON public.user_roles USING btree (email);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles USING btree (role);
CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON public.user_roles USING btree (user_id);

-- 9. FUNCTIONS
CREATE OR REPLACE FUNCTION public.apply_slot_outcomes_after_fill()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'filled' AND NEW.filled_by_applicant_id IS NOT NULL THEN
    UPDATE application_plantilla_slots
       SET status = CASE WHEN applicant_id = NEW.filled_by_applicant_id THEN 'hired' ELSE 'not_selected' END,
           updated_at = now()
     WHERE plantilla_slot_id = NEW.id;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.assign_application_reference_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.reference_no := generate_application_reference_no();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.block_draft_roster_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_source_draft_id uuid;
BEGIN
  SELECT source_draft_id INTO v_source_draft_id
    FROM training_sessions WHERE id = OLD.session_id;

  IF v_source_draft_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Attendees of a draft-originated roster cannot be deleted; deactivate them via Training Courses instead.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_published_recommendation_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'PUBLISHED' AND NEW.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION
      'This roster is published and cannot be reopened (recommendation %).', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.demo_create_account(p_email text, p_password text, p_full_name text, p_employee_code text, p_role text, p_office text, p_position_title text, p_date_hired date, p_created_by_pm uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, email text, full_name text, employee_code text, role text, office text, position_title text, date_hired date, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  INSERT INTO accounts (email, password_hash, full_name, employee_code, role,
                        office, position_title, date_hired, created_by_pm)
  VALUES (lower(trim(p_email)), crypt(p_password, gen_salt('bf')), p_full_name,
          NULLIF(trim(p_employee_code), ''), p_role, p_office, p_position_title,
          p_date_hired, p_created_by_pm)
  RETURNING accounts.id, accounts.email, accounts.full_name, accounts.employee_code,
            accounts.role, accounts.office, accounts.position_title, accounts.date_hired,
            accounts.status, accounts.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.demo_login(p_email text, p_password text)
 RETURNS TABLE(id uuid, email text, full_name text, employee_code text, role text, office text, position_title text, date_hired date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT a.id, a.email, a.full_name, a.employee_code, a.role, a.office,
         a.position_title, a.date_hired, a.status
  FROM accounts a
  WHERE a.email = lower(trim(p_email))
    AND a.status = 'Active'
    AND a.password_hash = crypt(p_password, a.password_hash);
END;
$function$;

CREATE OR REPLACE FUNCTION public.demo_set_password(p_account_id uuid, p_new_password text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE accounts SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_account_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.eligibility_types_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_active_office()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only guard active employees. Separated/legacy rows may keep historical
  -- office values so audit trails and FK links survive.
  IF NEW.status = 'Active' AND NEW.department IS NOT NULL AND btrim(NEW.department) <> '' THEN
    IF NOT EXISTS (
      SELECT 1 FROM departments d
       WHERE d.is_active
         AND lower(btrim(d.name)) = lower(btrim(NEW.department))
    ) THEN
      RAISE EXCEPTION
        'Office "%" is not an active office. Active employees can only be assigned to one of the 5 active offices.',
        NEW.department;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_roster_removal_origin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only deactivations are policed; adds and edits pass through.
  IF OLD.is_active AND NOT NEW.is_active THEN
    IF coalesce(btrim(NEW.removed_reason), '') = '' THEN
      RAISE EXCEPTION 'A removal reason is required when removing an attendee.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_training_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Locked once we are within 3 days of the start (this also covers trainings
  -- that have already started or finished).
  IF now() >= (OLD.scheduled_date - interval '3 days') THEN
    IF ( NEW.title           IS DISTINCT FROM OLD.title
      OR NEW.category         IS DISTINCT FROM OLD.category
      OR NEW.scheduled_date   IS DISTINCT FROM OLD.scheduled_date
      OR NEW.end_date         IS DISTINCT FROM OLD.end_date
      OR NEW.capacity         IS DISTINCT FROM OLD.capacity
      OR NEW.objectives       IS DISTINCT FROM OLD.objectives
      OR NEW.instructor_name  IS DISTINCT FROM OLD.instructor_name
      OR NEW.location         IS DISTINCT FROM OLD.location
      OR NEW.description       IS DISTINCT FROM OLD.description
      OR NEW.materials        IS DISTINCT FROM OLD.materials
      OR NEW.prerequisites    IS DISTINCT FROM OLD.prerequisites
      OR NEW.program_id       IS DISTINCT FROM OLD.program_id
      OR NEW.is_internal      IS DISTINCT FROM OLD.is_internal
    ) THEN
      RAISE EXCEPTION 'Training is locked: editing closes 3 days before start.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_training_course_draft(p_draft_id uuid, p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_draft   training_course_drafts%ROWTYPE;
  v_session uuid;
BEGIN
  SELECT * INTO v_draft FROM training_course_drafts WHERE id = p_draft_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draft % not found.', p_draft_id;
  END IF;

  IF v_draft.status = 'Finalized' THEN
    RAISE EXCEPTION 'Draft "%" is already finalized.', v_draft.title;
  END IF;

  -- Finalizing straight from 'Draft' would skip Dept Head review entirely.
  IF v_draft.status <> 'Returned' THEN
    RAISE EXCEPTION 'Draft "%" must be returned by the Dept Head before it can be finalized (current status: %).',
      v_draft.title, v_draft.status;
  END IF;

  IF v_draft.start_date IS NULL THEN
    RAISE EXCEPTION 'Draft "%" needs a start date before it can be finalized.', v_draft.title;
  END IF;

  INSERT INTO training_sessions (
    program_id, title, category, scheduled_date, end_date, instructor_name,
    location, capacity, objectives, status, source_draft_id, roster_status
  ) VALUES (
    NULL, v_draft.title, v_draft.category, v_draft.start_date, v_draft.end_date,
    v_draft.instructor_name, v_draft.location, v_draft.capacity, v_draft.objectives,
    'Scheduled', v_draft.id, 'Draft'
  )
  RETURNING id INTO v_session;

  -- Only the employees still Included make it onto the roster; the Excluded rows
  -- stay behind in the draft as the audit trail for why they are not here.
  INSERT INTO training_enrollments (
    employee_id, session_id, status, enrollment_status, added_by, added_by_role, is_active
  )
  SELECT m.employee_id, v_session, 'Enrolled', 'Pending', p_actor, 'LND', true
    FROM training_course_draft_members m
   WHERE m.draft_id = v_draft.id AND m.state = 'Included'
  ON CONFLICT (employee_id, session_id) DO NOTHING;

  UPDATE training_course_drafts
     SET status = 'Finalized', finalized_at = now(), session_id = v_session, updated_at = now()
   WHERE id = v_draft.id;

  RETURN v_session;
END;
$function$;

CREATE OR REPLACE FUNCTION public.flag_applicants_orphaned_by_slot_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE public.applicants a
     SET needs_slot_reassignment = true
   WHERE a.id IN (
     SELECT aps.applicant_id
     FROM application_plantilla_slots aps
     WHERE aps.plantilla_slot_id = OLD.id
   )
   AND NOT EXISTS (
     SELECT 1
     FROM application_plantilla_slots other
     JOIN plantilla_slots ps ON ps.id = other.plantilla_slot_id
     WHERE other.applicant_id = a.id
       AND other.plantilla_slot_id <> OLD.id
       AND ps.job_posting_id = OLD.job_posting_id
   );
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION public.freeze_application_reference_no()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.reference_no IS NOT NULL AND NEW.reference_no IS DISTINCT FROM OLD.reference_no THEN
    NEW.reference_no := OLD.reference_no;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.generate_application_reference_no()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  candidate text;
  attempts  integer := 0;
BEGIN
  LOOP
    -- After 50 collisions the 6-digit space is effectively exhausted, so widen
    -- to a third segment rather than spinning forever. A longer reference is
    -- better than a failed submission.
    IF attempts < 50 THEN
      candidate := 'ABYAN-'
        || lpad((floor(random() * 1000))::int::text, 3, '0')
        || '-'
        || lpad((floor(random() * 1000))::int::text, 3, '0');
    ELSE
      candidate := 'ABYAN-'
        || lpad((floor(random() * 1000))::int::text, 3, '0')
        || '-'
        || lpad((floor(random() * 1000))::int::text, 3, '0')
        || '-'
        || lpad((floor(random() * 1000))::int::text, 3, '0');
    END IF;

    -- EVERY candidate is verified, including the widened ones. Returning an
    -- unchecked value would surface as a 23505 on the applicant's INSERT,
    -- i.e. a failed submission — the exact failure this loop exists to avoid.
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.applicants
       WHERE reference_no_normalized = upper(regexp_replace(candidate, '[^A-Za-z0-9]', '', 'g'))
    );

    attempts := attempts + 1;
    IF attempts > 500 THEN
      RAISE EXCEPTION
        'Could not generate a unique application reference number after % attempts', attempts;
    END IF;
  END LOOP;

  RETURN candidate;
END $function$;

CREATE OR REPLACE FUNCTION public.generate_employee_number()
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
DECLARE
  year INT;
  sequence INT;
  counter VARCHAR(5);
BEGIN
  year := EXTRACT(YEAR FROM NOW());
  sequence := (SELECT COALESCE(MAX(CAST(SUBSTRING(employee_number, 12) AS INT)), 0) + 1
               FROM employees
               WHERE employee_number LIKE 'EMP-' || year || '-%');
  counter := LPAD(sequence::TEXT, 5, '0');
  RETURN 'EMP-' || year || '-' || counter;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ipcr_block_edit_when_approved()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_new        jsonb := to_jsonb(NEW);
  v_old        jsonb := to_jsonb(OLD);
  v_setting_id uuid;
  v_status     text;
BEGIN
  IF TG_TABLE_NAME = 'mfos' THEN
    v_setting_id := COALESCE(v_new->>'target_setting_id', v_old->>'target_setting_id')::uuid;
  ELSIF TG_TABLE_NAME = 'success_indicators' THEN
    SELECT m.target_setting_id INTO v_setting_id
      FROM mfos m
     WHERE m.id = COALESCE(v_new->>'mfo_id', v_old->>'mfo_id')::uuid;
  END IF;

  SELECT status INTO v_status FROM target_settings WHERE id = v_setting_id;

  IF v_status = 'approved' THEN
    RAISE EXCEPTION 'IPCR target setting % is approved and frozen; its targets cannot be modified.', v_setting_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ipcr_rating_scale_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ipcr_submissions_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ipcr_workspace_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.user_id = auth.uid()
       AND coalesce(ur.is_active, true)
       -- Mirrors normalizeAdminRole() in src/App.tsx: 'admin', 'superadmin',
       -- 'super_admin' and 'super-admin' all mean super-admin.
       AND replace(lower(ur.role), '_', '-') IN ('admin', 'superadmin', 'super-admin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.new_entrant_onboarding_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.office_role_assignments_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pcr_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.performance_evaluations_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.phase_schedules_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pm_lnd_reports_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.positions_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.promote_training_plan_entry(p_entry_id uuid, p_actor text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_entry training_plan_entries%ROWTYPE;
  v_draft uuid;
BEGIN
  SELECT * INTO v_entry FROM training_plan_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan entry % not found.', p_entry_id;
  END IF;

  IF v_entry.promoted_draft_id IS NOT NULL THEN
    RAISE EXCEPTION 'Plan entry "%" has already been promoted.', v_entry.title;
  END IF;

  IF v_entry.plan_status <> 'Confirmed' THEN
    RAISE EXCEPTION 'Only a Confirmed plan entry can be promoted; "%" is %.',
      v_entry.title, v_entry.plan_status;
  END IF;

  -- "Transitions to Page 3 at the start of the new year": the plan year must
  -- have actually arrived. Guards against promoting next year's plan early.
  IF v_entry.plan_year > EXTRACT(YEAR FROM now())::int THEN
    RAISE EXCEPTION 'Plan entry "%" is for %, which has not started yet.',
      v_entry.title, v_entry.plan_year;
  END IF;

  IF v_entry.target_department_id IS NULL THEN
    RAISE EXCEPTION 'Plan entry "%" needs a department before it can be promoted: a Training Courses draft has no Dept Head to review it otherwise.',
      v_entry.title;
  END IF;

  INSERT INTO training_course_drafts (
    title, category, objectives, instructor_name, start_date, end_date,
    location, capacity, target_department_id, status, created_by
  ) VALUES (
    v_entry.title, v_entry.category, v_entry.objectives, v_entry.instructor_name,
    v_entry.tentative_start_date, v_entry.tentative_end_date, v_entry.location,
    v_entry.capacity, v_entry.target_department_id, 'Draft', p_actor
  )
  RETURNING id INTO v_draft;

  UPDATE training_plan_entries
     SET promoted_draft_id = v_draft, promoted_at = now(), updated_at = now()
   WHERE id = v_entry.id;

  RETURN v_draft;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_employees_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.settle_plantilla_slot_outcomes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.status = 'filled' AND NEW.filled_by_applicant_id IS NOT NULL THEN
    NEW.filled_at := COALESCE(NEW.filled_at, now());
  ELSIF NEW.status <> 'filled' THEN
    NEW.filled_at := NULL;
    NEW.filled_by_applicant_id := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sync_employee_department_text()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.department_id IS NOT NULL THEN
    SELECT name INTO NEW.current_department FROM departments WHERE id = NEW.department_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_job_posting_primary_item_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  target_posting uuid;
  primary_item   text;
BEGIN
  target_posting := COALESCE(NEW.job_posting_id, OLD.job_posting_id);

  SELECT ps.item_number INTO primary_item
  FROM plantilla_slots ps
  WHERE ps.job_posting_id = target_posting
  ORDER BY ps.slot_number
  LIMIT 1;

  IF primary_item IS NOT NULL THEN
    UPDATE public.job_postings SET item_number = primary_item WHERE id = target_posting;
  END IF;

  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.update_employee_modified_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.modified_at = NOW();
  RETURN NEW;
END;
$function$;

-- 10. VIEWS
CREATE OR REPLACE VIEW public.applicant_tracker_view AS
 SELECT id,
    item_number,
    reference_no,
    reference_no_normalized,
    first_name,
    last_name,
    email,
    contact_number,
    "position",
    office,
    status,
    created_at,
    updated_at,
    application_type,
    disqualification_reason,
    exam_date,
    exam_time,
    oral_exam_date,
    oral_exam_time,
    interview_date,
    interview_time,
    venue,
    schedule_instructions,
    disqualified_at,
    disqualification_reason_category,
    is_final,
        CASE
            WHEN disqualification_message_visible THEN disqualification_message
            ELSE NULL::text
        END AS disqualification_message,
    disqualification_message_visible
   FROM applicants a;

CREATE OR REPLACE VIEW public.employees_with_department AS
 SELECT id,
    employee_number AS employee_id,
    TRIM(BOTH FROM (((COALESCE(first_name, ''::character varying)::text || ' '::text) || COALESCE(middle_name, ''::character varying)::text) || ' '::text) || COALESCE(last_name, ''::character varying)::text) AS full_name,
    first_name,
    last_name,
    middle_name,
    email,
    phone AS mobile_number,
    "position" AS current_position,
    department AS current_department,
    department,
    NULL::text AS current_division,
    date_hired AS hire_date,
    status,
    user_account_id AS user_id,
    date_of_birth,
    sex AS gender,
    civil_status,
    nationality,
    tin_number,
    sss_number,
    philhealth_number,
    pagibig_number,
    created_at,
    modified_at AS updated_at,
    '[]'::jsonb AS position_history,
    false AS personal_details_finalized,
    current_address_street AS home_address
   FROM employees;

CREATE OR REPLACE VIEW public.job_postings_with_slot_summary AS
 SELECT jp.id AS job_posting_id,
    count(ps.id) AS slot_count,
    count(ps.id) FILTER (WHERE ps.status = 'open'::text) AS open_count,
    count(ps.id) FILTER (WHERE ps.status = 'filled'::text) AS filled_count,
    count(ps.id) FILTER (WHERE ps.status = 'closed'::text) AS closed_count,
    COALESCE(( SELECT count(DISTINCT aps.applicant_id) AS count
           FROM application_plantilla_slots aps
             JOIN plantilla_slots s ON s.id = aps.plantilla_slot_id
          WHERE s.job_posting_id = jp.id), 0::bigint) AS applicant_count
   FROM job_postings jp
     LEFT JOIN plantilla_slots ps ON ps.job_posting_id = jp.id
  GROUP BY jp.id;

CREATE OR REPLACE VIEW public.v_competency_gap_analysis AS
 SELECT ipcr.employee_num,
    emp.first_name,
    emp.last_name,
    emp.department,
    ipcr.position_id,
    ipcr."position",
    ipcr.competency_id,
    COALESCE(dict.competency_standard ->> 'title'::text,
        CASE
            WHEN jsonb_typeof(dict.competency_standard) = 'string'::text THEN dict.competency_standard #>> '{}'::text[]
            ELSE NULL::text
        END, dict.competency_standard::text, ipcr.mapped_competency_standard) AS mapped_competency_standard,
    COALESCE(dict.training_stream, 'General Training'::text) AS training_stream,
    avg(ipcr.ave_rating) AS possessed_proficiency,
    COALESCE(avg(qs.required_proficiency_level), 3.0) AS required_proficiency,
    avg((COALESCE(qs.required_proficiency_level, 3.0) - ipcr.ave_rating) *
        CASE
            WHEN upper(TRIM(BOTH FROM ipcr.function_type)) = 'CORE'::text THEN 0.60
            WHEN upper(TRIM(BOTH FROM ipcr.function_type)) = 'SUPPORT'::text THEN 0.40
            ELSE 0.40
        END) AS final_gap_indicator,
        CASE
            WHEN avg((COALESCE(qs.required_proficiency_level, 3.0) - ipcr.ave_rating) *
            CASE
                WHEN upper(TRIM(BOTH FROM ipcr.function_type)) = 'CORE'::text THEN 0.60
                WHEN upper(TRIM(BOTH FROM ipcr.function_type)) = 'SUPPORT'::text THEN 0.40
                ELSE 0.40
            END) > 0::numeric THEN 'YES'::text
            ELSE 'NO'::text
        END AS training_needed
   FROM ipcr_performance ipcr
     LEFT JOIN employees emp ON ipcr.employee_num::text = emp.employee_number::text
     LEFT JOIN competency_dictionary dict ON ipcr.competency_id = dict.competency_id
     LEFT JOIN qualification_standards qs ON ipcr.position_id = qs.position_id AND ipcr.competency_id = qs.competency_id
  GROUP BY ipcr.employee_num, emp.first_name, emp.last_name, emp.department, ipcr.position_id, ipcr."position", ipcr.competency_id, dict.competency_standard, dict.training_stream, ipcr.mapped_competency_standard;

-- 11. TRIGGERS
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assign_application_reference_no' AND tgrelid = 'public.applicants'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_assign_application_reference_no BEFORE INSERT ON public.applicants FOR EACH ROW EXECUTE FUNCTION assign_application_reference_no();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_freeze_application_reference_no' AND tgrelid = 'public.applicants'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_freeze_application_reference_no BEFORE UPDATE ON public.applicants FOR EACH ROW EXECUTE FUNCTION freeze_application_reference_no();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eligibility_types_updated_at' AND tgrelid = 'public.eligibility_types'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_eligibility_types_updated_at BEFORE UPDATE ON public.eligibility_types FOR EACH ROW EXECUTE FUNCTION eligibility_types_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_active_office' AND tgrelid = 'public.employees'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_enforce_active_office BEFORE INSERT OR UPDATE OF department, status ON public.employees FOR EACH ROW EXECUTE FUNCTION enforce_active_office();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_employee_modified_at' AND tgrelid = 'public.employees'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trigger_employee_modified_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION update_employee_modified_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ipcr_rating_scale_updated_at' AND tgrelid = 'public.ipcr_rating_scale'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_ipcr_rating_scale_updated_at BEFORE UPDATE ON public.ipcr_rating_scale FOR EACH ROW EXECUTE FUNCTION ipcr_rating_scale_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ipcr_submissions_updated_at' AND tgrelid = 'public.ipcr_submissions'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_ipcr_submissions_updated_at BEFORE UPDATE ON public.ipcr_submissions FOR EACH ROW EXECUTE FUNCTION ipcr_submissions_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ipcr_workspace_updated_at' AND tgrelid = 'public.ipcr_workspace'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_ipcr_workspace_updated_at BEFORE UPDATE ON public.ipcr_workspace FOR EACH ROW EXECUTE FUNCTION ipcr_workspace_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'mfos_block_when_approved' AND tgrelid = 'public.mfos'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER mfos_block_when_approved BEFORE INSERT OR DELETE OR UPDATE ON public.mfos FOR EACH ROW EXECUTE FUNCTION ipcr_block_edit_when_approved();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_new_entrant_onboarding_updated_at' AND tgrelid = 'public.new_entrant_onboarding'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_new_entrant_onboarding_updated_at BEFORE UPDATE ON public.new_entrant_onboarding FOR EACH ROW EXECUTE FUNCTION new_entrant_onboarding_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_office_role_assignments_updated_at' AND tgrelid = 'public.office_role_assignments'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_office_role_assignments_updated_at BEFORE UPDATE ON public.office_role_assignments FOR EACH ROW EXECUTE FUNCTION office_role_assignments_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'performance_evaluations_updated_at' AND tgrelid = 'public.performance_evaluations'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER performance_evaluations_updated_at BEFORE UPDATE ON public.performance_evaluations FOR EACH ROW EXECUTE FUNCTION performance_evaluations_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_phase_schedules_updated_at' AND tgrelid = 'public.phase_schedules'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_phase_schedules_updated_at BEFORE UPDATE ON public.phase_schedules FOR EACH ROW EXECUTE FUNCTION phase_schedules_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_apply_slot_outcomes' AND tgrelid = 'public.plantilla_slots'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_apply_slot_outcomes AFTER UPDATE OF status, filled_by_applicant_id ON public.plantilla_slots FOR EACH ROW EXECUTE FUNCTION apply_slot_outcomes_after_fill();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_flag_orphaned_applicants' AND tgrelid = 'public.plantilla_slots'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_flag_orphaned_applicants BEFORE DELETE ON public.plantilla_slots FOR EACH ROW EXECUTE FUNCTION flag_applicants_orphaned_by_slot_delete();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_settle_slot_outcomes' AND tgrelid = 'public.plantilla_slots'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_settle_slot_outcomes BEFORE INSERT OR UPDATE ON public.plantilla_slots FOR EACH ROW EXECUTE FUNCTION settle_plantilla_slot_outcomes();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sync_job_posting_item_number' AND tgrelid = 'public.plantilla_slots'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_sync_job_posting_item_number AFTER INSERT OR DELETE OR UPDATE OF item_number, slot_number ON public.plantilla_slots FOR EACH ROW EXECUTE FUNCTION sync_job_posting_primary_item_number();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pm_lnd_reports_updated_at' AND tgrelid = 'public.pm_lnd_reports'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER pm_lnd_reports_updated_at BEFORE UPDATE ON public.pm_lnd_reports FOR EACH ROW EXECUTE FUNCTION pm_lnd_reports_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pcr_updated_at' AND tgrelid = 'public.position_competency_requirements'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_pcr_updated_at BEFORE UPDATE ON public.position_competency_requirements FOR EACH ROW EXECUTE FUNCTION pcr_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'positions_updated_at' AND tgrelid = 'public.positions'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION positions_set_updated_at();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'success_indicators_block_when_approved' AND tgrelid = 'public.success_indicators'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER success_indicators_block_when_approved BEFORE INSERT OR DELETE OR UPDATE ON public.success_indicators FOR EACH ROW EXECUTE FUNCTION ipcr_block_edit_when_approved();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_draft_roster_delete' AND tgrelid = 'public.training_enrollments'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_block_draft_roster_delete BEFORE DELETE ON public.training_enrollments FOR EACH ROW EXECUTE FUNCTION block_draft_roster_delete();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_roster_removal_origin' AND tgrelid = 'public.training_enrollments'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_enforce_roster_removal_origin BEFORE UPDATE ON public.training_enrollments FOR EACH ROW EXECUTE FUNCTION enforce_roster_removal_origin();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_block_published_recommendation_change' AND tgrelid = 'public.training_recommendations'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_block_published_recommendation_change BEFORE UPDATE ON public.training_recommendations FOR EACH ROW EXECUTE FUNCTION block_published_recommendation_change();
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_training_lock' AND tgrelid = 'public.training_sessions'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_enforce_training_lock BEFORE UPDATE ON public.training_sessions FOR EACH ROW EXECUTE FUNCTION enforce_training_lock();
  END IF;
END $do$;

-- 12. RLS
ALTER TABLE public.applicant_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_weighting_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eligibility_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fgd_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idp_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idp_form_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idp_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipcr_rating_scale ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_lnd_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_draft_member_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_draft_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_course_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weighting_schema_options ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow anon access') THEN
    CREATE POLICY "Allow anon access" ON public.applicants AS PERMISSIVE FOR ALL TO public USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow anonymous read') THEN
    CREATE POLICY "Allow anonymous read" ON public.applicants AS PERMISSIVE FOR SELECT TO public USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow anonymous update status') THEN
    CREATE POLICY "Allow anonymous update status" ON public.applicants AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_postings' AND policyname = 'Allow authenticated insert job_postings') THEN
    CREATE POLICY "Allow authenticated insert job_postings" ON public.job_postings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'Allow public delete on jobs') THEN
    CREATE POLICY "Allow public delete on jobs" ON public.jobs AS PERMISSIVE FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raters' AND policyname = 'Allow public delete on raters') THEN
    CREATE POLICY "Allow public delete on raters" ON public.raters AS PERMISSIVE FOR DELETE TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicant_attachments' AND policyname = 'Allow public insert on applicant_attachments') THEN
    CREATE POLICY "Allow public insert on applicant_attachments" ON public.applicant_attachments AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow public insert on applicants') THEN
    CREATE POLICY "Allow public insert on applicants" ON public.applicants AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'Allow public insert on jobs') THEN
    CREATE POLICY "Allow public insert on jobs" ON public.jobs AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raters' AND policyname = 'Allow public insert on raters') THEN
    CREATE POLICY "Allow public insert on raters" ON public.raters AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_postings' AND policyname = 'Allow public read job_postings') THEN
    CREATE POLICY "Allow public read job_postings" ON public.job_postings AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicant_attachments' AND policyname = 'Allow public read on applicant_attachments') THEN
    CREATE POLICY "Allow public read on applicant_attachments" ON public.applicant_attachments AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow public read on applicants') THEN
    CREATE POLICY "Allow public read on applicants" ON public.applicants AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'Allow public read on jobs') THEN
    CREATE POLICY "Allow public read on jobs" ON public.jobs AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raters' AND policyname = 'Allow public read on raters') THEN
    CREATE POLICY "Allow public read on raters" ON public.raters AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applicants' AND policyname = 'Allow public update on applicants') THEN
    CREATE POLICY "Allow public update on applicants" ON public.applicants AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'jobs' AND policyname = 'Allow public update on jobs') THEN
    CREATE POLICY "Allow public update on jobs" ON public.jobs AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raters' AND policyname = 'Allow public update on raters') THEN
    CREATE POLICY "Allow public update on raters" ON public.raters AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_programs' AND policyname = 'Allow read access to admins, LND, and PM') THEN
    CREATE POLICY "Allow read access to admins, LND, and PM" ON public.training_programs AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'lnd'::text, 'pm'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_programs' AND policyname = 'Allow write access to LND and super-admin') THEN
    CREATE POLICY "Allow write access to LND and super-admin" ON public.training_programs AS PERMISSIVE FOR ALL TO authenticated USING (((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'lnd'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_documents' AND policyname = 'Enable ALL for anon users on employee_documents') THEN
    CREATE POLICY "Enable ALL for anon users on employee_documents" ON public.employee_documents AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_documents' AND policyname = 'Enable ALL for authenticated users on employee_documents') THEN
    CREATE POLICY "Enable ALL for authenticated users on employee_documents" ON public.employee_documents AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employees' AND policyname = 'Enable ALL for authenticated users on employees') THEN
    CREATE POLICY "Enable ALL for authenticated users on employees" ON public.employees AS PERMISSIVE FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pm_lnd_reports' AND policyname = 'Enable all for anon') THEN
    CREATE POLICY "Enable all for anon" ON public.pm_lnd_reports AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'competency_dictionary' AND policyname = 'Enable read access for all users') THEN
    CREATE POLICY "Enable read access for all users" ON public.competency_dictionary AS PERMISSIVE FOR SELECT TO authenticated, service_role, supabase_admin, supabase_auth_admin, supabase_etl_admin, supabase_privileged_role, supabase_realtime_admin, supabase_replication_admin, supabase_storage_admin USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'anon_delete') THEN
    CREATE POLICY anon_delete ON public.evaluations AS PERMISSIVE FOR DELETE TO anon USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'anon_insert') THEN
    CREATE POLICY anon_insert ON public.evaluations AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'anon_select') THEN
    CREATE POLICY anon_select ON public.evaluations AS PERMISSIVE FOR SELECT TO anon USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'anon_update') THEN
    CREATE POLICY anon_update ON public.evaluations AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_activity_log' AND policyname = 'application_activity_log_admin_all') THEN
    CREATE POLICY application_activity_log_admin_all ON public.application_activity_log AS PERMISSIVE FOR ALL TO public USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text]))) WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'application_activity_log' AND policyname = 'application_activity_log_public_read') THEN
    CREATE POLICY application_activity_log_public_read ON public.application_activity_log AS PERMISSIVE FOR SELECT TO public USING ((visible_to_applicant = true));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'authenticated_delete') THEN
    CREATE POLICY authenticated_delete ON public.evaluations AS PERMISSIVE FOR DELETE TO authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'authenticated_insert') THEN
    CREATE POLICY authenticated_insert ON public.evaluations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'authenticated_select') THEN
    CREATE POLICY authenticated_select ON public.evaluations AS PERMISSIVE FOR SELECT TO authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'authenticated_update') THEN
    CREATE POLICY authenticated_update ON public.evaluations AS PERMISSIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'competencies' AND policyname = 'competencies_admin_all') THEN
    CREATE POLICY competencies_admin_all ON public.competencies AS PERMISSIVE FOR ALL TO public USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text]))) WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'competencies' AND policyname = 'competencies_authenticated_read') THEN
    CREATE POLICY competencies_authenticated_read ON public.competencies AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'department_weighting_configs' AND policyname = 'department_weighting_configs_read') THEN
    CREATE POLICY department_weighting_configs_read ON public.department_weighting_configs AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'eligibility_types' AND policyname = 'eligibility_types_portal_access') THEN
    CREATE POLICY eligibility_types_portal_access ON public.eligibility_types AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_children' AND policyname = 'employee_children_portal_access') THEN
    CREATE POLICY employee_children_portal_access ON public.employee_children AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'employee_competencies' AND policyname = 'employee_competencies_admin_all') THEN
    CREATE POLICY employee_competencies_admin_all ON public.employee_competencies AS PERMISSIVE FOR ALL TO public USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text]))) WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fgd_notes' AND policyname = 'fgd_admin_all') THEN
    CREATE POLICY fgd_admin_all ON public.fgd_notes AS PERMISSIVE FOR ALL TO public USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idp_entries' AND policyname = 'idp_admin_all') THEN
    CREATE POLICY idp_admin_all ON public.idp_entries AS PERMISSIVE FOR ALL TO public USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idp_form_config' AND policyname = 'idp_form_config_portal_access') THEN
    CREATE POLICY idp_form_config_portal_access ON public.idp_form_config AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idp_entries' AND policyname = 'idp_self_read') THEN
    CREATE POLICY idp_self_read ON public.idp_entries AS PERMISSIVE FOR SELECT TO public USING ((employee_id IN ( SELECT employees.id
   FROM employees
  WHERE (employees.user_account_id = auth.uid()))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'idp_submissions' AND policyname = 'idp_submissions_portal_access') THEN
    CREATE POLICY idp_submissions_portal_access ON public.idp_submissions AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ipcr_rating_scale' AND policyname = 'ipcr_rating_scale_portal_access') THEN
    CREATE POLICY ipcr_rating_scale_portal_access ON public.ipcr_rating_scale AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_postings' AND policyname = 'job_postings_anon_all') THEN
    CREATE POLICY job_postings_anon_all ON public.job_postings AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'office_role_assignments' AND policyname = 'office_role_assignments_delete') THEN
    CREATE POLICY office_role_assignments_delete ON public.office_role_assignments AS PERMISSIVE FOR DELETE TO authenticated USING (is_super_admin());
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'office_role_assignments' AND policyname = 'office_role_assignments_insert') THEN
    CREATE POLICY office_role_assignments_insert ON public.office_role_assignments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_super_admin());
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'office_role_assignments' AND policyname = 'office_role_assignments_read') THEN
    CREATE POLICY office_role_assignments_read ON public.office_role_assignments AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'office_role_assignments' AND policyname = 'office_role_assignments_update') THEN
    CREATE POLICY office_role_assignments_update ON public.office_role_assignments AS PERMISSIVE FOR UPDATE TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin());
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'performance_cycles' AND policyname = 'performance_cycles_admin_all') THEN
    CREATE POLICY performance_cycles_admin_all ON public.performance_cycles AS PERMISSIVE FOR ALL TO public USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text]))) WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'performance_cycles' AND policyname = 'performance_cycles_anon_read') THEN
    CREATE POLICY performance_cycles_anon_read ON public.performance_cycles AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'performance_cycles' AND policyname = 'performance_cycles_authenticated_read') THEN
    CREATE POLICY performance_cycles_authenticated_read ON public.performance_cycles AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'performance_evaluations' AND policyname = 'performance_evaluations_admin_all') THEN
    CREATE POLICY performance_evaluations_admin_all ON public.performance_evaluations AS PERMISSIVE FOR ALL TO public USING ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text]))) WITH CHECK ((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'RSP'::text, 'LND'::text])));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'policy_audit' AND policyname = 'policy_audit_delete') THEN
    CREATE POLICY policy_audit_delete ON public.policy_audit AS PERMISSIVE FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'policy_audit' AND policyname = 'policy_audit_insert') THEN
    CREATE POLICY policy_audit_insert ON public.policy_audit AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) IS NOT NULL));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'policy_audit' AND policyname = 'policy_audit_select') THEN
    CREATE POLICY policy_audit_select ON public.policy_audit AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'policy_audit' AND policyname = 'policy_audit_update') THEN
    CREATE POLICY policy_audit_update ON public.policy_audit AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) IS NOT NULL));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'positions' AND policyname = 'positions_portal_access') THEN
    CREATE POLICY positions_portal_access ON public.positions AS PERMISSIVE FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'raters' AND policyname = 'raters_anon_all') THEN
    CREATE POLICY raters_anon_all ON public.raters AS PERMISSIVE FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'rsp_admin_select_evaluations') THEN
    CREATE POLICY rsp_admin_select_evaluations ON public.evaluations AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (lower((ur.role)::text) = ANY (ARRAY['rsp_admin'::text, 'rsp'::text, 'admin'::text]))))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'service_role_delete') THEN
    CREATE POLICY service_role_delete ON public.evaluations AS PERMISSIVE FOR DELETE TO service_role USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'service_role_insert') THEN
    CREATE POLICY service_role_insert ON public.evaluations AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'service_role_select') THEN
    CREATE POLICY service_role_select ON public.evaluations AS PERMISSIVE FOR SELECT TO service_role USING (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'evaluations' AND policyname = 'service_role_update') THEN
    CREATE POLICY service_role_update ON public.evaluations AS PERMISSIVE FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_course_draft_member_events' AND policyname = 'training_course_draft_member_events_admin_all') THEN
    CREATE POLICY training_course_draft_member_events_admin_all ON public.training_course_draft_member_events AS PERMISSIVE FOR ALL TO authenticated USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text])))) WITH CHECK (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_course_draft_members' AND policyname = 'training_course_draft_members_admin_all') THEN
    CREATE POLICY training_course_draft_members_admin_all ON public.training_course_draft_members AS PERMISSIVE FOR ALL TO authenticated USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text])))) WITH CHECK (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'training_course_drafts' AND policyname = 'training_course_drafts_admin_all') THEN
    CREATE POLICY training_course_drafts_admin_all ON public.training_course_drafts AS PERMISSIVE FOR ALL TO authenticated USING (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text])))) WITH CHECK (((((auth.jwt() -> 'user_metadata'::text) ->> 'role'::text) = ANY (ARRAY['ADMIN'::text, 'PM'::text, 'LND'::text])) OR ((auth.jwt() ->> 'role'::text) = ANY (ARRAY['super-admin'::text, 'pm'::text, 'lnd'::text]))));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'user_roles_self_read') THEN
    CREATE POLICY user_roles_self_read ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'weighting_schema_options' AND policyname = 'weighting_schema_options_read') THEN
    CREATE POLICY weighting_schema_options_read ON public.weighting_schema_options AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $do$;

-- 13. GRANTS
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.access_change_audit, public.applicant_attachments, public.applicant_tracker_view, public.applicants, public.application_activity_log, public.application_documents, public.application_plantilla_slots, public.assignments, public.competencies, public.competency_change_log, public.competency_dictionary, public.competency_requirement_proposals, public.competency_standards, public.critical_position_competency_requirements, public.critical_position_training_requirements, public.critical_positions, public.cycle_compilations, public.cycle_log, public.demo_offices, public.demo_settings, public.departments, public.departments_backfill_audit, public.eligibility_types, public.employee_children, public.employee_competencies, public.employee_competency_summaries, public.employee_documents, public.employee_education, public.employee_eligibility, public.employee_history, public.employee_leave_balances, public.employee_notifications, public.employee_portal_accounts, public.employee_settings, public.employee_training, public.employee_training_competencies, public.employee_work_experience, public.employees, public.employees_with_department, public.evaluation_cycles, public.evaluations, public.fgd_notes, public.idp_entries, public.idp_form_config, public.idp_submissions, public.ipcr_accomplishments, public.ipcr_competency_matches, public.ipcr_designated_approvers, public.ipcr_notifications, public.ipcr_performance, public.ipcr_rating_scale, public.ipcr_schedules, public.ipcr_submissions, public.ipcr_targets, public.ipcr_workspace, public.job_postings, public.job_postings_with_slot_summary, public.jobs, public.locked_targets, public.mfos, public.new_entrant_onboarding, public.newly_hired, public.notifications, public.office_cycle_closeouts, public.performance_cycles, public.performance_evaluations, public.phase_schedules, public.plantilla_slots, public.pm_lnd_reports, public.policy_audit, public.position_competencies, public.position_competency_requirements, public.positions, public.probationary_ipcr_schedules, public.promotional_applications, public.qualification_standards, public.raters, public.semester_transition_state, public.seminar_batches, public.seminar_recommendation_events, public.success_indicator_ratings, public.success_indicators, public.succession_candidate_remarks, public.succession_candidates, public.supervisor_password_resets, public.supervisors, public.target_settings, public.training_attendance_days, public.training_competencies, public.training_competency_tags, public.training_course_draft_member_events, public.training_course_draft_members, public.training_course_drafts, public.training_enrollments, public.training_evaluations, public.training_plan_entries, public.training_programs, public.training_recommendations, public.training_report_notes, public.training_requests, public.training_sessions, public.trainings, public.user_roles, public.v_competency_gap_analysis TO anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON public.accounts TO anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.accounts TO service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.ipcr_audit_log TO anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.ipcr_audit_log TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER ON public.department_weighting_configs, public.weighting_schema_options TO anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.department_weighting_configs, public.weighting_schema_options TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER ON public.office_role_assignments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.office_role_assignments TO authenticated, service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.applicant_attachments_id_seq, public.evaluation_cycles_id_seq, public.ipcr_performance_id_seq, public.jobs_id_seq, public.performance_cycles_id_seq, public.policy_audit_id_seq, public.raters_id_seq, public.trainings_id_seq TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;

COMMIT;
