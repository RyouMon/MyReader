# MyReader Desktop Design System

## Scope
- Applies to desktop clients (Windows, macOS, Linux via Tauri shell).
- Inherits shared brand tokens and typography roles from `DESIGN.tokens.json`.
- Prioritizes keyboard + pointer efficiency and sustained information scanning.

## Semantic Token Policy
- Desktop must use the shared semantic values from `DESIGN.tokens.json`.
- Desktop may define platform-specific density, multi-pane layout, pointer states, keyboard affordances, and desktop command patterns.
- Desktop must not redefine shared semantic color values, typography roles, or shared component meaning.

## Platform Principles
- Respect desktop mental models:
  - Hover, focus, right-click, multi-select, shortcuts.
- Do not emulate mobile-only navigation metaphors on desktop.
- Match host OS expectations for window behavior and command semantics.

## Layout and Spacing
- Base spacing system: 4pt grid with 8pt major rhythm.
- Recommended spacing scale:
  - 4, 8, 12, 16, 20, 24, 28, 32
- Density:
  - Default denser than mobile for scanning and multi-pane workflows.
- Multi-pane layout:
  - Support stable left navigation + content area.
  - Favor predictable resizing boundaries where applicable.

## Navigation and Information Architecture
- Primary navigation:
  - Sidebar or top-level segmented navigation depending on window width.
- Secondary navigation:
  - Tabs/sections for settings and library facets.
- Context menus:
  - Provide right-click menus for list and item actions where it improves speed.

## Motion System (Desktop)
- Intent: minimal, responsive, unobtrusive.
- Timing:
  - Micro interactions: 80-140ms
  - View transitions: 160-220ms
  - Dialog/sheet transitions: 180-240ms
- Curves:
  - Use restrained easing, avoid exaggerated spring behavior.
- Reduced motion:
  - Prefer opacity transitions and immediate state change for non-critical animation.

## Input Model and Focus
- Keyboard-first support:
  - Visible focus ring on actionable elements.
  - Reasonable tab order.
  - Discoverable shortcuts for core reading/library actions.
- Pointer states:
  - Hover and active states should be clear but subtle.

## Reading-Specific Desktop Rules
- Keep text column width and line length stable for long sessions.
- Prevent utility chrome from overpowering reading content.
- In reading mode, non-essential controls should recede visually.

## Table and List Density
- Library lists may use compact row heights if readability remains intact.
- Maintain clear selected, focused, and hovered row distinctions.
- Bulk actions should appear only when selection exists.

## Platform Implementation Notes
- Window controls:
  - Respect OS conventions for placement/behavior.
- Menu strategy:
  - Keep command placement consistent (do not relocate frequently used actions per screen).
- Undo/retry:
  - Prefer recoverable interactions for destructive actions.

## QA Checklist (Desktop)
- Mouse + keyboard workflows both fully usable.
- Focus visibility survives dark mode and dense layouts.
- Multi-pane layouts remain readable across common window sizes.
- Reading surface remains dominant in long-form reading mode.
