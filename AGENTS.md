# MyReader Agent Guide

> Unified reference for Claude Code, Cursor Agent, and other AI assistants working in this repo.

## Behavioral Guidelines

Apply these when writing, reviewing, or refactoring code:

1. **Simplicity First** — Minimum code that solves the problem. No speculative abstractions, no features beyond what was asked, no error handling for impossible scenarios.
2. **Surgical Changes** — Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only imports/variables/functions that *your* changes made unused.
3. **Goal-Driven Execution** — Define verifiable success criteria before implementing. Transform tasks into testable goals (e.g., "Write a test that reproduces the bug, then make it pass").
4. **Think Before Coding** — State assumptions explicitly. If multiple interpretations exist, present them. If something is unclear, ask before implementing.

---

## Project Overview

MyReader is a local-first, cross-platform e-book reader based on Calibre library browsing. It has three independent packages (not a workspace monorepo):

- **`my-reader/`** — Desktop app (Tauri 2 + React 18 + Vite + Tailwind CSS 4)
- **`my-reader-mobile/`** — Mobile app (Expo SDK 55 + React Native 0.83 + NativeWind)
- **`my-reader-tools/`** — Shared types and utils.

---

## Design System

- **Mood**: Warm, composed, low-noise, content-led. Quiet editorial reading OS.
- **Colors**: Warm neutral palette with terracotta accent (`#C4622D`). Use semantic tokens (`--ink-1`, `--accent-soft`, `--danger`) — never raw Tailwind palette classes.
- **Typography**: Serif for display/headings (`Noto Serif SC`, `Lora`), sans-serif for UI (`Noto Sans SC`, `DM Sans`), `Merriweather` for reading body.
- **Radius tokens**: `xs: 2px`, `sm: 4px`, `md: 8px`, `lg: 12px`, `xl: 20px`. Do not mix sharp and heavily-rounded corners in the same view.
- **Role separation**: Display = serif, UI = sans, reading font = reader only.
- Shared brand rules and canonical design tokens live in `.agents/skills/myreader-design-system/colors_and_type.css`. Always read `DESIGN.md` before making shared visual decisions. Run `node scripts/sync-design-tokens.mjs` after token changes to sync desktop/mobile implementations.
- Sync tokens across packages after token changes: Run `node scripts/sync-design-tokens.mjs` commmand.

---
