import { useEffect } from "react";
import { Outlet } from "react-router";
import Lenis from "lenis";

/**
 * Shared chrome for all non-game pages.
 * Routing contract: Layout renders <Outlet/> and App.tsx nests routes
 * inside `<Route element={<Layout/>}>` (react-dev.md pattern B).
 * The /game route lives OUTSIDE this group (full-viewport, no footer).
 */
export default function Layout() {
  // Lenis smooth scrolling for non-game pages (design.md §10).
  // Touch devices fall back to native scrolling (Lenis default).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09 });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <main className="flex-1">
        <Outlet />
      </main>

    </div>
  );
}
