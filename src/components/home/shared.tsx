import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Section heading block: micro label + title + optional lead paragraph. */
export function SectionHead({
  label,
  title,
  lead,
  center = false,
}: {
  label: string;
  title: ReactNode;
  lead?: string;
  center?: boolean;
}) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.18 }}
        className="font-label text-[11px] font-semibold tracking-[0.3em] text-neon-cyan-light"
      >
        {label}
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.36, delay: 0.08 }}
        className="mt-3 font-display text-3xl font-bold leading-[1.15] tracking-[-0.02em] text-white sm:text-4xl"
      >
        {title}
      </motion.h2>
      {lead && (
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.32, delay: 0.16 }}
          className="mt-4 text-base leading-[1.7] text-slate-300"
        >
          {lead}
        </motion.p>
      )}
    </div>
  );
}

/** 600ms count-up that runs once when `active` becomes true. */
export function useCountUp(target: number, active: boolean, durationMs = 600): number {
  const [value, setValue] = useState(0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (!active || doneRef.current) return;
    doneRef.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, durationMs]);
  return value;
}

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Clipboard helper with transient "copied" state (reverts after 1.5s). */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>(0);
  const copy = (text: string) => {
    const done = () => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done();
    }
  };
  return [copied, copy];
}

/** Small neon corner panel used across the guide page. */
export function NeonPanel({
  children,
  className,
  tone = "cyan",
}: {
  children: ReactNode;
  className?: string;
  tone?: "cyan" | "lime" | "magenta";
}) {
  const dot =
    tone === "lime" ? "bg-neon-lime" : tone === "magenta" ? "bg-neon-magenta" : "bg-neon-cyan";
  return (
    <div className={cn("glass-panel clip-corner relative p-6", className)}>
      <span
        className={cn("absolute left-3 top-3 h-2 w-2 rounded-full", dot)}
        aria-hidden="true"
        style={{ boxShadow: "0 0 8px currentColor" }}
      />
      {children}
    </div>
  );
}
