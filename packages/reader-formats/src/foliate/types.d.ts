export interface Link {
  href: string
  type?: string
  title?: string
  rel?: string[]
  children?: Link[]
}
export interface Toc {
  href: string
  label?: string
  subitems?: Toc[] | null
}
export interface Book {
  sections: {
    load(): string | Promise<string>
    title?: string
    linear?: string
  }[]
  toc?: Toc[]
  metadata?: { author?: unknown; title?: string; language?: unknown }
  resolveHref?(
    href: string,
  ):
    | { index: number; anchor?(doc: Document): Element | null }
    | undefined
    | Promise<
        { index: number; anchor?(doc: Document): Element | null } | undefined
      >
  getCover?(): Promise<Blob | null> | Blob | null
  destroy?(): void
}
export interface Archive {
  kind: string
  entry: string
  files: string[]
}
export type Put = (name: string, content: Blob) => Promise<void>
export type Locate = (ref: string, base: string) => string | null
