/**
 * NEON SWARM — WebSocket 层（基于 ws 包）
 *
 * - 路径 /ws，消息为 contracts/game.ts 定义的紧凑 JSON 数组；
 * - 20Hz 逻辑 tick（Bot 输入注入 + Sim.step），15Hz 快照广播；
 * - join：分配 id、不重复 colorIdx、PILOT-XXXX 昵称（或客户端昵称 ≤MAX_NAME_LEN 字符）、hello 全名册；
 * - input：MAX_INPUT_HZ 限流，超频直接丢弃；
 * - ping/pong：应用层 RTT 探测 + 协议层心跳（HEARTBEAT_MS 周期；
 *   活性判定以「任何应用层消息或协议 pong」为准，连续两轮无响应才断开）；
 * - 断连：广播 leave 并由 Bot 调度补位。
 */
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  TICK_RATE,
  SNAPSHOT_RATE,
  MAX_INPUT_HZ,
  HEARTBEAT_MS,
  MAX_NAME_LEN,
} from "../../contracts/game";
import type { MsgHello, ServerMessage } from "../../contracts/game";
import { Sim } from "./sim";
import { BotManager } from "./bots";
import { leaderboard } from "./leaderboard";

const TICK_MS = 1000 / TICK_RATE;
const WS_PATH = "/ws";

/** 最小结构接口：node http.Server、@hono/node-server 与 Vite dev server 均可满足 */
export interface UpgradeCapableServer {
  on(
    event: "upgrade",
    listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void,
  ): unknown;
}

interface Client {
  ws: WebSocket;
  shipId: number; // 0 = 尚未 join
  isAlive: boolean;
  inputWindowStart: number;
  inputCount: number;
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // 去掉控制字符与首尾空白，最长 10 字符
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, MAX_NAME_LEN);
}

export class GameServer {
  readonly sim = new Sim();
  readonly bots: BotManager;
  private clients = new Map<WebSocket, Client>();
  private snapshotAcc = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.bots = new BotManager(this.sim);
    // 加载历史积分榜（失败降级内存模式，不阻塞游戏启动）
    void leaderboard.init();
  }

  attach(httpServer: UpgradeCapableServer): void {
    const wss = new WebSocketServer({ noServer: true });
    httpServer.on(
      "upgrade",
      (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        let pathname = "";
        try {
          pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        } catch {
          socket.destroy();
          return;
        }
        if (pathname !== WS_PATH) return; // 交给其他 upgrade 监听者（如 Vite HMR）
        wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
      },
    );
  }

  start(): void {
    if (this.tickTimer) return;
    let last = Date.now();
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      // 进程被挂起后恢复时最多补 1 个 tick，避免追帧风暴
      if (now - last > TICK_MS * 4) last = now - TICK_MS;
      last += TICK_MS;
      this.onTick(now);
    }, TICK_MS);
    this.heartbeatTimer = setInterval(() => this.onHeartbeat(), HEARTBEAT_MS);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.tickTimer = null;
    this.heartbeatTimer = null;
  }

  // ───────────────────── 连接与消息 ─────────────────────

  private onConnection(ws: WebSocket): void {
    const client: Client = {
      ws,
      shipId: 0,
      isAlive: true,
      inputWindowStart: Date.now(),
      inputCount: 0,
    };
    this.clients.set(ws, client);
    ws.on("pong", () => {
      client.isAlive = true;
    });
    ws.on("message", (data) => this.onMessage(client, data));
    ws.on("close", () => this.onClose(client));
    ws.on("error", () => ws.close());
  }

  private onMessage(client: Client, data: unknown): void {
    // 任何应用层消息到达都证明连接活跃——活性判定不只依赖协议层 pong：
    // 部分代理/网关会吞掉或不转发 ping/pong 控制帧，若只看 pong，
    // 输入消息明明在流动的玩家也会在两个心跳周期后被误踢。
    client.isAlive = true;
    const raw = typeof data === "string" ? data : (data as Buffer).toString();
    if (raw.length > 512) return; // 输入消息不应超过几百字节
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(msg) || typeof msg[0] !== "string") return;

    switch (msg[0]) {
      case "join":
        this.handleJoin(client, msg[1]);
        break;
      case "i":
        this.handleInput(client, msg);
        break;
      case "u": {
        // 升级选择（校验在 sim 内完成）
        if (client.shipId !== 0 && typeof msg[1] === "number") {
          this.sim.chooseUpgrade(client.shipId, msg[1]);
        }
        break;
      }
      case "ping": {
        const t = typeof msg[1] === "number" ? msg[1] : 0;
        this.send(client.ws, ["pong", t]);
        break;
      }
      default:
        break;
    }
  }

  private handleJoin(client: Client, rawName: unknown): void {
    if (client.shipId !== 0) return; // 已加入
    const taken = new Set<string>();
    for (const s of this.sim.ships.values()) taken.add(s.name);
    let name = sanitizeName(rawName);
    if (!name || taken.has(name)) name = this.genPilotName(taken);

    const ship = this.sim.addUnit(name, false);
    client.shipId = ship.id;
    this.bots.afterPlayerJoin(ship);

    const hello: MsgHello = [
      "hello",
      ship.id,
      this.sim.tick,
      [this.sim.world[0], this.sim.world[1], this.sim.world[2], this.sim.world[3]],
      this.sim.roster(),
    ];
    this.send(client.ws, hello);
    // 附带永久积分榜（昵称唯一、实时刷新的最高击杀数）
    this.send(client.ws, ["lb", leaderboard.top()]);
  }

  private handleInput(client: Client, msg: unknown[]): void {
    if (client.shipId === 0) return;
    // 限流：每秒窗口内最多 MAX_INPUT_HZ 条，超频丢弃
    const now = Date.now();
    if (now - client.inputWindowStart >= 1000) {
      client.inputWindowStart = now;
      client.inputCount = 0;
    }
    if (client.inputCount >= MAX_INPUT_HZ) return;
    client.inputCount++;

    const seq = msg[1]; // 协议字段（客户端自增序号），仅做形状校验，服务端不消费
    const ax = msg[2];
    const ay = msg[3];
    const angle = msg[4];
    const fire = msg[5];
    if (
      typeof seq !== "number" ||
      typeof ax !== "number" ||
      typeof ay !== "number" ||
      typeof angle !== "number" ||
      (fire !== 0 && fire !== 1)
    ) {
      return;
    }
    if (!Number.isFinite(ax) || !Number.isFinite(ay)) return;
    this.sim.setInput(client.shipId, ax, ay, angle, fire);
  }

  private onClose(client: Client): void {
    if (!this.clients.delete(client.ws)) return;
    if (client.shipId !== 0) {
      this.sim.removeUnit(client.shipId);
      this.bots.afterPlayerLeave();
    }
  }

  // ───────────────────── tick / 广播 / 心跳 ─────────────────────

  private onTick(nowMs: number): void {
    this.bots.tick(nowMs);
    this.sim.step(nowMs);

    // 15Hz 快照调度：20Hz tick 中每 4 个 tick 广播 3 次
    this.snapshotAcc += SNAPSHOT_RATE;
    if (this.snapshotAcc >= TICK_RATE) {
      this.snapshotAcc -= TICK_RATE;
      this.broadcastSnapshot();
    }
  }

  private broadcastSnapshot(): void {
    const snapshot = this.sim.buildSnapshot();
    const payload = JSON.stringify(snapshot);
    this.sim.releaseEvents();
    // 积分榜有新纪录时随快照节拍广播一次
    const lbPayload = leaderboard.consumeDirty()
      ? JSON.stringify(["lb", leaderboard.top()])
      : null;
    for (const c of this.clients.values()) {
      if (c.shipId !== 0 && c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(payload);
          if (lbPayload) c.ws.send(lbPayload);
        } catch {
          // 单个连接发送失败（状态竞态）不影响其他玩家，交给 close 事件清理
        }
      }
    }
  }

  private onHeartbeat(): void {
    for (const c of this.clients.values()) {
      // 非 OPEN（如 error 后 CLOSING、等待 close 事件清理）跳过：
      // ws 库在非 OPEN 且无回调时 ping() 会直接 throw，
      // setInterval 回调内异常即 uncaughtException，进程崩溃全员掉线
      if (c.ws.readyState !== WebSocket.OPEN) continue;
      if (!c.isAlive) {
        c.ws.terminate(); // 触发 close → onClose 清理
        continue;
      }
      c.isAlive = false;
      try {
        c.ws.ping();
      } catch {
        // 状态竞态兜底，交给 close 事件清理
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  private genPilotName(taken: Set<string>): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 100; i++) {
      let suffix = "";
      for (let j = 0; j < 4; j++) {
        suffix += chars[Math.floor(Math.random() * chars.length)];
      }
      const name = `PILOT-${suffix}`;
      if (!taken.has(name)) return name;
    }
    return `PILOT-${Math.floor(Math.random() * 10000)}`;
  }
}

let instance: GameServer | null = null;

/** 幂等：生产与开发入口共用，把游戏 WS 层挂到给定 http.Server 上 */
export function attachGameServer(httpServer: UpgradeCapableServer): GameServer {
  if (!instance) {
    instance = new GameServer();
    instance.start();
  }
  instance.attach(httpServer);
  return instance;
}
