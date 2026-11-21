import { format as readiumFormat } from "@my-reader/readium"
import { Directory, Paths } from "expo-file-system"
import { publicationPrepare } from "my-reader-core"
import { toFileUri, toNativeFilesystemPath } from "../fs/path"

export async function preparePublication(
  uri: string,
  format: string,
): Promise<string> {
  const cache = new Directory(Paths.cache, "reader-publications")
  const prepared = await publicationPrepare(
    toNativeFilesystemPath(uri),
    format,
    toNativeFilesystemPath(cache.uri),
  )
  if (prepared.parserUrl) await readiumFormat.runParser(prepared.parserUrl)
  return toFileUri(prepared.packagePath)
}
