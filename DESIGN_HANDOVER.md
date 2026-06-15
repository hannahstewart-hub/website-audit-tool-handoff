# Design Handover — Birdie Website Audit Tool

## What this is

A free lead-gen web app for UK homecare agency owners. The tool crawls a submitted website URL, combines crawl signals with a 5-question self-assessment checklist, and produces a personalised red/amber/green audit report. Users must submit a contact form before seeing their results. Built in Next.js 14 / Tailwind CSS / TypeScript.

Live dev server: `http://localhost:3000`

---

## Brand & design system

### Colours

| Token | Hex | Usage |
|---|---|---|
| `navy` | `#00264D` | Primary text, hero background, score header background, footer |
| `blue` | `#1789FC` | Interactive accent — focus rings, hover borders, checkbox tick, how-to expand boxes |
| `mint` | `#A6FAE8` | Accent on dark backgrounds (hero tagline, nav link, CTA card background); "Quick win" badge fill; green RAG score colour |
| `orange` | `#F09600` | Primary CTA buttons; amber RAG score colour |
| `#EF4444` | — | Red RAG score colour (Tailwind red-500, not a named token) |
| `#F7F9FF` | — | Report/results page background (barely-blue off-white) |
| `#EEF5FF` | — | Fix recommendation box background (light blue tint) |

Teal (`#54BDB8`) is defined in the config but unused — do not reintroduce it.

### Typography

| Role | Font | Weights |
|---|---|---|
| Headings (`font-heading`) | Poppins | 600, 700 |
| Body (`font-body`) | Inter | 400, 500, 600 |

Both loaded from Google Fonts.

### Border radius

| Token | Value |
|---|---|
| `rounded-xl` | 12px |
| `rounded-2xl` | 16px |

### Spacing / layout

- Max content width: `max-w-5xl` (1024px) with `px-6` gutters
- Lead gate form is narrower: `max-w-xl`
- Cards use `shadow-sm` with `border border-navy/5` on white backgrounds

---

## User flow

```
1. HERO (navy background)
   URL input + 5-question checklist → "Run my audit"

2. LOADING
   Shimmer bar while audit API runs (~5–15s, crawls up to 10 pages)

3. LEAD GATE (off-white background)
   Overall score circle shown as teaser (colour = RAG status)
   "Your report is ready" + 5-field form
   Fields: First name*, Last name*, Work email*, Job title*, Agency name*
   → POST /api/lead → HubSpot + local save → unlock

4. REPORT (off-white background)
   Full breakdown: score header + 6 category cards + CTA
   PDF download available via window.print()
```

---

## Screen-by-screen breakdown

### 1. Header (persistent)
- Navy bar, Birdie logo (white SVG) left, tagline right
- Hidden on print

### 2. Hero
- Navy full-bleed section
- Mint "For UK homecare agency owners" eyebrow
- H1: "Is your website **actually winning** private clients?" (`actually winning` in mint)
- Cal mascot image (right, desktop only)
- White card containing:
  - URL text input + orange "Run my audit" button
  - 5 yes/no checklist questions (checkbox items with label + help text)
  - Shimmer loading bar
  - Error message (red-50 bg)

### 3. Lead gate
- Centred layout, `max-w-xl`
- Score circle (large, coloured by RAG: mint/orange/red) with score number
- "Your report is ready" heading
- Brief copy mentioning URL and "6 categories"
- White card with form:
  - First name + Last name (side by side, 2-col grid)
  - Work email
  - Job title
  - Agency name
  - Orange "Show me my results" CTA button
  - "We won't spam you" micro-copy
- "← Start over" ghost link below card
- **TODO: Swap form fields for HubSpot embed** (marked in code)

### 4. Report
Four sub-sections stacked:

#### 4a. Score header (navy, `print-score-header`)
- Large score circle (RAG colour)
- Headline + summary paragraph
- "Audited: [url] · N pages crawled"
- 6 category mini-cards in a 2-col (mobile) / 3-col (tablet) / 6-col (desktop) grid
  - Each card: category name (white/60) + score number in **RAG colour** (no dot)

#### 4b. Category cards (white, `print-category-card`)
Six cards, one per audit category:
1. Private-pay readiness
2. Services & specialisms
3. Trust & credibility
4. Clarity & messaging
5. Contactability
6. Mobile & speed

Each card contains:
- Category name (H3) + blurb + score badge (RAG colour)
- List of findings, each with:
  - RAG dot (3×3, coloured circle)
  - Finding label (medium weight)
  - Detail text (navy/70)
  - Fix recommendation box (`bg-[#EEF5FF]`, shown for non-green findings)
  - **"QUICK WIN"** tag — `rounded bg-mint/70 text-navy text-[10px] uppercase tracking-wider` — shown for easy non-developer fixes
  - **"DEV NEEDED"** tag — `rounded border border-orange/40 text-orange text-[10px] uppercase tracking-wider` — shown when a fix needs a developer
  - Collapsible **"How to do this"** section (blue-tinted box, toggled by text button) — hidden on print

#### 4c. Next step / CTA (navy, `print-category-card`)
- Identifies the lowest-scoring non-green category
- "Start with [category name]"
- Two cards side by side:
  - "Fix it yourself" — grey description
  - "See how Birdie helps" — mint background, links to `https://www.birdie.care/private-pay-hub`

#### 4d. PDF download prompt (white card, screen only)
- "Save this report" + "Download as PDF" navy button → `window.print()`

### 5. Footer (persistent)
- Navy bar, Birdie logo + copyright left
- Privacy + birdie.care links right
- Hidden on print

---

## RAG scoring system

| Status | Colour | Score range | Score value used |
|---|---|---|---|
| Green | Mint `#A6FAE8` on navy `#00264D` | ≥ 75 | 100 |
| Amber | Orange `#F09600` on white | ≥ 45 | 55 |
| Red | Red `#EF4444` on white | < 45 | 15 |

Overall score = weighted average across 6 categories (equal weight).

---

## PDF / print layout

Print styles in `app/globals.css` (`@media print`). Key behaviours:
- Page size: A4, margins 12mm top/sides, 18mm bottom
- **Print-only header**: slim bar — Birdie navy logo left, "Website Audit Report · [url] · [date]" right, hairline rule below
- **ScoreHeader**: compacted padding, score circle shrunk to 72px, shadow stripped, category grid forced to 3 columns
- **Category cards**: shadow stripped, tighter padding, `break-inside: avoid`
- Fix boxes keep the `#EEF5FF` blue tint
- How-to expand sections hidden (`data-no-print`)
- UI controls hidden (`data-no-print`)
- **Print-only footer**: fixed at page bottom — "Birdie Website Audit · [url] · [date]" left, "birdie.care · birdie.care/private-pay-hub" right

---

## Assets

| File | Description |
|---|---|
| `public/birdie-logo-white.svg` | White Birdie logo — for navy backgrounds |
| `public/birdie-logo-navy.svg` | Navy Birdie logo — for white/light backgrounds |
| `public/cal.png` | Cal mascot, tilted right pose — used in hero |
| `public/cal-flying.png` | Cal mascot, flying pose — available but currently unused |

---

## Key files

| File | Purpose |
|---|---|
| `app/page.tsx` | Entire frontend — all components in one file |
| `app/globals.css` | Global styles + full print/PDF stylesheet |
| `tailwind.config.ts` | Brand colour/font tokens |
| `lib/audit.ts` | Crawl engine + scoring logic + all finding definitions |
| `app/api/audit/route.ts` | POST endpoint — runs audit, returns `AuditResult` |
| `app/api/lead/route.ts` | POST endpoint — saves lead locally + submits to HubSpot |
| `data/leads.json` | Runtime lead store (gitignored) |

---

## Pending / known TODOs

- **HubSpot form embed** — the lead gate currently uses a custom form. A HubSpot embed code is to be dropped in, replacing the `<form>` block. The marker is in `LeadGate` in `app/page.tsx`. The `/api/lead` endpoint (server-side HS submission) can be retired once the embed is live.
- **Em-dashes** — removed from all visible copy; check any new copy additions.
- **`teal` token** — still in `tailwind.config.ts` but unused; can be removed or repurposed.
