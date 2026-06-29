Pod::Spec.new do |s|
  s.name           = 'MyReaderBookTransition'
  s.version        = '0.1.0'
  s.summary        = 'Native book open and close transition for MyReader'
  s.description    = 'Window-level native book transition overlay'
  s.author         = 'RyouMon'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.0'

  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
