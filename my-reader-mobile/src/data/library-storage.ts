import { File, Paths } from "expo-file-system";

import type { MobileLibrariesConfig } from "./types";

const CONFIG_FILE_NAME = "myreader-mobile-libraries.json";

function getConfigFile() {
  return new File(Paths.document, CONFIG_FILE_NAME);
}

export async function loadLibrariesConfig(): Promise<MobileLibrariesConfig> {
  const file = getConfigFile();

  if (!file.exists) {
    return { libraries: [], activeLibraryId: null, dataSources: [] };
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as Partial<MobileLibrariesConfig>;

    return {
      libraries: Array.isArray(parsed.libraries) ? parsed.libraries : [],
      activeLibraryId:
        typeof parsed.activeLibraryId === "string" ? parsed.activeLibraryId : null,
      dataSources: Array.isArray(parsed.dataSources) ? parsed.dataSources : [],
    };
  } catch {
    return { libraries: [], activeLibraryId: null, dataSources: [] };
  }
}

export async function saveLibrariesConfig(config: MobileLibrariesConfig) {
  const file = getConfigFile();

  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }

  file.write(JSON.stringify(config, null, 2));
}
