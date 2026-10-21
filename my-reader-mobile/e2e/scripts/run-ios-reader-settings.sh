#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
E2E_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
: "${IOS_SIMULATOR_UDID:?Set IOS_SIMULATOR_UDID to the target simulator.}"
APP_ID=${APP_ID:-ryoumon.myreadermobile}
RUN_ROOT="${E2E_REPORT_DIR:-${E2E_ROOT}/.artifacts}/ios-settings-$(date -u +%Y%m%d-%H%M%S)"

# XCTest queries sheet controls directly. Maestro's app snapshot omits this
# half-sheet over a fullscreen reader: mobile-dev-inc/Maestro#1924.
command -v xcodegen >/dev/null || {
  echo "Install XcodeGen with: brew install xcodegen" >&2
  exit 1
}
mkdir -p "$RUN_ROOT"
cp "${E2E_ROOT}/ios/project.yml" "${E2E_ROOT}/ios/ReaderSettingsUITests.swift" "$RUN_ROOT/"
xcodegen generate --spec "${RUN_ROOT}/project.yml"
TEST_RUNNER_TARGET_APP_ID="$APP_ID" xcodebuild test \
  -project "${RUN_ROOT}/MyReaderE2E.xcodeproj" \
  -scheme MyReaderE2E \
  -destination "platform=iOS Simulator,id=${IOS_SIMULATOR_UDID}" \
  -jobs 1 \
  -resultBundlePath "${RUN_ROOT}/ReaderSettings.xcresult"
xcrun xcresulttool get test-results summary \
  --path "${RUN_ROOT}/ReaderSettings.xcresult" --compact > "${RUN_ROOT}/summary.json"
node --input-type=module - "${RUN_ROOT}/summary.json" "${E2E_ROOT}/../../scripts/release/junit.mjs" <<'JS'
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
const { assertPassingXCTest } = await import(pathToFileURL(process.argv[3]))
assertPassingXCTest(JSON.parse(readFileSync(process.argv[2], "utf8")), 1)
JS
