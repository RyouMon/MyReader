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

  patch_readium_webview_server_cors(installer)
end

def patch_readium_webview_server_cors(installer)
  webview_server_path = File.join(
    installer.sandbox.root,
    'ReadiumNavigator',
    'Sources',
    'Navigator',
    'EPUB',
    'WebViewServer.swift'
  )
  return unless File.exist?(webview_server_path)

  source = File.read(webview_server_path)
  return if source.include?('"Access-Control-Allow-Origin": "*"')

  cors_header = '            "Access-Control-Allow-Origin": "*",' + "\n"
  patched = source.sub(/(            "Accept-Ranges": "bytes",\n)/, "\\1#{cors_header}")

  if patched == source
    warn "Unable to patch ReadiumNavigator WebViewServer CORS headers"
    return
  end

  File.chmod(0o644, webview_server_path)
  File.write(webview_server_path, patched)
end
