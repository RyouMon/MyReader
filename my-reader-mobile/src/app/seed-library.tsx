import { Directory, File as FSFile, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import { CommonActions } from "@react-navigation/native";
import { useNavigation } from "expo-router";
import { unzipSync } from "fflate";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { readBookCountFromLibrary } from "@/src/domain/library/calibre";
import { useAppStore } from "@/src/store/app-store";
import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";

const FIXTURE_ASSET = require("../../assets/e2e-fixtures/Example1.zip");
const LIBRARY_NAME = "Example1";

export default function SeedLibraryScreen() {
  const navigation = useNavigation();
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    seedLibrary()
      .then(() => {
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: "(tabs)" }] })
        );
      })
      .catch((error) => {
        console.error("[seed-library] failed:", error);
        navigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: "(tabs)" }] })
        );
      });
  }, []);

  return <View />;
}

async function seedLibrary() {
  const store = useAppStore.getState();

  // Skip if library already registered
  if (store.libraries.some((l) => l.name === LIBRARY_NAME)) {
    return;
  }

  // Skip if directory already exists from a previous partial seed
  const parentDir = new Directory(Paths.document, "MyReader");
  const existingDir = new Directory(parentDir.uri, LIBRARY_NAME);
  if (existingDir.exists) {
    const metadataFile = new FSFile(existingDir.uri, "metadata.db");
    if (metadataFile.exists) {
      const { library: preparedLibrary } = await readBookCountFromLibrary({
        id: `seed-${LIBRARY_NAME}`,
        name: LIBRARY_NAME,
        path: existingDir.uri,
        metadataUri: metadataFile.uri,
        bookCount: 0,
        addedAt: Date.now(),
        dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
        sourceType: "local",
      });
      const nextLibraries = [...store.libraries, preparedLibrary];
      const nextActiveLibraryId = store.activeLibraryId ?? preparedLibrary.id;
      useAppStore.setState({ libraries: nextLibraries, activeLibraryId: nextActiveLibraryId });
      return;
    }
    // Partial seed — clean up and re-seed
    existingDir.delete();
  }

  // Download zip asset
  const asset = Asset.fromModule(FIXTURE_ASSET);
  await asset.downloadAsync();

  if (!asset.localUri) {
    throw new Error("[seed-library] asset localUri not available");
  }

  // Read zip bytes
  const zipFile = new FSFile(asset.localUri);
  const zipBytes = await zipFile.bytes();

  // Unzip in-memory using fflate (pure JS, no native crash)
  const entries: Record<string, Uint8Array> = unzipSync(zipBytes);

  // Write entries to app Documents/MyReader/
  if (!parentDir.exists) {
    parentDir.create({ intermediates: true });
  }

  for (const [relativePath, data] of Object.entries(entries)) {
    const decodedPath = decodeURIComponent(relativePath);
    const targetUri = `${parentDir.uri}${decodedPath}`;

    // Directory entries are empty Uint8Arrays
    if (data.length === 0 && decodedPath.endsWith("/")) {
      const dir = new Directory(targetUri);
      if (!dir.exists) {
        dir.create({ intermediates: true });
      }
    } else {
      // Ensure parent directory exists
      const parentPath = decodedPath.substring(0, decodedPath.lastIndexOf("/") + 1);
      if (parentPath) {
        const dir = new Directory(`${parentDir.uri}${parentPath}`);
        if (!dir.exists) {
          dir.create({ intermediates: true });
        }
      }
      const file = new FSFile(targetUri);
      file.write(data);
    }
  }

  // After unzip, the directory structure is MyReader/Example1/metadata.db
  const libraryDir = new Directory(parentDir.uri, LIBRARY_NAME);
  const metadataFile = new FSFile(libraryDir.uri, "metadata.db");
  if (!metadataFile.exists) {
    throw new Error("[seed-library] metadata.db not found after unzip");
  }

  // Build minimal Library object — addResolvedLibrary handles metadata caching and bookCount
  const library = {
    id: `seed-${LIBRARY_NAME}`,
    name: LIBRARY_NAME,
    path: libraryDir.uri,
    metadataUri: metadataFile.uri,
    bookCount: 0,
    addedAt: Date.now(),
    dataSourceId: LOCAL_LIBRARY_DATA_SOURCE_ID,
    sourceType: "local",
  };

  const { library: preparedLibrary } = await readBookCountFromLibrary(library);
  const nextLibraries = [...useAppStore.getState().libraries, preparedLibrary];
  const nextActiveLibraryId = useAppStore.getState().activeLibraryId ?? preparedLibrary.id;
  useAppStore.setState({ libraries: nextLibraries, activeLibraryId: nextActiveLibraryId });
}
