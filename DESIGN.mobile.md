# MyReader Mobile Design System

## Scope
- Applies to mobile clients (iOS, Android).
- Inherits shared brand tokens and typography roles from `DESIGN.tokens.json`.
- Prioritizes touch-first ergonomics and one-hand operation.

## Semantic Token Policy
- Mobile must use the shared semantic values from `DESIGN.tokens.json`.
- Mobile may define platform-specific spacing, motion, safe-area handling, and navigation patterns.
- Mobile must not redefine shared semantic color values, typography roles, or shared component meaning.

## Platform Principles
- iOS: align with Human Interface Guidelines navigation and gesture expectations.
- Android: align with Material navigation/back behavior and system affordances.
- Do not force desktop interaction patterns onto mobile.

## Layout and Spacing
- Base spacing system: 8pt grid with 4pt micro-adjustment.
- Recommended spacing scale:
  - 4, 8, 12, 16, 20, 24, 32
- Touch target:
  - Minimum interactive hit area: 44x44 pt (iOS), 48x48 dp (Android).
- Density:
  - Comfortable by default, compact only for data-dense library lists.

## Navigation Patterns
- Primary navigation:
  - Bottom navigation for top-level sections.
- Secondary navigation:
  - Stack navigation for drill-down flows (settings, source selection, folder selection).
- Back behavior:
  - Must respect platform back model.
  - Android hardware/system back should close top sheet/stack before exiting screen.

## Motion System (Mobile)
- Intent: functional and tactile.
- Timing:
  - Micro interactions: 120-180ms
  - Screen transitions: 220-300ms
  - Sheets/modals: 260-320ms
- Curves:
  - Prefer ease-out and platform-appropriate spring-like feel for entry.
- Reduced motion:
  - Disable non-essential transforms.
  - Keep opacity-only transitions where needed for state comprehension.

## Reading-Specific Mobile Rules
- Keep reading controls discoverable but low-noise.
- Avoid heavy overlays that reduce line focus.
- Theme switch and brightness/text scale controls should be reachable within 2 taps.

## Forms and Settings
- Use grouped list cards with clear section titles.
- Keep labels explicit and short.
- Inline helper text should explain effect, not implementation.
- Toggle rows must show both current state and consequence.

## Platform Implementation Notes
- Safe area:
  - Respect top/bottom insets on all full-height screens and bottom bars.
- Keyboard:
  - Avoid hidden primary actions when keyboard is shown.
- Gestures:
  - Avoid gesture conflicts between page swipe and system edge gestures.

## QA Checklist (Mobile)
- One-hand critical path works on standard phone sizes.
- Hit targets meet minimum dimensions.
- Back behavior is predictable in nested overlays.
- Dark mode readability is verified for long-form reading screens.
