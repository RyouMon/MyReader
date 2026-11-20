#!/usr/bin/env bash
# Run from a disposable checkout of the candidate commit.
set -euo pipefail
platform=$1
version=$2
out=$3
cache=$4
mkdir -p "$out" "$cache"
export CI=true HUSKY=0
case "$platform" in
  macos)
    export CARGO_TARGET_DIR="$cache/desktop"
    identity=${APPLE_SIGNING_IDENTITY:-$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application:/ { print $2; exit }')}
    [[ "$identity" == "Developer ID Application:"* ]] || { echo 'Developer ID Application identity required' >&2; exit 1; }
    export APPLE_SIGNING_IDENTITY="$identity"
    verify_dmg() (
      mount=$(mktemp -d "$cache/macos-mount.XXXXXX")
      trap 'rmdir "$mount"' EXIT
      hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$1" >/dev/null
      trap 'hdiutil detach "$mount" >/dev/null && rmdir "$mount"' EXIT
      app="$mount/MyReader.app"
      codesign --verify --deep --strict "$app"
      binary=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
      lipo "$app/Contents/MacOS/$binary" -verify_arch "$2"
    )
    for target in aarch64-apple-darwin x86_64-apple-darwin; do
      pnpm --filter my-reader tauri build --target "$target" --bundles dmg -- --locked
      arch=aarch64
      if [[ "$target" == x86_64-* ]]; then arch=x64; fi
      bundle="$CARGO_TARGET_DIR/$target/release/bundle"
      disk="$bundle/dmg/MyReader_${version}_${arch}.dmg"
      cpu=x86_64
      if [[ "$arch" == aarch64 ]]; then cpu=arm64; fi
      verify_dmg "$disk" "$cpu"
      xcrun notarytool submit "$disk" --keychain-profile "${MYREADER_NOTARY_PROFILE:-MyReader-Notary}" --wait
      xcrun stapler staple "$disk"
      xcrun stapler validate "$disk"
      spctl --assess --type open --context context:primary-signature "$disk"
      cp "$disk" "$out/"
    done
    ;;
  android|ios)
    export CARGO_TARGET_DIR="$cache/mobile-$platform"
    profile=production
    file="MyReader-${version}-ios.ipa"
    if [[ "$platform" == android ]]; then profile=release-apk; file="MyReader-${version}-android.apk"; fi
    (cd my-reader-mobile && npx --yes eas-cli@27.11.0 build --platform "$platform" --profile "$profile" --local --non-interactive --output "$out/$file")
    if [[ "$platform" == android ]]; then
      node --input-type=module - "$out/$file" <<'JS'
import {inspectRelease} from './my-reader-mobile/e2e/scripts/inspect-release.mjs'
inspectRelease('android',process.argv[2],'ryoumon.myreadermobile')
JS
      (cd "$out" && shasum -a 256 "$file" > "$file.sha256")
    else
      unzip -tq "$out/$file" >/dev/null
    fi
    ;;
  simulator)
    export CARGO_TARGET_DIR="$cache/mobile-simulator"
    export EAS_BUILD_PLATFORM=ios ENTRY_FILE=node_modules/expo-router/entry.js SENTRY_DISABLE_AUTO_UPLOAD=true
    bash my-reader-mobile/modules/my-reader-core/scripts/prepare-eas.sh
    pnpm --filter my-reader-mobile exec expo prebuild --platform ios --no-install
    (cd my-reader-mobile/ios && pod install)
    xcodebuild -quiet -jobs 8 -workspace my-reader-mobile/ios/MyReader.xcworkspace -scheme MyReader \
      -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$cache/xcode-simulator" CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES ARCHS="$(uname -m)" build
    tar -czf "$out/MyReader-iOS-simulator.tar.gz" -C "$cache/xcode-simulator/Build/Products/Release-iphonesimulator" MyReader.app
    ;;
  *) exit 2 ;;
esac
