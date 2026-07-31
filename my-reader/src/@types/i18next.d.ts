import { desktopResources } from "@my-reader/i18n/desktop"
import "i18next"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: (typeof desktopResources)["en"]
    strictKeyChecks: true
  }
}
