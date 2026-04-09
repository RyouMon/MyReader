declare module "my-reader-tools/foliate-js/epub.js" {
  export interface EpubSection {
    id: string
    createDocument: () => Promise<Document>
    /** 解压后 manifest 项字节长度，用于全书进度加权（见 foliate-js `SectionProgress`） */
    size?: number
    linear?: string
  }

  export interface EpubBookShape {
    metadata?: Record<string, unknown>
    toc?: unknown[]
    sections: EpubSection[]
    init: () => Promise<EpubBookShape>
    destroy?: () => void
    resolveHref(
      href: string,
    ): { index: number; anchor: (doc: Document) => unknown } | null
  }

  export class EPUB implements EpubBookShape {
    metadata?: Record<string, unknown>
    toc?: unknown[]
    sections: EpubSection[]
    constructor(options: {
      loadText: (uri: string) => Promise<string> | string
      loadBlob: (
        uri: string,
      ) => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>
      getSize: (uri: string) => number
      sha1: (data: ArrayBuffer) => Promise<string> | string
    })
    init(): Promise<EpubBookShape>
    destroy?(): void
    resolveHref(
      href: string,
    ): { index: number; anchor: (doc: Document) => unknown } | null
  }
}
