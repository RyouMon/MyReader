import type { BookItem, Library } from "../types";
import type { RemoteBackend } from "../../services/remote/backend";

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