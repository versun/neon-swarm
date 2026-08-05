/**
 * NEON SWARM — 实时对战协议契约（前端 / 后端共享）
 *
 * 传输：WebSocket，路径 `/ws`，消息为紧凑 JSON 数组（减少 payload）。
 * 所有坐标为世界坐标（px），角度为弧度（0 = +X 方向，逆时针为正）。
 * 服务端权威：20Hz 逻辑模拟，15Hz 快照广播；客户端 60fps 插值渲染。
 */

// ───────────────────────────── 常量 ─────────────────────────────

export const TICK_RATE = 20; // 服务端逻辑 tick / 秒
export const SNAPSHOT_RATE = 15; // 快照广播 / 秒（服务端用累加器在 20Hz tick 中调度：每 4 tick 广播 3 次）

export const MAX_HP = 15;
export const DAMAGE = 1; // 单发伤害（15 发击毁）
export const MAX_AMMO = 50;
export const AMMO_REGEN_AMOUNT = 1; // 每 AMMO_REGEN_MS 恢复的弹药
export const AMMO_REGEN_MS = 1000;
export const HIT_HEAL = 1; // 命中敌机时开火者恢复的 HP（封顶当前等级生命上限 upgMaxHp）
export const FIRE_INTERVAL_MS = 200; // 射速上限 5 发/秒
export const RESPAWN_MS = 3000;

/** 昵称最大长度（前后端统一：输入框 maxLength、net 截断、服务端 sanitize） */
export const MAX_NAME_LEN = 10;

// ── 惯性物理（服务端模拟与客户端预测必须使用同一模型） ──
export const SHIP_SPEED = 300; // 最大速度 px/s（速度钳制上限）
export const SHIP_ACCEL = 900; // 推进加速度 px/s²（输入向量满幅时）
export const SHIP_DRAG = 1.8; // 指数阻尼系数 1/s：v *= exp(-SHIP_DRAG * dt)
export const SHIP_RADIUS = 16; // 视觉半径（渲染用）
export const SHIP_HIT_RADIUS = 26; // 受击判定半径（> 视觉半径，降低命中难度）
export const BULLET_SPEED = 900; // px/s（较快弹速减少提前量需求）
export const BULLET_LIFE_S = 1.8;
export const BULLET_RADIUS = 8; // 子弹判定半径（碰撞 = SHIP_HIT_RADIUS + BULLET_RADIUS，扫掠判定）
export const MAX_BULLETS = 240;

// ── 准心锁定（连续命中同一敌机触发，制导弹巡航固定时长；仅真人玩家，Bot 不参与） ──
/** 触发锁定所需的连续命中数（命中其他目标会重置累计；打空不断） */
export const LOCK_HITS_REQUIRED = 4;
/** 基础锁定时长（毫秒）：到期自动释放；升级选项「锁定时间」每级 +LOCK_TIME_PER_LEVEL_MS */
export const LOCK_DURATION_MS = 3000;
/** 升级选项「锁定时间」每级增加的锁定毫秒数 */
export const LOCK_TIME_PER_LEVEL_MS = 1000;
/** 制导子弹转向速率 rad/s（速度大小不变，纯追踪 + 提前量） */
export const LOCK_TURN_RATE = 7;
/** 锁定时长（毫秒）：基础 3s + 锁定时间升级每级 +1s */
export function upgLockDurationMs(lvLock: number): number {
  return LOCK_DURATION_MS + lvLock * LOCK_TIME_PER_LEVEL_MS;
}

/** 找不到就近锚点时的回退出生净空距离（远距随机出生） */
export const SPAWN_MIN_DIST = 800;

/** 出生/重生：锚定随机一架存活战机同屏出现——距离区间（不贴脸但抬头可见） */
export const SPAWN_NEAR_MIN = 320;
export const SPAWN_NEAR_MAX = 720;

// ── Bot 弱化（更慢、更笨） ──
export const BOT_SPEED_FACTOR = 0.45; // Bot 输入力度系数（更慢）
export const BOT_AIM_ERROR_RAD = 0.28; // Bot 瞄准随机误差（弧度）
export const BOT_FIRE_INTERVAL_MS = 400; // Bot 射速上限（低于玩家）
export const BOT_THINK_MS = 900; // Bot 决策间隔（反应更迟钝）

export const WORLD_INITIAL_RADIUS = 4000; // 初始世界：[-4000, 4000]²
export const WORLD_EXPAND_MARGIN = 800; // 距边界小于该值时扩展
export const WORLD_EXPAND_STEP = 2000;

export const MIN_UNITS = 10; // 战场最少战斗单位（不足补 Bot）
export const MAX_INPUT_HZ = 30; // 客户端输入限流
/** 服务端心跳周期：每轮 ping 一次，连续两轮（60s）无任何消息/pong 才判定死连接。
 * 窗口须容忍移动网络闪断与代理吞控制帧，同时远低于常见反向代理空闲超时（≥60s 有快照下行不会触发）。 */
export const HEARTBEAT_MS = 30000;

/** 战机霓虹色池（快照中只传索引，省字节） */
export const COLOR_POOL = [
  "#22D3EE",
  "#E935C1",
  "#A3E635",
  "#F97316",
  "#8B5CF6",
  "#FACC15",
  "#38BDF8",
  "#FB7185",
  "#34D399",
  "#F472B6",
] as const;

export const BOT_NAMES = [
  "BOT-AXON",
  "BOT-VOLT",
  "BOT-NOVA",
  "BOT-FLUX",
  "BOT-RAZOR",
  "BOT-ECHO",
  "BOT-ONYX",
  "BOT-PYRO",
  "BOT-ZEPHYR",
  "BOT-HELIX",
] as const;

// ───────────────────────────── 标志位 ─────────────────────────────

/** ship 状态 flags 位（注意：阵亡战机不下发快照行，故无 DEAD 位——死亡由 kill 事件 + 快照行消失表达） */
export const FLAG_BOT = 1 << 0; // 是 Bot
export const FLAG_HIDDEN = 1 << 2; // 升级选择中：隐身（不渲染、不吃子弹、不被 Bot 索敌）

// ───────────────────────────── 客户端 → 服务端 ─────────────────────────────

/** 加入战场（昵称 ≤10 字符；可不带，服务端生成 PILOT-XXXX） */
export type MsgJoin = ["join", name?: string];
/** 输入：seq 自增序号；ax/ay ∈ [-1,1] 加速向量；angle 瞄准角；fire 0/1 */
export type MsgInput = [
  "i",
  seq: number,
  ax: number,
  ay: number,
  angle: number,
  fire: 0 | 1,
];
/** RTT 探测 */
export type MsgPing = ["ping", t: number];
/** 升级选择：option 为 UPGRADE_OPTIONS 下标（0–6；3=dual 限选一次） */
export type MsgUpgrade = ["u", option: number];

export type ClientMessage = MsgJoin | MsgInput | MsgPing | MsgUpgrade;

// ───────────────────────────── 服务端 → 客户端 ─────────────────────────────

/** 世界边界 [minX, minY, maxX, maxY]（中心为 0,0，可不对称扩展） */
export type WorldBounds = [minX: number, minY: number, maxX: number, maxY: number];

/** 名册条目（join/hello 时下发一次，之后由 join/leave 事件维护） */
export type RosterEntry = [
  id: number,
  name: string,
  colorIdx: number,
  isBot: 0 | 1,
  kills: number,
  deaths: number,
];

/** 快照中的飞船行（纯数值，省字节） */
export type ShipRow = [
  id: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  angle: number,
  hp: number,
  ammo: number,
  flags: number,
  /** 本轮生命累计命中数（升级触发进度；重生清零） */
  hits: number,
  /** 已应用升级打包位（packUpg）；重生清零 */
  upg: number,
];

// ── 战机等级升级（七选一，仅真人玩家；Bot 不参与） ──
/** 累计命中达到 UPGRADE_HIT_BASE·2^level 时触发一次升级选择 */
export const UPGRADE_HIT_BASE = 10;
/** 升级选择窗口（毫秒），超时由服务器随机代选 */
export const UPGRADE_CHOICE_MS = 10000;
/** 每级加成幅度（弹速/移速/生命均为每级 ×1.05） */
export const UPGRADE_STEP = 0.05;

/** 触发第 level 次升级（level 从 0 计）所需的累计命中数 */
export function upgradeThreshold(level: number): number {
  return UPGRADE_HIT_BASE * Math.pow(2, level);
}

/** 升级选项 id（固定 7 项；dual 全局限选一次；lock=锁定时间 +1s/级） */
export const UPGRADE_OPTIONS = ["bullet", "move", "hp", "dual", "ammoRegen", "hpRegen", "lock"] as const;
export type UpgradeOption = (typeof UPGRADE_OPTIONS)[number];

export function upgBulletSpeed(lvBullet: number): number {
  return BULLET_SPEED * Math.pow(1 + UPGRADE_STEP, lvBullet);
}
export function upgMoveSpeed(lvMove: number): number {
  return SHIP_SPEED * Math.pow(1 + UPGRADE_STEP, lvMove);
}
export function upgMaxHp(lvHp: number): number {
  return MAX_HP * Math.pow(1 + UPGRADE_STEP, lvHp);
}
/** 弹药恢复速度（颗/秒）：基础 1 + 每级 +1 */
export function upgAmmoRegenRate(lvAmmoRegen: number): number {
  return AMMO_REGEN_AMOUNT + lvAmmoRegen;
}

/** ShipRow 第 11 字段打包位：lvBullet[0:4] | lvMove[4:8] | lvHp[8:12] | dual[12] | lvAmmoRegen[13:17] | lvHpRegen[17:21] | lvLock[21:25] */
export function packUpg(
  lvBullet: number,
  lvMove: number,
  lvHp: number,
  dual: boolean,
  lvAmmoRegen: number,
  lvHpRegen: number,
  lvLock: number,
): number {
  return (
    (lvBullet & 15) |
    ((lvMove & 15) << 4) |
    ((lvHp & 15) << 8) |
    ((dual ? 1 : 0) << 12) |
    ((lvAmmoRegen & 15) << 13) |
    ((lvHpRegen & 15) << 17) |
    ((lvLock & 15) << 21)
  );
}
export function unpackUpg(upg: number): {
  lvBullet: number;
  lvMove: number;
  lvHp: number;
  dual: boolean;
  lvAmmoRegen: number;
  lvHpRegen: number;
  lvLock: number;
} {
  return {
    lvBullet: upg & 15,
    lvMove: (upg >> 4) & 15,
    lvHp: (upg >> 8) & 15,
    dual: ((upg >> 12) & 1) === 1,
    lvAmmoRegen: (upg >> 13) & 15,
    lvHpRegen: (upg >> 17) & 15,
    lvLock: (upg >> 21) & 15,
  };
}

/** 快照中的子弹行 */
export type BulletRow = [id: number, x: number, y: number, angle: number, ownerId: number];

/** 事件（随快照下发） */
/** hit：x/y 为命中点坐标，angle 为子弹飞行方向（定向火花/击退动效），shooterId 为开火者（命中者反馈） */
export type EvHit = ["hit", victimId: number, x: number, y: number, angle: number, shooterId: number];
export type EvKill = ["kill", killerId: number, victimId: number];
export type EvRespawn = ["respawn", id: number, x: number, y: number];
export type EvJoin = ["join", id: number, name: string, colorIdx: number, isBot: 0 | 1];
export type EvLeave = ["leave", id: number];
export type EvWorld = ["world", bounds: WorldBounds];
/** offer：触发升级选择（msLeft 为剩余选择毫秒数），仅目标玩家应显示 UI */
export type EvOffer = ["offer", id: number, msLeft: number];
/** upgrade：升级生效（option 为选项下标，x/y 为生效位置，供升级动效） */
export type EvUpgrade = ["upgrade", id: number, option: number, x: number, y: number];
/** lock：shooter 连续命中 victim 达阈值，准心锁定生效（制导开始） */
export type EvLock = ["lock", shooterId: number, victimId: number];
/** unlock：锁定解除。reason：0=目标死亡 2=目标消失/隐身 3=锁定时长到期（1 为旧版「飞出准心大圈」，已废弃不再产生） */
export type EvUnlock = ["unlock", shooterId: number, victimId: number, reason: 0 | 1 | 2 | 3];
export type GameEvent = EvHit | EvKill | EvRespawn | EvJoin | EvLeave | EvWorld | EvOffer | EvUpgrade | EvLock | EvUnlock;

/** 握手：你的 id、当前 tick、世界边界、完整名册 */
export type MsgHello = ["hello", yourId: number, tick: number, world: WorldBounds, roster: RosterEntry[]];
/** 快照 */
export type MsgSnapshot = ["s", tick: number, ships: ShipRow[], bullets: BulletRow[], events: GameEvent[]];
/** RTT 回复 */
export type MsgPong = ["pong", t: number];

/** 永久积分榜行：[昵称, 最高击杀数]（仅真人玩家，昵称唯一；击杀瞬间实时刷新） */
export type LbRowWire = [name: string, best: number];
/** 积分榜全量（join 后随 hello 下发；有新纪录时随快照节拍广播） */
export type MsgLeaderboard = ["lb", rows: LbRowWire[]];

export type ServerMessage = MsgHello | MsgSnapshot | MsgPong | MsgLeaderboard;
