/**
 * HealthBar — design.md §7.5 / game.md §4
 * 100HP，宽 220px；>60 青绿 / 30–60 琥珀 / <30 红闪。
 * HP 减少：主条 120ms 收缩 + 白色残影 300ms 内追上。
 */
import { useEffect, useRef, useState } from "react";
import { MAX_HP } from "@contracts/game";
import { cn } from "@/lib/utils";

export default function HealthBar({
  hp,
  maxHp = MAX_HP,
  highContrast,
  reducedMotion,
}: {
  hp: number;
  /** 生命上限（升级 hp 选项后 > MAX_HP，由调用方按 upgMaxHp 计算传入） */
  maxHp?: number;
  highContrast: boolean;
  reducedMotion: boolean;
}) {
  const [ghost, setGhost] = useState(hp);
  const prev = useRef(hp);

  useEffect(() => {
    const decreased = hp < prev.current;
    prev.current = hp;
    // 掉血时残影延迟 120ms 后追上；回血立即对齐（异步回调避免级联渲染）
    const t = window.setTimeout(() => setGhost(hp), decreased ? 120 : 0);
    return () => window.clearTimeout(t);
  }, [hp]);

  const frac = Math.max(0, Math.min(1, hp / maxHp));
  const low = frac < 0.3 && hp > 0;
  const mid = frac >= 0.3 && frac <= 0.6;
  const barColor = low ? "#EF4444" : mid ? "#FBBF24" : "#22D3EE";

  return (
    <div
      className={cn(
        "relative",
        low && !reducedMotion && "ns-anim-loop",
      )}
      role="img"
      aria-label={`HP ${hp} / ${maxHp}`}
    >
      <div
        className={cn(
          "relative h-[10px] w-[220px] overflow-hidden border bg-void-800/80",
          highContrast ? "border-white/70" : "border-neon-cyan/30",
          low && "border-neon-red/70",
        )}
        style={
          low && !reducedMotion
            ? { animation: "ns-hp-flash 900ms ease-in-out infinite" }
            : undefined
        }
      >
        {/* 白色残影 */}
        <div
          className="absolute inset-y-0 left-0 bg-white/50"
          style={{
            width: `${Math.min(1, ghost / maxHp) * 100}%`,
            transition: "width 300ms ease-out",
          }}
        />
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${frac * 100}%`,
            background: barColor,
            boxShadow: `0 0 10px ${barColor}`,
            transition: "width 120ms ease-out",
          }}
        />
        {/* 高对比纹理：条纹叠加，不只依赖颜色 */}
        {highContrast && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent 0 4px, rgba(0,0,0,.6) 4px 6px)",
            }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] tracking-[0.12em]">
        <span className="text-slate-400">HP</span>
        <span
          className="tabular-nums"
          style={{ color: barColor }}
        >
          {String(Math.max(0, Math.round(hp))).padStart(3, "0")} / {Math.round(maxHp)}
        </span>
      </div>
    </div>
  );
}
