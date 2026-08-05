import { Directory } from "expo-file-system"

/** Creates a new named library directory without reusing an existing entry. */
export function createExclusiveLibraryDirectory(
  parentUri: string,
  name: string,
): Directory {
  const parent = new Directory(parentUri)
  const entries = parent.list()
  if (entries.some((entry) => entry.name === name)) {
    throw new Error("LIBRARY_FOLDER_ALREADY_EXISTS")
  }

  try {
    return parent.createDirectory(name)
  } catch (error) {
    if (parent.list().some((entry) => entry.name === name)) {
      throw new Error("LIBRARY_FOLDER_ALREADY_EXISTS", { cause: error })
    }
    throw error
  }
}
