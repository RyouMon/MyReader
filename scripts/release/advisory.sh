#!/usr/bin/env bash
set -euo pipefail
suite=$1
out=$2
cache=$3
export CI=true E2E_REPORT_DIR="$out/report-$suite"
mkdir -p "$E2E_REPORT_DIR"
if [[ "$suite" != macos ]]; then
  if [[ -z "${E2E_PYTHON:-}" ]]; then
    venv="$cache/e2e-python"
    if [[ ! -x "$venv/bin/python3" ]]; then python3 -m venv "$venv"; fi
    "$venv/bin/python3" -m pip install --disable-pip-version-check -r my-reader-mobile/e2e/requirements.txt
    export E2E_PYTHON="$venv/bin/python3"
  fi
fi
case "$suite" in
  macos)
    export CARGO_TARGET_DIR="$cache/e2e-desktop" TAURI_E2E_BINARY="$cache/e2e-desktop/release/my-reader" E2E_PREVIEW=1 APPLE_SIGNING_IDENTITY=-
    pnpm --filter my-reader exec playwright install chromium webkit
    pnpm --filter my-reader build:e2e:native
    pnpm --filter my-reader test:integration:frontend
    pnpm --filter my-reader test:e2e:frontend
    pnpm --filter my-reader test:e2e:native
    ;;
  android)
    if [[ -z "${MYREADER_ANDROID_DEVICE:-}" ]]; then
      sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:?Android SDK required}}"
      avd="MyReader_Release_API35"
      image="system-images;android-35;google_apis;arm64-v8a"
      "$sdk/cmdline-tools/latest/bin/sdkmanager" "$image"
      if ! "$sdk/emulator/emulator" -list-avds | grep -Fxq "$avd"; then
        echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd -n "$avd" -k "$image" -d pixel_6
      fi
      port=5584
      MYREADER_ANDROID_DEVICE="emulator-$port"
      if adb devices | grep -q "^${MYREADER_ANDROID_DEVICE}[[:space:]]"; then
        echo "Port $port is in use. Set MYREADER_ANDROID_DEVICE to a dedicated emulator." >&2
        exit 1
      fi
      "$sdk/emulator/emulator" -avd "$avd" -port "$port" -no-window -no-audio -no-snapshot -gpu swiftshader_indirect > "$E2E_REPORT_DIR/emulator.log" 2>&1 &
      emulator_pid=$!
      trap 'kill "$emulator_pid" 2>/dev/null || true' EXIT
      for ((attempt=0;attempt<150;attempt++)); do
        if [[ "$(adb -s "$MYREADER_ANDROID_DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then break; fi
        kill -0 "$emulator_pid"
        sleep 2
      done
      adb -s "$MYREADER_ANDROID_DEVICE" shell pm disable-user --user 0 com.google.android.googlequicksearchbox
    fi
    node my-reader-mobile/e2e/scripts/run-release.mjs android "$out"/assets/*.apk "$MYREADER_ANDROID_DEVICE"
    ;;
  iPhone|iPad)
    driver="$cache/maestro-ios-$(git rev-parse HEAD:my-reader-mobile/e2e/scripts/prepare-ios-maestro.py)-$(xcodebuild -version | tail -1 | awk '{print $NF}')"
    if [[ ! -x "$driver/bin/maestro" ]]; then
      python3 my-reader-mobile/e2e/scripts/prepare-ios-maestro.py "$HOME/.maestro" "$driver" --evidence "$E2E_REPORT_DIR/driver"
    fi
    export PATH="$driver/bin:$PATH"
    info=$(xcrun simctl list devicetypes -j)
    device_type=$(echo "$info" | jq -er --arg kind "$suite" '[.devicetypes[] | select(.productFamily == $kind)] | first.identifier')
    runtime=$(xcrun simctl list runtimes -j | jq -er '[.runtimes[] | select(.isAvailable and (.name|startswith("iOS")))] | last.identifier')
    simulator=$(xcrun simctl create "MyReader release $suite" "$device_type" "$runtime")
    trap 'xcrun simctl delete "$simulator"' EXIT
    xcrun simctl boot "$simulator"
    tar -xzf "$out/assets/MyReader-iOS-simulator.tar.gz" -C "$E2E_REPORT_DIR"
    node my-reader-mobile/e2e/scripts/run-release.mjs ios "$E2E_REPORT_DIR/MyReader.app" "$simulator"
    ;;
  *) exit 2 ;;
esac
