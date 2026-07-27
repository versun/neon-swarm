import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { SectionHead, useCopy } from "./shared";

export default function FighterBlueprint() {
  const { t } = useI18n();
  const [tab, setTab] = useState(0);

  const TABS = [
    {
      id: "hull",
      label: t("bp.tab.hull"),
      part: { x: 600, y: 595 },
      text: t("bp.hull.text"),
      params: [t("bp.hull.p1"), t("bp.hull.p2"), t("bp.hull.p3")],
    },
    {
      id: "weapon",
      label: t("bp.tab.weapon"),
      part: { x: 512, y: 415 },
      text: t("bp.weapon.text"),
      params: [t("bp.weapon.p1"), t("bp.weapon.p2"), t("bp.weapon.p3")],
    },
    {
      id: "regen",
      label: t("bp.tab.regen"),
      part: { x: 600, y: 292 },
      text: t("bp.regen.text"),
      params: [t("bp.regen.p1"), t("bp.regen.p2"), t("bp.regen.p3")],
    },
    {
      id: "ident",
      label: t("bp.tab.ident"),
      part: { x: 600, y: 440 },
      text: t("bp.ident.text"),
      params: [t("bp.ident.p1"), t("bp.ident.p2"), t("bp.ident.p3")],
    },
  ];
  const [copiedParam, copyParam] = useCopy();
  const [lastCopied, setLastCopied] = useState<string | null>(null);
  const active = TABS[tab];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setTab((t) => (t + 1) % TABS.length);
    if (e.key === "ArrowLeft") setTab((t) => (t - 1 + TABS.length) % TABS.length);
  };

  return (
    <section id="blueprint" className="relative scroll-mt-24 border-t border-neon-cyan/10 py-24">
      <div className="mx-auto max-w-[1280px] px-5 lg:px-10">
        <SectionHead label={t("bp.label")} title={t("bp.title")} />
        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-12">
          {/* blueprint */}
          <motion.div
            initial={{ opacity: 0, x: -28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-5"
          >
            <div className="glass-panel clip-corner relative overflow-hidden p-3 lg:sticky lg:top-24">
              <img
                src="/fighter-anatomy.svg"
                alt={t("bp.alt")}
                className="h-auto w-full"
                loading="lazy"
              />
              {/* active part highlight: stroke brightness .35 → 1 (250ms) */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-[250ms]"
                style={{
                  left: `${(active.part.x / 1200) * 100}%`,
                  top: `${(active.part.y / 900) * 100}%`,
                }}
              >
                <span className="block h-14 w-14 rounded-full border-2 border-neon-magenta opacity-100 shadow-glow-magenta" />
                <span className="absolute inset-0 block h-14 w-14 animate-ping rounded-full border border-neon-magenta/60" />
              </div>
              <p className="px-2 pb-1 pt-2 text-center font-mono text-[10px] tracking-[0.24em] text-slate-500">
                {t("bp.activePart")} · {active.label}
              </p>
            </div>
          </motion.div>

          {/* tabs */}
          <motion.div
            initial={{ opacity: 0, x: 28 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4 }}
            className="lg:col-span-7"
          >
            <div
              role="tablist"
              aria-label={t("bp.aria")}
              onKeyDown={onKeyDown}
              className="flex flex-wrap gap-2"
            >
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === i}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(i)}
                  className={cn(
                    "clip-corner-sm border px-5 py-2 font-label text-sm font-bold tracking-[0.18em] transition-colors duration-150",
                    tab === i
                      ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan-light shadow-glow-cyan"
                      : "border-slate-500/40 text-slate-400 hover:border-neon-cyan/50 hover:text-neon-cyan-light",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                role="tabpanel"
                id={`panel-${active.id}`}
                aria-labelledby={`tab-${active.id}`}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.18 }}
                className="glass-panel clip-corner mt-6 p-6 sm:p-8"
              >
                <p className="text-base leading-[1.7] text-slate-200">{active.text}</p>
                <ul className="mt-6 space-y-2.5">
                  {active.params.map((p, i) => (
                    <motion.li
                      key={p}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, delay: 0.1 + i * 0.07 }}
                    >
                      <button
                        type="button"
                        title={t("bp.copy")}
                        onClick={() => {
                          copyParam(p);
                          setLastCopied(p);
                        }}
                        className="group flex w-full items-center justify-between border border-neon-cyan/15 bg-void-800/60 px-4 py-2.5 font-mono text-sm font-semibold tracking-[0.12em] text-neon-cyan-light transition-colors duration-150 hover:border-neon-cyan/50"
                      >
                        {p}
                        {copiedParam && lastCopied === p ? (
                          <Check className="h-4 w-4 text-neon-lime" />
                        ) : (
                          <Copy className="h-4 w-4 text-slate-500 transition-colors group-hover:text-neon-cyan-light" />
                        )}
                      </button>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
