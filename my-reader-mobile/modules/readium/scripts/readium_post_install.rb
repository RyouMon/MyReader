# Workarounds for react-native-readium's Minizip module compilation.
#
# Minizip is a C library whose headers contain extern "C" blocks.
# react-native-readium's Nitro integration sets SWIFT_OBJC_INTEROP_MODE=objcxx,
# which causes clang to compile Minizip as a C++ module. This breaks because
# the extern "C" blocks import other modules (zlib, submodules), which is not
# allowed in that context.
#
# This is needed regardless of whether use_frameworks! is enabled, because
# `pod 'Minizip', modular_headers: true` also generates a modulemap.
#
# Call this from your Podfile's post_install block:
#
#   require_relative '../node_modules/react-native-readium/scripts/readium_post_install'
#
#   post_install do |installer|
#     react_native_post_install(installer, ...)
#     readium_post_install(installer)
#   end
#
def readium_post_install(installer)
  readium_fix_initial_pagination(installer.sandbox.root)
  readium_fix_initial_location_notifications(installer.sandbox.root)

  # Rewrite the Minizip modulemap to drop submodules and mark as [extern_c] [system].
  # The modulemap path differs depending on whether use_frameworks! is active:
  #   - With use_frameworks!:  Target Support Files/Minizip/Minizip.modulemap
  #   - Without (modular_headers): Headers/Public/Minizip/Minizip.modulemap
  modulemap_content = <<~MODULEMAP
    module Minizip [extern_c] [system] {
      header "Minizip-umbrella.h"
      export *
    }
  MODULEMAP

  framework_modulemap_content = <<~MODULEMAP
    framework module Minizip [extern_c] [system] {
      umbrella header "Minizip-umbrella.h"
      export *
    }
  MODULEMAP

  # use_frameworks! path
  framework_path = File.join(installer.sandbox.root, 'Target Support Files', 'Minizip', 'Minizip.modulemap')
  # modular_headers path
  headers_path = File.join(installer.sandbox.root, 'Headers', 'Public', 'Minizip', 'Minizip.modulemap')

  if File.exist?(framework_path)
    File.write(framework_path, framework_modulemap_content)
  end

  if File.exist?(headers_path)
    File.write(headers_path, modulemap_content)
  end

  # Suppress the remaining module-import-in-extern-c diagnostic for zlib imports.
  installer.pods_project.targets.each do |target|
    if target.name == 'Minizip'
      target.build_configurations.each do |config|
        config.build_settings['OTHER_CFLAGS'] ||= '$(inherited)'
        config.build_settings['OTHER_CFLAGS'] += ' -Wno-module-import-in-extern-c'
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] ||= '$(inherited)'
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] += ' -Wno-module-import-in-extern-c'
      end
    end
  end
end

# The document's load event precedes restoration of its initial locator.
# A busy WebKit process can leave progression at zero during that interval.
# Keep the navigator's saved locator until the spread finishes restoring it.
# Remove this patch when the pinned upstream version includes the fix.
def readium_fix_initial_location_notifications(pods_root)
  patches = {
    'EPUBSpreadView.swift' => {
      '    private(set) var isSpreadLoaded = false' =>
        "    private(set) var isSpreadLoaded = false\n    private(set) var isReadyForLocationUpdates = false",
      '            onSpreadLoadedCallbacks.complete()' =>
        "            isReadyForLocationUpdates = true\n            onSpreadLoadedCallbacks.complete()",
    },
    'EPUBNavigatorViewController.swift' => {
      '        when: { [weak self] in self?.state == .idle },' => <<~SWIFT.chomp.gsub(/^/, '        '),
                when: { [weak self] in
                    guard let self, self.state == .idle,
                          let spreadView = self.paginationView?.currentView as? EPUBSpreadView else { return false }
                    return spreadView.isReadyForLocationUpdates
                },
      SWIFT
    },
  }
  patches.each do |file, replacements|
    path = File.join(pods_root, 'ReadiumNavigator/Sources/Navigator/EPUB', file)
    source = File.read(path)
    original_source = source
    replacements.each do |original, fixed|
      next if source.include?(fixed)
      unless source.scan(original).length == 1
        raise 'Readium loading state changed; review initial location notifications before updating the dependency.'
      end
      source = source.sub(original, fixed)
    end
    next if source == original_source
    # CocoaPods can mark downloaded sources read-only before post_install.
    mode = File.stat(path).mode
    begin
      File.chmod(mode | 0200, path)
      File.write(path, source)
    ensure
      File.chmod(mode, path)
    end
  end
end

# Readium 3.11.0 initializes pagination in its first ResizeObserver frame.
# Restoring a locator before it runs can use a stale page width or clamp the
# last spread before its blank column exists. Use the live viewport width and
# run initialization on load before the spread can accept a saved locator.
# Remove this patch when the pinned upstream version includes the fix.
def readium_fix_initial_pagination(pods_root)
  script = File.join(pods_root, 'ReadiumNavigator/Sources/Navigator/EPUB/Assets/Static/scripts/readium-reflowable.js')
  original = 'function I(t){const e=t+(T()?-1:1);return e-e%O}'
  previous = 'function I(t){const e=t+(T()?-1:1);return e-e%(O||window.innerWidth)}'
  fixed = 'function I(t){const e=t+(T()?-1:1);return e-e%window.innerWidth}'
  source = File.read(script)
  return if source.include?(fixed) && source.include?('const initializeReadiumPagination=')

  unless source.include?(fixed)
    original = previous if source.include?(previous)
    unless source.scan(original).length == 1
      raise 'Readium pagination script changed; review the initial page-width patch before updating the dependency.'
    end
    source = source.sub(original, fixed)
  end

  unless source.include?('const initializeReadiumPagination=')
    prefix = 'window.addEventListener("load",function(){var t;new ResizeObserver(()=>{t&&window.cancelAnimationFrame(t),t=window.requestAnimationFrame('
    suffix = ')}).observe(document.body)},!1)'
    pattern = /#{Regexp.escape(prefix)}(function\(\)\{O=window.innerWidth,.*?\})#{Regexp.escape(suffix)}/
    unless source.scan(pattern).length == 1
      raise 'Readium resize observer changed; review pagination initialization before updating the dependency.'
    end
    source = source.sub(pattern) do
      initialize = Regexp.last_match(1)
      'window.addEventListener("load",function(){var t;const initializeReadiumPagination=' + initialize +
        ';initializeReadiumPagination();new ResizeObserver(()=>{t&&window.cancelAnimationFrame(t),t=window.requestAnimationFrame(initializeReadiumPagination)}).observe(document.body)},!1)'
    end
  end

  File.write(script, source)
end
