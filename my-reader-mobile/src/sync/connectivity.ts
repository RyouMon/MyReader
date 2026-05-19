import type { Library } from "../data/types";
import { AppInvariantError, NetworkError } from "../errors";
import { useAppStore } from "../store/app-store";

import { resolveSyncTarget } from "./resolve";
import i18n from "@/src/i18n";

/**
 * Performs a lightweight connectivity probe for one app-store library.
 */
export async function checkLibraryConnectivity(libraryId: string): Promise<void> {
  const { libraries, dataSources } = useAppStore.getState();
  const library = libraries.find((item: Library) => item.id === libraryId);
  if (!library) {
    throw new AppInvariantError(i18n.t("sync.libraryNotFound", { id: libraryId }));
  }
  if (library.sourceType !== "webdav") {
    return;
  }

  const resolved = await resolveSyncTarget(library, dataSources);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError(i18n.t("sync.connectionTimeout")));
    }, 2000);
    resolved.backend.statRemote(".").then(
      () => {
        clearTimeout(timeoutId);
        resolve();
      },
      (err: unknown) => {
        clearTimeout(timeoutId);
        reject(err);
      },
    );
  });
}
