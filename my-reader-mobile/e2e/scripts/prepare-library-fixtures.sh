#!/usr/bin/env bash
set -euo pipefail

: "${E2E_LOCAL_EPUB_SOURCE:?Set E2E_LOCAL_EPUB_SOURCE to a readable EPUB path}"
: "${E2E_REMOTE_EPUB_SOURCE:?Set E2E_REMOTE_EPUB_SOURCE to a large readable EPUB path}"
: "${LOCAL_IMPORT_FILE_NAME:?Set LOCAL_IMPORT_FILE_NAME}"
: "${REMOTE_IMPORT_FILE_NAME:?Set REMOTE_IMPORT_FILE_NAME}"

E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER:-MyReaderE2E}
IOS_SIMULATOR_UDID=${IOS_SIMULATOR_UDID:-}

if [[ -z "$IOS_SIMULATOR_UDID" ]]; then
  IOS_SIMULATOR_UDID=$(xcrun simctl list devices booted -j | jq -r '
    [.devices[][] | select(.state == "Booted") | .udid] |
    if length == 1 then .[0] else empty end
  ')
fi

if [[ -z "$IOS_SIMULATOR_UDID" ]]; then
  echo "Set IOS_SIMULATOR_UDID when zero or multiple simulators are booted." >&2
  exit 1
fi

for value in "$E2E_ROOT_FOLDER" "$LOCAL_IMPORT_FILE_NAME" "$REMOTE_IMPORT_FILE_NAME"; do
  if [[ -z "$value" || "$value" == *"/"* || "$value" == "." || "$value" == ".." ]]; then
    echo "E2E folder and fixture names must be non-empty single path components." >&2
    exit 1
  fi
done

for source in "$E2E_LOCAL_EPUB_SOURCE" "$E2E_REMOTE_EPUB_SOURCE"; do
  if [[ ! -f "$source" ]]; then
    echo "Fixture does not exist: $source" >&2
    exit 1
  fi
  unzip -tq "$source" >/dev/null
done

SIMULATOR_APP_GROUPS="${HOME}/Library/Developer/CoreSimulator/Devices/${IOS_SIMULATOR_UDID}/data/Containers/Shared/AppGroup"
DOWNLOADS_ROOT=$(find "$SIMULATOR_APP_GROUPS" -type d -path '*/File Provider Storage/Downloads' -print -quit)
if [[ -z "$DOWNLOADS_ROOT" ]]; then
  echo "Could not find the iOS simulator Files Downloads directory." >&2
  exit 1
fi

FIXTURE_ROOT="${DOWNLOADS_ROOT}/${E2E_ROOT_FOLDER}/Fixtures"
mkdir -p "$FIXTURE_ROOT"
cp -f "$E2E_LOCAL_EPUB_SOURCE" "${FIXTURE_ROOT}/${LOCAL_IMPORT_FILE_NAME}"
cp -f "$E2E_REMOTE_EPUB_SOURCE" "${FIXTURE_ROOT}/${REMOTE_IMPORT_FILE_NAME}"

echo "Prepared library fixtures in ${FIXTURE_ROOT}"
