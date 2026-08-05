/**
 * UpgradeOverlay — 战机等级升级选择
 * 触发：累计命中达到阈值（服务端 offer 事件）。固定 7 个选项：
 * 弹速+5% / 移速+5% / 生命+5% / 双枪（限选一次）/ 子弹恢复+1/s / 生命恢复+1/s / 锁定时间+1s。
 * 10 秒倒计时，超时服务端随机代选；选择期间战机隐身，战绩保留；
 * 选择后恢复全部生命与弹药（服务端广播 upgrade 事件生效）。
 */
import { useEffect, useState } from "react";
import { Zap, Gauge, Heart, Crosshair, RefreshCw, HeartPulse, Timer } from "lucide-react";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { unpackUpg, UPGRADE_CHOICE_MS } from "@contracts/game";

const OPTIONS = [
  { id: 0, key: "up.opt.bullet" as const, icon: Zap, tone: "text-neon-cyan-light border-neon-cyan/40 hover:border-neon-cyan hover:shadow-glow-cyan" },
  { id: 1, key: "up.opt.move" as const, icon: Gauge, tone: "text-neon-lime border-neon-lime/40 hover:border-neon-lime" },
  { id: 2, key: "up.opt.hp" as const, icon: Heart, tone: "text-neon-red border-neon-red/40 hover:border-neon-red" },
  { id: 3, key: "up.opt.dual" as const, icon: Crosshair, tone: "text-neon-amber border-neon-amber/40 hover:border-neon-amber" },
  { id: 4, key: "up.opt.ammoRegen" as const, icon: RefreshCw, tone: "text-neon-magenta border-neon-magenta/40 hover:border-neon-magenta" },
  { id: 5, key: "up.opt.hpRegen" as const, icon: HeartPulse, tone: "text-neon-red border-neon-red/40 hover:border-neon-red" },
  { id: 6, key: "up.opt.lock" as const, icon: Timer, tone: "text-neon-violet border-neon-violet/40 hover:border-neon-violet" },
];

export default function UpgradeOverlay({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const offer = useHud(engine.store, (s) => s.upgradeOffer);
  const selfUpg = useHud(engine.store, (s) => s.selfUpg);
  const [now, setNow] = useState(() => performance.now());

  // 倒计时驱动（10Hz 足够顺滑）
  useEffect(() => {
    if (!offer) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [offer]);

  // 数字键 1–7 快捷选择
  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= 7) engine.chooseUpgrade(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer, engine]);

  if (!offer) return null;

  const leftMs = Math.max(0, offer.deadline - now);
  if (leftMs <= 0) return null; // 超时等服务端代选（upgrade 事件关闭面板）
  const frac = leftMs / UPGRADE_CHOICE_MS;
  const seconds = Math.ceil(leftMs / 1000);
  const dualTaken = unpackUpg(selfUpg).dual;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,18,0.45)", backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-label={t("up.title")}
    >
      <div
        className="ns-anim glass-panel clip-corner w-full max-w-[480px] p-5"
        style={{ animation: "ns-menu-in 180ms ease-out" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold tracking-[0.24em] text-neon-amber">
            {t("up.title")}
          </h2>
          <span className="font-display text-2xl font-bold tabular-nums text-white">
            {seconds}
          </span>
        </div>
        {/* 倒计时条 */}
        <div className="mt-2 h-1 w-full overflow-hidden bg-void-800">
          <div
            className="h-full bg-neon-amber transition-[width] duration-100 ease-linear"
            style={{ width: `${frac * 100}%`, boxShadow: "0 0 8px rgba(250,204,21,.7)" }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("up.sub")}</p>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          {OPTIONS.map((o) => {
            const taken = o.id === 3 && dualTaken;
            const Icon = o.icon;
            return (
              <button
                key={o.id}
                type="button"
                disabled={taken}
                onClick={() => engine.chooseUpgrade(o.id)}
                className={cn(
                  "glass-panel clip-corner-sm flex flex-col items-center gap-1.5 px-3 py-4 transition-all duration-150",
                  taken
                    ? "cursor-not-allowed opacity-35"
                    : cn("hover:-translate-y-0.5", o.tone),
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-label text-[12px] font-bold tracking-[0.08em] text-white">
                  {t(o.key)}
                </span>
                <span className="font-mono text-[9px] tracking-[0.14em] text-slate-500">
                  {taken
                    ? t("up.taken")
                    : o.id === 3
                      ? t("up.opt.dual.desc")
                      : t("up.key", { k: o.id + 1 })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
