// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_initial.sql';
import m0001 from './0001_add_book_reading_format.sql';
import m0002 from './0002_add_favorite_books.sql';
import m0003 from './0003_add_book_cover_thumbnail_cache.sql';
import m0004 from './0004_add_bookmarks.sql';
import m0005 from './0005_add_annotations.sql';
import m0006 from './0006_add_reading_progress_display_progression.sql';
import m0007 from './0007_add_reading_statistics.sql';
import m0008 from './0008_add_library_sidecar_sync_kernel.sql';
import m0009 from './0009_add_reading_progress_sync_clock.sql';
import m0010 from './0010_add_favorite_sync_projection.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
    m0010,
  },
};
