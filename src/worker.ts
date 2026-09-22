import { DurableObject } from "cloudflare:workers";
import {
  TICK_RATE,
  SNAPSHOT_RATE,
  MAX_INPUT_HZ,
  MAX_NAME_LEN,
} from "../contracts/game";
import type { MsgHello, ServerMessage } from "../contracts/game";
import { Sim } from "../api/game/sim";
import { BotManager } from "../api/game/bots";
import { leaderboard } from "../api/game/leaderboard";

const TICK_MS = 1000 / TICK_RATE;

interface Client {
  ws: WebSocket;
  shipId: number;
  isAlive: boolean;
  inputWindowStart: number;
  inputCount: number;
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, MAX_NAME_LEN);
}

export class GameRoom extends DurableObject {
  readonly sim = new Sim();
  readonly bots: BotManager;
  private clients = new Map<WebSocket, Client>();
  private snapshotAcc = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.bots = new BotManager(this.sim);
    void leaderboard.init();
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [clientWs, serverWs] = Object.values(webSocketPair);

    (serverWs as any).accept();
    this.handleConnection(serverWs);

    return new Response(null, {
      status: 101,
      webSocket: clientWs,
    });
  }

  private handleConnection(ws: WebSocket): void {
    const client: Client = {
      ws,
      shipId: 0,
      isAlive: true,
      inputWindowStart: Date.now(),
      inputCount: 0,
    };
    this.clients.set(ws, client);

    if (!this.tickTimer) {
      this.startLoop();
    }

    ws.addEventListener("message", (event) => {
      this.handleMessage(client, event.data);
    });

    ws.addEventListener("close", () => {
      this.handleClose(client);
    });

    ws.addEventListener("error", () => {
      this.handleClose(client);
    });
  }

  private startLoop(): void {
    let last = Date.now();
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      if (now - last > TICK_MS * 4) last = now - TICK_MS;
      last += TICK_MS;
      this.onTick(now);
    }, TICK_MS);
  }

  private stopLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private handleMessage(client: Client, data: unknown): void {
    client.isAlive = true;
    const raw = typeof data === "string" ? data : String(data);
    if (raw.length > 512) return;
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
    }
  }

  private handleJoin(client: Client, rawName: unknown): void {
    if (client.shipId !== 0) return;
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
    this.send(client.ws, ["lb", leaderboard.top()]);
  }

  private handleInput(client: Client, msg: unknown[]): void {
    if (client.shipId === 0) return;
    const now = Date.now();
    if (now - client.inputWindowStart >= 1000) {
      client.inputWindowStart = now;
      client.inputCount = 0;
    }
    if (client.inputCount >= MAX_INPUT_HZ) return;
    client.inputCount++;

    const seq = msg[1];
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

  private handleClose(client: Client): void {
    if (!this.clients.delete(client.ws)) return;
    if (client.shipId !== 0) {
      this.sim.removeUnit(client.shipId);
      this.bots.afterPlayerLeave();
    }
    if (this.clients.size === 0) {
      this.stopLoop();
    }
  }

  private onTick(nowMs: number): void {
    this.bots.tick(nowMs);
    this.sim.step(nowMs);

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

    const lbPayload = leaderboard.consumeDirty()
      ? JSON.stringify(["lb", leaderboard.top()])
      : null;

    for (const c of this.clients.values()) {
      if (c.shipId !== 0 && c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(payload);
          if (lbPayload) c.ws.send(lbPayload);
        } catch {
          // ignore send failure
        }
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
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

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.GAME_ROOM.idFromName("global");
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }
    const res = await env.ASSETS.fetch(request);
    if (res.status === 404) {
      return env.ASSETS.fetch(new URL("/", request.url));
    }
    return res;
  },
};
