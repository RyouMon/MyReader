#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MOBILE_ROOT=$(cd "${SCRIPT_DIR}/../.." && pwd)
PLATFORM=${1:-ios}

APP_ID=${APP_ID:-ryoumon.myreadermobile}
E2E_RUN_ID=${E2E_RUN_ID:-$(date -u +%Y%m%d-%H%M%S)}
E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER:-"MyReaderE2E-${E2E_RUN_ID}"}
LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME:-"E2E-Formats-${E2E_RUN_ID}"}
bash "${SCRIPT_DIR}/prepare-tts-fixture.sh" --build-only
EPUB_SOURCE="${MOBILE_ROOT}/e2e/.artifacts/MyReader-TTS.epub"
PDF_SOURCE="${MOBILE_ROOT}/e2e/fixtures/formats/MyReader-QA.pdf"
CBZ_SOURCE="${MOBILE_ROOT}/e2e/fixtures/formats/MyReader-QA.cbz"
EPUB_IMPORT_FILE_NAME=MyReader-TTS.epub
PDF_IMPORT_FILE_NAME=MyReader-QA.pdf
PDF_PICKER_FILE_NAME='MyReader-QA(.pdf)?'
CBZ_IMPORT_FILE_NAME=MyReader-QA.cbz
EPUB_BOOK_TITLE='MyReader TTS E2E'
EPUB_BOOK_AUTHOR=MyReader
PDF_BOOK_TITLE='MyReader QA PDF'
PDF_BOOK_AUTHOR=MyReader
CBZ_BOOK_TITLE=MyReader-QA

for source in "$EPUB_SOURCE" "$PDF_SOURCE" "$CBZ_SOURCE"; do
  if [[ ! -f "$source" ]]; then
    echo "Fixture does not exist: $source" >&2
    exit 1
  fi
done

case "$PLATFORM" in
  ios)
    IOS_SIMULATOR_UDID=${IOS_SIMULATOR_UDID:-$(xcrun simctl list devices booted -j | jq -r '
      [.devices[][] | select(.state == "Booted") | .udid] |
      if length == 1 then .[0] else empty end
    ')}
    : "${IOS_SIMULATOR_UDID:?Set IOS_SIMULATOR_UDID when zero or multiple simulators are booted.}"
    SIMULATOR_APP_GROUPS="${HOME}/Library/Developer/CoreSimulator/Devices/${IOS_SIMULATOR_UDID}/data/Containers/Shared/AppGroup"
    DOWNLOADS_ROOT=$(find "$SIMULATOR_APP_GROUPS" -type d -path '*/File Provider Storage/Downloads' -print -quit)
    if [[ -z "$DOWNLOADS_ROOT" ]]; then
      for metadata in "$SIMULATOR_APP_GROUPS"/*/.com.apple.mobile_container_manager.metadata.plist; do
        if [[ $(plutil -extract MCMMetadataIdentifier raw -o - "$metadata") == group.com.apple.FileProvider.LocalStorage ]]; then
          DOWNLOADS_ROOT="$(dirname "$metadata")/File Provider Storage/Downloads"
          mkdir -p "$DOWNLOADS_ROOT"
          break
        fi
      done
    fi
    : "${DOWNLOADS_ROOT:?Open the Files app on the target simulator to initialize local storage.}"
    FIXTURE_ROOT="${DOWNLOADS_ROOT}/${E2E_ROOT_FOLDER}/Fixtures"
    mkdir -p "$FIXTURE_ROOT"
    cp "$EPUB_SOURCE" "${FIXTURE_ROOT}/${EPUB_IMPORT_FILE_NAME}"
    cp "$PDF_SOURCE" "${FIXTURE_ROOT}/${PDF_IMPORT_FILE_NAME}"
    cp "$CBZ_SOURCE" "${FIXTURE_ROOT}/${CBZ_IMPORT_FILE_NAME}"
    DEVICE_ARGS=(--udid "$IOS_SIMULATOR_UDID")
    ;;
  android)
    : "${ANDROID_SERIAL:?Set ANDROID_SERIAL to the target emulator (for example emulator-5554).}"
    if [[ "$ANDROID_SERIAL" != emulator-* ]]; then
      echo "This workflow only targets Android emulators." >&2
      exit 1
    fi
    FIXTURE_ROOT="/sdcard/Download/${E2E_ROOT_FOLDER}/Fixtures"
    adb -s "$ANDROID_SERIAL" shell mkdir -p "$FIXTURE_ROOT"
    adb -s "$ANDROID_SERIAL" push "$EPUB_SOURCE" "${FIXTURE_ROOT}/${EPUB_IMPORT_FILE_NAME}" >/dev/null
    adb -s "$ANDROID_SERIAL" push "$PDF_SOURCE" "${FIXTURE_ROOT}/${PDF_IMPORT_FILE_NAME}" >/dev/null
    adb -s "$ANDROID_SERIAL" push "$CBZ_SOURCE" "${FIXTURE_ROOT}/${CBZ_IMPORT_FILE_NAME}" >/dev/null
    ANDROID_STORAGE_LABEL=$(adb -s "$ANDROID_SERIAL" shell getprop ro.product.model | tr -d '\r')
    DEVICE_ARGS=(--udid "$ANDROID_SERIAL")
    ;;
  *)
    echo "Usage: $0 [ios|android]" >&2
    exit 1
    ;;
esac

COMMON_ENV=(
  -e "APP_ID=${APP_ID}"
  -e "E2E_ROOT_FOLDER=${E2E_ROOT_FOLDER}"
  -e "EPUB_BOOK_TITLE=${EPUB_BOOK_TITLE}"
  -e "PDF_BOOK_TITLE=${PDF_BOOK_TITLE}"
  -e "CBZ_BOOK_TITLE=${CBZ_BOOK_TITLE}"
  -e "ANDROID_STORAGE_LABEL=${ANDROID_STORAGE_LABEL:-}"
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

if [[ "$PLATFORM" == ios ]]; then
  IOS_SIMULATOR_UDID="$IOS_SIMULATOR_UDID" APP_ID="$APP_ID" \
    bash "${SCRIPT_DIR}/run-ios-reader-settings.sh"
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
fi

maestro test --test-output-dir=e2e/.artifacts "${DEVICE_ARGS[@]}" \
  e2e/flows/library/delete_local_supported_formats.yaml \
  "${COMMON_ENV[@]}" \
  -e "LOCAL_LIBRARY_NAME=${LOCAL_LIBRARY_NAME}"

if [[ "$PLATFORM" == ios ]]; then
  for _ in {1..50}; do
    [[ ! -e "$LIBRARY_ROOT" ]] && break
    sleep 0.2
  done
  if [[ -e "$LIBRARY_ROOT" ]]; then
    echo "Deleted local library left its app container at ${LIBRARY_ROOT}." >&2
    exit 1
  fi
fi

echo "EPUB, PDF, and CBZ import, restart persistence, book deletion, and library cleanup passed for ${LOCAL_LIBRARY_NAME}."
