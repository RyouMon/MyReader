declare module "*fb2.js" {
  export function makeFB2(blob: Blob): Promise<import("./types").Book>
}
declare module "*mobi.js" {
  export class MOBI {
    constructor(options: { unzlib: unknown })
    open(blob: Blob): Promise<import("./types").Book>
  }
}
declare module "*fflate.js" {
  export function unzlibSync(bytes: Uint8Array): Uint8Array
}
interface Window {
  webkit?: {
    messageHandlers?: { readerFormat?: { postMessage(message: string): void } }
  }
  ReaderFormat?: { postMessage(message: string): void }
}
