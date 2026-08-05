/**
 * /game — 实时战斗画布（game.md 完整实现）
 *
 * 全屏 Canvas 战场 + HUD 叠加层。游戏逻辑在 src/game/：
 * net（WebSocket）/ interp（插值+预测）/ renderer（Canvas 2D）/
 * audio（Web Audio 合成）/ input（键鼠+触控）/ engine（编排）/ hud/*（React HUD）。
 *
 * 昵称来源：?name= query（首页填写后直接加入，不再弹面板）> 无则显示「加入战场」
 * 面板，输入昵称点击「加入战斗」后才连接（localStorage 记忆昵称）。
 */
import { useEffect, useRef, useState } from "react";
import { GameEngine } from "@/game/engine";
import { useHud } from "@/game/store";
import { HudStyles } from "@/game/hud/styles";
import HealthBar from "@/game/hud/HealthBar";
import AmmoBar from "@/game/hud/AmmoBar";
import RespawnOverlay from "@/game/hud/RespawnOverlay";
import KillFeed from "@/game/hud/KillFeed";
import MiniRadar from "@/game/hud/MiniRadar";
import LatencyChip from "@/game/hud/LatencyChip";
import OnlineChip from "@/game/hud/OnlineChip";
import Scoreboard from "@/game/hud/Scoreboard";
import BattleMenu from "@/game/hud/BattleMenu";
import TouchControls from "@/game/hud/TouchControls";
import StatusAnnouncer from "@/game/hud/StatusAnnouncer";
import {
  AudioButton,
  AudioHint,
  CombatNotices,
  ConnectingOverlay,
  JoinOverlay,
  ReconnectOverlay,
  WorldToast,
} from "@/game/hud/Overlays";
import { useI18n } from "@/i18n";
import { MAX_NAME_LEN, unpackUpg, upgradeThreshold, upgAmmoRegenRate, upgMaxHp } from "@contracts/game";
import UpgradeOverlay from "@/game/hud/UpgradeOverlay";

/** 主状态面板（左下）：玩家名 + 颜色样本 + HP + 弹药 + 战机等级 */
function MainHudPanel({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const hp = useHud(engine.store, (s) => s.hp);
  const ammo = useHud(engine.store, (s) => s.ammo);
  const ammoRegen = useHud(engine.store, (s) => s.ammoRegen);
  const selfHits = useHud(engine.store, (s) => s.selfHits);
  const selfUpg = useHud(engine.store, (s) => s.selfUpg);
  const selfName = useHud(engine.store, (s) => s.selfName);
  const selfColor = useHud(engine.store, (s) => s.selfColor);
  const selfId = useHud(engine.store, (s) => s.selfId);
  const highContrast = useHud(engine.store, (s) => s.highContrast);
  const reducedMotion = useHud(engine.store, (s) => s.reducedMotion);
  // rosterVersion 变化即重算（kill 事件驱动名册战绩更新）
  useHud(engine.store, (s) => s.rosterVersion);
  const kills = engine.net.roster.get(selfId)?.kills ?? 0;

  const upg = unpackUpg(selfUpg);
  const lv =
    upg.lvBullet + upg.lvMove + upg.lvHp + (upg.dual ? 1 : 0) + upg.lvAmmoRegen + upg.lvHpRegen + upg.lvLock;
  const parts: string[] = [];
  if (upg.lvBullet > 0) parts.push(t("hud.upg.bullet", { n: upg.lvBullet * 5 }));
  if (upg.lvMove > 0) parts.push(t("hud.upg.move", { n: upg.lvMove * 5 }));
  if (upg.lvHp > 0) parts.push(t("hud.upg.hp", { n: upg.lvHp * 5 }));
  if (upg.dual) parts.push(t("hud.upg.dual"));
  if (upg.lvAmmoRegen > 0) parts.push(t("hud.upg.ammoRegen", { n: upg.lvAmmoRegen }));
  if (upg.lvHpRegen > 0) parts.push(t("hud.upg.hpRegen", { n: upg.lvHpRegen }));
  if (upg.lvLock > 0) parts.push(t("hud.upg.lock", { n: upg.lvLock }));
  const nextAt = upgradeThreshold(lv);

  return (
    <div
      className="ns-anim glass-panel clip-corner pointer-events-auto w-[280px] p-4 max-sm:w-full max-sm:border-x-0"
      style={{ animation: "ns-panel-in 280ms ease-out" }}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{ background: selfColor, boxShadow: `0 0 8px ${selfColor}` }}
          aria-hidden="true"
        />
        <span className="truncate font-mono text-[12px] font-semibold tracking-[0.14em] text-white">
          {selfName || "PILOT-····"}
        </span>
      </div>
      <HealthBar hp={hp} maxHp={upgMaxHp(upg.lvHp)} highContrast={highContrast} reducedMotion={reducedMotion} />
      <div className="mt-2.5">
        <AmmoBar
          ammo={ammo}
          regen={ammoRegen}
          regenAmount={upgAmmoRegenRate(upg.lvAmmoRegen)}
          highContrast={highContrast}
          reducedMotion={reducedMotion}
        />
      </div>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-slate-500">
        REGEN +{upgAmmoRegenRate(upg.lvAmmoRegen)} / S
      </p>
      {/* 战机等级：LV · 已选强化 · 下一级进度 */}
      <p className="mt-1 font-mono text-[10px] tracking-[0.14em]">
        <span className={lv > 0 ? "text-neon-amber" : "text-slate-500"}>
          LV{lv} · {parts.length > 0 ? parts.join(" · ") : t("hud.upg.none")}
        </span>
        <span className="ml-2 text-slate-600">
          {t("hud.hitsNext", { a: selfHits, b: nextAt })}
        </span>
      </p>
      {/* 本场累计击杀（名册战绩，kill 事件即时刷新；死亡不清零） */}
      <p className="mt-1 font-mono text-[10px] tracking-[0.14em]">
        <span className="text-slate-500">{t("hud.kills")}</span>
        <span className="ml-1.5 tabular-nums text-neon-red">{kills}</span>
      </p>
    </div>
  );
}

/** 重生遮罩（读取剩余时间与击杀者） */
function RespawnGate({ engine }: { engine: GameEngine }) {
  const respawnLeft = useHud(engine.store, (s) => s.respawnLeft);
  const killerName = useHud(engine.store, (s) => s.killerName);
  return <RespawnOverlay respawnLeft={respawnLeft} killerName={killerName} />;
}

/** engine 就绪后的完整 HUD 层 */
function GameHud({ engine, isTouch }: { engine: GameEngine; isTouch: boolean }) {
  const { t } = useI18n();
  const phase = useHud(engine.store, (s) => s.phase);

  return (
    <>
      {/* 触控层（移动端虚拟摇杆 / 瞄准 / 射击） */}
      {isTouch && phase === "live" && <TouchControls engine={engine} />}

      {/* 顶部右侧：在线人数 + 延迟 + 计分 + 音量 */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <OnlineChip engine={engine} />
        <LatencyChip engine={engine} />
        <button
          type="button"
          onClick={() => engine.setScoreboardOpen(true)}
          className="glass-panel clip-corner-sm pointer-events-auto flex h-11 items-center px-3 font-label text-[11px] font-semibold tracking-[0.18em] text-slate-300 transition-colors hover:text-neon-cyan-light"
          aria-label={t("aria.scoreboard")}
        >
          SCORE
        </button>
        <AudioButton engine={engine} />
      </div>

      <KillFeed engine={engine} />
      <WorldToast engine={engine} />
      <CombatNotices engine={engine} />

      {/* 左下：雷达 + 主状态面板（移动端隐藏——血量弹药已随机身显示，屏幕空间留给触控） */}
      {!isTouch && (
        <div className="absolute bottom-6 left-6 z-20 flex items-end gap-3">
          <MiniRadar engine={engine} isMobile={false} />
          <MainHudPanel engine={engine} />
        </div>
      )}

      {/* 状态遮罩 */}
      {phase === "respawning" && <RespawnGate engine={engine} />}
      {phase === "join" && <JoinOverlay engine={engine} />}
      {phase === "connecting" && <ConnectingOverlay />}
      {(phase === "reconnecting" || phase === "failed") && (
        <ReconnectOverlay engine={engine} />
      )}

      <Scoreboard engine={engine} />
      <BattleMenu engine={engine} />
      <UpgradeOverlay engine={engine} />
      <AudioHint engine={engine} />
      <StatusAnnouncer engine={engine} />
    </>
  );
}

export default function Game() {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [canvasOk, setCanvasOk] = useState(true);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let eng: GameEngine | null = null;
    // 延迟到下一拍创建引擎并 setState，避免 effect 内同步级联渲染
    const timer = window.setTimeout(() => {
      try {
        eng = new GameEngine(canvas);
      } catch {
        setCanvasOk(false);
        return;
      }
      // 本地偏好（设置持久化）
      const lowP = localStorage.getItem("ns_low_particles") === "1";
      const hc = localStorage.getItem("ns_high_contrast") === "1";
      const shake = localStorage.getItem("ns_shake") !== "0";
      eng.setLowParticles(lowP);
      eng.setHighContrast(hc);
      eng.setScreenShake(shake);
      eng.store.set({ lowParticles: lowP, highContrast: hc, screenShake: shake });

      eng.start();
      // 首页已填昵称（?name= 带过来）→ 直接加入，不再弹昵称面板；
      // 无 ?name= 时保持「加入战场」面板，由玩家输入昵称后手动加入
      const urlName = new URLSearchParams(window.location.search)
        .get("name")
        ?.trim()
        .slice(0, MAX_NAME_LEN);
      if (urlName) {
        eng.join(urlName);
      }
      setEngine(eng);
      setIsTouch(window.matchMedia("(pointer: coarse)").matches);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      eng?.dispose();
    };
  }, []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-void-950">
      <HudStyles />
      {/* 战场画布：最底层，全视口 */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
        aria-label={t("aria.canvas")}
      />
      {!canvasOk && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-void-950">
          <p className="glass-panel clip-corner px-6 py-4 text-sm text-slate-300">
            {t("game.canvasFail")}
          </p>
        </div>
      )}
      {engine && <GameHud engine={engine} isTouch={isTouch} />}
    </div>
  );
}
