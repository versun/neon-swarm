/**
 * KillFeed — game.md §7
 * 右上角 ≤5 条，每条 4 秒淡出（最后 500ms）；hover 暂停淡出；可折叠。
 * kill 事件左侧红灯闪烁 2 次；join 使用 lime 状态灯。
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Skull } from "lucide-react";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import type { KillFeedItem as FeedItem } from "../store";
import { useI18n } from "@/i18n";

const LIFETIME_MS = 4000;

function FeedRow({
  item,
  onExpire,
  onHighlight,
}: {
  item: FeedItem;
  onExpire: (key: number) => void;
  onHighlight: (id: number) => void;
}) {
  const { t } = useI18n();
  const destroyedLabel = t("aria.destroyed");
  const [fading, setFading] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef(0);
  const fadeTimer = useRef(0);
  const remaining = useRef(LIFETIME_MS);
  const started = useRef(performance.now());

  useEffect(() => {
    const schedule = (ms: number) => {
      started.current = performance.now();
      remaining.current = ms;
      fadeTimer.current = window.setTimeout(
        () => setFading(true),
        Math.max(0, ms - 500),
      );
      timer.current = window.setTimeout(() => onExpire(item.key), ms);
    };
    schedule(LIFETIME_MS);
    return () => {
      window.clearTimeout(timer.current);
      window.clearTimeout(fadeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key]);

  const pause = () => {
    setHover(true);
    window.clearTimeout(timer.current);
    window.clearTimeout(fadeTimer.current);
    remaining.current = Math.max(
      0,
      remaining.current - (performance.now() - started.current),
    );
    setFading(false);
  };
  const resume = () => {
    setHover(false);
    started.current = performance.now();
    fadeTimer.current = window.setTimeout(
      () => setFading(true),
      Math.max(0, remaining.current - 500),
    );
    timer.current = window.setTimeout(() => onExpire(item.key), remaining.current);
  };

  const isKill = item.kind === "kill";

  return (
    <div
      className="ns-anim glass-panel clip-corner-sm flex items-center gap-2 px-3 py-1.5"
      style={{
        animation: fading
          ? "ns-feed-out 500ms ease-in forwards"
          : "ns-feed-in 180ms ease-out",
        animationPlayState: hover ? "paused" : "running",
      }}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {/* 状态灯 */}
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: isKill ? "#EF4444" : item.kind === "join" ? "#A3E635" : "#64748B",
          boxShadow: isKill
            ? "0 0 6px rgba(239,68,68,.8)"
            : item.kind === "join"
              ? "0 0 6px rgba(163,230,53,.7)"
              : "none",
          animation: isKill ? "ns-kill-blink 120ms linear 4" : undefined,
        }}
        aria-hidden="true"
      />
      {isKill ? (
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.06em] text-slate-300">
          <button
            type="button"
            className="font-semibold hover:underline"
            style={{ color: item.actorColor }}
            onClick={() => onHighlight(item.actorId)}
          >
            {item.actorName}
          </button>
          <Skull className="mx-1 inline h-3 w-3 text-neon-red" aria-label={destroyedLabel} />
          <button
            type="button"
            className="font-semibold hover:underline"
            style={{ color: item.victimColor }}
            onClick={() => item.victimId !== undefined && onHighlight(item.victimId)}
          >
            {item.victimName}
          </button>
        </p>
      ) : (
        <p className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.06em] text-slate-300">
          {item.text}
        </p>
      )}
    </div>
  );
}

export default function KillFeed({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const feed = useHud(engine.store, (s) => s.killFeed);
  const collapsed = useHud(engine.store, (s) => s.killFeedCollapsed);

  const highlight = (id: number) => {
    const pos = engine.getShipLastPos(id);
    if (pos) engine.renderer.spawnRespawnRing(pos.x, pos.y, "#F8FAFC");
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-[88px] z-20 w-[320px] max-w-[calc(100vw-32px)]">
      <div className="mb-1.5 flex items-center justify-end">
        <button
          type="button"
          onClick={() => engine.setKillFeedCollapsed(!collapsed)}
          className="glass-panel clip-corner-sm flex items-center gap-1 px-2 py-1 font-label text-[10px] font-semibold tracking-[0.18em] text-slate-400 transition-colors hover:text-neon-cyan-light"
          aria-expanded={!collapsed}
          aria-label={collapsed ? t("aria.killfeedExpand") : t("aria.killfeedCollapse")}
        >
          FEED
          {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-1.5" role="log" aria-label={t("aria.killfeed")}>
          {/* store.pushFeed 已按 MAX_KILL_FEED 裁剪，直接渲染 */}
          {feed.map((item) => (
            <FeedRow
              key={item.key}
              item={item}
              onExpire={(k) => engine.store.removeFeed(k)}
              onHighlight={highlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}
