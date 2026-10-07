# ABYAN HRIS — UI Design Identity Guide

> **Human Resource Information System**
> *A Decision Support Information System for Competency Assessment, Training Recommendations, and Data-Driven Succession Planning.*

This document is the single source of truth for how ABYAN looks and feels. Every view, portal, and component (Public/Applicant, Employee, HR/Admin) must follow it so the system reads as **one product**. If something in the UI conflicts with this guide, the guide wins — fix the UI, or update the guide through a PR.

---

## Table of Contents

1. [Brand Purpose & Vibe](#1-brand-purpose--vibe)
2. [Logo](#2-logo)
3. [Color System](#3-color-system)
4. [Typography](#4-typography)
5. [Spacing, Radius, Elevation](#5-spacing-radius-elevation)
6. [Iconography](#6-iconography)
7. [Brand Pattern & Graphics](#7-brand-pattern--graphics)
8. [Layout & Page Anatomy](#8-layout--page-anatomy)
9. [Components](#9-components)
   - [Buttons](#91-buttons) · [Navigation](#92-navigation-header--tabs) · [Forms](#93-form-controls) · [Table toolbar](#94-table-toolbar-search--sort--entries) · [Tables](#95-tables) · [Pagination](#96-pagination) · [KPI cards](#97-dashboard-kpi-cards) · [Status badges](#98-status--category-badges) · [Alerts & toasts](#99-alerts-toasts) · [Modals](#910-modals--dialogs) · [Charts](#911-charts--data-visualization) · [Side navigation](#912-side-navigation-portals)
10. [Status & Category Color Map (HR Domain)](#10-status--category-color-map-hr-domain)
11. [Portal-Specific Notes](#11-portal-specific-notes)
12. [Voice & Content](#12-voice--content)
13. [Accessibility](#13-accessibility)
14. [Design Tokens (CSS / Tailwind)](#14-design-tokens-css--tailwind)
15. [Do & Don't](#15-do--dont)
16. [PR Consistency Checklist](#16-pr-consistency-checklist)
17. [Open Items / Known Inconsistencies](#17-open-items--known-inconsistencies)

---

## 1. Brand Purpose & Vibe

**Purpose.** ABYAN bridges the operational gaps in the Human Resource Management Office by assessing employee competency gaps, recommending training, and supporting long-term, evidence-based succession planning. It also serves as the public gateway for job seekers to find vacancies, apply, and track applications.

**The name.** *Abyan* (from "*Abyan mo sa pag-asenso*", "we support your progress") signals guidance and forward movement. The tagline used on the landing hero is **"Your gateway to public service."**

**Personality — how the UI should feel**

| Trait | What it means in the UI |
|---|---|
| **Trustworthy** | Deep blues, clear hierarchy, no visual noise. This is government/HR data. |
| **Modern & clean** | Generous white space, rounded shapes, one typeface (Poppins). |
| **Empowering** | Growth-oriented language, clear next actions, visible progress. |
| **Evidence-driven** | Data is front and center: KPIs, gaps, charts, statuses are always legible. |
| **Approachable** | Friendly rounded pill buttons, occasional Filipino warmth in public-facing copy. |

**Design principles**

1. **One system, many portals.** A button is a button everywhere.
2. **Data first, decoration second.** Brand patterns live in heroes and empty states, never behind dense tables.
3. **Color means something.** Blue = brand/action. Green / Orange / Red = status only. Never decorative.
4. **Clarity over cleverness.** Every screen has one primary action.

---

## 2. Logo

- **File:** `USWAG (3)` (use the exported SVG/PNG from the brand assets folder; do not redraw or re-trace).
- **Mark:** A white ribbon "A" with an arch and three people beneath it, symbolizing an organization sheltering and supporting its workforce.
- **Lockup (header):** `[Mark]  ABYAN` (Poppins Bold, white) + `Human Resource Information System` (Poppins Regular, white, smaller, same baseline, ~12px gap after the wordmark).

**Usage rules**

| Rule | Spec |
|---|---|
| Primary background | Brand blue `#363EE8` or the hero gradient. Logo is **white**. |
| On white backgrounds | Use a blue (`#363EE8` or `#040e6b`) single-color version of the mark. |
| Header height for logo | Mark 32–40px tall. |
| Clear space | At least the width of one "person" icon in the mark on every side. |
| Minimum size | Mark: 24px. Full lockup: 160px wide. |
| Never | Stretch, rotate, add shadows/outlines, recolor to non-brand colors, or place on busy imagery without a blue overlay. |

**App icon / favicon:** the white mark centered on solid `#363EE8` (square, ~20% padding).

---

## 3. Color System

### 3.1 Brand palette

| Role | Token | Hex | Usage |
|---|---|---|---|
| **Primary** | `--color-primary` | `#363EE8` | Primary buttons, links, active states, focus rings, header bar |
| **Primary — Deep** | `--color-primary-900` | `#040E6B` | Headings and primary text on light backgrounds, hero gradient end |
| **Primary — Dark** | `--color-primary-700` | `#191FA8` | Hover/pressed for primary, dark accents |
| **Primary — Vivid** | `--color-primary-accent` | `#000CFF` | Sparingly: brand pattern highlights, focus glow, charts |
| **Primary — Tint** | `--color-primary-200` | `#C8D1FF` | Soft backgrounds, selected rows, disabled primary, gradient start |
| **White** | `--color-white` | `#FFFFFF` | Cards, surfaces, text on blue |

### 3.2 Backgrounds

| Token | Hex | Usage |
|---|---|---|
| `--bg-page` | `#F1F5F9` | Default app/page background, table header row, input hover |
| `--bg-surface` | `#FFFFFF` | Cards, modals, dropdowns, tables, inputs |
| `--bg-brand` | `#363EE8` | Header bar, brand sections |
| `--bg-tint` | `#C8D1FF` at 30–40% (or `#EEF0FF`) | Selected items, info panels, icon chips |

### 3.3 Neutrals (text & borders)

| Token | Hex | Usage |
|---|---|---|
| `--neutral-900` | `#101E29` | Strongest neutral text (rare; dense data emphasis) |
| `--neutral-800` | `#28343D` | Body text, secondary headings |
| `--neutral-600` | `#515F69` | Secondary text, captions, helper text, placeholders (darker variant) |
| `--neutral-400` *(proposed)* | `#94A3B8` | Placeholder, disabled text, inactive icons |
| `--neutral-200` *(proposed)* | `#E2E8F0` | Borders, dividers |
| `--neutral-100` *(proposed)* | `#F1F5F9` | Same as page background |

### 3.4 Text colors

| Situation | Color |
|---|---|
| Headings & primary text on light bg | `#040E6B` |
| Body / secondary text on light bg | `#28343D` |
| Captions, helper text, subtitles | `#515F69` |
| Text on blue backgrounds, on gradient, or inside filled buttons | `#FFFFFF` |
| Links | `#363EE8` (hover `#191FA8`, underline on hover) |
| Disabled text | `#94A3B8` |

### 3.5 Gradients

| Name | Definition | Usage |
|---|---|---|
| **Hero** | `linear-gradient(180deg, #363EE8 0%, #040E6B 100%)` | Landing/public hero, login side panel |
| **Brand Soft** | `linear-gradient(135deg, #C8D1FF 0%, #363EE8 100%)` | Feature panels, illustration backdrops, progress accents |
| **Primary Button** | `linear-gradient(180deg, #363EE8 0%, #191FA8 100%)` | Primary buttons (subtle; see Buttons) |

Portal heroes are straight-edged: the hero gradient plus one blended, faded photograph (see §7.1). **No drawn shapes** (circles, arcs, blobs, polygons) and no curved hero corners.

### 3.6 Semantic status colors

Each status color has three steps. **100** = soft background, **300** = borders/illustrations, **500** = solid fill/icons. A **700** step (proposed) is for text on 100 backgrounds to keep contrast accessible.

| | 100 | 300 | 500 | 700 *(text on 100)* |
|---|---|---|---|---|
| **Success / Green** | `#DCFCE7` | `#7ECBA1` | `#16A85A` | `#0F7A40` |
| **Warning / Orange** | `#FCE8C8` | `#F0B478` | `#E8821A` | `#A8590A` |
| **Error / Red** | `#FDE2E2` | `#EF9A9A` | `#E05252` | `#B42323` |
| **Info / Blue** | `#E0E5FF` | `#C8D1FF` | `#363EE8` | `#191FA8` |
| **Neutral / Gray** | `#F1F5F9` | `#CBD5E1` | `#64748B` | `#28343D` |

> Green/Orange/Red hexes are sampled from the palette reference image and rounded; confirm against the design file and update here if they differ.

**Rules**
- Green/Orange/Red are **status only** (success, caution, error/critical). Do not use them for decoration or for generic categories.
- Never rely on color alone. Always pair with an icon or label text.
- Solid `500` fills use white text (except Orange, use `#FFFFFF` bold ≥14px or switch to the 100/700 badge style).

---

## 4. Typography

**Typeface:** **Poppins** (Google Fonts). Load weights **400, 500, 600, 700**. Fallback stack: `'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.

### 4.1 Type scale

| Style | Weight | Size | Line height | Letter spacing | Typical use |
|---|---|---|---|---|---|
| **Title L** | Bold (700) | 24px | 32px | 0% | Page titles, dashboard greeting |
| **Title M** | SemiBold (600) | 20px | 28px | 0% | Section titles ("Currently Vacant Jobs"), modal titles |
| **Title S** | SemiBold (600) | 16px | 24px | 0% | Card titles, panel headings |
| **Headline L** | Bold (700) | 14px | 20px | 0% | Emphasized labels |
| **Headline M** | SemiBold (600) | 14px | 20px | 0% | Form section labels, list item titles |
| **Headline S** | Medium (500) | 14px | 20px | 0% | Nav items, subtle headings |
| **Caption** | Medium (500) | 13px | 16px | 0% | Field captions, KPI titles, meta info |
| **Body L** | Regular (400) | 14px | 22px | 0% | Paragraphs, descriptions |
| **Body M** | Medium (500) | 14px | 18px | 0% | Table cell text, inputs, secondary paragraphs |
| **Body S** | Medium (500) | 12px | 16px | 0.1px | Helper text, footnotes, badge text |
| **HEADLINE CAPS** | SemiBold (600) | 12px | 16px | 0.4px | Overlines, table group labels (UPPERCASE) |

> The source table labels the fourth column "Line weight"; it is **line height**.

### 4.2 Landing hero scale (marketing only)

| Element | Spec |
|---|---|
| Hero headline | Poppins Bold, 56–64px desktop (40px mobile), tight tracking (-1%), white, centered |
| Hero subtext | Poppins Regular, 20px / 28px, white at 90%, max-width ~720px, centered |

### 4.3 CSS classes to use

```css
.text-title-l   { font: 700 24px/32px 'Poppins', sans-serif; }
.text-title-m   { font: 600 20px/28px 'Poppins', sans-serif; }
.text-title-s   { font: 600 16px/24px 'Poppins', sans-serif; }
.text-headline-l{ font: 700 14px/20px 'Poppins', sans-serif; }
.text-headline-m{ font: 600 14px/20px 'Poppins', sans-serif; }
.text-headline-s{ font: 500 14px/20px 'Poppins', sans-serif; }
.text-caption   { font: 500 13px/16px 'Poppins', sans-serif; }
.text-body-l    { font: 400 14px/22px 'Poppins', sans-serif; }
.text-body-m    { font: 500 14px/18px 'Poppins', sans-serif; }
.text-body-s    { font: 500 12px/16px 'Poppins', sans-serif; letter-spacing: .1px; }
.text-caps      { font: 600 12px/16px 'Poppins', sans-serif; letter-spacing: .4px; text-transform: uppercase; }
```

> **Compact scale (2026-10-07).** The portal scale was lowered so a full table and its controls fit at 1366×768 without zooming, matching the public *Currently Vacant Jobs* table. Base body text is 14px. The marketing hero (§4.2), the top navigation bar (§8.2) and the side navigation (§9.12) keep their own sizes.

**Rules:** Never mix in a second typeface. Never go below 12px. Headings use `#040E6B`; body uses `#28343D`. Max line length for paragraphs: ~70 characters.

---

## 5. Spacing, Radius, Elevation

### 5.1 Spacing (4px base grid)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`

| Context | Value |
|---|---|
| Inside cards | 20–24px padding |
| Between form fields | 16–20px |
| Between sections | 32–48px |
| Page horizontal gutter | 16px mobile / 24px tablet / centered container on desktop |
| Container max-width | **1280px** (landing/public), **fluid with sidebar** (portals) |

### 5.2 Border radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Badges (non-pill), small chips |
| `--radius-md` | 8px | Inputs, selects, pagination buttons, table container inner elements |
| `--radius-lg` | 12px | Cards, tables container, Login nav button, modals |
| `--radius-xl` | 16px | Large panels, hero cards |
| `--radius-pill` | 999px | **All buttons**, status badges, filters chips |

### 5.3 Elevation

| Level | Shadow | Use |
|---|---|---|
| 0 | none, `1px solid #E2E8F0` | Cards, tables (default; prefer borders) |
| 1 | `0 1px 2px rgba(16,30,41,.06), 0 1px 3px rgba(16,30,41,.08)` | Hover on cards |
| 2 | `0 4px 12px rgba(16,30,41,.10)` | Dropdowns, popovers |
| 3 | `0 12px 32px rgba(16,30,41,.16)` | Modals |
| Focus glow | `0 4px 14px rgba(54,62,232,.40)` | Focused primary button |

### 5.4 Density

| Token | Value | Use |
|---|---|---|
| `--control-h` | 40px | Inputs and selects |
| `--control-h-compact` | 36px | Toolbar controls, pagination buttons |
| `--table-head-pad-y` | 10px | Table header cells, 16px sides (row ≈ 40–44px) |
| `--table-cell-pad-y` / `-x` | 12px / 16px | Table body cells (row ≈ 48–56px) |

Interactive targets stay at least 28px tall (§13). Cards use 16–20px padding; modals 20–24px.

---

## 6. Iconography

- **Style:** Outline (line) icons, **1.75px stroke**, rounded caps and joins. Use **Lucide** (or an equivalent matching set) exclusively. The current UI already uses Lucide-style icons (`briefcase`, `search`, `users`).
- **Sizes:** 16px (inline with text / small buttons), 20px (buttons, inputs, nav), 24px (KPI icons, empty states).
- **Color:** Inherit text color; on blue backgrounds `#FFFFFF`; inactive `#94A3B8`.
- **Icon + label:** 8px gap, icon before label.
- **Icon-only buttons** must have an `aria-label` and tooltip.

**Standard icon assignments (keep consistent across portals)**

| Concept | Icon |
|---|---|
| Apply for a job / Vacancies | `briefcase` |
| Track / Search | `search` |
| Login / Users / Employees | `users` / `user` |
| Competency assessment | `clipboard-check` |
| Training | `graduation-cap` |
| Succession planning | `git-branch` / `trending-up` |
| Departments | `building-2` |
| Dashboard | `layout-dashboard` |
| Reports | `bar-chart-3` |
| Settings | `settings` |
| Documents | `file-text` |
| Calendar / Dates | `calendar` |
| Add / Create | `plus` |
| Edit | `pencil` |
| Delete | `trash-2` |
| View details | `eye` |

---

## 7. Brand Pattern & Graphics

The brand pattern is a set of **geometric blue tiles**: quarter-circles, half-discs, solid squares, a diamond/checker grid, and vertical stripes, all built from the blue family (`#000CFF`, `#191FA8`, `#363EE8`, a lighter sky tone, and `#C8D1FF`). **Portal heroes don't use the pattern at all** (they use a blended photo; see §7.1). The tiles stay in login panels, empty states and marketing material.

**Use it for:** login/registration side panels, hero backdrops (low opacity), empty states, cover/section headers, error pages, and slide/marketing material.

**Don't use it for:** behind tables, forms, or dense data; as button backgrounds.

**Rules**
- Compose from the existing tiles; keep shapes flat (no shadows/bevels).
- Keep a single accent direction per composition.
- Keep text over patterns at ≥4.5:1 contrast, or place text on a solid blue panel beside the pattern.

### 7.1 Portal hero (photo, straight edges)

Portal heroes use the hero gradient plus **one blended photograph**. There are **no drawn shapes**: no circles, arcs, blobs, polygons or decorative screenshots.

**Hero container**
- `--gradient-hero`, with `border-radius: 0` on all four corners and a straight bottom edge.
- `overflow: hidden`.
- It sits **below** the top navigation bar (§8.2); the photo never runs behind the bar or the logo (§2).

**Photo layer**

| Rule | Spec |
|---|---|
| Source | A team-provided local file, e.g. `/assets/hero/iloilo-city-hall.webp`. Never hotlink. Keep it under ~200KB (WebP, ~1600px wide). If it fails to load, render the gradient alone. |
| Placement | Absolutely positioned over the **right 60–65%** of the hero; `object-fit: cover`, anchored so the building shows. `aria-hidden="true"`, `alt=""`, `pointer-events: none`, `loading="lazy"`. |
| Blend | `opacity` 18–25% with `mix-blend-mode: luminosity` (or `soft-light`), so it reads as a blue-toned photo, not a pasted picture. |
| Overlay | A deep-blue tint over the photo: `#040E6B` at 55%. |
| Fade | A horizontal mask fading the photo and tint to fully transparent toward the left, so the title and subtitle sit on clean gradient. |
| Mobile (< 640px) | Hide the photo, or drop it to 12–15% opacity. |

**Text.** Title L (white) and Body L subtitle (white at 90%), left-aligned. Both must pass **4.5:1** at every point behind the text. Check the lightest pixel behind the text, not the average.

**Content below the hero.** The KPI cards overlap the hero's straight bottom edge by ~72px (56px on mobile). Every section after that is its **own white card** (1px `#E2E8F0`, radius 12px) with 32px between sections. Do **not** wrap sections in one large white container.

---

## 8. Layout & Page Anatomy

### 8.1 Public / Landing portal

```
┌──────────────────────────────────────────────────────────┐
│ HEADER (blue #363EE8)  Logo lockup      Home About [Login]│
├──────────────────────────────────────────────────────────┤
│ HERO (gradient #363EE8 → #040E6B)                          │
│   Headline · Subtext · [Apply for a Job] [Track Application]│
├──────────────────────────────────────────────────────────┤
│ CONTENT (white)                                            │
│   Section title + subtitle            Toolbar (search/sort)│
│   Data table                                     Pagination │
└──────────────────────────────────────────────────────────┘
```

- **Header:** height ~84px desktop, solid `#363EE8`, content within the 1280px container. Nav items are Poppins Medium 16px, white.
  - Active nav item: pill/rounded-lg (`12px`) with `rgba(255,255,255,0.18)` background, white text.
  - Inactive: white text at ~85%; hover raises to 100% with the same soft background at 10%.
  - **Login** is a white button (`#FFFFFF`), rounded 12–16px, `#040E6B` bold label with a `users` icon at left. It is the header's one primary call to action.
- **Hero:** vertical padding 96–120px, centered content, two CTAs side by side (stacked on mobile).
- **Content:** white background, section top padding 64px.

### 8.2 Authenticated portals (HR/Admin, Employee)

```
┌────────┬─────────────────────────────────────────────┐
│ SIDEBAR│ TOPBAR (page title · search · notifications · profile)
│  (blue │─────────────────────────────────────────────│
│  or    │ PAGE (bg #F1F5F9)                            │
│  white)│   Title L / breadcrumb                       │
│        │   KPI row → Charts/Cards → Tables            │
└────────┴─────────────────────────────────────────────┘
```

- Page background `#F1F5F9`; all content sits on white cards (`--radius-lg`, 1px `#E2E8F0` border).
- Sidebar: a collapsible icon rail (72px collapsed, 256px on hover or focus, overlaying the page); see **§9.12**. The `rgba(255,255,255,.18)` active pill now applies only to the public header (§8.1).
- Page order: **Title → KPIs → primary content → secondary content.**

#### Top navigation bar (all authenticated portals: RSP, L&D, PM, Interviewer, Office console)

Every portal keeps the same top bar, so users always recognise where they are:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Mark] ABYAN  Human Resource Information System      (👤) Name     │ [⎋ Logout] │
│                                                            Role / portal    │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Part | Spec |
|---|---|
| Bar | Solid `#363EE8`, full width, height 64px (56px mobile), side padding 24px (16px mobile), sticky at the top |
| Logo lockup | White mark, 40px tall (32px mobile), then **ABYAN** (Poppins Bold, 20–22px, white), then **Human Resource Information System** (Poppins Regular, 16px, white). All three sit **on one line**, 12px apart. The system name is hidden below 1024px. Clicking the lockup goes to the portal home. |
| Avatar | 36px circle, `rgba(255,255,255,.18)` fill, white `user-circle` icon |
| Name / role | Name: SemiBold 14px white (truncate with a tooltip). Role or portal: Regular 12px, white at 75–85%. Hidden on mobile. |
| Divider | 1px × 28px, `rgba(255,255,255,.25)`. Hidden on mobile. |
| Logout | The **Header Logout** button (§9.1) |

Page titles do **not** go in this bar; they go in the hero or at the top of the page content.

#### Sub-pages (e.g. Interviewer → Office → Position)

Keep the same top bar, then a **compact hero**: the gradient with straight edges and no photo. It contains:
- an icon-only **Back** button (44×44, same glass treatment as the Header Logout, `aria-label="Back"`);
- breadcrumbs (Caption, white at 85%; current page white SemiBold);
- the page title (Title L, white);
- one meta line (Body L, white at 90%).

Show the office/department **once**. The content cards overlap the hero by ~48px and follow the dashboard card, toolbar, table and pagination patterns.

#### Back navigation (all portals)

"Back" always means **the page or view the user was just on**, never a fixed home route and never a login screen.

| Situation | Rule |
|---|---|
| In-page Back button | Step back in history (`useHistoryBack(fallback)`). Use the portal home as a fallback only when there is no earlier in-app page, e.g. after a direct visit. Label it "Back", not "Back to Dashboard", unless the destination is fixed. |
| Drill-downs, detail panels, list modals | Browser Back closes **one level** and stays on the page (`useBackClosesView`). Closing the view with its own button must not leave an extra history step. |
| Login / logout | Redirect with `replace`, so Back from a portal home never returns to the login screen, and Back after logout never re-enters the portal. |
| Explicitly named links ("Back to Home") | Allowed only when they really go to that named place. |

### 8.3 Responsive breakpoints

| Name | Width |
|---|---|
| Mobile | < 640px |
| Tablet | 640–1023px |
| Desktop | 1024–1279px |
| Wide | ≥ 1280px |

Tables scroll horizontally inside their container on small screens. Toolbars wrap; primary CTA remains visible.

---

## 9. Components

### 9.1 Buttons

**Shape:** Fully rounded **pill** (`border-radius: 999px`). Poppins **SemiBold**. Label + optional 16–20px leading icon (8px gap).

**Sizes**

| Size | Height | Font size | Horizontal padding | Use |
|---|---|---|---|---|
| **Large** | 50px | 16px | 28px | Hero CTAs, login/submit on auth pages |
| **Medium** | 36px | 14px | 20px | Default for forms, dialogs, page actions |
| **Small** | 32px | 13px | 14px | Table rows, cards, inline actions |

**Primary (filled)**

| State | Spec |
|---|---|
| Default | Background `#363EE8` (optionally the subtle gradient `#363EE8 → #191FA8`), text `#FFFFFF` |
| Hover | Background `#191FA8` |
| Focused / Pressed | Same fill + **glow shadow** `0 4px 14px rgba(54,62,232,.40)` and a 2px outer ring `#C8D1FF` |
| Disabled | Background `#C8D1FF` (or 40% primary), text white at ~80%, `cursor: not-allowed`, no shadow |

**Secondary (outline)**

| State | Spec |
|---|---|
| Default | Transparent/white bg, **1.5px border `#363EE8`**, text `#363EE8` (or `#191FA8`) |
| Hover | Background `#EEF0FF` |
| Focused / Pressed | Filled with primary (`#363EE8 → #191FA8`), text white, glow shadow |
| Disabled | Border and text `#C8D1FF`, no fill |

**On-blue variants (hero and header only)**

| Variant | Spec |
|---|---|
| **Solid white** | Bg `#FFFFFF`, text/icon `#363EE8` or `#040E6B`, soft shadow. E.g. **Apply for a Job**, **Login** |
| **Ghost / outline white** | Transparent bg, 1px border `rgba(255,255,255,.5)`, text `#FFFFFF`. E.g. **Track Application** |
| **Header Logout** | Glass rectangle: bg `rgba(255,255,255,.12)`, 1px border `rgba(255,255,255,.35)`, radius 12px, min 44×44px, padding `0 16px`, Poppins SemiBold 14px. Leading `log-out` icon 16px. **The "Logout" label and the icon are always `#FFFFFF`**, in every portal and state. Hover bg `rgba(255,255,255,.20)`; focus ring `0 0 0 3px rgba(255,255,255,.5)`. Below 640px the label hides and the button becomes icon-only, still 44×44px with `aria-label="Logout"`. |

> **Logout label must be white.** The legacy `globals.css` sets a dark `color` directly on every `span`, `p`, `label`, `a` and `button`. A `<span>Logout</span>` inside a white button therefore renders **dark** unless the span gets its own white color. Always set `color: #FFFFFF` on the label element itself (or render it inside an `.abyan-ds` scope, which resets text to inherit).

**Destructive:** Use only for irreversible actions. Bg `#E05252`, hover `#B42323`, white text; outline variant uses the red border/text. Always confirm in a modal.

**Rules**
- One primary button per view/section. Everything else is secondary.
- Button order in dialogs: **Secondary (Cancel) on the left, Primary on the right.**
- Loading state: replace label with a 16px spinner, keep width, disable clicks.
- Don't use square or slightly rounded buttons. Rounded-rectangles (12px) are reserved for the header **Login** and **Logout** buttons, nav pills, and pagination.

> **Note:** The button kit lists the Small **Secondary** height as 45px, which appears to be a typo. Use **36px** for all Small buttons.

### 9.2 Navigation (Header & Tabs)

- **Nav item:** Poppins Medium 16px, padding `8px 16px`, radius 12px, white text on blue.
- **Active:** `rgba(255,255,255,.18)` bg. **Hover:** `rgba(255,255,255,.10)`.
- **Tabs (on white pages):** Text `#515F69`; active `#363EE8` with a 2px bottom border `#363EE8`; hover `#040E6B`.
- **Breadcrumbs:** Caption size, `#515F69` with current page in `#040E6B` Medium; separator `/` or chevron.

### 9.3 Form Controls

| Property | Spec |
|---|---|
| Height | 40px (default), 36px (compact/toolbars) |
| Background | `#FFFFFF` |
| Border | 1px `#E2E8F0` |
| Radius | 8px (`--radius-md`) |
| Text | Body M, `#28343D` |
| Placeholder | `#94A3B8` / `#515F69` at 70% |
| Leading icon | 20px, `#94A3B8` (e.g. search) |
| Hover | Border `#C8D1FF` |
| **Focus** | **Border `#363EE8` (1.5–2px) + ring `0 0 0 3px rgba(54,62,232,.15)`** |
| Error | Border `#E05252`, message below in Body S `#B42323` with an icon |
| Success | Border `#16A85A` |
| Disabled | Background `#F1F5F9`, text `#94A3B8` |

- **Label:** Caption (14px Medium) `#28343D`, above the input, 6px gap. Required fields get a red `*`.
- **Helper text:** Body S `#515F69`, 4px below the input.
- **Select/dropdown:** Same as input, with a chevron-down icon at right; menu is white, elevation 2, radius 8px; selected option has `#EEF0FF` bg and `#363EE8` text.
- **Checkbox/Radio:** 18px, checked = `#363EE8` fill with white mark; focus ring same as inputs.
- **Toggle:** 40×22px, on = `#363EE8`, off = `#CBD5E1`.

### 9.4 Table Toolbar (Search · Sort · Entries)

Reference pattern (as in "Currently Vacant Jobs"):

```
Section Title (Title M, #040E6B)                [🔍 Search title, dept, type…] [Newest to Oldest ⌄]  Show [5 ⌄] entries
Subtitle (Body L, #515F69)
```

- Search input: 36px height, radius 8px, leading search icon, width ~260px.
- Sort select: same height, text `#040E6B` Medium.
- "Show [n] entries": label in Body M `#040E6B`; the **entries select uses the focus/active style** (`#363EE8` 1.5px border) when open/selected.
- Toolbar is right-aligned on desktop, stacks under the title on mobile, with 12–16px gaps.
- Use this same toolbar for **all** list/table views (employees, applicants, trainings, assessments) so filter placement never changes between portals.

### 9.5 Tables

| Part | Spec |
|---|---|
| Container | White, 1px `#E2E8F0` border, radius 12px, `overflow: hidden` |
| Header row | Background `#F1F5F9`, text Poppins SemiBold 13px `#040E6B`, height ~40–44px, padding `10px 16px` |
| Body row | Height ~48–56px (padding `12px 16px`), Body M 14px `#28343D`, bottom border 1px `#E2E8F0` |
| Primary column | Position/Name in **Headline S/M** `#040E6B`, secondary info under it in Body S `#515F69` |
| Row hover | `#F8FAFF` (very light tint) |
| Row selected | `#EEF0FF` |
| Actions column | Right-aligned; **Details** = Small secondary button; **Apply / primary action** = Small primary button |
| Empty state | Centered icon (24–32px), Title S, Body M message, and a primary CTA if applicable |
| Dates | Format `MMM DD, YYYY` (e.g. `Sep 28, 2026`) everywhere |

Column alignment: text left, numbers right, actions right. Never truncate primary identifiers without a tooltip.

### 9.6 Pagination

Reference: `‹ Previous | 1 2 3 4 5 6 | Next ›`

| Element | Spec |
|---|---|
| Page button | 36×36px, radius 8px, 1px border `#C8D1FF`/`#E2E8F0`, text `#28343D` Medium 14px |
| **Active page** | Filled `#363EE8`, text `#FFFFFF`, no border |
| Hover | Bg `#EEF0FF`, border `#C8D1FF` |
| Previous / Next | Auto width (padding `0 16px`), chevron icon + label; **disabled** state: text `#94A3B8`, bg `#F8FAFC`, border `#E2E8F0` |
| Gap | 8px between buttons |
| Ellipsis | Use `…` when > 7 pages (first, last, current ±1) |

Place pagination bottom-right under the table, with "Showing X–Y of Z entries" on the left in Body S `#515F69`.

### 9.7 Dashboard KPI Cards

Each KPI card = **small icon + KPI title + value (+ optional trend)**.

```
┌──────────────────────────────┐
│ [ icon chip ]  KPI Title     │   ← icon 20px in a 36–40px rounded chip; title = Caption, #515F69
│                              │
│ 1,248                        │   ← value = Title L, #040E6B
│ ▲ 4.2% vs last month         │   ← optional trend = Body S (green ▲ / red ▼)
└──────────────────────────────┘
```

| Property | Spec |
|---|---|
| Card | White, 1px `#E2E8F0`, radius 12px, padding 20px, min-width 220px |
| Icon chip | 36–40px square, radius 10px, background `#EEF0FF` (or the 100 shade of its status), icon `#363EE8` (or the 500 shade of its status) |
| Title | Caption (14px Medium), `#515F69`; **sentence case**; max 2 lines |
| Value | Title L (24/32 Bold) `#040E6B`; use compact numbers (1.2K) only when > 9,999 |
| Trend (optional) | Body S; up = `#0F7A40` with ▲, down = `#B42323` with ▼, neutral = `#515F69`. Label the comparison period. |
| Hover (if clickable) | Elevation 1 and border `#C8D1FF`; whole card is the link |
| Layout | CSS grid, `repeat(auto-fit, minmax(220px, 1fr))`, 16–24px gap; 4 cards per row on desktop |

Use status colors for the icon chip only when the KPI itself is a status metric (e.g. *Critical competency gaps* = red chip, *Trainings completed* = green chip). Otherwise all chips are brand blue, so a dashboard doesn't become a rainbow.

**Suggested KPI set & icons**

| KPI title | Icon | Chip |
|---|---|---|
| Total employees | `users` | Blue |
| Open vacancies | `briefcase` | Blue |
| Applications received | `file-text` | Blue |
| Competency gaps identified | `alert-triangle` | Orange |
| Critical gaps | `alert-octagon` | Red |
| Trainings recommended | `graduation-cap` | Blue |
| Trainings completed | `check-circle-2` | Green |
| Succession-ready employees | `trending-up` | Green |

#### 9.7.1 Quick-view KPI card (list-style)

Used where a KPI should also preview **who** it counts (e.g. Interviewer Dashboard: To evaluate / Due today / Completed).

| Part | Spec |
|---|---|
| Card | White, 1px `#E2E8F0`, radius 12px, padding 20–24px, **no gradient or shadow at rest**. Fixed height (~360px); content is capped, so it never scrolls or overflows. Three per row at ≥1024px, stacked below that, 16–24px gap. |
| Header | Title (Title S) on the left, a muted outline Lucide icon (`#94A3B8`) on the right, and a 1px `#E2E8F0` divider beneath. |
| KPI strip | Optional 40px status chip (100 bg / 500 icon; status metrics only), the value (Title L `#040E6B`) and a one-line Body S `#515F69` subtext. |
| List | At most 3 rows. Each row is a 40px `#EEF0FF` chip with a `file-text` icon, then the name (Headline S `#040E6B`) over a meta line (Body S `#515F69`, "Position · Department · MMM DD, YYYY"). Rows are separated by 1px dividers; text truncates with an ellipsis and a tooltip. |
| Footer | "View all (N) →" in brand blue, Body M Medium. **Visual only.** |
| Empty / loading | Centered icon, short line and next step inside the list area. Shimmer skeletons for the header, the number and 3 rows. |
| Interaction | The whole card is one control (`role="button"`, `tabindex="0"`, Enter/Space, `aria-haspopup="dialog"`) with no nested interactive elements. Hover: elevation 1 + `#C8D1FF` border. Focus: 2px `#363EE8` ring. |
| Opens | A **large list modal** (§9.10, 880px): toolbar (§9.4) plus a table paginated at 8 rows (§9.6). Focus is trapped inside and returns to the card on close. It becomes a full-screen sheet on mobile, and only the overlay scrolls, never an area inside the modal. |

### 9.8 Status & Category Badges

- **Shape:** pill, height 22–24px, padding `0 10px`, Body S (12px Medium), optional 6px dot or 14px icon at left.
- **Style (default, "soft"):** Background = **100** shade, text = **700** shade, optional dot = **500** shade.
- **Style ("solid", for high emphasis only):** Background = **500** shade, text `#FFFFFF`.
- Always show a text label; never a colored dot alone.

| Variant | Bg | Text | Dot |
|---|---|---|---|
| Success | `#DCFCE7` | `#0F7A40` | `#16A85A` |
| Warning | `#FCE8C8` | `#A8590A` | `#E8821A` |
| Error | `#FDE2E2` | `#B42323` | `#E05252` |
| Info | `#E0E5FF` | `#191FA8` | `#363EE8` |
| Neutral | `#F1F5F9` | `#28343D` | `#64748B` |

### 9.9 Alerts, Toasts

| Type | Left border/Icon | Background | Icon |
|---|---|---|---|
| Success | `#16A85A` | `#DCFCE7` | `check-circle-2` |
| Warning | `#E8821A` | `#FCE8C8` | `alert-triangle` |
| Error | `#E05252` | `#FDE2E2` | `x-circle` |
| Info | `#363EE8` | `#E0E5FF` | `info` |

- Inline alert: radius 12px, padding 16px, Title = Headline M, message = Body M `#28343D`.
- Toast: white card, elevation 3, 4px left accent in status color, top-right, auto-dismiss 5s (errors persist until closed).

### 9.10 Modals & Dialogs

- Overlay `rgba(4,14,107,.45)` (tinted deep blue, not black).
- Panel: white, radius 12–16px, elevation 3, padding 24px, max-width 480px (confirm) / 640px (forms) / 880px (large).
- Title: Title S or Title M `#040E6B`; close (×) icon top-right.
- Footer actions right-aligned: **Cancel (secondary) → Confirm (primary)**. Destructive confirmations use the destructive button.

### 9.11 Charts & Data Visualization

**Categorical series order:** `#363EE8` → `#040E6B` → `#000CFF` → `#8A96FF` → `#C8D1FF` → `#94A3B8`.
- Use green/orange/red **only** when the data itself represents good/caution/bad (e.g. competency gap severity).
- Gridlines `#E2E8F0`, axis labels Body S `#515F69`, no chart borders, rounded bar tops (4px).
- Titles: Title S in the card header; legends below or top-right, Body S.
- Tooltips: `#101E29` bg, white text, radius 8px.

### 9.12 Side Navigation (Portals)

The HR/Admin and Employee portals use a **collapsible icon rail** on the left. It sits collapsed as a slim rail of icons and opens over the page when the user hovers over it or tabs into it. The approved mockup is `docs/mockups/2026-09-28-sidebar-rail.html`; it is the source of truth for the values below.

**Behaviour**

| Trigger | Result |
|---|---|
| Default | **Collapsed**: a 72px (`--rail-collapsed`) icon rail showing only the logo mark and the circular icon chips. No labels. |
| Pointer enters the rail | Opens to 256px (`--rail-open`). The labels and the ABYAN lockup fade in. |
| Pointer leaves the rail | Closes after a **250ms grace delay**, so brushing past the edge doesn't snap it shut. Re-entering within 250ms cancels the close. |
| Keyboard focus lands on any item (Tab) | Opens. |
| Focus leaves the rail (Tab out), or Esc | Closes, with the same 250ms delay. Esc also removes focus from the item. |
| Open | The rail **overlays** the page. The page keeps a fixed 72px left offset and never moves or reflows. |

**Anatomy**

```
 72px collapsed                        256px open (overlays the page)
┌──────┬─────────────────              ┌───────────────────────────┬──────
│ [◎]  │ page #F1F5F9                  │ [◎] ABYAN                 │ page
│      │ (16px left radius)            │     Human Resource        │
│ (▣)  │                               │     Information System    │
│ (●)  │  ← active: 48px circle        │ (▣) Dashboard             │
│ (●)  │                               │ (●) Employees ════════════╡ ← active pill fused
│      │                               │ (●) Competency            │   into the page
│ (⚙)  │  Settings pinned to bottom    │ (⚙) Settings              │
└──────┴─────────────────              └───────────────────────────┴──────
```

| Part | Spec |
|---|---|
| Rail | Full height, `--gradient-hero` background, `overflow: hidden`, flex column. Padding 16px top and bottom and none at the sides; the groups carry their own insets. Width `--rail-collapsed` → `--rail-open`. |
| Brand row | Inset 16px from the left, min-height 40px, 28px below it, 12px gap. Logo mark in a 40px slot: the real white mark file (§2), never a redraw. Text block 180px wide, hidden while collapsed: **ABYAN** in Poppins Bold 16/20, `#FFFFFF`, 0.5px letter-spacing, over **Human Resource Information System** in Poppins Medium 12/16, white at 75%, wrapping to two lines. |
| Nav groups | The main group sits at the top; Settings is its own group, pinned to the bottom (`margin-top: auto`). Each group is inset 12px from the left, with 8px between items. |
| Nav item | A link, 48px tall, with a 4px left inset, 12px right margin and a 24px radius. There is a 12px gap between chip and label. The 12px group inset plus the 4px item inset puts the chip at 16px, in line with the logo and centered in the 72px rail. Text color white at 85%. |
| Icon chip | 40px circle. Fill `rgba(255,255,255,.12)`, 1px border `rgba(255,255,255,.22)`. 20px Lucide icon, 1.75px stroke, in `currentColor`, so it matches the label (white at 85%). |
| Label | Poppins Medium 16/20, white at 85%. Hidden while collapsed (opacity 0, shifted 6px left). |
| Highlight | **One** shared `aria-hidden` element in the nav group, in `--bg-page` (`#F1F5F9`). Absolutely positioned 12px from the left and 48px tall. It moves with `translateY(index × 56px)` (48px item + 8px gap). **Collapsed:** a 48×48 circle (radius 24px) behind the active chip. **Open:** width `calc(100% - 12px)`, so it runs to the rail's right edge, with radius `24px 0 0 24px`. 20px concave corners above and below fuse it into the page. |
| Page | Fixed 72px left offset, `#F1F5F9` background, 16px top-left and bottom-left radius where it meets the rail. |

**Items and icons** (§6)

| Item | Icon |
|---|---|
| Dashboard | `layout-dashboard` |
| Employees | `users` |
| Competency | `clipboard-check` |
| Training | `graduation-cap` |
| Succession | `git-branch` |
| Reports | `bar-chart-3` |
| Settings (bottom group) | `settings` |

**States**

| State | Collapsed (72px) | Open (256px) |
|---|---|---|
| Default | Chip fill `rgba(255,255,255,.12)`, border `rgba(255,255,255,.22)`; icon white at 85%. No label. | Same chip; label Poppins Medium 16px, white at 85%. |
| Hover | Chip fill `rgba(255,255,255,.22)`. | Chip fill `rgba(255,255,255,.22)`. The row gets a `rgba(255,255,255,.10)` pill (24px radius), and icon and label turn `#FFFFFF`. The active item doesn't change on hover. |
| Focus-visible | 2px `#FFFFFF` outline, 2px offset; focusing opens the rail. | Same. |
| Active | The highlight is a 48px `#F1F5F9` circle behind the icon. Chip fill and border go transparent; icon `#363EE8`. | The highlight stretches into a pill to the rail's right edge, with concave corners. Icon `#363EE8`; label `#040E6B`, SemiBold (600). |

Changing the active item **slides** the highlight vertically to the new item. It never jumps, and the element is never re-created.

**Motion**

| What | Duration | Easing |
|---|---|---|
| Rail width 72 → 256px | 200ms (`--dur-base`) | `--ease-standard` `cubic-bezier(.2,.8,.2,1)` |
| Highlight slide between items | 260ms | `--ease-standard` |
| Highlight circle → pill (width, radius) | 200ms | `--ease-standard` |
| Concave corners fade in | 120ms, after a 120ms delay when opening (no delay when closing) | `ease-out` |
| Labels and brand text: fade in | 150ms, 60ms delay when opening | `ease-out` |
| Labels and brand text: 6px slide | 200ms, 60ms delay when opening | `--ease-standard` |
| Hover fills (chip, row, text color) | 150ms | `ease-out` |

`--ease-standard` is the custom curve token. `ease-out` is the plain CSS keyword. Under `prefers-reduced-motion: reduce`, every transition duration and delay is 0ms, so state changes are instant. The 250ms close grace period is a timer, not an animation, so it still applies.

**Accessibility**

- The rail is an `<aside aria-label="Main navigation">`. Each item is a link with an `aria-label`, since its visible label is hidden while collapsed. The active item has `aria-current="page"`.
- The highlight is decorative (`aria-hidden="true"`). A `<ul>` may only contain `<li>`s, so in production put the highlight in a wrapper around the list, or use an `<li role="presentation" aria-hidden="true">`. The mockup places a `<div>` directly inside the `<ul>`.
- Visible focus: 2px `#FFFFFF` outline, 2px offset. See §17 for the active-item focus caveat.
- Color contrast is unchanged: white on the Hero gradient, and `#363EE8` / `#040E6B` on `#F1F5F9`.

**Reference CSS** (from the mockup; overlay mode only)

```css
/* Tokens: --rail-collapsed, --rail-open, --ease-standard, --dur-base (§14.1) */
.rail {
  --item-h: 48px; --item-gap: 8px; --corner: 20px;
  position: absolute; inset: 0 auto 0 0; z-index: 2;       /* overlays the page */
  width: var(--rail-collapsed);
  background: var(--gradient-hero); overflow: hidden;
  display: flex; flex-direction: column; padding: 16px 0;
  transition: width var(--dur-base) var(--ease-standard);
}
.rail.open { width: var(--rail-open); }

.brand { display: flex; align-items: center; gap: 12px; padding: 0 0 0 16px; min-height: 40px; margin-bottom: 28px; white-space: nowrap; }
.brand-logo { width: 40px; height: 40px; flex: none; }   /* real white mark (§2) */
.brand-text { white-space: normal; width: 180px; opacity: 0; transform: translateX(-6px);
  transition: opacity 150ms ease-out, transform var(--dur-base) var(--ease-standard); }
.brand-text b { display: block; font: 700 16px/20px var(--font-sans); color: #fff; letter-spacing: .5px; }
.brand-text small { display: block; font: 500 12px/16px var(--font-sans); color: rgba(255,255,255,.75); }

.nav { position: relative; list-style: none; padding-left: 12px; display: flex; flex-direction: column; gap: var(--item-gap); }
.nav.bottom { margin-top: auto; }                          /* Settings pinned to the bottom */

/* The one moving selection: circle when collapsed, fused pill when open. */
.hl {
  position: absolute; left: 12px; top: 0; height: var(--item-h); width: var(--item-h);
  border-radius: 24px; background: var(--bg-page);
  transition: transform 260ms var(--ease-standard), width var(--dur-base) var(--ease-standard),
              border-radius var(--dur-base) var(--ease-standard);
}
.rail.open .hl { width: calc(100% - 12px); border-radius: 24px 0 0 24px; }
.hl::before, .hl::after {                                  /* concave corners */
  content: ''; position: absolute; right: 0; width: var(--corner); height: var(--corner);
  opacity: 0; transition: opacity 120ms ease-out;
}
.hl::before { top: calc(var(--corner) * -1); border-bottom-right-radius: var(--corner); box-shadow: 8px 8px 0 8px var(--bg-page); }
.hl::after  { bottom: calc(var(--corner) * -1); border-top-right-radius: var(--corner); box-shadow: 8px -8px 0 8px var(--bg-page); }
.rail.open .hl::before, .rail.open .hl::after { opacity: 1; transition-delay: 120ms; }

.item {
  position: relative; z-index: 1; display: flex; align-items: center; gap: 12px;
  height: var(--item-h); padding-left: 4px; margin-right: 12px; border-radius: 24px;
  color: rgba(255,255,255,.85); text-decoration: none; white-space: nowrap; cursor: pointer;
  transition: background 150ms ease-out, color 150ms ease-out;
}
.chip {
  width: 40px; height: 40px; flex: none; border-radius: 50%; display: grid; place-items: center;
  background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22);
  transition: background 150ms ease-out, border-color 150ms ease-out, color 150ms ease-out;
}
.chip svg { width: 20px; height: 20px; }                   /* Lucide, stroke-width 1.75 */
.label { font: 500 16px/20px var(--font-sans); opacity: 0; transform: translateX(-6px);
  transition: opacity 150ms ease-out, transform var(--dur-base) var(--ease-standard); }
.rail.open .label, .rail.open .brand-text { opacity: 1; transform: none; transition-delay: 60ms; }

.item:hover .chip { background: rgba(255,255,255,.22); }
.rail.open .item:not(.active):hover { background: rgba(255,255,255,.10); color: #fff; }
.item:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

.item.active { color: var(--color-primary-900); }
.item.active .chip { background: transparent; border-color: transparent; color: var(--color-primary); }
.item.active .label { font-weight: 600; }

/* Page: fixed offset, never pushed by the rail. */
.main { position: absolute; inset: 0 0 0 var(--rail-collapsed); background: var(--bg-page); border-radius: 16px 0 0 16px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; transition-delay: 0ms !important; }
}
```

**Behaviour wiring.** Open by adding `.open` on `mouseenter` and `focusin`. On `mouseleave`, on a `focusout` whose next target is outside the rail, or on Esc, remove it after a 250ms timer; any open event clears that timer. Selecting an item sets `.active` and `aria-current="page"` on it (removing them from the others) and sets the highlight's `transform: translateY(index × 56px)`.

**Implementation notes (RSP admin portal, first rollout).** The RSP portal is the first to ship this pattern (`RailNav.tsx` / `rail-nav.css`). It follows the spec above with four deliberate adaptations, plus two of the §17 open items below are now resolved by it:

| Spec / mockup | RSP implementation | Why |
|---|---|---|
| Rail has its own brand row (logo + ABYAN lockup) | No brand row; the rail sits **under** the existing §8.2 top bar, which already carries the lockup | Avoids showing the logo twice |
| Not specified for phones | Rail is kept at every width; a tap (or focus) opens it the same as a hover | The old sidebar's phone-only horizontal strip is retired in favour of one consistent pattern |
| Highlight lives inside the main nav group only, so it can't reach Settings (§17 item 10) | The highlight element lives on the rail itself, above both groups, so it can travel to Settings too | Resolves §17 item 10 |
| 2px white focus ring on every item, including when active (§17 item 11) | The active item's focus ring is `--color-primary` instead of white when the rail is open | A white ring is invisible on the light `--bg-page` active pill; resolves §17 item 11 |
| Highlight position is local to one page load | The rail remembers the highlight's last Y position (per browser tab) so it **slides** across full page navigations, not just clicks within one mounted rail | Each RSP route is a separate page mount, not a client-side view swap |

Esc still drops keyboard focus to the page body (§17 item 12) — unresolved, carried over from the mockup.

**L&D and PM admin portals (second rollout).** Both portals use the same `RailNav`, with their existing items, labels and icons, and Settings pinned to the bottom (mockup: `docs/mockups/2026-10-06-portal-rails.html`). Their sections switch in place rather than by route, so their items render as buttons instead of links; each item's former sublabel becomes its tooltip. L&D's Training Evaluation page was removed in the same change, leaving 10 items.

**When the items don't fit.** On a short window the rail **scrolls** (no visible scrollbar) instead of clipping the bottom items, and a 40px fade to `--color-primary-900` at its foot signals that more items sit below. The highlight lives inside the scroll area, so it scrolls with its item and can still slide to Settings. If the active item is out of view, the rail scrolls it into view. Item sizes stay at the 48px spec; tightening them per portal was considered and rejected so all portals keep one rail.

---

## 10. Status & Category Color Map (HR Domain)

Use these mappings **everywhere** (tables, dashboards, detail pages, emails, exports) so the same status is always the same color.

### Application status
| Status | Variant |
|---|---|
| Submitted / Received | Info (blue) |
| Under Review | Warning (orange) |
| Shortlisted | Info (blue) |
| For Interview | Warning (orange) |
| Qualified / Hired / Approved | Success (green) |
| Disqualified / Rejected | Error (red) |
| Withdrawn / Closed / Draft | Neutral (gray) |

### Vacancy status
| Status | Variant |
|---|---|
| Open | Success |
| Closing soon (≤ 3 days) | Warning |
| Closed / Expired | Neutral |
| Cancelled | Error |

### Competency gap level
| Level | Variant |
|---|---|
| No gap / Meets or exceeds required level | Success |
| Minor gap | Info |
| Moderate gap | Warning |
| Critical gap | Error |

### Training status
| Status | Variant |
|---|---|
| Recommended | Info |
| Scheduled / Ongoing | Warning |
| Completed | Success |
| Not completed / Overdue | Error |
| Cancelled | Neutral |

### Succession readiness
| Readiness | Variant |
|---|---|
| Ready now | Success |
| Ready in 1–2 years | Info |
| Ready in 3+ years / Developing | Warning |
| No identified successor | Error |

### Employee / record status
| Status | Variant |
|---|---|
| Active | Success |
| On leave | Warning |
| Retired / Resigned / Inactive | Neutral |
| Suspended / Flagged | Error |

### Category tags (non-status)
Categories such as **Department**, **Employment type** (Permanent, Casual, Contractual), **Competency type** (Core, Leadership, Technical) are not statuses, so they use **neutral or brand-tint chips only** (`#EEF0FF` bg / `#191FA8` text, or gray). Do not assign red/orange/green to categories.

---

## 11. Portal-Specific Notes

| Portal | Chrome | Notes |
|---|---|---|
| **Public / Applicant** | Blue header, hero, white content | Uses white-on-blue CTAs in the hero; tone is inviting; bilingual touches allowed |
| **Login / Auth** | Split layout: brand pattern or gradient panel + white form card | Large primary button; logo above the form; error messages inline |
| **Employee portal** | Sidebar + topbar, `#F1F5F9` page | Personal KPIs (competency score, trainings, career path), progress bars in brand blue |
| **HR / Admin portal** | Sidebar + topbar, `#F1F5F9` page | Dense tables, filters, bulk actions, charts; follow the table toolbar pattern strictly |
| **Reports / Print** | White background, no gradients | Use Poppins, blue table headers `#040E6B` with white text, logo top-left |
| **Interviewer portal** | Top navigation bar (§8.2) + straight-edged photo hero (§7.1); three KPI quick-view cards overlap the hero; each later section is its own card | KPI cards (§9.7.1) open a wide, paginated list modal; tables paginate at 5 rows |
| **Emails / PDFs** | Blue header band with white logo | Buttons follow primary pill style; status badges as in §9.8 |

---

## 12. Voice & Content

- **Tone:** Professional, warm, plain language. Address the user directly ("Track your application").
- **Buttons/labels:** Verb-first, Title Case for buttons (`Apply for a Job`, `Track Application`); Sentence case for descriptions, KPI titles, helper text.
- **Filipino accents:** Allowed in public-facing marketing copy (e.g. *"Abyan mo sa pag-asenso."*). Keep functional UI copy (forms, errors, table headers) in clear English for consistency.
- **Errors:** Say what happened + what to do. *"We couldn't save your changes. Check your connection and try again."* Never blame the user; avoid codes without explanation.
- **Empty states:** Explain why it's empty and give the next action.
- **Terminology:** Use consistent terms — *Position Title, Department, Plantilla Item No., Posting Date, Closing Date, Competency, Training, Succession Plan.*

---

## 13. Accessibility

- **Contrast:** Body text ≥ 4.5:1, large text/icons ≥ 3:1. Verified pairs: `#363EE8` on white (≈ 7:1), `#040E6B` on white (≈ 17:1), white on `#363EE8` (≈ 7:1), `#515F69` on white (≈ 6:1).
- **Focus:** Every interactive element shows a visible focus indicator (2px `#363EE8` ring or the glow style). Never `outline: none` without a replacement.
- **Targets:** Minimum 36×36px (44px preferred on touch).
- **Color independence:** Statuses always have a text label or icon.
- **Forms:** Labels always visible (no placeholder-only labels); errors linked via `aria-describedby`.
- **Tables:** Proper `<th scope>`, sortable headers announce sort state.
- **Motion:** 150–200ms ease-out transitions; respect `prefers-reduced-motion`. The side navigation's 260ms highlight slide (§9.12) is the one deliberate exception to the 150–200ms range.
- **Language:** Set `lang="en"`; mark Filipino phrases with `lang="fil"` where feasible.

---

## 14. Design Tokens (CSS / Tailwind)

### 14.1 CSS variables

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

:root {
  /* Brand */
  --color-primary: #363EE8;
  --color-primary-700: #191FA8;
  --color-primary-900: #040E6B;
  --color-primary-accent: #000CFF;
  --color-primary-200: #C8D1FF;
  --color-primary-50: #EEF0FF;
  --color-white: #FFFFFF;

  /* Backgrounds */
  --bg-page: #F1F5F9;
  --bg-surface: #FFFFFF;

  /* Neutrals */
  --neutral-900: #101E29;
  --neutral-800: #28343D;
  --neutral-600: #515F69;
  --neutral-400: #94A3B8;
  --neutral-200: #E2E8F0;

  /* Status */
  --success-100: #DCFCE7; --success-300: #7ECBA1; --success-500: #16A85A; --success-700: #0F7A40;
  --warning-100: #FCE8C8; --warning-300: #F0B478; --warning-500: #E8821A; --warning-700: #A8590A;
  --error-100:   #FDE2E2; --error-300:   #EF9A9A; --error-500:   #E05252; --error-700:   #B42323;

  /* Gradients */
  --gradient-hero: linear-gradient(180deg, #363EE8 0%, #040E6B 100%);
  --gradient-soft: linear-gradient(135deg, #C8D1FF 0%, #363EE8 100%);
  --gradient-button: linear-gradient(180deg, #363EE8 0%, #191FA8 100%);

  /* Radius */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-pill: 999px;

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(16,30,41,.06), 0 1px 3px rgba(16,30,41,.08);
  --shadow-2: 0 4px 12px rgba(16,30,41,.10);
  --shadow-3: 0 12px 32px rgba(16,30,41,.16);
  --shadow-focus: 0 4px 14px rgba(54,62,232,.40);

  /* Side navigation (§9.12) */
  --rail-collapsed: 72px; --rail-open: 256px;

  /* Density (§5.4) */
  --control-h: 40px; --control-h-compact: 36px;
  --table-head-pad-y: 10px; --table-cell-pad-y: 12px; --table-cell-pad-x: 16px;

  /* Motion */
  --ease-standard: cubic-bezier(.2,.8,.2,1); --dur-base: 200ms;

  /* Type */
  --font-sans: 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

body {
  font-family: var(--font-sans);
  color: var(--neutral-800);
  background: var(--bg-page);
}
h1, h2, h3, h4 { color: var(--color-primary-900); }
```

### 14.2 Button reference CSS

```css
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-sans); font-weight: 600;
  border-radius: var(--radius-pill); border: 1.5px solid transparent;
  cursor: pointer; transition: background .15s, box-shadow .15s, color .15s;
}
.btn-lg { height: 50px; padding: 0 28px; font-size: 16px; }
.btn-md { height: 36px; padding: 0 20px; font-size: 14px; }
.btn-sm { height: 32px; padding: 0 14px; font-size: 13px; }

.btn-primary { background: var(--gradient-button); color: #fff; }
.btn-primary:hover { background: var(--color-primary-700); }
.btn-primary:focus-visible,
.btn-primary:active { box-shadow: var(--shadow-focus), 0 0 0 3px var(--color-primary-200); }
.btn-primary:disabled { background: var(--color-primary-200); color: rgba(255,255,255,.85); box-shadow: none; cursor: not-allowed; }

.btn-secondary { background: transparent; color: var(--color-primary); border-color: var(--color-primary); }
.btn-secondary:hover { background: var(--color-primary-50); }
.btn-secondary:focus-visible,
.btn-secondary:active { background: var(--gradient-button); color: #fff; box-shadow: var(--shadow-focus); }
.btn-secondary:disabled { color: var(--color-primary-200); border-color: var(--color-primary-200); background: transparent; cursor: not-allowed; }

/* On-blue (hero/header) */
.btn-white { background: #fff; color: var(--color-primary); box-shadow: var(--shadow-2); }
.btn-ghost-white { background: transparent; color: #fff; border-color: rgba(255,255,255,.5); }
```

### 14.3 Tailwind config

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'system-ui', 'sans-serif'] },
      colors: {
        primary: { DEFAULT: '#363EE8', 50: '#EEF0FF', 200: '#C8D1FF', 700: '#191FA8', 900: '#040E6B', accent: '#000CFF' },
        neutral: { 900: '#101E29', 800: '#28343D', 600: '#515F69', 400: '#94A3B8', 200: '#E2E8F0' },
        page: '#F1F5F9',
        success: { 100: '#DCFCE7', 300: '#7ECBA1', 500: '#16A85A', 700: '#0F7A40' },
        warning: { 100: '#FCE8C8', 300: '#F0B478', 500: '#E8821A', 700: '#A8590A' },
        error:   { 100: '#FDE2E2', 300: '#EF9A9A', 500: '#E05252', 700: '#B42323' },
      },
      borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
      boxShadow: {
        focus: '0 4px 14px rgba(54,62,232,.40)',
        card: '0 1px 2px rgba(16,30,41,.06), 0 1px 3px rgba(16,30,41,.08)',
      },
      backgroundImage: {
        hero: 'linear-gradient(180deg, #363EE8 0%, #040E6B 100%)',
        soft: 'linear-gradient(135deg, #C8D1FF 0%, #363EE8 100%)',
      },
      spacing: { 'rail-collapsed': '72px', 'rail-open': '256px' },
      transitionTimingFunction: { standard: 'cubic-bezier(.2,.8,.2,1)' },
      transitionDuration: { base: '200ms' },
    },
  },
};
```

---

## 15. Do & Don't

| ✅ Do | ❌ Don't |
|---|---|
| Use Poppins for **all** text | Introduce Inter, Roboto, Arial, etc. |
| Use pill buttons in the three defined sizes | Create custom button heights/radii per page |
| Use `#040E6B` for headings, `#28343D` for body | Use pure black `#000000` for text |
| Use `#F1F5F9` page bg with white cards | Use random grays or colored page backgrounds |
| Use the status map in §10 | Invent new status colors or reuse red/green decoratively |
| Keep one primary button per section | Put two filled primary buttons side by side |
| Use Lucide outline icons at 1.75px stroke | Mix filled and outline icons or multiple icon libraries |
| Reuse the table toolbar and pagination patterns | Re-style search/sort/pagination per module |
| Show KPI: icon chip + title + value | Add gradients, shadows, or clashing colors to KPI cards |
| Keep brand patterns in heroes/auth/empty states | Put patterns behind dense data |
| Use the gradient + one blended, faded photo in portal heroes (§7.1) | Draw circles, arcs, blobs or polygons in the hero, or round its corners |
| Give each dashboard section its own white card | Wrap every section in one big white container |
| Keep the same top navigation bar and lockup in every portal (§8.2) | Restyle the header, logo lockup or Logout per portal |
| Keep the Logout label and icon white | Let a global text color turn the Logout label dark |
| Keep the sidebar collapsed until hovered or focused (§9.12) | Push page content when the sidebar opens |
| Use one sliding highlight for the active item | Recolor the highlight or add a second active indicator |

---

## 16. PR Consistency Checklist

Before merging any UI change, confirm:

- [ ] Only Poppins is used; type styles come from the scale in §4.
- [ ] Colors come from tokens (no hard-coded hex outside the token file).
- [ ] Buttons use `.btn` + size + variant; states (default/hover/focus/disabled) all work.
- [ ] Inputs, selects, and toolbars match §9.3–9.4; focus ring is visible.
- [ ] Tables follow §9.5; pagination follows §9.6.
- [ ] Status/category badges follow the map in §10.
- [ ] KPI cards follow §9.7 (icon chip + title + value).
- [ ] Icons are from the approved set, correct size and stroke.
- [ ] Spacing uses the 4px scale; radii use the tokens.
- [ ] Contrast and keyboard navigation are checked.
- [ ] The top bar follows §8.2, and the Logout label and icon render **white** (check the rendered color, not just the code).
- [ ] Sidebar follows §9.12: collapsed by default, hover and focus open, overlay, reduced motion respected.
- [ ] Verified at mobile, tablet, and desktop widths.
- [ ] Works identically across Public, Employee, and HR/Admin portals.

---

## 17. Open Items / Known Inconsistencies

These were found while compiling this guide and should be resolved by the design owner:

1. **White hex typo** in the original brief (`#FFFFF`). This guide uses `#FFFFFF`.
2. **Duplicate neutral** (`#28343D` listed twice). This guide defines the neutral scale as `#101E29 / #28343D / #515F69` plus proposed `#94A3B8` and `#E2E8F0`.
3. **Small Secondary button height** shown as 45px in the kit; treated as a typo for **36px**.
4. **Status color hexes** (green/orange/red 100/300/500) were sampled visually from the reference image and the `700` text shades are proposed for accessibility. Confirm against the source design file.
5. **Primary button color** in the kit appears slightly more violet than `#363EE8`. This guide standardizes on `#363EE8` → `#191FA8` for the gradient. Update tokens if the design file uses a different value.
6. **KPI card reference** was described but no image was attached; §9.7 follows the description (small icon + KPI title). Adjust if the source mock differs.
7. **Logo file** is referenced as `USWAG (3)`. Add the final SVG to the repo (e.g. `/assets/brand/abyan-logo.svg`) and reference that path here.
8. **Legacy global text color.** `src/styles/globals.css` sets `color: var(--text-primary)` directly on `span, p, label, button, a` and headings, so they ignore their parent's color. This is why Logout labels rendered dark on the blue header. It is patched per component for now: explicit white on header labels, and a text-inherit reset inside `.abyan-ds`. Remove the global rule once every portal uses the token file.
9. **Admin header lockup.** `AdminHeader` still stacks "ABYAN" above the system name. Move it to the single-line lockup in §8.2.
10. ~~**Side navigation: Settings has no active state.**~~ **Resolved** in the RSP rollout: the highlight lives on the rail itself (not inside a single nav group), so it can travel to Settings too. See §9.12 implementation notes.
11. ~~**Side navigation: focus ring on the active item.**~~ **Resolved** in the RSP rollout: the active item's focus ring is `--color-primary` instead of white when the rail is open. See §9.12 implementation notes.
12. **Side navigation: Esc drops focus.** In the mockup, Esc closes the rail by blurring the focused item, which sends keyboard focus to the page body. Still true in the RSP rollout. Consider moving focus to a sensible target, such as the main content.

---

*Maintained by the ABYAN development team. Propose changes through a pull request that updates this guide and the token file together.*
