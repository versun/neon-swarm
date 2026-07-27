/**
 * RespawnOverlay — game.md §6
 * 中心 3 秒倒计时数字 + 环形进度；不遮挡全屏，玩家仍可观察战场。
 * 爆炸后延迟 300ms 出现；最后 500ms 中心青色能量环。
 */
import { RESPAWN_MS } from "@contracts/game";
import { useI18n } from "@/i18n";

const R = 44;
const C = 2 * Math.PI * R;

export default function RespawnOverlay({
  respawnLeft,
  killerName,
}: {
  respawnLeft: number;
  killerName: string;
}) {
  const { t } = useI18n();
  const seconds = Math.max(0, Math.ceil(respawnLeft));
  const frac = Math.max(0, Math.min(1, respawnLeft / (RESPAWN_MS / 1000)));
  const finalBurst = respawnLeft > 0 && respawnLeft <= 0.5;

  return (
    <div
      className="ns-anim pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      style={{
        animation: "ns-deploy-in 220ms ease-out 300ms both",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background: "rgba(3,7,18,0.35)",
      }}
      role="alert"
      aria-label={t("aria.respawn", { s: seconds })}
    >
      <div className="glass-panel clip-corner relative flex flex-col items-center px-10 py-8">
        {/* 重生最后 500ms 能量环 */}
        {finalBurst && (
          <div
            className="ns-anim pointer-events-none absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <div
              className="h-40 w-40 rounded-full border-2 border-neon-cyan"
              style={{ animation: "ns-energy-ring 500ms ease-out forwards" }}
            />
          </div>
        )}
        <p className="font-label text-[11px] font-semibold tracking-[0.32em] text-neon-red">
          FIGHTER DESTROYED
        </p>
        {/* 屏幕正中央大号重生倒计时 */}
        <div className="relative mt-4 h-[200px] w-[200px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(103,232,249,.15)" strokeWidth="5" />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="#EF4444"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - frac)}
              style={{ filter: "drop-shadow(0 0 8px rgba(239,68,68,.7))" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-label text-[11px] font-semibold tracking-[0.28em] text-slate-400">
              RESPAWN IN
            </span>
            <span
              key={seconds}
              className="ns-anim font-display text-7xl font-bold tabular-nums text-white"
              style={{
                animation: "ns-num-flip 120ms ease-out",
                textShadow: "0 0 28px rgba(239,68,68,.55)",
              }}
            >
              {String(seconds).padStart(2, "0")}
            </span>
          </div>
        </div>
        {killerName && (
          <p className="mt-3 font-mono text-[11px] tracking-[0.16em] text-slate-400">
            KILLER: <span className="text-neon-magenta">{killerName}</span>
          </p>
        )}
        <p className="mt-1.5 text-xs text-slate-500">{t("respawn.tip")}</p>
      </div>
    </div>
  );
}
