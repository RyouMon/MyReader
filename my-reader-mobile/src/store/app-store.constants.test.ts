import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";
import { excludeLocalLibrarySource } from "./app-store.constants";
import type { DataSource } from "@/src/domain/types";

describe("excludeLocalLibrarySource", () => {
  test("filters out builtin local data source id", () => {
    const result = excludeLocalLibrarySource([
      { id: LOCAL_LIBRARY_DATA_SOURCE_ID, hasPassword: false } as DataSource,
      { id: "webdav-1", hasPassword: false } as DataSource,
    ]);

    expect(result).toEqual([{ id: "webdav-1", hasPassword: false }]);
  });
});