declare module "*.css"

declare module "*.png" {
  import type { ImageRequireSource } from "react-native"
  const source: ImageRequireSource
  export default source
}
