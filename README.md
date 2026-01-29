# CICTrix HRIS - Applicant Module

A modern, production-ready Applicant Module for an HRIS system built with React, TypeScript, and Supabase. Features a two-step wizard form for collecting applicant information and uploading documents.

## Features

- ✅ **Two-Step Wizard Form** - Clean UX with step indicators and navigation
- ✅ **Applicant Assessment Form** - Comprehensive data collection (Name, Address, Contact, Email, Position, etc.)
- ✅ **File Upload System** - Drag-and-drop support with file validation
- ✅ **Supabase Integration** - Database storage and file management
- ✅ **Form Validation** - Real-time validation with error messages
- ✅ **Responsive Design** - Mobile-first approach, works on all devices
- ✅ **Reusable Components** - Modular component library (Input, Button, Card, etc.)
- ✅ **TypeScript** - Full type safety
- ✅ **PWD Support** - Person with Disability checkbox

## Tech Stack

- **Frontend**: React 18, TypeScript
- **Styling**: CSS with CSS Variables
- **Backend**: Supabase (PostgreSQL + Storage)
- **Build Tool**: Vite
- **State Management**: React Hooks

## Project Structure

```
CICTrix/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Input.tsx
│   │   ├── Button.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Select.tsx
│   │   ├── Card.tsx
│   │   ├── Dialog.tsx
│   │   ├── Accordion.tsx
│   │   ├── FileUpload.tsx
│   │   └── index.ts
│   ├── modules/
│   │   └── applicant/       # Applicant module
│   │       ├── ApplicantAssessmentForm.tsx
│   │       ├── AttachmentsUploadForm.tsx
│   │       └── ApplicantWizard.tsx
│   ├── lib/
│   │   └── supabase.ts      # Supabase client configuration
│   ├── types/
│   │   ├── database.types.ts # Supabase type definitions
│   │   └── applicant.types.ts # Applicant-specific types
│   ├── utils/
│   │   └── validation.ts    # Form validation logic
│   ├── styles/
│   │   ├── globals.css      # Global styles and CSS variables
│   │   ├── components.css   # Component-specific styles
│   │   ├── fileUpload.css   # File upload styles
│   │   └── wizard.css       # Wizard-specific styles
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── supabase/
│   └── schema.sql           # Database schema and policies
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL commands from `supabase/schema.sql` in the Supabase SQL Editor:
   - Creates `applicants` table
   - Creates `applicant_attachments` table
   - Sets up storage bucket
   - Configures Row Level Security policies
3. Copy your project URL and anon key

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update `.env` with your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### 5. Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

## Usage

### Step 1: Applicant Assessment Form

Users fill in the following required fields:
- **Full Name**: Applicant's complete name
- **Email Address**: Valid email for communication
- **Contact Number**: Phone number
- **Position Applied For**: Select from dropdown
- **Address**: Complete residential address
- **Item Number**: Position item number from job posting
- **Preferred Office**: Select office location
- **PWD Status**: Optional checkbox for PWD applicants

### Step 2: Upload Documents

Users can upload multiple files:
- Drag and drop or click to upload
- Supported formats: PDF, DOC, DOCX, JPG, PNG
- Maximum file size: 10MB per file
- Required: At least one document (typically resume)

### Form Submission

1. Form validates all inputs before proceeding
2. Files are uploaded to Supabase Storage
3. Applicant data is saved to the database
4. File metadata is linked to the applicant record
5. Success dialog confirms submission

## Database Schema

### `applicants` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| name | VARCHAR(255) | Full name |
| address | TEXT | Complete address |
| contact_number | VARCHAR(50) | Phone number |
| email | VARCHAR(255) | Email address |
| position | VARCHAR(255) | Position applied for |
| item_number | VARCHAR(100) | Item number |
| office | VARCHAR(255) | Preferred office |
| is_pwd | BOOLEAN | PWD status |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

### `applicant_attachments` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (auto-generated) |
| applicant_id | UUID | Foreign key to applicants |
| file_name | VARCHAR(255) | Original filename |
| file_path | TEXT | Storage path |
| file_type | VARCHAR(100) | MIME type |
| file_size | INTEGER | File size in bytes |
| created_at | TIMESTAMP | Upload timestamp |

## Component Library

### Form Components
- **Input**: Text input with label, error, and helper text
- **Select**: Dropdown with options
- **Checkbox**: Checkbox with label
- **FileUpload**: File upload with drag-and-drop

### UI Components
- **Button**: Configurable button (primary, secondary, outline, ghost)
- **Card**: Container with title and content
- **Dialog**: Modal dialog
- **Accordion**: Collapsible content panel

## Styling

The application uses CSS variables for theming:

```css
--color-primary: #2563eb
--color-secondary: #64748b
--color-success: #10b981
--color-error: #ef4444
--spacing-*: Consistent spacing scale
--font-size-*: Typography scale
```

All styles are in the `src/styles/` directory and can be customized.

## Validation Rules

### Applicant Form
- Name: Required, min 2 characters
- Address: Required, min 5 characters
- Contact Number: Required, valid phone format
- Email: Required, valid email format
- Position: Required
- Item Number: Required
- Office: Required

### File Upload
- At least 1 file required
- Max file size: 10MB
- Allowed formats: PDF, DOC, DOCX, JPG, PNG

## Security

- Row Level Security (RLS) enabled on all tables
- File storage access controlled by policies
- Input sanitization and validation
- TypeScript for type safety

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Follow the existing code structure
2. Use TypeScript for all new files
3. Add proper type definitions
4. Validate forms before submission
5. Keep components modular and reusable

## License

Proprietary - CICTrix HRIS System

## Support

For issues or questions, contact the development team.