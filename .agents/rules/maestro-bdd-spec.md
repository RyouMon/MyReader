---
paths:
  - "my-reader-mobile/e2e/**/*"
---

# Maestro flow conventions

Read [the executable flow runbook](../../my-reader-mobile/e2e/README.md).
Use native YAML flows/subflows; do not add a second Gherkin/step-definition layer.

- Daily development uses a dev build with direct simulator/device interaction.
- E2E development, release validation and risk-driven checks use standalone Release builds.
- Release scenarios start from isolated state; helpers are reached from `release-suite.json`.
- Prefer visible text/accessibility labels and deterministic behavior assertions.
- Fix missing accessibility semantics before adding test-only selectors.
- Keep fixtures outside Expo routes/assets; use the local fixture servers.
- Use dedicated simulators and locally provisioned fixtures. Fix unstable flows; do not
  exclude them, mark them `wip`, add optional assertions or retry whole scenarios.
- Release runs the complete manifest on Android, iPhone and iPad. iOS native settings
  XCTest is part of the same gate. A missing, skipped or failed result blocks publication.
- A flow has one config/command document pair; create another flow for another scenario.
