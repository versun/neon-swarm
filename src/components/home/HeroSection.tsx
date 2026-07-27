import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";
import DemoCanvas from "@/components/home/DemoCanvas";
import { unlockAudio, playConfirm, playUiTick, startAmbient, stopAmbient } from "@/lib/audio-unlock";
import { useI18n } from "@/i18n";
import LangSwitch from "@/i18n/LangSwitch";
import { MAX_NAME_LEN } from "@contracts/game";

export const NAME_STORAGE_KEY = "neon-swarm:name";

/** 星点（确定性伪随机 56 颗，少量闪烁，丰富但不吵） */
const STARS = Array.from({ length: 56 }, (_, i) => {
  const h = (n: number) => {
    const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  return {
    x: h(1) * 100,
    y: h(2) * 100,
    o: 0.16 + h(3) * 0.6,
    s: h(4) < 0.82 ? 1 : 2,
    tw: h(5) < 0.16, // 16% 闪烁
  };
});

/** 昵称 + 加入战斗（极简下划线表单） */
function JoinPanel() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_STORAGE_KEY)?.slice(0, MAX_NAME_LEN) ?? "",
  );

  const join = () => {
    playUiTick();
    const trimmed = name.trim().slice(0, MAX_NAME_LEN);
    if (trimmed) {
      localStorage.setItem(NAME_STORAGE_KEY, trimmed);
      navigate("/game?name=" + encodeURIComponent(trimmed));
    } else {
      localStorage.removeItem(NAME_STORAGE_KEY);
      navigate("/game");
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="mt-10 flex items-end gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        join();
      }}
    >
      <label className="min-w-0 flex-1">
        <span className="font-mono text-[10px] tracking-[0.3em] text-slate-500">
          {t("hero.callsign")}
        </span>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LEN}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("hero.namePlaceholder")}
          aria-label={t("aria.name")}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full border border-white/25 bg-white/[0.06] px-4 py-3.5 font-mono text-xl tracking-[0.06em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-sm transition-all placeholder:text-slate-500 hover:border-white/40 focus:border-neon-cyan focus:bg-neon-cyan/[0.07] focus:shadow-[0_0_24px_rgba(34,211,238,.35)] focus:outline-none"
        />
      </label>
      <button
        type="submit"
        className="group flex shrink-0 items-center gap-2 bg-neon-cyan px-8 py-4 font-mono text-base font-bold tracking-[0.2em] text-void-950 shadow-[0_0_28px_rgba(34,211,238,.45)] transition-all hover:bg-neon-cyan-light hover:shadow-[0_0_40px_rgba(34,211,238,.7)]"
      >
        {t("hero.join")}
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
          →
        </span>
      </button>
    </motion.form>
  );
}

export default function HeroSection() {
  const { t } = useI18n();
  const [audioOn, setAudioOn] = useState(false);

  const RULES = [
    { id: "01", title: t("rules.r1.title"), body: t("rules.r1.body") },
    { id: "02", title: t("rules.r2.title"), body: t("rules.r2.body") },
    { id: "03", title: t("rules.r3.title"), body: t("rules.r3.body") },
  ];

  const toggleAudio = async () => {
    if (audioOn) {
      stopAmbient();
      setAudioOn(false);
      return;
    }
    const ok = await unlockAudio();
    setAudioOn(ok);
    if (ok) {
      playConfirm();
      startAmbient();
    }
  };

  return (
    <section className="relative flex flex-col overflow-hidden bg-void-950">
      {/* 深空：星云辉光 + 星点 + 远方行星弧 */}
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className="absolute -left-40 top-1/4 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,.26), transparent 65%)" }}
        />
        <div
          className="absolute -right-32 top-8 h-[520px] w-[520px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,.3), transparent 65%)" }}
        />
        <div
          className="absolute -bottom-40 left-1/3 h-[420px] w-[560px] rounded-full opacity-15 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(233,53,193,.24), transparent 65%)" }}
        />
        <div
          className="absolute -bottom-[420px] -right-[180px] h-[640px] w-[640px] rounded-full border border-neon-cyan/15"
          style={{ boxShadow: "inset 0 0 120px rgba(34,211,238,.08)" }}
        />
        {STARS.map((s, i) => (
          <span
            key={i}
            className={`absolute rounded-full bg-white ${s.tw ? "animate-pulse" : ""}`}
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.s,
              height: s.s,
              opacity: s.o,
            }}
          />
        ))}
        {/* 微弱青色地平线辉光 */}
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(34,211,238,.35), transparent)",
          }}
        />
      </div>

      {/* 背景：随机模拟对战（装饰层） */}
      <DemoCanvas />

      {/* 顶栏：logo + 极简链接 */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-6 lg:px-12 lg:pt-8">
        <a href="/" className="flex items-center gap-2.5" aria-label={t("aria.home")}>
          <img src="/logo.svg" alt="" className="h-6 w-6 opacity-90" />
          <span className="font-mono text-xs font-bold tracking-[0.3em] text-white">
            NEON<span className="text-neon-cyan-light">SWARM</span>
          </span>
        </a>
        <nav className="flex items-center gap-6">
          <LangSwitch />
          <button
            type="button"
            onClick={toggleAudio}
            aria-pressed={audioOn}
            aria-label={audioOn ? t("hero.audioOn") : t("hero.audioOff")}
            className={
              audioOn
                ? "text-neon-cyan-light"
                : "text-slate-500 transition-colors hover:text-white"
            }
          >
            {audioOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </nav>
      </header>

      {/* 主视觉 */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col justify-center px-5 pb-14 pt-14 lg:px-10">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="font-mono text-[11px] tracking-[0.4em] text-neon-cyan-light/80"
        >
          {t("hero.kicker")}
        </motion.p>

        <h1 className="mt-8 font-display text-[44px] font-bold leading-[1.08] tracking-[-0.01em] text-white md:text-[72px]">
          <motion.span
            className="block"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {t("hero.title1")}
          </motion.span>
          <motion.span
            className="block"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
          >
            {t("hero.title2")}
            <span
              className="ml-2 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] animate-pulse bg-neon-cyan"
              aria-hidden="true"
            />
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.42 }}
          className="mt-6 text-base text-slate-400"
        >
          {t("hero.sub")}
        </motion.p>

        <JoinPanel />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.62 }}
          className="mt-4 font-mono text-[11px] tracking-[0.18em] text-slate-600"
        >
          {t("hero.hint", { stats: t("hero.stats") })}
        </motion.p>

        {/* 规则三条：紧随主模块，不另起区块 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.72 }}
          className="mt-14 grid gap-x-10 gap-y-6 border-t border-white/10 pt-8 md:grid-cols-3"
        >
          {RULES.map((r) => (
            <div key={r.id}>
              <span className="font-mono text-xs tracking-[0.3em] text-slate-600">
                {r.id}
              </span>
              <h3 className="mt-2 text-base font-semibold text-white">{r.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{r.body}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
