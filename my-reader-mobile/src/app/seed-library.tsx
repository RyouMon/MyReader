import { Directory, File as FSFile } from "expo-file-system";
import { Asset } from "expo-asset";
import { router } from "expo-router";
import { unzipSync } from "fflate";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { readBookCountFromLibrary } from "@/src/domain/library/calibre";
import { libraryContainerRootUri, libraryMetadataUri } from "@/src/domain/library/locations";
import { useAppStore, useAppStoreReady } from "@/src/store/app-store";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";

const FIXTURE_ASSET = require("../../assets/e2e-fixtures/Example1.zip");
const LIBRARY_NAME = "Example1";
const LIBRARY_ID = `seed-${LIBRARY_NAME}`;

export default function SeedLibraryScreen() {
  const storeReady = useAppStoreReady();
  const seeded = useRef(false);

  useEffect(() => {
    if (!storeReady || seeded.current) return;
    seeded.current = true;
    let cancelled = false;

    seedLibrary()
      .then(() => {
        if (!cancelled) router.dismissTo("/home");
      })
      .catch((error) => {
        console.error("[seed-library] failed:", error);
        if (!cancelled) router.dismissTo("/home");
      });

    return () => {
      cancelled = true;
    };
  }, [storeReady]);

  return <View />;
}

async function seedLibrary() {
  const store = useAppStore.getState();

  if (store.libraries.some((l) => l.name === LIBRARY_NAME)) {
    return;
  }

  const containerRootUri = libraryContainerRootUri(LIBRARY_ID);
  const existingDir = new Directory(containerRootUri);
  if (existingDir.exists) {
    const metadataFile = new FSFile(libraryMetadataUri({
      id: LIBRARY_ID,
      name: LIBRARY_NAME,
      path: containerRootUri,
      metadataUri: "",
      bookCount: 0,
      addedAt: Date.now(),
      dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
      sourceType: "local",
    }));
    if (metadataFile.exists) {
      const { library: preparedLibrary } = await readBookCountFromLibrary({
        id: LIBRARY_ID,
        name: LIBRARY_NAME,
        path: containerRootUri,
        metadataUri: metadataFile.uri,
        bookCount: 0,
        addedAt: Date.now(),
        dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
        sourceType: "local",
      });
      const { registerLibrary } = await import("@/src/domain/library/hooks/library-actions");
      await registerLibrary(preparedLibrary);
      return;
    }
    existingDir.delete();
  }

  const asset = Asset.fromModule(FIXTURE_ASSET);
  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("[seed-library] asset localUri not available");
  }

  const zipFile = new FSFile(asset.localUri);
  const zipBytes = await zipFile.bytes();
  const entries: Record<string, Uint8Array> = unzipSync(zipBytes);

  const libraryDir = new Directory(containerRootUri);
  if (!libraryDir.exists) {
    libraryDir.create({ intermediates: true });
  }

  for (const [relativePath, data] of Object.entries(entries)) {
    const decodedPath = decodeURIComponent(relativePath);
    // Strip the top-level directory prefix (e.g., "Example1/") so files land
    // directly under libraryDir instead of libraryDir/Example1/.
    const strippedPath = decodedPath.replace(/^[^/]+\//, "");
    if (!strippedPath) continue;
    const targetUri = `${libraryDir.uri}${strippedPath}`;

    if (data.length === 0 && strippedPath.endsWith("/")) {
      const dir = new Directory(targetUri);
      if (!dir.exists) {
        dir.create({ intermediates: true });
      }
    } else {
      const parentPath = strippedPath.substring(0, strippedPath.lastIndexOf("/") + 1);
      if (parentPath) {
        const dir = new Directory(`${libraryDir.uri}${parentPath}`);
        if (!dir.exists) {
          dir.create({ intermediates: true });
        }
      }
      const file = new FSFile(targetUri);
      file.write(data);
    }
  }

  const metadataFile = new FSFile(`${libraryDir.uri}metadata.db`);
  if (!metadataFile.exists) {
    throw new Error("[seed-library] metadata.db not found after unzip");
  }

  const library = {
    id: LIBRARY_ID,
    name: LIBRARY_NAME,
    path: libraryDir.uri,
    metadataUri: metadataFile.uri,
    bookCount: 0,
    addedAt: Date.now(),
    dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
    sourceType: "local",
  };

  const { library: preparedLibrary } = await readBookCountFromLibrary(library);
  const { registerLibrary } = await import("@/src/domain/library/hooks/library-actions");
  await registerLibrary(preparedLibrary);
}
