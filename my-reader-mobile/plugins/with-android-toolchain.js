const {
  withAppBuildGradle,
  withGradleProperties,
  withProjectBuildGradle,
} = require("@expo/config-plugins")

function configureClasspath(contents, dependency, version) {
  const configured = `classpath("${dependency}:${version}")`
  if (contents.includes(configured)) return contents
  const original = `classpath('${dependency}')`
  if (!contents.includes(original)) {
    throw new Error(`Expected the Expo ${dependency} classpath in build.gradle`)
  }
  return contents.replace(original, configured)
}

// Expo's property override does not reach the compiler classpath:
// https://github.com/expo/expo/issues/49668
module.exports = function withAndroidToolchain(config) {
  config = withAppBuildGradle(config, (config) => {
    config.modResults.contents = config.modResults.contents.replaceAll(
      "proguard-android.txt",
      "proguard-android-optimize.txt",
    )
    return config
  })
  config = withProjectBuildGradle(config, (config) => {
    let { contents } = config.modResults
    contents = configureClasspath(
      contents,
      "com.android.tools.build:gradle",
      "9.1.1",
    )
    config.modResults.contents = configureClasspath(
      contents,
      "org.jetbrains.kotlin:kotlin-gradle-plugin",
      "${findProperty('android.kotlinVersion')}",
    )
    return config
  })

  // Match the React Native template's AGP 9 compatibility settings.
  return withGradleProperties(config, (config) => {
    for (const key of [
      "android.builtInKotlin",
      "android.newDsl",
      // Expo autolinking explicitly wires its generator to preBuild.
      "android.sourceset.disallowProvider",
    ]) {
      const existing = config.modResults.find((entry) => entry.key === key)
      if (existing) existing.value = "false"
      else config.modResults.push({ type: "property", key, value: "false" })
    }
    return config
  })
}
