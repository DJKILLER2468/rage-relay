import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const rooms = sqliteTable("race_rooms", {
  code: text("code").primaryKey(), state: text("state").notNull(),
  version: integer("version").notNull().default(0), expiresAt: integer("expires_at").notNull(),
}, (table) => [index("race_rooms_expiry").on(table.expiresAt)]);
