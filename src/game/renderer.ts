/**
 * NEON SWARM — Canvas 2D 渲染器（60fps rAF）
 *
 * - 相机平滑跟随本机（lerp 0.14 + 运动方向提前量 ≤80px）
 * - 多层视差星空（多色星点 + 轻微闪烁，按相机坐标平铺：0.15x / 0.35x / 0.6x）
 * - 预渲染星云团（cyan/violet/magenta 径向渐变 sprite，视差漂移）+ 远景星系斑点
 * - 惯性动感：尾焰随速度缩放；|v| > 60% 极速时绘制 additive 速度线
 * - 细网格 + 世界边界霓虹线（扩展时旧边界淡出、新边界淡入）
 * - 视锥剔除（可视范围 + 200px 缓冲）
 * - 战机：三角几何 + 霓虹描边 + 外发光（本机额外白色外发光）、引擎尾焰、转向倾斜
 * - 子弹：发光短划线（additive blending，ownerId → 名册颜色）
 * - 爆炸粒子对象池（同屏上限 240，移动端/低粒子减半再减半）
 * - 命中 80ms 白闪；重生 900ms 光圈；受击红色 vignette；3–6px 屏幕震动 120ms
 * - 危险指示：屏幕边缘红色小三角指向所有视野外敌人（无距离限制）
 */
import { COLOR_POOL, SHIP_RADIUS, SHIP_SPEED, BULLET_SPEED, MAX_AMMO, FLAG_HIDDEN, unpackUpg, upgMaxHp } from "@contracts/game";
import type { WorldBounds } from "@contracts/game";
import type { InterpBullet, InterpShip } from "./interp";
import type { RosterPlayer } from "./net";

export interface RenderSettings {
  lowParticles: boolean;
  highContrast: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
}

export interface RenderFrame {
  now: number;
  /** 本机（预测后）世界坐标与状态 */
  selfId: number;
  selfX: number;
  selfY: number;
  /** 本机预测速度（惯性模型），用于尾焰缩放与速度线 */
  selfVx: number;
  selfVy: number;
  selfAngle: number;
  selfAlive: boolean;
  selfColorIdx: number;
  /** 本机 HP（低血量冒烟） */
  selfHp: number;
  /** 本机正在开火（枪口焰） */
  selfFiring: boolean;
  /** 插值后的其他战机（含本机行，渲染时跳过 selfId） */
  ships: Map<number, InterpShip>;
  bullets: InterpBullet[];
  world: WorldBounds;
  roster: Map<number, RosterPlayer>;
  /** 准星屏幕坐标（CSS px）；showCrosshair=false 时隐藏（移动端） */
  aimX: number;
  aimY: number;
  showCrosshair: boolean;
  /** 弹药 0–1（准星外圈），低弹药变琥珀 */
  ammoFrac: number;
  /** 最近一次开火时间（准星脉冲），0 = 无 */
  lastFireAt: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ShockRing {
  x: number;
  y: number;
  start: number;
  color: string;
  kind: "explosion" | "respawn" | "impact";
}

interface DamageText {
  x: number;
  y: number;
  start: number;
  text: string;
  color: string;
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  c: string;
  /** 闪烁相位与速率（reduced-motion 时忽略） */
  tw: number;
  ph: number;
}

const CULL_MARGIN = 200;
const PARTICLE_CAP_DESKTOP = 240;
const STAR_CAP_DESKTOP = 450;
const STAR_TILE = 1024;
const EXPLOSION_MS = 420;
const RESPAWN_RING_MS = 900;
const HIT_FLASH_MS = 220; // 受击白/红交替闪烁窗口
const DAMAGE_TEXT_MS = 650;
const SHAKE_MS = 120;
const HURT_VIGNETTE_MS = 180;
const CAMERA_LERP = 0.14;
const CAMERA_LEAD_MAX = 80;
const GRID_STEP = 128;
const JOLT_MS = 180; // 受击机体击退抖动时长
const JOLT_PX = 11; // 击退位移峰值
const HITMARKER_MS = 150; // 准星命中标记时长
const IMPACT_RING_MS = 170; // 命中点冲击环时长
const SMOKE_FRAC = 0.35; // HP 低于该比例冒烟
const SMOKE_INTERVAL_MS = 130;

/** 确定性伪随机（星点平铺需要 tiles 间一致） */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colorAt(idx: number): string {
  return COLOR_POOL[((idx % COLOR_POOL.length) + COLOR_POOL.length) % COLOR_POOL.length];
}

export class GameRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private viewW = 0;
  private viewH = 0;

  private camX = 0;
  private camY = 0;
  private camInit = false;

  private settings: RenderSettings = {
    lowParticles: false,
    highContrast: false,
    screenShake: true,
    reducedMotion: false,
    isMobile: false,
  };

  private particles: Particle[] = [];
  private rings: ShockRing[] = [];
  private texts: DamageText[] = [];
  private hitFlashes = new Map<number, number>(); // shipId → flashUntil
  private jolts = new Map<number, { until: number; dx: number; dy: number }>(); // 受击击退
  private smokeAt = new Map<number, number>(); // 低血量冒烟节流
  private hitmarkerUntil = 0; // 准星命中标记
  private lastAngles = new Map<number, { angle: number; t: number }>();
  private starCache = new Map<string, Star[]>();

  private shakeUntil = 0;
  private shakeMag = 0;
  private hurtUntil = 0;
  private prevWorld: { bounds: WorldBounds; at: number } | null = null;
  private worldAt = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unsupported");
    this.ctx = ctx;
    const cap = this.particleCap();
    for (let i = 0; i < cap; i++) {
      this.particles.push({
        active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: "#fff",
      });
    }
    this.resize();
  }

  setSettings(s: Partial<RenderSettings>) {
    this.settings = { ...this.settings, ...s };
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewW = this.canvas.clientWidth;
    this.viewH = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.round(this.viewW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.viewH * this.dpr));
  }

  private particleCap(): number {
    let cap = PARTICLE_CAP_DESKTOP;
    if (this.settings.isMobile) cap = Math.floor(cap / 2);
    if (this.settings.lowParticles) cap = Math.floor(cap / 2);
    return cap;
  }

  private starCap(): number {
    let cap = STAR_CAP_DESKTOP;
    if (this.settings.isMobile || this.settings.lowParticles) cap = Math.floor(cap / 2);
    return cap;
  }

  // ───────── 外部特效触发 ─────────

  spawnExplosion(x: number, y: number, color: string) {
    const perBlast = this.settings.lowParticles ? 10 : this.settings.isMobile ? 18 : 36;
    const cap = this.particleCap();
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= perBlast) break;
      if (p.active) continue;
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 320;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.maxLife = 0.35 + Math.random() * 0.45;
      p.life = p.maxLife;
      p.size = 1.5 + Math.random() * 2.5;
      p.color = Math.random() < 0.25 ? "#F8FAFC" : color;
      spawned++;
    }
    // 活跃粒子超上限时最老的让位
    let active = 0;
    for (const p of this.particles) if (p.active) active++;
    if (active > cap) {
      let toKill = active - cap;
      for (const p of this.particles) {
        if (toKill <= 0) break;
        if (p.active) {
          p.active = false;
          toKill--;
        }
      }
    }
    this.rings.push({ x, y, start: performance.now(), color, kind: "explosion" });
  }

  spawnHitFlash(shipId: number) {
    this.hitFlashes.set(shipId, performance.now() + HIT_FLASH_MS);
  }

  /** 命中点定向火花（沿子弹方向的锥形喷射）+ 小冲击环 */
  spawnImpact(x: number, y: number, angle: number, color: string) {
    const perHit = this.settings.lowParticles ? 5 : this.settings.isMobile ? 8 : 12;
    let spawned = 0;
    for (const p of this.particles) {
      if (spawned >= perHit) break;
      if (p.active) continue;
      // 沿子弹方向 ±0.55rad 的锥形，少量反向碎屑
      const spread = (Math.random() - 0.5) * 1.1;
      const back = Math.random() < 0.18;
      const ang = angle + (back ? Math.PI + spread * 0.5 : spread);
      const spd = back ? 40 + Math.random() * 120 : 140 + Math.random() * 320;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.maxLife = 0.16 + Math.random() * 0.22;
      p.life = p.maxLife;
      p.size = 1.2 + Math.random() * 1.6;
      p.color = Math.random() < 0.35 ? "#FFFFFF" : Math.random() < 0.5 ? "#FDE9C8" : color;
      spawned++;
    }
    this.rings.push({ x, y, start: performance.now(), color, kind: "impact" });
  }

  /** 受击机体击退抖动：沿子弹方向位移后弹性回位 */
  spawnJolt(shipId: number, angle: number) {
    this.jolts.set(shipId, {
      until: performance.now() + JOLT_MS,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
    });
  }

  /** 准星命中标记（自己子弹命中时） */
  showHitmarker() {
    this.hitmarkerUntil = performance.now() + HITMARKER_MS;
  }

  /** 受击闪白/红交替颜色（无受击返回 null） */
  private flashColor(shipId: number, now: number): string | null {
    const until = this.hitFlashes.get(shipId) ?? 0;
    const rem = until - now;
    if (rem <= 0) return null;
    // 45ms 相位白/红交替，越接近结束红色占比越高
    return Math.floor(rem / 45) % 2 === 0 ? "#FFFFFF" : "#EF4444";
  }

  /** 受击击退位移（世界坐标偏移量，弹性衰减） */
  private joltOffset(shipId: number, now: number): { ox: number; oy: number } {
    const j = this.jolts.get(shipId);
    if (!j || now >= j.until) return { ox: 0, oy: 0 };
    const k = (j.until - now) / JOLT_MS; // 1→0
    const off = k * k * JOLT_PX;
    return { ox: j.dx * off, oy: j.dy * off };
  }

  /** 低血量冒烟（节流）；hpFrac 为 HP 占当前等级上限的比例 0–1 */
  private maybeSmoke(shipId: number, x: number, y: number, hpFrac: number, now: number) {
    if (hpFrac <= 0 || hpFrac >= SMOKE_FRAC) return;
    const last = this.smokeAt.get(shipId) ?? 0;
    if (now - last < SMOKE_INTERVAL_MS) return;
    this.smokeAt.set(shipId, now);
    // 残血时烟更密
    const ember = hpFrac < 0.18 || Math.random() < 0.4;
    for (const p of this.particles) {
      if (p.active) continue;
      p.active = true;
      p.x = x + (Math.random() - 0.5) * 10;
      p.y = y + (Math.random() - 0.5) * 10;
      p.vx = (Math.random() - 0.5) * 26;
      p.vy = -18 - Math.random() * 22;
      p.maxLife = 0.55 + Math.random() * 0.4;
      p.life = p.maxLife;
      p.size = ember ? 1.4 + Math.random() * 1.2 : 2.4 + Math.random() * 2;
      p.color = ember ? "#F97316" : "#64748B";
      break;
    }
  }

  spawnRespawnRing(x: number, y: number, color: string) {
    this.rings.push({ x, y, start: performance.now(), color, kind: "respawn" });
  }

  spawnDamageNumber(x: number, y: number, text: string, color: string) {
    this.texts.push({ x, y, start: performance.now(), text, color });
    if (this.texts.length > 24) this.texts.shift();
  }

  shake(mag: number) {
    if (!this.settings.screenShake || this.settings.reducedMotion) return;
    this.shakeMag = Math.min(6, Math.max(3, mag));
    this.shakeUntil = performance.now() + SHAKE_MS;
  }

  hurtFlash() {
    this.hurtUntil = performance.now() + HURT_VIGNETTE_MS;
  }

  notifyWorldBounds(bounds: WorldBounds, prev: WorldBounds | null) {
    this.worldAt = performance.now();
    if (prev && (prev[0] !== bounds[0] || prev[1] !== bounds[1] || prev[2] !== bounds[2] || prev[3] !== bounds[3])) {
      this.prevWorld = { bounds: prev, at: this.worldAt };
    }
  }

  // ───────── 星点平铺 ─────────

  private starsForTile(layer: number, tx: number, ty: number): Star[] {
    const key = `${layer}:${tx}:${ty}`;
    const cached = this.starCache.get(key);
    if (cached) return cached;
    const rand = mulberry32((layer * 73856093) ^ (tx * 19349663) ^ (ty * 83492791));
    const density = [14, 10, 7][layer];
    const stars: Star[] = [];
    for (let i = 0; i < density; i++) {
      const tint = rand();
      // 多色星点：青 / 蓝白 / 暖白 / 品红点缀 / 默认冷白
      const c =
        tint < 0.1
          ? "#67E8F9"
          : tint < 0.2
            ? "#93C5FD"
            : tint < 0.26
              ? "#FDE9C8"
              : tint < 0.32
                ? "#F0ABFC"
                : "#F8FAFC";
      const bright = rand() > 0.92; // 少量亮星，更大更亮
      stars.push({
        x: tx * STAR_TILE + rand() * STAR_TILE,
        y: ty * STAR_TILE + rand() * STAR_TILE,
        r: bright
          ? 1.4 + rand() * (layer === 2 ? 1.2 : 0.6)
          : 0.4 + rand() * (layer === 2 ? 1.6 : 1.0),
        a: bright ? 0.7 + rand() * 0.3 : 0.25 + rand() * 0.65,
        c,
        tw: 0.6 + rand() * 1.6,
        ph: rand() * Math.PI * 2,
      });
    }
    if (this.starCache.size > 96) this.starCache.clear();
    this.starCache.set(key, stars);
    return stars;
  }

  private drawStars(cx: number, cy: number, now: number) {
    const layers: Array<{ p: number; idx: number }> = [
      { p: 0.15, idx: 0 },
      { p: 0.35, idx: 1 },
      { p: 0.6, idx: 2 },
    ];
    let drawn = 0;
    const cap = this.starCap();
    const ctx = this.ctx;
    const twinkle = !this.settings.reducedMotion;
    for (const { p, idx } of layers) {
      if (drawn >= cap) break;
      const ox = cx * p;
      const oy = cy * p;
      const minTx = Math.floor((ox - this.viewW / 2) / STAR_TILE);
      const maxTx = Math.floor((ox + this.viewW / 2) / STAR_TILE);
      const minTy = Math.floor((oy - this.viewH / 2) / STAR_TILE);
      const maxTy = Math.floor((oy + this.viewH / 2) / STAR_TILE);
      for (let tx = minTx; tx <= maxTx; tx++) {
        for (let ty = minTy; ty <= maxTy; ty++) {
          for (const s of this.starsForTile(idx, tx, ty)) {
            if (drawn >= cap) return;
            const sx = s.x - ox + this.viewW / 2;
            const sy = s.y - oy + this.viewH / 2;
            if (sx < -4 || sx > this.viewW + 4 || sy < -4 || sy > this.viewH + 4) continue;
            // 轻微闪烁：alpha 在 72%–100% 间缓慢呼吸
            ctx.globalAlpha = twinkle
              ? s.a * (0.72 + 0.28 * Math.sin(now * 0.0011 * s.tw + s.ph))
              : s.a;
            ctx.fillStyle = s.c;
            ctx.fillRect(sx, sy, s.r, s.r);
            drawn++;
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawGrid(cx: number, cy: number) {
    const ctx = this.ctx;
    const x0 = cx - this.viewW / 2;
    const x1 = cx + this.viewW / 2;
    const y0 = cy - this.viewH / 2;
    const y1 = cy + this.viewH / 2;
    ctx.strokeStyle = this.settings.highContrast
      ? "rgba(34,211,238,0.10)"
      : "rgba(34,211,238,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(x0 / GRID_STEP) * GRID_STEP; x <= x1; x += GRID_STEP) {
      const sx = x - cx + this.viewW / 2;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.viewH);
    }
    for (let y = Math.floor(y0 / GRID_STEP) * GRID_STEP; y <= y1; y += GRID_STEP) {
      const sy = y - cy + this.viewH / 2;
      ctx.moveTo(0, sy);
      ctx.lineTo(this.viewW, sy);
    }
    ctx.stroke();
  }

  // ───────── 星云 / 远景星系（预渲染 offscreen sprite 复用） ─────────

  /** 星云团：不同颜色/视差/锚点/缩放/透明度，随视差层缓慢漂移 */
  private static readonly NEBULAE = [
    { color: "34,211,238", a: 0.1, p: 0.08, ax: 900, ay: -1400, scale: 1.35 },
    { color: "139,92,246", a: 0.09, p: 0.11, ax: -2100, ay: 1600, scale: 1.1 },
    { color: "233,53,193", a: 0.07, p: 0.06, ax: 2600, ay: 2200, scale: 0.95 },
    { color: "34,211,238", a: 0.06, p: 0.13, ax: -3200, ay: -2600, scale: 0.8 },
  ] as const;

  private nebulaSprites = new Map<string, HTMLCanvasElement>();
  private galaxySprites: HTMLCanvasElement[] = [];

  /** 预渲染低透明度径向渐变到 offscreen canvas，避免每帧创建渐变对象 */
  private nebulaSprite(color: string): HTMLCanvasElement {
    let sprite = this.nebulaSprites.get(color);
    if (sprite) return sprite;
    const size = 256;
    sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const g = sprite.getContext("2d")!;
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${color},0.55)`);
    grad.addColorStop(0.45, `rgba(${color},0.18)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    this.nebulaSprites.set(color, sprite);
    return sprite;
  }

  /** 远景星系斑点：小型椭圆光斑，预渲染 2 个朝向 */
  private galaxySprite(i: number): HTMLCanvasElement {
    if (this.galaxySprites[i]) return this.galaxySprites[i];
    const size = 96;
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const g = sprite.getContext("2d")!;
    g.translate(size / 2, size / 2);
    g.rotate(i === 0 ? -0.5 : 0.7);
    g.scale(1, 0.42);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, size / 2);
    grad.addColorStop(0, "rgba(226,232,240,0.5)");
    grad.addColorStop(0.35, i === 0 ? "rgba(147,197,253,0.16)" : "rgba(240,171,252,0.14)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(-size / 2, -size / 2, size, size);
    this.galaxySprites[i] = sprite;
    return sprite;
  }

  private drawNebula(cx: number, cy: number, now: number) {
    const ctx = this.ctx;
    const base = Math.max(this.viewW, this.viewH);
    const drift = this.settings.reducedMotion ? 0 : 1;
    const wrap = 4096; // 视差坐标环绕周期，保证星云始终分布在视口附近
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const n of GameRenderer.NEBULAE) {
      const sprite = this.nebulaSprite(n.color);
      const r = base * n.scale;
      // 视差漂移 + 极缓慢的时间漂移（reduced-motion 关闭）
      const t = drift * (now % 600000) * 0.000004;
      let dx = (n.ax + t * 300 - cx * n.p) % wrap;
      if (dx > wrap / 2) dx -= wrap;
      else if (dx < -wrap / 2) dx += wrap;
      let dy = (n.ay - t * 180 - cy * n.p) % wrap;
      if (dy > wrap / 2) dy -= wrap;
      else if (dy < -wrap / 2) dy += wrap;
      ctx.globalAlpha = n.a;
      ctx.drawImage(sprite, this.viewW / 2 + dx - r, this.viewH / 2 + dy - r, r * 2, r * 2);
    }
    ctx.restore();
    this.drawGalaxies(cx, cy);
  }

  /** 远景星系：最远视差层（0.1x），每个 2048px tile 确定性 0–2 个 */
  private drawGalaxies(cx: number, cy: number) {
    const ctx = this.ctx;
    const p = 0.1;
    const tile = 2048;
    const ox = cx * p;
    const oy = cy * p;
    const minTx = Math.floor((ox - this.viewW / 2 - 96) / tile);
    const maxTx = Math.floor((ox + this.viewW / 2 + 96) / tile);
    const minTy = Math.floor((oy - this.viewH / 2 - 96) / tile);
    const maxTy = Math.floor((oy + this.viewH / 2 + 96) / tile);
    ctx.save();
    for (let tx = minTx; tx <= maxTx; tx++) {
      for (let ty = minTy; ty <= maxTy; ty++) {
        const rand = mulberry32((tx * 2654435761) ^ (ty * 1597334677) ^ 0x9e3779b9);
        const count = rand() < 0.35 ? 0 : rand() < 0.7 ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const gx = tx * tile + rand() * tile - ox + this.viewW / 2;
          const gy = ty * tile + rand() * tile - oy + this.viewH / 2;
          if (gx < -96 || gx > this.viewW + 96 || gy < -96 || gy > this.viewH + 96) continue;
          const size = 40 + rand() * 56;
          ctx.globalAlpha = 0.28 + rand() * 0.3;
          ctx.drawImage(this.galaxySprite(rand() < 0.5 ? 0 : 1), gx - size / 2, gy - size / 2, size, size);
        }
      }
    }
    ctx.restore();
  }

  private drawWorldBounds(world: WorldBounds, cx: number, cy: number, now: number) {
    const ctx = this.ctx;
    const fadeIn = Math.min(1, (now - this.worldAt) / 600);
    const alpha = 0.55 * (0.3 + 0.7 * fadeIn);
    const toScreen = (wx: number, wy: number) => ({
      x: wx - cx + this.viewW / 2,
      y: wy - cy + this.viewH / 2,
    });
    const a = toScreen(world[0], world[1]);
    const b = toScreen(world[2], world[3]);
    ctx.save();
    if (this.settings.highContrast) ctx.setLineDash([10, 8]);
    ctx.strokeStyle = `rgba(34,211,238,${alpha.toFixed(3)})`;
    ctx.lineWidth = 2;
    if (!this.settings.lowParticles && !this.settings.isMobile) {
      ctx.shadowColor = "rgba(34,211,238,0.6)";
      ctx.shadowBlur = 12;
    }
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
    // 旧边界淡出 300ms
    if (this.prevWorld) {
      const t = (now - this.prevWorld.at) / 300;
      if (t < 1) {
        const pb = this.prevWorld.bounds;
        const pa = toScreen(pb[0], pb[1]);
        const pbb = toScreen(pb[2], pb[3]);
        ctx.save();
        ctx.strokeStyle = `rgba(233,53,193,${(0.4 * (1 - t)).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pa.x, pa.y, pbb.x - pa.x, pbb.y - pa.y);
        ctx.restore();
      } else {
        this.prevWorld = null;
      }
    }
  }

  // ───────── 战机 ─────────

  private drawShip(
    sx: number,
    sy: number,
    angle: number,
    color: string,
    isSelf: boolean,
    vx: number,
    vy: number,
    turnRate: number,
    flashColor: string | null,
    now: number,
  ) {
    const ctx = this.ctx;
    const speed = Math.hypot(vx, vy);
    const speedFrac = Math.min(1, speed / SHIP_SPEED);
    const tilt = Math.max(-0.18, Math.min(0.18, turnRate * 0.03));

    // 高速速度线（>60% 最大速度）：沿运动反方向的 additive 短 streak
    if (
      speedFrac > 0.6 &&
      !this.settings.reducedMotion &&
      !this.settings.lowParticles
    ) {
      this.drawSpeedLines(sx, sy, vx / speed, vy / speed, speedFrac, color, now);
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.transform(1, tilt, 0, 1, 0, 0); // 转向倾斜

    // 引擎尾焰：长度/宽度随速度缩放，6–14px 抖动，透明度 .45→.9（双喷口尾部）
    if (speed > 24) {
      const flick = this.settings.reducedMotion
        ? 10
        : 6 + (Math.sin(now * 0.045) * 0.5 + 0.5) * 8;
      const len = (flick + 8) * (0.55 + 0.75 * speedFrac);
      const halfW = 2.2 + 1.6 * speedFrac;
      const alpha = (0.45 + ((flick - 6) / 8) * 0.45) * (0.6 + 0.4 * speedFrac);
      const grad = ctx.createLinearGradient(-12, 0, -12 - len, 0);
      grad.addColorStop(0, `rgba(255,255,255,${alpha.toFixed(2)})`);
      grad.addColorStop(0.35, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-12, -halfW);
      ctx.lineTo(-12 - len, 0);
      ctx.lineTo(-12, halfW);
      ctx.closePath();
      ctx.fill();
    }

    const glow = !this.settings.lowParticles && !this.settings.isMobile;
    if (isSelf && glow) {
      // 本机：白色外发光
      ctx.shadowColor = "rgba(248,250,252,0.9)";
      ctx.shadowBlur = 18;
    } else if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    // ── 蓝图同款战机（参照首页战机系统蓝图：后掠翼 + 长机身 + 双机炮 + 双喷口）──
    // 后掠翼（先画，压在机身下）
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(-13, 16.5);
    ctx.lineTo(-6.5, 5);
    ctx.closePath();
    ctx.moveTo(4, -6);
    ctx.lineTo(-13, -16.5);
    ctx.lineTo(-6.5, -5);
    ctx.closePath();
    ctx.fillStyle = "rgba(7,17,31,0.9)";
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = flashColor ?? color;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 主机身：长三角飞镖 + 尾部V形缺口
    const hull = new Path2D();
    hull.moveTo(19, 0);
    hull.lineTo(-9, 8.5);
    hull.lineTo(-5.5, 0);
    hull.lineTo(-9, -8.5);
    hull.closePath();
    ctx.fillStyle = "rgba(7,17,31,0.94)";
    ctx.fill(hull);
    ctx.lineWidth = isSelf ? 2.2 : 1.7;
    ctx.strokeStyle = flashColor ?? color;
    ctx.stroke(hull);
    ctx.shadowBlur = 0;

    // 受击白/红交替闪烁覆盖
    if (flashColor) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = flashColor;
      ctx.fill(hull);
      ctx.globalAlpha = 1;
    }

    // 机腹内衬折线（蓝图虚线内轮廓的实线化）
    ctx.beginPath();
    ctx.moveTo(11.5, 0);
    ctx.lineTo(-1.5, 4.6);
    ctx.lineTo(-4.5, 0);
    ctx.lineTo(-1.5, -4.6);
    ctx.closePath();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.strokeStyle = flashColor ?? color;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 双机炮（机身两侧平行炮管，白色炮口）
    ctx.beginPath();
    ctx.moveTo(1, 5.5);
    ctx.lineTo(11, 5.5);
    ctx.moveTo(1, -5.5);
    ctx.lineTo(11, -5.5);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = "rgba(248,250,252,0.85)";
    ctx.stroke();

    // 双引擎喷口
    ctx.beginPath();
    ctx.moveTo(-9, 3);
    ctx.lineTo(-13.5, 3);
    ctx.moveTo(-9, -3);
    ctx.lineTo(-13.5, -3);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = flashColor ?? color;
    ctx.stroke();

    // 驾驶舱核心（双层圆 + 亮点）
    ctx.beginPath();
    ctx.arc(4, 0, 2.8, 0, Math.PI * 2);
    ctx.strokeStyle = flashColor ?? "rgba(248,250,252,0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(4, 0, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = flashColor ?? color;
    ctx.fill();

    ctx.restore();

    if (isSelf) {
      // 本机白色定位环
      ctx.save();
      ctx.strokeStyle = "rgba(248,250,252,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, sy, SHIP_RADIUS + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 高速速度线：3 条沿运动反方向的短 streak，additive、低成本 */
  private drawSpeedLines(
    sx: number,
    sy: number,
    dirX: number,
    dirY: number,
    speedFrac: number,
    color: string,
    now: number,
  ) {
    const ctx = this.ctx;
    const px = -dirY; // 垂直方向
    const py = dirX;
    const k = (speedFrac - 0.6) / 0.4; // 0–1
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      // 每条线横向错开并带轻微相位抖动
      const off = (i - 1) * 12;
      const jitter = Math.sin(now * 0.02 + i * 2.1) * 3;
      const bx = sx - dirX * (SHIP_RADIUS + 6 + jitter) + px * off;
      const by = sy - dirY * (SHIP_RADIUS + 6 + jitter) + py * off;
      const len = 12 + 26 * k + Math.sin(now * 0.03 + i) * 4;
      ctx.globalAlpha = 0.1 + 0.2 * k;
      ctx.lineWidth = 1.2 + k * 0.8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - dirX * len, by - dirY * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawShipLabel(sx: number, sy: number, name: string, isBot: boolean) {
    const ctx = this.ctx;
    const y = sy - SHIP_RADIUS - 18;
    ctx.save();
    ctx.font = "600 10px Rajdhani, 'Noto Sans SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(203,213,225,0.9)";
    const label = (isBot ? `${name} ·BOT` : name).slice(0, 14);
    ctx.fillText(label, sx, y);
    ctx.restore();
  }

  /** 小红心图标 */
  private drawHeart(x: number, y: number, s: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.15, y + s * 0.1, x - s * 0.65, y - s, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.65, y - s, x + s * 1.15, y + s * 0.1, x, y + s * 0.9);
    ctx.fill();
  }

  /** 小子弹图标（斜置弹壳 + 弹头） */
  private drawBulletIcon(x: number, y: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-Math.PI / 4);
    ctx.fillRect(-4, -1.4, 6, 2.8); // 弹壳
    ctx.beginPath(); // 弹头
    ctx.moveTo(2, -1.4);
    ctx.lineTo(4.6, 0);
    ctx.lineTo(2, 1.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * 战机下方双状态条（随机体移动，无任何文字）：
   * 上行 ❤ 红色生命条，下行 ● 黄色子弹条。
   */
  private drawStatusBars(sx: number, sy: number, hpFrac: number, ammoFrac: number) {
    const ctx = this.ctx;
    const barW = 30;
    const barH = 3;
    const iconX = sx - 22; // 图标中心
    const barX = sx - 14; // 条形左缘
    const rows: Array<{ y: number; frac: number; color: string; icon: "hp" | "ammo" }> = [
      { y: sy + SHIP_RADIUS + 10, frac: hpFrac, color: "#EF4444", icon: "hp" },
      { y: sy + SHIP_RADIUS + 19, frac: ammoFrac, color: "#FACC15", icon: "ammo" },
    ];
    ctx.save();
    for (const r of rows) {
      const frac = Math.max(0, Math.min(1, r.frac));
      if (r.icon === "hp") {
        ctx.fillStyle = r.color;
        this.drawHeart(iconX, r.y + 1.5, 4);
      } else {
        ctx.fillStyle = r.color;
        this.drawBulletIcon(iconX, r.y + 1.5);
      }
      // 底槽 + 填充
      ctx.fillStyle = "rgba(148,163,184,0.22)";
      ctx.fillRect(barX, r.y, barW, barH);
      ctx.fillStyle = r.color;
      ctx.fillRect(barX, r.y, barW * frac, barH);
    }
    ctx.restore();
  }

  // ───────── 主渲染 ─────────

  render(frame: RenderFrame, dt: number) {
    const now = frame.now;
    const ctx = this.ctx;

    // 相机跟随：lerp + 运动方向提前量
    if (!this.camInit) {
      this.camX = frame.selfX;
      this.camY = frame.selfY;
      this.camInit = true;
    }
    let leadX = 0;
    let leadY = 0;
    const self = frame.ships.get(frame.selfId);
    if (self && frame.selfAlive) {
      const spd = Math.hypot(self.vx, self.vy);
      if (spd > 40) {
        const k = Math.min(1, spd / 300) * CAMERA_LEAD_MAX;
        leadX = (self.vx / spd) * k;
        leadY = (self.vy / spd) * k;
      }
    }
    const lerpK = this.settings.reducedMotion ? 1 : 1 - Math.pow(1 - CAMERA_LERP, dt * 60);
    this.camX += (frame.selfX + leadX - this.camX) * lerpK;
    this.camY += (frame.selfY + leadY - this.camY) * lerpK;

    // 屏幕震动 3–6px / 120ms
    let shakeX = 0;
    let shakeY = 0;
    if (now < this.shakeUntil) {
      const k = (this.shakeUntil - now) / SHAKE_MS;
      shakeX = (Math.random() * 2 - 1) * this.shakeMag * k;
      shakeY = (Math.random() * 2 - 1) * this.shakeMag * k;
    }
    const camX = this.camX + shakeX;
    const camY = this.camY + shakeY;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // 深空底色
    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    this.drawNebula(camX, camY, now);
    this.drawStars(camX, camY, now);
    this.drawGrid(camX, camY);
    this.drawWorldBounds(frame.world, camX, camY, now);

    const toScreenX = (wx: number) => wx - camX + this.viewW / 2;
    const toScreenY = (wy: number) => wy - camY + this.viewH / 2;
    const inView = (wx: number, wy: number, margin = CULL_MARGIN) => {
      const sx = toScreenX(wx);
      const sy = toScreenY(wy);
      return sx > -margin && sx < this.viewW + margin && sy > -margin && sy < this.viewH + margin;
    };

    // ── 子弹（additive 发光短划线）──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glowFx = !this.settings.lowParticles && !this.settings.isMobile;
    for (const b of frame.bullets) {
      if (!inView(b.x, b.y, 60)) continue;
      const owner = frame.roster.get(b.ownerId);
      const color = owner ? colorAt(owner.colorIdx) : "#67E8F9";
      const trail = 12 + (BULLET_SPEED / 800) * 16; // 12–28px
      const sx = toScreenX(b.x);
      const sy = toScreenY(b.y);
      const tx = sx - Math.cos(b.angle) * trail;
      const ty = sy - Math.sin(b.angle) * trail;
      if (glowFx) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // 弹头亮点
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── 战机（视锥剔除 +200px）──
    for (const ship of frame.ships.values()) {
      if (ship.id === frame.selfId) continue;
      if (!inView(ship.x, ship.y)) {
        this.lastAngles.delete(ship.id);
        continue;
      }
      if ((ship.flags & FLAG_HIDDEN) !== 0) continue; // 升级选择中：隐身不渲染
      const owner = frame.roster.get(ship.id);
      const color = owner ? colorAt(owner.colorIdx) : "#67E8F9";
      const sx = toScreenX(ship.x);
      const sy = toScreenY(ship.y);

      // 转向倾斜角速度
      const prev = this.lastAngles.get(ship.id);
      let turnRate = 0;
      if (prev && now > prev.t) {
        let d = ship.angle - prev.angle;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        turnRate = d / ((now - prev.t) / 1000);
      }
      this.lastAngles.set(ship.id, { angle: ship.angle, t: now });

      // 受击：击退抖动位移 + 白/红交替闪烁 + 低血量冒烟
      const { ox, oy } = this.joltOffset(ship.id, now);
      // HP 比例按升级加成后的生命上限计算（lvHp 每级 ×1.05）
      const hpFrac = ship.hp / upgMaxHp(unpackUpg(ship.upg).lvHp);
      this.maybeSmoke(ship.id, ship.x, ship.y, hpFrac, now);
      this.drawShip(sx + ox, sy + oy, ship.angle, color, false, ship.vx, ship.vy, turnRate, this.flashColor(ship.id, now), now);
      // 每架战机都显示昵称（名册缺失时兜底）+ 下方双状态条
      this.drawShipLabel(sx, sy, owner?.name ?? "PILOT", Boolean(owner?.isBot));
      this.drawStatusBars(sx + ox, sy + oy, hpFrac, ship.ammo / MAX_AMMO);
    }

    // ── 本机（预测位置渲染）──
    if (frame.selfAlive) {
      const sx = toScreenX(frame.selfX);
      const sy = toScreenY(frame.selfY);
      const selfColor = colorAt(frame.selfColorIdx);
      const { ox, oy } = this.joltOffset(frame.selfId, now);
      const selfUpg = frame.ships.get(frame.selfId)?.upg ?? 0;
      const selfHpFrac = frame.selfHp / upgMaxHp(unpackUpg(selfUpg).lvHp);
      this.maybeSmoke(frame.selfId, frame.selfX, frame.selfY, selfHpFrac, now);
      this.drawShip(sx + ox, sy + oy, frame.selfAngle, selfColor, true, frame.selfVx, frame.selfVy, 0, this.flashColor(frame.selfId, now), now);
      this.drawStatusBars(sx + ox, sy + oy, selfHpFrac, frame.ammoFrac);
      // 枪口焰：开火时机首 additive 辉光
      if (frame.selfFiring) {
        const mxp = sx + ox + Math.cos(frame.selfAngle) * 21;
        const myp = sy + oy + Math.sin(frame.selfAngle) * 21;
        const flick = this.settings.reducedMotion ? 5 : 4 + Math.sin(now * 0.11) * 1.6;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const mg = ctx.createRadialGradient(mxp, myp, 0, mxp, myp, flick * 2.4);
        mg.addColorStop(0, "rgba(255,255,255,0.8)");
        mg.addColorStop(0.4, "rgba(103,232,249,0.4)");
        mg.addColorStop(1, "rgba(103,232,249,0)");
        ctx.fillStyle = mg;
        ctx.beginPath();
        ctx.arc(mxp, myp, flick * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ── 爆炸粒子 ──
    const cap = this.particleCap();
    if (this.particles.length > cap) {
      // 设置降级后收缩池
      this.particles.length = cap;
    }
    let anyParticle = false;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt;
      p.vy *= 1 - 2.4 * dt;
      if (!inView(p.x, p.y, 40)) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.y);
      ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size);
      anyParticle = true;
    }
    if (anyParticle) ctx.globalAlpha = 1;

    // ── 冲击环 / 重生光圈 ──
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      const dur =
        r.kind === "explosion" ? EXPLOSION_MS : r.kind === "respawn" ? RESPAWN_RING_MS : IMPACT_RING_MS;
      const t = (now - r.start) / dur;
      if (t >= 1) {
        this.rings.splice(i, 1);
        continue;
      }
      if (!inView(r.x, r.y, 300)) continue;
      const sx = toScreenX(r.x);
      const sy = toScreenY(r.y);
      // explosion: scale .2→1.6 opacity .85→0；respawn: .6→1.2/.8→0；impact: .4→1.4/.7→0（小半径快扩散）
      const s0 = r.kind === "explosion" ? 0.2 : r.kind === "respawn" ? 0.6 : 0.4;
      const s1 = r.kind === "explosion" ? 1.6 : r.kind === "respawn" ? 1.2 : 1.4;
      const a0 = r.kind === "explosion" ? 0.85 : r.kind === "respawn" ? 0.8 : 0.7;
      const base = r.kind === "impact" ? 15 : 40;
      const scale = s0 + (s1 - s0) * t;
      ctx.save();
      ctx.globalAlpha = a0 * (1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.kind === "explosion" ? 3 : 2;
      if (glowFx) {
        ctx.shadowColor = r.color;
        ctx.shadowBlur = 14;
      }
      ctx.beginPath();
      ctx.arc(sx, sy, base * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── 伤害数字 ──
    ctx.save();
    ctx.font = "700 13px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = (now - this.texts[i].start) / DAMAGE_TEXT_MS;
      if (t >= 1) {
        this.texts.splice(i, 1);
        continue;
      }
      const d = this.texts[i];
      const sx = toScreenX(d.x);
      const sy = toScreenY(d.y) - 28 * t;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, sx, sy);
    }
    ctx.restore();

    // ── 视野外敌人红色小三角（全图敌人，无距离限制）──
    if (frame.selfAlive) this.drawThreatArrows(frame, camX, camY);

    // ── 受击红色 vignette 0→.35→0 / 180ms ──
    if (now < this.hurtUntil) {
      const t = 1 - (this.hurtUntil - now) / HURT_VIGNETTE_MS; // 0→1
      const env = t < 0.5 ? t * 2 : (1 - t) * 2;
      const grad = ctx.createRadialGradient(
        this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.3,
        this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.7,
      );
      grad.addColorStop(0, "rgba(239,68,68,0)");
      grad.addColorStop(1, `rgba(239,68,68,${(0.35 * env).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }

    // ── 准星 ──
    if (frame.showCrosshair && frame.selfAlive) {
      this.drawCrosshair(frame, now);
    }
  }

  private drawThreatArrows(frame: RenderFrame, camX: number, camY: number) {
    const ctx = this.ctx;
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    for (const ship of frame.ships.values()) {
      if (ship.id === frame.selfId || (ship.flags & FLAG_HIDDEN) !== 0) continue;
      const dx = ship.x - camX;
      const dy = ship.y - camY;
      const sx = dx + cx;
      const sy = dy + cy;
      const onScreen =
        sx > -40 && sx < this.viewW + 40 && sy > -40 && sy < this.viewH + 40;
      if (onScreen) continue;
      // 所有视野外敌人都在屏幕边缘显示红色小三角，无论距离
      const ang = Math.atan2(dy, dx);
      // 椭圆边界交点（屏幕内缩 36px）
      const rx = this.viewW / 2 - 36;
      const ry = this.viewH / 2 - 36;
      const ex = cx + Math.cos(ang) * rx;
      const ey = cy + Math.sin(ang) * ry;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#EF4444";
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-5, 5);
      ctx.lineTo(-5, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawCrosshair(frame: RenderFrame, now: number) {
    const ctx = this.ctx;
    const { aimX, aimY } = frame;
    // 开火脉冲 scale 1→.92→1，80ms
    let scale = 1;
    const sinceFire = now - frame.lastFireAt;
    if (sinceFire >= 0 && sinceFire < 80) {
      const t = sinceFire / 80;
      scale = t < 0.5 ? 1 - 0.08 * (t * 2) : 0.92 + 0.08 * ((t - 0.5) * 2);
    }
    const lowAmmo = frame.ammoFrac < 0.15;
    const ringColor = lowAmmo ? "#FBBF24" : "rgba(103,232,249,0.55)";
    ctx.save();
    ctx.translate(aimX, aimY);
    ctx.scale(scale, scale);
    // 中心点
    ctx.fillStyle = "#22D3EE";
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // 四段短线
    ctx.strokeStyle = "rgba(103,232,249,0.9)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
    }
    ctx.stroke();
    // 外圈弹药弧
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frame.ammoFrac);
    ctx.stroke();
    // 命中标记：自己子弹命中时白色 X 闪现并微扩散
    if (now < this.hitmarkerUntil) {
      const t = (this.hitmarkerUntil - now) / HITMARKER_MS; // 1→0
      const r0 = 5 + (1 - t) * 5;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a) * (r0 + 5), Math.sin(a) * (r0 + 5));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  getCamera(): { x: number; y: number } {
    return { x: this.camX, y: this.camY };
  }
}
