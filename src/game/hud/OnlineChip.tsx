/**
 * OnlineChip — 右上角实际在线人数：名册中 isBot=0 的真人玩家数，
 * 附带 Bot 数（名册在 net.ts 维护，经 store rosterVersion 同步）。
 * 样式对齐 LatencyChip：等宽数字 + 状态灯。
 */
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function OnlineChip({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  // rosterVersion 变化即重算（join/leave 事件驱动）
  useHud(engine.store, (s) => s.rosterVersion);
  const phase = useHud(engine.store, (s) => s.phase);

  let pilots = 0;
  let bots = 0;
  for (const p of engine.net.roster.values()) {
    if (p.isBot) bots += 1;
    else pilots += 1;
  }

  const online = phase === "live" || phase === "respawning";
  const dot = online ? "#22D3EE" : "#64748B";

  return (
    <div
      className={cn(
        "glass-panel clip-corner-sm pointer-events-auto flex items-center gap-2 px-2.5 py-1",
        "font-mono text-[10px] tracking-[0.14em]",
        online ? "text-neon-cyan-light" : "text-slate-500",
      )}
      role="status"
      aria-label={t("aria.online", { p: online ? pilots : "--", b: bots })}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
        aria-hidden="true"
      />
      <span className="tabular-nums">{t("game.online")} {online ? pilots : "--"}</span>
      {bots > 0 && <span className="tabular-nums text-slate-500">+{bots} BOT</span>}
    </div>
  );
}
