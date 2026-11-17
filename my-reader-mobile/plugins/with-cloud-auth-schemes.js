const { withAndroidManifest, withInfoPlist } = require("@expo/config-plugins")

const GOOGLE_IOS_SCHEME =
  "com.googleusercontent.apps.679889280827-l7r5uvus691p8ighv14ti401817sts0b"
const CLOUD_AUTH_SCHEME = "ryoumon.myreadermobile.auth"

function withCloudAuthSchemes(config) {
  const withIosSchemes = withInfoPlist(config, (config) => {
    const urlTypes = config.modResults.CFBundleURLTypes ?? []
    const existing = urlTypes.find(
      (entry) =>
        entry.CFBundleURLName === "$(PRODUCT_BUNDLE_IDENTIFIER)" ||
        entry.CFBundleURLName === "MyReader Google Drive",
    )
    if (existing) {
      existing.CFBundleURLSchemes = Array.from(
        new Set([...(existing.CFBundleURLSchemes ?? []), GOOGLE_IOS_SCHEME]),
      )
    } else {
      urlTypes.push({
        CFBundleURLName: "MyReader Google Drive",
        CFBundleURLSchemes: [GOOGLE_IOS_SCHEME],
      })
    }
    config.modResults.CFBundleURLTypes = urlTypes
    return config
  })

  return withAndroidManifest(withIosSchemes, (config) => {
    const application = config.modResults.manifest.application?.[0]
    if (!application) return config
    const activities = application.activity ?? []
    const receiver = activities.find(
      (activity) =>
        activity.$?.["android:name"] ===
        "net.openid.appauth.RedirectUriReceiverActivity",
    )
    const target = receiver ?? {
      $: {
        "android:name": "net.openid.appauth.RedirectUriReceiverActivity",
        "android:exported": "true",
      },
      "intent-filter": [],
    }
    if (!receiver) activities.push(target)
    const filters = target["intent-filter"] ?? []
    target["intent-filter"] = filters
    const addSchemeFilter = (scheme) => {
      const exists = filters.some((filter) =>
        (filter.data ?? []).some(
          (entry) => entry.$?.["android:scheme"] === scheme,
        ),
      )
      if (exists) return
      filters.push({
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        category: [
          { $: { "android:name": "android.intent.category.DEFAULT" } },
          { $: { "android:name": "android.intent.category.BROWSABLE" } },
        ],
        data: [{ $: { "android:scheme": scheme } }],
      })
    }
    addSchemeFilter(CLOUD_AUTH_SCHEME)
    application.activity = activities
    return config
  })
}

module.exports = withCloudAuthSchemes
