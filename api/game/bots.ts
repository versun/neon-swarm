/**
 * NEON SWARM — Bot 调度与 AI（弱化版：更慢、更迟钝、瞄不准）
 *
 * - 玩家 + Bot 总数不足 MIN_UNITS(10) 时自动补 Bot；
 * - 真实玩家加入使总数超过 MIN_UNITS 时，优先移除距新玩家最远的 Bot；
 * - Bot 与玩家同 HP / 弹药数值，每 tick 生成同格式输入注入模拟；
 * - 弱化：移动输入力度 × BOT_SPEED_FACTOR，决策间隔 BOT_THINK_MS
 *   （目标选择 / 规避方向变更 / 瞄准误差刷新只在 think tick 发生），
 *   开火间隔 BOT_FIRE_INTERVAL_MS（独立于玩家 FIRE_INTERVAL_MS）。
 *
 * 行为：锁定最近敌机 → 保持 350–600px 环绕 → 距离 <600px 且有弹药时
 * 朝目标提前量 + 随机误差方向开火。
 */
import {
  MIN_UNITS,
  BOT_NAMES,
  BULLET_SPEED,
  BOT_SPEED_FACTOR,
  BOT_AIM_ERROR_RAD,
  BOT_FIRE_INTERVAL_MS,
  BOT_THINK_MS,
} from "../../contracts/game";
import type { Sim, Ship } from "./sim";

const ORBIT_MIN = 350;
const ORBIT_MAX = 600;
const ORBIT_MID = (ORBIT_MIN + ORBIT_MAX) / 2;

interface Brain {
  evadeDir: 1 | -1;
  phase: number; // 摆动相位，避免 Bot 动作同步
  targetId: number; // 当前锁定目标（0 = 无），仅 think tick 重新选择
  nextThinkAt: number; // 下一次决策时刻（ms）
  aimError: number; // 瞄准角随机偏移（rad），每次 think 刷新
  lastFireAt: number; // 上次开火时刻（ms），BOT_FIRE_INTERVAL_MS 限流
  mx: number; // 当前移动输入（已 × BOT_SPEED_FACTOR），think tick 间保持
  my: number;
}

export class BotManager {
  private sim: Sim;
  private brains = new Map<number, Brain>();
  private nameCursor = 0;

  constructor(sim: Sim) {
    this.sim = sim;
    this.rebalance();
  }

  countBots(): number {
    let n = 0;
    for (const s of this.sim.ships.values()) if (s.isBot) n++;
    return n;
  }

  /** 玩家人数变化后调用，维持总数 >= MIN_UNITS；joinRef 提供时移除多余 Bot */
  rebalance(joinRef?: { x: number; y: number }): void {
    while (this.sim.ships.size < MIN_UNITS) this.addBot();
    if (joinRef) {
      while (this.sim.ships.size > MIN_UNITS && this.countBots() > 0) {
        this.removeFarthestBot(joinRef);
      }
    }
  }

  /** 真实玩家加入后调用：移除距新玩家最远的多余 Bot */
  afterPlayerJoin(ship: Ship): void {
    this.rebalance({ x: ship.x, y: ship.y });
  }

  /** 玩家离开后调用：不足 MIN_UNITS 则补 Bot */
  afterPlayerLeave(): void {
    this.rebalance();
  }

  /** 每逻辑 tick 为所有存活 Bot 生成输入（决策按 BOT_THINK_MS 节流） */
  tick(nowMs: number): void {
    for (const [id, brain] of this.brains) {
      const s = this.sim.ships.get(id);
      if (!s) {
        this.brains.delete(id);
        continue;
      }
      if (!s.alive) {
        this.sim.setInput(id, 0, 0, s.angle, 0);
        continue;
      }

      // think tick：重选目标、换规避方向、刷新瞄准误差、重算移动输入
      if (nowMs >= brain.nextThinkAt) {
        brain.nextThinkAt = nowMs + BOT_THINK_MS;
        brain.evadeDir = Math.random() < 0.5 ? -1 : 1;
        brain.aimError = (Math.random() * 2 - 1) * BOT_AIM_ERROR_RAD;
        const target = this.nearestEnemy(s);
        brain.targetId = target ? target.id : 0;
        if (target) {
          this.updateMove(s, target, brain, nowMs);
        } else {
          brain.mx = 0;
          brain.my = 0;
        }
      }

      const target = brain.targetId
        ? this.sim.ships.get(brain.targetId)
        : undefined;
      // 升级选择中的战机隐身：不被索敌
      if (!target || !target.alive || target.upgradeUntil > 0) {
        this.sim.setInput(id, brain.mx, brain.my, s.angle, 0);
        continue;
      }

      // 提前量瞄准（每 tick 跟踪当前目标）+ think 刷新的随机误差
      const dx = target.x - s.x;
      const dy = target.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const tof = d / BULLET_SPEED;
      const aimX = target.x + target.vx * tof - s.x;
      const aimY = target.y + target.vy * tof - s.y;
      const angle = Math.atan2(aimY, aimX) + brain.aimError;

      // Bot 独立开火限流（BOT_FIRE_INTERVAL_MS，慢于玩家）
      let fire: 0 | 1 = 0;
      if (
        d < ORBIT_MAX &&
        s.ammo > 0 &&
        nowMs - brain.lastFireAt >= BOT_FIRE_INTERVAL_MS
      ) {
        fire = 1;
        brain.lastFireAt = nowMs;
      }
      this.sim.setInput(id, brain.mx, brain.my, angle, fire);
    }
  }

  // ───────────────────── 内部实现 ─────────────────────

  /** 距离控制（仅 think tick 调用）：>600 逼近，<350 拉开，区间内侧向环绕 */
  private updateMove(s: Ship, target: Ship, brain: Brain, nowMs: number): void {
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    let mx: number;
    let my: number;
    if (d > ORBIT_MAX) {
      mx = ux;
      my = uy;
    } else if (d < ORBIT_MIN) {
      mx = -ux;
      my = -uy;
    } else {
      const px = -uy * brain.evadeDir;
      const py = ux * brain.evadeDir;
      const rc = Math.max(-0.6, Math.min(0.6, (d - ORBIT_MID) / ORBIT_MID));
      mx = px + ux * rc;
      my = py + uy * rc;
    }

    // 小角度摆动（think tick 采样一次并保持），避免死板直线
    const w = Math.sin(nowMs / 400 + brain.phase) * 0.3;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    const rx = mx * cw - my * sw;
    const ry = mx * sw + my * cw;
    const len = Math.hypot(rx, ry) || 1;

    // Bot 弱化：输入力度 × BOT_SPEED_FACTOR，同一套惯性物理下明显更慢
    brain.mx = (rx / len) * BOT_SPEED_FACTOR;
    brain.my = (ry / len) * BOT_SPEED_FACTOR;
  }

  private addBot(): Ship {
    const ship = this.sim.addUnit(this.pickName(), true);
    this.brains.set(ship.id, {
      evadeDir: Math.random() < 0.5 ? -1 : 1,
      phase: Math.random() * Math.PI * 2,
      targetId: 0,
      nextThinkAt: 0,
      aimError: 0,
      lastFireAt: 0,
      mx: 0,
      my: 0,
    });
    return ship;
  }

  private pickName(): string {
    const used = new Set<string>();
    for (const s of this.sim.ships.values()) used.add(s.name);
    for (let i = 0; i < BOT_NAMES.length; i++) {
      const name = BOT_NAMES[(this.nameCursor + i) % BOT_NAMES.length];
      if (!used.has(name)) {
        this.nameCursor = (this.nameCursor + i + 1) % BOT_NAMES.length;
        return name;
      }
    }
    return `BOT-${++this.nameCursor}`;
  }

  private removeFarthestBot(ref: { x: number; y: number }): void {
    let best: Ship | null = null;
    let bestD2 = -1;
    for (const s of this.sim.ships.values()) {
      if (!s.isBot) continue;
      const dx = s.x - ref.x;
      const dy = s.y - ref.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > bestD2) {
        bestD2 = d2;
        best = s;
      }
    }
    if (!best) return;
    this.brains.delete(best.id);
    this.sim.removeUnit(best.id);
  }

  private nearestEnemy(s: Ship): Ship | null {
    let best: Ship | null = null;
    let bestD2 = Infinity;
    for (const t of this.sim.ships.values()) {
      // 升级选择中的战机隐身：不被索敌
      if (t.id === s.id || !t.alive || t.upgradeUntil > 0) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = t;
      }
    }
    return best;
  }
}
