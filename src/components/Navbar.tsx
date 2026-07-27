import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Home, Menu, Volume2, VolumeX, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBattleStatus, pad2 } from "@/hooks/useBattleStatus";
import { unlockAudio, isAudioUnlocked, playConfirm, playUiTick } from "@/lib/audio-unlock";
import { useI18n, type I18nKey } from "@/i18n";

const NAV_LINKS = [
  { to: "/", labelKey: "nav.lobby", en: "LOBBY" },
  { to: "/game", labelKey: "nav.combat", en: "COMBAT" },
] as const satisfies readonly { to: string; labelKey: I18nKey; en: string }[];

function useAudioState() {
  const [on, setOn] = useState(isAudioUnlocked());
  const enable = async () => {
    const ok = await unlockAudio();
    setOn(ok);
    if (ok) playConfirm();
  };
  return { on, enable };
}

function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Link to="/" className="flex items-center gap-3" aria-label={t("aria.home")}>
      <motion.img
        src="/logo.svg"
        alt="NEON SWARM logo"
        className={cn("h-9 w-9", compact && "h-8 w-8")}
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.span
        className="flex flex-col leading-none"
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
      >
        <span className="font-display text-sm font-bold tracking-[0.18em] text-white">
          NEON SWARM
        </span>
        <span className="mt-1 font-sans text-[10px] tracking-[0.4em] text-neon-cyan-light/80">
          {t("nav.brand")}
        </span>
      </motion.span>
    </Link>
  );
}

function AudioChip() {
  const { t } = useI18n();
  const { on, enable } = useAudioState();
  return (
    <button
      type="button"
      onClick={enable}
      className={cn(
        "hidden items-center gap-1.5 border px-2.5 py-1 font-label text-[11px] font-semibold tracking-[0.12em] transition-colors sm:flex",
        on
          ? "border-neon-lime/50 text-neon-lime"
          : "border-slate-500/50 text-slate-500 hover:border-neon-cyan/50 hover:text-neon-cyan-light",
      )}
      aria-pressed={on}
      title={on ? t("hero.audioOn") : t("hero.audioOff")}
    >
      {on ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
      {on ? "AUDIO ON" : "AUDIO OFF"}
    </button>
  );
}

/** Collapsed "stealth combat nav" used on /game (design.md §7.1). */
function StealthCombatNav() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="group fixed left-4 top-4 z-50">
      <button
        type="button"
        aria-label={t("aria.openCombatNav")}
        className="glass-panel clip-corner-sm flex h-11 w-11 items-center justify-center text-neon-cyan-light transition-shadow hover:shadow-glow-cyan"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div
        className={cn(
          "glass-panel clip-corner pointer-events-none absolute left-0 top-0 w-56 p-4 opacity-0",
          "transition-all duration-200 ease-out",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <img src="/logo.svg" alt="" className="h-7 w-7" />
          <span className="font-display text-xs font-bold tracking-[0.18em] text-white">
            NEON SWARM
          </span>
        </div>
        <nav className="flex flex-col gap-1" aria-label={t("aria.combatNav")}>
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-between px-2 py-1.5 font-label text-sm font-semibold tracking-[0.12em] transition-colors",
                  isActive
                    ? "bg-neon-cyan/10 text-neon-cyan-light"
                    : "text-slate-300 hover:text-neon-cyan-light",
                )
              }
            >
              <span>{t(l.labelKey)}</span>
              <span className="font-mono text-[10px] text-slate-500">{l.en}</span>
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="btn-neon-secondary clip-corner-sm mt-3 flex w-full items-center justify-center gap-1.5 py-2 font-label text-sm font-bold tracking-[0.12em]"
        >
          <Home className="h-4 w-4" />
          {t("game.home")}
        </button>
        <button
          type="button"
          onClick={() => navigate("/game")}
          className="btn-neon-primary clip-corner-sm mt-2 flex w-full items-center justify-center gap-1.5 py-2 font-label text-sm font-bold tracking-[0.12em]"
        >
          <Zap className="h-4 w-4" />
          {t("nav.enter")}
        </button>
      </div>
    </div>
  );
}

export default function Navbar() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const status = useBattleStatus();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (location.pathname.startsWith("/game")) {
    return <StealthCombatNav />;
  }
  // 首页无导航栏（仅 Hero 左上角 logo）
  if (location.pathname === "/") {
    return null;
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-[72px] transition-[background-color,backdrop-filter] duration-150",
        scrolled
          ? "bg-[rgba(3,7,18,.82)] backdrop-blur-[18px]"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-5 lg:px-10">
        <Brand />

        <nav className="hidden items-center gap-8 md:flex" aria-label={t("aria.combatNav")}>
          {NAV_LINKS.map((l, i) => (
            <motion.div
              key={l.to}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 + i * 0.06 }}
            >
              <NavLink
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "nav-link relative font-label text-sm font-semibold tracking-[0.14em] transition-colors duration-150",
                    isActive ? "text-neon-cyan-light" : "text-slate-300 hover:text-neon-cyan-light",
                  )
                }
              >
                {({ isActive }) => (
                  <span className="relative inline-block pb-1">
                    {t(l.labelKey)}
                    {isActive && (
                      <span
                        className="absolute -bottom-3 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-neon-magenta"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div
            className="glass-panel clip-corner-sm hidden items-center gap-2 px-3 py-1.5 lg:flex"
            title={t("aria.online", { p: status.pilots, b: status.bots })}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status.online ? "bg-neon-lime shadow-[0_0_6px_#A3E635]" : "bg-neon-red",
              )}
            />
            <span className="font-mono text-[11px] font-medium tracking-[0.1em] text-slate-300">
              {status.online
                ? `LIVE · ${pad2(status.pilots)} PILOTS + ${pad2(status.bots)} BOTS`
                : "LINK OFFLINE"}
            </span>
          </div>

          <AudioChip />

          <button
            type="button"
            onClick={() => {
              playUiTick();
              navigate("/game");
            }}
            className="btn-neon-primary clip-corner px-4 py-2 font-label text-sm font-bold tracking-[0.12em] sm:px-5"
          >
            {t("nav.enter")}
          </button>
        </div>
      </div>
      {/* bottom hairline */}
      <div
        className={cn(
          "h-px w-full bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent transition-opacity duration-150",
          scrolled ? "opacity-100" : "opacity-0",
        )}
      />
    </header>
  );
}
