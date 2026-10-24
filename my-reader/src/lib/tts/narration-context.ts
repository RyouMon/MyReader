import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import type { EpubTtsUtterance } from "@/lib/readium/epubTts"
import type { NarrationRequestDto } from "@/lib/tauri-specta"

const versions = new WeakMap<EpubTextResource[], Promise<string>>()
function contentVersion(resources: EpubTextResource[]) {
  let version = versions.get(resources)
  if (!version) {
    version = crypto.subtle
      .digest(
        "SHA-256",
        new TextEncoder().encode(
          JSON.stringify(
            resources.map((resource) => [resource.href, resource.html]),
          ),
        ),
      )
      .then((bytes) =>
        Array.from(new Uint8Array(bytes), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
      )
    versions.set(resources, version)
  }
  return version
}

export async function narrationContext(
  bookId: number,
  utterance: EpubTtsUtterance,
  utterances: EpubTtsUtterance[],
  resources: EpubTextResource[],
): Promise<NarrationRequestDto> {
  const index = utterances.findIndex(
    (candidate) => candidate.id === utterance.id,
  )
  const resourceIndex = Math.max(
    0,
    resources.findIndex((resource) => resource.href === utterance.locator.href),
  )
  return {
    bookId,
    contentVersion: await contentVersion(resources),
    sourceKey: JSON.stringify(utterance.locator.serialize()),
    position:
      (resourceIndex + (utterance.locator.locations.progression ?? 0)) /
      Math.max(1, resources.length),
    text: utterance.plain ?? "",
    before: Array.from(
      index >= 0
        ? utterances
            .slice(Math.max(0, index - 2), index)
            .map((value) => value.plain)
            .join("\n")
        : (utterance.locator.text?.before ?? ""),
    )
      .slice(-900)
      .join(""),
    after: Array.from(
      index >= 0
        ? utterances
            .slice(index + 1, index + 3)
            .map((value) => value.plain)
            .join("\n")
        : (utterance.locator.text?.after ?? ""),
    )
      .slice(0, 900)
      .join(""),
  }
}
