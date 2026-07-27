/**
 * LangSwitch — 中 / EN 切换（首页顶栏与战斗菜单共用）。
 */
import { useI18n, type Lang } from "@/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { id: Lang; label: string }[] = [
  { id: "zh", label: "中" },
  { id: "en", label: "EN" },
];

export default function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      role="group"
      aria-label="Language / 语言"
      className={cn(
        "flex items-center border border-white/15 font-mono text-[11px] tracking-[0.12em]",
        className,
      )}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setLang(o.id)}
          aria-pressed={lang === o.id}
          className={cn(
            "px-2.5 py-1 transition-colors",
            lang === o.id
              ? "bg-neon-cyan/15 text-neon-cyan-light"
              : "text-slate-500 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
