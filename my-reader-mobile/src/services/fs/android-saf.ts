import { Directory, File } from "expo-file-system"

import { assertSafeRelativePath, canonicalRelativePathSegments } from "./path"

type FileSystemEntry = Directory | File

export function isAndroidSafUri(uri?: string | null): uri is string {
  return Boolean(uri?.startsWith("content://"))
}

function findChild(
  directory: Directory,
  name: string,
): FileSystemEntry | undefined {
  return directory.list().find((entry) => entry.name === name)
}

function ensureChildDirectory(parent: Directory, name: string): Directory {
  const existing = findChild(parent, name)
  if (existing instanceof Directory) return existing
  if (existing) existing.delete()
  return parent.createDirectory(name)
}

export function ensureDirectoryPath(
  rootUri: string,
  relativePath: string,
): Directory {
  let current = new Directory(rootUri)
  for (const segment of canonicalRelativePathSegments(relativePath)) {
    current = ensureChildDirectory(current, segment)
  }
  return current
}

function findEntryAtPath(
  rootUri: string,
  relativePath: string,
): FileSystemEntry | null {
  assertSafeRelativePath(relativePath)
  const segments = canonicalRelativePathSegments(relativePath)
  let current = new Directory(rootUri)

  for (const [index, segment] of segments.entries()) {
    const entry = findChild(current, segment)
    if (!entry) return null
    if (index === segments.length - 1) return entry
    if (!(entry instanceof Directory)) return null
    current = entry
  }
  return null
}

/** Additively copies a tree so content-addressed Automerge objects are never swept. */
export async function mergeDirectoryTree(
  source: Directory,
  destination: Directory,
): Promise<void> {
  if (!destination.exists) {
    destination.create({ idempotent: true, intermediates: true })
  }

  for (const sourceEntry of source.list()) {
    const destinationEntry = findChild(destination, sourceEntry.name)
    if (sourceEntry instanceof Directory) {
      const destinationDirectory =
        destinationEntry instanceof Directory
          ? destinationEntry
          : ensureChildDirectory(destination, sourceEntry.name)
      await mergeDirectoryTree(sourceEntry, destinationDirectory)
      continue
    }

    if (destinationEntry instanceof Directory) destinationEntry.delete()
    if (destinationEntry instanceof File) {
      await sourceEntry.copy(destinationEntry, { overwrite: true })
    } else {
      await sourceEntry.copy(destination, { overwrite: true })
    }
  }
}

export function childDirectory(
  rootUri: string,
  relativePath: string,
): Directory | null {
  const entry = findEntryAtPath(rootUri, relativePath)
  return entry instanceof Directory ? entry : null
}

export function fileExistsAtPath(
  rootUri: string,
  relativePath: string,
): boolean {
  return findEntryAtPath(rootUri, relativePath) instanceof File
}

export async function copyFileFromTree(
  rootUri: string,
  relativePath: string,
  destination: File,
): Promise<boolean> {
  const source = findEntryAtPath(rootUri, relativePath)
  if (!(source instanceof File)) return false
  await source.copy(destination, { overwrite: true })
  return true
}

export async function copyFileIntoTree(
  source: File,
  rootUri: string,
  relativePath: string,
): Promise<void> {
  assertSafeRelativePath(relativePath)
  const segments = canonicalRelativePathSegments(relativePath)
  const fileName = segments.pop()
  if (!fileName) throw new Error("ANDROID_SAF_FILE_NAME_REQUIRED")
  const parent = ensureDirectoryPath(rootUri, segments.join("/"))
  const existing = findChild(parent, fileName)
  if (existing instanceof Directory) existing.delete()
  if (existing instanceof File) {
    await source.copy(existing, { overwrite: true })
  } else {
    await source.copy(parent, { overwrite: true })
  }
}

export function deleteDirectoryAtPath(
  rootUri: string,
  relativePath: string,
): void {
  const directory = childDirectory(rootUri, relativePath)
  if (directory) directory.delete()
}

export function listChildDirectories(
  rootUri: string,
  relativePath: string,
): Directory[] {
  return (
    childDirectory(rootUri, relativePath)
      ?.list()
      .filter((entry): entry is Directory => entry instanceof Directory) ?? []
  )
}
