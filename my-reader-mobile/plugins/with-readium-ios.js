/**
 * Expo config plugin that injects Readium CocoaPods source and helpers into
 * the generated ios/Podfile so that the entries survive every `expo prebuild`.
 *
 * Required because the Readium pods live in a custom spec repo and need three
 * extra entries that vanilla CocoaPods does not add automatically:
 *   - `source 'https://github.com/readium/podspecs'`  (before the default CDN)
 *   - `source 'https://cdn.cocoapods.org/'`           (explicit CDN; CocoaPods
 *      stops auto-using its master CDN once any source is declared)
 *   - `readium_pods`                                  (inside the target block)
 *   - `readium_post_install(installer)`               (after react_native_post_install)
 *
 * Also appends a small **fmt / Apple Clang** workaround after Readium’s hook:
 * RN `buildReactNativeFromSource` pulls **fmt 11**, whose `FMT_STRING` + `consteval`
 * breaks on newer Xcode (e.g. 16.4+ / 26.x). We mirror fmt 12’s `#ifdef FMT_USE_CONSTEVAL`
 * guard in `Pods/fmt/.../base.h` and set `FMT_USE_CONSTEVAL=0` on the `fmt` pod target.
 */

// @ts-check
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const READIUM_PODSPECS_SOURCE = "source 'https://github.com/readium/podspecs'";
const CDN_SOURCE = "source 'https://cdn.cocoapods.org/'";
const READIUM_PODS_CALL = '  readium_pods';
const READIUM_POST_INSTALL = '    readium_post_install(installer)';

/** Ruby fragment: idempotent marker `MYREADER_FMT_WORKAROUND` in Podfile. */
const FMT_APPLE_CLANG_WORKAROUND = `
    # MYREADER_FMT_WORKAROUND: fmt 11 + Apple Clang (FMT_STRING / consteval). fmt #4740; RN from source + newer Xcode.
    fmt_base = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      body = File.read(fmt_base)
      needle = '// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.' + "\\n" + '#if !defined(__cpp_lib_is_constant_evaluated)'
      guard = '// Detect consteval, C++20 constexpr extensions and std::is_constant_evaluated.' + "\\n" + '#ifdef FMT_USE_CONSTEVAL' + "\\n" + '#elif !defined(__cpp_lib_is_constant_evaluated)'
      if body.include?(needle) && !body.include?('MYREADER_FMT_CONSTEVAL_GUARD')
        File.write(fmt_base, body.sub(needle, guard + "\\n" + '// MYREADER_FMT_CONSTEVAL_GUARD'))
      end
    end
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |config|
        defs = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS']
        defs = ['$(inherited)'] if defs.nil?
        defs = [defs] if defs.is_a?(String)
        defs = defs.flatten
        unless defs.any? { |d| d.to_s.include?('FMT_USE_CONSTEVAL') }
          defs << 'FMT_USE_CONSTEVAL=0'
        end
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
      end
    end
`;

/**
 * Insert `readium_pods` just before the last `end` of the primary target block.
 * Looks for `use_native_modules!` as the target anchor.
 */
function injectReadiumPods(podfileContent) {
  if (podfileContent.includes('readium_pods')) {
    return podfileContent;
  }

  const targetBlockRegex = /(target\s+['"][^'"]+['"]\s+do[\s\S]*?use_native_modules![\s\S]*?)(^end$)/m;
  return podfileContent.replace(targetBlockRegex, (_match, before, endKeyword) => {
    return `${before}${READIUM_PODS_CALL}\n${endKeyword}`;
  });
}

/**
 * Insert `readium_post_install(installer)` immediately after the closing `)`
 * of the `react_native_post_install(...)` call. The Expo template wraps that
 * call across multiple lines and contains a nested `ccache_enabled?(...)`
 * call, so we walk the source manually to find the balanced closing paren
 * rather than try a regex that handles arbitrarily nested parens.
 */
function injectReadiumPostInstall(podfileContent) {
  if (podfileContent.includes('readium_post_install')) {
    return podfileContent;
  }

  const callStart = podfileContent.indexOf('react_native_post_install(');
  if (callStart === -1) return podfileContent;

  const openParen = podfileContent.indexOf('(', callStart);
  let depth = 0;
  let closeParen = -1;
  for (let i = openParen; i < podfileContent.length; i++) {
    const ch = podfileContent[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        closeParen = i;
        break;
      }
    }
  }
  if (closeParen === -1) return podfileContent;

  return `${podfileContent.slice(0, closeParen + 1)}\n${READIUM_POST_INSTALL}${podfileContent.slice(closeParen + 1)}`;
}

/**
 * Ensure the Podfile declares both the Readium podspecs source and the
 * CocoaPods CDN source before the `platform :ios` line. CocoaPods only uses
 * its master CDN automatically when no other source is declared, so adding
 * the readium source without the CDN would break every other pod lookup.
 */
function injectReadiumSource(podfileContent) {
  let content = podfileContent;
  const hasReadium = content.includes('readium/podspecs');
  const hasCdn = content.includes('cdn.cocoapods.org');

  if (hasReadium && hasCdn) return content;

  const platformAnchor = /(platform\s+:ios)/;

  if (!hasReadium) {
    if (hasCdn) {
      content = content.replace(CDN_SOURCE, `${READIUM_PODSPECS_SOURCE}\n${CDN_SOURCE}`);
    } else {
      content = content.replace(platformAnchor, `${READIUM_PODSPECS_SOURCE}\n$1`);
    }
  }

  if (!content.includes('cdn.cocoapods.org')) {
    content = content.replace(
      READIUM_PODSPECS_SOURCE,
      `${READIUM_PODSPECS_SOURCE}\n${CDN_SOURCE}`,
    );
  }

  return content;
}

/**
 * After `readium_post_install`, patch vendored fmt 11 `base.h` (fmt 12-style guard) and
 * force `FMT_USE_CONSTEVAL=0` on the `fmt` pod. Skipped if marker already present.
 */
function injectFmtAppleClangWorkaround(podfileContent) {
  if (podfileContent.includes('MYREADER_FMT_WORKAROUND')) {
    return podfileContent;
  }
  const anchor = 'readium_post_install(installer)';
  const idx = podfileContent.indexOf(anchor);
  if (idx === -1) return podfileContent;
  const lineEnd = podfileContent.indexOf('\n', idx);
  if (lineEnd === -1) return podfileContent;
  return (
    podfileContent.slice(0, lineEnd + 1) + FMT_APPLE_CLANG_WORKAROUND + podfileContent.slice(lineEnd + 1)
  );
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withReadiumIos = (config) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        return cfg;
      }

      let content = fs.readFileSync(podfilePath, 'utf-8');
      content = injectReadiumSource(content);
      content = injectReadiumPods(content);
      content = injectReadiumPostInstall(content);
      content = injectFmtAppleClangWorkaround(content);
      fs.writeFileSync(podfilePath, content, 'utf-8');
      return cfg;
    },
  ]);

module.exports = withReadiumIos;
