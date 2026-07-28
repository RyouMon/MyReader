Pod::Spec.new do |s|
  s.name           = 'MyReaderCore'
  s.version        = '0.1.0'
  s.summary        = 'MyReader Core mobile adapter'
  s.description    = 'Expo and UniFFI adapter for the shared MyReader Core backend'
  s.author         = 'RyouMon'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.libraries = 'my_reader_core_ffi', 'sqlite3'
  s.public_header_files = 'generated/*FFI.h'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.exclude_files = 'Tests/**/*'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.script_phase = {
    :name => 'Build MyReader Core',
    :script => '"${PODS_TARGET_SRCROOT}/../scripts/build-ios.sh"',
    :execution_position => :before_compile,
    :always_out_of_date => '1',
    :output_files => [
      '${BUILT_PRODUCTS_DIR}/../libmy_reader_core_ffi.a'
    ],
  }

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
  end
end
