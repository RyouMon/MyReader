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
import m0011 from './0011_add_bookmark_sync_projection.sql';
import m0012 from './0012_add_automerge_sync_storage.sql';
import m0013 from './0013_add_reading_position_conflict_projection.sql';
import m0014 from './0014_remove_legacy_sidecar_sync.sql';
import m0015 from './0015_remove_hlc_projection_columns.sql';
import m0016 from './0016_discard_legacy_sync_state.sql';

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
    m0011,
    m0012,
    m0013,
    m0014,
    m0015,
    m0016,
  },
};
