Pod::Spec.new do |s|
  s.name           = 'MyReaderRustComponents'
  s.version        = '0.1.0'
  s.summary        = 'Shared Rust components for MyReader'
  s.description    = 'Expo adapter for the aggregated MyReader Rust library'
  s.author         = 'RyouMon'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.libraries = 'myreader_rust_components'
  s.public_header_files = 'generated/*FFI.h'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.script_phase = {
    :name => 'Build MyReader Rust components',
    :script => '"${PODS_TARGET_SRCROOT}/../scripts/build-ios.sh"',
    :execution_position => :before_compile,
    :output_files => [
      '${CONFIGURATION_BUILD_DIR}/libmyreader_rust_components.a'
    ],
  }
end
