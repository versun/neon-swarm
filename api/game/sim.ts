/**
 * NEON SWARM — 单房间内存态权威模拟（20Hz 逻辑 tick）
 *
 * 职责：移动、射击限流与弹药经济、子弹推进、空间网格碰撞、
 * 伤害 / 击毁 / 3 秒重生、动态世界扩展、事件队列。
 * 纯内存，无数据库依赖；子弹与事件对象走对象池以减少 GC 抖动。
 */
import {
  TICK_RATE,
  MAX_HP,
  HIT_HEAL,
  DAMAGE,
  MAX_AMMO,
  AMMO_REGEN_MS,
  FIRE_INTERVAL_MS,
  RESPAWN_MS,
  SHIP_ACCEL,
  SHIP_DRAG,
  SHIP_RADIUS,
  SHIP_HIT_RADIUS,
  SPAWN_MIN_DIST,
  SPAWN_NEAR_MIN,
  SPAWN_NEAR_MAX,
  BULLET_LIFE_S,
  BULLET_RADIUS,
  MAX_BULLETS,
  WORLD_INITIAL_RADIUS,
  WORLD_EXPAND_MARGIN,
  WORLD_EXPAND_STEP,
  FLAG_BOT,
  FLAG_HIDDEN,
  COLOR_POOL,
  UPGRADE_OPTIONS,
  UPGRADE_CHOICE_MS,
  upgradeThreshold,
  upgBulletSpeed,
  upgMoveSpeed,
  upgMaxHp,
  upgAmmoRegenRate,
  packUpg,
} from "../../contracts/game";
import type {
  WorldBounds,
  RosterEntry,
  ShipRow,
  BulletRow,
  GameEvent,
  MsgSnapshot,
} from "../../contracts/game";
import { leaderboard } from "./leaderboard";

const DT = 1 / TICK_RATE; // 固定步长（秒）
const GRID_CELL = 64; // 空间网格边长（> 2 * (SHIP_HIT_RADIUS + BULLET_RADIUS)，且 > 子弹单 tick 行程）
const SPAWN_INSET = SHIP_RADIUS + 50; // 出生点距世界边界的余量
const RESPAWN_TRIES = 40;
const DUAL_GUN_OFFSET = 10; // 双枪左右炮口垂直间距（px）

export interface Ship {
  id: number;
  name: string;
  colorIdx: number;
  isBot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  ammo: number;
  alive: boolean;
  kills: number;
  deaths: number;
  /** 本轮生命累计命中数（升级触发进度；重生清零） */
  hits: number;
  /** 已应用的升级次数（= 战机等级） */
  level: number;
  /** 弹速/移速/生命 各自已选级数；双枪限选一次 */
  lvBullet: number;
  lvMove: number;
  lvHp: number;
  dualGun: boolean;
  /** 子弹恢复速度加成级数（基础 1/s + 每级 1/s） */
  lvAmmoRegen: number;
  /** 生命恢复速度级数（每级 1/s） */
  lvHpRegen: number;
  /** 升级选择中：隐身冻结，deadline 前等待玩家选择 */
  upgradeUntil: number;
  respawnAt: number;
  lastFireAt: number;
  lastRegenAt: number;
  // 最新一帧客户端输入（与 MsgInput 字段一致；协议中的 seq 仅作客户端计数，服务端不消费）
  inAx: number;
  inAy: number;
  inAngle: number;
  inFire: 0 | 1;
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  /** 上一 tick 位置（扫掠碰撞线段起点） */
  px: number;
  py: number;
  vx: number;
  vy: number;
  angle: number;
  ownerId: number;
  age: number;
}

function gridKey(cx: number, cy: number): number {
  return ((cx & 0xffff) << 16) | (cy & 0xffff);
}

export class Sim {
  tick = 0;
  /** [minX, minY, maxX, maxY]，中心 0,0，可不对称扩展 */
  readonly world: WorldBounds = [
    -WORLD_INITIAL_RADIUS,
    -WORLD_INITIAL_RADIUS,
    WORLD_INITIAL_RADIUS,
    WORLD_INITIAL_RADIUS,
  ];
  readonly ships = new Map<number, Ship>();

  private bullets: Bullet[] = [];
  private bulletPool: Bullet[] = [];
  private events: GameEvent[] = [];
  private eventPool: GameEvent[] = [];
  private grid = new Map<number, Ship[]>();
  private gridPool: Ship[][] = [];
  private nextShipId = 1;
  private nextBulletId = 1;
  private nowMs = 0;

  // ───────────────────── 单位生命周期 ─────────────────────

  addUnit(name: string, isBot: boolean): Ship {
    const id = this.nextShipId++;
    const colorIdx = this.pickColor();
    // 新加入（玩家/Bot）：锚定随机一架存活战机同屏出生，落地即有遭遇战
    const p = this.findSpawnNear();
    const ship: Ship = {
      id,
      name,
      colorIdx,
      isBot,
      x: p.x,
      y: p.y,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      hp: MAX_HP,
      ammo: MAX_AMMO,
      alive: true,
      kills: 0,
      deaths: 0,
      hits: 0,
      level: 0,
      lvBullet: 0,
      lvMove: 0,
      lvHp: 0,
      dualGun: false,
      lvAmmoRegen: 0,
      lvHpRegen: 0,
      upgradeUntil: 0,
      respawnAt: 0,
      lastFireAt: 0,
      lastRegenAt: this.nowMs,
      inAx: 0,
      inAy: 0,
      inAngle: 0,
      inFire: 0,
    };
    this.ships.set(id, ship);
    this.emit("join", id, name, colorIdx, isBot ? 1 : 0);
    return ship;
  }

  removeUnit(id: number): void {
    if (this.ships.delete(id)) {
      this.emit("leave", id);
    }
  }

  setInput(id: number, ax: number, ay: number, angle: number, fire: 0 | 1): void {
    const s = this.ships.get(id);
    if (!s) return;
    s.inAx = Math.max(-1, Math.min(1, ax));
    s.inAy = Math.max(-1, Math.min(1, ay));
    if (Number.isFinite(angle)) s.inAngle = angle;
    s.inFire = fire;
  }

  roster(): RosterEntry[] {
    const out: RosterEntry[] = [];
    for (const s of this.ships.values()) {
      out.push([s.id, s.name, s.colorIdx, s.isBot ? 1 : 0, s.kills, s.deaths]);
    }
    return out;
  }

  // ───────────────────── 主循环 ─────────────────────

  step(nowMs: number): void {
    this.tick++;
    this.nowMs = nowMs;

    // 1) 重生 + 升级选择 + 移动 + 射击 + 弹药恢复
    for (const s of this.ships.values()) {
      if (!s.alive) {
        if (nowMs >= s.respawnAt) this.respawn(s);
        continue;
      }

      // 升级选择中：隐身冻结（不移动、不开火、不吃子弹、不被索敌），
      // 选择超时由服务器随机代选
      if (s.upgradeUntil > 0) {
        if (nowMs >= s.upgradeUntil) this.applyUpgrade(s, this.randomUpgradeOption(s));
        continue;
      }

      // 触发升级选择（仅真人；Bot 不参与升级）：累计命中达到阈值
      if (!s.isBot && s.hits >= upgradeThreshold(s.level)) {
        s.upgradeUntil = nowMs + UPGRADE_CHOICE_MS;
        s.vx = 0;
        s.vy = 0;
        s.inFire = 0;
        this.emit("offer", s.id, UPGRADE_CHOICE_MS);
        continue;
      }

      // 惯性物理（与客户端预测严格同公式）：
      // 输入限幅 → v += input * SHIP_ACCEL * dt → v *= exp(-SHIP_DRAG * dt)
      // → |v| 钳制到（升级加成后的）极速 → pos += v * dt
      let ax = s.inAx;
      let ay = s.inAy;
      const len = Math.hypot(ax, ay);
      if (len > 1) {
        ax /= len;
        ay /= len;
      }
      s.vx += ax * SHIP_ACCEL * DT;
      s.vy += ay * SHIP_ACCEL * DT;
      const drag = Math.exp(-SHIP_DRAG * DT);
      s.vx *= drag;
      s.vy *= drag;
      const maxSpeed = upgMoveSpeed(s.lvMove);
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxSpeed) {
        const k = maxSpeed / sp;
        s.vx *= k;
        s.vy *= k;
      }
      s.x += s.vx * DT;
      s.y += s.vy * DT;
      s.angle = s.inAngle;

      if (
        s.inFire === 1 &&
        s.ammo >= 1 &&
        nowMs - s.lastFireAt >= FIRE_INTERVAL_MS &&
        this.bullets.length < MAX_BULLETS
      ) {
        s.lastFireAt = nowMs;
        if (s.ammo >= MAX_AMMO) s.lastRegenAt = nowMs; // 满弹药开火时重置恢复计时
        // 升级加成：双枪齐射（每颗 1 弹药，弹药不足几颗打几颗）；弹速按 lvBullet 加成
        const shots = Math.min(s.dualGun ? 2 : 1, s.ammo);
        const speed = upgBulletSpeed(s.lvBullet);
        s.ammo -= shots;
        if (shots >= 2) {
          this.spawnBullet(s, -DUAL_GUN_OFFSET, speed);
          this.spawnBullet(s, DUAL_GUN_OFFSET, speed);
        } else {
          this.spawnBullet(s, 0, speed);
        }
      }

      if (s.ammo < MAX_AMMO && nowMs - s.lastRegenAt >= AMMO_REGEN_MS) {
        // 单 tick 最多追 1 个恢复周期，防止时钟跳变导致瞬间回满
        // 恢复速率：基础 AMMO_REGEN_AMOUNT/s + 升级加成 lvAmmoRegen/s
        const ticks = Math.min(
          1,
          Math.floor((nowMs - s.lastRegenAt) / AMMO_REGEN_MS),
        );
        s.ammo = Math.min(
          MAX_AMMO,
          s.ammo + ticks * upgAmmoRegenRate(s.lvAmmoRegen),
        );
        s.lastRegenAt += ticks * AMMO_REGEN_MS;
      }

      // 生命恢复（升级选项）：lvHpRegen 点/秒，封顶当前等级生命上限
      if (s.lvHpRegen > 0) {
        const cap = upgMaxHp(s.lvHp);
        if (s.hp < cap) s.hp = Math.min(cap, s.hp + s.lvHpRegen * DT);
      }
    }

    // 2) 子弹推进与寿命（记录上一位置用于扫掠碰撞）
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.age += DT;
      if (
        b.age >= BULLET_LIFE_S ||
        b.x < this.world[0] ||
        b.x > this.world[2] ||
        b.y < this.world[1] ||
        b.y > this.world[3]
      ) {
        this.releaseBullet(i);
      }
    }

    // 3) 扫掠式碰撞（子弹飞行线段 vs 战机圆，杜绝高速穿透/隧道效应）
    // 单 tick 行程 = BULLET_SPEED * DT = 45px > 旧点采样判定半径，会漏判；
    // 取线段上离圆心最近点判定，多个候选命中时取沿线最早者。
    this.rebuildGrid();
    const hitR = SHIP_HIT_RADIUS + BULLET_RADIUS;
    const hitR2 = hitR * hitR;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const sx = b.x - b.px;
      const sy = b.y - b.py;
      const len2 = sx * sx + sy * sy;
      const mx = Math.floor(((b.px + b.x) / 2) / GRID_CELL);
      const my = Math.floor(((b.py + b.y) / 2) / GRID_CELL);
      let victim: Ship | null = null;
      let bestT = Infinity;
      let hitX = b.x;
      let hitY = b.y;
      for (let gx = mx - 1; gx <= mx + 1; gx++) {
        for (let gy = my - 1; gy <= my + 1; gy++) {
          const cell = this.grid.get(gridKey(gx, gy));
          if (!cell) continue;
          for (const s of cell) {
            // 升级选择中的战机隐身：不吃子弹
            if (s.id === b.ownerId || !s.alive || s.upgradeUntil > 0) continue;
            // 线段上离圆心最近点的参数 t ∈ [0,1]
            let t = len2 > 0 ? ((s.x - b.px) * sx + (s.y - b.py) * sy) / len2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const cx = b.px + sx * t;
            const cy = b.py + sy * t;
            const dx = s.x - cx;
            const dy = s.y - cy;
            if (dx * dx + dy * dy > hitR2) continue;
            if (t < bestT) {
              bestT = t;
              victim = s;
              hitX = Math.round(cx);
              hitY = Math.round(cy);
            }
          }
        }
      }
      if (victim) {
        this.applyHit(victim, b, nowMs, hitX, hitY);
        this.releaseBullet(i);
      }
    }

    // 4) 动态世界扩展（不对称），随后把战机钳回界内
    let changed = false;
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      if (s.x < this.world[0] + WORLD_EXPAND_MARGIN) {
        this.world[0] -= WORLD_EXPAND_STEP;
        changed = true;
      }
      if (s.x > this.world[2] - WORLD_EXPAND_MARGIN) {
        this.world[2] += WORLD_EXPAND_STEP;
        changed = true;
      }
      if (s.y < this.world[1] + WORLD_EXPAND_MARGIN) {
        this.world[1] -= WORLD_EXPAND_STEP;
        changed = true;
      }
      if (s.y > this.world[3] - WORLD_EXPAND_MARGIN) {
        this.world[3] += WORLD_EXPAND_STEP;
        changed = true;
      }
    }
    if (changed) {
      this.emit("world", [
        this.world[0],
        this.world[1],
        this.world[2],
        this.world[3],
      ]);
      for (const s of this.ships.values()) {
        s.x = Math.max(this.world[0], Math.min(this.world[2], s.x));
        s.y = Math.max(this.world[1], Math.min(this.world[3], s.y));
      }
    }
  }

  // ───────────────────── 快照与事件 ─────────────────────

  /** 构造快照（仅存活实体 + 自上次快照以来累积的事件） */
  buildSnapshot(): MsgSnapshot {
    const shipRows: ShipRow[] = [];
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      shipRows.push([
        s.id,
        Math.round(s.x * 10) / 10,
        Math.round(s.y * 10) / 10,
        Math.round(s.vx),
        Math.round(s.vy),
        Math.round(s.angle * 1000) / 1000,
        Math.round(s.hp),
        Math.round(s.ammo),
        (s.isBot ? FLAG_BOT : 0) | (s.upgradeUntil > 0 ? FLAG_HIDDEN : 0),
        s.hits,
        packUpg(s.lvBullet, s.lvMove, s.lvHp, s.dualGun, s.lvAmmoRegen, s.lvHpRegen),
      ]);
    }
    const bulletRows: BulletRow[] = [];
    for (const b of this.bullets) {
      bulletRows.push([
        b.id,
        Math.round(b.x * 10) / 10,
        Math.round(b.y * 10) / 10,
        Math.round(b.angle * 1000) / 1000,
        b.ownerId,
      ]);
    }
    return ["s", this.tick, shipRows, bulletRows, this.events];
  }

  /** 快照序列化完成后调用，回收事件对象到对象池 */
  releaseEvents(): void {
    for (const e of this.events) this.eventPool.push(e);
    this.events = [];
  }

  // ───────────────────── 内部实现 ─────────────────────

  private emit(...args: (string | number | WorldBounds)[]): void {
    const e = this.eventPool.pop() ?? ([] as unknown as GameEvent);
    (e as unknown as unknown[]).length = 0;
    for (const a of args) (e as unknown as unknown[]).push(a);
    this.events.push(e);
  }

  /**
   * 生成一颗子弹。perpOffset 为垂直于机首方向的偏移（双枪左右炮口），
   * speed 为武器等级加成后的弹速。
   */
  private spawnBullet(s: Ship, perpOffset: number, speed: number): void {
    const b = this.bulletPool.pop() ?? {
      id: 0,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      ownerId: 0,
      age: 0,
    };
    b.id = this.nextBulletId++;
    b.angle = s.angle;
    const cos = Math.cos(s.angle);
    const sin = Math.sin(s.angle);
    // 炮口位置：机首前方 + 垂直偏移（双枪从左右机炮分别射出）
    b.x = s.x + cos * (SHIP_RADIUS + BULLET_RADIUS + 1) - sin * perpOffset;
    b.y = s.y + sin * (SHIP_RADIUS + BULLET_RADIUS + 1) + cos * perpOffset;
    b.px = b.x;
    b.py = b.y;
    b.vx = cos * speed;
    b.vy = sin * speed;
    b.ownerId = s.id;
    b.age = 0;
    this.bullets.push(b);
  }

  private releaseBullet(index: number): void {
    const last = this.bullets.length - 1;
    const b = this.bullets[index];
    this.bullets[index] = this.bullets[last];
    this.bullets.pop();
    this.bulletPool.push(b);
  }

  private applyHit(
    victim: Ship,
    b: Bullet,
    nowMs: number,
    hitX: number,
    hitY: number,
  ): void {
    victim.hp -= DAMAGE;
    const shooter = this.ships.get(b.ownerId);
    if (shooter && shooter.alive) {
      // 命中回血：开火者 +HIT_HEAL（封顶当前等级生命上限）
      const cap = upgMaxHp(shooter.lvHp);
      if (shooter.hp < cap) {
        shooter.hp = Math.min(cap, shooter.hp + HIT_HEAL);
      }
      // 升级触发进度：累计命中 +1（仅真人计数；Bot 不参与升级；重生清零）
      if (!shooter.isBot) shooter.hits++;
    }
    this.emit(
      "hit",
      victim.id,
      hitX,
      hitY,
      Math.round(b.angle * 1000) / 1000,
      b.ownerId,
    );
    if (victim.hp > 0) return;
    victim.alive = false;
    victim.deaths++;
    victim.vx = 0;
    victim.vy = 0;
    victim.inFire = 0;
    victim.respawnAt = nowMs + RESPAWN_MS;
    const killer = this.ships.get(b.ownerId);
    if (killer) {
      killer.kills++;
      // 实时积分榜：每次击杀立即刷新该昵称的最高击杀数（仅真人；取历史最佳）
      if (!killer.isBot) leaderboard.record(killer.name, killer.kills);
    }
    this.emit("kill", b.ownerId, victim.id);
  }

  /** 玩家升级选择（C→S ["u", option]）；校验：选择窗口内 + dual 限选一次 */
  chooseUpgrade(id: number, option: number): void {
    const s = this.ships.get(id);
    if (!s || !s.alive || s.upgradeUntil === 0) return;
    if (option < 0 || option >= UPGRADE_OPTIONS.length) return;
    if (UPGRADE_OPTIONS[option] === "dual" && s.dualGun) return;
    this.applyUpgrade(s, option);
  }

  /** 选择窗口内可选的合法选项（dual 已选过时剔除） */
  private randomUpgradeOption(s: Ship): number {
    const pool: number[] = [];
    for (let i = 0; i < UPGRADE_OPTIONS.length; i++) {
      if (UPGRADE_OPTIONS[i] === "dual" && s.dualGun) continue;
      pool.push(i);
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** 应用升级：等级 +1、恢复全部生命与弹药、广播升级事件（动效） */
  private applyUpgrade(s: Ship, option: number): void {
    s.upgradeUntil = 0;
    s.level++;
    switch (UPGRADE_OPTIONS[option]) {
      case "bullet":
        s.lvBullet++;
        break;
      case "move":
        s.lvMove++;
        break;
      case "hp":
        s.lvHp++;
        break;
      case "dual":
        s.dualGun = true;
        break;
      case "ammoRegen":
        s.lvAmmoRegen++;
        break;
      case "hpRegen":
        s.lvHpRegen++;
        break;
    }
    // 选择后恢复所有生命值与子弹数量（生命上限按新等级计算）
    s.hp = upgMaxHp(s.lvHp);
    s.ammo = MAX_AMMO;
    this.emit("upgrade", s.id, option, Math.round(s.x), Math.round(s.y));
  }

  private respawn(s: Ship): void {
    // 与加入战场同一套就近逻辑：锚定随机存活战机同屏重生，保证重生后有机可打
    // （此时本机仍为阵亡状态，findSpawnNear 的锚点与净空检查天然排除自己）
    const p = this.findSpawnNear();
    s.x = p.x;
    s.y = p.y;
    s.vx = 0;
    s.vy = 0;
    s.hp = MAX_HP;
    s.ammo = MAX_AMMO;
    // 重生后战机等级清零，重新开始
    s.hits = 0;
    s.level = 0;
    s.lvBullet = 0;
    s.lvMove = 0;
    s.lvHp = 0;
    s.dualGun = false;
    s.lvAmmoRegen = 0;
    s.lvHpRegen = 0;
    s.upgradeUntil = 0;
    s.alive = true;
    s.lastFireAt = 0;
    s.lastRegenAt = this.nowMs;
    s.inAx = 0;
    s.inAy = 0;
    s.inFire = 0;
    this.emit("respawn", s.id, Math.round(s.x), Math.round(s.y));
  }

  private rebuildGrid(): void {
    for (const arr of this.grid.values()) {
      arr.length = 0;
      this.gridPool.push(arr);
    }
    this.grid.clear();
    for (const s of this.ships.values()) {
      if (!s.alive) continue;
      const key = gridKey(
        Math.floor(s.x / GRID_CELL),
        Math.floor(s.y / GRID_CELL),
      );
      let arr = this.grid.get(key);
      if (!arr) {
        arr = this.gridPool.pop() ?? [];
        this.grid.set(key, arr);
      }
      arr.push(s);
    }
  }

  /**
   * 就近出生：随机锚定一架存活战机，在其 SPAWN_NEAR_MIN–MAX 距离环带上取点；
   * 要求在世界边界内、且不贴近任何存活战机（≥SPAWN_NEAR_MIN）。失败回退 findSpawn。
   */
  private findSpawnNear(): { x: number; y: number } {
    const anchors: Ship[] = [];
    for (const s of this.ships.values()) if (s.alive) anchors.push(s);
    if (anchors.length === 0) return this.findSpawn(SPAWN_MIN_DIST);
    const [minX, minY, maxX, maxY] = this.world;
    const clear2 = SPAWN_NEAR_MIN * SPAWN_NEAR_MIN;
    for (let i = 0; i < RESPAWN_TRIES; i++) {
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      const ang = Math.random() * Math.PI * 2;
      const dist =
        SPAWN_NEAR_MIN + Math.random() * (SPAWN_NEAR_MAX - SPAWN_NEAR_MIN);
      const x = a.x + Math.cos(ang) * dist;
      const y = a.y + Math.sin(ang) * dist;
      if (
        x < minX + SPAWN_INSET ||
        x > maxX - SPAWN_INSET ||
        y < minY + SPAWN_INSET ||
        y > maxY - SPAWN_INSET
      )
        continue;
      let ok = true;
      for (const s of this.ships.values()) {
        if (!s.alive) continue;
        const dx = x - s.x;
        const dy = y - s.y;
        if (dx * dx + dy * dy < clear2) {
          ok = false;
          break;
        }
      }
      if (ok) return { x, y };
    }
    return this.findSpawn(SPAWN_MIN_DIST);
  }

  /**
   * 远距随机出生（findSpawnNear 的回退）：在世界内随机找与所有存活战机
   * 距离 >= clearance 的点（尽力而为）；多次尝试不满足时取离最近敌机最远的候选。
   */
  private findSpawn(clearance: number): { x: number; y: number } {
    const [minX, minY, maxX, maxY] = this.world;
    let bestX = 0;
    let bestY = 0;
    let bestDist = -1;
    const c2 = clearance * clearance;
    for (let i = 0; i < RESPAWN_TRIES; i++) {
      const x =
        minX + SPAWN_INSET + Math.random() * (maxX - minX - SPAWN_INSET * 2);
      const y =
        minY + SPAWN_INSET + Math.random() * (maxY - minY - SPAWN_INSET * 2);
      let minD2 = Infinity;
      for (const s of this.ships.values()) {
        if (!s.alive) continue;
        const dx = x - s.x;
        const dy = y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < minD2) minD2 = d2;
      }
      if (minD2 >= c2) return { x, y };
      if (minD2 > bestDist) {
        bestDist = minD2;
        bestX = x;
        bestY = y;
      }
    }
    return { x: bestX, y: bestY };
  }

  private pickColor(): number {
    const used = new Set<number>();
    for (const s of this.ships.values()) used.add(s.colorIdx);
    const free: number[] = [];
    for (let i = 0; i < COLOR_POOL.length; i++) {
      if (!used.has(i)) free.push(i);
    }
    if (free.length > 0) return free[Math.floor(Math.random() * free.length)];
    return Math.floor(Math.random() * COLOR_POOL.length);
  }
}
