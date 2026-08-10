#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MOBILE_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
ENV_FILE=${E2E_LIBRARY_ENV_FILE:-"${MOBILE_ROOT}/e2e/.env.library.local"}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${WEBDAV_SOURCE_NAME:?Set WEBDAV_SOURCE_NAME to an existing app data source}"
: "${WEBDAV_PARENT_FOLDER:?Set WEBDAV_PARENT_FOLDER}"
: "${ONEDRIVE_SOURCE_NAME:?Set ONEDRIVE_SOURCE_NAME to an authenticated app data source}"
: "${ONEDRIVE_PARENT_FOLDER:?Set ONEDRIVE_PARENT_FOLDER}"
: "${E2E_LOCAL_EPUB_SOURCE:?Set E2E_LOCAL_EPUB_SOURCE}"
: "${E2E_REMOTE_EPUB_SOURCE:?Set E2E_REMOTE_EPUB_SOURCE}"

APP_ID=${APP_ID:-ryoumon.myreadermobile}
E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER:-MyReaderE2E}
E2E_RUN_ID=${E2E_RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}
IOS_SIMULATOR_UDID=${IOS_SIMULATOR_UDID:-$(xcrun simctl list devices booted -j | jq -r '
  [.devices[][] | select(.state == "Booted") | .udid] |
  if length == 1 then .[0] else empty end
')}
if [[ -z "$IOS_SIMULATOR_UDID" ]]; then
  echo "Set IOS_SIMULATOR_UDID when zero or multiple simulators are booted." >&2
  exit 1
fi
LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME:-"E2E-Local-${E2E_RUN_ID}"}
WEBDAV_LIBRARY_NAME=${WEBDAV_LIBRARY_NAME:-"E2E-WebDAV-${E2E_RUN_ID}"}
ONEDRIVE_LIBRARY_NAME=${ONEDRIVE_LIBRARY_NAME:-"E2E-OneDrive-${E2E_RUN_ID}"}
LOCAL_IMPORT_FILE_NAME=${LOCAL_IMPORT_FILE_NAME:-E2E-Local-Book.epub}
REMOTE_IMPORT_FILE_NAME=${REMOTE_IMPORT_FILE_NAME:-E2E-Remote-Book.epub}
LOCAL_BOOK_TITLE=${LOCAL_BOOK_TITLE:-${LOCAL_IMPORT_FILE_NAME%.epub}}
REMOTE_BOOK_TITLE=${REMOTE_BOOK_TITLE:-${REMOTE_IMPORT_FILE_NAME%.epub}}
EDITED_BOOK_TITLE=${EDITED_BOOK_TITLE:-"${LOCAL_BOOK_TITLE} Edited"}
EDITED_BOOK_AUTHOR=${EDITED_BOOK_AUTHOR:-"E2E Author"}

export APP_ID E2E_ROOT_FOLDER IOS_SIMULATOR_UDID
export E2E_LOCAL_EPUB_SOURCE E2E_REMOTE_EPUB_SOURCE
export LOCAL_IMPORT_FILE_NAME REMOTE_IMPORT_FILE_NAME
"${SCRIPT_DIR}/prepare-library-fixtures.sh"

DEVICE_ARGS=()
if [[ -n "${IOS_SIMULATOR_UDID:-}" ]]; then
  DEVICE_ARGS=(--device "$IOS_SIMULATOR_UDID")
fi

run_flow() {
  local flow=$1
  shift
  maestro test \
    --test-output-dir=e2e/.artifacts \
    "${DEVICE_ARGS[@]}" \
    "$flow" \
    -e "APP_ID=${APP_ID}" \
    -e "E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER}" \
    "$@"
}

cd "$MOBILE_ROOT"

run_flow e2e/flows/library/manage_local_myreader_library.yaml \
  -e "LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME}" \
  -e "LOCAL_IMPORT_FILE_NAME=${LOCAL_IMPORT_FILE_NAME}" \
  -e "LOCAL_BOOK_TITLE=${LOCAL_BOOK_TITLE}" \
  -e "EDITED_BOOK_TITLE=${EDITED_BOOK_TITLE}" \
  -e "EDITED_BOOK_AUTHOR=${EDITED_BOOK_AUTHOR}"

run_flow e2e/flows/library/manage_webdav_myreader_library.yaml \
  -e "WEBDAV_SOURCE_NAME=${WEBDAV_SOURCE_NAME}" \
  -e "WEBDAV_PARENT_FOLDER=${WEBDAV_PARENT_FOLDER}" \
  -e "WEBDAV_LIBRARY_NAME=${WEBDAV_LIBRARY_NAME}" \
  -e "REMOTE_IMPORT_FILE_NAME=${REMOTE_IMPORT_FILE_NAME}" \
  -e "REMOTE_BOOK_TITLE=${REMOTE_BOOK_TITLE}"

run_flow e2e/flows/library/manage_onedrive_myreader_library.yaml \
  -e "ONEDRIVE_SOURCE_NAME=${ONEDRIVE_SOURCE_NAME}" \
  -e "ONEDRIVE_PARENT_FOLDER=${ONEDRIVE_PARENT_FOLDER}" \
  -e "ONEDRIVE_LIBRARY_NAME=${ONEDRIVE_LIBRARY_NAME}" \
  -e "REMOTE_IMPORT_FILE_NAME=${REMOTE_IMPORT_FILE_NAME}" \
  -e "REMOTE_BOOK_TITLE=${REMOTE_BOOK_TITLE}"

echo "Library flows passed for E2E_RUN_ID=${E2E_RUN_ID}"
