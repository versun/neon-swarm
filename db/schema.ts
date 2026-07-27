import {
  mysqlTable,
  serial,
  varchar,
  int,
  timestamp,
} from "drizzle-orm/mysql-core";

/**
 * 永久积分榜：以昵称为唯一键，仅记录该昵称死亡结算时的最高连杀数。
 * 由 api/game/leaderboard.ts 读写；中途退出/断连不产生任何记录。
 */
export const gameScores = mysqlTable("game_scores", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  bestStreak: int("best_streak").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
