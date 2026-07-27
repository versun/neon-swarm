/**
 * StatusAnnouncer — design.md §14
 * 屏幕阅读器实时状态摘要（HP / 弹药 / 重生倒计时），1 秒节流避免朗读轰炸。
 */
import { useEffect, useState } from "react";
import type { GameEngine } from "../engine";
import { useI18n } from "@/i18n";

export default function StatusAnnouncer({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = engine.store.getState();
      if (s.phase === "respawning") {
        setText(t("ann.respawn", { s: Math.ceil(s.respawnLeft) }));
      } else if (s.phase === "live") {
        setText(
          t("ann.live", {
            hp: Math.max(0, Math.round(s.hp)),
            ammo: Math.max(0, Math.round(s.ammo)),
          }) + (s.ammo < 15 ? t("ann.lowAmmo") : ""),
        );
      } else if (s.phase === "join") {
        setText(t("ann.join"));
      } else if (s.phase === "reconnecting") {
        setText(t("ann.reconnecting"));
      } else if (s.phase === "failed") {
        setText(t("ann.failed"));
      } else {
        setText(t("ann.connecting"));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [engine, t]);

  return (
    <span className="sr-only" role="status" aria-live="polite">
      {text}
    </span>
  );
}
