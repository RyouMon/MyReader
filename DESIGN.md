---
version: alpha
name: MyReader
description: >
  Local-first reading product rooted in Calibre workflows. Content-first,
  warm editorial aesthetic. Designed for sustained long-session reading and
  calm library management across desktop and mobile.
colors:
  primary: "#D97757"
  secondary: "#A87E62"
  bg: "#EDE8DF"
  bg-secondary: "#F7F3EC"
  ink-1: "#1C1714"
  ink-2: "#5C5349"
  ink-inverse: "#FAF6F0"
  success: "#3A7D5A"
  warning: "#C4922D"
  danger: "#B53A2F"
  border: "rgba(28, 23, 20, 0.10)"
  border-strong: "rgba(28, 23, 20, 0.20)"
typography:
  display:
    fontFamily: "Noto Serif SC, Lora, Georgia, serif"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  h1:
    fontFamily: "Noto Serif SC, Lora, serif"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.02em
  h2:
    fontFamily: "Noto Serif SC, Lora, serif"
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.4
  h3:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.4
  body-lg:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.75
  body-md:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans SC, DM Sans, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    letterSpacing: 0.06em
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
    fontSize: 14px
    fontWeight: 400
  reading:
    fontFamily: "Merriweather, Noto Serif SC, Georgia, serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.8
rounded:
  xs: 2px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 20px
  full: 9999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  24: 96px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: 32px
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-primary-active:
    backgroundColor: "{colors.accent-press}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-1}"
    rounded: "{rounded.md}"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.ink-inverse}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  book-card:
    rounded: "{rounded.lg}"
  reader-chrome:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-1}"
---

# MyReader Design System

## Overview

MyReader is a **Quiet Editorial Reading OS** — local-first, Calibre-powered,
cross-platform. Primary users are heavy readers who care about long-session
readability, continuity, and calm interaction.

**Mood:** Warm, composed, low-noise, content-led. The UI should feel like a
good reading environment first, tool chrome second.

**Brand tone:** Calm, precise, respectful. Short literal microcopy. Error
states recovery-oriented, never alarming.

### Platform layers
- **Shared** (this file): aesthetic direction, brand tone, semantic colors,
  typography roles, accessibility floor.
- **`my-reader/src/design-tokens.css`**: pointer/keyboard density, hover-driven interaction,
  multi-pane layout specifics.
- **`my-reader-mobile/src/design/tokens.tsx`**: touch-first spacing, gesture, safe-area handling.
- Platform docs may extend but **never redefine** shared semantic values.

### Code sources of truth
- `.agents/skills/myreader-design-system/colors_and_type.css` — machine-readable canonical token values.
- `my-reader/src/design-tokens.css` — desktop CSS implementation.
- `my-reader/src/index.css` — Tailwind v4 `@theme inline` mapping.
- `my-reader-mobile/src/design/tokens.tsx` — mobile JS palette.
- `my-reader-mobile/src/design/reader-tokens.ts` — reader-chrome token layer.

---

## Colors

Rooted in a warm neutral palette with a terracotta accent. Two text tiers for
hierarchy, three surface tiers for depth. Semantic feedback colors for status.

- **Background (`#F7F3EC`):** Warm paper — page-level ground.
- **Background Subtle (`#F0EBE1`):** Slightly recessed — sidebars, secondary panels.
- **Surface (`#FFFFFF`):** Cards, modals, elevated panels — clean lift over bg.
- **Surface-2 (`#F5F1EA`):** In-panel row alternation, hover backgrounds.
- **Surface-3 (`#EDE8DF`):** Pressed / selected state backgrounds.
- **Ink-1 (`#1C1714`):** Primary text — near-black, warm, maximum readability.
- **Ink-2 (`#5C5349`):** Secondary — metadata, labels, captions.
- **Ink-3 (`#9C9089`):** Tertiary — disabled, placeholder, decorative.
- **Ink-4 (`#C4B8AE`):** Ghost — faintest readable text.
- **Ink Inverse (`#FAF6F0`):** Text on dark/accent surfaces.
- **Accent (`#C4622D`):** Terracotta — single primary interaction color. Primary
  buttons, progress, active states, links. Use sparingly.
- **Accent Soft (`#F5E8DF`):** Tinted background for badges and selected rows.
- **Accent Muted (`#E8C9B5`):** Accent-tinted border or divider.
- **Success (`#3A7D5A`):** Confirmation, sync complete, connected state.
- **Warning (`#C4922D`):** Non-blocking cautions; amber hue stays warm.
- **Danger (`#B53A2F`):** Destructive actions, critical errors.
- **Border Subtle (`rgba(28,23,20,0.06)`):** Hairline separators and low-emphasis dividers.
- **Border (`rgba(28,23,20,0.10)`):** Default card/control border.
- **Border Strong (`rgba(28,23,20,0.18)`):** High-emphasis section split.
- **Border Active (`rgba(196,98,45,0.22)`):** Active/selected outline.
- **Border Error (`rgba(181,58,47,0.18)`):** Error card/input outline.

### Dark mode
Activated via `.dark` class (desktop) or system `colorScheme` (mobile).
Dark values are defined in `.agents/skills/myreader-design-system/colors_and_type.css` under `[data-theme="dark"]`. The accent shifts
slightly warmer to `#D4703A` for better visibility on dark surfaces.

---

## Typography

Two-family strategy: **serif for display/headings** (editorial gravity),
**sans-serif for UI** (clarity at density).

- **Display / Headings:** `Noto Serif SC` primary (CN support), `Lora` fallback
  for Latin-heavy contexts. Tight tracking, strong weight.
- **Body / UI controls:** `Noto Sans SC` + `DM Sans`. Clean, readable at
  14–16px desktop density.
- **Reading (in-reader):** `Merriweather` + `Noto Serif SC`. Optimized
  for long-form sustained reading; 18px base, 1.8 line-height.
- **Mono:** `JetBrains Mono` for code, metadata, data display.

**Rules:**
- Role separation is stable across platforms. Display = serif, UI = sans.
- Never use novelty fonts for feature screens.
- Do not drop below platform baseline body size (14px desktop, 16px mobile).

---

## Layout

### Base grid
- **Desktop:** 4pt grid, 8pt major rhythm. Dense scanning layouts.
- **Mobile:** 8pt grid, 4pt micro-adjustment. Generous touch targets.

### Reading surface
- Content column width: `66ch` (optimal reading measure).
- Reading margin: `clamp(24px, 8vw, 96px)`.
- Never let chrome compete with reading width.

### Breakpoints
Platform docs define specific breakpoints. Shared rule: the reading surface
always dominates; navigation chrome recedes.

---

## Elevation & Depth

Depth via **tonal layering + subtle shadow** — not heavy drop shadows.
Background (`bg`) → Surface → Surface-2 → Surface-3 creates natural hierarchy.

| Tier | Usage | Shadow |
|------|-------|--------|
| `elev-xs` | Subtle row separation | `0 1px 2px rgba(28,23,20,0.06)` |
| `elev-card` | Cards, list groups | `0 1px 3px …0.08, 0 4px 12px …0.06` |
| `elev-cover` | Book covers, hero art | `2px 4px 16px …0.18, 0 1px 3px …0.12` |
| `elev-panel` | Panels, sidesheets | `0 2px 8px …0.10, 0 12px 32px …0.08` |
| `elev-modal` | Dialogs, popovers | `0 4px 16px …0.12, 0 24px 64px …0.14` |

Dark mode: shadows deepen (`rgba(0,0,0,…)` replaces warm tones).

---

## Shapes

**Architectural softness** — rounded but not playful.

| Token | Value | Use |
|-------|-------|-----|
| `radius-xs` | 2px | Chips, tags, tiny badges |
| `radius-sm` | 4px | Minor controls, inline elements |
| `radius-md` | 8px | Buttons, inputs, list items |
| `radius-lg` | 12px | Cards, grouped containers |
| `radius-xl` | 20px | Hero containers, modals |
| `radius-full` | 9999px | Pill badges, avatar circles |

Never mix sharp and heavily-rounded corners in the same view.

---

## Components

### Button — Primary
Accent background (`#C4622D`), ink-inverse text. Single most-prominent action
per screen. Height: 32px desktop / 48px mobile.

### Button — Secondary
`surface-2` background, `ink-1` text. Lower visual weight but clear affordance.

### Button — Destructive
`danger` background. Requires confirmation flow for irreversible actions.

### Book Card
Cover art at `aspect-ratio 2/3`. Cover gradient overlay uses `rgba(0,0,0,…)`
scrim — this is a deliberate on-image treatment, not a semantic surface. The
scrim opacity tokens are `--cover-scrim-rest` and `--cover-scrim-hover`.

### Reader Chrome
Controls must **recede** during reading. Use `reader-chrome-*` tokens.
Active/accent state uses `reader-chrome-active` (= accent). In fixed-layout
mode, chrome goes dark regardless of app theme.

### Status / Feedback
- Success states: `success` + `success-soft` background.
- Warning states: `warning` + `warning-soft` background.
- Danger/error states: `danger` + `danger-soft` background.
- Never use raw Tailwind color scales (`emerald-*`, `red-*`) — always use
  semantic tokens.

### Overlay / Scrim
- Modal scrim: `overlay-strong` (`rgba(28,23,20,0.50)` light / `rgba(0,0,0,0.65)` dark).
- Sheet backdrop: `overlay` (`rgba(28,23,20,0.22)` / `rgba(0,0,0,0.38)` dark).

---

## Do's and Don'ts

- **Do** use `accent` for the single most important action per screen.
- **Do** use semantic tokens (`--ink-1`, `--accent-soft`, `--danger`) — never raw hex.
- **Do** keep role separation: serif = editorial, sans = UI, reading font = reader only.
- **Do** provide WCAG AA contrast for body text; target stronger than AA for critical controls.
- **Do** define `prefers-reduced-motion` behavior for all non-essential animation.
- **Don't** use raw Tailwind palette classes (`bg-black`, `text-white`, `emerald-500`).
- **Don't** hardcode `rgba(...)` values in component files — use CSS custom properties.
- **Don't** let reader chrome visually compete with reading content.
- **Don't** mix `rounded-[Npx]` arbitrary values — use radius token utilities.
- **Don't** redefine shared semantic color values in platform-specific files.
- **Don't** use more than two font weights on a single non-reading screen.
- **Don't** use novelty or promotional fonts for any app surface.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-07 | Split into shared + mobile + desktop design docs | Brand coherence + platform-native best practices |
| 2026-04-07 | Quiet editorial direction, warm neutral palette | Long-session readability + reading-product identity |
| 2026-04-23 | Upgrade to design.md spec format (YAML frontmatter) | Machine-readable tokens for AI tooling and Figma sync |
| 2026-04-23 | Align token values to .designsystem/colors_and_type.css | Single visual source of truth; accent updated to terracotta #C4622D; ink tier replaces text/text-muted |
