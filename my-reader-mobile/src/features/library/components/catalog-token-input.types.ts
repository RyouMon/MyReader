import type { CatalogToken } from "@my-reader/tools/catalog-navigation"
import type { Ref } from "react"

export type CatalogTokenInputHandle = { focus: () => void }
export type CatalogTokenInputProps = {
  ref?: Ref<CatalogTokenInputHandle>
  tokens: CatalogToken[]
  text: string
  placeholder: string
  onChange: (tokens: CatalogToken[], text: string) => void
  onSubmit: (text: string) => void
  onHeightChange: (height: number) => void
}
