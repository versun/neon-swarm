/**
 * TouchControls — game.md §13 移动端战斗布局
 * 左 40% 虚拟摇杆（基础直径 112px，触摸点出现）；右侧拖动瞄准；右下 72px 射击键。
 * 全部触控目标 ≥44px；状态写入 engine.input（与键鼠输入合并）。
 */
import { useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import type { GameEngine } from "../engine";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

const JOY_RADIUS = 48;

export default function TouchControls({ engine }: { engine: GameEngine }) {
  const { t } = useI18n();
  const [joy, setJoy] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [firing, setFiring] = useState(false);
  const joyPid = useRef<number | null>(null);
  const aimPid = useRef<number | null>(null);
  const joyOrigin = useRef({ x: 0, y: 0 });

  const selfScreen = () => {
    const pose = engine.getSelfPose();
    const cam = engine.renderer.getCamera();
    return {
      x: pose.x - cam.x + window.innerWidth / 2,
      y: pose.y - cam.y + window.innerHeight / 2,
    };
  };

  const onJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPid.current !== null) return;
    joyPid.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyOrigin.current = { x: e.clientX, y: e.clientY };
    engine.setJoystick(0, 0, true);
    setJoy({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };

  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPid.current) return;
    let dx = e.clientX - joyOrigin.current.x;
    let dy = e.clientY - joyOrigin.current.y;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    engine.setJoystick(dx / JOY_RADIUS, dy / JOY_RADIUS, true);
    setJoy({ x: joyOrigin.current.x, y: joyOrigin.current.y, dx, dy });
  };

  const onJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== joyPid.current) return;
    joyPid.current = null;
    engine.setJoystick(0, 0, false);
    setJoy(null);
  };

  const aimFrom = (clientX: number, clientY: number) => {
    const s = selfScreen();
    engine.setTouchAim(Math.atan2(clientY - s.y, clientX - s.x));
  };

  const onAimDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (aimPid.current !== null) return;
    aimPid.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    aimFrom(e.clientX, e.clientY);
  };
  const onAimMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== aimPid.current) return;
    aimFrom(e.clientX, e.clientY);
  };
  const onAimUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== aimPid.current) return;
    aimPid.current = null;
  };

  return (
    <div className="absolute inset-0 z-20" aria-hidden="true">
      {/* 左 40% 摇杆区 */}
      <div
        className="absolute bottom-0 left-0 top-0 w-[40%] touch-none"
        onPointerDown={onJoyDown}
        onPointerMove={onJoyMove}
        onPointerUp={onJoyUp}
        onPointerCancel={onJoyUp}
      />
      {/* 右侧瞄准区 */}
      <div
        className="absolute bottom-0 right-0 top-0 w-[60%] touch-none"
        onPointerDown={onAimDown}
        onPointerMove={onAimMove}
        onPointerUp={onAimUp}
        onPointerCancel={onAimUp}
      />
      {/* 摇杆视觉 */}
      {joy && (
        <div
          className="ns-anim pointer-events-none absolute"
          style={{
            left: joy.x - 56,
            top: joy.y - 56,
            width: 112,
            height: 112,
            animation: "ns-deploy-in 120ms ease-out",
          }}
        >
          <div className="absolute inset-0 rounded-full border border-neon-cyan/40 bg-neon-cyan/5" />
          <div
            className="absolute rounded-full bg-neon-cyan/60"
            style={{
              width: 40,
              height: 40,
              left: 36 + joy.dx,
              top: 36 + joy.dy,
              boxShadow: "0 0 12px rgba(34,211,238,.6)",
            }}
          />
        </div>
      )}
      {/* 射击键 72px */}
      <button
        type="button"
        aria-label={t("menu.fire")}
        className={cn(
          "pointer-events-auto absolute bottom-24 right-6 flex h-[72px] w-[72px] touch-none items-center justify-center rounded-full",
          "border-2 border-neon-magenta/70 bg-neon-magenta/15 text-neon-magenta transition-transform",
          firing && "scale-90 bg-neon-magenta/30",
        )}
        style={{ transitionDuration: "80ms" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          engine.setTouchFire(true);
          setFiring(true);
        }}
        onPointerUp={() => {
          engine.setTouchFire(false);
          setFiring(false);
        }}
        onPointerCancel={() => {
          engine.setTouchFire(false);
          setFiring(false);
        }}
      >
        <Crosshair className="h-8 w-8" />
      </button>
    </div>
  );
}
