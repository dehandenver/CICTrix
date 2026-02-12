# Employee Portal - Design System Reference

## Color Palette

### Primary Colors
- **Deep Blue**: `#0b3d91` - Primary brand color
- **Dark Blue**: `#0a2f6e` - Hover state, darker variant
- **Light Blue**: `#e6eef9` - Background tint, light variant
- **Blue Gradient**: `from-blue-600 to-blue-800` - Header backgrounds

### Semantic Colors
- **Success**: `#059669` - ✓ Confirmations, successful states
- **Error**: `#dc2626` - ✗ Errors, danger actions
- **Warning**: `#d97706` - ⚠ Warnings, caution alerts
- **Info**: `#0b3d91` - ℹ Informational messages (same as primary)

### Neutral/Gray Scale
- **Gray-50**: `#f9fafb` - Lightest background
- **Gray-100**: `#f3f4f6` - Light background
- **Gray-200**: `#e5e7eb` - Border color
- **Gray-600**: `#4b5563` - Secondary text
- **Gray-900**: `#111827` - Primary text

### Dark Theme (Sidebar)
- **Slate-900**: `#0f172a` - Sidebar background
- **Slate-800**: `#1e293b` - Sidebar hover state

## Typography

### Font Family
- **Primary Font**: System stack (BlinkMacSystemFont, Segoe UI, Helvetica Neue, sans-serif)
- **Monospace**: `font-mono` - For numeric identifiers (SSS, TIN, etc.)

### Font Sizes
- **xs**: 0.75rem (12px) - Labels, small text
- **sm**: 0.875rem (14px) - Form labels, helper text
- **base**: 1rem (16px) - Body text, inputs
- **lg**: 1.125rem (18px) - Button text, secondary headings
- **xl**: 1.25rem (20px) - Card titles
- **2xl**: 1.5rem (24px) - Section headings
- **3xl**: 1.875rem (30px) - Page title
- **4xl**: 2.25rem (36px) - Large hero text

### Font Weights
- **Regular**: 400 - Body text
- **Medium**: 500 - Form labels, helper text
- **Semibold**: 600 - Subheadings, card titles
- **Bold**: 700 - Main headings, important text

### Line Heights
- **Tight**: 1.25 - Headings
- **Normal**: 1.5 - Body text
- **Relaxed**: 1.75 - Descriptions, longer text

## Spacing System

All measurements follow an 8px base unit:

- **0.25rem**: 2px
- **0.5rem**: 4px
- **1rem**: 8px
- **1.5rem**: 12px
- **2rem**: 16px
- **3rem**: 24px
- **4rem**: 32px

## Border Radius

- **sm**: 0.25rem (2px) - Input fields (minimal curve)
- **md**: 0.5rem (4px) - Small elements
- **lg**: 0.75rem (6px) - Form inputs, default
- **xl**: 1rem (8px) - Cards, larger elements
- **2xl**: 1.5rem (12px) - Profile header
- **3xl**: 2rem (16px) - Large cards
- **full**: 9999px - Badges, avatars, pill shapes

## Component Styling

### Card Components
- **Background**: White (`#ffffff`)
- **Border**: 1px solid `#e5e7eb`
- **Border Radius**: `0.75rem` (tertiary) to `1rem` (secondary)
- **Padding**: `1rem` to `1.5rem`
- **Shadow**: `0 1px 3px rgba(0, 0, 0, 0.1)`
- **Title**: Bold, `1.25rem`, gray-900

### Button Styles

#### Primary Button
- **Background**: Linear gradient Blue-600 → Blue-800
- **Text**: White
- **Padding**: 
  - Small: `0.5rem 1rem`
  - Medium: `0.75rem 1.5rem`
  - Large: `1rem 2rem`
- **Border Radius**: `0.75rem`
- **Hover**: Lighter gradient, `translateY(-1px)`, shadow-lg

#### Secondary Button
- **Background**: Gray-600
- **Text**: White
- **Hover**: Gray-500

#### Outline Button
- **Background**: Transparent
- **Border**: 1.5px solid Blue-600
- **Text**: Blue-600
- **Hover**: Light blue background (`#e6eef9`)

#### Ghost Button
- **Background**: Transparent
- **Text**: Gray-600
- **Hover**: Gray-100 background, gray-900 text

### Input Fields
- **Background**: White
- **Border**: 1px solid `#e5e7eb`
- **Border Radius**: `0.75rem`
- **Padding**: `0.75rem 1rem`
- **Focus**: Blue border + blue shadow
- **Error**: Red border + red shadow
- **Disabled**: Gray background, opacity 0.6

### Navigation & Layout

#### Sidebar
- **Width Expanded**: `w-56` (224px)
- **Width Collapsed**: `w-20` (80px)
- **Background**: Slate-900
- **Text Color**: White
- **Active Item**: Blue-600 background
- **Hover Item**: Slate-800 background
- **Transition**: 300ms ease-in-out

#### Header Bar
- **Background**: White
- **Border Bottom**: 1px gray-200
- **Padding**: `1rem 2rem`
- **Position**: Sticky/fixed
- **Shadow**: Subtle box-shadow for elevation
- **Text**: Left-aligned title, right-aligned user info

#### Profile Header Card
- **Background**: Linear gradient Blue-600 → Blue-800
- **Text Color**: White
- **Padding**: `1.5rem`
- **Border Radius**: `1.5rem`
- **Avatar**: 80x80px white circle with icon

## Icon System

All icons use **Lucide React** (24px default size):

### Navigation Icons
- `Menu` - Sidebar toggle
- `X` - Close actions
- `LogOut` - Logout button
- `User` - Profile, users

### Data Field Icons
- `Phone` - Telephone numbers
- `Mail` - Email addresses
- `MapPin` - Addresses, locations
- `Home` - Home addresses
- `Calendar` - Dates, dateOfBirth
- `Heart` - Emergency contact, relationships
- `IdCard` - Government IDs
- `FileText` - Documents

### Alert Icons
- `AlertCircle` - Errors, warnings

## Responsive Breakpoints

Grid layouts use Tailwind breakpoints:

```
Mobile:  < 768px  (1 column)
Tablet:  768px    (2 columns) [md:]
Desktop: 1024px   (3 columns) [lg:]
```

## Shadows & Elevation

- **sm**: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`
- **md**: `0 4px 6px -1px rgba(0, 0, 0, 0.1)`
- **lg**: `0 10px 15px -3px rgba(0, 0, 0, 0.1)`
- **xl**: `0 20px 25px -5px rgba(0, 0, 0, 0.1)`

## Transitions & Animations

- **Duration**: 300ms
- **Timing Function**: `ease-in-out`
- **Common Properties**:
  - Colors: Smooth fade
  - Transforms: Scale, translate
  - Opacity: Smooth fade

## Accessibility Features

### Color Contrast
- **WCAG AA Compliant**: All text meets minimum 4.5:1 contrast ratio
- **Large Text**: 3:1 for text ≥ 18pt or ≥ 14pt bold
- **Non-Text Contrast**: 3:1 for UI components

### Focus States
- **Keyboard Focus**: Clear blue outline + shadow
- **Focus Visible**: Applied to all interactive elements
- **Focus Color**: Blue-600 (#0b3d91)

### Touch Targets
- **Minimum Size**: 44x44px for touch targets
- **Spacing**: At least 8px between interactive elements

## Dark Mode Consideration

While the current design uses light themes, the following colors could support dark mode:

```css
@media (prefers-color-scheme: dark) {
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text-primary: #f1f5f9;
  --color-text-secondary: #cbd5e1;
}
```

## Animation Keyframes

### Spinner Animation
```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```
- **Duration**: 0.75s
- **Timing**: Linear infinite
- **Output**: Rotating loading indicator

## Usage Examples

### Color Application
```tsx
// Primary action button
<button className="bg-blue-600 hover:bg-blue-700 text-white">
  Action
</button>

// Secondary text
<p className="text-gray-600">Secondary information</p>

// Error state
<div className="border-red-500 bg-red-50">Error message</div>
```

### Spacing Application
```tsx
// Padding: 1rem (8px * 2 units)
<div className="p-4">Content</div>

// Margin: 1.5rem (8px * 3 units)
<div className="mb-6">Spacing</div>

// Gap between items: 0.5rem (8px * 1 unit)
<div className="flex gap-2">Items</div>
```

### Border Radius Application
```tsx
// Card (1rem - 8px)
<div className="rounded-lg">Card</div>

// Input (0.75rem - 6px)
<input className="rounded px-3 py-2" />

// Avatar (full - 9999px)
<img className="rounded-full w-20 h-20" />
```

## Browser Rendering

- **Rendering Engine**: Optimized for WebKit, Blink, Gecko
- **Subpixel Rendering**: Enabled via `font-smoothing: antialiased`
- **Hardware Acceleration**: Applied to transform/opacity animations

---

For more details, refer to:
- `EMPLOYEE_PORTAL_DOCUMENTATION.md` - Full component documentation
- `EMPLOYEE_PORTAL_SETUP.md` - Implementation guide
- Source files in `src/modules/employee/`
