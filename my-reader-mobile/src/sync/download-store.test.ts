jest.mock("./connectivity", () => ({
  checkConnectivity: jest.fn(() => Promise.resolve()),
}));

import {
  __downloadStoreTestApi,
  cancel,
  enqueue,
} from "./download-store";
import {
  completeNativeDownload,
  recoverNativeDownloads,
  type NativeDownloadRecoveredHandlers,
} from "../services/download/native";
import { finalizeRecoveredDownload } from "./download-service";

jest.mock("./download-service", () => ({
  downloadLibraryFileForQueue: jest.fn(() => Promise.resolve({ blake3: null, size: 1, mtimeMs: 1 })),
  finalizeRecoveredDownload: jest.fn(() => Promise.resolve({ blake3: null, size: 100, mtimeMs: 1 })),
}));

jest.mock("../services/download/native", () => ({
  cancelNativeDownload: jest.fn(),
  completeNativeDownload: jest.fn(),
  isNativeCancel: jest.fn((error: string, errorCode: number) => errorCode === -999 || error.includes("cancel")),
  recoverNativeDownloads: jest.fn(() => Promise.resolve([])),
}));

describe("download-store queue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __downloadStoreTestApi.reset();
  });

  test("deduplicates active downloads by library and path", async () => {
    const firstId = await enqueue({
      libraryId: "library-1",
      relativePath: "Book/book.epub",
      label: "Book",
    });
    const secondId = await enqueue({
      libraryId: "library-1",
      relativePath: "Book/book.epub",
      label: "Book",
    });

    expect(secondId).toBe(firstId);
    expect(__downloadStoreTestApi.getState().tasks).toHaveLength(1);
  });

  test("cancels queued tasks without starting native work", async () => {
    const firstId = await enqueue({
      libraryId: "library-1",
      relativePath: "Book/first.epub",
      label: "First",
    });
    const secondId = await enqueue({
      libraryId: "library-1",
      relativePath: "Book/second.epub",
      label: "Second",
    });
    const thirdId = await enqueue({
      libraryId: "library-1",
      relativePath: "Book/third.epub",
      label: "Third",
    });

    expect(firstId).not.toBe(secondId);
    cancel(thirdId);

    const third = __downloadStoreTestApi.getState().tasks.find((task) => task.id === thirdId);
    expect(third?.status).toBe("cancelled");
  });
});

describe("download-store recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __downloadStoreTestApi.reset();
  });

  test("finalizes a recovered DONE task only once when native done is replayed", async () => {
    let doneHandler: ((received: number, total: number) => void) | undefined;
    (recoverNativeDownloads as jest.Mock).mockResolvedValueOnce([
      {
        id: "task-1",
        metadata: {
          source: "myreader",
          libraryId: "library-1",
          relativePath: "Book/book.epub",
          label: "Book",
        },
        state: "DONE",
        bytesDownloaded: 100,
        bytesTotal: 100,
        bind: jest.fn((handlers: NativeDownloadRecoveredHandlers) => {
          doneHandler = handlers.onDone;
        }),
        stop: jest.fn(),
      },
    ]);

    await __downloadStoreTestApi.initializeExistingDownloadTasks();
    await Promise.resolve();
    doneHandler?.(100, 100);
    await Promise.resolve();

    expect(finalizeRecoveredDownload).toHaveBeenCalledTimes(1);
    expect(completeNativeDownload).toHaveBeenCalledTimes(1);
    expect(__downloadStoreTestApi.getState().tasks[0]?.status).toBe("done");
  });
});
