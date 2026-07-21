require "json"

# Load Podfile helpers (defines readium_pods() and readium_post_install() for
# Podfile use — wired in via the with-readium-ios config plugin).
load File.join(__dir__, "..", "scripts", "readium_pods.rb") if File.exist?(File.join(__dir__, "..", "scripts", "readium_pods.rb"))
load File.join(__dir__, "..", "scripts", "readium_post_install.rb") if File.exist?(File.join(__dir__, "..", "scripts", "readium_post_install.rb"))

Pod::Spec.new do |s|
  s.name           = 'Readium'
  s.version        = '0.1.0'
  s.summary        = 'Open-architecture Readium bridge for Expo (iOS + Android)'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.license        = 'MIT'
  s.author         = 'RyouMon'

  s.platforms      = { :ios => '15.1' }
  s.ios.deployment_target = '15.1'
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.prepare_command = "cd ../../.. && node scripts/prepare-reader-fonts.mjs && node modules/readium/scripts/generate-reader-note-marker-template.mjs --platform ios && node ../scripts/generate-reader-viewport-anchor.mjs --platform ios"
  s.script_phases = [
    {
      :name => 'Generate reader note marker template',
      :script => 'node "${PODS_TARGET_SRCROOT}/../scripts/generate-reader-note-marker-template.mjs" --platform ios',
      :execution_position => :before_compile,
      :input_files => [
        '${PODS_TARGET_SRCROOT}/../../../../packages/tools/src/reader-note-marker/reader-note-marker.html',
        '${PODS_TARGET_SRCROOT}/../../../../packages/tools/src/reader-note-marker/reader-note-marker.css'
      ],
      :output_files => ['${PODS_TARGET_SRCROOT}/Reader/EPUB/GeneratedReaderNoteMarkerTemplate.swift']
    },
    {
      :name => 'Generate reader viewport anchor',
      :script => 'node "${PODS_TARGET_SRCROOT}/../../../../scripts/generate-reader-viewport-anchor.mjs" --platform ios',
      :execution_position => :before_compile,
      :input_files => ['${PODS_TARGET_SRCROOT}/../../../../packages/tools/src/reader-viewport-anchor.ts'],
      :output_files => ['${PODS_TARGET_SRCROOT}/Reader/EPUB/GeneratedReaderViewportAnchorScript.swift']
    }
  ]
  s.resource_bundles = {
    "ReadiumReaderFonts" => ["Generated/reader-fonts/*"]
  }

  s.dependency 'ExpoModulesCore'
  s.dependency 'ReadiumShared',            '~> 3.9.0'
  s.dependency 'ReadiumStreamer',          '~> 3.9.0'
  s.dependency 'ReadiumNavigator',         '~> 3.9.0'
  s.dependency 'ReadiumInternal'
  # Used by ReaderViewController to sanitize noteref referrer/title markup.
  s.dependency 'SwiftSoup'
end
