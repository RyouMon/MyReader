#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MOBILE_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
REPO_ROOT=$(cd "${MOBILE_ROOT}/.." && pwd)

APP_ID=${APP_ID:-ryoumon.myreadermobile}
E2E_RUN_ID=${E2E_RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}
E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER:-"MyReaderE2E-${E2E_RUN_ID}"}
LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME:-"E2E-Formats-${E2E_RUN_ID}"}
IOS_SIMULATOR_UDID=${IOS_SIMULATOR_UDID:-$(xcrun simctl list devices booted -j | jq -r '
  [.devices[][] | select(.state == "Booted") | .udid] |
  if length == 1 then .[0] else empty end
')}

if [[ -z "$IOS_SIMULATOR_UDID" ]]; then
  echo "Set IOS_SIMULATOR_UDID when zero or multiple simulators are booted." >&2
  exit 1
fi

EPUB_SOURCE=${EPUB_SOURCE:-"${REPO_ROOT}/calibre-library/Example1/Herman Melville/Moby-Dick (3)/Moby-Dick - Herman Melville.epub"}
PDF_SOURCE=${PDF_SOURCE:-"${REPO_ROOT}/calibre-library/Example1/Jane Austen/Pride and Prejudice (5)/Pride and Prejudice - Jane Austen.pdf"}
CBZ_SOURCE=${CBZ_SOURCE:-"${REPO_ROOT}/calibre-library/Example1/Frank King/Bobby Make-Believe (1915) (2)/Bobby Make-Believe (1915) - Frank King.cbz"}
EPUB_IMPORT_FILE_NAME=${EPUB_IMPORT_FILE_NAME:-Moby-Dick.epub}
PDF_IMPORT_FILE_NAME=${PDF_IMPORT_FILE_NAME:-Pride-and-Prejudice.pdf}
PDF_PICKER_FILE_NAME=${PDF_PICKER_FILE_NAME:-Pride-and-Prejudice(.pdf)?}
CBZ_IMPORT_FILE_NAME=${CBZ_IMPORT_FILE_NAME:-Bobby-Make-Believe.cbz}
EPUB_BOOK_TITLE=${EPUB_BOOK_TITLE:-Moby-Dick}
EPUB_BOOK_AUTHOR=${EPUB_BOOK_AUTHOR:-Herman Melville}
PDF_BOOK_TITLE=${PDF_BOOK_TITLE:-Pride and Prejudice}
PDF_BOOK_AUTHOR=${PDF_BOOK_AUTHOR:-Jane Austen}
CBZ_BOOK_TITLE=${CBZ_BOOK_TITLE:-Bobby-Make-Believe}

for source in "$EPUB_SOURCE" "$PDF_SOURCE" "$CBZ_SOURCE"; do
  if [[ ! -f "$source" ]]; then
    echo "Fixture does not exist: $source" >&2
    exit 1
  fi
done

SIMULATOR_APP_GROUPS="${HOME}/Library/Developer/CoreSimulator/Devices/${IOS_SIMULATOR_UDID}/data/Containers/Shared/AppGroup"
DOWNLOADS_ROOT=$(find "$SIMULATOR_APP_GROUPS" -type d -path '*/File Provider Storage/Downloads' -print -quit)
if [[ -z "$DOWNLOADS_ROOT" ]]; then
  echo "Could not find the iOS simulator Files Downloads directory." >&2
  exit 1
fi

FIXTURE_ROOT="${DOWNLOADS_ROOT}/${E2E_ROOT_FOLDER}/Fixtures"
mkdir -p "$FIXTURE_ROOT"
copy_fixture() {
  local source=$1
  local target=$2
  if ! cmp -s "$source" "$target"; then
    cp -f "$source" "$target"
  fi
}
copy_fixture "$EPUB_SOURCE" "${FIXTURE_ROOT}/${EPUB_IMPORT_FILE_NAME}"
copy_fixture "$PDF_SOURCE" "${FIXTURE_ROOT}/${PDF_IMPORT_FILE_NAME}"
copy_fixture "$CBZ_SOURCE" "${FIXTURE_ROOT}/${CBZ_IMPORT_FILE_NAME}"

DEVICE_ARGS=(--device "$IOS_SIMULATOR_UDID")
COMMON_ENV=(
  -e "APP_ID=${APP_ID}"
  -e "E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER}"
  -e "EPUB_BOOK_TITLE=${EPUB_BOOK_TITLE}"
  -e "PDF_BOOK_TITLE=${PDF_BOOK_TITLE}"
  -e "CBZ_BOOK_TITLE=${CBZ_BOOK_TITLE}"
)

cd "$MOBILE_ROOT"
maestro test --test-output-dir=e2e/.artifacts "${DEVICE_ARGS[@]}" \
  e2e/flows/library/import_local_supported_formats.yaml \
  "${COMMON_ENV[@]}" \
  -e "LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME}" \
  -e "EPUB_IMPORT_FILE_NAME=${EPUB_IMPORT_FILE_NAME}" \
  -e "EPUB_BOOK_AUTHOR=${EPUB_BOOK_AUTHOR}" \
  -e "PDF_PICKER_FILE_NAME=${PDF_PICKER_FILE_NAME}" \
  -e "PDF_BOOK_AUTHOR=${PDF_BOOK_AUTHOR}" \
  -e "CBZ_IMPORT_FILE_NAME=${CBZ_IMPORT_FILE_NAME}"

APP_DATA_CONTAINER=$(xcrun simctl get_app_container "$IOS_SIMULATOR_UDID" "$APP_ID" data)
CONFIG_PATH="${APP_DATA_CONTAINER}/Documents/config.json"
LIBRARY_ID=$(jq -r --arg name "$LOCAL_LIBRARY_NAME" '
  [.libraries[] | select(.name == $name and .sourceType == "local")] |
  last.id // empty
' "$CONFIG_PATH")
if [[ -z "$LIBRARY_ID" ]]; then
  echo "Could not resolve managed library ${LOCAL_LIBRARY_NAME} from ${CONFIG_PATH}." >&2
  exit 1
fi
LIBRARY_ROOT="${APP_DATA_CONTAINER}/Documents/libraries/${LIBRARY_ID}"
if [[ ! -d "$LIBRARY_ROOT" ]]; then
  echo "Managed library container does not exist: ${LIBRARY_ROOT}" >&2
  exit 1
fi
COVER_COUNT=$(find "${LIBRARY_ROOT}/Books" -type f -name cover.jpg | wc -l | tr -d ' ')
if [[ "$COVER_COUNT" -ne 3 ]]; then
  echo "Expected three generated covers, found ${COVER_COUNT} in ${LIBRARY_ROOT}/Books." >&2
  exit 1
fi
while IFS= read -r cover; do
  sips -g format -g pixelWidth -g pixelHeight "$cover" | grep -q 'format: jpeg'
done < <(find "${LIBRARY_ROOT}/Books" -type f -name cover.jpg | sort)

maestro test --test-output-dir=e2e/.artifacts "${DEVICE_ARGS[@]}" \
  e2e/flows/library/delete_local_supported_formats.yaml \
  "${COMMON_ENV[@]}" \
  -e "LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME}"

for _ in {1..50}; do
  [[ ! -e "$LIBRARY_ROOT" ]] && break
  sleep 0.2
done
if [[ -e "$LIBRARY_ROOT" ]]; then
  echo "Deleted local library left its app container at ${LIBRARY_ROOT}." >&2
  exit 1
fi

echo "EPUB, PDF, and CBZ import, restart persistence, book deletion, and library cleanup passed for ${LOCAL_LIBRARY_NAME}."
