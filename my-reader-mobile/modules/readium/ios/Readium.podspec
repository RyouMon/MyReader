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

  s.dependency 'ExpoModulesCore'
  s.dependency 'ReadiumShared',            '~> 3.5.0'
  s.dependency 'ReadiumStreamer',          '~> 3.5.0'
  s.dependency 'ReadiumNavigator',         '~> 3.5.0'
  s.dependency 'ReadiumAdapterGCDWebServer', '~> 3.5.0'
  s.dependency 'ReadiumInternal'
  # Used by ReaderViewController to sanitize noteref referrer/title markup.
  s.dependency 'SwiftSoup'
end
