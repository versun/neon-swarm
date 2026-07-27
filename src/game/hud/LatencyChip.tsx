/**
 * LatencyChip — design.md §7.5：RTT / tick / 实体数，颜色随延迟变化。
 */
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export default function LatencyChip({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const rtt = useHud(engine.store, (s) => s.rtt);
  const tick = useHud(engine.store, (s) => s.tick);
  const entities = useHud(engine.store, (s) => s.entityCount);
  const phase = useHud(engine.store, (s) => s.phase);

  const online = phase === "live" || phase === "respawning";
  const color = !online
    ? "text-slate-500"
    : rtt < 80
      ? "text-neon-lime"
      : rtt < 160
        ? "text-neon-amber"
        : "text-neon-red";
  const dot = !online
    ? "#64748B"
    : rtt < 80
      ? "#A3E635"
      : rtt < 160
        ? "#FBBF24"
        : "#EF4444";

  return (
    <div
      className={cn(
        "glass-panel clip-corner-sm pointer-events-auto flex items-center gap-2 px-2.5 py-1",
        "font-mono text-[10px] tracking-[0.14em]",
        color,
      )}
      role="status"
      aria-label={t("aria.latency", { rtt: online ? rtt : "--", n: entities })}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
        aria-hidden="true"
      />
      <span className="tabular-nums">{online ? `${rtt}MS` : "OFFLINE"}</span>
      <span className="text-slate-500">TICK {tick}</span>
      <span className="text-slate-500">ENT {entities}</span>
    </div>
  );
}
