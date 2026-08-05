/**
 * NEON SWARM — HUD 状态桥（游戏循环 → React）
 *
 * 游戏引擎以 60fps 运行，但 HUD 不需要每帧重渲染：
 * 引擎按 ~10Hz 节流写入该 store，React 组件经 useSyncExternalStore 订阅。
 * 击杀流等事件即时写入。
 */
import { useSyncExternalStore } from "react";
import { MAX_AMMO, MAX_HP } from "@contracts/game";

export type GamePhase =
  | "join" // 加入战场面板（昵称输入，点击后才连接）
  | "connecting" // SYNCING ORBITAL FEED…
  | "live" // 战斗中
  | "respawning" // 3 秒重生
  | "reconnecting" // 断线重连
  | "failed"; // 连接失败

export interface KillFeedItem {
  key: number;
  kind: "kill" | "join" | "leave" | "world";
  /** kill: 攻击者/被击毁者；join/leave: 该玩家 */
  actorId: number;
  actorName: string;
  actorColor: string;
  victimId?: number;
  victimName?: string;
  victimColor?: string;
  text?: string;
  createdAt: number;
}

export interface HudState {
  phase: GamePhase;
  hp: number;
  ammo: number;
  /** 弹药恢复进度 0–1（距下一跳恢复；相位经快照锚定与服务端同步） */
  ammoRegen: number;
  /** 本轮生命累计命中数（升级触发进度） */
  selfHits: number;
  /** 本机已应用升级打包位（packUpg） */
  selfUpg: number;
  /** 升级选择窗口（deadline 为 performance.now 时间戳）；null = 无待选 */
  upgradeOffer: { deadline: number } | null;
  selfName: string;
  selfColor: string;
  selfId: number;
  /** 重生剩余秒；>0 时显示 RespawnOverlay */
  respawnLeft: number;
  killerName: string;
  rtt: number;
  tick: number;
  entityCount: number;
  rosterVersion: number;
  killFeed: KillFeedItem[];
  /** 世界事件中心提示（如 WORLD EXPANDED），空串隐藏 */
  worldToast: string;
  muted: boolean;
  audioUnlocked: boolean;
  audioSupported: boolean;
  menuOpen: boolean;
  scoreboardOpen: boolean;
  killFeedCollapsed: boolean;
  /** 设置 */
  lowParticles: boolean;
  highContrast: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  volume: number;
  /** 击毁提示（TARGET DOWN）短暂显示 */
  targetDownKey: number;
  /** 受击红色 vignette 触发计数 */
  hurtKey: number;
  /** 重生完成 SHIELD ONLINE 提示 */
  shieldKey: number;
  /** 当前锁定的敌机 id（0=无锁定）；仅本机视角 */
  lockTargetId: number;
}

const initialState: HudState = {
  phase: "join",
  hp: MAX_HP,
  ammo: MAX_AMMO,
  ammoRegen: 0,
  selfHits: 0,
  selfUpg: 0,
  upgradeOffer: null,
  selfName: "",
  selfColor: "#22D3EE",
  selfId: -1,
  respawnLeft: 0,
  killerName: "",
  rtt: 0,
  tick: 0,
  entityCount: 0,
  rosterVersion: 0,
  killFeed: [],
  worldToast: "",
  muted: false,
  audioUnlocked: false,
  audioSupported: true,
  menuOpen: false,
  scoreboardOpen: false,
  killFeedCollapsed: false,
  lowParticles: false,
  highContrast: false,
  screenShake: true,
  reducedMotion: false,
  volume: 0.7,
  targetDownKey: 0,
  hurtKey: 0,
  shieldKey: 0,
  lockTargetId: 0,
};

/** 击杀流最大条数（pushFeed 即裁剪，渲染层无需再截断） */
const MAX_KILL_FEED = 5;

export class HudStore {
  private state: HudState = initialState;
  private listeners = new Set<() => void>();
  private feedKey = 0;

  getState = (): HudState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  set(partial: Partial<HudState>) {
    this.state = { ...this.state, ...partial };
    for (const fn of this.listeners) fn();
  }

  pushFeed(item: Omit<KillFeedItem, "key" | "createdAt">) {
    this.feedKey += 1;
    const entry: KillFeedItem = {
      ...item,
      key: this.feedKey,
      createdAt: performance.now(),
    };
    const killFeed = [entry, ...this.state.killFeed].slice(0, MAX_KILL_FEED);
    this.set({ killFeed });
  }

  removeFeed(key: number) {
    this.set({ killFeed: this.state.killFeed.filter((i) => i.key !== key) });
  }
}

/** React 订阅入口 */
export function useHud<T>(store: HudStore, select: (s: HudState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
