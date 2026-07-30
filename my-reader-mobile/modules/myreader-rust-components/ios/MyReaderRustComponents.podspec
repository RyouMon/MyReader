Pod::Spec.new do |s|
  s.name           = 'MyReaderRustComponents'
  s.version        = '0.1.0'
  s.summary        = 'Shared Rust components for MyReader'
  s.description    = 'Expo adapter for the aggregated MyReader Rust library'
  s.author         = 'RyouMon'
  s.homepage       = 'https://github.com/RyouMon/MyReader'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.libraries = 'myreader_rust_components', 'sqlite3'
  s.public_header_files = 'generated/*FFI.h'
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
  s.exclude_files = 'Tests/**/*'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.script_phase = {
    :name => 'Build MyReader Rust components',
    :script => '"${PODS_TARGET_SRCROOT}/../scripts/build-ios.sh"',
    :execution_position => :before_compile,
    :always_out_of_date => '1',
    :output_files => [
      '${BUILT_PRODUCTS_DIR}/../libmyreader_rust_components.a'
    ],
  }

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = 'Tests/**/*.swift'
  end
end
