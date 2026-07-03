Abyan HRIS — LND Dashboard & Analytics Wireframe

System Title: Abyan HRIS
Font: Poppins
Main Color: #363EE8
Background/White: #FFFFFF
Text Color: #040E6B
Gradients: linear-gradient(90deg,#C8D1FF 0%, #363EE8 100%)

---

## Overview

This document is a text-based visual wireframe for the Learning & Development (LND) Dashboard page required by the LGU Human Resource Management Office.

The layout follows a top-to-bottom flow:
- Top header / system title
- Metric cards (key KPIs)
- Training Recommendation bar chart
- Accumulated Yearly View (department totals summary)
- Competency Tracking Table (styled to match reference image_89d49a.png rows)

---

**Wireframe (Markdown visual representation)**

Header
------

- Abyan HRIS (left) — LND Dashboard  |  User / Org selector (right)

Top Row — Metric Cards (4 across, responsive to 2 per row on small screens)

---------------------------------------------------------------
| [Card: Total Training Requests] | [Card: Active Training Plans] | [Card: Dept. Requests (YTD)] | [Card: Next-Year Budget Estimate] |
---------------------------------------------------------------

Example Card (visual)

- Title: Total Training Requests (Office Accounts)
- Big number: 1,482
- Subtle label: from office accounts (all departments)
- Small footer: % change vs last year (▲ 12%)

---

Training Recommendation (Bar Chart)

Title: Training Recommendation — Top categories for next year's plan

Layout: horizontal bar chart area (left) + legend & filters (right)

Legend: 4 categories stacked by value
- CULTURAL TRANSFORMATION — color: #363EE8
- EMPLOYEE DEVELOPMENT — color: #7B8BFF (light variant)
- LEADERSHIP — color: #4C6BFF
- TECHNICAL — color: #A8B8FF

ASCII Mock (bar lengths are relative):

CULTURAL TRANSFORMATION | ██████████████░░░░  58%
EMPLOYEE DEVELOPMENT   | ████████████░░░░░░  52%
LEADERSHIP             | ██████████░░░░░░░░  44%
TECHNICAL              | ████████░░░░░░░░░░  32%

Right pane: Controls
- Department filter (All / select departments)
- Timeframe selector (Year / Quarter)
- Export CSV button

---

Accumulated View — Department Requests (Yearly)

Title: Department Request Totals — Yearly Accumulated View

Layout: compact cards or small table showing departments sorted by total requests

Example (compact):

1. Finance — 234 requests
2. Health — 198 requests
3. Social Services — 176 requests
4. Planning — 162 requests
... (show top 10 and a "View All" link)

---

Competency Tracking Table (Reference: image_89d49a.png style)

Notes: The table below replicates the row/card-like layout, subtle borders, and action patterns in the provided reference image. Columns map as follows:
- Column 1 (Icon & Main Entity) → `Department Name`
- Column 2 (Secondary Info) → `Top Requested Competency` (one of the 12 LGU metrics)
- Column 3 (Status Pill) → `Priority Status` (• High Priority / • Medium / • Low)
- Column 4 (Visual Bar) → `Demand Level` visual: horizontal progress bar + percentage
- Column 5 (Actions) → `View Details` (outlined button)

Table (visual markdown mimic):

| Department | Top Requested Competency | Status | Demand Level | Actions |
|---|---|---:|---:|---|
| [🏛️ City Planning]\
  _Office of Planning_ | Project Management in a Public Setting | • High Priority | ██████████░░ 83% | [View Details] |
| [🏥 Health]\
  _Health Dept._ | Disaster Risk Reduction and Management | • High Priority | ████████░░░░ 67% | [View Details] |
| [💼 Finance]\
  _Finance Dept._ | Fiscal Management / Budgeting for LGU | • Medium Priority | ███████░░░░░ 55% | [View Details] |
| [👥 Social Services]\
  _Social Services_ | Community Engagement Skills | • Medium Priority | ██████░░░░░ 42% | [View Details] |
| [🖥️ ICT]\
  _Information & Tech_ | Digital Literacy for Government Services | • Low Priority | ████░░░░░░ 28% | [View Details] |

Visual and Row Style Details (to match image_89d49a.png):
- Rows rendered as card-like blocks with subtle shadow / border radius ~8px and a faint border (#E9EEFF or similar).
- Left column includes a small circular icon (department emblem) plus department name bold and a secondary line for department unit.
- Status pill uses a small colored dot + text (dot color: red/orange/green) and lightweight pill background when necessary.
- Demand Level column uses a mono-space-like progress bar for the wireframe but will be implemented as a CSS bar in production.
- Actions column shows an outlined button (rounded corners) labeled "View Details".

Accessibility
- Each row should be keyboard-focusable; the progress bar must include `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and an offscreen label with the numeric value.

---

Footer / Notes

- Bottom-right: Quick links: "Create Training Plan", "Upload Training Requests", "Import from CSV".
- Top-right: Brief help tooltip describing how categories map to LGU training taxonomy.

---

Next steps: create a static HTML mock and include CSS snippets for the responsive demand-level bar.
