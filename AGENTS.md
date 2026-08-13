# MyReader Agent Guide

> Unified reference for Claude Code, Cursor Agent, and other AI assistants working in this repo.

## Behavioral Guidelines

Apply these when writing, reviewing, or refactoring code:

1. **Simplicity First** — Minimum code that solves the problem. No speculative abstractions, no features beyond what was asked, no error handling for impossible scenarios.
2. **Surgical Changes** — Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only imports/variables/functions that *your* changes made unused.
3. **Goal-Driven Execution** — Define verifiable success criteria before implementing. Transform tasks into testable goals (e.g., "Write a test that reproduces the bug, then make it pass").
4. **Test Value Gate** — Before writing or changing a test, first decide whether it protects a durable behavior, contract, invariant, or meaningful regression. Do not apply TDD mechanically to every change. Avoid tests that merely mirror implementation details or freeze incidental styling that is expected to be tuned. Exact `padding`, margin, gap, pixel, or utility-class assertions are a canonical anti-pattern; validate those visual refinements in the rendered UI instead. Test styling only when it represents a durable product requirement, accessibility/safety constraint, or structural layout invariant (for example, a required column count).
5. **Think Before Coding** — State assumptions explicitly. If multiple interpretations exist, present them. If something is unclear, ask before implementing.
6. **Respect the Layering** — Dependencies must only flow downward. For mobile, see module rules in `.agents/rules/mobile.md` (`domain/` vs `features/` vs `repos/` vs `services/`). No upward imports, no bypassing layers.
7. **Verification Gate** — After code changes, run the full unit test suite for every touched package before reporting completion. Targeted tests may be used during development, but they do not replace the final full package unit test run. All tests must pass. If a suite cannot be run, state the exact command and blocker.

---

## Project Overview

MyReader is a local-first, cross-platform e-book reader based on Calibre library browsing. It is a pnpm workspaces monorepo with four packages:

- **`my-reader/`** — Desktop app (Tauri 2 + React 18 + Vite + Tailwind CSS 4)
- **`my-reader-mobile/`** — Mobile app (Expo SDK 55 + React Native 0.83 + NativeWind)
- **`packages/i18n/`** — Shared desktop/mobile localization resources (`@my-reader/i18n`).
- **`packages/tools/`** — Shared types and utils (`@my-reader/tools`).

---

## Design System

- **Mood**: Warm, composed, low-noise, content-led. Quiet editorial reading OS.
- **Colors**: Warm neutral palette with terracotta accent (`#C4622D`). Use semantic tokens (`--ink-1`, `--accent-soft`, `--danger`) — never raw Tailwind palette classes.
- **Design system scope**: The product design system controls **only colors**. Spacing, radius, fonts, and shadows are handled by Tailwind / NativeWind default utilities. Use `rounded-md`, `shadow-md`, `p-4`, `text-sm`, etc.
- **Typography**: App UI uses the default sans-serif stack. Reading font inside the reader is configured by the reader theme and is separate from the app UI design system.
- Shared brand rules and canonical design tokens live in `.agents/skills/myreader-design-system/colors_and_type.css`. Always read `docs/DESIGN.md` before making shared visual decisions. Run `node scripts/sync-design-tokens.mjs` after color token changes to sync desktop/mobile implementations.
- Sync tokens across packages after token changes: Run `node scripts/sync-design-tokens.mjs` command.

---

## Package Architecture

- **Mobile** (my-reader-mobile) → [`.agents/rules/mobile.md`](.agents/rules/mobile.md)
- **Desktop** (my-reader) → [`.agents/rules/desktop.md`](.agents/rules/desktop.md)

---
