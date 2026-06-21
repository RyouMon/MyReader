import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";
import type { DataSource } from "@/src/domain/types";
import type { FontFamilyKey } from "@/src/store/app-store.types";
import { buildPreferences } from "@/src/features/reader/components/reader/reflow/ReadiumReflowReader";

import { defaultSettings, excludeLocalLibrarySource } from "./app-store.constants";

describe("excludeLocalLibrarySource", () => {
  test("filters out builtin local data source id", () => {
    const result = excludeLocalLibrarySource([
      { id: LOCAL_LIBRARY_DATA_SOURCE_ID, hasPassword: false } as DataSource,
      { id: "webdav-1", hasPassword: false } as DataSource,
    ]);

    expect(result).toEqual([{ id: "webdav-1", hasPassword: false }]);
  });
});

describe("defaultSettings", () => {
  test("reflowable settings include fontFamily and drop brightness", () => {
    expect(defaultSettings.reflowable).toEqual(
      expect.objectContaining({
        theme: "paper",
        fontFamily: "serif",
        fontSize: 18,
        lineHeight: 1.85,
        paddingX: 20,
        textAlign: "auto",
        columnCount: "auto",
      }),
    );
    expect("brightness" in defaultSettings.reflowable).toBe(false);
  });

  test("fixed settings use background/navigation/progression/spread and drop theme/brightness/zoomScale", () => {
    expect(defaultSettings.fixed).toEqual(
      expect.objectContaining({
        background: "auto",
        navigationMode: "horizontal",
        readingProgression: "ltr",
        spread: "auto",
      }),
    );
    for (const removed of ["theme", "brightness", "zoomScale"]) {
      expect(removed in defaultSettings.fixed).toBe(false);
    }
  });
});

describe("buildPreferences fontFamily", () => {
  const build = (fontFamily: FontFamilyKey) =>
    buildPreferences("paper", fontFamily, 18, 1.85, 20, "auto", "auto");

  test("serif maps to the serif family", () => {
    expect(build("serif").fontFamily).toBe("serif");
  });

  test("sans maps to the sans-serif family", () => {
    expect(build("sans").fontFamily).toBe("sans-serif");
  });

  test("system omits fontFamily so Readium uses its default", () => {
    expect(build("system").fontFamily).toBeUndefined();
  });
});
