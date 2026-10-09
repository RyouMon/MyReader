# Official Calibre schema fixtures

These are unmodified `resources/metadata_sqlite.sql` snapshots from Calibre. They
are independent of MyReader's entities and migrations and are used only in tests.

| Database schema | Calibre release | Upstream commit |
| --- | --- | --- |
| 25 | 6.14.0 | [70cfb56e](https://github.com/kovidgoyal/calibre/blob/70cfb56e1fc8b7a75ceed1b83c3e4468d0dfed14/resources/metadata_sqlite.sql) |
| 26 | 6.15.0 | [4c0961c1](https://github.com/kovidgoyal/calibre/blob/4c0961c1c07e8e4be6d56d50d6fe7a4839565ede/resources/metadata_sqlite.sql) |
| 27 | 9.0.0 | [84a4b177](https://github.com/kovidgoyal/calibre/blob/84a4b17782a6071ec866f825aa3ee1ce98da75d9/resources/metadata_sqlite.sql) |
| 28 | 9.16.0 | [61c4027d](https://github.com/kovidgoyal/calibre/blob/61c4027d2bfe737e0177e09952ee4942042a5892/resources/metadata_sqlite.sql) |

The integration test creates a SQLite database from each complete snapshot. For
seeding only, it removes the four book/series writer triggers that call Calibre's
Python `title_sort` and `uuid4` functions, and supplies their output explicitly.
All table definitions, indexes, views and other triggers remain as provided by
upstream. MyReader then opens the database read-only through its public catalog
and sync APIs. Compatibility with deliberately missing columns/tables is tested
separately from the official snapshots.

Calibre's upstream [COPYRIGHT](./COPYRIGHT) and [GPL-3 license](./LICENSE) are
included for these fixtures. They are not embedded in production binaries.
