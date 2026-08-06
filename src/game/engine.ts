/**
 * NEON SWARM — 游戏引擎编排层
 *
 * 串联 net / interp / renderer / audio / input / store：
 * - 60fps rAF 主循环：采样插值 → 本机预测 → 渲染 → 节流同步 HUD store
 * - 快照事件驱动：命中白闪/伤害数字/爆炸粒子/击杀流/重生倒计时/世界扩展提示
 * - 手动加入（昵称面板点击后才连接 WebSocket）、断线重连状态、性能自动降级
 */
import {
  AMMO_REGEN_MS,
  COLOR_POOL,
  MAX_AMMO,
  MAX_HP,
  RESPAWN_MS,
  WORLD_EXPAND_STEP,
  FLAG_HIDDEN,
  UPGRADE_OPTIONS,
} from "@contracts/game";
import type { GameEvent, WorldBounds } from "@contracts/game";
import { GameNet } from "./net";
import type { BufferedSnapshot } from "./net";
import {
  INTERP_DELAY_MS,
  LocalPredictor,
  sampleBullets,
  sampleShips,
} from "./interp";
import { GameRenderer } from "./renderer";
import { AudioEngine } from "./audio";
import { InputController } from "./input";
import { HudStore } from "./store";

const HUD_SYNC_MS = 100; // HUD store 10Hz 节流
const LOW_FPS_THRESHOLD = 40;

export interface RadarShip {
  x: number;
  y: number;
  color: string;
  isBot: boolean;
  dead: boolean;
}

export class GameEngine {
  readonly net: GameNet;
  readonly renderer: GameRenderer;
  readonly audio: AudioEngine;
  readonly input: InputController;
  readonly store: HudStore;

  private canvas: HTMLCanvasElement;
  private predictor = new LocalPredictor();
  private raf = 0;
  private lastFrame = 0;
  private running = false;
  /** 玩家已点击「加入战斗」并成功握手 */
  private joined = false;
  private deathAt = 0;
  private killerName = "";
  private lastHudSync = 0;
  private worldToastTimer = 0;
  private prevWorld: WorldBounds | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private fpsWindowStart = 0;
  private perfDegraded = false;
  private reducedMotion = false;
  private isMobile = false;
  private lastFireAt = 0;
  private latestShips: ReturnType<typeof sampleShips> | null = null;
  /** 弹药恢复相位锚点：服务端恢复计时由"上次实际恢复/满弹开火"锚定（sim.step），
   * 客户端无从获知，经快照观测 ammo 变化同步本地相位（HUD 底轨用） */
  private lastAmmoAnchorAt = 0;
  private prevHudAmmo = MAX_AMMO;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.store = new HudStore();
    this.audio = new AudioEngine();
    this.renderer = new GameRenderer(canvas);
    this.net = new GameNet({
      onHello: () => this.handleHello(),
      onSnapshot: (snap) => this.handleSnapshot(snap),
      onEvents: (events) => this.handleEvents(events),
      onRosterChange: () => this.bumpRoster(),
      onStatus: (status) => this.handleNetStatus(status),
      onRtt: () => {},
    });
    this.input = new InputController({
      onScoreboard: (v) => this.store.set({ scoreboardOpen: v }),
      onToggleMenu: () => {
        const s = this.store.getState();
        // Esc 优先级：计分板打开时只关闭计分板继续战斗，不再跳进菜单
        if (s.scoreboardOpen) {
          this.store.set({ scoreboardOpen: false });
          this.audio.uiTick();
          return;
        }
        const open = !s.menuOpen;
        this.store.set({ menuOpen: open, scoreboardOpen: false });
        this.audio.uiTick();
      },
      onToggleMute: () => this.toggleMute(),
      onFirstGesture: () => this.unlockAudio(),
    });

    this.reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.isMobile =
      typeof window !== "undefined" &&
      (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 640);
    this.renderer.setSettings({
      reducedMotion: this.reducedMotion,
      isMobile: this.isMobile,
    });
  }

  /** 启动渲染循环与输入，但不连接网络：等待玩家在加入面板点击「加入战斗」 */
  start() {
    this.input.attach(this.canvas);
    this.running = true;
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    window.addEventListener("resize", this.onResize);
    this.store.set({
      phase: "join",
      reducedMotion: this.reducedMotion,
      muted: this.audio.muted,
      volume: this.audio.volume,
      audioSupported: this.audio.supported,
      audioUnlocked: this.audio.unlocked,
    });
  }

  /** 加入面板点击后调用：建立 WebSocket 并以昵称 join（空则由服务端生成呼号） */
  join(name?: string) {
    if (this.joined) return;
    this.joined = true;
    this.store.set({ phase: "connecting" });
    this.net.connect(name);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.clearTimeout(this.worldToastTimer);
    this.input.detach();
    this.net.dispose();
  }

  private onResize = () => this.renderer.resize();

  unlockAudio() {
    void this.audio.unlock().then((ok) => {
      this.store.set({ audioUnlocked: ok });
      if (ok) this.audio.uiTick();
    });
  }

  toggleMute() {
    const muted = this.audio.toggleMuted();
    this.store.set({ muted });
    if (!muted) this.audio.uiTick();
  }

  setVolume(v: number) {
    this.audio.setVolume(v);
    this.store.set({ volume: this.audio.volume });
  }

  setLowParticles(on: boolean) {
    this.renderer.setSettings({ lowParticles: on });
    this.store.set({ lowParticles: on });
  }

  setHighContrast(on: boolean) {
    this.renderer.setSettings({ highContrast: on });
    this.store.set({ highContrast: on });
  }

  setScreenShake(on: boolean) {
    this.renderer.setSettings({ screenShake: on });
    this.store.set({ screenShake: on });
  }

  setMenuOpen(open: boolean) {
    this.store.set({ menuOpen: open });
  }

  /** 升级选择（UPGRADE_OPTIONS 下标 0–5），服务端校验后广播生效 */
  chooseUpgrade(option: number) {
    this.net.sendUpgrade(option);
  }

  setScoreboardOpen(open: boolean) {
    // 计分板与菜单互斥：打开计分板时关闭菜单
    this.store.set(
      open ? { scoreboardOpen: true, menuOpen: false } : { scoreboardOpen: false },
    );
  }

  setKillFeedCollapsed(v: boolean) {
    this.store.set({ killFeedCollapsed: v });
  }

  /** 移动端触控输入写入（TouchControls 组件专用） */
  setJoystick(x: number, y: number, active: boolean) {
    this.input.joyX = x;
    this.input.joyY = y;
    this.input.joyActive = active;
  }

  setTouchAim(angle: number | null) {
    this.input.touchAim = angle;
  }

  setTouchFire(fire: boolean) {
    this.input.touchFire = fire;
  }

  reconnectNow() {
    this.store.set({ phase: "connecting" });
    this.net.reconnectNow();
  }

  // ───────── 网络回调 ─────────

  private handleHello() {
    const me = this.net.roster.get(this.net.yourId);
    const wasReconnect = this.store.getState().phase === "reconnecting";
    this.predictor.reset();
    this.store.set({
      phase: "live",
      selfId: this.net.yourId,
      selfName: me?.name ?? "",
      selfColor: me ? COLOR_POOL[me.colorIdx % COLOR_POOL.length] : "#22D3EE",
    });
    if (wasReconnect) this.toast("LINK RESTORED", 1200);
  }

  private handleNetStatus(status: string) {
    const phase = this.store.getState().phase;
    if (status === "reconnecting") {
      // 未加入前的连接失败不回 join 面板，直接展示重连状态
      this.store.set({ phase: "reconnecting" });
    } else if (status === "failed") {
      this.store.set({ phase: "failed" });
    } else if (status === "connecting" && phase !== "live" && phase !== "join") {
      this.store.set({ phase: "connecting" });
    }
    // "online" 阶段由 hello 驱动（live）
  }

  private bumpRoster() {
    this.store.set({ rosterVersion: this.store.getState().rosterVersion + 1 });
  }

  private handleSnapshot(snap: BufferedSnapshot) {
    // 本机软校正（位置 + 速度）
    const row = snap.ships.find((r) => r[0] === this.net.yourId);
    if (row) {
      this.predictor.reconcile(row[1], row[2], row[3], row[4]);
    }
  }

  private toast(text: string, ms = 2400) {
    this.store.set({ worldToast: text });
    window.clearTimeout(this.worldToastTimer);
    this.worldToastTimer = window.setTimeout(
      () => this.store.set({ worldToast: "" }),
      ms,
    );
  }

  private handleEvents(events: GameEvent[]) {
    const latest = this.net.snapshots[this.net.snapshots.length - 1];
    const shipRow = (id: number) => latest?.ships.find((r) => r[0] === id);
    const nameOf = (id: number) => this.net.roster.get(id)?.name ?? `PILOT-${id}`;
    const colorOf = (id: number) => {
      const p = this.net.roster.get(id);
      return p ? COLOR_POOL[p.colorIdx % COLOR_POOL.length] : "#67E8F9";
    };

    for (const ev of events) {
      if (ev[0] === "hit") {
        const [, victimId, x, y, angle, shooterId] = ev;
        const isVictim = victimId === this.net.yourId;
        const isShooter = shooterId === this.net.yourId;
        this.renderer.spawnHitFlash(victimId);
        this.renderer.spawnImpact(x, y, angle, colorOf(victimId));
        this.renderer.spawnJolt(victimId, angle);
        this.renderer.spawnDamageNumber(x, y, "-1", isShooter ? "#FACC15" : "#F8FAFC");
        if (isVictim) {
          this.audio.hurt();
          this.renderer.hurtFlash();
          this.renderer.shake(4);
          this.store.set({ hurtKey: this.store.getState().hurtKey + 1 });
        } else if (isShooter) {
          // 自己命中：明亮确认音 + 准星命中标记（打击感核心反馈）
          this.audio.hitConfirm();
          this.renderer.showHitmarker();
        } else {
          this.audio.hit();
        }
      } else if (ev[0] === "kill") {
        const [, killerId, victimId] = ev;
        const row = shipRow(victimId);
        const color = colorOf(victimId);
        if (row) this.renderer.spawnExplosion(row[1], row[2], color);
        this.audio.explosion();
        this.store.pushFeed({
          kind: "kill",
          actorId: killerId,
          actorName: nameOf(killerId),
          actorColor: colorOf(killerId),
          victimId,
          victimName: nameOf(victimId),
          victimColor: color,
        });
        if (victimId === this.net.yourId) {
          this.killerName = nameOf(killerId);
          this.deathAt = performance.now();
          this.renderer.shake(6);
          this.store.set({
            phase: "respawning",
            respawnLeft: RESPAWN_MS / 1000,
            killerName: this.killerName,
          });
        }
        if (killerId === this.net.yourId && victimId !== this.net.yourId) {
          this.audio.killConfirm();
          this.renderer.shake(5);
          this.store.set({ targetDownKey: this.store.getState().targetDownKey + 1 });
        }
      } else if (ev[0] === "respawn") {
        const [, id, x, y] = ev;
        this.renderer.spawnRespawnRing(x, y, colorOf(id));
        if (id === this.net.yourId) {
          this.audio.respawn();
          this.deathAt = 0;
          // 重生即清空本机锁定状态（服务端静默清零，不下发 unlock）
          this.store.set({
            phase: "live",
            respawnLeft: 0,
            shieldKey: this.store.getState().shieldKey + 1,
            lockTargetId: 0,
          });
        }
      } else if (ev[0] === "lock") {
        // 准心锁定触发（仅本机视角反馈；其他玩家的锁定不关己）
        const [, shooterId, victimId] = ev;
        if (shooterId === this.net.yourId) {
          this.store.set({ lockTargetId: victimId });
          this.audio.killConfirm();
          this.toast("TARGET LOCKED");
        }
      } else if (ev[0] === "unlock") {
        // 锁定解除：0=目标死亡（击杀反馈已覆盖） 2=目标消失/隐身 3=锁定时长到期
        const [, shooterId, , reason] = ev;
        if (shooterId === this.net.yourId) {
          this.store.set({ lockTargetId: 0 });
          if (reason === 3) this.toast("LOCK EXPIRED");
          else if (reason === 2) this.toast("LOCK LOST");
        }
      } else if (ev[0] === "join") {
        const [, id, name, , isBot] = ev;
        this.store.pushFeed({
          kind: "join",
          actorId: id,
          actorName: name,
          actorColor: colorOf(id),
          text: `${name} ${isBot ? "(BOT) " : ""}joined the swarm`,
        });
      } else if (ev[0] === "leave") {
        const [, id] = ev;
        this.store.pushFeed({
          kind: "leave",
          actorId: id,
          actorName: nameOf(id),
          actorColor: colorOf(id),
          text: `${nameOf(id)} left the swarm`,
        });
      } else if (ev[0] === "offer") {
        // 升级选择触发（仅本机显示选择 UI；战绩保留，选择期间隐身）
        const [, id, msLeft] = ev;
        if (id === this.net.yourId) {
          this.store.set({
            upgradeOffer: { deadline: performance.now() + msLeft },
          });
          this.audio.uiTick();
        }
      } else if (ev[0] === "upgrade") {
        // 升级生效：金色能量环动效 + 本机提示
        const [, id, option, x, y] = ev;
        this.renderer.spawnRespawnRing(x, y, "#FACC15");
        this.renderer.shake(2);
        if (id === this.net.yourId) {
          const key = UPGRADE_OPTIONS[option] ?? "bullet";
          this.store.set({ upgradeOffer: null });
          this.audio.killConfirm();
          this.toast(
            key === "bullet"
              ? "BULLET VELOCITY +5%"
              : key === "move"
                ? "MOVE SPEED +5%"
                : key === "hp"
                    ? "HULL INTEGRITY +5%"
                    : key === "ammoRegen"
                        ? "AMMO REGEN +1/S"
                        : key === "hpRegen"
                          ? "HP REGEN +1/S"
                          : "DUAL GUNS ONLINE",
          );
        }
      } else if (ev[0] === "world") {
        const bounds = ev[1];
        this.renderer.notifyWorldBounds(bounds, this.prevWorld ?? this.net.world);
        this.prevWorld = bounds;
        this.toast(`WORLD EXPANDED · SECTOR +${WORLD_EXPAND_STEP}PX`);
      }
    }
  }

  // ───────── 主循环 ─────────

  private loop = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.raf = requestAnimationFrame(this.loop);

    const state = this.store.getState();

    // 重生倒计时
    if (state.phase === "respawning" && this.deathAt > 0) {
      const left = Math.max(0, (this.deathAt + RESPAWN_MS - now) / 1000);
      if (left !== state.respawnLeft) this.store.set({ respawnLeft: left });
    }

    // 采样插值
    const renderTime = now - INTERP_DELAY_MS;
    const ships = sampleShips(this.net.snapshots, renderTime);
    this.latestShips = ships;
    const bullets = sampleBullets(this.net.snapshots, now);

    const selfRow = ships.get(this.net.yourId);
    // 阵亡战机不下发快照行：本机行存在即存活（死亡由 kill 事件驱动）
    const selfAlive = !!selfRow;
    // 升级选择中：隐身冻结（不渲染、不发射、不响应输入）
    const selfHidden = !!selfRow && (selfRow.flags & FLAG_HIDDEN) !== 0;
    const live = state.phase === "live" && this.joined;

    // 重生快照行为备份恢复（主驱动为 respawn 事件；本机行重新出现即已重生）
    if (state.phase === "respawning" && selfAlive) {
      this.deathAt = 0;
      this.store.set({
        phase: "live",
        respawnLeft: 0,
        shieldKey: state.shieldKey + 1,
      });
    }

    // 输入 → 网络 + 本机预测
    const cam = this.renderer.getCamera();
    const viewW = this.canvas.clientWidth;
    const viewH = this.canvas.clientHeight;
    const selfSX = this.predictor.x - cam.x + viewW / 2;
    const selfSY = this.predictor.y - cam.y + viewH / 2;
    const inputState = this.input.getState(selfSX, selfSY);
    if (live && selfAlive && !selfHidden) {
      this.net.setInput(inputState.ax, inputState.ay, inputState.angle, inputState.fire);
      this.predictor.applyInput(dt, inputState.ax, inputState.ay, inputState.angle);
      if (inputState.fire === 1) {
        this.lastFireAt = now;
        const ammo = selfRow ? selfRow.ammo : MAX_AMMO;
        if (ammo <= 0) this.audio.noAmmo();
        else this.audio.shoot();
      }
    } else {
      this.net.setInput(0, 0, this.predictor.angle, 0);
    }

    // 渲染
    const me = this.net.roster.get(this.net.yourId);
    this.renderer.render(
      {
        now,
        selfId: this.net.yourId,
        selfX: this.predictor.x,
        selfY: this.predictor.y,
        selfVx: this.predictor.vx,
        selfVy: this.predictor.vy,
        selfAngle: this.predictor.angle,
        selfAlive: selfAlive && !selfHidden,
        selfColorIdx: me?.colorIdx ?? 0,
        selfHp: selfRow ? selfRow.hp : 0,
        selfFiring: live && selfAlive && !selfHidden && inputState.fire === 1 && (selfRow ? selfRow.ammo : 0) > 0,
        ships,
        bullets,
        world: this.net.world,
        roster: this.net.roster,
        aimX: this.input.mouseX,
        aimY: this.input.mouseY,
        showCrosshair: !this.isMobile,
        // 锁定机制：当前锁定的敌机 id（0=无锁定；目标四角旋转锁定框）
        lockTargetId: state.lockTargetId,
        ammoFrac: (selfRow ? selfRow.ammo : 0) / MAX_AMMO,
        lastFireAt: this.lastFireAt,
      },
      dt,
    );

    // HUD store 10Hz 节流同步
    if (now - this.lastHudSync > HUD_SYNC_MS) {
      this.lastHudSync = now;
      // 弹药恢复相位同步：ammo 上升=服务端完成一次恢复（锚定此刻）；
      // 满弹后首次下降=满弹开火重置了服务端恢复计时（同步锚定）
      const hudAmmo = selfRow ? selfRow.ammo : MAX_AMMO;
      if (
        hudAmmo > this.prevHudAmmo ||
        (this.prevHudAmmo >= MAX_AMMO && hudAmmo < MAX_AMMO)
      ) {
        this.lastAmmoAnchorAt = now;
      }
      this.prevHudAmmo = hudAmmo;
      this.store.set({
        hp: selfRow ? selfRow.hp : state.phase === "respawning" ? 0 : MAX_HP,
        ammo: hudAmmo,
        ammoRegen: Math.min(1, (now - this.lastAmmoAnchorAt) / AMMO_REGEN_MS),
        selfHits: selfRow ? selfRow.hits : 0,
        selfUpg: selfRow ? selfRow.upg : 0,
        rtt: Math.round(this.net.rtt),
        tick: this.net.tick,
        entityCount: ships.size + bullets.length,
      });
    }

    // 性能自动降级：2s 窗口平均 FPS < 40 → 低粒子模式
    if (!this.perfDegraded) {
      this.fpsAccum += dt;
      this.fpsFrames += 1;
      if (this.fpsWindowStart === 0) this.fpsWindowStart = now;
      if (now - this.fpsWindowStart > 2000) {
        const avgFps = this.fpsFrames / this.fpsAccum;
        if (avgFps < LOW_FPS_THRESHOLD && this.fpsFrames > 30) {
          this.perfDegraded = true;
          this.setLowParticles(true);
          this.toast("PERFORMANCE MODE ENABLED", 2400);
        }
        this.fpsAccum = 0;
        this.fpsFrames = 0;
        this.fpsWindowStart = now;
      }
    }
  };

  // ───────── HUD 数据查询（计分板 / 雷达用） ─────────

  /**
   * 永久积分榜（服务器下发，昵称唯一、最高连杀、仅真人）。
   * 附带：是否本机昵称、该昵称当前是否在线（真人）。
   */
  getLeaderboardRows() {
    const selfName = this.net.roster.get(this.net.yourId)?.name ?? "";
    const onlineNames = new Set<string>();
    for (const p of this.net.roster.values()) {
      if (!p.isBot) onlineNames.add(p.name);
    }
    return this.net.leaderboard.map(([name, best]) => ({
      name,
      best,
      online: onlineNames.has(name),
      isSelf: name === selfName && selfName !== "",
    }));
  }

  getRadarShips(range: number): RadarShip[] {
    const out: RadarShip[] = [];
    if (!this.latestShips) return out;
    const sx = this.predictor.x;
    const sy = this.predictor.y;
    for (const ship of this.latestShips.values()) {
      if (ship.id === this.net.yourId) continue;
      const dx = ship.x - sx;
      const dy = ship.y - sy;
      if (Math.hypot(dx, dy) > range) continue;
      const p = this.net.roster.get(ship.id);
      out.push({
        x: dx,
        y: dy,
        color: p ? COLOR_POOL[p.colorIdx % COLOR_POOL.length] : "#67E8F9",
        isBot: p?.isBot ?? false,
        // 升级选择中隐身的战机不在雷达显示
        dead: (ship.flags & FLAG_HIDDEN) !== 0,
      });
    }
    return out;
  }

  getSelfPose() {
    return { x: this.predictor.x, y: this.predictor.y, angle: this.predictor.angle };
  }

  /** 某玩家最后已知世界坐标（击杀流点击高亮用） */
  getShipLastPos(id: number): { x: number; y: number } | null {
    const ship = this.latestShips?.get(id);
    if (ship) return { x: ship.x, y: ship.y };
    const row = this.net.snapshots.at(-1)?.ships.find((r) => r[0] === id);
    return row ? { x: row[1], y: row[2] } : null;
  }
}
