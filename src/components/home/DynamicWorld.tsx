import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { SectionHead } from "./shared";

const STAGES = [
  { id: "initial", labelKey: "world.stage1", descKey: "world.s1", ring: 1 },
  { id: "edge", labelKey: "world.stage2", descKey: "world.s2", ring: 2 },
  { id: "expand", labelKey: "world.stage3", descKey: "world.s3", ring: 3 },
] as const;

/** Expansion wave: every 5s, scale 1→1.12 / opacity .65→0 over 900ms. */
function ExpansionWave() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon-magenta motion-safe:animate-[world-expand_5s_ease-out_infinite]"
    />
  );
}

export default function DynamicWorld() {
  const { t } = useI18n();
  const [stage, setStage] = useState<(typeof STAGES)[number]["id"]>("initial");
  const active = STAGES.find((s) => s.id === stage)!;

  return (
    <section id="world" className="relative scroll-mt-24 border-t border-neon-cyan/10 py-24">
      <style>{`@keyframes world-expand { 0% { transform: translate(-50%,-50%) scale(1); opacity: .65; } 18% { transform: translate(-50%,-50%) scale(1.12); opacity: 0; } 100% { transform: translate(-50%,-50%) scale(1.12); opacity: 0; } }`}</style>
      <div className="mx-auto max-w-[1280px] px-5 lg:px-10">
        <SectionHead
          center
          label={t("world.label")}
          title={<>{t("world.titleA")}<span className="text-neon-gradient">{t("world.titleB")}</span></>}
          lead={t("world.lead")}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.48 }}
          className="group relative mx-auto mt-12 max-w-4xl"
        >
          <div className="glass-panel clip-corner relative overflow-hidden p-3">
            <img
              src="/world-map.svg"
              alt={t("world.alt")}
              className="h-auto w-full"
              loading="lazy"
            />
            <ExpansionWave />
            {/* stage highlight rings over the map */}
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-[160ms]",
                stage === "initial" ? "h-[42%] w-[42%] border-neon-cyan shadow-glow-cyan" : "h-[42%] w-[42%] border-neon-cyan/20",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed transition-all duration-[160ms]",
                stage === "edge" ? "h-[56%] w-[56%] border-neon-amber" : "h-[56%] w-[56%] border-neon-amber/15",
              )}
            />
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-[160ms]",
                stage === "expand" ? "h-[72%] w-[72%] border-neon-magenta shadow-glow-magenta" : "h-[72%] w-[72%] border-neon-magenta/15",
              )}
            />
          </div>
        </motion.div>

        <div className="mx-auto mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
          {STAGES.map((s, i) => (
            <motion.button
              key={s.id}
              type="button"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.32, delay: i * 0.1 }}
              onClick={() => setStage(s.id)}
              aria-pressed={stage === s.id}
              className={cn(
                "glass-panel clip-corner-sm px-4 py-3 text-center font-mono text-[11px] font-bold tracking-[0.14em] transition-colors duration-[160ms]",
                stage === s.id
                  ? "border-neon-magenta/60 text-neon-magenta"
                  : "text-slate-400 hover:border-neon-cyan/50 hover:text-neon-cyan-light",
              )}
            >
              {t(s.labelKey)}
            </motion.button>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-400">
          {t(active.descKey)}
        </p>      </div>
    </section>
  );
}
