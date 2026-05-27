import { LOCAL_LIBRARY_DATA_SOURCE_ID } from "@/src/constants/local-library-data-source";
import { excludeLocalLibrarySource } from "./app-store.constants";

describe("excludeLocalLibrarySource", () => {
  test("filters out builtin local data source id", () => {
    const result = excludeLocalLibrarySource([
      { id: LOCAL_LIBRARY_DATA_SOURCE_ID, hasPassword: false },
      { id: "webdav-1", hasPassword: false },
    ] as any);

    expect(result).toEqual([{ id: "webdav-1", hasPassword: false }]);
  });
});