/**
 * NEON SWARM — WebSocket 网络客户端（contracts/game.ts 严格实现）
 *
 * - 连接 `ws(s)://location.host/ws`，onopen 立即发送 ["join", name?]
 * - hello 建立完整名册，之后由快照内 join/leave 事件维护
 * - 快照缓冲（保留最近 ≥4 个）供插值层消费
 * - 输入发送 20–30Hz：["i", seq, ax, ay, angle, fire]
 * - ping/pong 测 RTT
 * - 断线指数退避自动重连（1s/2s/4s/…最长 8s），重连后重新 join
 */
import { MAX_NAME_LEN } from "@contracts/game";
import type {
  ClientMessage,
  GameEvent,
  LbRowWire,
  MsgHello,
  MsgSnapshot,
  RosterEntry,
  ServerMessage,
  WorldBounds,
} from "@contracts/game";

const SNAPSHOT_BUFFER_MAX = 16;
const INPUT_HZ = 25; // 20–30Hz 区间中值（contracts: MAX_INPUT_HZ = 30）
const PING_INTERVAL_MS = 2000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 8000;
const RECONNECT_MAX_ATTEMPTS = 8;

export type ConnectionStatus =
  | "connecting"
  | "online"
  | "reconnecting"
  | "failed";

export interface RosterPlayer {
  id: number;
  name: string;
  colorIdx: number;
  isBot: boolean;
  kills: number;
  deaths: number;
}

export interface BufferedSnapshot {
  /** 客户端收到快照的本地时间（performance.now()），插值以此为时钟 */
  localTime: number;
  tick: number;
  ships: MsgSnapshot[2];
  bullets: MsgSnapshot[3];
  events: GameEvent[];
}

export interface NetCallbacks {
  onHello?: (msg: MsgHello) => void;
  onSnapshot?: (snap: BufferedSnapshot) => void;
  onEvents?: (events: GameEvent[]) => void;
  onRosterChange?: () => void;
  onRtt?: (rtt: number) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

export class GameNet {
  readonly roster = new Map<number, RosterPlayer>();
  readonly snapshots: BufferedSnapshot[] = [];
  /** 永久积分榜（服务器全量下发）：[昵称, 最高击杀数]，已按名次排序 */
  readonly leaderboard: LbRowWire[] = [];

  yourId = -1;
  world: WorldBounds = [-4000, -4000, 4000, 4000];
  tick = 0;
  rtt = 0;

  private ws: WebSocket | null = null;
  private cb: NetCallbacks;
  private name: string | undefined;
  private status: ConnectionStatus = "connecting";

  private seq = 0;
  private inputTimer = 0;
  private pingTimer = 0;
  private reconnectTimer = 0;
  private reconnectAttempts = 0;
  private disposed = false;
  /** 最近一次输入状态，由输入层每帧写入，发送循环按固定频率消费 */
  private pendingInput: {
    ax: number;
    ay: number;
    angle: number;
    fire: 0 | 1;
  } = {
    ax: 0,
    ay: 0,
    angle: 0,
    fire: 0,
  };

  constructor(cb: NetCallbacks) {
    this.cb = cb;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(s: ConnectionStatus) {
    if (this.status === s) return;
    this.status = s;
    this.cb.onStatus?.(s);
  }

  /** 进入页面即调用。name 为空则由服务端生成 PILOT-XXXX。 */
  connect(name?: string) {
    if (name !== undefined) this.name = name.slice(0, MAX_NAME_LEN) || undefined;
    this.disposed = false;
    this.openSocket();
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
  }

  /** 手动重连（重连界面按钮） */
  reconnectNow() {
    window.clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = 0;
    this.openSocket();
  }

  /** 输入层每帧调用，仅更新待发送状态 */
  setInput(ax: number, ay: number, angle: number, fire: 0 | 1) {
    this.pendingInput.ax = ax;
    this.pendingInput.ay = ay;
    this.pendingInput.angle = angle;
    this.pendingInput.fire = fire;
  }

  /** 升级选择（UPGRADE_OPTIONS 下标 0–6） */
  sendUpgrade(option: number) {
    this.send(["u", option]);
  }

  private clearTimers() {
    window.clearInterval(this.inputTimer);
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.reconnectTimer);
    this.inputTimer = 0;
    this.pingTimer = 0;
    this.reconnectTimer = 0;
  }

  private openSocket() {
    if (this.disposed) return;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.setStatus(this.reconnectAttempts > 0 ? "reconnecting" : "connecting");

    const proto = location.protocol === "https:" ? "wss" : "ws";
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("online");
      const join: ClientMessage =
        this.name !== undefined ? ["join", this.name] : ["join"];
      this.send(join);
      this.startLoops();
    };

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      this.handleMessage(msg);
    };

    ws.onclose = () => {
      if (this.disposed) return;
      this.clearTimers();
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose 紧随其后，统一在那里处理重连
    };
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.setStatus("failed");
      return;
    }
    this.setStatus("reconnecting");
    const delay = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
  }

  private startLoops() {
    this.clearTimers();
    // 输入发送循环 25Hz
    this.inputTimer = window.setInterval(() => {
      if (!this.isOpen()) return;
      const { ax, ay, angle, fire } = this.pendingInput;
      this.seq += 1;
      this.send(["i", this.seq, ax, ay, angle, fire]);
    }, 1000 / INPUT_HZ);
    // RTT 探测
    this.pingTimer = window.setInterval(() => {
      if (!this.isOpen()) return;
      const msg: ClientMessage = ["ping", performance.now()];
      this.send(msg);
    }, PING_INTERVAL_MS);
  }

  private isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private send(msg: ClientMessage) {
    if (!this.isOpen()) return;
    try {
      this.ws!.send(JSON.stringify(msg));
    } catch {
      /* 发送失败由 onclose 兜底 */
    }
  }

  private handleMessage(msg: ServerMessage) {
    const kind = msg[0];
    if (kind === "hello") {
      const [, yourId, tick, world, roster] = msg;
      this.yourId = yourId;
      this.tick = tick;
      this.world = world;
      this.roster.clear();
      for (const entry of roster) this.applyRosterEntry(entry);
      this.snapshots.length = 0;
      this.cb.onHello?.(msg);
      this.cb.onRosterChange?.();
      return;
    }
    if (kind === "lb") {
      // 永久积分榜全量（昵称唯一、实时最高击杀数；仅真人）
      this.leaderboard.length = 0;
      for (const row of msg[1]) this.leaderboard.push(row);
      this.cb.onRosterChange?.(); // 复用名册版本号触发 UI 刷新
      return;
    }
    if (kind === "s") {
      const [, tick, ships, bullets, events] = msg;
      this.tick = tick;
      // 名册 + 战绩由 join/leave/kill 事件维护
      let rosterChanged = false;
      for (const ev of events) {
        if (ev[0] === "join") {
          this.roster.set(ev[1], {
            id: ev[1],
            name: ev[2],
            colorIdx: ev[3],
            isBot: ev[4] === 1,
            kills: 0,
            deaths: 0,
          });
          rosterChanged = true;
        } else if (ev[0] === "leave") {
          rosterChanged = this.roster.delete(ev[1]) || rosterChanged;
        } else if (ev[0] === "kill") {
          const killer = this.roster.get(ev[1]);
          const victim = this.roster.get(ev[2]);
          if (killer) killer.kills += 1;
          if (victim) victim.deaths += 1;
          rosterChanged = true;
        } else if (ev[0] === "world") {
          this.world = ev[1];
        }
      }
      const snap: BufferedSnapshot = {
        localTime: performance.now(),
        tick,
        ships,
        bullets,
        events,
      };
      this.snapshots.push(snap);
      while (this.snapshots.length > SNAPSHOT_BUFFER_MAX) this.snapshots.shift();
      if (rosterChanged) this.cb.onRosterChange?.();
      if (events.length > 0) this.cb.onEvents?.(events);
      this.cb.onSnapshot?.(snap);
      return;
    }
    if (kind === "pong") {
      const sent = msg[1];
      const rtt = Math.max(0, performance.now() - sent);
      // 平滑 RTT，避免单次抖动
      this.rtt = this.rtt === 0 ? rtt : this.rtt * 0.7 + rtt * 0.3;
      this.cb.onRtt?.(this.rtt);
    }
  }

  private applyRosterEntry(entry: RosterEntry) {
    const [id, name, colorIdx, isBot, kills, deaths] = entry;
    this.roster.set(id, { id, name, colorIdx, isBot: isBot === 1, kills, deaths });
  }
}
