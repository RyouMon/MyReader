---
paths:
  - "my-reader-mobile/**/*"
---

# Mobile test routing

The maintained test strategy and commands live in [QUALITY.md](../../docs/QUALITY.md).
Use Jest/jest-expo for JS behavior, native unit tests for Swift/Kotlin adapters, and
[Maestro](../../my-reader-mobile/e2e/README.md) for simulator user flows.

- Keep tests outside `src/app/`; Expo Router treats that directory as routes.
- Colocate mobile `*.test.ts(x)` with the behavior they protect.
- Mock native boundaries, not the business behavior under test.
- Run the full mobile suite after changes; targeted tests do not replace it.
- Coverage thresholds come from executable configuration, not duplicated examples here.
