/**
 * NEON SWARM — 快照插值 + 本机客户端预测 + 子弹外推
 *
 * - 其他战机渲染在服务器时间 ~120ms 之前：以快照到达的本地时间为时钟，
 *   在两个快照间对位置/角度插值（角度走最短弧）。
 * - 本机：按本地输入即时移动（客户端预测），每个快照向服务器位置软校正
 *   （误差 <2px 直接对齐，否则 lerp 收敛）。
 * - 子弹：最新快照位置 + angle × BULLET_SPEED 外推。
 */
import {
  BULLET_LIFE_S,
  BULLET_SPEED,
  SHIP_ACCEL,
  SHIP_DRAG,
  SHIP_SPEED,
} from "@contracts/game";
import type { BufferedSnapshot } from "./net";

/** 渲染相对最新快照的延迟（服务器时间 ~120ms 之前） */
export const INTERP_DELAY_MS = 120;
/** 超出最新快照后允许的外推窗口 */
const MAX_EXTRAPOLATE_MS = 100;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 角度插值走最短弧 */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export interface InterpShip {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  ammo: number;
  flags: number;
  /** 本轮生命累计命中数（升级触发进度） */
  hits: number;
  /** 已应用升级打包位（packUpg） */
  upg: number;
}

export interface InterpBullet {
  id: number;
  x: number;
  y: number;
  angle: number;
  ownerId: number;
}

const shipScratch = new Map<number, InterpShip>();
const bulletScratch: InterpBullet[] = [];

/**
 * 采样 renderTime（performance.now() 时钟，= now - INTERP_DELAY_MS）时刻的
 * 所有战机状态。结果写入共享 scratch Map（每帧复用，避免 GC）。
 */
export function sampleShips(
  snapshots: readonly BufferedSnapshot[],
  renderTime: number,
): Map<number, InterpShip> {
  shipScratch.clear();
  const n = snapshots.length;
  if (n === 0) return shipScratch;

  // 找到 bracketing 对：prev.localTime <= renderTime <= next.localTime
  let prev = snapshots[n - 1];
  let next: BufferedSnapshot | null = null;
  for (let i = n - 1; i >= 0; i--) {
    if (snapshots[i].localTime <= renderTime) {
      prev = snapshots[i];
      next = i + 1 < n ? snapshots[i + 1] : null;
      break;
    }
    prev = snapshots[i];
    next = null;
  }

  if (!next) {
    // renderTime 在最新快照之后（或只有一个快照）：取最新 + 短外推
    const over = Math.min(MAX_EXTRAPOLATE_MS, Math.max(0, renderTime - prev.localTime)) / 1000;
    for (const row of prev.ships) {
      const [id, x, y, vx, vy, angle, hp, ammo, flags, hits, upg] = row;
      shipScratch.set(id, {
        id,
        x: x + vx * over,
        y: y + vy * over,
        vx,
        vy,
        angle,
        hp,
        ammo,
        flags,
        hits,
        upg,
      });
    }
    return shipScratch;
  }

  const span = next.localTime - prev.localTime;
  const t = span > 0 ? Math.min(1, Math.max(0, (renderTime - prev.localTime) / span)) : 1;
  const nextById = new Map<number, (typeof next.ships)[number]>();
  for (const row of next.ships) nextById.set(row[0], row);

  for (const a of prev.ships) {
    const [id, ax, ay, avx, avy, aAngle, aHp, aAmmo, aFlags, aHits, aUpg] = a;
    const b = nextById.get(id);
    if (!b) {
      shipScratch.set(id, {
        id, x: ax, y: ay, vx: avx, vy: avy, angle: aAngle, hp: aHp, ammo: aAmmo, flags: aFlags, hits: aHits, upg: aUpg,
      });
      continue;
    }
    const [, bx, by, bvx, bvy, bAngle, bHp, bAmmo, bFlags, bHits, bUpg] = b;
    shipScratch.set(id, {
      id,
      x: lerp(ax, bx, t),
      y: lerp(ay, by, t),
      vx: lerp(avx, bvx, t),
      vy: lerp(avy, bvy, t),
      angle: lerpAngle(aAngle, bAngle, t),
      hp: t < 0.5 ? aHp : bHp,
      ammo: t < 0.5 ? aAmmo : bAmmo,
      flags: t < 0.5 ? aFlags : bFlags,
      hits: t < 0.5 ? aHits : bHits,
      upg: t < 0.5 ? aUpg : bUpg,
    });
  }
  return shipScratch;
}

/**
 * 子弹按最新快照位置 + angle × BULLET_SPEED 外推。
 * 外推时间封顶 BULLET_LIFE_S，避免断线时子弹飞出天际。
 */
export function sampleBullets(
  snapshots: readonly BufferedSnapshot[],
  now: number,
): InterpBullet[] {
  bulletScratch.length = 0;
  const n = snapshots.length;
  if (n === 0) return bulletScratch;
  const latest = snapshots[n - 1];
  const dt = Math.min(BULLET_LIFE_S, Math.max(0, (now - latest.localTime) / 1000));
  const dist = BULLET_SPEED * dt;
  for (const row of latest.bullets) {
    const [id, x, y, angle, ownerId] = row;
    bulletScratch.push({
      id,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      angle,
      ownerId,
    });
  }
  return bulletScratch;
}

/**
 * 本机客户端预测：输入即时生效；每快照向服务器位置/速度软校正。
 * 误差 <2px 直接对齐，否则按收敛速率 lerp 逼近（避免瞬移抖动）。
 * 物理模型与服务端 sim.ts 完全一致：加速 → 指数阻尼 → 限速 → 积分。
 */
export class LocalPredictor {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  private initialized = false;

  reset() {
    this.initialized = false;
    this.vx = 0;
    this.vy = 0;
  }

  /** 每帧调用：按本地输入以惯性模型积分移动（与服务端同公式） */
  applyInput(dt: number, ax: number, ay: number, angle: number) {
    if (!this.initialized) return;
    const len = Math.hypot(ax, ay);
    const scale = len > 1 ? 1 / len : 1;
    this.vx += ax * scale * SHIP_ACCEL * dt;
    this.vy += ay * scale * SHIP_ACCEL * dt;
    const drag = Math.exp(-SHIP_DRAG * dt);
    this.vx *= drag;
    this.vy *= drag;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp > SHIP_SPEED) {
      const k = SHIP_SPEED / sp;
      this.vx *= k;
      this.vy *= k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = angle;
  }

  /** 每个服务器快照调用：软校正到服务器权威位置与速度 */
  reconcile(serverX: number, serverY: number, serverVx = 0, serverVy = 0) {
    if (!this.initialized) {
      this.x = serverX;
      this.y = serverY;
      this.vx = serverVx;
      this.vy = serverVy;
      this.initialized = true;
      return;
    }
    const dx = serverX - this.x;
    const dy = serverY - this.y;
    const err = Math.hypot(dx, dy);
    // 收敛系数：误差越大回拉越强，单快照最多修正 35%
    const k = err < 2 ? 1 : Math.min(0.35, 0.08 + err / 600);
    this.x += dx * k;
    this.y += dy * k;
    // 速度同步校正，保持惯性滑行手感与服务器一致
    this.vx += (serverVx - this.vx) * k;
    this.vy += (serverVy - this.vy) * k;
  }
}
