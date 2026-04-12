import { NativeModule, registerWebModule } from 'expo';

class MyReaderSecurityScopedBookmarksModule extends NativeModule<Record<never, never>> {
  async createBookmarkForDirectoryAsync(): Promise<never> {
    throw new Error('Security-scoped bookmarks are only supported on iOS.');
  }

  async resolveBookmarkAsync(): Promise<never> {
    throw new Error('Security-scoped bookmarks are only supported on iOS.');
  }

  async startAccessingBookmarkAsync(): Promise<never> {
    throw new Error('Security-scoped bookmarks are only supported on iOS.');
  }

  stopAccessingBookmark(): void {
    // no-op on web
  }
}

export default registerWebModule(MyReaderSecurityScopedBookmarksModule, 'MyReaderSecurityScopedBookmarks');
