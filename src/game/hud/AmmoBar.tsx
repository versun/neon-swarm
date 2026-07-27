/**
 * AmmoBar — design.md §7.5 / game.md §4
 * MAX_AMMO 发整数 + 恢复进度底轨（基础 +1/s，可经升级选项提速）；<15 发 LOW AMMO 脉冲；0 发 RECHARGING。
 * 点击切换 整数 / 百分比 显示。
 */
import { useState } from "react";
import { AMMO_REGEN_AMOUNT, MAX_AMMO } from "@contracts/game";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function AmmoBar({
  ammo,
  regen,
  highContrast,
  reducedMotion,
}: {
  ammo: number;
  regen: number; // 0–1，距下一次弹药恢复的进度
  highContrast: boolean;
  reducedMotion: boolean;
}) {
  const { t } = useI18n();
  const [percent, setPercent] = useState(false);
  const low = ammo < 15;
  const empty = ammo <= 0;

  return (
    <button
      type="button"
      onClick={() => setPercent((p) => !p)}
      className="block w-full text-left"
      title={t("aria.ammoToggle")}
      aria-label={
        t("aria.ammo", { a: Math.round(ammo), max: MAX_AMMO }) +
        (low ? t("aria.lowAmmo") : "")
      }
    >
      <div
        className={cn(
          "relative h-[6px] w-[220px] overflow-hidden border bg-void-800/80",
          highContrast ? "border-white/70" : "border-neon-cyan/30",
        )}
      >
        {/* 恢复进度底轨（AMMO_REGEN_MS 周期推进） */}
        <div
          className="absolute inset-y-0 left-0 bg-neon-cyan/15"
          style={{ width: `${Math.min(1, (ammo + AMMO_REGEN_AMOUNT * regen) / MAX_AMMO) * 100}%` }}
        />
        <div
          className={cn("absolute inset-y-0 left-0", empty ? "bg-slate-500" : "bg-neon-cyan")}
          style={{
            width: `${(ammo / MAX_AMMO) * 100}%`,
            boxShadow: empty ? "none" : "0 0 8px rgba(34,211,238,.6)",
            transition: "width 160ms ease-out",
          }}
        />
        {highContrast && (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, transparent 0 3px, rgba(0,0,0,.6) 3px 5px)",
            }}
          />
        )}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] tracking-[0.12em]">
        <span
          className={cn(
            "inline-flex items-center gap-1.5",
            low ? "text-neon-amber" : "text-slate-400",
          )}
        >
          AMMO
          {low && (
            <span
              className={cn("inline-block", !reducedMotion && "ns-anim-loop")}
              style={
                reducedMotion
                  ? undefined
                  : { animation: "ns-ammo-pulse 1.2s ease-in-out infinite" }
              }
            >
              {empty ? "· RECHARGING" : "· LOW AMMO"}
            </span>
          )}
        </span>
        <span className="tabular-nums text-neon-cyan-light">
          {percent
            ? `${Math.round((ammo / MAX_AMMO) * 100)}%`
            : `${String(Math.max(0, Math.round(ammo))).padStart(3, "0")} / ${MAX_AMMO}`}
        </span>
      </div>
    </button>
  );
}
