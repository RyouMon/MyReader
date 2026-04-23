# MyReader Design System

> **Content-first.** MyReader is a cross-platform reading app built on the Calibre ecosystem — desktop (Tauri 2) and mobile (React Native / Expo) — with seamless reading progress sync across devices. The design philosophy: the book is the hero, the interface disappears.

## Sources

No external Figma links or codebase were attached. This design system is derived entirely from the product PRD. If you have a codebase or Figma file, re-attach via the Import menu and the system will be updated.

---

## Product Context

**MyReader** solves cross-device reading continuity for Calibre power users — and, in a Post-MVP phase, for anyone without Calibre. Two library modes:

| Mode | Source | Metadata |
|------|--------|----------|
| Calibre Library | `metadata.db` (read-only) | Full Calibre metadata |
| Standalone Library | App-managed directory | Title + Author only |

**Platforms:**
- 🖥 **Desktop** — Tauri 2 (macOS, Windows, Linux)
- 📱 **Mobile** — React Native / Expo (iOS, Android)

**MVP scope:** Read books from Calibre library on both devices, sync progress via WebDAV/cloud blob. No ComfyUI, no TTS, no physics pages.

---

## CONTENT FUNDAMENTALS

**Language:** Primarily Simplified Chinese UI copy; English for technical/status strings. Both are supported in every typeface choice.

**Tone:** Calm, focused, understated. The app does not shout. No marketing-speak inside the product. Copy is short, direct, and never cute.

**Voice:**
- ✅ "继续阅读" / "Continue Reading" — verb-first, action-clear
- ✅ "同步中…" / "Syncing…" — status, honest
- ✅ "上次读到第 42 页" — specific, factual
- ❌ "您的阅读旅程从这里开始！" — avoid hype
- ❌ Emoji in UI copy — never used in product strings

**Casing (English):** Sentence case everywhere. No Title Case in UI labels. Navigation labels are nouns, not gerunds ("Library", not "Browse Library").

**Numbers:** Use actual digits (42, not forty-two). Percentages for progress. Relative time for sync ("2 min ago", "刚刚").

**Empty states:** Honest and brief. One line of what's missing, one CTA. No illustration mascots.

---

## VISUAL FOUNDATIONS

### Philosophy
Content-first means the reading surface is neutral — warm paper tone, no chrome competing with prose. UI elements appear on demand (tap/hover) and recede. Color is used sparingly: one accent, no rainbow palettes.

### Colors
- **Background** `--bg`: warm off-white `#F7F3EC` — paper, not stark white
- **Surface** `--surface`: `#FFFFFF` — cards, panels
- **Surface 2** `--surface-2`: `#F0EBE1` — subtle in-page dividers, sidebars
- **Ink 1** `--ink-1`: `#1C1714` — primary text, near-black with warmth
- **Ink 2** `--ink-2`: `#5C5349` — secondary labels, metadata
- **Ink 3** `--ink-3`: `#9C9089` — placeholders, disabled, captions
- **Accent** `--accent`: `#C4622D` — a warm terracotta/ochre; used for progress, active states, links
- **Accent soft** `--accent-soft`: `#F5E8DF` — accent backgrounds, badges
- **Danger** `--danger`: `#B53A2F`
- **Success** `--success`: `#3A7D5A`
- **Dark bg** `--bg-dark`: `#1C1814` — night/sepia dark mode base

### Typography
- **Display serif** — Lora — used for book titles in library, chapter headings
- **UI sans** — DM Sans — all navigation, labels, metadata, settings
- **Reading body** — Merriweather — the in-reader paragraph font; excellent at small sizes
- **Mono** — JetBrains Mono — technical strings, path display, sync IDs
- Both Chinese and Latin scripts are supported; fallback stack includes `"Noto Serif SC"` and `"PingFang SC"` / `"Microsoft YaHei"`

### Spacing
- Base unit: **4px**. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96
- Reading margins: generous — `clamp(24px, 8vw, 96px)` horizontal
- Component padding: typically 12–16px inner, 24px between sections

### Corner Radii
- `--radius-sm`: 4px — tags, chips, small elements
- `--radius-md`: 8px — cards, inputs, buttons
- `--radius-lg`: 12px — modals, popovers, book covers
- `--radius-xl`: 20px — bottom sheets, mobile cards
- No pill/full-round shapes except progress bars and toggle switches

### Shadows
- `--shadow-card`: `0 1px 3px rgba(28,23,20,.08), 0 4px 12px rgba(28,23,20,.06)` — book covers, cards
- `--shadow-panel`: `0 2px 8px rgba(28,23,20,.10), 0 12px 32px rgba(28,23,20,.08)` — panels, drawers
- `--shadow-cover`: `2px 4px 16px rgba(28,23,20,.18)` — book covers (mimics physical shadow)
- Shadows are warm-tinted (not pure grey/blue). No colored glow shadows.

### Backgrounds
- No gradient backgrounds on surfaces. Solid fills only.
- Background texture: `#F7F3EC` — intentionally paper-like but done via color, not image texture
- Full-bleed book cover images in library grid; never stretched, always `object-fit: cover`
- No decorative illustrations in MVP; cover art is the visual content

### Animations
- Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` standard; `cubic-bezier(0.34, 1.56, 0.64, 1)` for spring (cover open)
- Duration: 120ms micro, 200ms standard, 340ms page transitions
- No bounce animations on UI chrome; spring only for cover/book opening metaphor
- Hover: opacity 0.8 or slight background fill; no scale
- Press: `scale(0.97)` on book covers; subtle for buttons
- Progress bar fills smoothly; sync icon rotates when active

### Hover & Press States
- **Links/buttons**: background fill with `--accent-soft`; no underline in nav
- **Book covers**: subtle `scale(1.02)` + shadow depth increase on hover
- **List rows**: `--surface-2` fill
- **Active/selected**: `--accent` left border (3px) + `--accent-soft` row bg

### Borders
- `--border`: `1px solid rgba(28,23,20,.08)` — cards, panels
- `--border-strong`: `1px solid rgba(28,23,20,.18)` — inputs, focused states
- No heavy colored borders; borders are structural, not decorative

### Transparency & Blur
- Reader toolbar (top/bottom): `backdrop-filter: blur(12px)` over reading content when overlaid
- Sidebar scrim on mobile: `rgba(28,23,20,.4)` backdrop
- Used sparingly — not on cards or general UI

### Cards
- Book cover card: rounded `--radius-lg`, `--shadow-cover`, no border
- Metadata card (settings, sync status): `--shadow-card`, `--radius-md`, `--border`
- No colored left-border accent cards — that pattern is explicitly avoided

### Dark / Night Mode
- Background shifts to `#1C1814`; surfaces to `#26211D` / `#2F2923`
- Ink values invert to warm off-whites
- Accent stays `#C4622D`; slightly brightened to `#D4703A` for legibility
- Sepia mode: `#2C2418` bg, `#E8D9BC` text — classic e-reader mode

---

## ICONOGRAPHY

No proprietary icon font is attached. This system uses **Lucide Icons** (CDN: `https://unpkg.com/lucide@latest`) as the standard icon set.

- **Style**: 1.5px stroke, round joins/caps, 24×24 base grid
- **Usage**: Icons are always paired with labels except in well-established positions (back arrow, close ×, search magnifier)
- **Size**: 16px inline with body text; 20px standalone UI icons; 24px in empty states
- **Color**: `currentColor` — inherits ink color; accent color only on interactive/active state icons
- **No emoji** in UI; no PNG icons; no unicode-as-icon patterns
- **Key icons used**: `book-open`, `library`, `sync`, `settings`, `search`, `chevron-left`, `chevron-right`, `check-circle`, `cloud`, `wifi-off`, `moon`, `sun`

---

## FILE INDEX

```
/
├── README.md                    ← This file
├── SKILL.md                     ← Agent skill definition
├── colors_and_type.css          ← All CSS variables & font imports
├── assets/
│   ├── logo.svg                 ← MyReader wordmark + icon
│   └── logo-dark.svg            ← Dark variant
├── preview/
│   ├── colors-brand.html        ← Brand / accent palette
│   ├── colors-neutral.html      ← Neutral ink + bg scale
│   ├── colors-semantic.html     ← Status / semantic colors
│   ├── colors-dark.html         ← Dark mode palette
│   ├── type-scale.html          ← Display + heading scale
│   ├── type-body.html           ← Body + UI + reading specimens
│   ├── type-chinese.html        ← Chinese type specimens
│   ├── spacing-tokens.html      ← Spacing scale tokens
│   ├── spacing-radius.html      ← Radius + shadow system
│   ├── components-buttons.html  ← Button variants
│   ├── components-book-card.html← Book cover card
│   ├── components-progress.html ← Reading progress + sync
│   ├── components-reader.html   ← Reader toolbar + controls
│   └── brand-logo.html          ← Logo lockups
└── ui_kits/
    ├── desktop/
    │   ├── README.md
    │   ├── index.html           ← Desktop app prototype
    │   └── *.jsx                ← Component files
    └── mobile/
        ├── README.md
        ├── index.html           ← Mobile app prototype
        └── *.jsx                ← Component files
```
