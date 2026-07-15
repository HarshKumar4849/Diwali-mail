# Mailcraft — Teal UI Redesign

## Overview

Full UI revamp of Mailcraft with a teal accent aesthetic and mobile-friendly responsive design. Builds on the existing shadcn/ui component library and Tailwind CSS v4 theming system — no framework changes, just systematic theme and component redesign.

## Design Decisions

- **Teal as accent**: Neutral white/light backgrounds with teal (`oklch(0.55 0.12 190)`) as the primary color for buttons, links, badges, active states, and focus rings
- **Light mode only**: No dark mode. Clean white backgrounds keep the teal accent crisp
- **Bottom tab bar on mobile**: 3-tab bar (Dashboard, New Campaign, Settings) for thumb-friendly navigation on phones
- **Top navbar on desktop**: Teal navbar with links, sticky at top. Same links as bottom tabs
- **Component-level refinements**: Cards, buttons, badges, dialogs, inputs, progress bars all get teal treatment
- **Full redesign scope**: Not just a color swap — layouts get restructured for mobile, wizard gets mobile-friendly bottom nav, dashboard gets stat cards

## Color System

Replace the current neutral grayscale primary with teal across the CSS custom properties in `globals.css`:

| Variable | Light Mode Value | Usage |
|---|---|---|
| `--primary` | `oklch(0.55 0.12 190)` | Buttons, links, active states |
| `--primary-foreground` | `oklch(1 0 0)` | Text on teal buttons |
| `--primary-hover` | `oklch(0.45 0.1 190)` | Button hover state |
| `--ring` | `oklch(0.65 0.15 190)` | Focus ring on inputs, buttons |
| `--accent` | `oklch(0.92 0.02 190)` | Subtle teal tinted backgrounds |
| `--accent-foreground` | `oklch(0.35 0.06 190)` | Text on accent backgrounds |
| `--border` | `oklch(0.85 0.01 190)` | Border color (cooler gray) |
| `--input` | `oklch(0.85 0.01 190)` | Input border |
| `--muted` | `oklch(0.95 0.005 190)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.6 0.01 190)` | Muted text |

Background stays white (`oklch(1 0 0)`). Foreground stays near-black (`oklch(0.145 0 0)`). Chart colors shift to teal variants.

## Navigation

### Desktop (≥768px)
- Sticky teal top navbar with:
  - Logo/name on the left
  - Nav links: Dashboard, New Campaign, Settings
  - User menu (avatar/initials) on the right
- Subtle bottom border in teal
- Active link highlighted with teal underline or indicator

### Mobile (<768px)
- Top navbar collapses to just logo + user avatar
- Bottom tab bar fixed to viewport with 3 tabs:
  - **Dashboard** (home icon) — `/`
  - **New Campaign** (plus/pen icon) — `/campaign/new`
  - **Settings** (gear icon) — `/settings`
- Active tab highlighted in teal
- Bottom tab bar hides when inside a campaign detail page (treats it as a sub-view)
- Tab bar uses `safe-area-inset-bottom` for notched devices

## Layout & Responsiveness

### Dashboard
- **Desktop**: 3-column grid of campaign cards (`md:grid-cols-2 lg:grid-cols-3`). Stat row (Total/Sent/Partial) above the grid
- **Mobile**: Single-column stacked cards. Stat row becomes 3 compact cards side by side. FAB button for "New Campaign" in bottom-right
- Empty state with teal tinted illustration

### Campaign Wizard
- **Desktop**: Centered `max-w-3xl` layout with step indicator at top (numbered circles, teal for active/completed)
- **Mobile**: Full-width. Step indicator compresses to compact numbered stepper. Form fields full-width. Bottom-fixed "Back"/"Next" buttons pinned to viewport
- All 6 steps get mobile layout pass: CSV upload zone full-width, template editor full-width, recipient table simplified

### Campaign Detail
- **Desktop**: Two-column — left has campaign info, teal progress bar, action buttons (Send, Retry, Delete); right has recipient table with status-colored rows
- **Mobile**: Single column stacked. Progress bar full-width. Recipient list as cards with email + status dot, expandable for details (error message, retry count)

### Tables
- Desktop: full table with all columns
- Mobile: reduced columns (email, status), horizontal scroll, row expansion for details

## Component Redesigns

### Buttons
- Primary: solid teal bg, white text
- Secondary/Outline: teal border, teal text
- Ghost: teal text on hover
- Destructive: stays red
- Focus ring: teal (`--ring`)

### Cards
- 3px teal top accent border
- Subtle box-shadow
- Hover: lift shadow, teal accent line intensifies

### Badges
- Color-coded statuses:
  - Draft: gray (muted)
  - Sending: teal bg + white text + gentle pulse animation
  - Done: green
  - Partial: amber/yellow
- Default badge variant: teal

### Dialogs
- Teal top accent bar or teal header
- Teal focus rings
- Mobile: full-screen dialog with bottom sheet feel

### Inputs / Select / Textarea
- Default border: `--border` (cool gray)
- Focus: teal border + teal ring glow (`box-shadow: 0 0 0 3px rgba(teal, 0.15)`)
- Cursor: teal

### Progress
- Track fill: teal (`--primary`)
- Background: `--muted`
- Animated fill transition

## Micro-interactions
- Button hover: subtle scale transform + background darken
- Card hover: shadow elevation + teal accent glow
- "Sending" badge: CSS pulse animation
- Page navigation: CSS view transitions (fade, progressive enhancement)
- Loading skeletons: teal-tinted shimmer placeholder
- Toast (sonner): teal accent bar on success toasts

## Implementation Approach

**Systematic Theme Overhaul**: Change CSS custom properties in `globals.css`, add per-component Tailwind refinements, build responsive navigation components, restructure page layouts for mobile. No component library replacement — shadcn/ui components are retained and themed.

### Files to modify

**Theme & Global:**
- `app/globals.css` — Replace all `:root` CSS variable values with teal palette

**Navigation (new):**
- `components/bottom-nav.tsx` — Mobile bottom tab bar with 3 tabs
- `components/navbar.tsx` — Update desktop navbar with teal styling

**Components (refinements):**
- `components/ui/button.tsx` — Add teal hover states, focus ring already handled by ring var
- `components/ui/card.tsx` — Add teal top accent border variant
- `components/ui/badge.tsx` — Add teal variant, status color mappings
- `components/ui/dialog.tsx` — Teal accent header
- `components/ui/input.tsx` — Already uses ring var, verify
- `components/ui/progress.tsx` — Teal track

**Pages (layout responsive):**
- `app/page.tsx` — Dashboard responsive layout + stat cards + campaign cards
- `app/campaign/new/page.tsx` — Wizard container responsive
- `app/campaign/[id]/page.tsx` — Two-column desktop, stacked mobile
- `app/settings/page.tsx` — Responsive settings
- `app/layout.tsx` — Add bottom-nav, responsive wrapper

**Wizard steps (mobile layout):**
- `components/campaign-wizard/wizard.tsx` — Mobile step indicator + bottom nav buttons
- `components/campaign-wizard/step-*.tsx` — Full-width mobile layouts

## Out of Scope
- No dark mode implementation (CSS exists for `.dark` but no toggle)
- No component library replacement
- No backend changes
- No new features — visual revamp only
