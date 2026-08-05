import { Directory, File, Paths } from "expo-file-system"

import { uuid } from "@/src/utils/common"

const STAGED_BOOK_IMPORTS_DIR = "staged-book-imports"

export type StagedBookImport = {
  uri: string
  originalName?: string
}

/** Keeps an incoming shared file available while the user creates a library. */
export async function stageBookImport(
  sourceFile: File,
  extension: string,
  originalName?: string | null,
): Promise<StagedBookImport> {
  const directory = new Directory(Paths.cache, STAGED_BOOK_IMPORTS_DIR)
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true })
  }

  const stagedFile = new File(directory, `${uuid()}${extension}`)
  await sourceFile.copy(stagedFile)

  const name = originalName?.trim() || sourceFile.name.trim()
  return {
    uri: stagedFile.uri,
    ...(name ? { originalName: name } : {}),
  }
}

/** Best-effort cleanup for a file staged only for the current import flow. */
export function deleteStagedBookImport(uri: string): void {
  try {
    const file = new File(uri)
    if (file.exists) file.delete()
  } catch {
    // Cache cleanup must not replace the user-visible import result.
  }
}
