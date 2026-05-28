import type { BookItem, Library } from "../../data/types";
import type { RemoteBackend } from "./backend";

export function buildRemoteCoverUri(
  library: Library,
  backend: RemoteBackend,
  bookPath: string,
  hasCover: boolean,
): BookItem["coverUri"] {
  if (!bookPath || !hasCover) return undefined;

  const remoteCoverPath = `${bookPath}/cover.jpg`;
  const cachedHeaders = backend.getCachedAuthHeaders();

  return {
    uri: backend.contentUrl(remoteCoverPath),
    headers: cachedHeaders ?? undefined,
  };
}