const { withAppBuildGradle } = require("@expo/config-plugins");

const DESUGAR_DEPENDENCY = '    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n';
const COMPILE_OPTIONS_BLOCK = `
    compileOptions {
        coreLibraryDesugaringEnabled = true
    }
`;

/**
 * @param {import('@expo/config-plugins').ExpoConfig} config
 */
function withAndroidDesugaring(config) {
  return withAppBuildGradle(config, (config) => {
    let { contents } = config.modResults;

    // Add compileOptions block inside android { ... } if not present
    if (!contents.includes("isCoreLibraryDesugaringEnabled")) {
      // Insert compileOptions before the closing `}` of the android block.
      // The android block ends with a `}` on its own line after packagingOptions/androidResources.
      // We find the last `}` that closes android { by looking for the pattern after androidResources.
      const androidResourcesPattern = /(androidResources \{[\s\S]*?\n    \})/;
      const match = contents.match(androidResourcesPattern);
      if (match) {
        const insertAfter = match.index + match[0].length;
        contents = contents.slice(0, insertAfter) + COMPILE_OPTIONS_BLOCK + contents.slice(insertAfter);
      }
    }

    // Add coreLibraryDesugaring dependency if not present
    if (!contents.includes("coreLibraryDesugaring")) {
      const dependenciesNeedle = "dependencies {";
      if (contents.includes(dependenciesNeedle)) {
        contents = contents.replace(
          dependenciesNeedle,
          `${dependenciesNeedle}\n${DESUGAR_DEPENDENCY}`,
        );
      }
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withAndroidDesugaring;
