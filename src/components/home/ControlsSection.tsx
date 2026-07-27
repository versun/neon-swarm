import { useState } from "react";
import { motion } from "framer-motion";
import { Keyboard, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { SectionHead } from "./shared";

function KeyCap({ label }: { label: string }) {
  return (
    <kbd
      className={cn(
        "inline-block min-w-[2rem] border border-slate-500/60 bg-void-800 px-2 py-1 text-center",
        "font-mono text-xs font-semibold text-slate-200 shadow-[0_2px_0_rgba(100,116,139,.35)]",
        "transition-all duration-150 group-hover/row:translate-y-0.5 group-hover/row:border-neon-cyan",
        "group-hover/row:shadow-[0_0_12px_rgba(34,211,238,.4)]",
      )}
    >
      {label}
    </kbd>
  );
}

/** One-shot 900ms joystick drag-path animation on first viewport entry. */
function JoystickDemo() {
  return (
    <div className="relative mx-auto mt-6 h-28 w-28" aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-neon-cyan/30" />
      <div className="absolute inset-4 rounded-full border border-neon-cyan/15" />
      <motion.div
        initial={{ x: 0, y: 0 }}
        whileInView={{ x: [0, 22, -16, 10, 0], y: [0, -18, 12, -6, 0] }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
        className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neon-cyan bg-neon-cyan/25 shadow-glow-cyan"
      />
    </div>
  );
}

export default function ControlsSection() {
  const { t } = useI18n();
  const [activeRow, setActiveRow] = useState<string | null>(null);

  const DESKTOP_KEYS = [
    { keys: ["W", "A", "S", "D"], alt: t("controls.k.arrows"), action: t("controls.a.move") },
    { keys: [t("controls.k.mouse")], alt: "", action: t("controls.a.aimNose") },
    { keys: [t("controls.k.lmb"), t("controls.k.space")], alt: "", action: t("controls.a.fire") },
    { keys: ["TAB"], alt: "", action: t("controls.a.score") },
    { keys: ["M"], alt: "", action: t("controls.a.mute") },
    { keys: ["ESC"], alt: "", action: t("controls.a.menu") },
  ];

  const MOBILE_KEYS = [
    { keys: [t("controls.k.stick")], action: t("controls.m.move") },
    { keys: [t("controls.k.drag")], action: t("controls.m.aim") },
    { keys: [t("controls.k.firebtn")], action: t("controls.m.fire") },
    { keys: [t("controls.k.nozoom")], action: t("controls.m.stable") },
  ];

  return (
    <section id="controls" className="relative scroll-mt-24 border-t border-neon-cyan/10 py-24">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-10">
        <SectionHead
          label={t("controls.label")}
          title={<>{t("controls.titleA")}<span className="text-neon-gradient">{t("controls.titleB")}</span></>}
        />
        <div className="relative mt-12 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-0">
          {/* desktop */}
          <motion.div
            initial={{ opacity: 0, x: -32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.36 }}
            className="lg:pr-12"
          >
            <div className="flex items-center gap-2 font-label text-sm font-bold tracking-[0.22em] text-neon-cyan-light">
              <Keyboard className="h-4 w-4" />
              {t("controls.desktop")}
            </div>
            <ul className="mt-6 space-y-3">
              {DESKTOP_KEYS.map((row, i) => (
                <motion.li
                  key={row.action}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.28, delay: i * 0.06 }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveRow(activeRow === row.action ? null : row.action)}
                    className={cn(
                      "group/row glass-panel clip-corner-sm flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                      "transition-colors duration-150",
                      activeRow === row.action && "border-neon-cyan/60 shadow-glow-cyan",
                    )}
                  >
                    <span className="flex flex-wrap items-center gap-1.5">
                      {row.keys.map((k) => (
                        <KeyCap key={k} label={k} />
                      ))}
                      {row.alt && <span className="font-mono text-xs text-slate-500">{row.alt}</span>}
                    </span>
                    <span
                      className={cn(
                        "text-sm transition-colors duration-150",
                        activeRow === row.action ? "text-neon-cyan-light" : "text-slate-300",
                      )}
                    >
                      {row.action}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* divider */}
          <div
            className="absolute left-1/2 top-0 hidden h-full w-px bg-gradient-to-b from-transparent via-neon-cyan/40 to-transparent lg:block"
            aria-hidden="true"
          />

          {/* mobile */}
          <motion.div
            initial={{ opacity: 0, x: 32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.36 }}
            className="lg:pl-12"
          >
            <div className="flex items-center gap-2 font-label text-sm font-bold tracking-[0.22em] text-neon-magenta">
              <Smartphone className="h-4 w-4" />
              {t("controls.mobile")}
            </div>
            <ul className="mt-6 space-y-3">
              {MOBILE_KEYS.map((row, i) => (
                <motion.li
                  key={row.action}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: 0.28, delay: i * 0.06 }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveRow(activeRow === row.action ? null : row.action)}
                    className={cn(
                      "group/row glass-panel clip-corner-sm flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
                      "transition-colors duration-150",
                      activeRow === row.action && "border-neon-magenta/60 shadow-glow-magenta",
                    )}
                  >
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      {row.keys[0]}
                    </span>
                    <span
                      className={cn(
                        "text-sm transition-colors duration-150",
                        activeRow === row.action ? "text-neon-magenta" : "text-slate-300",
                      )}
                    >
                      {row.action}
                    </span>
                  </button>
                </motion.li>
              ))}
            </ul>
            <JoystickDemo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
