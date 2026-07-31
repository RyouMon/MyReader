Pod::Spec.new do |s|
  s.name           = 'MyReaderSecurityScopedBookmarks'
  s.version        = '0.11.0'
  s.summary        = 'Security-scoped bookmarks for iOS'
  s.description    = 'A module for creating and resolving security-scoped bookmarks on iOS'
  s.author         = 'RyouMon'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
