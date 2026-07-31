import { mobileResources } from "@my-reader/i18n/mobile"
import "i18next"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation"
    resources: (typeof mobileResources)["en"]
    strictKeyChecks: true
  }
}
