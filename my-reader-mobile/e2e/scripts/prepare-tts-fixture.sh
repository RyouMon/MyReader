#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MOBILE_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
SOURCE_ROOT="${MOBILE_ROOT}/e2e/fixtures/tts-book"
OUTPUT_DIR=${TTS_FIXTURE_OUTPUT_DIR:-"${MOBILE_ROOT}/e2e/.artifacts"}
OUTPUT_PATH="${OUTPUT_DIR}/MyReader-TTS.epub"
STAGING_ROOT=$(mktemp -d)
trap 'rm -rf "$STAGING_ROOT"' EXIT

mkdir -p "$OUTPUT_DIR" "$STAGING_ROOT/EPUB" "$STAGING_ROOT/META-INF"
printf 'application/epub+zip' > "$STAGING_ROOT/mimetype"
cp -R "$SOURCE_ROOT/EPUB/." "$STAGING_ROOT/EPUB/"
cp -R "$SOURCE_ROOT/META-INF/." "$STAGING_ROOT/META-INF/"
rm -f "$OUTPUT_PATH"
(
  cd "$STAGING_ROOT"
  zip -X0 "$OUTPUT_PATH" mimetype >/dev/null
  zip -Xr9 "$OUTPUT_PATH" META-INF EPUB >/dev/null
)
unzip -tq "$OUTPUT_PATH" >/dev/null
printf 'Built TTS fixture: %s\n' "$OUTPUT_PATH"
if [[ ${1:-} == --build-only ]]; then
  exit 0
fi

TTS_IOS_UDID=${TTS_IOS_SIMULATOR_UDID:-$(xcrun simctl list devices booted -j 2>/dev/null | jq -r '
  [.devices[][] | select(.state == "Booted") | .udid] |
  if length == 1 then .[0] else empty end
' 2>/dev/null || true)}
if [[ -n "$TTS_IOS_UDID" ]]; then
  TTS_GROUPS_ROOT="${HOME}/Library/Developer/CoreSimulator/Devices/${TTS_IOS_UDID}/data/Containers/Shared/AppGroup"
  TTS_DOWNLOADS_ROOT=$(find "$TTS_GROUPS_ROOT" -type d -path '*/File Provider Storage/Downloads' -print -quit)
  if [[ -n "$TTS_DOWNLOADS_ROOT" ]]; then
    mkdir -p "$TTS_DOWNLOADS_ROOT/MyReaderTTS/Fixtures"
    cp -f "$OUTPUT_PATH" "$TTS_DOWNLOADS_ROOT/MyReaderTTS/Fixtures/MyReader-TTS.epub"
    printf 'Prepared iOS fixture: %s\n' "$TTS_DOWNLOADS_ROOT/MyReaderTTS/Fixtures/MyReader-TTS.epub"
  fi
fi

if command -v adb >/dev/null && [[ $(adb devices | awk 'NR > 1 && $2 == "device" { count += 1 } END { print count + 0 }') -eq 1 ]]; then
  adb shell mkdir -p /sdcard/Download/MyReaderTTS/Fixtures
  adb push "$OUTPUT_PATH" /sdcard/Download/MyReaderTTS/Fixtures/MyReader-TTS.epub >/dev/null
  printf 'Prepared Android fixture: %s\n' '/sdcard/Download/MyReaderTTS/Fixtures/MyReader-TTS.epub'
fi
