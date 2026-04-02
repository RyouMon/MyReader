---
name: myreader-default-skill-routing
description: >-
  Routes MyReader work to the correct bundled domain skills: loads Vercel React
  best practices, shadcn, and Tailwind design-system skills for frontend code
  under my-reader/src/, and the Tauri v2 skill for my-reader/src-tauri/. Use at
  the start of every conversation turn, task, or code change in this repository
  when the user asks about MyReader, or when edits touch those paths.
---

# MyReader default skill routing

## Mandatory behavior

At the beginning of each turn, before substantive work:

1. **Apply this skill** so downstream skills are selected correctly.
2. **Read** the SKILL.md files listed below for the code areas involved in the request or diff. If both areas apply, read all relevant bundles.

## Frontend (`my-reader/src/`)

When the user’s question, task, or changed files live under **`my-reader/src/`** (React / Vite frontend, UI, hooks, lib used by the app):

| Order | Skill | Path |
| ----- | ----- | ---- |
| 1 | Vercel React best practices | [.agents/skills/vercel-react-best-practices/SKILL.md](../vercel-react-best-practices/SKILL.md) |
| 2 | shadcn/ui | [.agents/skills/shadcn/SKILL.md](../shadcn/SKILL.md) |
| 3 | Tailwind design system | [.agents/skills/tailwind-design-system/SKILL.md](../tailwind-design-system/SKILL.md) |

Follow those skills for implementation, review, and refactors in that tree.

## Tauri backend (`my-reader/src-tauri/`)

When the user’s question, task, or changed files live under **`my-reader/src-tauri/`** (Rust, `tauri.conf.json`, capabilities, IPC):

| Skill | Path |
| ----- | ---- |
| Tauri v2 | [.agents/skills/tauri-v2/SKILL.md](../tauri-v2/SKILL.md) |

## Mixed or unclear scope

- **Edits in both trees** in one task: load the **frontend bundle** and **Tauri v2**.
- **Repo-wide or non-path-specific questions** (e.g. “how should we structure X?”): infer from the topic (UI vs desktop shell/Rust) and load the matching skills; if both are relevant, load both bundles.

## Out of scope

Paths outside `my-reader/src/` and `my-reader/src-tauri/` are not covered by this routing table; use other project or global skills as usual.
