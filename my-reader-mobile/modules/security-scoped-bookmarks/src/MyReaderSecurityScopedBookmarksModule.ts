import { requireNativeModule } from 'expo';

import type {
  ResolveBookmarkResult,
  SecurityScopedBookmarkInfo,
} from './MyReaderSecurityScopedBookmarks.types';

declare class MyReaderSecurityScopedBookmarksModule {
  createBookmarkForDirectoryAsync(uri: string): Promise<SecurityScopedBookmarkInfo>;
  resolveBookmarkAsync(bookmarkBase64: string): Promise<ResolveBookmarkResult>;
  startAccessingBookmarkAsync(bookmarkBase64: string): Promise<ResolveBookmarkResult>;
  stopAccessingBookmark(uri: string): void;
}

export default requireNativeModule<MyReaderSecurityScopedBookmarksModule>('MyReaderSecurityScopedBookmarks');
