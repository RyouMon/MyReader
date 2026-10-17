#!/usr/bin/env ruby

require 'cocoapods'
require 'tmpdir'

spec = Pod::Specification.from_file(
  File.expand_path('../../my-reader-mobile/modules/readium/ios/Readium.podspec', __dir__)
)
dependencies = spec.dependencies.select { |dependency| dependency.name.start_with?('Readium') }

# A fresh specs repository and download cache expose unavailable upstream tags
# even when a developer or runner already has the dependency installed.
Dir.mktmpdir('myreader-readium-pods-') do |directory|
  pods = dependencies.map do |dependency|
    "  pod #{dependency.name.inspect}, #{dependency.requirement.to_s.inspect}"
  end.join("\n")
  File.write(File.join(directory, 'Podfile'), <<~PODFILE)
    source 'https://github.com/readium/podspecs.git'
    source 'https://cdn.cocoapods.org/'
    platform :ios, #{spec.deployment_target(:ios).inspect}
    install! 'cocoapods', :integrate_targets => false

    target 'ReadiumDependencies' do
      use_frameworks!
    #{pods}
    end
  PODFILE

  environment = {
    'CP_HOME_DIR' => File.join(directory, 'cocoapods'),
    'CP_CACHE_DIR' => File.join(directory, 'cache'),
    'COCOAPODS_DISABLE_STATS' => 'true'
  }
  success = system(environment, 'pod', 'install', "--project-directory=#{directory}")
  abort 'Readium iOS dependency installation failed without caches.' unless success
end
