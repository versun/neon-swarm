import HeroSection from "@/components/home/HeroSection";
import ControlsSection from "@/components/home/ControlsSection";
import FighterBlueprint from "@/components/home/FighterBlueprint";
import DynamicWorld from "@/components/home/DynamicWorld";

/**
 * `/` — 科幻极简单页：呼号加入 + 规则三条 + 操作方式 + 战机蓝图 + 动态世界。
 * 无导航栏（仅 logo）、无页脚；昵称 + 「加入战斗」→ /game?name=…
 */
export default function Home() {
  return (
    <>
      <HeroSection />
      <ControlsSection />
      <FighterBlueprint />
      <DynamicWorld />
      <footer className="footer border-t border-white/10 bg-void-950">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-center gap-2 px-5 py-6 lg:px-10">
          <p className="font-mono text-xs tracking-[0.2em] text-slate-500">
            Made with ❤️{" "}
            <a
              href="https://versun.me"
              target="_blank"
              rel="noreferrer"
              className="text-neon-cyan-light transition-colors hover:text-white hover:underline"
            >
              Versun
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/versun/neon-swarm"
              target="_blank"
              rel="noreferrer"
              className="text-neon-cyan-light transition-colors hover:text-white hover:underline"
            >
              Opensource at Github
            </a>{" "}
            · v20260922
          </p>
        </div>
      </footer>
    </>
  );
}
