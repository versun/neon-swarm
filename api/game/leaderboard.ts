/**
 * 永久积分榜（服务端单例）
 *
 * 规则：
 * - 仅以昵称为唯一键；
 * - 实时更新：每次击杀后立即用当前总击杀数刷新纪录，只保留历史最佳；
 * - Bot 永不记录（调用方保证）。
 *
 * 持久化走 MySQL（game_scores 表）；数据库不可用时降级为进程内存，
 * 绝不阻塞或影响游戏主循环（所有 DB 操作均为异步 fire-and-forget + try/catch）。
 */
import { getDb } from "../queries/connection";
// 相对路径导入：@db 别名在 vite.config 直引 api 链路与 esbuild 打包时无法解析
import { gameScores } from "../../db/schema";

export type LbRow = [name: string, best: number];

const TOP_N = 20;

class Leaderboard {
  private best = new Map<string, number>();
  private dbReady = false;
  private dirty = false;

  /** 启动时加载历史纪录；失败则内存模式继续 */
  async init(): Promise<void> {
    try {
      const rows = await getDb().select().from(gameScores);
      for (const r of rows) this.best.set(r.name, r.bestStreak);
      this.dbReady = true;
    } catch (e) {
      console.warn("[leaderboard] DB 不可用，使用内存积分榜:", (e as Error).message);
    }
  }

  /** 击杀实时结算：总击杀数刷新昵称纪录时更新并标记广播；返回是否产生新纪录 */
  record(name: string, kills: number): boolean {
    if (!name || kills <= 0) return false;
    if (kills <= (this.best.get(name) ?? 0)) return false;
    this.best.set(name, kills);
    this.dirty = true;
    void this.persist(name, kills);
    return true;
  }

  private async persist(name: string, best: number): Promise<void> {
    if (!this.dbReady) return;
    try {
      await getDb()
        .insert(gameScores)
        .values({ name, bestStreak: best })
        .onDuplicateKeyUpdate({ set: { bestStreak: best } });
    } catch (e) {
      console.warn("[leaderboard] 写入失败:", (e as Error).message);
    }
  }

  top(): LbRow[] {
    return [...this.best.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_N);
  }

  /** 快照广播节拍调用：有新纪录时返回 true 并重置标记 */
  consumeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
}

export const leaderboard = new Leaderboard();
