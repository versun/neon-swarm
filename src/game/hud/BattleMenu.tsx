/**
 * BattleMenu — game.md §11
 * Esc 打开居中 Dialog（宽 520px，Tabs：控制/显示/声音/网络），游戏不暂停（LIVE 红灯）。
 * 点击遮罩不关闭；必须 Esc 或关闭按钮。所有设置立即生效 + localStorage。
 */
import { useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";
import { SNAPSHOT_RATE, TICK_RATE } from "@contracts/game";
import type { GameEngine } from "../engine";
import { useHud } from "../store";
import { cn } from "@/lib/utils";
import { useI18n, type I18nKey } from "@/i18n";
import LangSwitch from "@/i18n/LangSwitch";

const TABS = [
  { id: "controls", key: "menu.tab.controls" },
  { id: "display", key: "menu.tab.display" },
  { id: "sound", key: "menu.tab.sound" },
  { id: "network", key: "menu.tab.network" },
] as const satisfies readonly { id: string; key: I18nKey }[];
type Tab = (typeof TABS)[number]["id"];

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-2 text-sm text-slate-300 transition-colors hover:text-white"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-5 w-9 border transition-colors duration-150",
          checked ? "border-neon-cyan bg-neon-cyan/25" : "border-slate-600 bg-void-800",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 transition-all duration-150",
            checked ? "left-[18px] bg-neon-cyan" : "left-0.5 bg-slate-500",
          )}
        />
      </span>
    </button>
  );
}

export default function BattleMenu({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const open = useHud(engine.store, (s) => s.menuOpen);
  const muted = useHud(engine.store, (s) => s.muted);
  const volume = useHud(engine.store, (s) => s.volume);
  const lowParticles = useHud(engine.store, (s) => s.lowParticles);
  const highContrast = useHud(engine.store, (s) => s.highContrast);
  const screenShake = useHud(engine.store, (s) => s.screenShake);
  const rtt = useHud(engine.store, (s) => s.rtt);
  const tick = useHud(engine.store, (s) => s.tick);
  const entities = useHud(engine.store, (s) => s.entityCount);
  const [tab, setTab] = useState<Tab>("controls");

  if (!open) return null;

  const close = () => engine.setMenuOpen(false);

  const persist = (key: string, v: boolean) =>
    localStorage.setItem(key, v ? "1" : "0");

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,18,0.55)", animation: "ns-menu-in 120ms ease-out" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("aria.battleMenu")}
      // 点击遮罩不关闭，避免战斗误触
    >
      <div
        className="ns-anim glass-panel clip-corner w-full max-w-[520px] p-6"
        style={{ animation: "ns-menu-in 180ms ease-out" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-sm font-bold tracking-[0.24em] text-white">
              COMBAT MENU
            </h2>
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] text-neon-red">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon-red" />
              GAME STILL LIVE
            </span>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("aria.closeMenu")}
            className="flex h-11 w-11 items-center justify-center text-slate-400 transition-colors hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-1 border-b border-neon-cyan/15" role="tablist">
          {TABS.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              aria-selected={tab === tb.id}
              onClick={() => {
                setTab(tb.id);
                engine.audio.uiTick();
              }}
              className={cn(
                "px-3 py-2 font-label text-sm font-semibold tracking-[0.14em] transition-colors",
                tab === tb.id
                  ? "border-b-2 border-neon-cyan text-neon-cyan-light"
                  : "text-slate-500 hover:text-slate-300",
              )}
            >
              {t(tb.key)}
            </button>
          ))}
        </div>

        <div className="min-h-[180px]">
          {tab === "controls" && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[12px] text-slate-300">
              <span className="text-slate-500">{t("menu.arrows")}</span>
              <span>{t("menu.move")}</span>
              <span className="text-slate-500">{t("menu.mouse")}</span>
              <span>{t("menu.aim")}</span>
              <span className="text-slate-500">{t("menu.lmbSpace")}</span>
              <span>{t("menu.fire")}</span>
              <span className="text-slate-500">TAB</span>
              <span>{t("menu.score")}</span>
              <span className="text-slate-500">M</span>
              <span>{t("menu.mute")}</span>
              <span className="text-slate-500">ESC</span>
              <span>{t("menu.menu")}</span>
            </div>
          )}
          {tab === "display" && (
            <div>
              <div className="flex w-full items-center justify-between py-2 text-sm text-slate-300">
                <span>{t("menu.language")}</span>
                <LangSwitch />
              </div>
              <Toggle
                label={t("menu.lowParticles")}
                checked={lowParticles}
                onChange={(v) => {
                  engine.setLowParticles(v);
                  persist("ns_low_particles", v);
                }}
              />
              <Toggle
                label={t("menu.shake")}
                checked={screenShake}
                onChange={(v) => {
                  engine.setScreenShake(v);
                  persist("ns_shake", v);
                }}
              />
              <Toggle
                label={t("menu.highContrast")}
                checked={highContrast}
                onChange={(v) => {
                  engine.setHighContrast(v);
                  persist("ns_high_contrast", v);
                }}
              />
            </div>
          )}
          {tab === "sound" && (
            <div>
              <Toggle
                label={t("menu.muteM")}
                checked={muted}
                onChange={() => engine.toggleMute()}
              />
              <label className="mt-2 block text-sm text-slate-300">
                <span className="mb-1.5 flex items-center justify-between">
                  {t("menu.volume")}
                  <span className="font-mono text-[11px] text-neon-cyan-light">
                    {Math.round(volume * 100)}%
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(volume * 100)}
                  onChange={(e) => engine.setVolume(Number(e.target.value) / 100)}
                  className="h-1.5 w-full accent-neon-cyan"
                  aria-label={t("menu.volume")}
                />
              </label>
            </div>
          )}
          {tab === "network" && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px]">
              <span className="text-slate-500">RTT</span>
              <span className="text-neon-cyan-light">{rtt} ms</span>
              <span className="text-slate-500">{t("menu.serverTick")}</span>
              <span className="text-slate-300">{tick}（{TICK_RATE}Hz）</span>
              <span className="text-slate-500">{t("menu.snapshot")}</span>
              <span className="text-slate-300">{SNAPSHOT_RATE}Hz</span>
              <span className="text-slate-500">{t("menu.entities")}</span>
              <span className="text-slate-300">{entities}</span>
              <span className="col-span-2 mt-1 text-[10px] text-slate-600">
                {t("menu.netNote")}
              </span>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={close}
            className="btn-neon-primary clip-corner flex-1 px-4 py-2.5 font-label text-sm font-bold tracking-[0.12em]"
          >
            {t("menu.resume")}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="btn-neon-secondary clip-corner px-4 py-2.5 font-label text-sm font-bold tracking-[0.12em]"
          >
            {t("game.home")}
          </button>
        </div>
      </div>
    </div>
  );
}
