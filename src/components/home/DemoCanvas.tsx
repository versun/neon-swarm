import { useEffect, useRef } from "react";

/**
 * 首页背景：随机模拟对战（attract mode）
 * 每次加载随机生成 6 架霓虹战机在 hero 背景里自主缠斗：
 * 追踪、开火、命中火花、击毁重生。低透明度、纯装饰、不参与交互。
 */

const COLORS = ["#22D3EE", "#E935C1", "#A3E635", "#F97316", "#8B5CF6", "#FACC15"];
const SHIP_COUNT = 6;
const TURN = 2.6; // rad/s 转向速率
const THRUST = 220; // px/s²
const DRAG = 0.9; // 1/s
const MAX_SPD = 170;
const BULLET_SPD = 380;
const HIT_R = 20;

interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  color: string;
  hp: number;
  fireIn: number;
  respawnIn: number;
}
interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  owner: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

export default function DemoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let raf = 0;
    let running = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const ships: Ship[] = Array.from({ length: SHIP_COUNT }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0,
      vy: 0,
      angle: Math.random() * Math.PI * 2,
      color: COLORS[i % COLORS.length],
      hp: 15,
      fireIn: Math.random(),
      respawnIn: 0,
    }));
    const bullets: Bullet[] = [];
    const sparks: Spark[] = [];

    const spawnSparks = (x: number, y: number, color: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 220;
        const life = 0.2 + Math.random() * 0.5;
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life,
          max: life,
          color,
        });
      }
    };

    const shortest = (a: number) => {
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    };

    let last = performance.now();
    const step = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // ── 模拟 ──
      for (let i = 0; i < ships.length; i++) {
        const s = ships[i];
        if (s.respawnIn > 0) {
          s.respawnIn -= dt;
          if (s.respawnIn <= 0) {
            s.x = Math.random() * w;
            s.y = Math.random() * h;
            s.vx = 0;
            s.vy = 0;
            s.hp = 15;
          }
          continue;
        }
        // 追踪最近存活目标
        let best: Ship | null = null;
        let bestD = Infinity;
        for (let j = 0; j < ships.length; j++) {
          if (j === i || ships[j].respawnIn > 0) continue;
          const d = Math.hypot(ships[j].x - s.x, ships[j].y - s.y);
          if (d < bestD) {
            bestD = d;
            best = ships[j];
          }
        }
        if (best) {
          const want = Math.atan2(best.y - s.y, best.x - s.x);
          const diff = shortest(want - s.angle);
          s.angle += Math.max(-TURN * dt, Math.min(TURN * dt, diff));
          s.fireIn -= dt;
          if (s.fireIn <= 0 && bestD < 520 && Math.abs(diff) < 0.3) {
            s.fireIn = 0.2 + Math.random() * 0.3;
            bullets.push({
              x: s.x + Math.cos(s.angle) * 16,
              y: s.y + Math.sin(s.angle) * 16,
              vx: Math.cos(s.angle) * BULLET_SPD,
              vy: Math.sin(s.angle) * BULLET_SPD,
              color: s.color,
              life: 1.6,
              owner: i,
            });
          }
        }
        s.vx += Math.cos(s.angle) * THRUST * dt;
        s.vy += Math.sin(s.angle) * THRUST * dt;
        const drag = Math.exp(-DRAG * dt);
        s.vx *= drag;
        s.vy *= drag;
        const spd = Math.hypot(s.vx, s.vy);
        if (spd > MAX_SPD) {
          s.vx = (s.vx / spd) * MAX_SPD;
          s.vy = (s.vy / spd) * MAX_SPD;
        }
        s.x = (s.x + s.vx * dt + w) % w;
        s.y = (s.y + s.vy * dt + h) % h;
      }
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > w + 20 || b.y < -20 || b.y > h + 20) {
          bullets.splice(i, 1);
          continue;
        }
        for (let j = 0; j < ships.length; j++) {
          if (j === b.owner) continue;
          const s = ships[j];
          if (s.respawnIn > 0) continue;
          if (Math.hypot(s.x - b.x, s.y - b.y) < HIT_R) {
            s.hp -= 1;
            spawnSparks(b.x, b.y, s.color, 5);
            bullets.splice(i, 1);
            if (s.hp <= 0) {
              spawnSparks(s.x, s.y, s.color, 18);
              s.respawnIn = 1.6;
            }
            break;
          }
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) sparks.splice(i, 1);
      }

      // ── 绘制（低透明度装饰层）──
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (const s of ships) {
        if (s.respawnIn > 0) continue;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(13, 0);
        ctx.lineTo(-8, 7);
        ctx.lineTo(-4.5, 0);
        ctx.lineTo(-8, -7);
        ctx.closePath();
        ctx.fillStyle = "rgba(7,17,31,0.9)";
        ctx.fill();
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = s.color;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "lighter";
      for (const b of bullets) {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const p of sparks) {
        ctx.globalAlpha = 0.5 * (p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      ctx.restore();

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onVis = () => {
      running = document.visibilityState === "visible";
      if (running) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
