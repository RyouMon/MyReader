#!/bin/sh

set -eu

binary_path=$1
shift

signing_identity=${MY_READER_MACOS_SIGNING_IDENTITY:-${APPLE_SIGNING_IDENTITY:-}}
if [ -z "$signing_identity" ]; then
  signing_identity=$(security find-identity -v -p codesigning 2>/dev/null \
    | awk -F'"' '/"Apple Development: / { print $2; exit }')
fi

if [ -z "$signing_identity" ] || [ "$signing_identity" = "-" ]; then
  echo "warning: no stable Apple Development signing identity found; macOS may ask for Keychain access again after rebuilds" >&2
else
  codesign \
    --force \
    --sign "$signing_identity" \
    --identifier ryoumon.myreader.app \
    --timestamp=none \
    "$binary_path"
fi

exec "$binary_path" "$@"
