import type { Library } from "../data/types";
import { AppInvariantError, NetworkError } from "../errors";
import { useAppStore } from "../store/app-store";

import { resolveSyncTarget } from "./resolve";

/**
 * Performs a lightweight connectivity probe for one app-store library.
 */
export async function checkLibraryConnectivity(libraryId: string): Promise<void> {
  const { libraries, dataSources } = useAppStore.getState();
  const library = libraries.find((item: Library) => item.id === libraryId);
  if (!library) {
    throw new AppInvariantError(`未找到书库: ${libraryId}`);
  }
  if (library.sourceType !== "webdav") {
    return;
  }

  const resolved = await resolveSyncTarget(library, dataSources);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError("连接数据源超时（2秒），请检查网络或 WebDAV 配置"));
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
