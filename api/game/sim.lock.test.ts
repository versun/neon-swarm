/**
 * 准心锁定机制单元测试（服务端权威逻辑，白盒直驱 Sim）
 *
 * 覆盖：
 * - 对同一敌机连续命中 LOCK_HITS_REQUIRED 发触发 lock 事件
 * - 制导弹巡航转向（目标离轴机动仍被命中、弹角弯曲）
 * - 解锁三种原因：0=目标死亡 2=目标下线/隐身 3=锁定时长到期
 * - 锁定时长：基础 LOCK_DURATION_MS，升级「锁定时间」每级 +1s
 * - 命中他人重置累计；打空不断累计
 * - Bot 命中不触发锁定
 */
import { describe, it, expect } from "vitest";
import { Sim } from "./sim";
import {
  LOCK_HITS_REQUIRED,
  LOCK_DURATION_MS,
  LOCK_TIME_PER_LEVEL_MS,
  MAX_HP,
} from "../../contracts/game";
import type { GameEvent } from "../../contracts/game";

const STEP_MS = 50; // 20Hz

/** 每 tick 推进并收集本 tick 事件（buildSnapshot + releaseEvents，拷贝防对象池复用） */
function step(sim: Sim, now: number): GameEvent[] {
  sim.step(now);
  const snap = sim.buildSnapshot();
  // 事件为池化对象，必须立即拷贝
  const evs = snap[4].map((e) => [...e] as GameEvent);
  sim.releaseEvents();
  return evs;
}

/** 造一架静止在指定位置的战机（清速度、清输入） */
function place(ship: { x: number; y: number; vx: number; vy: number }, x: number, y: number) {
  ship.x = x;
  ship.y = y;
  ship.vx = 0;
  ship.vy = 0;
}

/** A 持续瞄准 +x 方向开火，跑到满足条件或超时；返回最后一批事件与经过 tick 数 */
function runUntil(
  sim: Sim,
  aId: number,
  cond: (evs: GameEvent[]) => boolean,
  maxTicks = 600,
): { evs: GameEvent[]; ticks: number } {
  let now = sim.tick * STEP_MS;
  for (let i = 0; i < maxTicks; i++) {
    now += STEP_MS;
    sim.setInput(aId, 0, 0, 0, 1);
    const evs = step(sim, now);
    if (cond(evs)) return { evs, ticks: i + 1 };
  }
  return { evs: [], ticks: maxTicks };
}

describe("准心锁定机制", () => {
  it("对同一敌机连续命中 4 发触发 lock，前 3 发不触发", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);

    let hitCount = 0;
    let lockAtHit = -1;
    let now = 0;
    for (let i = 0; i < 600 && lockAtHit < 0; i++) {
      now += STEP_MS;
      sim.setInput(A.id, 0, 0, 0, 1);
      const evs = step(sim, now);
      for (const e of evs) {
        if (e[0] === "hit" && e[5] === A.id && e[1] === B.id) hitCount++;
        if (e[0] === "lock") lockAtHit = hitCount;
      }
    }
    expect(lockAtHit).toBe(LOCK_HITS_REQUIRED);
    expect(A.lockTargetId).toBe(B.id);
    expect(B.hp).toBe(MAX_HP - LOCK_HITS_REQUIRED);
  });

  it("锁定后制导弹巡航转向：目标垂直机动仍被持续命中", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);

    // 先打出锁定
    runUntil(sim, A.id, (evs) => evs.some((e) => e[0] === "lock"));
    expect(A.lockTargetId).toBe(B.id);
    A.hits = 0; // 白盒清零，避免升级冻结干扰测试

    // B 垂直于弹线机动（A 仍朝 +x 直射，非制导弹必落空）
    B.vy = 120;
    let now = sim.tick * STEP_MS;
    let curved = false;
    let hitsAfter = 0;
    for (let i = 0; i < 400 && hitsAfter < 3; i++) {
      now += STEP_MS;
      sim.setInput(A.id, 0, 0, 0, 1);
      sim.setInput(B.id, 0, 1, 0, 0);
      const evs = step(sim, now);
      const snap = sim.buildSnapshot();
      for (const row of snap[3]) {
        if (row[4] === A.id && Math.abs(row[3]) > 0.01) curved = true; // 弹角偏离 0 = 已转向
      }
      sim.releaseEvents();
      for (const e of evs) {
        if (e[0] === "hit" && e[5] === A.id && e[1] === B.id) hitsAfter++;
      }
      if (B.hp < 5) B.hp = MAX_HP; // 防止打死后重生干扰
      A.hits = 0; // 避免升级冻结
    }
    expect(curved).toBe(true);
    expect(hitsAfter).toBeGreaterThanOrEqual(3);
  });

  it("锁定时长到期 → unlock reason 3（基础 3 秒）", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);

    runUntil(sim, A.id, (evs) => evs.some((e) => e[0] === "lock"));
    expect(A.lockTargetId).toBe(B.id);
    const lockTick = sim.tick;

    // 持续开火直到超时解锁；B 每 tick 回满血避免死亡解锁(0) 抢跑；清 A.hits 避免升级冻结
    let now = sim.tick * STEP_MS;
    let un: GameEvent | undefined;
    for (let i = 0; i < 200 && !un; i++) {
      now += STEP_MS;
      sim.setInput(A.id, 0, 0, 0, 1);
      const evs = step(sim, now);
      B.hp = MAX_HP;
      A.hits = 0;
      un = evs.find((e) => e[0] === "unlock");
    }
    expect(un).toEqual(["unlock", A.id, B.id, 3]);
    expect(A.lockTargetId).toBe(0);
    // 时长 ≈ LOCK_DURATION_MS（tick 粒度 ±2 tick）
    const elapsedMs = (sim.tick - lockTick) * STEP_MS;
    expect(elapsedMs).toBeGreaterThanOrEqual(LOCK_DURATION_MS - 2 * STEP_MS);
    expect(elapsedMs).toBeLessThanOrEqual(LOCK_DURATION_MS + 2 * STEP_MS);
  });

  it("升级「锁定时间」每级 +1s：lvLock=1 时锁定 4 秒", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);
    A.lvLock = 1; // 白盒：等价于已选一次锁定时间升级

    runUntil(sim, A.id, (evs) => evs.some((e) => e[0] === "lock"));
    expect(A.lockTargetId).toBe(B.id);
    const lockTick = sim.tick;

    let now = sim.tick * STEP_MS;
    let un: GameEvent | undefined;
    for (let i = 0; i < 200 && !un; i++) {
      now += STEP_MS;
      sim.setInput(A.id, 0, 0, 0, 1);
      const evs = step(sim, now);
      B.hp = MAX_HP;
      A.hits = 0;
      un = evs.find((e) => e[0] === "unlock");
    }
    expect(un).toEqual(["unlock", A.id, B.id, 3]);
    const want = LOCK_DURATION_MS + LOCK_TIME_PER_LEVEL_MS;
    const elapsedMs = (sim.tick - lockTick) * STEP_MS;
    expect(elapsedMs).toBeGreaterThanOrEqual(want - 2 * STEP_MS);
    expect(elapsedMs).toBeLessThanOrEqual(want + 2 * STEP_MS);
  });

  it("目标死亡 → unlock reason 0（在 kill 事件之前）", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);

    runUntil(sim, A.id, (evs) => evs.some((e) => e[0] === "lock"));
    expect(A.lockTargetId).toBe(B.id);
    A.hits = 0;

    B.hp = 1; // 下一发即致死
    const { evs } = runUntil(sim, A.id, (e) => e.some((x) => x[0] === "kill"));
    const unIdx = evs.findIndex((e) => e[0] === "unlock");
    const killIdx = evs.findIndex((e) => e[0] === "kill");
    expect(unIdx).toBeGreaterThanOrEqual(0);
    expect(evs[unIdx]).toEqual(["unlock", A.id, B.id, 0]);
    expect(unIdx).toBeLessThan(killIdx);
    expect(A.lockTargetId).toBe(0);
  });

  it("命中他人重置累计：B×3 → C×1 → B×3 不锁定，再中 B 1 发达 4 连发才锁定", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    const C = sim.addUnit("Carol", false);
    place(A, 0, 0);
    place(B, 200, 0);
    place(C, 2000, 0); // 先挪远

    const hitsOn = (id: number) => (e: GameEvent) =>
      e[0] === "hit" && e[5] === A.id && e[1] === id;
    const countUntil = (id: number, n: number) => {
      let c = 0;
      return (evs: GameEvent[]) => {
        for (const e of evs) if (hitsOn(id)(e)) c++;
        return c >= n;
      };
    };

    // 阶段 1：中 B 3 发（差 1 发锁定）
    runUntil(sim, A.id, countUntil(B.id, 3));
    expect(A.streakVictimId).toBe(B.id);
    expect(A.streakHits).toBe(3);

    // 阶段 2：B 挪走、C 上场，中 C 1 发 → 累计切换归零
    place(B, 200, 2000);
    place(C, 200, 0);
    runUntil(sim, A.id, countUntil(C.id, 1));
    expect(A.streakVictimId).toBe(C.id);
    expect(A.streakHits).toBe(1);

    // 阶段 3：C 挪走、B 回场，再中 B 3 发 → 对 B 的累计从 1 重计，仅 3 连，不得锁定
    place(C, 2000, 0);
    place(B, 200, 0);
    runUntil(sim, A.id, countUntil(B.id, 3));
    expect(A.streakVictimId).toBe(B.id);
    expect(A.streakHits).toBe(3);
    expect(A.lockTargetId).toBe(0);

    // 阶段 4：再中 B 1 发 → 连续第 4 发，触发锁定
    const { evs } = runUntil(sim, A.id, (e) => e.some((x) => x[0] === "lock"));
    expect(evs.some((e) => e[0] === "lock" && e[2] === B.id)).toBe(true);
    expect(A.lockTargetId).toBe(B.id);
  });

  it("目标下线 → unlock reason 2", () => {
    const sim = new Sim();
    const A = sim.addUnit("Alpha", false);
    const B = sim.addUnit("Bravo", false);
    place(A, 0, 0);
    place(B, 200, 0);

    runUntil(sim, A.id, (evs) => evs.some((e) => e[0] === "lock"));
    expect(A.lockTargetId).toBe(B.id);

    sim.removeUnit(B.id);
    const now = (sim.tick + 1) * STEP_MS;
    const evs = step(sim, now);
    expect(evs).toContainEqual(["unlock", A.id, B.id, 2]);
    expect(A.lockTargetId).toBe(0);
  });

  it("Bot 命中不触发锁定", () => {
    const sim = new Sim();
    const D = sim.addUnit("Bot-1", true);
    const E = sim.addUnit("Echo", false);
    place(D, 0, 0);
    place(E, 200, 0);

    let hits = 0;
    let sawLock = false;
    let now = 0;
    for (let i = 0; i < 1200 && hits < LOCK_HITS_REQUIRED + 2; i++) {
      now += STEP_MS;
      sim.setInput(D.id, 0, 0, 0, 1);
      const evs = step(sim, now);
      for (const e of evs) {
        if (e[0] === "hit" && e[5] === D.id && e[1] === E.id) hits++;
        if (e[0] === "lock") sawLock = true;
      }
    }
    expect(hits).toBeGreaterThanOrEqual(LOCK_HITS_REQUIRED);
    expect(sawLock).toBe(false);
    expect(D.lockTargetId).toBe(0);
  });
});
