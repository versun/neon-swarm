/**
 * Scoreboard — 永久积分榜
 * 按住 Tab 或点击 SCORE 打开。数据源为服务器持久化榜单：
 * 昵称唯一、击杀瞬间实时刷新最高击杀数、Bot 不上榜。
 * 游戏继续（LIVE）。
 */
import { useEffect, useState } from "react";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

type Row = ReturnType<GameEngine["getLeaderboardRows"]>[number];

export default function Scoreboard({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const open = useHud(engine.store, (s) => s.scoreboardOpen);
  const rosterVersion = useHud(engine.store, (s) => s.rosterVersion);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => setRows(engine.getLeaderboardRows());
    refresh();
    const id = window.setInterval(refresh, 500);
    return () => window.clearInterval(id);
  }, [open, engine, rosterVersion]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,18,0.55)" }}
      role="dialog"
      aria-label={t("aria.scoreboardShort")}
      // 点击面板外部关闭计分板，直接回到战斗
      onClick={() => engine.setScoreboardOpen(false)}
    >
      <div
        className="ns-anim glass-panel clip-corner w-full max-w-[560px] p-5"
        style={{ animation: "ns-score-in 180ms ease-out", maxHeight: "70dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-sm font-bold tracking-[0.24em] text-white">
            {t("sb.title")}
          </h2>
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] text-neon-red">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-red" />
            LIVE
          </span>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(70dvh - 76px)" }}>
          <table className="w-full text-left font-mono text-[12px]">
            <thead>
              <tr className="border-b border-neon-cyan/20 text-[10px] tracking-[0.2em] text-slate-500">
                <th className="py-2 pr-2 font-medium">#</th>
                <th className="py-2 pr-2 font-medium">{t("sb.pilot")}</th>
                <th className="py-2 pr-2 text-right font-medium">{t("sb.best")}</th>
                <th className="py-2 text-right font-medium">{t("sb.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    {t("sb.empty")}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr
                  key={r.name}
                  className={cn(
                    "ns-anim border-b border-white/5",
                    r.isSelf && "bg-neon-cyan/10",
                  )}
                  style={{
                    animation:
                      i < 12 ? `ns-row-in 180ms ease-out ${i * 40}ms both` : undefined,
                  }}
                >
                  <td className="py-1.5 pr-2 text-slate-500">{i + 1}</td>
                  <td
                    className={cn(
                      "py-1.5 pr-2",
                      r.isSelf ? "text-neon-cyan-light" : "text-slate-200",
                    )}
                  >
                    {r.name}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-white">
                    {r.best}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.online ? (
                      <span className="inline-flex items-center gap-1.5 text-[10px] tracking-[0.14em] text-neon-lime">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-neon-lime"
                          style={{ boxShadow: "0 0 6px #A3E635" }}
                          aria-hidden="true"
                        />
                        {t("sb.online")}
                      </span>
                    ) : (
                      <span className="text-[10px] tracking-[0.14em] text-slate-600">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
