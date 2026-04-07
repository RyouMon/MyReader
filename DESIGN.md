# MyReader Design System (Shared)

## Product Context
- What this is: A local-first, cross-platform reading product rooted in Calibre workflows, focused on seamless continuation across desktop and mobile.
- Who it's for: Primary users are heavy readers who care about long-session readability, continuity, and calm interaction.
- Space: Reading app / personal library manager.
- Product mode: Content-first product with utility surfaces.

## Platform Strategy
- Shared layer: aesthetic direction, brand tone, semantic colors, typography roles, and accessibility floor.
- Platform layers:
  - `DESIGN.mobile.md` defines touch-first spacing, motion, and navigation rules.
  - `DESIGN.desktop.md` defines pointer/keyboard-first spacing, density, and interaction rules.
- Precedence:
  - Shared decisions live here.
  - Platform-specific implementation details must follow each platform document.

## Aesthetic Direction
- Direction: Quiet Editorial Reading OS.
- Mood: Warm, composed, low-noise, content-led.
- Intent: The UI should feel like a good reading environment first, tool chrome second.

## Brand Tone
- Calm, precise, respectful.
- Avoid noisy language and aggressive promotional copy.
- Microcopy should be short, literal, and recovery-oriented in error states.

## Typography (Shared Roles)
- Display/Section title: `Noto Serif SC` (CN), fallback `Lora` for Latin-heavy contexts.
- Body/UI controls: `Noto Sans SC` (CN) + `DM Sans`.
- Data/code: `JetBrains Mono`.
- Rules:
  - Keep role separation stable across platforms.
  - Do not switch to novelty fonts for feature screens.

## Color System (Semantic Tokens)
- Canonical token file:
  - `DESIGN.tokens.json`
- Light:
  - `--bg`: `#F7F3EC`
  - `--surface`: `#FFFDF8`
  - `--text`: `#3B322B`
  - `--text-muted`: `#7D6F64`
  - `--primary`: `#A86A3A`
  - `--primary-strong`: `#8D542B`
  - `--border`: `#E6DDD1`
  - `--success`: `#2F8F68`
  - `--warning`: `#B27A2A`
  - `--error`: `#B64A4A`
- Dark:
  - `--bg`: `#1C1916`
  - `--surface`: `#25211D`
  - `--text`: `#EEE7DD`
  - `--text-muted`: `#B8AB9D`
  - `--primary`: `#C9874E`
  - `--border`: `#3A332D`
  - `--success`: `#55A884`
  - `--warning`: `#CF9A4F`
  - `--error`: `#CF6A6A`

## Source Of Truth
- Documentation source of truth:
  - `DESIGN.tokens.json` is the canonical, platform-agnostic source of truth for semantic tokens and typography roles.
  - `DESIGN.md` explains how those tokens should be used, and defines the shared design semantics around them.
- Code source of truth:
  - `my-reader/src/design-tokens.css` is the implementation source of truth for shared UI tokens in the current app codebase.
  - Values in that file must match `DESIGN.tokens.json`.
  - `my-reader/src/index.css` may map those tokens into framework-specific aliases such as shadcn/Tailwind variables, but should not redefine the canonical design values.

## Shape and Elevation (Semantic)
- Radius tiers:
  - `radius-sm`: minor controls and chips
  - `radius-md`: cards and list groups
  - `radius-lg`: hero/grouped containers
- Shadow tiers:
  - `elev-1`: subtle separation in dense views
  - `elev-2`: active surfaces, dialogs, sheets
- Do not hardcode per-component values here. Platform docs map tiers to concrete values.

## Accessibility Floor (Shared)
- Text contrast:
  - Body text: WCAG AA minimum.
  - Critical controls and warnings: target stronger than AA when possible.
- Minimum readable size:
  - Body should not drop below platform baseline defaults.
- Focus and state:
  - Interactive states must be visually distinct in all themes.
- Reduced motion:
  - Platform docs must define reduced-motion behavior for all non-essential animation.

## Component Semantics (Shared)
- Primary action: warm primary color, highest visual prominence.
- Secondary action: low emphasis but clear affordance.
- Destructive action: explicit error hue and confirmation flow.
- Reading progress indicators:
  - Must be glanceable and never visually compete with core text content.

## Decision Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-07 | Split into shared + mobile + desktop design system docs | Preserve brand coherence while enforcing platform-native best practices |
| 2026-04-07 | Quiet editorial direction with warm neutral palette | Better long-session readability and stronger reading-product identity |
