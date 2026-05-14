
## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/) with project-specific scope rules.

### Scope

Prefix with package: `desktop/<area>`, `mobile/<area>`, or `shared/<area>`.

Example:
- `desktop/reader` — Desktop reader
- `mobile/reader` — Mobile reader
- `shared/sync` — Shared sync engine

Omit scope only for repo-wide changes (CI, root docs).

### Subject

`<type>(<scope>): <imperative summary>` — ≤50 chars, no trailing period.

Types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`, `style`, `revert`.

The summary states **what was done** at a high level (e.g., "fix page turn requiring double click", "add spread mode toggle").

### Body

Skip when the subject is self-explanatory. Otherwise:

1. **Problem / pain point first** — describe the bug, broken behavior, or motivation.
2. **Then the fix / change** — explain what was modified and why it resolves the problem.

Use terse, caveman-style language. No "This commit", "I", "we". Bullets with `-`.

---
