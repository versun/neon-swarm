/**
 * 永久积分榜（服务端单例）
 *
 * 规则：
 * - 仅以昵称为唯一键；
 * - 实时更新：每次击杀后立即用当前总击杀数刷新纪录，只保留历史最佳；
 * - Bot 永不记录（调用方保证）。
 *
 * 核心逻辑为纯内存高性能操作，持久化接口解耦，绝不依赖或阻塞游戏主循环。
 */

export type LbRow = [name: string, best: number];

const TOP_N = 20;

export class Leaderboard {
  private best = new Map<string, number>();
  private dirty = false;

  /** 启动时加载历史纪录（内存模式下为空） */
  async init(): Promise<void> {
    // 基础纯内存存储，不绑定任何特定 Node/MySQL 依赖
  }

  /** 击杀实时结算：总击杀数刷新昵称纪录时更新并标记广播；返回是否产生新纪录 */
  record(name: string, kills: number): boolean {
    if (!name || kills <= 0) return false;
    if (kills <= (this.best.get(name) ?? 0)) return false;
    this.best.set(name, kills);
    this.dirty = true;
    return true;
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
