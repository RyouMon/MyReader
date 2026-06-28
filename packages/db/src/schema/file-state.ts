import {
  sqliteTable,
  integer,
  text,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

export const fileState = sqliteTable(
  "file_state",
  {
    id: text("id").notNull().primaryKey(),
    path: text("path").notNull(),
    localState: text("local_state", {
      enum: ["remote_only", "present", "local_only", "dirty_push"],
    }).notNull(),
    localBlake3: text("local_blake3"),
    localSize: integer("local_size"),
    localMtime: integer("local_mtime"),
    updatedAt: real("updated_at").notNull().default(0),
  },
  (t) => [uniqueIndex("idx_file_state_path").on(t.path)],
)
