---
name: cross-platform-ui-spec
description: Define implementation constraints for cross-platform UI work in this project. Use when building, refactoring, or reviewing desktop React/Tauri UI and mobile React Native/Expo UI, especially when users mention shadcn, Tailwind CSS, NativeWind, design system compliance, or platform-specific component choices.
---

# Cross-Platform UI Spec

## Purpose

Apply consistent implementation standards for desktop and mobile UI while keeping platform-native behavior and design system consistency.

## Trigger Scenarios

Use this skill when requests involve any of the following:
- desktop page or component implementation
- mobile screen or component implementation
- UI refactor for style consistency
- migration to shadcn or NativeWind
- design system compliance checks

## Global Rules

1. Always align with the project's design system tokens, spacing, typography, and component semantics.
2. Prefer composition over monolithic components.
3. Keep component APIs minimal and explicit.
4. Follow React best practices: predictable state flow, stable keys, controlled side effects, and accessible semantics.
5. When constraints conflict, prioritize:
   1) platform correctness, 2) design system consistency, 3) code maintainability.

## Desktop (React/Tauri/Web) Rules

### Component Strategy

1. Prefer shadcn base components for composition (e.g. button, dialog, sheet, dropdown, form primitives).
2. Avoid rebuilding primitives that already exist in shadcn unless there is a documented gap.
3. Keep wrappers thin; do not hide shadcn behavior behind unnecessary abstraction.

### Styling Strategy

1. Use Tailwind CSS for styling.
2. Keep styles token-driven and design-system aligned.
3. Avoid ad-hoc hardcoded values unless required by a one-off visual fix; when used, annotate rationale in PR notes.

### React Quality Bar

1. Keep render logic pure and derive UI from state.
2. Use memoization only when it solves measured or obvious recomputation issues.
3. Preserve accessibility semantics (labels, roles, keyboard interactions, focus handling).

## Mobile (React Native/Expo) Rules

### Component Strategy

1. Use native UI primitives as the base (`View`, `Text`, `Pressable`, `TextInput`, platform-native patterns).
2. Do not directly port web-only interaction patterns that break mobile ergonomics.
3. Respect platform conventions for navigation, touch targets, feedback, and layout behavior.

### Styling Strategy

1. Use NativeWind for styling.
2. Keep class usage mapped to design system tokens and semantic intent.
3. Avoid mixing unrelated style systems in the same component unless required for interop.

### React Native + Expo Quality Bar

1. Follow React Native and Expo best practices for performance and UX.
2. Minimize unnecessary re-renders in list-heavy or animation-heavy screens.
3. Prefer Expo-supported APIs and patterns before introducing custom native complexity.

## Execution Checklist

Copy this checklist when implementing UI work:

```md
- [ ] Platform identified (desktop / mobile / both)
- [ ] Design system tokens and semantics applied
- [ ] Desktop: shadcn base components used where applicable
- [ ] Desktop: Tailwind CSS used for styling
- [ ] Mobile: native primitives used as base
- [ ] Mobile: NativeWind used for styling
- [ ] React/React Native/Expo best practices reviewed
- [ ] Accessibility and interaction quality checked
```

## Output Expectations

When delivering code, explicitly confirm:
1. Which platform rules were applied
2. Which base components were chosen and why
3. Any intentional rule deviations and rationale
