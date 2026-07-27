/**
 * Overlays — 加入 / 连接 / 重连 / 失败 / 世界提示 / TARGET DOWN / SHIELD ONLINE / 音频提示
 * game.md §1、§6、§10、§12
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { TriangleAlert, Volume2, VolumeX, Zap } from "lucide-react";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { MAX_NAME_LEN } from "@contracts/game";
import { NAME_STORAGE_KEY } from "@/components/home/HeroSection";

/** CONNECTING — SYNCING ORBITAL FEED… */
export function ConnectingOverlay() {
  const { t } = useI18n();
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void-950">
      <img
        src="/logo.svg"
        alt="NEON SWARM"
        className="ns-anim h-16 w-16"
        style={{ animation: "ns-deploy-in 300ms ease-out" }}
      />
      <p
        className="ns-anim mt-6 font-label text-xs font-semibold tracking-[0.32em] text-neon-cyan-light"
        style={{ animation: "ns-toast-in 260ms ease-out 120ms both" }}
      >
        SYNCING ORBITAL FEED…
      </p>
      <p
        className="ns-anim mt-2 text-sm text-slate-400"
        style={{ animation: "ns-toast-in 260ms ease-out 160ms both" }}
      >
        {t("game.connecting")}
      </p>
    </div>
  );
}

/** JOIN — 昵称输入 + 「加入战斗」，点击后才建立 WebSocket 并发送 join */
export function JoinOverlay({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  // 昵称优先级：?name= query > localStorage > 空
  const [name, setName] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("name");
    if (q) return q.slice(0, MAX_NAME_LEN);
    return localStorage.getItem(NAME_STORAGE_KEY)?.slice(0, MAX_NAME_LEN) ?? "";
  });

  const join = () => {
    const trimmed = name.trim().slice(0, MAX_NAME_LEN);
    if (trimmed) localStorage.setItem(NAME_STORAGE_KEY, trimmed);
    else localStorage.removeItem(NAME_STORAGE_KEY);
    engine.unlockAudio(); // 点击即用户手势，顺势解锁音频
    engine.join(trimmed || undefined);
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
    >
      <div
        className="ns-anim glass-panel clip-corner flex w-[380px] max-w-[calc(100vw-40px)] flex-col items-center p-6"
        style={{ animation: "ns-deploy-in 240ms ease-out" }}
      >
        <img src="/logo.svg" alt="" className="h-12 w-12" aria-hidden="true" />
        <p className="mt-4 font-label text-[11px] font-semibold tracking-[0.32em] text-neon-cyan-light">
          JOIN THE SWARM
        </p>
        <p className="mt-2 text-center text-sm text-slate-400">
          {t("game.joinTip")}
        </p>
        <form
          className="mt-5 flex w-full flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME_LEN}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("game.namePlaceholder")}
            aria-label={t("aria.name")}
            autoComplete="off"
            spellCheck={false}
            className="clip-corner-sm w-full border border-neon-cyan/25 bg-void-900/80 px-4 py-3 text-center font-mono text-sm tracking-[0.1em] text-white placeholder:text-slate-500 focus:border-neon-cyan focus:shadow-glow-cyan focus:outline-none"
          />
          <button
            type="submit"
            className="btn-neon-primary clip-corner flex items-center justify-center gap-2 px-6 py-3 font-label text-sm font-bold tracking-[0.12em]"
          >
            <Zap className="h-4 w-4" />
            {t("game.join")}
          </button>
        </form>
        <p className="mt-3 font-mono text-[10px] tracking-[0.18em] text-slate-500">
          {t("game.stats")}
        </p>
      </div>
    </div>
  );
}

/** RECONNECTING — 顶部条；>5s 全屏玻璃遮罩。FAILED — 重连/返回首页 */
export function ReconnectOverlay({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const phase = useHud(engine.store, (s) => s.phase);

  if (phase === "failed") {
    return (
      <div
        className="absolute inset-0 z-40 flex items-center justify-center"
        style={{ background: "rgba(3,7,18,0.72)", backdropFilter: "blur(10px)" }}
        role="alert"
      >
        <div className="ns-anim glass-panel clip-corner flex flex-col items-center p-8" style={{ animation: "ns-deploy-in 240ms ease-out" }}>
          <TriangleAlert
            className="ns-anim h-8 w-8 text-neon-red"
            style={{ animation: "ns-err-shake 120ms ease-in-out 2" }}
          />
          <p className="mt-4 font-display text-lg font-bold tracking-[0.18em] text-white">
            CONNECTION FAILED
          </p>
          <p className="mt-2 text-sm text-slate-400">{t("game.failedTip")}</p>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => engine.reconnectNow()}
              className="btn-neon-primary clip-corner px-5 py-2.5 font-label text-sm font-bold tracking-[0.12em]"
            >
              {t("game.reconnect")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-neon-secondary clip-corner px-5 py-2.5 font-label text-sm font-bold tracking-[0.12em]"
            >
              {t("game.home")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase !== "reconnecting") return null;

  // 每次进入 reconnecting 重新挂载，内部用计时器升级全屏遮罩
  return <ReconnectingView />;
}

function ReconnectingView() {
  const { t } = useI18n();
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setLongWait(true), 5000);
    return () => window.clearTimeout(id);
  }, []);

  if (!longWait) {
    return (
      <div
        className="ns-anim glass-panel clip-corner-sm absolute left-1/2 top-4 z-40 flex -translate-x-1/2 items-center gap-2.5 px-4 py-2"
        style={{ animation: "ns-toast-in 180ms ease-out" }}
        role="alert"
      >
        <span
          className="ns-anim-loop h-2 w-2 rounded-full bg-neon-amber"
          style={{ animation: "ns-recon-blink 1s ease-in-out infinite" }}
        />
        <span className="font-label text-xs font-semibold tracking-[0.2em] text-neon-amber">
          LINK LOST · RECONNECTING…
        </span>
        <span className="text-xs text-slate-400">{t("game.resync")}</span>
      </div>
    );
  }

  return (
    <div
      className="ns-anim absolute inset-0 z-40 flex items-center justify-center"
      style={{
        background: "rgba(3,7,18,0.72)",
        backdropFilter: "blur(10px)",
        animation: "ns-menu-in 240ms ease-out",
      }}
      role="alert"
    >
      <div className="glass-panel clip-corner flex flex-col items-center p-8">
        <span
          className="ns-anim-loop h-2.5 w-2.5 rounded-full bg-neon-amber"
          style={{ animation: "ns-recon-blink 1s ease-in-out infinite" }}
        />
        <p className="mt-4 font-display text-lg font-bold tracking-[0.18em] text-white">
          LINK LOST · RECONNECTING…
        </p>
        <p className="mt-2 text-sm text-slate-400">{t("game.resync")}</p>
      </div>
    </div>
  );
}

/** 世界事件提示（WORLD EXPANDED…）顶部中央，2.4s 停留后淡出 */
export function WorldToast({ engine }: { engine: GameEngine }) {
  const toast = useHud(engine.store, (s) => s.worldToast);
  if (!toast) return null;
  return (
    <div
      key={toast}
      className="ns-anim glass-panel clip-corner-sm pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 px-4 py-1.5"
      style={{ animation: "ns-toast-in 180ms ease-out" }}
      role="status"
    >
      <span className="font-mono text-[11px] tracking-[0.2em] text-neon-cyan-light">
        {toast}
      </span>
    </div>
  );
}

/** 限时提示：挂载即显示，duration 后自动隐藏（key 变化即重新挂载） */
function TimedNotice({
  duration,
  animation,
  children,
}: {
  duration: number;
  animation: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setShow(false), duration);
    return () => window.clearTimeout(id);
  }, [duration]);
  if (!show) return null;
  return (
    <div
      className="ns-anim pointer-events-none absolute left-1/2 top-[30%] z-30 -translate-x-1/2"
      style={{ animation }}
      role="status"
    >
      {children}
    </div>
  );
}

/** TARGET DOWN / SHIELD ONLINE 中央战斗反馈 */
export function CombatNotices({ engine }: { engine: GameEngine }) {
  const targetDownKey = useHud(engine.store, (s) => s.targetDownKey);
  const shieldKey = useHud(engine.store, (s) => s.shieldKey);

  return (
    <>
      {targetDownKey > 0 && (
        <TimedNotice
          key={`td-${targetDownKey}`}
          duration={920}
          animation="ns-target-down 920ms ease-out forwards"
        >
          <span className="font-display text-xl font-bold tracking-[0.3em] text-neon-cyan-light" style={{ textShadow: "0 0 18px rgba(34,211,238,.7)" }}>
            TARGET DOWN
          </span>
        </TimedNotice>
      )}
      {shieldKey > 0 && (
        <TimedNotice
          key={`sh-${shieldKey}`}
          duration={800}
          animation="ns-shield 800ms ease-out forwards"
        >
          <span className="font-display text-lg font-bold tracking-[0.3em] text-neon-lime" style={{ textShadow: "0 0 18px rgba(163,230,53,.7)" }}>
            SHIELD ONLINE
          </span>
        </TimedNotice>
      )}
    </>
  );
}

/** 音频提示条：AUDIO LOCKED · CLICK TO ENABLE，8 秒后自动淡出 */
export function AudioHint({ engine }: { engine: GameEngine }) {
  const unlocked = useHud(engine.store, (s) => s.audioUnlocked);
  const supported = useHud(engine.store, (s) => s.audioSupported);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (unlocked) return;
    const id = window.setTimeout(() => setDismissed(true), 8000);
    return () => window.clearTimeout(id);
  }, [unlocked]);

  if (!supported) {
    return (
      <div className="glass-panel clip-corner-sm pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 px-3 py-1.5">
        <span className="font-mono text-[10px] tracking-[0.18em] text-slate-500">
          AUDIO UNSUPPORTED
        </span>
      </div>
    );
  }
  if (unlocked || dismissed) return null;

  return (
    <button
      type="button"
      onClick={() => engine.unlockAudio()}
      className="ns-anim glass-panel clip-corner-sm absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-4 py-2 transition-shadow hover:shadow-glow-cyan"
      style={{ animation: "ns-toast-in 220ms ease-out" }}
    >
      <Volume2 className="h-3.5 w-3.5 text-neon-amber" />
      <span className="font-label text-[11px] font-semibold tracking-[0.2em] text-neon-amber">
        AUDIO LOCKED · CLICK TO ENABLE
      </span>
    </button>
  );
}

/** 右上角音量按钮 + 状态（AUDIO ONLINE / MUTED） */
export function AudioButton({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const unlocked = useHud(engine.store, (s) => s.audioUnlocked);
  const muted = useHud(engine.store, (s) => s.muted);
  const supported = useHud(engine.store, (s) => s.audioSupported);
  const [ping, setPing] = useState(false);

  const onClick = async () => {
    if (!unlocked) {
      engine.unlockAudio();
      setPing(true);
      window.setTimeout(() => setPing(false), 400);
    } else {
      engine.toggleMute();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!supported}
      aria-pressed={!muted && unlocked}
      aria-label={muted ? t("aria.unmute") : t("aria.mute")}
      title={!supported ? "AUDIO UNSUPPORTED" : muted ? t("audio.mutedTitle") : t("audio.onlineTitle")}
      className={cn(
        "glass-panel clip-corner-sm pointer-events-auto relative flex h-11 w-11 items-center justify-center transition-colors",
        !supported
          ? "text-slate-600"
          : muted || !unlocked
            ? "text-slate-400 hover:text-neon-cyan-light"
            : "text-neon-cyan-light",
      )}
    >
      {muted || !unlocked ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      {ping && (
        <span
          className="ns-anim pointer-events-none absolute inset-0 rounded-full border border-neon-cyan"
          style={{ animation: "ns-vol-ring 360ms ease-out forwards" }}
        />
      )}
    </button>
  );
}
