/**
 * MiniRadar — design.md §7.5 / game.md §9
 * 左下 160×160（移动端 120×120）：本机朝向箭头、附近敌机、世界边界、扫描扇形。
 * 点击切换 NEAR(1200px) / FAR(4000px) 范围。reduced-motion 下扫描静止。
 */
import { useEffect, useRef, useState } from "react";
import { COLOR_POOL } from "@contracts/game";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const RANGES = [1200, 4000] as const;

export default function MiniRadar({
  engine,
  isMobile,
}: {
  engine: GameEngine;
  isMobile: boolean;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rangeIdx, setRangeIdx] = useState(0);
  const reducedMotion = useHud(engine.store, (s) => s.reducedMotion);
  const size = isMobile ? 120 : 160;
  const range = RANGES[rangeIdx];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const S = size;
      const C = S / 2;
      const radius = C - 4;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);

      // 底
      ctx.beginPath();
      ctx.arc(C, C, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(7,17,31,0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(103,232,249,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // 网格环
      ctx.strokeStyle = "rgba(34,211,238,0.12)";
      ctx.beginPath();
      ctx.arc(C, C, radius * 0.5, 0, Math.PI * 2);
      ctx.moveTo(C - radius, C);
      ctx.lineTo(C + radius, C);
      ctx.moveTo(C, C - radius);
      ctx.lineTo(C, C + radius);
      ctx.stroke();

      // 世界边界（按范围缩放）
      const world = engine.net.world;
      const self = engine.getSelfPose();
      const scale = radius / range;
      ctx.strokeStyle = "rgba(34,211,238,0.4)";
      const bx = C + (world[0] - self.x) * scale;
      const by = C + (world[1] - self.y) * scale;
      const bw = (world[2] - world[0]) * scale;
      const bh = (world[3] - world[1]) * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeRect(bx, by, bw, bh);

      // 扫描扇形 2.8s/圈，opacity 25%
      if (!reducedMotion) {
        const sweep = ((now / 2800) % 1) * Math.PI * 2;
        const grad = ctx.createConicGradient
          ? ctx.createConicGradient(sweep, C, C)
          : null;
        if (grad) {
          grad.addColorStop(0, "rgba(34,211,238,0.25)");
          grad.addColorStop(0.12, "rgba(34,211,238,0)");
          grad.addColorStop(1, "rgba(34,211,238,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(C, C, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 附近敌机
      for (const ship of engine.getRadarShips(range)) {
        if (ship.dead) continue;
        const dx = ship.x * scale;
        const dy = ship.y * scale;
        if (Math.hypot(dx, dy) > radius - 3) continue;
        ctx.beginPath();
        ctx.arc(C + dx, C + dy, ship.isBot ? 2 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = ship.color;
        ctx.fill();
      }
      ctx.restore();

      // 本机朝向箭头（实时旋转，无过渡）
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(self.angle);
      const me = engine.net.roster.get(engine.net.yourId);
      const selfColor = me
        ? COLOR_POOL[me.colorIdx % COLOR_POOL.length]
        : "#22D3EE";
      ctx.fillStyle = "#F8FAFC";
      ctx.strokeStyle = selfColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, 4);
      ctx.lineTo(-4, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [engine, size, range, reducedMotion]);

  return (
    <button
      type="button"
      onClick={() => setRangeIdx((i) => (i + 1) % RANGES.length)}
      className={cn(
        "glass-panel clip-corner-sm pointer-events-auto relative block p-1",
        "transition-shadow hover:shadow-glow-cyan",
      )}
      title={t("aria.radarToggle")}
      aria-label={t("aria.radar", { r: range })}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />
      <span className="absolute left-2 top-1.5 font-label text-[9px] font-semibold tracking-[0.18em] text-neon-cyan-light/80">
        LOCAL SCAN
      </span>
      <span className="absolute bottom-1.5 right-2 font-mono text-[9px] tracking-[0.14em] text-slate-500">
        RANGE {range}PX
      </span>
    </button>
  );
}
