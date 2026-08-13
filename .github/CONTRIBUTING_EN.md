<div align="right"><a href="./CONTRIBUTING.md">简体中文</a></div>

# Contributing

Thank you for helping improve MyReader. The project is currently maintained by one person, so clear, focused, and verifiable contributions are the easiest to merge.

## Before You Start

- For bugs, behavior changes, or larger features, open an [Issue](https://github.com/RyouMon/MyReader/issues) first and describe the scenario, platform, and expected result.
- Small documentation fixes may be submitted directly as pull requests.
- The roadmap is not a commitment. Discuss the design first when proposing a new format, sync protocol, data model, or major UI redesign.
- Do not include real libraries, books, credentials, access tokens, or private service addresses in issues, logs, screenshots, or test fixtures.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT_EN.md). Do not report vulnerabilities in a public issue; follow the [Security Policy](./SECURITY_EN.md) instead.

## Development Environment

Complete the first-time setup in the [Development Guide](../docs/DEVELOPMENT_EN.md). The repository primarily requires Node.js 22+, pnpm 11.7.0, and Rust stable. Native mobile development additionally requires Xcode 16+ or Android Studio with the Android SDK.

## Change Guidelines

- Keep changes small and explicit; do not refactor unrelated code along the way.
- Respect the layering described in the [Architecture Guide](../docs/ARCHITECTURE_EN.md) and each package. Platform adapters must not duplicate business rules already owned by core.
- Calibre `metadata.db` is always read-only.
- Maintain both Simplified Chinese and English UI copy and preserve accessibility semantics.
- New tests should protect stable behavior, contracts, or regressions, rather than fragile pixel or styling details.
- If you change the database, generated bindings, or design color tokens, run the corresponding generation steps in the [Development Guide](../docs/DEVELOPMENT_EN.md) and commit the required outputs.

## Verification Before Submission

Run at least the complete unit test suite for every changed package. Cross-platform or shared-core changes will usually require:

```bash
pnpm --filter @my-reader/fonts test
pnpm --filter @my-reader/i18n test
pnpm --filter @my-reader/tools test
pnpm --filter my-reader run test:unit
pnpm --filter my-reader-mobile exec jest --runInBand
cargo test --workspace
```

Also run the lint, type-check, build, or E2E commands relevant to your change. If a check cannot be run, state the command, environment, and blocker in the pull request.

## Pull Requests

Include the following in the description:

- the problem and user-visible result;
- the scope of the change and anything intentionally left out;
- verification commands and results;
- desktop or mobile screenshots or recordings for UI changes;
- any migration, compatibility, privacy, or third-party licensing impact.

Use Conventional Commits, such as `fix(mobile): preserve imported filename` or `docs: clarify release channels`.

By submitting a contribution, you confirm that you have the right to submit it and agree that it may be distributed under this repository's [MIT License](../LICENSE).
