# MyReader Agent Guide

> Unified reference for Claude Code, Cursor Agent, and other AI assistants working in this repo.

## Behavioral Guidelines

Apply these when writing, reviewing, or refactoring code:

1. **Simplicity First** — Minimum code that solves the problem. No speculative abstractions, no features beyond what was asked, no error handling for impossible scenarios.
2. **Surgical Changes** — Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only imports/variables/functions that *your* changes made unused.
3. **Goal-Driven Execution** — Define verifiable success criteria before implementing. Transform tasks into testable goals (e.g., "Write a test that reproduces the bug, then make it pass").
4. **Test Value Gate** — Before writing or changing a test, first decide whether it protects a durable behavior, contract, invariant, or meaningful regression. Do not apply TDD mechanically to every change. Avoid tests that merely mirror implementation details or freeze incidental styling that is expected to be tuned. Exact `padding`, margin, gap, pixel, or utility-class assertions are a canonical anti-pattern; validate those visual refinements in the rendered UI instead. Test styling only when it represents a durable product requirement, accessibility/safety constraint, or structural layout invariant (for example, a required column count).
5. **Think Before Coding** — State assumptions explicitly. If multiple interpretations exist, present them. If something is unclear, ask before implementing.
6. **Respect the Layering** — Dependencies must only flow downward. For mobile, see module rules in `.agents/rules/mobile.md` (`domain/`, `features/`, `services/`; persistence belongs to Rust Core). No upward imports, no bypassing layers.
7. **Verification Gate** — After code changes, run the full unit test suite for every touched package before reporting completion. Targeted tests may be used during development, but they do not replace the final full package unit test run. All tests must pass. If a suite cannot be run, state the exact command and blocker.
8. **PR Gate** — Required checks `QA` and `Unit tests` must pass before merge. Coverage runs independently as a non-blocking report; never suppress unit-test failures to make coverage advisory. Leave merging to human review.

---

## Project Overview

MyReader is a local-first, cross-platform e-book reader based on Calibre library browsing. It is a pnpm workspaces monorepo with five JavaScript packages and a shared Cargo workspace:

- **`my-reader/`** — Desktop app (Tauri + React + Vite + Tailwind CSS)
- **`my-reader-mobile/`** — Mobile app (Expo + React Native + NativeWind)
- **`packages/fonts/`** — Shared reader fonts and catalog.
- **`my-reader-core/`** — Shared Rust business backend; mobile FFI and Tauri adapters are Cargo workspace members.
- **`packages/i18n/`** — Shared desktop/mobile localization resources (`@my-reader/i18n`).
- **`packages/tools/`** — Shared types and utils (`@my-reader/tools`).

Dependency versions are authoritative in each package's manifest and lockfile.

---

## Design System

- **Mood**: Warm, composed, low-noise, content-led. Quiet editorial reading OS.
- **Colors**: Warm neutral palette with terracotta accent (`#C4622D`). Use semantic tokens (`--ink-1`, `--accent-soft`, `--danger`) — never raw Tailwind palette classes.
- **Design system scope**: The product design system controls **only colors**. Spacing, radius, fonts, and shadows are handled by Tailwind / NativeWind default utilities. Use `rounded-md`, `shadow-md`, `p-4`, `text-sm`, etc.
- **Typography**: App UI uses the default sans-serif stack. Reading font inside the reader is configured by the reader theme and is separate from the app UI design system.
- Shared brand rules and canonical design tokens live in `.agents/skills/myreader-design-system/colors_and_type.css`. Always read `docs/DESIGN.md` before making shared visual decisions. Run `node scripts/sync-design-tokens.mjs` after color token changes to sync desktop/mobile implementations.

---

## Package Architecture

- **Mobile** (my-reader-mobile) → [`.agents/rules/mobile.md`](.agents/rules/mobile.md)
- **Desktop** (my-reader) → [`.agents/rules/desktop.md`](.agents/rules/desktop.md)

---

## Quality and documentation

- Run `pnpm qa` for static gates and `pnpm test:unit` for all JavaScript package suites.
  Coverage, mutation, Cargo and native checks are described in [docs/QUALITY.md](docs/QUALITY.md).
- Read package rules explicitly when working from the repo root; do not assume every agent loads
  `.agents/rules/` automatically. Claude links that directory; Cursor uses thin routing files.
- Current architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). ADRs record decisions
  and superseded history; they are not all current implementation instructions.
- Project rules take precedence over generic imported skills. Load a skill only for the relevant task;
  preserve upstream provenance in `skills-lock.json`. Keep project-specific constraints here or in
  linked rules instead of copying them into every skill.
- Baselines record existing debt. Never regenerate or relax a baseline/threshold just to make a
  check green; explain and review each increase. A baseline pass does not mean zero debt.
