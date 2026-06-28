import { Directory, File } from "expo-file-system"
import { deleteAsync, makeDirectoryAsync } from "expo-file-system/legacy"

import { DataIntegrityError } from "@/src/errors"
import { parentDirectoryUriForFileUri } from "@/src/services/fs/path"

export type LocalFileStat = {
  size: number
  mtimeMs: number
}

function fileAtUri(fileUri: string): File {
  return new File(fileUri)
}

function statFromFile(file: File): LocalFileStat {
  return {
    size: file.size ?? 0,
    mtimeMs: file.modificationTime ? file.modificationTime * 1000 : Date.now(),
  }
}

/** Returns size and modification time for an existing local file. */
export function readFileStat(fileUri: string): LocalFileStat {
  const file = fileAtUri(fileUri)
  if (!file.exists) {
    throw new DataIntegrityError(`Local file not found: ${fileUri}`)
  }
  return statFromFile(file)
}

/** Returns file stat when the path exists; otherwise null. */
export function readFileStatIfExists(fileUri: string): LocalFileStat | null {
  const file = fileAtUri(fileUri)
  if (!file.exists) return null
  return statFromFile(file)
}

/** True when the file exists and has a non-zero size. */
export function fileHasNonEmptyBytes(fileUri: string): boolean {
  const file = fileAtUri(fileUri)
  return file.exists && (file.size ?? 0) > 0
}

/** Creates parent directories for a file URI when missing. */
export async function ensureParentDirectoryForFile(
  fileUri: string,
): Promise<void> {
  const parentPath = parentDirectoryUriForFileUri(fileUri)
  if (!parentPath) return
  const parent = new Directory(parentPath)
  if (!parent.exists) {
    await makeDirectoryAsync(parentPath, { intermediates: true })
  }
}

/** Deletes a local file when it exists. */
export async function deleteFileAtUri(fileUri: string): Promise<void> {
  const file = fileAtUri(fileUri)
  if (file.exists) {
    await deleteAsync(file.uri, { idempotent: true })
  }
}
