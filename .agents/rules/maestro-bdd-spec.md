---
paths:
  - "my-reader-mobile/e2e/**/*"
---

# Maestro flow conventions

Read [the executable flow runbook](../../my-reader-mobile/e2e/README.md).
Use native YAML flows/subflows; do not add a second Gherkin/step-definition layer.

- Scenarios are independent; reusable helpers use `tags: [skip]`.
- Prefer visible text/accessibility labels and deterministic behavior assertions.
- Fix missing accessibility semantics before adding test-only selectors.
- Keep fixtures outside Expo routes/assets; use the local fixture servers.
- Default to simulators. Mark unstable flows `wip` and report exclusions explicitly.
- A flow has one config/command document pair; create another flow for another scenario.
